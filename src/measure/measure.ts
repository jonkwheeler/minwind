import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'
import { simulateRename } from './arms/rename.js'
import type {
  ClassCategory,
  ClassInventoryEntry,
  ClassModel,
} from './exclusions.js'
import { EXCLUDED_CATEGORIES, categorize } from './exclusions.js'
import type { ArmResult, SimulationInput } from './span-edit.js'
import { compareCodeUnits } from './util.js'

// KTD3 compression profile: gzip level 9 and Brotli quality 11, one-shot
// node:zlib calls on whole-file Buffers, every file compressed independently.
// The resulting numbers are static precompression estimates, not CDN wire
// truth; the JSON report pins the runtime compression versions alongside.
export const GZIP_LEVEL = 9
export const BROTLI_QUALITY = 11

// KTD4: whole-site Brotli savings percent required for a "potentially worth
// it" verdict; --threshold overrides.
export const DEFAULT_THRESHOLD_PERCENT = 5

export interface FileSizes {
  rawBytes: number
  gzipBytes: number
  brotliBytes: number
}

export interface RouteMeasurement {
  route: string
  files: Array<string>
  baseline: FileSizes
  rename: FileSizes
  consolidate: FileSizes
}

export type Verdict = 'not-worth-it' | 'potentially-worth-it'

export interface ArmMeasurement {
  arm: 'rename' | 'consolidate'
  brotliDeltaBytes: number
  brotliDeltaPercent: number
  verdict: Verdict
  lowConfidence: boolean
}

export interface UpperBoundRenameMeasurement {
  wholeSite: FileSizes
  brotliDeltaBytes: number
  brotliDeltaPercent: number
}

export interface StylesheetCoverage {
  utilitySelectors: number
  mappedSelectors: number
  unmappedSelectors: number
  parseWarnings: number
  qualifiedStylesheets: Array<string>
  confidence: 'full' | 'partial'
}

export interface InputFileHash {
  file: string
  sha256: string
}

export interface Measurement {
  thresholdPercent: number
  routes: Array<RouteMeasurement>
  wholeSite: {
    baseline: FileSizes
    rename: FileSizes
    consolidate: FileSizes
  }
  arms: Array<ArmMeasurement>
  upperBoundRename: UpperBoundRenameMeasurement
  coverage: StylesheetCoverage
  inputHashes: Array<InputFileHash>
  jsFilesOutOfScope: number
}

export interface ArmResults {
  baseline: ArmResult
  rename: ArmResult
  consolidate: ArmResult
}

// The qualification gate (Risks & Dependencies): verdicts are only computed
// when at least one discovered stylesheet parses, holds a populated
// `@layer utilities`, and has at least one decoded utility selector mapping
// exactly to an HTML-used class token. Without one, the build does not look
// like a measurable Tailwind build and the run aborts with no verdict.
export class NoQualifiedStylesheetError extends Error {
  constructor(public readonly coverage: StylesheetCoverage) {
    super(
      'no stylesheet qualifies for measurement: none of the discovered ' +
        'stylesheets has a parseable, populated @layer utilities with at ' +
        'least one selector mapping exactly to an HTML-used class; ' +
        'withholding all verdicts',
    )
    this.name = 'NoQualifiedStylesheetError'
  }
}

export function compressSizes(text: string): FileSizes {
  const buffer = Buffer.from(text, 'utf8')
  return {
    rawBytes: buffer.length,
    gzipBytes: gzipSync(buffer, { level: GZIP_LEVEL }).length,
    brotliBytes: brotliCompressSync(buffer, {
      params: { [constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY },
    }).length,
  }
}

// Arms leave most file contents identical, so compression results are cached
// by content across arms — Brotli quality 11 on a large page is the
// expensive call, and identical input compresses to identical output.
function measureFileMap(
  files: Map<string, string>,
  cache: Map<string, FileSizes>,
): Map<string, FileSizes> {
  const sizes = new Map<string, FileSizes>()
  for (const [filePath, contents] of files) {
    let size = cache.get(contents)
    if (size === undefined) {
      size = compressSizes(contents)
      cache.set(contents, size)
    }
    sizes.set(filePath, size)
  }
  return sizes
}

function sumSizesFor(
  sizes: Map<string, FileSizes>,
  files: Array<string>,
): FileSizes {
  const total: FileSizes = { rawBytes: 0, gzipBytes: 0, brotliBytes: 0 }
  for (const file of files) {
    const size = sizes.get(file)
    // Arms measure every discovered HTML and CSS file, and association only
    // accepts discovered CSS files, so a miss here is a pipeline bug — never
    // user input to skip past.
    if (size === undefined) {
      throw new Error(`missing measured size: ${file}`)
    }
    total.rawBytes += size.rawBytes
    total.gzipBytes += size.gzipBytes
    total.brotliBytes += size.brotliBytes
  }
  return total
}

function relativePath(input: SimulationInput, file: string): string {
  return path.relative(input.build.buildDir, file).split(path.sep).join('/')
}

// Coverage per KTD6: every selector arm inside a utilities-layer rule is a
// utility selector; it is "mapped" when its decoded candidate is a token
// used in at least one HTML class attribute. Parseable-but-unmapped utility
// selectors are excluded from simulation (they land in the css-only
// category); the report carries the counts and a full/partial confidence.
export function computeStylesheetCoverage(
  input: SimulationInput,
): StylesheetCoverage {
  const entryByToken = new Map(
    input.model.entries.map(function (entry) {
      return [entry.token, entry] as const
    }),
  )
  let utilitySelectors = 0
  let mappedSelectors = 0
  let parseWarnings = 0
  const qualifiedStylesheets: Array<string> = []
  // A stylesheet in cssModels parsed by definition — an unrecoverable parse
  // would have thrown at model time — so only layer population and selector
  // mapping gate qualification here.
  for (const [filePath, model] of input.cssModels) {
    parseWarnings += model.parseWarnings.length
    let layerRuleCount = 0
    let fileMapped = 0
    for (const rule of model.rules) {
      if (!rule.inUtilitiesLayer) continue
      layerRuleCount += 1
      for (const arm of rule.arms) {
        utilitySelectors += 1
        const candidate = arm.candidates[0]
        const entry =
          candidate === undefined ? undefined : entryByToken.get(candidate)
        if (entry !== undefined && entry.htmlOccurrences > 0) {
          mappedSelectors += 1
          fileMapped += 1
        }
      }
    }
    if (layerRuleCount > 0 && fileMapped > 0) {
      qualifiedStylesheets.push(relativePath(input, filePath))
    }
  }
  const unmappedSelectors = utilitySelectors - mappedSelectors
  return {
    utilitySelectors,
    mappedSelectors,
    unmappedSelectors,
    parseWarnings,
    qualifiedStylesheets,
    confidence:
      unmappedSelectors === 0 && parseWarnings === 0 ? 'full' : 'partial',
  }
}

// Re-runs the category decision for a js-referenced entry as if JS had not
// referenced it; marker and unmodelable outcomes stay excluded because they
// can never be renamed safely (KTD6).
function recategorizeWithoutJsReference(
  entry: ClassInventoryEntry,
): ClassCategory {
  return categorize(entry, false)
}

// The upper-bound counterfactual's model: identical to the real model except
// the js-referenced exclusion is ignored, so the rename simulation prices
// what JS-reference exclusions cost.
export function withoutJsReferenceExclusions(model: ClassModel): ClassModel {
  const entries = model.entries.map(function (entry) {
    if (entry.category !== 'js-referenced') return entry
    const category = recategorizeWithoutJsReference(entry)
    return { ...entry, category, excluded: EXCLUDED_CATEGORIES.has(category) }
  })
  let excludedClassTokenBytes = 0
  const excludedBytesByCategory = new Map<ClassCategory, number>()
  for (const entry of entries) {
    if (!entry.excluded) continue
    excludedClassTokenBytes += entry.htmlBytes
    excludedBytesByCategory.set(
      entry.category,
      (excludedBytesByCategory.get(entry.category) ?? 0) + entry.htmlBytes,
    )
  }
  const excludedByteShareByCategory: Partial<Record<ClassCategory, number>> = {}
  if (model.totalClassTokenBytes > 0) {
    for (const [category, bytes] of excludedBytesByCategory) {
      excludedByteShareByCategory[category] = bytes / model.totalClassTokenBytes
    }
  }
  return {
    ...model,
    entries,
    excludedClassTokenBytes,
    excludedByteShareByCategory,
  }
}

export function simulateUpperBoundRename(input: SimulationInput): ArmResult {
  return simulateRename({
    ...input,
    model: withoutJsReferenceExclusions(input.model),
  })
}

export function deltaPercent(simulated: number, baseline: number): number {
  if (baseline === 0) return 0
  return ((simulated - baseline) / baseline) * 100
}

// KTD4 verdict asymmetry: savings below the threshold are a confident "not
// worth it"; savings at or above it are only "potentially worth it" because
// rename simulates a best-case name assignment (KTD7). A net-negative delta
// (consolidation appends rules) reports as-is and is never worth it.
function verdictFor(savedPercent: number, thresholdPercent: number): Verdict {
  return savedPercent >= thresholdPercent
    ? 'potentially-worth-it'
    : 'not-worth-it'
}

// Low confidence (KTD6): the measured delta and the upper-bound
// counterfactual straddle the threshold — one below, the other at/above.
function straddlesThreshold(
  savedPercent: number,
  upperBoundSavedPercent: number,
  thresholdPercent: number,
): boolean {
  const measuredAbove = savedPercent >= thresholdPercent
  const upperAbove = upperBoundSavedPercent >= thresholdPercent
  return measuredAbove !== upperAbove
}

export function measureBuild(
  input: SimulationInput,
  armResults: ArmResults,
  options: { thresholdPercent?: number },
): Measurement {
  const thresholdPercent = options.thresholdPercent ?? DEFAULT_THRESHOLD_PERCENT
  const coverage = computeStylesheetCoverage(input)
  if (coverage.qualifiedStylesheets.length === 0) {
    throw new NoQualifiedStylesheetError(coverage)
  }
  const upperBound = simulateUpperBoundRename(input)

  const compressionCache = new Map<string, FileSizes>()
  const baselineSizes = measureFileMap(
    armResults.baseline.files,
    compressionCache,
  )
  const renameSizes = measureFileMap(armResults.rename.files, compressionCache)
  const consolidateSizes = measureFileMap(
    armResults.consolidate.files,
    compressionCache,
  )
  const upperBoundSizes = measureFileMap(upperBound.files, compressionCache)

  // Per-route rows (KTD4): the page's HTML plus its full associated
  // stylesheets — informational cold-cache figures, never summed into the
  // whole-site totals because routes share stylesheets.
  const routes: Array<RouteMeasurement> = []
  for (const htmlFile of input.build.htmlFiles) {
    const files = [
      htmlFile,
      ...(input.build.stylesheetsByHtml.get(htmlFile) ?? []),
    ]
    routes.push({
      route: relativePath(input, htmlFile),
      files: files.map(function (file) {
        return relativePath(input, file)
      }),
      baseline: sumSizesFor(baselineSizes, files),
      rename: sumSizesFor(renameSizes, files),
      consolidate: sumSizesFor(consolidateSizes, files),
    })
  }

  // Whole-site totals count each unique simulated file once (HTML + CSS
  // only; arms never simulate JS, so JS is out of measurement scope).
  const uniqueFiles = Array.from(armResults.baseline.files.keys())
  const wholeSite = {
    baseline: sumSizesFor(baselineSizes, uniqueFiles),
    rename: sumSizesFor(renameSizes, uniqueFiles),
    consolidate: sumSizesFor(consolidateSizes, uniqueFiles),
  }
  const upperBoundWholeSite = sumSizesFor(upperBoundSizes, uniqueFiles)

  const baselineBrotli = wholeSite.baseline.brotliBytes
  const upperBoundDeltaBytes = upperBoundWholeSite.brotliBytes - baselineBrotli
  const upperBoundDeltaPercent = deltaPercent(
    upperBoundWholeSite.brotliBytes,
    baselineBrotli,
  )

  const arms: Array<ArmMeasurement> = []
  for (const arm of ['rename', 'consolidate'] as const) {
    const deltaBytes = wholeSite[arm].brotliBytes - baselineBrotli
    const percent = deltaPercent(wholeSite[arm].brotliBytes, baselineBrotli)
    const savedPercent = -percent
    arms.push({
      arm,
      brotliDeltaBytes: deltaBytes,
      brotliDeltaPercent: percent,
      verdict: verdictFor(savedPercent, thresholdPercent),
      lowConfidence:
        arm === 'rename' &&
        straddlesThreshold(
          savedPercent,
          -upperBoundDeltaPercent,
          thresholdPercent,
        ),
    })
  }

  const inputHashes: Array<InputFileHash> = []
  const analyzedSources = new Map<string, string>([
    ...input.htmlSources,
    ...input.cssSources,
  ])
  const analyzedFiles = Array.from(analyzedSources.keys()).sort(
    compareCodeUnits,
  )
  for (const filePath of analyzedFiles) {
    const source = analyzedSources.get(filePath) ?? ''
    inputHashes.push({
      file: relativePath(input, filePath),
      sha256: createHash('sha256')
        .update(Buffer.from(source, 'utf8'))
        .digest('hex'),
    })
  }

  return {
    thresholdPercent,
    routes,
    wholeSite,
    arms,
    upperBoundRename: {
      wholeSite: upperBoundWholeSite,
      brotliDeltaBytes: upperBoundDeltaBytes,
      brotliDeltaPercent: upperBoundDeltaPercent,
    },
    coverage,
    inputHashes,
    jsFilesOutOfScope: input.build.jsFiles.length,
  }
}
