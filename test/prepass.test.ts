import assert from 'node:assert'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { runPrepass } from '../src/prepass.js'
import { hashClassName } from '../src/names.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SITE = path.join(HERE, 'fixtures', 'prepass-site')

function siteRoot(): string {
  return SITE
}

function cssEntry(): string {
  return path.join(SITE, 'src', 'app.css')
}

async function prepassSite() {
  return runPrepass({
    root: siteRoot(),
    cssEntry: cssEntry(),
    // The fixture site's b.tsx adds dissolve-reduced at runtime; the
    // exclusion contract is a site-owned config, passed explicitly.
    exclusions: { names: [], prefixes: ['dissolve-'] },
  })
}

function exclusionReasons(result: Awaited<ReturnType<typeof prepassSite>>) {
  return new Map(
    result.registry.exclusions().map(function (entry) {
      return [entry.token, entry.reason]
    }),
  )
}

function renamedTokens(result: Awaited<ReturnType<typeof prepassSite>>) {
  return result.registry.entries().map(function (entry) {
    return entry.token
  })
}

function verdictFor(
  result: Awaited<ReturnType<typeof prepassSite>>,
  tokens: Array<string>,
) {
  const key = [...tokens].sort().join(' ')
  return result.consolidationVerdicts.find(function (verdict) {
    return verdict.tokens.join(' ') === key
  })
}

describe('runPrepass registry (R1, R5, KTD3, KTD4)', function () {
  it('renames a utility, a custom @utility, and a hand-written class', async function () {
    const result = await prepassSite()
    for (const token of [
      'flex',
      'items-center',
      'p-4',
      'fade-in',
      'site-card',
    ]) {
      assert.strictEqual(
        result.registry.nameFor(token),
        hashClassName(token),
        `${token} must be renamed`,
      )
    }
  })

  it('collects tokens from all three KTD4 rename contexts', async function () {
    const result = await prepassSite()
    // class="..." attribute (a.tsx, b.tsx, c.tsx)
    assert.ok(result.renameTokens.has('flex'))
    // cn(...) arguments in a.tsx — site-card appears in no other context
    assert.ok(result.renameTokens.has('site-card'))
    // classList={{...}} key in a.tsx — mb-4 appears in no other rename
    // context
    assert.ok(result.renameTokens.has('mb-4'))
    assert.ok(result.sourceTokens.has('focus:underline'))
  })

  it('excludes a detection-only prefix token with excluded-prefix', async function () {
    const result = await prepassSite()
    assert.strictEqual(result.registry.nameFor('dissolve-reduced'), undefined)
    assert.strictEqual(
      exclusionReasons(result).get('dissolve-reduced'),
      'excluded-prefix',
    )
  })

  it('excludes a rename-context token with no stylesheet rule as not-in-universe', async function () {
    const result = await prepassSite()
    assert.strictEqual(result.registry.nameFor('ghost-token'), undefined)
    assert.strictEqual(
      exclusionReasons(result).get('ghost-token'),
      'not-in-universe',
    )
  })

  it('keeps a stylesheet class never used in source out as css-only', async function () {
    const result = await prepassSite()
    assert.strictEqual(result.registry.nameFor('css-only-class'), undefined)
    assert.strictEqual(
      exclusionReasons(result).get('css-only-class'),
      'css-only',
    )
  })

  it('records detection-only className-assignment tokens as runtime-context', async function () {
    const result = await prepassSite()
    assert.strictEqual(result.registry.nameFor('js-assigned'), undefined)
    assert.strictEqual(
      exclusionReasons(result).get('js-assigned'),
      'runtime-context',
    )
  })

  it('poisons a token used in a template literal with expressions', async function () {
    const result = await prepassSite()
    // mb-4 is provable in a.tsx (classList key) but poisoned in c.tsx; one
    // unprovable usage excludes the token entirely (KTD4).
    assert.strictEqual(result.registry.nameFor('mb-4'), undefined)
    assert.strictEqual(exclusionReasons(result).get('mb-4'), 'runtime-context')
  })

  it('asserts the registry bijection', async function () {
    const result = await prepassSite()
    assert.doesNotThrow(function () {
      result.registry.assertBijection()
    })
  })

  it('matches the exact expected rename set', async function () {
    const result = await prepassSite()
    assert.deepStrictEqual(renamedTokens(result), [
      'fade-in',
      'flex',
      'flex-col',
      'focus:underline',
      'items-center',
      'mb-2',
      'p-4',
      'site-card',
      'space-y-4',
    ])
  })
})

describe('runPrepass list frequencies (R3, KTD3)', function () {
  it('counts a repeated list across modules, order-insensitively', async function () {
    const result = await prepassSite()
    const list = result.listFrequencies.find(function (entry) {
      return entry.tokens.join(' ') === 'flex items-center p-4'
    })
    assert.ok(list, 'expected the flex/items-center/p-4 list')
    assert.strictEqual(list.count, 2, 'a.tsx and b.tsx each use it once')
  })

  it('counts single-occurrence lists too', async function () {
    const result = await prepassSite()
    const ghost = result.listFrequencies.find(function (entry) {
      return entry.tokens.join(' ') === 'ghost-token'
    })
    assert.ok(ghost)
    assert.strictEqual(ghost.count, 1)
  })
})

describe('runPrepass consolidation verdicts (R3, KTD6)', function () {
  it('marks a repeated variant-free list safe', async function () {
    const result = await prepassSite()
    const verdict = verdictFor(result, ['flex', 'items-center', 'p-4'])
    assert.ok(verdict, 'expected a verdict for the repeated list')
    assert.strictEqual(verdict.safe, true, verdict.reason)
  })

  it('rejects a repeated list with a complex-subject member', async function () {
    const result = await prepassSite()
    const verdict = verdictFor(result, ['flex-col', 'space-y-4'])
    assert.ok(verdict, 'expected a verdict for the space-y-4 list')
    assert.strictEqual(verdict.safe, false)
  })

  it('rejects a repeated list with a variant-carrying member', async function () {
    const result = await prepassSite()
    const verdict = verdictFor(result, ['focus:underline', 'mb-2'])
    assert.ok(verdict, 'expected a verdict for the focus:underline list')
    assert.strictEqual(verdict.safe, false)
  })

  it('only issues verdicts for lists seen more than once', async function () {
    const result = await prepassSite()
    for (const verdict of result.consolidationVerdicts) {
      const list = result.listFrequencies.find(function (entry) {
        return entry.tokens.join(' ') === verdict.tokens.join(' ')
      })
      assert.ok(list)
      assert.ok(list.count > 1, `${list.tokens.join(' ')} seen ${list.count}x`)
    }
  })
})

describe('runPrepass error path (R10)', function () {
  it('throws loudly when the CSS entry fails to compile', async function () {
    const broken = path.join(
      HERE,
      'fixtures',
      'prepass-site',
      'src',
      'broken.css',
    )
    await assert.rejects(async function () {
      await runPrepass({ root: siteRoot(), cssEntry: broken })
    })
  })
})
