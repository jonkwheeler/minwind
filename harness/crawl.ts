import { Buffer } from 'node:buffer'
import type { Browser, Page, Request } from 'playwright'
import type { ElementSnapshot } from './diff.js'
import type { DiscoveredPage } from './discover.js'

// Playwright crawl (R7, KTD8): every discovered page is loaded with external
// requests fulfilled empty (deterministic — Google Fonts never arrives, and
// an empty 200 keeps failed-resource noise out of the console), animations
// disabled from document start, and a settle wait before measuring. Per page
// the crawl captures the DOM-order computed-style snapshot, a full-page
// screenshot, console/page errors split into load and interaction phases,
// and the interaction smoke pass.

export interface InteractionResult {
  name: string
  // 'skipped' when the page has no theme toggle (only the index route has
  // one) — a skipped step never fails the gate.
  status: 'passed' | 'failed' | 'skipped'
  detail: string
}

export interface CrawledPage {
  route: string
  elements: Array<ElementSnapshot>
  screenshot: Buffer
  loadConsoleErrors: Array<string>
  interactionConsoleErrors: Array<string>
  interactions: Array<InteractionResult>
}

export interface CrawlOptions {
  themeToggleSelector: string
  viewport: { width: number; height: number }
  settleTimeoutMs: number
  interactionTimeoutMs: number
}

export const DEFAULT_CRAWL_OPTIONS: CrawlOptions = {
  // Structural on purpose: the on build renames every class, so a
  // class-based selector would not match. The jam switcher is the first
  // button inside the footer on the index route.
  themeToggleSelector: 'footer button',
  viewport: { width: 1280, height: 900 },
  settleTimeoutMs: 15000,
  interactionTimeoutMs: 5000,
}

// Runs in the browser at document start. The style element lands as early as
// the parser allows, before first paint, so no animation or transition ever
// runs — a killed animation and a completed one can leave different end
// states, and crawl timing is not identical across builds.
//
// This is a string, not a function: tsx/esbuild rewrites inner named
// function declarations with a `__name(...)` keep-names helper, and a
// stringified function referencing it throws ReferenceError in the browser.
// The same hazard applies to every function passed to page.evaluate or
// page.waitForFunction below — keep their bodies free of inner named
// function declarations (anonymous callbacks are not rewritten).
const NO_ANIMATIONS_SCRIPT = `(function () {
  var ID = 'minwind-no-animations'
  function inject() {
    if (document.getElementById(ID) !== null) return
    var parent = document.head || document.documentElement
    if (!parent) return
    var style = document.createElement('style')
    style.id = ID
    style.textContent =
      '*,*::before,*::after{animation:none!important;transition:none!important}'
    parent.appendChild(style)
  }
  inject()
  if (document.getElementById(ID) === null) {
    var observer = new MutationObserver(function () {
      inject()
      if (document.getElementById(ID) !== null) observer.disconnect()
    })
    observer.observe(document, { childList: true, subtree: true })
  }
})()`

function externalContentType(request: Request): string {
  switch (request.resourceType()) {
    case 'stylesheet':
      return 'text/css'
    case 'script':
      return 'text/javascript'
    case 'image':
      return 'image/png'
    case 'font':
      return 'font/woff2'
    case 'document':
      return 'text/html; charset=utf-8'
    default:
      return 'text/plain'
  }
}

function snapshotDom(): Array<ElementSnapshot> {
  const elements: Array<ElementSnapshot> = []
  const all = document.querySelectorAll('*')
  for (let i = 0; i < all.length; i++) {
    const element = all.item(i)
    const computed = getComputedStyle(element)
    const styles: Record<string, string> = {}
    for (let j = 0; j < computed.length; j++) {
      const property = computed.item(j)
      styles[property] = computed.getPropertyValue(property)
    }
    const classAttribute = element.getAttribute('class')
    elements.push({
      tag: element.tagName,
      classLength: classAttribute === null ? null : classAttribute.length,
      styles,
    })
  }
  return elements
}

function htmlElementState(): string {
  const root = document.documentElement
  return `${root.getAttribute('class') ?? ''}|${root.getAttribute('style') ?? ''}`
}

async function settle(page: Page, timeoutMs: number): Promise<void> {
  await page
    .waitForLoadState('networkidle', { timeout: timeoutMs })
    .catch(function () {
      // All assets are local and externals are fulfilled empty, so
      // networkidle should arrive; if it does not, the font/rAF wait below
      // still gives a deterministic settle point.
    })
  await page.evaluate(function () {
    return document.fonts.ready.then(function () {
      return new Promise<void>(function (resolve) {
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            resolve()
          })
        })
      })
    })
  })
}

async function smokeThemeToggle(
  page: Page,
  options: CrawlOptions,
): Promise<InteractionResult> {
  const button = await page.$(options.themeToggleSelector)
  if (button === null) {
    return {
      name: 'theme-toggle',
      status: 'skipped',
      detail: `no element matches "${options.themeToggleSelector}"`,
    }
  }
  const before = await page.evaluate(htmlElementState)
  await button.click()
  try {
    await page.waitForFunction(
      function (previous) {
        const root = document.documentElement
        return (
          `${root.getAttribute('class') ?? ''}|${root.getAttribute('style') ?? ''}` !==
          previous
        )
      },
      before,
      { timeout: options.interactionTimeoutMs },
    )
  } catch {
    return {
      name: 'theme-toggle',
      status: 'failed',
      detail: 'clicking the theme toggle did not mutate the <html> element',
    }
  }
  return {
    name: 'theme-toggle',
    status: 'passed',
    detail: 'theme toggle mutated the <html> element',
  }
}

async function smokeClientNavigation(
  page: Page,
  options: CrawlOptions,
): Promise<InteractionResult> {
  const href = await page.evaluate(function () {
    const link = document.querySelector('a[href^="/"]')
    return link === null ? null : link.getAttribute('href')
  })
  if (href === null) {
    return {
      name: 'client-navigation',
      status: 'failed',
      detail: 'no internal link found on the page',
    }
  }
  const expectedPath = new URL(href, 'http://localhost').pathname
  await page.evaluate(function () {
    ;(window as unknown as Record<string, unknown>).__minwindCompareMarker =
      'present'
  })
  await page.click('a[href^="/"]')
  try {
    await page.waitForFunction(
      function (expected) {
        return window.location.pathname === expected
      },
      expectedPath,
      { timeout: options.interactionTimeoutMs },
    )
  } catch {
    return {
      name: 'client-navigation',
      status: 'failed',
      detail: `clicking ${href} did not navigate`,
    }
  }
  const survived = await page.evaluate(function () {
    return (
      (window as unknown as Record<string, unknown>).__minwindCompareMarker ===
      'present'
    )
  })
  if (!survived) {
    return {
      name: 'client-navigation',
      status: 'failed',
      detail: `navigating to ${href} reloaded the page (not client-side)`,
    }
  }
  return {
    name: 'client-navigation',
    status: 'passed',
    detail: `client-side navigation to ${href}`,
  }
}

async function crawlPage(
  page: Page,
  origin: string,
  route: string,
  options: CrawlOptions,
): Promise<CrawledPage> {
  const loadConsoleErrors: Array<string> = []
  const interactionConsoleErrors: Array<string> = []
  let collecting = loadConsoleErrors
  page.on('console', function (message) {
    if (message.type() === 'error') collecting.push(message.text())
  })
  page.on('pageerror', function (error) {
    collecting.push(String(error))
  })

  await page.goto(`${origin}${route}`, { waitUntil: 'load', timeout: 60000 })
  await settle(page, options.settleTimeoutMs)

  const elements = await page.evaluate(snapshotDom)
  const screenshot = await page.screenshot({ type: 'png', fullPage: true })

  collecting = interactionConsoleErrors
  const interactions: Array<InteractionResult> = []
  interactions.push(await smokeThemeToggle(page, options))
  interactions.push(await smokeClientNavigation(page, options))

  return {
    route,
    elements,
    screenshot,
    loadConsoleErrors,
    interactionConsoleErrors,
    interactions,
  }
}

// Crawls every page sequentially against the server currently bound at
// origin, in a fresh context (no cache carries between the off and on
// crawls).
export async function crawlSite(
  browser: Browser,
  origin: string,
  pages: Array<DiscoveredPage>,
  options: CrawlOptions,
): Promise<Array<CrawledPage>> {
  const context = await browser.newContext({
    viewport: options.viewport,
    deviceScaleFactor: 1,
  })
  try {
    await context.addInitScript({ content: NO_ANIMATIONS_SCRIPT })
    await context.route('**/*', function (route, request) {
      const url = new URL(request.url())
      if (url.origin === origin) return route.continue()
      return route.fulfill({
        status: 200,
        contentType: externalContentType(request),
        body: '',
      })
    })
    const crawled: Array<CrawledPage> = []
    for (const discovered of pages) {
      const page = await context.newPage()
      try {
        crawled.push(await crawlPage(page, origin, discovered.route, options))
      } finally {
        await page.close()
      }
    }
    return crawled
  } finally {
    await context.close()
  }
}
