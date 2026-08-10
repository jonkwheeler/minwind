import assert from 'node:assert'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import { chromium, type Browser } from 'playwright'
import {
  buildVariantEnv,
  compareDirs,
  evaluateGate,
  MIN_BROTLI_WIN_BYTES,
  MIN_CLASS_LENGTH_DROP_PERCENT,
  run,
  type GateInput,
} from '../harness/compare.js'
import { discoverPages } from '../harness/discover.js'
import {
  diffElementSnapshots,
  diffScreenshots,
  median,
  type ElementSnapshot,
} from '../harness/diff.js'

// U7 comparison harness (R6, R7, R8; KTD8). The pure comparison logic is
// tested against handcrafted inputs; the serve+crawl+compare pipeline is
// tested against static fixture sites with a real browser. No test in this
// file runs a real build — the end-to-end dogfood is `pnpm minwind-compare`.

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.join(HERE, '..')
const COMPARE_CLI = path.join(HERE, '..', 'harness', 'compare.ts')
const TSX_BIN = path.join(REPO_ROOT, 'node_modules', '.bin', 'tsx')
const SITE = path.join(HERE, 'fixtures', 'harness-site')
// harness-site-renamed renders pixel-identically to harness-site but with
// every class renamed to one or two characters, so comparing the pair
// exercises the passing side of the size/class-length gate.
const SITE_RENAMED = path.join(HERE, 'fixtures', 'harness-site-renamed')
const SITE_STYLE_DIFF = path.join(HERE, 'fixtures', 'harness-site-style-diff')
const SITE_CONSOLE_ERROR = path.join(
  HERE,
  'fixtures',
  'harness-site-console-error',
)

function routesOf(report: { routes: Array<{ route: string }> }) {
  return report.routes.map(function (route) {
    return route.route
  })
}

describe('discoverPages (KTD8)', function () {
  it('discovers nested routes from index.html files', function () {
    const pages = discoverPages(SITE)
    assert.deepStrictEqual(
      pages.map(function (page) {
        return page.route
      }),
      ['/', '/404.html', '/writing/slug/'],
    )
  })

  it('maps each route to its html file on disk', function () {
    const pages = discoverPages(SITE)
    const slug = pages.find(function (page) {
      return page.route === '/writing/slug/'
    })
    assert.ok(slug)
    assert.ok(
      slug.filePath.endsWith(path.join('writing', 'slug', 'index.html')),
      slug.filePath,
    )
    const root = pages.find(function (page) {
      return page.route === '/'
    })
    assert.ok(root)
    assert.ok(root.filePath.endsWith(path.join('harness-site', 'index.html')))
  })
})

function element(
  tag: string,
  styles: Record<string, string>,
  classLength: number | null = null,
): ElementSnapshot {
  return { tag, classLength, styles }
}

describe('diffElementSnapshots (R6, KTD8)', function () {
  it('reports no mismatches for identical snapshots', function () {
    const a = [element('DIV', { color: 'red', margin: '0px' })]
    assert.deepStrictEqual(
      diffElementSnapshots(a, [
        element('DIV', { color: 'red', margin: '0px' }),
      ]),
      [],
    )
  })

  it('names the offending property with both values', function () {
    const mismatches = diffElementSnapshots(
      [element('DIV', { color: 'rgb(1, 2, 3)', margin: '0px' })],
      [element('DIV', { color: 'rgb(4, 5, 6)', margin: '0px' })],
    )
    assert.deepStrictEqual(mismatches, [
      {
        kind: 'property',
        elementIndex: 0,
        property: 'color',
        off: 'rgb(1, 2, 3)',
        on: 'rgb(4, 5, 6)',
      },
    ])
  })

  it('reports every differing property on an element', function () {
    const mismatches = diffElementSnapshots(
      [element('P', { color: 'red', margin: '0px' })],
      [element('P', { color: 'blue', margin: '4px' })],
    )
    assert.deepStrictEqual(
      mismatches.map(function (mismatch) {
        return mismatch.property
      }),
      ['color', 'margin'],
    )
  })

  it('reports a tag mismatch without diffing its styles', function () {
    const mismatches = diffElementSnapshots(
      [element('DIV', { color: 'red' })],
      [element('SPAN', { color: 'red' })],
    )
    assert.deepStrictEqual(mismatches, [
      {
        kind: 'tag',
        elementIndex: 0,
        property: null,
        off: 'DIV',
        on: 'SPAN',
      },
    ])
  })

  it('reports an element-count mismatch and still diffs the shared prefix', function () {
    const mismatches = diffElementSnapshots(
      [element('DIV', { color: 'red' }), element('P', { margin: '0px' })],
      [element('DIV', { color: 'blue' })],
    )
    assert.deepStrictEqual(
      mismatches.map(function (mismatch) {
        return mismatch.kind
      }),
      ['element-count', 'property'],
    )
  })
})

function solidPng(
  width: number,
  height: number,
  rgba: [number, number, number, number],
): Buffer {
  const png = new PNG({ width, height })
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = rgba[0]
    png.data[i + 1] = rgba[1]
    png.data[i + 2] = rgba[2]
    png.data[i + 3] = rgba[3]
  }
  return PNG.sync.write(png)
}

function withPixel(
  source: Buffer,
  pixel: number,
  rgba: [number, number, number, number],
): Buffer {
  const png = PNG.sync.read(source)
  const offset = pixel * 4
  png.data[offset] = rgba[0]
  png.data[offset + 1] = rgba[1]
  png.data[offset + 2] = rgba[2]
  png.data[offset + 3] = rgba[3]
  return PNG.sync.write(png)
}

describe('diffScreenshots (KTD8 secondary tier)', function () {
  it('passes identical screenshots', function () {
    const a = solidPng(10, 10, [0, 0, 0, 255])
    const diff = diffScreenshots(a, solidPng(10, 10, [0, 0, 0, 255]))
    assert.strictEqual(diff.passed, true)
    assert.strictEqual(diff.differentPixels, 0)
    assert.strictEqual(diff.ratio, 0)
  })

  it('passes a sub-threshold channel difference', function () {
    const a = solidPng(10, 10, [0, 0, 0, 255])
    const b = solidPng(10, 10, [8, 8, 8, 255])
    const diff = diffScreenshots(a, b, {
      channelThreshold: 8,
      maxRatio: 0,
    })
    assert.strictEqual(diff.passed, true)
    assert.strictEqual(diff.differentPixels, 0)
  })

  it('passes a small number of different pixels under the ratio', function () {
    const a = solidPng(10, 10, [0, 0, 0, 255])
    const b = withPixel(a, 0, [255, 255, 255, 255])
    const diff = diffScreenshots(a, b, {
      channelThreshold: 8,
      maxRatio: 0.02,
    })
    assert.strictEqual(diff.passed, true)
    assert.strictEqual(diff.differentPixels, 1)
    assert.strictEqual(diff.ratio, 0.01)
  })

  it('fails when the different-pixel ratio exceeds the tolerance', function () {
    const a = solidPng(10, 10, [0, 0, 0, 255])
    const b = withPixel(a, 0, [255, 255, 255, 255])
    const diff = diffScreenshots(a, b, {
      channelThreshold: 8,
      maxRatio: 0.001,
    })
    assert.strictEqual(diff.passed, false)
    assert.strictEqual(diff.differentPixels, 1)
  })

  it('fails on a dimension mismatch', function () {
    const diff = diffScreenshots(
      solidPng(10, 10, [0, 0, 0, 255]),
      solidPng(12, 10, [0, 0, 0, 255]),
    )
    assert.strictEqual(diff.passed, false)
    assert.strictEqual(diff.dimensionsMatch, false)
  })
})

describe('median', function () {
  it('returns null for no values', function () {
    assert.strictEqual(median([]), null)
  })

  it('returns the middle value for an odd count', function () {
    assert.strictEqual(median([3, 1, 2]), 2)
  })

  it('averages the middle pair for an even count', function () {
    assert.strictEqual(median([1, 2, 3, 4]), 2.5)
  })
})

describe('compareDirs fixture sites (R7, KTD8)', function () {
  let browser: Browser

  before(async function () {
    browser = await chromium.launch()
  })

  after(async function () {
    await browser.close()
  })

  it(
    'renders identical outputs route-identical but fails the size gate',
    { timeout: 120000 },
    async function () {
      const report = await compareDirs(SITE, SITE, { browser })
      assert.deepStrictEqual(routesOf(report), [
        '/',
        '/404.html',
        '/writing/slug/',
      ])
      for (const route of report.routes) {
        assert.strictEqual(route.passed, true, route.route)
        assert.deepStrictEqual(route.styleMismatches, [])
        assert.strictEqual(route.screenshot.passed, true)
        assert.deepStrictEqual(route.loadConsoleErrors.off, [])
        assert.deepStrictEqual(route.loadConsoleErrors.on, [])
      }
      // The byte delta of a directory against itself is exactly zero.
      assert.strictEqual(report.sizes.brotliDeltaBytes, 0)
      assert.strictEqual(report.classLength.dropPercent, 0)
      // Every route passes, but a zero byte win and no class-length drop
      // mean the transform delivered nothing: the gate must fail (R7's
      // stop condition), and the failure kinds must name the size side.
      assert.strictEqual(report.passed, false)
      assert.deepStrictEqual(
        evaluateGate(report).failures.map(function (failure) {
          return failure.kind
        }),
        ['brotli-win', 'class-length'],
      )
    },
  )

  it(
    'passes the gate when the on build renames every class shorter',
    { timeout: 120000 },
    async function () {
      const report = await compareDirs(SITE, SITE_RENAMED, { browser })
      assert.strictEqual(
        report.passed,
        true,
        JSON.stringify(evaluateGate(report).failures),
      )
      assert.deepStrictEqual(routesOf(report), [
        '/',
        '/404.html',
        '/writing/slug/',
      ])
      for (const route of report.routes) {
        assert.strictEqual(route.passed, true, route.route)
        assert.deepStrictEqual(route.styleMismatches, [])
        assert.strictEqual(route.screenshot.passed, true)
      }
      assert.ok(
        report.sizes.brotliDeltaBytes <= -MIN_BROTLI_WIN_BYTES,
        `expected a strict brotli win, got ${report.sizes.brotliDeltaBytes} B`,
      )
      assert.ok(
        report.classLength.dropPercent !== null &&
          report.classLength.dropPercent >= MIN_CLASS_LENGTH_DROP_PERCENT,
        `expected a class-length drop of at least ` +
          `${MIN_CLASS_LENGTH_DROP_PERCENT}%, got ` +
          `${report.classLength.dropPercent}%`,
      )
    },
  )

  it(
    'closes a harness-owned browser when the server fails to start',
    { timeout: 120000 },
    async function () {
      let closed = false
      await assert.rejects(
        compareDirs(SITE, SITE, {
          serve: function () {
            return Promise.reject(new Error('fixture: server failed to start'))
          },
          launchBrowser: function () {
            // A fake keeps the regression test fast; before the cleanup
            // fix, close() was never reached on this path.
            return Promise.resolve({
              close: function () {
                closed = true
                return Promise.resolve()
              },
            } as unknown as Browser)
          },
        }),
        /fixture: server failed to start/,
      )
      assert.strictEqual(closed, true)
    },
  )

  it(
    'runs the interaction smoke pass per route',
    { timeout: 120000 },
    async function () {
      const report = await compareDirs(SITE, SITE, { browser })
      const index = report.routes.find(function (route) {
        return route.route === '/'
      })
      assert.ok(index)
      assert.deepStrictEqual(
        index.interactions.on.map(function (interaction) {
          return [interaction.name, interaction.status]
        }),
        [
          ['theme-toggle', 'passed'],
          ['client-navigation', 'passed'],
        ],
      )
      // Only the index fixture has a theme toggle; other routes skip it but
      // still perform the client-side navigation.
      const slug = report.routes.find(function (route) {
        return route.route === '/writing/slug/'
      })
      assert.ok(slug)
      assert.deepStrictEqual(
        slug.interactions.on.map(function (interaction) {
          return [interaction.name, interaction.status]
        }),
        [
          ['theme-toggle', 'skipped'],
          ['client-navigation', 'passed'],
        ],
      )
    },
  )

  it(
    'fails the gate on an injected style difference and names the property',
    { timeout: 120000 },
    async function () {
      const report = await compareDirs(SITE, SITE_STYLE_DIFF, { browser })
      assert.strictEqual(report.passed, false)
      const index = report.routes.find(function (route) {
        return route.route === '/'
      })
      assert.ok(index)
      assert.strictEqual(index.passed, false)
      const named = index.styleMismatches.filter(function (mismatch) {
        return mismatch.property === 'background-color'
      })
      assert.ok(
        named.length > 0,
        'expected a background-color mismatch: ' +
          JSON.stringify(index.styleMismatches.slice(0, 5)),
      )
      // rgb(1,2,3) vs rgb(4,5,6) is below the screenshot tolerance: the
      // computed-style tier catches what the pixel tier cannot.
      assert.strictEqual(index.screenshot.passed, true)
    },
  )

  it(
    'fails the gate on a console error and attributes it to the route',
    { timeout: 120000 },
    async function () {
      const report = await compareDirs(SITE, SITE_CONSOLE_ERROR, { browser })
      assert.strictEqual(report.passed, false)
      const slug = report.routes.find(function (route) {
        return route.route === '/writing/slug/'
      })
      assert.ok(slug)
      assert.strictEqual(slug.passed, false)
      assert.deepStrictEqual(slug.loadConsoleErrors.off, [])
      assert.ok(
        slug.loadConsoleErrors.on.some(function (message) {
          return message.includes('fixture console error')
        }),
        JSON.stringify(slug.loadConsoleErrors.on),
      )
      const index = report.routes.find(function (route) {
        return route.route === '/'
      })
      assert.ok(index)
      assert.strictEqual(index.passed, true)
    },
  )
})

function gateInput(overrides: {
  brotliDeltaBytes?: number
  dropPercent?: number | null
  missingRoutes?: { offOnly: Array<string>; onOnly: Array<string> }
  routePassed?: boolean
}): GateInput {
  return {
    missingRoutes: overrides.missingRoutes ?? { offOnly: [], onOnly: [] },
    routes: [{ route: '/', passed: overrides.routePassed ?? true }],
    classLength: {
      offMedian: 40,
      onMedian: 10,
      dropPercent:
        overrides.dropPercent === undefined ? 75 : overrides.dropPercent,
      offElements: 8,
      onElements: 8,
    },
    sizes: {
      off: { files: 4, rawBytes: 2400, gzipBytes: 1280, brotliBytes: 900 },
      on: { files: 4, rawBytes: 2200, gzipBytes: 1200, brotliBytes: 830 },
      rawDeltaBytes: -200,
      brotliDeltaBytes: overrides.brotliDeltaBytes ?? -70,
      brotliDeltaPercent: -7.5,
    },
  }
}

function failureKinds(input: GateInput): Array<string> {
  return evaluateGate(input).failures.map(function (failure) {
    return failure.kind
  })
}

describe('evaluateGate (R7 gate thresholds)', function () {
  it('passes when routes pass, brotli wins, and classes shrink enough', function () {
    const verdict = evaluateGate(gateInput({}))
    assert.strictEqual(verdict.passed, true)
    assert.deepStrictEqual(verdict.failures, [])
  })

  it('fails on a zero brotli delta even when every route passes', function () {
    const verdict = evaluateGate(gateInput({ brotliDeltaBytes: 0 }))
    assert.strictEqual(verdict.passed, false)
    assert.deepStrictEqual(failureKinds(gateInput({ brotliDeltaBytes: 0 })), [
      'brotli-win',
    ])
  })

  it('fails on a negative brotli win (the on build is larger)', function () {
    const verdict = evaluateGate(gateInput({ brotliDeltaBytes: 12 }))
    assert.strictEqual(verdict.passed, false)
    assert.deepStrictEqual(failureKinds(gateInput({ brotliDeltaBytes: 12 })), [
      'brotli-win',
    ])
  })

  it('passes the brotli condition at exactly the minimum win', function () {
    const verdict = evaluateGate(
      gateInput({ brotliDeltaBytes: -MIN_BROTLI_WIN_BYTES }),
    )
    assert.strictEqual(verdict.passed, true)
  })

  it('fails when the class-length drop is below the threshold', function () {
    const below = MIN_CLASS_LENGTH_DROP_PERCENT - 0.01
    const verdict = evaluateGate(gateInput({ dropPercent: below }))
    assert.strictEqual(verdict.passed, false)
    assert.deepStrictEqual(failureKinds(gateInput({ dropPercent: below })), [
      'class-length',
    ])
  })

  it('passes the class-length condition at exactly the threshold', function () {
    const verdict = evaluateGate(
      gateInput({ dropPercent: MIN_CLASS_LENGTH_DROP_PERCENT }),
    )
    assert.strictEqual(verdict.passed, true)
  })

  it('fails when no class-length median could be measured', function () {
    const verdict = evaluateGate(gateInput({ dropPercent: null }))
    assert.strictEqual(verdict.passed, false)
    assert.deepStrictEqual(failureKinds(gateInput({ dropPercent: null })), [
      'class-length',
    ])
  })

  it('names missing routes and rendering failures distinctly', function () {
    const kinds = failureKinds(
      gateInput({
        missingRoutes: { offOnly: ['/a'], onOnly: [] },
        routePassed: false,
      }),
    )
    assert.deepStrictEqual(kinds, ['missing-routes', 'route-rendering'])
  })

  it('lists every failed condition, not just the first', function () {
    const verdict = evaluateGate(
      gateInput({
        brotliDeltaBytes: 0,
        dropPercent: 10,
        routePassed: false,
      }),
    )
    assert.strictEqual(verdict.passed, false)
    assert.deepStrictEqual(
      verdict.failures.map(function (failure) {
        return failure.kind
      }),
      ['route-rendering', 'brotli-win', 'class-length'],
    )
  })
})

describe('buildVariantEnv (pinned sub-flags)', function () {
  it('drops ambient MINWIND_RENAME/CONSOLIDATE from both variants', function () {
    const ambient = {
      PATH: '/usr/bin',
      MINWIND: 'off',
      MINWIND_RENAME: 'off',
      MINWIND_CONSOLIDATE: 'off',
    }
    for (const mode of ['off', 'on'] as const) {
      const env = buildVariantEnv(ambient, mode)
      assert.strictEqual(env.MINWIND, mode)
      assert.strictEqual(env.MINWIND_RENAME, undefined)
      assert.strictEqual(env.MINWIND_CONSOLIDATE, undefined)
      assert.strictEqual(env.PATH, '/usr/bin')
    }
  })

  it('does not mutate the ambient environment', function () {
    const ambient = { MINWIND_RENAME: 'off' }
    buildVariantEnv(ambient, 'on')
    assert.deepStrictEqual(ambient, { MINWIND_RENAME: 'off' })
  })

  it('pins a clean default when no sub-flags are set', function () {
    const env = buildVariantEnv({ PATH: '/usr/bin' }, 'on')
    assert.deepStrictEqual(env, { PATH: '/usr/bin', MINWIND: 'on' })
  })
})

describe('run (site-build timeout)', function () {
  it('resolves when the command exits 0', async function () {
    await run(process.execPath, ['-e', 'process.exit(0)'], {
      cwd: REPO_ROOT,
      env: {},
      timeoutMs: 30000,
    })
  })

  it('rejects with the exit code on a nonzero exit', async function () {
    await assert.rejects(
      run(process.execPath, ['-e', 'process.exit(3)'], {
        cwd: REPO_ROOT,
        env: {},
        timeoutMs: 30000,
      }),
      /exited with code 3/,
    )
  })

  it(
    'fails with a timeout error instead of hanging',
    { timeout: 30000 },
    async function () {
      const started = Date.now()
      await assert.rejects(
        run(process.execPath, ['-e', 'setTimeout(function () {}, 60000)'], {
          cwd: REPO_ROOT,
          env: {},
          timeoutMs: 250,
        }),
        /timed out after 250ms/,
      )
      assert.ok(
        Date.now() - started < 10000,
        'the timeout did not fail the run promptly',
      )
    },
  )
})

interface CliResult {
  code: number | null
  stdout: string
  stderr: string
}

// Spawns the real minwind-compare CLI against fixture directories, never a
// build. The exit-code contract: 0 gate passed, 1 gate ran and failed,
// 2 usage/harness error.
function runCli(args: Array<string>): Promise<CliResult> {
  return new Promise(function (resolve, reject) {
    const child = spawn(TSX_BIN, [COMPARE_CLI, ...args], {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const stdout: Array<Buffer> = []
    const stderr: Array<Buffer> = []
    child.stdout.on('data', function (chunk: Buffer) {
      stdout.push(chunk)
    })
    child.stderr.on('data', function (chunk: Buffer) {
      stderr.push(chunk)
    })
    child.on('error', reject)
    child.on('close', function (code) {
      resolve({
        code,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      })
    })
  })
}

describe('minwind-compare CLI', function () {
  it(
    'exits 0 with the JSON report for a passing comparison',
    { timeout: 240000 },
    async function () {
      const result = await runCli([
        '--off-dir',
        SITE,
        '--on-dir',
        SITE_RENAMED,
        '--json',
      ])
      assert.strictEqual(
        result.code,
        0,
        `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
      )
      const report = JSON.parse(result.stdout) as {
        compare: {
          passed: boolean
          routes: Array<{ route: string; passed: boolean }>
          classLength: { dropPercent: number | null }
          sizes: { brotliDeltaBytes: number }
        }
        builds: { offMs: number | null; onMs: number | null }
        wallClockMs: number
      }
      assert.strictEqual(report.compare.passed, true)
      assert.deepStrictEqual(
        report.compare.routes.map(function (route) {
          return route.route
        }),
        ['/', '/404.html', '/writing/slug/'],
      )
      for (const route of report.compare.routes) {
        assert.strictEqual(route.passed, true, route.route)
      }
      assert.ok(
        report.compare.sizes.brotliDeltaBytes <= -MIN_BROTLI_WIN_BYTES,
        `expected a strict brotli win, got ` +
          `${report.compare.sizes.brotliDeltaBytes} B`,
      )
      assert.ok(
        report.compare.classLength.dropPercent !== null &&
          report.compare.classLength.dropPercent >=
            MIN_CLASS_LENGTH_DROP_PERCENT,
      )
      // Existing directories were compared, so no builds ran.
      assert.deepStrictEqual(report.builds, { offMs: null, onMs: null })
    },
  )

  it(
    'exits 1 and names the failed gate conditions when the gate fails',
    { timeout: 240000 },
    async function () {
      // A directory against itself renders identically but delivers no
      // byte win or class-length drop: the gate runs and fails on size.
      const result = await runCli(['--off-dir', SITE, '--on-dir', SITE])
      assert.strictEqual(
        result.code,
        1,
        `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
      )
      assert.ok(result.stdout.includes('minwind-compare: FAIL'), result.stdout)
      assert.ok(result.stdout.includes('[brotli-win]'), result.stdout)
      assert.ok(result.stdout.includes('[class-length]'), result.stdout)
    },
  )

  it('exits 2 with usage on stderr for an unknown option', async function () {
    const result = await runCli(['--nope'])
    assert.strictEqual(result.code, 2)
    assert.ok(result.stderr.includes('Error: unknown option: --nope'))
    assert.ok(result.stderr.includes('Usage: pnpm compare'))
  })

  it('exits 2 with usage on stderr for an unpaired directory flag', async function () {
    const result = await runCli(['--off-dir', SITE])
    assert.strictEqual(result.code, 2)
    assert.ok(
      result.stderr.includes('--off-dir and --on-dir must be given together'),
    )
    assert.ok(result.stderr.includes('Usage: pnpm compare'))
  })

  it('exits 2 with usage on stderr for a bad --build-timeout value', async function () {
    const result = await runCli(['--build-timeout', 'later'])
    assert.strictEqual(result.code, 2)
    assert.ok(result.stderr.includes('--build-timeout'))
    assert.ok(result.stderr.includes('Usage: pnpm compare'))
  })

  it(
    'exits 2 with usage on stderr for a nonexistent compared directory',
    { timeout: 60000 },
    async function () {
      const missing = path.join(HERE, 'fixtures', 'does-not-exist')
      const result = await runCli(['--off-dir', missing, '--on-dir', SITE])
      assert.strictEqual(result.code, 2)
      assert.ok(
        result.stderr.includes(`--off-dir does not exist: ${missing}`),
        result.stderr,
      )
      assert.ok(result.stderr.includes('Usage: pnpm compare'))
    },
  )
})
