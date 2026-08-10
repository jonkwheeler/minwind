import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import type { DiscoveredBuild } from './discover.js'
import type { ClassCategory, ClassModel } from './exclusions.js'
import {
  BROTLI_QUALITY,
  DEFAULT_THRESHOLD_PERCENT,
  GZIP_LEVEL,
  deltaPercent,
  type FileSizes,
  type Measurement,
} from './measure.js'
import type { ArmSummary } from './span-edit.js'
import { relativeToBuild } from './util.js'

export interface ToolMeta {
  name: string
  version: string
  enginesNode: string
}

export function readToolMeta(): ToolMeta {
  const manifestUrl = new URL('../../package.json', import.meta.url)
  const manifest = JSON.parse(fs.readFileSync(manifestUrl, 'utf8')) as {
    name?: string
    version?: string
    engines?: { node?: string }
  }
  return {
    name: manifest.name ?? 'minwind',
    version: manifest.version ?? '0.0.0',
    enginesNode: manifest.engines?.node ?? '',
  }
}

function parseVersion(text: string): [number, number, number] {
  const parts = text.split('.').map(function (part) {
    const parsed = Number(part)
    return Number.isFinite(parsed) ? parsed : 0
  })
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0]
}

function compareVersions(a: string, b: string): number {
  const left = parseVersion(a)
  const right = parseVersion(b)
  for (let i = 0; i < 3; i += 1) {
    if (left[i] !== right[i]) return left[i] - right[i]
  }
  return 0
}

// The tools package pins an exact Node version; a simple `>=` floor is also
// understood so the check keeps working if the pin is ever relaxed. Any
// other range shape is treated as unsatisfiable so the warning stays safe.
function satisfiesNodeRange(version: string, range: string): boolean {
  const trimmed = range.trim()
  if (/^\d+(?:\.\d+){0,2}$/.test(trimmed)) {
    return compareVersions(version, trimmed) === 0
  }
  const floor = /^>=\s*(\d+(?:\.\d+){0,2})$/.exec(trimmed)
  if (floor !== null) return compareVersions(version, floor[1]) >= 0
  return false
}

// Startup runtime check: compression output can vary across runtimes, so a
// runtime that misses the pinned engines.node earns a non-fatal warning.
export function runtimeVersionWarning(
  enginesNode: string,
  version: string,
): string | null {
  const current = version.replace(/^v/, '')
  if (satisfiesNodeRange(current, enginesNode)) return null
  return (
    `node ${version} does not satisfy minwind's pinned engines.node ` +
    `"${enginesNode}"; compression sizes may differ from the pinned runtime`
  )
}

export class ReportPathError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReportPathError'
  }
}

// Lexical path checks miss symlinks, so containment is decided on canonical
// paths. A not-yet-existing file cannot be realpath'd directly, so the
// nearest existing ancestor is canonicalized and the remaining segments are
// re-appended lexically.
function canonicalizePath(target: string): string {
  let current = path.resolve(target)
  const missing: Array<string> = []
  while (true) {
    try {
      let canonical = fs.realpathSync(current)
      for (let i = missing.length - 1; i >= 0; i -= 1) {
        canonical = path.join(canonical, missing[i])
      }
      return canonical
    } catch {
      const parent = path.dirname(current)
      if (parent === current) return current
      missing.push(path.basename(current))
      current = parent
    }
  }
}

function isSymlink(target: string): boolean {
  try {
    return fs.lstatSync(target).isSymbolicLink()
  } catch {
    return false
  }
}

// Report-only against the build directory (R6): the report file must live
// outside the analyzed directory so a run can never write into it, even via
// a symlinked build directory or a symlinked destination parent.
export function assertReportPathOutside(
  buildDir: string,
  reportPath: string,
): void {
  const resolved = path.resolve(reportPath)
  // Writing through a symlink mutates whatever it points at, so an existing
  // symlink destination is rejected regardless of where its target lives.
  if (isSymlink(resolved)) {
    throw new ReportPathError(
      `report path must not be a symlink: ${reportPath}`,
    )
  }
  const relative = path.relative(
    canonicalizePath(buildDir),
    canonicalizePath(resolved),
  )
  const inside =
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  if (inside) {
    throw new ReportPathError(
      `report path must be outside the analyzed directory: ${reportPath}`,
    )
  }
}

export interface ReportContext {
  build: DiscoveredBuild
  model: ClassModel
  armSummaries: Array<ArmSummary>
}

function relativeTo(build: DiscoveredBuild, file: string): string {
  return relativeToBuild(build.buildDir, file)
}

const CATEGORY_ORDER: Array<ClassCategory> = [
  'utility',
  'custom',
  'marker',
  'css-only',
  'js-referenced',
  'unmodelable',
]

function formatSignedBytes(delta: number): string {
  return delta > 0 ? `+${delta}` : `${delta}`
}

// Deterministic thousands grouping (never locale-sensitive).
function formatGrouped(n: number): string {
  const negative = n < 0
  const digits = String(Math.abs(n))
  let out = ''
  for (let i = 0; i < digits.length; i += 1) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ','
    out += digits[i]
  }
  return negative ? `-${out}` : out
}

function formatSignedGrouped(n: number): string {
  return n > 0 ? `+${formatGrouped(n)}` : formatGrouped(n)
}

function formatPercent(n: number): string {
  const rounded = Math.round(n * 10) / 10
  if (rounded === 0) return '0.0%'
  return rounded > 0 ? `+${rounded.toFixed(1)}%` : `${rounded.toFixed(1)}%`
}

function formatThreshold(n: number): string {
  return `${(Math.round(n * 10) / 10).toFixed(1)}%`
}

function formatDelta(bytes: number, percent: number): string {
  return `${formatSignedGrouped(bytes)} B (${formatPercent(percent)})`
}

function renderTable(
  headers: Array<string>,
  rows: Array<Array<string>>,
): Array<string> {
  const widths = headers.map(function (header, column) {
    let width = header.length
    for (const row of rows) {
      width = Math.max(width, row[column].length)
    }
    return width
  })
  function renderCells(cells: Array<string>): string {
    return cells
      .map(function (cell, column) {
        return column === 0
          ? cell.padEnd(widths[column])
          : cell.padStart(widths[column])
      })
      .join('  ')
  }
  const lines = [renderCells(headers)]
  lines.push(
    widths
      .map(function (width) {
        return '-'.repeat(width)
      })
      .join('  '),
  )
  for (const row of rows) lines.push(renderCells(row))
  return lines
}

function renderDiscoverySummary(build: DiscoveredBuild): string {
  const chunks: Array<string> = []
  chunks.push('minwind discovery summary\n')
  chunks.push(`build directory: ${build.buildDir}\n`)

  chunks.push(`\nHTML entry points (${build.htmlFiles.length}):\n`)
  for (const file of build.htmlFiles) {
    chunks.push(`  ${relativeTo(build, file)}\n`)
  }

  const associated = new Set<string>()
  for (const sheets of build.stylesheetsByHtml.values()) {
    for (const sheet of sheets) associated.add(sheet)
  }
  chunks.push(`\nStylesheets (${build.cssFiles.length}):\n`)
  for (const file of build.cssFiles) {
    const marker = associated.has(file) ? 'linked' : 'unlinked'
    chunks.push(`  ${relativeTo(build, file)} [${marker}]\n`)
  }

  chunks.push(`\nScripts (${build.jsFiles.length}):\n`)
  for (const file of build.jsFiles) {
    chunks.push(`  ${relativeTo(build, file)}\n`)
  }

  chunks.push(`\nStylesheet associations:\n`)
  for (const file of build.htmlFiles) {
    const sheets = build.stylesheetsByHtml.get(file) ?? []
    chunks.push(`  ${relativeTo(build, file)}:\n`)
    if (sheets.length === 0) {
      chunks.push(`    (none)\n`)
    } else {
      for (const sheet of sheets) {
        chunks.push(`    ${relativeTo(build, sheet)}\n`)
      }
    }
  }

  if (build.htmlFiles.length === 0) {
    chunks.push('\nno compressible Tailwind classes found\n')
  }
  return chunks.join('')
}

function renderClassInventory(
  build: DiscoveredBuild,
  model: ClassModel,
): string {
  const chunks: Array<string> = []
  chunks.push(
    `\nClass inventory (${model.entries.length} unique tokens, ` +
      `${model.totalClassTokenBytes} class-token bytes):\n`,
  )
  for (const category of CATEGORY_ORDER) {
    const entries = model.entries.filter(function (entry) {
      return entry.category === category
    })
    chunks.push(`  ${category} (${entries.length}):\n`)
    for (const entry of entries) {
      const facts = [
        `html: ${entry.htmlOccurrences}`,
        `rules: ${entry.ruleCount}`,
      ]
      if (entry.variantReferences > 0) {
        facts.push(`variant refs: ${entry.variantReferences}`)
      }
      if (entry.jsReferenced) facts.push('js: yes')
      chunks.push(`    ${entry.token} - ${facts.join(', ')}\n`)
    }
  }

  const excludedPercent =
    model.totalClassTokenBytes > 0
      ? (100 * model.excludedClassTokenBytes) / model.totalClassTokenBytes
      : 0
  chunks.push(
    `\nExcluded class-token bytes: ${model.excludedClassTokenBytes} of ` +
      `${model.totalClassTokenBytes} (${excludedPercent.toFixed(1)}%)\n`,
  )
  for (const category of CATEGORY_ORDER) {
    const share = model.excludedByteShareByCategory[category]
    if (share === undefined) continue
    chunks.push(`  ${category}: ${(100 * share).toFixed(1)}%\n`)
  }

  if (model.skippedFiles.length > 0) {
    chunks.push(`\nSkipped files (${model.skippedFiles.length}):\n`)
    for (const skipped of model.skippedFiles) {
      chunks.push(
        `  ${relativeTo(build, skipped.filePath)}: ${skipped.reason}\n`,
      )
    }
  }
  return chunks.join('')
}

function renderArmSummaries(summaries: Array<ArmSummary>): string {
  const chunks: Array<string> = []
  chunks.push('\nArm simulations:\n')
  for (const summary of summaries) {
    chunks.push(
      `  ${summary.arm}: ${summary.filesSimulated} files simulated, ` +
        `${summary.filesChanged} changed, ` +
        `${summary.classesRenamed} classes renamed, ` +
        `${summary.listsConsolidated} lists consolidated, ` +
        `${formatSignedBytes(summary.byteDelta)} bytes\n`,
    )
    for (const token of summary.unmodelableTokens) {
      chunks.push(`    unmodelable class: ${token}\n`)
    }
    for (const list of summary.unmodelableLists) {
      chunks.push(`    unmodelable list: ${list}\n`)
    }
  }
  return chunks.join('')
}

// Everything before the measurement: what was discovered, what was excluded,
// and what the arms simulated. Printed even when the qualification gate
// withholds verdicts, so the diagnostic has context.
export function renderDiscoveryReport(context: ReportContext): string {
  return (
    renderDiscoverySummary(context.build) +
    renderClassInventory(context.build, context.model) +
    renderArmSummaries(context.armSummaries)
  )
}

function renderCoverage(measurement: Measurement): Array<string> {
  const coverage = measurement.coverage
  const lines = [
    `  stylesheet coverage: ${coverage.utilitySelectors} utility selectors, ` +
      `${coverage.mappedSelectors} mapped to HTML classes, ` +
      `${coverage.unmappedSelectors} unmapped`,
  ]
  if (coverage.confidence === 'full') {
    lines.push('  confidence: full')
  } else {
    lines.push(
      `  confidence: partial (${coverage.unmappedSelectors} unmapped ` +
        `utility selectors, ${coverage.parseWarnings} CSS parse warnings)`,
    )
  }
  lines.push(
    `  qualifying stylesheets: ${coverage.qualifiedStylesheets.join(', ')}`,
  )
  return lines
}

function renderRouteTable(measurement: Measurement): Array<string> {
  const rows = measurement.routes.map(function (route) {
    const renameDelta = route.rename.brotliBytes - route.baseline.brotliBytes
    const consolidateDelta =
      route.consolidate.brotliBytes - route.baseline.brotliBytes
    return [
      route.route,
      formatGrouped(route.baseline.rawBytes),
      formatGrouped(route.baseline.gzipBytes),
      formatGrouped(route.baseline.brotliBytes),
      formatDelta(
        renameDelta,
        deltaPercent(route.rename.brotliBytes, route.baseline.brotliBytes),
      ),
      formatDelta(
        consolidateDelta,
        deltaPercent(route.consolidate.brotliBytes, route.baseline.brotliBytes),
      ),
    ]
  })
  return renderTable(
    ['route', 'raw', 'gzip', 'brotli', 'rename delta', 'consolidate delta'],
    rows,
  )
}

function renderWholeSiteTable(measurement: Measurement): Array<string> {
  function sizeCells(sizes: FileSizes): Array<string> {
    return [
      formatGrouped(sizes.rawBytes),
      formatGrouped(sizes.gzipBytes),
      formatGrouped(sizes.brotliBytes),
    ]
  }
  const rows: Array<Array<string>> = [
    ['baseline', ...sizeCells(measurement.wholeSite.baseline), '-'],
  ]
  for (const arm of measurement.arms) {
    rows.push([
      arm.arm,
      ...sizeCells(measurement.wholeSite[arm.arm]),
      formatDelta(arm.brotliDeltaBytes, arm.brotliDeltaPercent),
    ])
  }
  rows.push([
    'rename upper bound *',
    ...sizeCells(measurement.upperBoundRename.wholeSite),
    formatDelta(
      measurement.upperBoundRename.brotliDeltaBytes,
      measurement.upperBoundRename.brotliDeltaPercent,
    ),
  ])
  return renderTable(
    ['arm', 'raw', 'gzip', 'brotli', 'brotli delta vs baseline'],
    rows,
  )
}

function renderVerdictLines(measurement: Measurement): Array<string> {
  const threshold = formatThreshold(measurement.thresholdPercent)
  const lines: Array<string> = []
  for (const arm of measurement.arms) {
    const delta =
      `${formatPercent(arm.brotliDeltaPercent)} ` +
      `(${formatSignedGrouped(arm.brotliDeltaBytes)} B)`
    if (arm.verdict === 'not-worth-it') {
      const reason =
        arm.brotliDeltaBytes > 0
          ? 'a net increase'
          : `below the ${threshold} savings threshold`
      lines.push(`  ${arm.arm}: NOT WORTH IT - delta ${delta}, ${reason}`)
    } else {
      lines.push(
        `  ${arm.arm}: POTENTIALLY WORTH IT - delta ${delta}, ` +
          `at or above the ${threshold} savings threshold`,
      )
      if (arm.arm === 'rename') {
        lines.push(
          '    rename simulates a best-case name assignment, so treat ' +
            'the saving as an upper estimate',
        )
      }
    }
    if (arm.lowConfidence) {
      lines.push(
        '    low confidence: the upper bound (ignoring JS-reference ' +
          `exclusions) is ${formatPercent(measurement.upperBoundRename.brotliDeltaPercent)}, ` +
          `on the other side of the ${threshold} threshold`,
      )
    }
  }
  return lines
}

// The measurement report (R4/R5): per-route cold-cache rows, whole-site
// totals over unique files, the upper-bound rename counterfactual, and one
// unmistakable verdict per arm.
export function renderMeasurementReport(measurement: Measurement): string {
  const chunks: Array<string> = []
  chunks.push('\nMeasurement\n')
  chunks.push(
    `  compression: gzip level ${GZIP_LEVEL}, Brotli quality ` +
      `${BROTLI_QUALITY} (one-shot, per file)\n`,
  )
  chunks.push(
    '  figures are static precompression estimates, not CDN wire truth\n',
  )
  chunks.push(
    `  verdict threshold: ${formatThreshold(measurement.thresholdPercent)} ` +
      'whole-site Brotli savings ' +
      `(default ${formatThreshold(DEFAULT_THRESHOLD_PERCENT)})\n`,
  )
  for (const line of renderCoverage(measurement)) {
    chunks.push(`${line}\n`)
  }

  chunks.push(
    "\nPer-route (cold cache: the page's HTML plus its full associated " +
      'stylesheets, each file compressed independently)\n',
  )
  chunks.push(
    '  informational only - routes share stylesheets, so these rows are\n' +
      '  never summed into the whole-site totals\n',
  )
  chunks.push('  delta columns show per-route Brotli change vs baseline\n\n')
  for (const line of renderRouteTable(measurement)) {
    chunks.push(`  ${line}\n`)
  }

  chunks.push('\nWhole-site (each unique HTML and CSS file counted once)\n')
  chunks.push(
    '  JS is out of measurement scope: arms simulate HTML and CSS only\n',
  )
  chunks.push(
    `  (${measurement.jsFilesOutOfScope} JS files discovered, never ` +
      'simulated)\n',
  )
  chunks.push('  delta columns show whole-site Brotli change vs baseline\n\n')
  for (const line of renderWholeSiteTable(measurement)) {
    chunks.push(`  ${line}\n`)
  }
  chunks.push(
    '\n  * upper bound (ignoring JS-reference exclusions): a second rename\n' +
      '    simulation that treats JS-referenced classes as eligible; marker\n' +
      '    and unmodelable classes stay excluded because they can never be\n' +
      '    renamed safely\n',
  )

  chunks.push('\nVerdicts (whole-site Brotli delta vs baseline)\n')
  for (const line of renderVerdictLines(measurement)) {
    chunks.push(`${line}\n`)
  }
  return chunks.join('')
}

export interface JsonReport {
  tool: { name: string; version: string }
  runtime: { node: string; zlib: string; brotli: string }
  buildDir: string
  thresholdPercent: number | null
  htmlFiles: Array<string>
  cssFiles: Array<string>
  jsFiles: Array<string>
  warnings: Array<string>
  classModel: {
    entries: ClassModel['entries']
    skippedFiles: Array<{ filePath: string; reason: string }>
    parseWarnings: Array<{ filePath: string; reason: string }>
    totalClassTokenBytes: number
    excludedClassTokenBytes: number
    excludedByteShareByCategory: ClassModel['excludedByteShareByCategory']
  }
  arms: Array<ArmSummary>
  measurement: Measurement | null
}

// The full machine-readable report (KTD3): the measurement plus the CLI
// version, the runtime compression versions, and a SHA-256 per analyzed
// file, so identical input is auditable to identical numbers (R10).
export function buildJsonReport(
  context: ReportContext,
  measurement: Measurement | null,
  meta: ToolMeta,
): JsonReport {
  const { build, model, armSummaries } = context
  return {
    tool: { name: meta.name, version: meta.version },
    runtime: {
      node: process.versions.node,
      zlib: process.versions.zlib ?? '',
      brotli: process.versions.brotli ?? '',
    },
    buildDir: build.buildDir,
    thresholdPercent: measurement?.thresholdPercent ?? null,
    htmlFiles: build.htmlFiles.map(function (file) {
      return relativeTo(build, file)
    }),
    cssFiles: build.cssFiles.map(function (file) {
      return relativeTo(build, file)
    }),
    jsFiles: build.jsFiles.map(function (file) {
      return relativeTo(build, file)
    }),
    warnings: build.warnings,
    classModel: {
      entries: model.entries,
      skippedFiles: model.skippedFiles.map(function (skipped) {
        return {
          filePath: relativeTo(build, skipped.filePath),
          reason: skipped.reason,
        }
      }),
      parseWarnings: model.parseWarnings.map(function (warning) {
        return {
          filePath: relativeTo(build, warning.filePath),
          reason: warning.reason,
        }
      }),
      totalClassTokenBytes: model.totalClassTokenBytes,
      excludedClassTokenBytes: model.excludedClassTokenBytes,
      excludedByteShareByCategory: model.excludedByteShareByCategory,
    },
    arms: armSummaries,
    measurement,
  }
}
