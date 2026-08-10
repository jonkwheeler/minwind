import assert from 'node:assert'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { simulateBaseline } from '../../src/measure/arms/baseline.js'
import { simulateConsolidate } from '../../src/measure/arms/consolidate.js'
import { simulateRename } from '../../src/measure/arms/rename.js'
import { discoverBuild } from '../../src/measure/discover.js'
import { buildClassModel } from '../../src/measure/exclusions.js'
import {
  DEFAULT_THRESHOLD_PERCENT,
  NoQualifiedStylesheetError,
  compressSizes,
  computeStylesheetCoverage,
  measureBuild,
  simulateUpperBoundRename,
  withoutJsReferenceExclusions,
  type ArmResults,
} from '../../src/measure/measure.js'
import {
  buildSimulationInput,
  type ArmResult,
  type SimulationInput,
} from '../../src/measure/span-edit.js'
import { BUILD_DIR, assertDemoBuild, buildGate } from './helpers/build-gate.js'

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES_DIR = path.join(TEST_DIR, 'fixtures')
const RENAME_SITE = path.join(FIXTURES_DIR, 'arm-rename')
const MODEL_SITE = path.join(FIXTURES_DIR, 'model-site')
const PLAIN_SITE = path.join(FIXTURES_DIR, 'site')
const MISSING_CSS_SITE = path.join(FIXTURES_DIR, 'missing-css')
const SHARED_CSS_SITE = path.join(FIXTURES_DIR, 'measure-shared-css')
const STRADDLE_SITE = path.join(FIXTURES_DIR, 'measure-straddle')
const NEGATIVE_SITE = path.join(FIXTURES_DIR, 'measure-negative')
const SUPPORTS_PRELUDE_SITE = path.join(FIXTURES_DIR, 'supports-prelude')
const UNDISCOVERED_LINKS_SITE = path.join(FIXTURES_DIR, 'undiscovered-links')

function inputFor(dir: string): SimulationInput {
  const build = discoverBuild(dir)
  return buildSimulationInput(build, buildClassModel(build))
}

function armsFor(input: SimulationInput): ArmResults {
  return {
    baseline: simulateBaseline(input),
    rename: simulateRename(input),
    consolidate: simulateConsolidate(input),
  }
}

function measureFixture(dir: string, thresholdPercent?: number) {
  const input = inputFor(dir)
  return measureBuild(input, armsFor(input), { thresholdPercent })
}

function armMeasurement(
  measurement: ReturnType<typeof measureFixture>,
  arm: 'rename' | 'consolidate',
) {
  const found = measurement.arms.find(function (candidate) {
    return candidate.arm === arm
  })
  assert.ok(found, `expected a measurement for arm ${arm}`)
  return found
}

describe('compressSizes', () => {
  it('measures raw, gzip, and brotli sizes of one file independently', () => {
    const text = 'a'.repeat(1024)
    const sizes = compressSizes(text)
    assert.strictEqual(sizes.rawBytes, 1024)
    assert.ok(sizes.gzipBytes > 0)
    assert.ok(sizes.brotliBytes > 0)
    // Highly repetitive content compresses well at the fixed KTD3 profile.
    assert.ok(sizes.gzipBytes < 1024)
    assert.ok(sizes.brotliBytes < 1024)
  })

  it('is deterministic for identical input', () => {
    const text = 'const answer = 42;\n'.repeat(40)
    assert.deepStrictEqual(compressSizes(text), compressSizes(text))
  })
})

describe('whole-site and per-route accounting', () => {
  it('counts each unique HTML and CSS file once in whole-site totals', () => {
    const input = inputFor(SHARED_CSS_SITE)
    const measurement = measureBuild(input, armsFor(input), {})
    const expectedRaw = input.build.htmlFiles
      .concat(input.build.cssFiles)
      .reduce(function (total, file) {
        return total + fs.readFileSync(file).length
      }, 0)
    assert.strictEqual(measurement.wholeSite.baseline.rawBytes, expectedRaw)
    // JS is discovered but never simulated, so it stays out of measurement.
    assert.strictEqual(measurement.jsFilesOutOfScope, 0)
  })

  it('carries per-route cold-cache rows that are never summed into totals', () => {
    const measurement = measureFixture(SHARED_CSS_SITE)
    assert.strictEqual(measurement.routes.length, 2)
    const indexRow = measurement.routes.find(function (route) {
      return route.route === 'index.html'
    })
    const aboutRow = measurement.routes.find(function (route) {
      return route.route === 'about.html'
    })
    assert.ok(indexRow)
    assert.ok(aboutRow)
    // Both routes carry the page HTML plus the full shared stylesheet.
    assert.deepStrictEqual(indexRow.files, ['index.html', 'assets/app.css'])
    assert.deepStrictEqual(aboutRow.files, ['about.html', 'assets/app.css'])
    const routeBrotliSum =
      indexRow.baseline.brotliBytes + aboutRow.baseline.brotliBytes
    assert.ok(
      measurement.wholeSite.baseline.brotliBytes < routeBrotliSum,
      'the shared stylesheet is counted in each route row but once in totals',
    )
  })

  it('computes per-arm route sizes from independently compressed files', () => {
    const input = inputFor(RENAME_SITE)
    const arms = armsFor(input)
    const measurement = measureBuild(input, arms, {})
    const row = measurement.routes.find(function (route) {
      return route.route === 'index.html'
    })
    assert.ok(row)
    const htmlFile = path.join(RENAME_SITE, 'index.html')
    const cssFile = path.join(RENAME_SITE, 'assets', 'app.css')
    function expectedSizes(result: ArmResult) {
      const html = result.files.get(htmlFile)
      const css = result.files.get(cssFile)
      assert.ok(html !== undefined && css !== undefined)
      const htmlSizes = compressSizes(html)
      const cssSizes = compressSizes(css)
      return {
        rawBytes: htmlSizes.rawBytes + cssSizes.rawBytes,
        gzipBytes: htmlSizes.gzipBytes + cssSizes.gzipBytes,
        brotliBytes: htmlSizes.brotliBytes + cssSizes.brotliBytes,
      }
    }
    assert.deepStrictEqual(row.baseline, expectedSizes(arms.baseline))
    assert.deepStrictEqual(row.rename, expectedSizes(arms.rename))
    assert.deepStrictEqual(row.consolidate, expectedSizes(arms.consolidate))
    assert.ok(
      row.rename.brotliBytes < row.baseline.brotliBytes,
      'rename shrinks the route below baseline',
    )
  })

  it('throws when a summed file is absent from the measured map', () => {
    const input = inputFor(RENAME_SITE)
    const arms = armsFor(input)
    const brokenFiles = new Map(arms.baseline.files)
    brokenFiles.delete(path.join(RENAME_SITE, 'assets', 'app.css'))
    const brokenBaseline: ArmResult = { ...arms.baseline, files: brokenFiles }
    assert.throws(function () {
      measureBuild(input, { ...arms, baseline: brokenBaseline }, {})
    }, /missing measured size/)
  })
})

describe('undiscovered linked stylesheets', () => {
  function undiscoveredWarning(fragment: string): string {
    const build = discoverBuild(UNDISCOVERED_LINKS_SITE)
    const warning = build.warnings.find(function (text) {
      return text.includes(fragment)
    })
    assert.ok(warning, `expected a discovery warning naming ${fragment}`)
    return warning
  }

  it('warns for a linked path that is a directory', () => {
    const warning = undiscoveredWarning('assets/dir.css')
    assert.match(warning, /not a discovered CSS file/)
    assert.match(warning, /referenced from index\.html/)
  })

  it('warns for a linked existing file without a .css extension', () => {
    const warning = undiscoveredWarning('assets/notes.txt')
    assert.match(warning, /not a discovered CSS file/)
    assert.match(warning, /referenced from index\.html/)
  })

  it('warns for a symlinked CSS file enumeration never discovered', () => {
    const warning = undiscoveredWarning('assets/linked.css')
    assert.match(warning, /not a discovered CSS file/)
    assert.match(warning, /referenced from index\.html/)
  })

  it('keeps undiscovered links out of route files and completes the run', () => {
    const build = discoverBuild(UNDISCOVERED_LINKS_SITE)
    assert.strictEqual(build.warnings.length, 3)
    const input = inputFor(UNDISCOVERED_LINKS_SITE)
    const measurement = measureBuild(input, armsFor(input), {})
    assert.strictEqual(measurement.routes.length, 1)
    const row = measurement.routes[0]
    assert.strictEqual(row.route, 'index.html')
    assert.deepStrictEqual(row.files, ['index.html', 'assets/app.css'])
    assert.ok(row.baseline.rawBytes > 0)
  })
})

describe('verdicts', () => {
  it('defaults the threshold to 5 percent', () => {
    assert.strictEqual(DEFAULT_THRESHOLD_PERCENT, 5)
    const measurement = measureFixture(RENAME_SITE)
    assert.strictEqual(measurement.thresholdPercent, 5)
  })

  it('reports not-worth-it verdicts with full numbers below threshold', () => {
    const measurement = measureFixture(RENAME_SITE, 100)
    for (const arm of measurement.arms) {
      assert.strictEqual(arm.verdict, 'not-worth-it', arm.arm)
      assert.strictEqual(arm.lowConfidence, false)
    }
    assert.ok(measurement.wholeSite.baseline.brotliBytes > 0)
    assert.ok(measurement.routes.length > 0)
  })

  it('reports potentially-worth-it at or above the threshold', () => {
    const measurement = measureFixture(RENAME_SITE, 0)
    const rename = armMeasurement(measurement, 'rename')
    assert.ok(rename.brotliDeltaBytes < 0, 'rename saves bytes on this site')
    assert.strictEqual(rename.verdict, 'potentially-worth-it')
  })

  it('reports a net-negative consolidate delta as-is', () => {
    const measurement = measureFixture(NEGATIVE_SITE)
    const consolidate = armMeasurement(measurement, 'consolidate')
    assert.ok(
      consolidate.brotliDeltaBytes > 0,
      'appending the shared rule grows the compressed total',
    )
    assert.ok(consolidate.brotliDeltaPercent > 0)
    assert.strictEqual(consolidate.verdict, 'not-worth-it')
    assert.strictEqual(consolidate.lowConfidence, false)
  })
})

describe('upper-bound rename (ignoring JS-reference exclusions)', () => {
  it('recategorizes only js-referenced entries', () => {
    const input = inputFor(RENAME_SITE)
    const upperModel = withoutJsReferenceExclusions(input.model)
    const byToken = new Map(
      upperModel.entries.map(function (entry) {
        return [entry.token, entry] as const
      }),
    )
    const locked = byToken.get('js-locked')
    assert.ok(locked)
    assert.strictEqual(locked.category, 'utility')
    assert.strictEqual(locked.excluded, false)
    const group = byToken.get('group')
    assert.ok(group)
    assert.strictEqual(group.category, 'marker')
    assert.strictEqual(group.excluded, true)
    const glow = byToken.get('group-hover:glow')
    assert.ok(glow)
    assert.strictEqual(glow.category, 'utility')
  })

  it('renames JS-referenced utility classes the measured arm holds out', () => {
    const input = inputFor(RENAME_SITE)
    const measured = simulateRename(input)
    const upper = simulateUpperBoundRename(input)
    assert.strictEqual(measured.summary.classesRenamed, 4)
    assert.strictEqual(upper.summary.classesRenamed, 5)
    const html = upper.files.get(path.join(RENAME_SITE, 'index.html'))
    assert.ok(html !== undefined)
    assert.ok(
      !html.includes('class="js-locked'),
      'js-locked renamed in upper-bound class attributes',
    )
    // The inline-script literal is never rewritten, only class attributes.
    assert.ok(html.includes(`'js-locked'`))
    const css = upper.files.get(path.join(RENAME_SITE, 'assets', 'app.css'))
    assert.ok(css !== undefined)
    assert.ok(!css.includes('.js-locked'))
  })

  it('never measures worse than the measured rename arm', () => {
    const measurement = measureFixture(RENAME_SITE)
    const rename = armMeasurement(measurement, 'rename')
    assert.ok(
      measurement.upperBoundRename.brotliDeltaBytes <= rename.brotliDeltaBytes,
    )
  })
})

describe('low-confidence annotation', () => {
  it('fires when measured delta and upper bound straddle the threshold', () => {
    const input = inputFor(STRADDLE_SITE)
    const arms = armsFor(input)
    const probe = measureBuild(input, arms, { thresholdPercent: 0 })
    const measured = armMeasurement(probe, 'rename')
    const measuredSaved = -measured.brotliDeltaPercent
    const upperSaved = -probe.upperBoundRename.brotliDeltaPercent
    assert.ok(
      upperSaved > measuredSaved,
      'upper bound saves strictly more on this fixture',
    )
    const straddle = measureBuild(input, arms, {
      thresholdPercent: (measuredSaved + upperSaved) / 2,
    })
    assert.strictEqual(armMeasurement(straddle, 'rename').lowConfidence, true)
    assert.strictEqual(
      armMeasurement(straddle, 'consolidate').lowConfidence,
      false,
      'the counterfactual is rename-specific',
    )
    const noStraddle = measureBuild(input, arms, {
      thresholdPercent: measuredSaved,
    })
    assert.strictEqual(
      armMeasurement(noStraddle, 'rename').lowConfidence,
      false,
    )
  })
})

describe('stylesheet qualification gate', () => {
  it('qualifies a stylesheet with a populated mapped utilities layer', () => {
    const coverage = computeStylesheetCoverage(inputFor(RENAME_SITE))
    assert.deepStrictEqual(coverage.qualifiedStylesheets, ['assets/app.css'])
    assert.strictEqual(coverage.utilitySelectors, 5)
    assert.strictEqual(coverage.mappedSelectors, 5)
    assert.strictEqual(coverage.unmappedSelectors, 0)
    assert.strictEqual(coverage.parseWarnings, 0)
    assert.strictEqual(coverage.confidence, 'full')
  })

  it('reports partial confidence when utility selectors fail to map', () => {
    const coverage = computeStylesheetCoverage(inputFor(MODEL_SITE))
    assert.deepStrictEqual(coverage.qualifiedStylesheets, ['assets/app.css'])
    assert.strictEqual(coverage.utilitySelectors, 11)
    assert.strictEqual(coverage.mappedSelectors, 9)
    assert.strictEqual(coverage.unmappedSelectors, 2)
    assert.strictEqual(coverage.confidence, 'partial')
  })

  it('reports partial confidence on CSS parse warnings alone', () => {
    const coverage = computeStylesheetCoverage(inputFor(SUPPORTS_PRELUDE_SITE))
    assert.ok(coverage.parseWarnings > 0)
    assert.strictEqual(coverage.confidence, 'partial')
    assert.deepStrictEqual(coverage.qualifiedStylesheets, [])
  })

  it('aborts measurement when no stylesheet has a utilities layer', () => {
    const input = inputFor(PLAIN_SITE)
    assert.throws(
      function () {
        measureBuild(input, armsFor(input), {})
      },
      function (error) {
        assert.ok(error instanceof NoQualifiedStylesheetError)
        assert.match(error.message, /no stylesheet qualifies/i)
        return true
      },
    )
  })

  it('aborts measurement when no stylesheet exists on disk', () => {
    const input = inputFor(MISSING_CSS_SITE)
    assert.throws(function () {
      measureBuild(input, armsFor(input), {})
    }, NoQualifiedStylesheetError)
  })
})

describe('input hashes', () => {
  it('records a SHA-256 hash per analyzed HTML and CSS file', () => {
    const input = inputFor(RENAME_SITE)
    const measurement = measureBuild(input, armsFor(input), {})
    const expected = input.build.htmlFiles
      .concat(input.build.cssFiles)
      .map(function (file) {
        return {
          file: path
            .relative(input.build.buildDir, file)
            .split(path.sep)
            .join('/'),
          sha256: createHash('sha256')
            .update(Buffer.from(fs.readFileSync(file, 'utf8'), 'utf8'))
            .digest('hex'),
        }
      })
      .sort(function (a, b) {
        if (a.file < b.file) return -1
        if (a.file > b.file) return 1
        return 0
      })
    assert.deepStrictEqual(measurement.inputHashes, expected)
    for (const hash of measurement.inputHashes) {
      assert.match(hash.sha256, /^[0-9a-f]{64}$/)
    }
  })
})

describe('repeatability (R10)', () => {
  it('produces identical measurements for identical input', () => {
    const first = measureFixture(RENAME_SITE)
    const second = measureFixture(RENAME_SITE)
    assert.deepStrictEqual(first, second)
  })
})

describe('dist measurement (read-only)', () => {
  it(
    'measures zero deltas and a positive upper bound on the real build',
    buildGate(),
    () => {
      assertDemoBuild()
      const measurement = measureFixture(BUILD_DIR)
      for (const arm of measurement.arms) {
        assert.strictEqual(arm.brotliDeltaBytes, 0, arm.arm)
        assert.strictEqual(arm.verdict, 'not-worth-it', arm.arm)
      }
      assert.ok(
        measurement.upperBoundRename.brotliDeltaBytes < 0,
        'upper bound shows a positive saving',
      )
      assert.ok(measurement.coverage.qualifiedStylesheets.length > 0)
      assert.ok(measurement.jsFilesOutOfScope > 0)
    },
  )
})
