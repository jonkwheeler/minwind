import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium, type Browser } from 'playwright'
import { deltaPercent } from '../src/measure/measure.js'
import {
  crawlSite,
  DEFAULT_CRAWL_OPTIONS,
  type CrawledPage,
  type CrawlOptions,
  type InteractionResult,
} from './crawl.js'
import {
  DEFAULT_SCREENSHOT_TOLERANCE,
  diffElementSnapshots,
  diffScreenshots,
  median,
  type ScreenshotDiff,
  type ScreenshotTolerance,
  type StyleMismatch,
} from './diff.js'
import { discoverPages, type DiscoveredPage } from './discover.js'
import { measureSiteSizes, type SiteSizes } from './measure.js'
import { serveStatic } from './serve.js'

// U7 comparison harness (R6, R7, R8; KTD8): two clean builds
// (MINWIND=off vs on) into separate directories, both served statically
// from one origin, every prerendered page crawled with Playwright. Primary
// tier: per-element computed-style equality (names the offending property).
// Secondary tier: screenshot comparison at a small tolerance. Hydration
// tier: zero console errors. Interaction smoke pass: theme toggle plus one
// client-side navigation per route. Measurement: median class-attribute
// length from the crawled DOM and the realized whole-site Brotli delta in
// minwind's scope and compression profile. Local gate only — not CI.

export interface RouteComparison {
  route: string
  passed: boolean
  elements: { off: number; on: number }
  styleMismatches: Array<StyleMismatch>
  screenshot: ScreenshotDiff
  loadConsoleErrors: { off: Array<string>; on: Array<string> }
  interactionConsoleErrors: { off: Array<string>; on: Array<string> }
  interactions: { off: Array<InteractionResult>; on: Array<InteractionResult> }
}

export interface ClassLengthSummary {
  offMedian: number | null
  onMedian: number | null
  // Positive when the on build's median is shorter.
  dropPercent: number | null
  offElements: number
  onElements: number
}

export interface SizeSummary {
  off: SiteSizes
  on: SiteSizes
  rawDeltaBytes: number
  brotliDeltaBytes: number
  // Negative when the on build is smaller.
  brotliDeltaPercent: number
}

export interface CompareReport {
  passed: boolean
  offDir: string
  onDir: string
  routes: Array<RouteComparison>
  missingRoutes: { offOnly: Array<string>; onOnly: Array<string> }
  classLength: ClassLengthSummary
  sizes: SizeSummary
  durationMs: number
}

// The on build must beat the off build's whole-site Brotli total by at
// least one byte: a zero or negative delta means the transform delivered
// nothing and the plan's stop condition trips.
export const MIN_BROTLI_WIN_BYTES = 1

// The crawled DOM's median class-attribute length must shrink by at least
// this much. The dogfooded site achieves ~75%; 50% leaves headroom for
// markup drift without letting a no-op rename through.
export const MIN_CLASS_LENGTH_DROP_PERCENT = 50

// Every condition the gate enforces, so a report can name exactly which
// one failed (a size/class-length miss reads differently from a rendering
// regression).
export interface GateFailure {
  kind: 'missing-routes' | 'route-rendering' | 'brotli-win' | 'class-length'
  detail: string
}

export interface GateVerdict {
  passed: boolean
  failures: Array<GateFailure>
}

// The structural minimum the gate reads. CompareReport satisfies it
// directly; tests construct it literally.
export interface GateInput {
  missingRoutes: { offOnly: Array<string>; onOnly: Array<string> }
  routes: Array<Pick<RouteComparison, 'route' | 'passed'>>
  classLength: ClassLengthSummary
  sizes: SizeSummary
}

export function evaluateGate(report: GateInput): GateVerdict {
  const failures: Array<GateFailure> = []
  const missing = [
    ...report.missingRoutes.offOnly,
    ...report.missingRoutes.onOnly,
  ]
  if (missing.length > 0) {
    failures.push({
      kind: 'missing-routes',
      detail: `routes present in only one build: ${missing.join(', ')}`,
    })
  }
  const failedRoutes = report.routes.filter(function (route) {
    return !route.passed
  })
  if (failedRoutes.length > 0) {
    failures.push({
      kind: 'route-rendering',
      detail:
        'routes failing style/screenshot/console/interaction checks: ' +
        failedRoutes
          .map(function (route) {
            return route.route
          })
          .join(', '),
    })
  }
  if (report.sizes.brotliDeltaBytes > -MIN_BROTLI_WIN_BYTES) {
    failures.push({
      kind: 'brotli-win',
      detail:
        `whole-site brotli delta ${report.sizes.brotliDeltaBytes} B ` +
        `(needs a win of at least ${MIN_BROTLI_WIN_BYTES} B)`,
    })
  }
  if (
    report.classLength.dropPercent === null ||
    report.classLength.dropPercent < MIN_CLASS_LENGTH_DROP_PERCENT
  ) {
    failures.push({
      kind: 'class-length',
      detail:
        `median class-length drop ` +
        `${
          report.classLength.dropPercent === null
            ? 'n/a'
            : `${report.classLength.dropPercent.toFixed(2)}%`
        } ` +
        `(needs at least ${MIN_CLASS_LENGTH_DROP_PERCENT}%)`,
    })
  }
  return { passed: failures.length === 0, failures }
}

export interface CompareDirsOptions {
  // Tests share one browser across compareDirs calls; the CLI lets the
  // harness launch and close its own.
  browser?: Browser
  crawl?: Partial<CrawlOptions>
  screenshotTolerance?: ScreenshotTolerance
  // Test seams for the harness-owned resources: a rejecting serve() forces
  // a server-startup failure, and launchBrowser observes (or fakes) the
  // browser the harness would launch, without port or process tricks.
  serve?: typeof serveStatic
  launchBrowser?: () => Promise<Browser>
}

function routePassed(route: RouteComparison): boolean {
  const interactionsOk = [
    ...route.interactions.off,
    ...route.interactions.on,
  ].every(function (interaction) {
    return interaction.status !== 'failed'
  })
  return (
    route.styleMismatches.length === 0 &&
    route.screenshot.passed &&
    route.loadConsoleErrors.off.length === 0 &&
    route.loadConsoleErrors.on.length === 0 &&
    route.interactionConsoleErrors.off.length === 0 &&
    route.interactionConsoleErrors.on.length === 0 &&
    interactionsOk
  )
}

function classLengths(crawl: Array<CrawledPage>): Array<number> {
  const lengths: Array<number> = []
  for (const page of crawl) {
    for (const element of page.elements) {
      if (element.classLength !== null) lengths.push(element.classLength)
    }
  }
  return lengths
}

export async function compareDirs(
  offDirInput: string,
  onDirInput: string,
  options: CompareDirsOptions = {},
): Promise<CompareReport> {
  const started = Date.now()
  const offDir = path.resolve(offDirInput)
  const onDir = path.resolve(onDirInput)

  const offPages = discoverPages(offDir)
  const onPages = discoverPages(onDir)
  if (offPages.length === 0) {
    throw new Error(`minwind-compare: no prerendered pages discovered in ${offDir}`)
  }
  if (onPages.length === 0) {
    throw new Error(`minwind-compare: no prerendered pages discovered in ${onDir}`)
  }

  const onByRoute = new Map(
    onPages.map(function (page) {
      return [page.route, page] as const
    }),
  )
  const offRoutes = new Set(
    offPages.map(function (page) {
      return page.route
    }),
  )
  const missingRoutes = {
    offOnly: offPages
      .filter(function (page) {
        return !onByRoute.has(page.route)
      })
      .map(function (page) {
        return page.route
      }),
    onOnly: onPages
      .filter(function (page) {
        return !offRoutes.has(page.route)
      })
      .map(function (page) {
        return page.route
      }),
  }
  const sharedOff = offPages.filter(function (page) {
    return onByRoute.has(page.route)
  })
  const sharedOn: Array<DiscoveredPage> = []
  for (const page of sharedOff) {
    const onPage = onByRoute.get(page.route)
    if (onPage !== undefined) sharedOn.push(onPage)
  }

  const crawlOptions: CrawlOptions = {
    ...DEFAULT_CRAWL_OPTIONS,
    ...options.crawl,
  }
  const tolerance = options.screenshotTolerance ?? DEFAULT_SCREENSHOT_TOLERANCE

  const ownBrowser = options.browser === undefined
  const launchBrowser =
    options.launchBrowser ??
    function () {
      return chromium.launch()
    }
  const serve = options.serve ?? serveStatic
  const browser = options.browser ?? (await launchBrowser())
  // The server is acquired inside the browser's try/finally: a server
  // startup failure must still close a browser this call launched.
  let offCrawl: Array<CrawledPage>
  let onCrawl: Array<CrawledPage>
  try {
    const server = await serve(offDir)
    try {
      offCrawl = await crawlSite(
        browser,
        server.origin,
        sharedOff,
        crawlOptions,
      )
      server.setRoot(onDir)
      onCrawl = await crawlSite(browser, server.origin, sharedOn, crawlOptions)
    } finally {
      await server.close()
    }
  } finally {
    if (ownBrowser) await browser.close()
  }

  const routes: Array<RouteComparison> = []
  for (let i = 0; i < sharedOff.length; i++) {
    const off = offCrawl[i]
    const on = onCrawl[i]
    const comparison: RouteComparison = {
      route: sharedOff[i].route,
      passed: false,
      elements: { off: off.elements.length, on: on.elements.length },
      styleMismatches: diffElementSnapshots(off.elements, on.elements),
      screenshot: diffScreenshots(off.screenshot, on.screenshot, tolerance),
      loadConsoleErrors: {
        off: off.loadConsoleErrors,
        on: on.loadConsoleErrors,
      },
      interactionConsoleErrors: {
        off: off.interactionConsoleErrors,
        on: on.interactionConsoleErrors,
      },
      interactions: { off: off.interactions, on: on.interactions },
    }
    comparison.passed = routePassed(comparison)
    routes.push(comparison)
  }

  const offLengths = classLengths(offCrawl)
  const onLengths = classLengths(onCrawl)
  const offMedian = median(offLengths)
  const onMedian = median(onLengths)
  const dropPercent =
    offMedian === null || offMedian === 0 || onMedian === null
      ? null
      : ((offMedian - onMedian) / offMedian) * 100

  const offSizes = measureSiteSizes(offDir)
  const onSizes = measureSiteSizes(onDir)
  const brotliDeltaBytes = onSizes.brotliBytes - offSizes.brotliBytes
  const brotliDeltaPercent = deltaPercent(
    onSizes.brotliBytes,
    offSizes.brotliBytes,
  )

  const report: CompareReport = {
    passed: false,
    offDir,
    onDir,
    routes,
    missingRoutes,
    classLength: {
      offMedian,
      onMedian,
      dropPercent,
      offElements: offLengths.length,
      onElements: onLengths.length,
    },
    sizes: {
      off: offSizes,
      on: onSizes,
      rawDeltaBytes: onSizes.rawBytes - offSizes.rawBytes,
      brotliDeltaBytes,
      brotliDeltaPercent,
    },
    durationMs: Date.now() - started,
  }
  report.passed = evaluateGate(report).passed
  return report
}

// ---------------------------------------------------------------------------
// CLI: build orchestration, minwind projection, and report rendering.

const HERE = path.dirname(fileURLToPath(import.meta.url))

const USAGE = `Usage: pnpm compare [options]

Builds the demo site twice (MINWIND=off vs on), serves both outputs
statically, and gates on computed-style-identical rendering across every
prerendered route, screenshot equality at a small tolerance, zero console
errors, working interactions (theme toggle plus one client-side navigation
per route), and the realized byte win (R7, KTD8). Local gate only — not CI.

Options:
  --site <path>         The site to build (default: examples/demo)
  --off-dir <path>      Skip the off build; compare an existing output
                        directory
  --on-dir <path>       Skip the on build; compare an existing output
                        directory
  --json                Emit the full report as JSON instead of text
  --build-timeout <ms>  Kill a site build that runs longer than this
                        (default 600000; env MINWIND_COMPARE_BUILD_TIMEOUT_MS)
  --help                Show this message

With no options, both builds run sequentially into
node_modules/.cache/minwind-compare/{off,on} (pnpm build wipes .output, so the
off output must live outside it). --off-dir and --on-dir must be given
together.

Exit codes:
  0  the gate passed
  1  the gate ran and failed
  2  usage, build, or harness error (the gate never completed)
`

interface CliOptions {
  site: string | null
  offDir: string | null
  onDir: string | null
  json: boolean
  buildTimeoutMs: number
}

// Site builds are allowed to be slow, but not unbounded: pnpm build hangs
// (a stuck vinxi worker, a dev-server port claim) would otherwise block the
// harness forever.
export const DEFAULT_BUILD_TIMEOUT_MS = 600000

const BUILD_TIMEOUT_ENV = 'MINWIND_COMPARE_BUILD_TIMEOUT_MS'

function usageError(message: string): never {
  process.stderr.write(`Error: ${message}\n\n${USAGE}`)
  process.exit(2)
}

function parseTimeout(value: string, source: string): number {
  if (!/^\d+$/.test(value)) {
    usageError(`${source} must be a non-negative integer, got "${value}"`)
  }
  return Number(value)
}

export function parseArgs(argv: Array<string>): CliOptions {
  let site: string | null = null
  let offDir: string | null = null
  let onDir: string | null = null
  let json = false
  let buildTimeoutMs = DEFAULT_BUILD_TIMEOUT_MS
  const envTimeout = process.env[BUILD_TIMEOUT_ENV]
  if (envTimeout !== undefined) {
    buildTimeoutMs = parseTimeout(envTimeout, BUILD_TIMEOUT_ENV)
  }

  let i = 0
  while (i < argv.length) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(USAGE)
      process.exit(0)
    } else if (arg === '--json') {
      json = true
      i += 1
    } else if (arg === '--site') {
      const value = argv[i + 1]
      if (value === undefined) usageError('--site requires a value')
      site = value
      i += 2
    } else if (arg.startsWith('--site=')) {
      site = arg.slice('--site='.length)
      i += 1
    } else if (arg === '--off-dir' || arg === '--on-dir') {
      const value = argv[i + 1]
      if (value === undefined) usageError(`${arg} requires a value`)
      if (arg === '--off-dir') offDir = value
      else onDir = value
      i += 2
    } else if (arg.startsWith('--off-dir=')) {
      offDir = arg.slice('--off-dir='.length)
      i += 1
    } else if (arg.startsWith('--on-dir=')) {
      onDir = arg.slice('--on-dir='.length)
      i += 1
    } else if (arg === '--build-timeout') {
      const value = argv[i + 1]
      if (value === undefined) usageError('--build-timeout requires a value')
      buildTimeoutMs = parseTimeout(value, '--build-timeout')
      i += 2
    } else if (arg.startsWith('--build-timeout=')) {
      buildTimeoutMs = parseTimeout(
        arg.slice('--build-timeout='.length),
        '--build-timeout',
      )
      i += 1
    } else {
      usageError(`unknown option: ${arg}`)
    }
  }

  if ((offDir === null) !== (onDir === null)) {
    usageError('--off-dir and --on-dir must be given together')
  }
  return { site, offDir, onDir, json, buildTimeoutMs }
}

// The build spawns grandchildren (pnpm -> vinxi -> vite), so the child is
// its own process-group leader and a timeout kills the whole group; a lone
// child.kill() would orphan a still-running build.
function killProcessTree(child: ChildProcess): void {
  if (child.pid !== undefined) {
    try {
      process.kill(-child.pid, 'SIGKILL')
      return
    } catch {
      // The group is gone (or the platform has no process groups); fall
      // back to signalling the direct child.
    }
  }
  child.kill('SIGKILL')
}

// Exported for tests: a sleeping command must fail with the timeout error,
// not hang the harness.
export function run(
  command: string,
  args: Array<string>,
  options: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number },
): Promise<void> {
  return new Promise(function (resolve, reject) {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: 'inherit',
      detached: true,
    })
    const timer = setTimeout(function () {
      killProcessTree(child)
      reject(
        new Error(
          `${command} ${args.join(' ')} timed out after ` +
            `${options.timeoutMs}ms (killed the build process group)`,
        ),
      )
    }, options.timeoutMs)
    // A detached child leaves the terminal's process group, so Ctrl-C no
    // longer reaches it on its own: forward the interrupt as a group kill.
    const onSigint = function () {
      killProcessTree(child)
      process.exit(130)
    }
    process.once('SIGINT', onSigint)
    child.on('error', function (error) {
      clearTimeout(timer)
      process.removeListener('SIGINT', onSigint)
      reject(error)
    })
    child.on('close', function (code) {
      clearTimeout(timer)
      process.removeListener('SIGINT', onSigint)
      if (code === 0) resolve()
      else
        reject(
          new Error(
            `${command} ${args.join(' ')} exited with code ${code ?? 'null'}`,
          ),
        )
    })
  })
}

function capture(
  command: string,
  args: Array<string>,
  options: { cwd: string; timeoutMs: number },
): Promise<string> {
  return new Promise(function (resolve, reject) {
    const child = spawn(command, args, {
      cwd: options.cwd,
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
    const timer = setTimeout(function () {
      child.kill()
      reject(
        new Error(
          `${command} ${args.join(' ')} timed out after ${options.timeoutMs}ms`,
        ),
      )
    }, options.timeoutMs)
    child.on('error', function (error) {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', function (code) {
      clearTimeout(timer)
      if (code === 0) {
        resolve(Buffer.concat(stdout).toString('utf8'))
      } else {
        reject(
          new Error(
            `${command} ${args.join(' ')} exited with code ${code ?? 'null'}: ` +
              Buffer.concat(stderr).toString('utf8').slice(0, 500),
          ),
        )
      }
    })
  })
}

// Builds the environment for one variant build. The sub-flags are removed
// rather than inherited: an ambient MINWIND_RENAME=off (or an invalid
// value, which the plugin rejects) would otherwise leak into BOTH variants
// and compare off-vs-off. Unset means on for the plugin, and the master
// MINWIND=off still wins for the off build, so each variant differs
// from a clean default exactly by MINWIND=on|off.
export function buildVariantEnv(
  base: NodeJS.ProcessEnv,
  mode: 'off' | 'on',
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base }
  delete env.MINWIND_RENAME
  delete env.MINWIND_CONSOLIDATE
  env.MINWIND = mode
  return env
}

// One clean build whose prerendered output is moved aside to targetDir.
// .output is removed first (and vinxi wipes it again) so each variant is a
// from-scratch build (KTD8).
async function buildVariant(
  mode: 'off' | 'on',
  siteDir: string,
  targetDir: string,
  timeoutMs: number,
): Promise<number> {
  const started = Date.now()
  await rm(path.join(siteDir, '.output'), { recursive: true, force: true })
  await run('pnpm', ['build'], {
    cwd: siteDir,
    env: buildVariantEnv(process.env, mode),
    timeoutMs,
  })
  const publicDir = path.join(siteDir, '.output', 'public')
  if (!fs.existsSync(publicDir)) {
    throw new Error(
      `minwind-compare: the ${mode} build produced no .output/public directory`,
    )
  }
  await rm(targetDir, { recursive: true, force: true })
  await mkdir(path.dirname(targetDir), { recursive: true })
  await rename(publicDir, targetDir)
  return Date.now() - started
}

export interface UpperBoundMeasurement {
  renameArmPercent: number
  upperBoundPercent: number
}

// The projected deltas come from the minwind CLI itself, pointed at the
// off output (R7's "measurably cleaner DOM ... realized byte win" pairs the
// realized delta with the projection). Best-effort: the realized numbers
// above are the gate; a projection failure only downgrades the report.
async function measureUpperBound(
  offDir: string,
  repoRoot: string,
): Promise<UpperBoundMeasurement | null> {
  const tsxBin = path.join(repoRoot, 'node_modules', '.bin', 'tsx')
  if (!fs.existsSync(tsxBin)) return null
  try {
    const stdout = await capture(
      tsxBin,
      [path.join('src', 'measure', 'cli.ts'), offDir, '--json'],
      { cwd: repoRoot, timeoutMs: 180000 },
    )
    const report = JSON.parse(stdout) as {
      measurement?: {
        arms?: Array<{ arm?: string; brotliDeltaPercent?: number }>
        upperBoundRename?: { brotliDeltaPercent?: number }
      } | null
    }
    const measurement = report.measurement
    const renameArm = measurement?.arms?.find(function (arm) {
      return arm.arm === 'rename'
    })
    const upperBoundPercent = measurement?.upperBoundRename?.brotliDeltaPercent
    if (
      renameArm?.brotliDeltaPercent === undefined ||
      upperBoundPercent === undefined
    ) {
      return null
    }
    return {
      renameArmPercent: renameArm.brotliDeltaPercent,
      upperBoundPercent,
    }
  } catch {
    return null
  }
}

interface HarnessReport {
  compare: CompareReport
  builds: { offMs: number | null; onMs: number | null }
  upperBound: UpperBoundMeasurement | null
  wallClockMs: number
}

function formatGrouped(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function formatSignedPercent(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
}

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, '0')}`
}

function interactionSummary(route: RouteComparison): string {
  const all = [...route.interactions.off, ...route.interactions.on]
  const passed = all.filter(function (interaction) {
    return interaction.status === 'passed'
  }).length
  const skipped = all.filter(function (interaction) {
    return interaction.status === 'skipped'
  }).length
  const failed = all.filter(function (interaction) {
    return interaction.status === 'failed'
  }).length
  return `${passed} passed, ${skipped} skipped, ${failed} failed`
}

function renderRoute(route: RouteComparison): Array<string> {
  const status = route.passed ? 'PASS' : 'FAIL'
  const screenshotPercent = (route.screenshot.ratio * 100).toFixed(4)
  const consoleErrors =
    route.loadConsoleErrors.off.length +
    route.loadConsoleErrors.on.length +
    route.interactionConsoleErrors.off.length +
    route.interactionConsoleErrors.on.length
  const lines = [
    `  ${route.route}  ${status}  elements ${route.elements.off}, ` +
      `style mismatches ${route.styleMismatches.length}, ` +
      `screenshot diff ${screenshotPercent}%` +
      `${route.screenshot.dimensionsMatch ? '' : ' (dimensions differ)'}, ` +
      `console errors ${consoleErrors}, ` +
      `interactions: ${interactionSummary(route)}`,
  ]
  for (const mismatch of route.styleMismatches.slice(0, 10)) {
    if (mismatch.kind === 'element-count') {
      lines.push(`    elements: off has ${mismatch.off}, on has ${mismatch.on}`)
    } else if (mismatch.kind === 'tag') {
      lines.push(
        `    element #${mismatch.elementIndex}: tag ${mismatch.off} -> ${mismatch.on}`,
      )
    } else {
      lines.push(
        `    element #${mismatch.elementIndex} ${mismatch.property}: ` +
          `"${mismatch.off}" -> "${mismatch.on}"`,
      )
    }
  }
  if (route.styleMismatches.length > 10) {
    lines.push(
      `    ... and ${route.styleMismatches.length - 10} more style mismatches`,
    )
  }
  for (const side of ['off', 'on'] as const) {
    for (const error of route.loadConsoleErrors[side]) {
      lines.push(`    console error (${side}, load): ${error}`)
    }
    for (const error of route.interactionConsoleErrors[side]) {
      lines.push(`    console error (${side}, interaction): ${error}`)
    }
    for (const interaction of route.interactions[side]) {
      if (interaction.status !== 'passed') {
        lines.push(
          `    interaction (${side}) ${interaction.name}: ` +
            `${interaction.status} — ${interaction.detail}`,
        )
      }
    }
  }
  return lines
}

function renderReport(report: HarnessReport): string {
  const { compare } = report
  const lines: Array<string> = []
  lines.push(`minwind-compare: ${compare.passed ? 'PASS' : 'FAIL'}`)
  lines.push('')
  lines.push('outputs:')
  lines.push(`  off: ${compare.offDir}`)
  lines.push(`  on:  ${compare.onDir}`)
  if (report.builds.offMs !== null && report.builds.onMs !== null) {
    lines.push(
      `  builds: off ${formatDuration(report.builds.offMs)}, ` +
        `on ${formatDuration(report.builds.onMs)}`,
    )
  }
  lines.push('')

  lines.push(`routes (${compare.routes.length}):`)
  for (const route of compare.routes) {
    lines.push(...renderRoute(route))
  }
  if (compare.missingRoutes.offOnly.length > 0) {
    lines.push(
      `  missing from the on build: ${compare.missingRoutes.offOnly.join(', ')}`,
    )
  }
  if (compare.missingRoutes.onOnly.length > 0) {
    lines.push(
      `  missing from the off build: ${compare.missingRoutes.onOnly.join(', ')}`,
    )
  }
  lines.push('')

  const classLength = compare.classLength
  lines.push('class attribute length (crawled DOM):')
  if (classLength.offMedian === null || classLength.onMedian === null) {
    lines.push('  no classed elements found')
  } else {
    const drop =
      classLength.dropPercent === null
        ? 'n/a'
        : formatSignedPercent(-classLength.dropPercent)
    lines.push(
      `  median ${classLength.offMedian} -> ${classLength.onMedian} chars ` +
        `(${drop}) across ${classLength.offElements} classed elements`,
    )
  }
  lines.push('')

  const sizes = compare.sizes
  const rawPercent = deltaPercent(sizes.on.rawBytes, sizes.off.rawBytes)
  lines.push('whole-site bytes (HTML+CSS, minwind KTD3 profile):')
  lines.push(
    `  raw    ${formatGrouped(sizes.off.rawBytes)} -> ` +
      `${formatGrouped(sizes.on.rawBytes)} B (${formatSignedPercent(rawPercent)})`,
  )
  lines.push(
    `  brotli ${formatGrouped(sizes.off.brotliBytes)} -> ` +
      `${formatGrouped(sizes.on.brotliBytes)} B ` +
      `(${formatSignedPercent(sizes.brotliDeltaPercent)})`,
  )
  if (report.upperBound !== null) {
    lines.push(
      `  minwind projection on the off build: rename arm ` +
        `${formatSignedPercent(report.upperBound.renameArmPercent)}, ` +
        `upper bound ${formatSignedPercent(report.upperBound.upperBoundPercent)}`,
    )
  } else {
    lines.push(
      '  minwind projection unavailable ' +
        '(reference upper bound from U0: ~-5.7%)',
    )
  }

  const gate = evaluateGate(compare)
  if (gate.failures.length > 0) {
    lines.push('')
    lines.push('gate failures:')
    for (const failure of gate.failures) {
      lines.push(`  [${failure.kind}] ${failure.detail}`)
    }
  }
  lines.push('')
  lines.push(`wall clock: ${formatDuration(report.wallClockMs)}`)
  return lines.join('\n') + '\n'
}

async function main(): Promise<number> {
  const options = parseArgs(process.argv.slice(2))
  const repoRoot = path.resolve(HERE, '..')
  const siteDir =
    options.site === null
      ? path.join(repoRoot, 'examples', 'demo')
      : path.resolve(options.site)
  const started = Date.now()

  let offDir: string
  let onDir: string
  const builds: { offMs: number | null; onMs: number | null } = {
    offMs: null,
    onMs: null,
  }
  if (options.offDir !== null && options.onDir !== null) {
    offDir = path.resolve(options.offDir)
    onDir = path.resolve(options.onDir)
    // A nonexistent compared directory is a usage error, not a harness
    // failure: say so before discoverPages trips over the scandir.
    if (!fs.existsSync(offDir)) {
      usageError(`--off-dir does not exist: ${offDir}`)
    }
    if (!fs.existsSync(onDir)) {
      usageError(`--on-dir does not exist: ${onDir}`)
    }
    process.stderr.write(
      `minwind-compare: comparing existing outputs\n  off: ${offDir}\n  on:  ${onDir}\n`,
    )
  } else {
    const cacheRoot = path.join(
      repoRoot,
      'node_modules',
      '.cache',
      'minwind-compare',
    )
    offDir = path.join(cacheRoot, 'off')
    onDir = path.join(cacheRoot, 'on')
    process.stderr.write(
      `minwind-compare: clean build of ${siteDir} with MINWIND=off ...\n`,
    )
    builds.offMs = await buildVariant(
      'off',
      siteDir,
      offDir,
      options.buildTimeoutMs,
    )
    process.stderr.write(
      `minwind-compare: off build done in ${formatDuration(builds.offMs)}; ` +
        'clean build with MINWIND=on ...\n',
    )
    builds.onMs = await buildVariant(
      'on',
      siteDir,
      onDir,
      options.buildTimeoutMs,
    )
    process.stderr.write(
      `minwind-compare: on build done in ${formatDuration(builds.onMs)}\n`,
    )
  }

  process.stderr.write('minwind-compare: crawling both outputs ...\n')
  const compare = await compareDirs(offDir, onDir, {})
  const upperBound = await measureUpperBound(offDir, repoRoot)
  const report: HarnessReport = {
    compare,
    builds,
    upperBound,
    wallClockMs: Date.now() - started,
  }
  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
  } else {
    process.stdout.write(renderReport(report))
  }
  return compare.passed ? 0 : 1
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href

if (invokedDirectly) {
  main().then(
    function (code) {
      process.exitCode = code
    },
    function (cause: unknown) {
      process.stderr.write(
        `Error: ${cause instanceof Error ? cause.message : String(cause)}\n`,
      )
      process.exitCode = 2
    },
  )
}
