import assert from 'node:assert'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { before, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import type { Measurement } from '../../src/measure/measure.js'
import type { JsonReport } from '../../src/measure/report.js'
import {
  BUILD_DIR,
  assertDemoBuild,
  buildGate,
  buildMissing,
} from './helpers/build-gate.js'

const execFileAsync = promisify(execFile)
const TEST_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(TEST_DIR, '../..')
const CLI_PATH = path.resolve(TEST_DIR, '../../src/measure/cli.ts')
const GOLDEN_RELATIVE_PATH = 'test/measure/golden/demo-report.json'
const GOLDEN_PATH = path.join(TEST_DIR, 'golden', 'demo-report.json')
const REGENERATE_COMMAND =
  `(cd examples/demo && MINWIND=off pnpm build) && ` +
  `pnpm tsx src/measure/cli.ts examples/demo/.output/public --json ` +
  `> ${GOLDEN_RELATIVE_PATH} ` +
  `&& pnpm prettier --write ${GOLDEN_RELATIVE_PATH}`

interface RunResult {
  code: number
  stdout: string
  stderr: string
}

async function runCli(args: Array<string>): Promise<RunResult> {
  try {
    const result = await execFileAsync('pnpm', ['tsx', CLI_PATH, ...args], {
      cwd: REPO_ROOT,
    })
    return { code: 0, stdout: result.stdout, stderr: result.stderr }
  } catch (error) {
    const err = error as {
      code?: number
      stdout?: string
      stderr?: string
    }
    return {
      code: typeof err.code === 'number' ? err.code : -1,
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? '',
    }
  }
}

// Hashes every file under root (dotfiles included, unlike the analyzer's
// discovery walk) so the golden run can prove the build directory is
// byte-identical afterward (R6).
function hashTree(root: string): Record<string, string> {
  const entries: Record<string, string> = {}
  function walk(dir: string): void {
    const dirents = fs.readdirSync(dir, { withFileTypes: true })
    dirents.sort(function (a, b) {
      if (a.name < b.name) return -1
      if (a.name > b.name) return 1
      return 0
    })
    for (const dirent of dirents) {
      const fullPath = path.join(dir, dirent.name)
      const relative = path.relative(root, fullPath).split(path.sep).join('/')
      if (dirent.isDirectory()) {
        walk(fullPath)
      } else if (dirent.isSymbolicLink()) {
        entries[relative] = `symlink:${fs.readlinkSync(fullPath)}`
      } else if (dirent.isFile()) {
        entries[relative] = createHash('sha256')
          .update(fs.readFileSync(fullPath))
          .digest('hex')
      }
    }
  }
  walk(root)
  return entries
}

interface GoldenDiff {
  runtimeWarnings: Array<string>
  staleInputs: Array<string>
  valueMismatches: Array<string>
}

function diffRuntime(
  expected: JsonReport['runtime'],
  actual: JsonReport['runtime'],
): Array<string> {
  const warnings: Array<string> = []
  for (const key of ['node', 'zlib', 'brotli'] as const) {
    if (expected[key] !== actual[key]) {
      warnings.push(
        `runtime ${key} version differs: the golden fixture recorded ` +
          `${expected[key]} but the current runtime reports ${actual[key]}; ` +
          'compression sizes may differ from the fixture',
      )
    }
  }
  return warnings
}

function diffInputHashes(
  expected: Measurement['inputHashes'],
  actual: Measurement['inputHashes'],
): Array<string> {
  const stale: Array<string> = []
  const expectedByFile = new Map(
    expected.map(function (entry) {
      return [entry.file, entry.sha256] as const
    }),
  )
  const actualByFile = new Map(
    actual.map(function (entry) {
      return [entry.file, entry.sha256] as const
    }),
  )
  for (const [file, sha256] of expectedByFile) {
    const actualHash = actualByFile.get(file)
    if (actualHash === undefined) {
      stale.push(`${file}: analyzed by the golden fixture but missing now`)
    } else if (actualHash !== sha256) {
      stale.push(`${file}: content hash differs from the golden fixture`)
    }
  }
  for (const file of actualByFile.keys()) {
    if (!expectedByFile.has(file)) {
      stale.push(`${file}: not present when the golden fixture was captured`)
    }
  }
  return stale.sort()
}

function formatValue(value: unknown): string {
  if (value === undefined) return '(missing)'
  const text = JSON.stringify(value) ?? '(unserializable)'
  return text.length > 80 ? `${text.slice(0, 77)}...` : text
}

function collectValueMismatches(
  pathPrefix: string,
  expected: unknown,
  actual: unknown,
  out: Array<string>,
): void {
  const differentShape =
    typeof expected !== typeof actual ||
    Array.isArray(expected) !== Array.isArray(actual) ||
    expected === null ||
    actual === null
  if (differentShape) {
    if (expected !== actual) {
      out.push(
        `${pathPrefix}: expected ${formatValue(expected)}, ` +
          `got ${formatValue(actual)}`,
      )
    }
    return
  }
  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) {
      out.push(
        `${pathPrefix}: expected ${expected.length} entries, ` +
          `got ${actual.length}`,
      )
      return
    }
    for (let i = 0; i < expected.length; i += 1) {
      collectValueMismatches(`${pathPrefix}[${i}]`, expected[i], actual[i], out)
    }
    return
  }
  if (typeof expected === 'object') {
    const expectedRecord = expected as Record<string, unknown>
    const actualRecord = actual as Record<string, unknown>
    const keys = new Set([
      ...Object.keys(expectedRecord),
      ...Object.keys(actualRecord),
    ])
    for (const key of keys) {
      const childPath = pathPrefix === '' ? key : `${pathPrefix}.${key}`
      collectValueMismatches(
        childPath,
        expectedRecord[key],
        actualRecord[key],
        out,
      )
    }
    return
  }
  if (expected !== actual) {
    out.push(
      `${pathPrefix}: expected ${formatValue(expected)}, ` +
        `got ${formatValue(actual)}`,
    )
  }
}

// buildDir is absolute and machine-specific, runtime versions are compared
// separately as warnings, and input hashes separately as stale inputs.
function stripEnvironmentFields(report: JsonReport): Record<string, unknown> {
  const clone: Record<string, unknown> = { ...report }
  delete clone.buildDir
  delete clone.runtime
  if (report.measurement !== null) {
    const measurement: Record<string, unknown> = { ...report.measurement }
    delete measurement.inputHashes
    clone.measurement = measurement
  }
  return clone
}

function diffGoldenReports(
  expected: JsonReport,
  actual: JsonReport,
): GoldenDiff {
  const valueMismatches: Array<string> = []
  collectValueMismatches(
    '',
    stripEnvironmentFields(expected),
    stripEnvironmentFields(actual),
    valueMismatches,
  )
  return {
    runtimeWarnings: diffRuntime(expected.runtime, actual.runtime),
    staleInputs: diffInputHashes(
      expected.measurement?.inputHashes ?? [],
      actual.measurement?.inputHashes ?? [],
    ),
    valueMismatches,
  }
}

function formatGoldenFailure(diff: GoldenDiff): string {
  const lines = [`golden report mismatch against ${GOLDEN_RELATIVE_PATH}`]
  if (diff.staleInputs.length > 0) {
    lines.push('', 'dist/ has changed since the golden fixture was captured:')
    for (const entry of diff.staleInputs) lines.push(`  ${entry}`)
    lines.push('', `regenerate the golden fixture with: ${REGENERATE_COMMAND}`)
  }
  if (diff.runtimeWarnings.length > 0) {
    lines.push('', 'runtime compression versions differ from the fixture:')
    for (const warning of diff.runtimeWarnings) lines.push(`  ${warning}`)
  }
  if (diff.valueMismatches.length > 0) {
    lines.push('', 'report values differ from the fixture:')
    for (const mismatch of diff.valueMismatches) {
      lines.push(`  ${mismatch}`)
    }
  }
  return lines.join('\n')
}

function readGoldenFixture(): JsonReport {
  if (!fs.existsSync(GOLDEN_PATH)) {
    assert.fail(
      `golden fixture not found at ${GOLDEN_RELATIVE_PATH}; ` +
        `regenerate the golden fixture with: ${REGENERATE_COMMAND}`,
    )
  }
  return JSON.parse(fs.readFileSync(GOLDEN_PATH, 'utf8')) as JsonReport
}

function syntheticReport(): JsonReport {
  return {
    tool: { name: 'minwind', version: '0.1.0' },
    runtime: { node: '22.14.0', zlib: '1.3.1', brotli: '1.1.0' },
    buildDir: '/repo/dist',
    thresholdPercent: 5,
    htmlFiles: ['index.html'],
    cssFiles: ['assets/app.css'],
    jsFiles: [],
    warnings: [],
    classModel: {
      entries: [],
      skippedFiles: [],
      parseWarnings: [],
      totalClassTokenBytes: 0,
      excludedClassTokenBytes: 0,
      excludedByteShareByCategory: {},
    },
    arms: [],
    measurement: {
      thresholdPercent: 5,
      routes: [],
      wholeSite: {
        baseline: { rawBytes: 100, gzipBytes: 50, brotliBytes: 40 },
        rename: { rawBytes: 100, gzipBytes: 50, brotliBytes: 40 },
        consolidate: { rawBytes: 100, gzipBytes: 50, brotliBytes: 40 },
      },
      arms: [],
      upperBoundRename: {
        wholeSite: { rawBytes: 100, gzipBytes: 50, brotliBytes: 40 },
        brotliDeltaBytes: 0,
        brotliDeltaPercent: 0,
      },
      coverage: {
        utilitySelectors: 0,
        mappedSelectors: 0,
        unmappedSelectors: 0,
        parseWarnings: 0,
        qualifiedStylesheets: [],
        confidence: 'full',
      },
      inputHashes: [{ file: 'index.html', sha256: 'aaaa' }],
      jsFilesOutOfScope: 0,
    },
  }
}

describe('golden comparison logic', function () {
  it('reports no differences for identical reports', function () {
    const diff = diffGoldenReports(syntheticReport(), syntheticReport())
    assert.deepStrictEqual(diff, {
      runtimeWarnings: [],
      staleInputs: [],
      valueMismatches: [],
    })
  })

  it('warns when runtime compression versions differ from the fixture', function () {
    const expected = syntheticReport()
    const actual = syntheticReport()
    actual.runtime = { node: '22.13.0', zlib: '1.3.1', brotli: '1.0.9' }
    const diff = diffGoldenReports(expected, actual)
    assert.strictEqual(diff.runtimeWarnings.length, 2)
    assert.ok(
      diff.runtimeWarnings.some(function (warning) {
        return warning.includes('node')
      }),
    )
    assert.ok(
      diff.runtimeWarnings.some(function (warning) {
        return warning.includes('brotli')
      }),
    )
    assert.deepStrictEqual(diff.staleInputs, [])
    assert.deepStrictEqual(diff.valueMismatches, [])
  })

  it('names the regeneration command when input hashes differ', function () {
    const expected = syntheticReport()
    const actual = syntheticReport()
    assert.ok(actual.measurement !== null)
    actual.measurement.inputHashes = [
      { file: 'index.html', sha256: 'bbbb' },
      { file: 'new.html', sha256: 'cccc' },
    ]
    const diff = diffGoldenReports(expected, actual)
    assert.strictEqual(diff.staleInputs.length, 2)
    assert.ok(
      diff.staleInputs.some(function (entry) {
        return entry.startsWith('index.html')
      }),
    )
    assert.ok(
      diff.staleInputs.some(function (entry) {
        return entry.startsWith('new.html')
      }),
    )
    const message = formatGoldenFailure(diff)
    assert.match(message, /regenerate the golden fixture with:/)
    assert.ok(message.includes(REGENERATE_COMMAND))
  })

  it('reports value mismatches with their report paths', function () {
    const expected = syntheticReport()
    const actual = syntheticReport()
    assert.ok(actual.measurement !== null)
    actual.measurement.wholeSite.rename.brotliBytes = 38
    const diff = diffGoldenReports(expected, actual)
    assert.deepStrictEqual(diff.valueMismatches, [
      'measurement.wholeSite.rename.brotliBytes: expected 40, got 38',
    ])
  })

  it('ignores the machine-specific absolute buildDir', function () {
    const expected = syntheticReport()
    const actual = syntheticReport()
    actual.buildDir = '/someone-else/checkout/dist'
    const diff = diffGoldenReports(expected, actual)
    assert.deepStrictEqual(diff.valueMismatches, [])
  })
})

describe('golden run on the demo build (AE3)', function () {
  const gate = buildGate()
  let hashesBefore: Record<string, string> = {}
  let hashesAfter: Record<string, string> = {}
  let report: JsonReport | null = null

  before(async function () {
    assertDemoBuild()
    if (buildMissing()) return
    hashesBefore = hashTree(BUILD_DIR)
    const cli = await runCli([BUILD_DIR, '--json'])
    hashesAfter = hashTree(BUILD_DIR)
    assert.strictEqual(cli.code, 0, `minwind failed:\n${cli.stderr}`)
    report = JSON.parse(cli.stdout) as JsonReport
  })

  it('leaves the build directory byte-identical (R6)', gate, function () {
    assert.deepStrictEqual(hashesAfter, hashesBefore)
  })

  it('covers every discovered route in the measurement', gate, function () {
    assert.ok(report)
    assert.ok(report.measurement !== null)
    // The demo prerenders /, /about, and /404.
    assert.strictEqual(report.htmlFiles.length, 3)
    const routes = report.measurement.routes
      .map(function (route) {
        return route.route
      })
      .sort()
    const htmlFiles = report.htmlFiles.slice().sort()
    assert.deepStrictEqual(routes, htmlFiles)
  })

  it('reproduces the stored golden numbers exactly (R10)', gate, function () {
    assert.ok(report)
    const fixture = readGoldenFixture()
    const diff = diffGoldenReports(fixture, report)
    assert.deepStrictEqual(
      diff,
      { runtimeWarnings: [], staleInputs: [], valueMismatches: [] },
      formatGoldenFailure(diff),
    )
  })
})
