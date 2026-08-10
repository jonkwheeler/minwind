import assert from 'node:assert'
import { describe, it } from 'node:test'
import { parse } from 'css-tree'
import {
  assertConsolidatedNames,
  computeConsolidationVerdicts,
  consolidateStylesheet,
  modelStylesheet,
  verifyConsolidation,
  type ConsolidationVerdict,
} from '../src/consolidate.js'
import {
  createNameRegistry,
  hashClassName,
  type NameRegistry,
} from '../src/names.js'
import { assertPresence, transformStylesheet } from '../src/transform-css.js'
import { transformSource } from '../src/transform-source.js'

// U5 consolidation (R3, R6, KTD6): verdict naming, member removability,
// shared-rule synthesis on the renamed stylesheet, source-side list collapse,
// and bundle-time re-verification against the emitted stylesheet.

const LAYER_OPEN = '@layer theme,base,components,utilities;@layer utilities{'

function registryFor(
  tokens: ReadonlyArray<string>,
  cssOnly: ReadonlyArray<string> = [],
): NameRegistry {
  return createNameRegistry({
    universe: new Set([...tokens, ...cssOnly]),
    sourceTokens: new Set(tokens),
  })
}

function nameOf(registry: NameRegistry, token: string): string {
  const name = registry.nameFor(token)
  assert.ok(name !== undefined, `${token} must be renamed in the test registry`)
  return name
}

// The KTD6 consolidated name hashes the sorted member list.
function consolidatedName(tokens: ReadonlyArray<string>): string {
  return hashClassName([...tokens].sort().join(' '))
}

function verdictFor(
  verdicts: ReadonlyArray<ConsolidationVerdict>,
  tokens: ReadonlyArray<string>,
): ConsolidationVerdict | undefined {
  const key = [...tokens].sort().join(' ')
  return verdicts.find(function (verdict) {
    return verdict.tokens.join(' ') === key
  })
}

function allowAll(): boolean {
  return true
}

describe('computeConsolidationVerdicts naming and removability (KTD6)', function () {
  const CSS =
    LAYER_OPEN +
    '.flex{display:flex}' +
    '.items-center{align-items:center}' +
    '.p-4{padding:1rem}' +
    '.mb-16{margin-bottom:4rem}' +
    '}'

  it('names a safe verdict by hashing the sorted list and marks exclusive members removable', function () {
    const verdicts = computeConsolidationVerdicts(
      [{ tokens: ['flex', 'items-center', 'p-4'], count: 3 }],
      modelStylesheet(CSS),
      allowAll,
    )
    assert.strictEqual(verdicts.length, 1)
    const verdict = verdicts[0]
    assert.strictEqual(verdict.safe, true, verdict.reason)
    assert.strictEqual(
      verdict.name,
      consolidatedName(['flex', 'items-center', 'p-4']),
    )
    assert.deepStrictEqual(verdict.removableTokens, [
      'flex',
      'items-center',
      'p-4',
    ])
  })

  it('issues no verdict for a list used only once', function () {
    const verdicts = computeConsolidationVerdicts(
      [{ tokens: ['flex', 'items-center'], count: 1 }],
      modelStylesheet(CSS),
      allowAll,
    )
    assert.strictEqual(verdicts.length, 0)
  })

  it('issues no verdict for a repeated single-token list (rename already covers it)', function () {
    const verdicts = computeConsolidationVerdicts(
      [{ tokens: ['flex'], count: 5 }],
      modelStylesheet(CSS),
      allowAll,
    )
    assert.strictEqual(verdicts.length, 0)
  })

  it('keeps a member rule that another, non-collapsing list still references', function () {
    const verdicts = computeConsolidationVerdicts(
      [
        { tokens: ['flex', 'items-center'], count: 2 },
        { tokens: ['flex', 'p-4'], count: 1 },
      ],
      modelStylesheet(CSS),
      allowAll,
    )
    const verdict = verdictFor(verdicts, ['flex', 'items-center'])
    assert.ok(verdict)
    assert.strictEqual(verdict.safe, true, verdict.reason)
    // flex is also used by a singleton list, which never collapses, so its
    // rule must survive; items-center is exclusive to the collapsed list.
    assert.deepStrictEqual(verdict.removableTokens, ['items-center'])
  })

  it('keeps a member rule that a partially-dynamic rename group references', function () {
    const verdicts = computeConsolidationVerdicts(
      [{ tokens: ['flex', 'mb-16'], count: 2 }],
      modelStylesheet(CSS),
      allowAll,
      { dynamicTokens: new Set(['mb-16']) },
    )
    const verdict = verdictFor(verdicts, ['flex', 'mb-16'])
    assert.ok(verdict)
    assert.strictEqual(verdict.safe, true, verdict.reason)
    assert.deepStrictEqual(verdict.removableTokens, ['flex'])
  })

  it('excludes a repeated list with a complex-subject member', function () {
    const css =
      LAYER_OPEN +
      '.flex-col{flex-direction:column}' +
      '.space-y-4>:not([hidden])~:not([hidden]){margin-top:1rem}' +
      '}'
    const verdicts = computeConsolidationVerdicts(
      [{ tokens: ['flex-col', 'space-y-4'], count: 2 }],
      modelStylesheet(css),
      allowAll,
    )
    const verdict = verdictFor(verdicts, ['flex-col', 'space-y-4'])
    assert.ok(verdict)
    assert.strictEqual(verdict.safe, false)
    assert.strictEqual(verdict.reason, 'complex-subject')
    assert.strictEqual(verdict.name, undefined)
  })

  it('excludes a repeated list whose members carry variants', function () {
    const css =
      LAYER_OPEN +
      '.mb-2{margin-bottom:.5rem}' +
      '.focus\\:border-accent:focus{border-color:var(--accent)}' +
      '.placeholder\\:text-light-dim::placeholder{color:var(--light-dim)}' +
      '}'
    const verdicts = computeConsolidationVerdicts(
      [
        {
          tokens: ['focus:border-accent', 'placeholder:text-light-dim', 'mb-2'],
          count: 2,
        },
      ],
      modelStylesheet(css),
      allowAll,
    )
    const verdict = verdictFor(verdicts, [
      'focus:border-accent',
      'placeholder:text-light-dim',
      'mb-2',
    ])
    assert.ok(verdict)
    assert.strictEqual(verdict.safe, false)
    assert.strictEqual(verdict.reason, 'variant-member')
  })

  it('rejects a group with an intervening rule declaring a merged property', function () {
    const css =
      LAYER_OPEN +
      '.flex{display:flex}' +
      '.card-reset{display:grid}' +
      '.items-center{align-items:center}' +
      '}'
    const verdicts = computeConsolidationVerdicts(
      [{ tokens: ['flex', 'items-center'], count: 2 }],
      modelStylesheet(css),
      allowAll,
    )
    const verdict = verdictFor(verdicts, ['flex', 'items-center'])
    assert.ok(verdict)
    assert.strictEqual(verdict.safe, false)
    assert.strictEqual(verdict.reason, 'intervening-cascade')
  })

  it('allows an intervening rule declaring unrelated properties', function () {
    const css =
      LAYER_OPEN +
      '.flex{display:flex}' +
      '.card-reset{margin:0}' +
      '.items-center{align-items:center}' +
      '}'
    const verdicts = computeConsolidationVerdicts(
      [{ tokens: ['flex', 'items-center'], count: 2 }],
      modelStylesheet(css),
      allowAll,
    )
    const verdict = verdictFor(verdicts, ['flex', 'items-center'])
    assert.ok(verdict)
    assert.strictEqual(verdict.safe, true, verdict.reason)
  })
})

describe('assertConsolidatedNames (KTD5 collision policy, R10)', function () {
  const CSS = LAYER_OPEN + '.flex{display:flex}' + '.p-4{padding:1rem}' + '}'

  function safeVerdicts(registry: NameRegistry): Array<ConsolidationVerdict> {
    return computeConsolidationVerdicts(
      [{ tokens: ['flex', 'p-4'], count: 2 }],
      modelStylesheet(CSS),
      function (token) {
        return registry.nameFor(token) !== undefined
      },
    )
  }

  it('passes on disjoint names and leaves the registry bijection intact', function () {
    const registry = registryFor(['flex', 'p-4'])
    const verdicts = safeVerdicts(registry)
    assert.doesNotThrow(function () {
      assertConsolidatedNames(registry, verdicts)
    })
    assert.doesNotThrow(function () {
      registry.assertBijection()
    })
  })

  it('throws when a consolidated name collides with a renamed token', function () {
    const name = consolidatedName(['flex', 'p-4'])
    // A class whose own hash IS the consolidated name: registering it claims
    // the name before the verdict resolves.
    const registry = createNameRegistry({
      universe: new Set(['flex', 'p-4', name]),
      sourceTokens: new Set(['flex', 'p-4', name]),
      hash: function (token) {
        return token === name ? name : hashClassName(token)
      },
    })
    assert.strictEqual(registry.nameFor(name), name)
    assert.throws(function () {
      assertConsolidatedNames(registry, safeVerdicts(registry))
    }, /collision/)
  })

  it('throws when a consolidated name collides with an excluded (css-only) class', function () {
    const name = consolidatedName(['flex', 'p-4'])
    const registry = registryFor(['flex', 'p-4'], [name])
    assert.throws(function () {
      assertConsolidatedNames(registry, safeVerdicts(registry))
    }, /collision/)
  })

  it('throws when a safe verdict carries no consolidated name', function () {
    const registry = registryFor(['flex', 'p-4'])
    assert.throws(function () {
      assertConsolidatedNames(registry, [
        { tokens: ['flex', 'p-4'], frequency: 2, safe: true },
      ])
    }, /no consolidated name/)
  })
})

describe('consolidateStylesheet (KTD6 shared-rule synthesis)', function () {
  const TOKENS = ['flex', 'items-center', 'p-4', 'site-note']
  const CSS =
    LAYER_OPEN +
    '.flex{display:flex}' +
    '.items-center{align-items:center}' +
    '.p-4{padding:1rem}' +
    '}' +
    '.site-note{color:blue}'

  function setup() {
    const registry = registryFor(TOKENS)
    const verdicts = computeConsolidationVerdicts(
      [{ tokens: ['flex', 'items-center', 'p-4'], count: 3 }],
      modelStylesheet(CSS),
      function (token) {
        return registry.nameFor(token) !== undefined
      },
    )
    const renamed = transformStylesheet({ css: CSS, registry }).css
    return { registry, verdicts, renamed }
  }

  it('merges a repeated list into one shared rule at the earliest member position', function () {
    const { registry, verdicts, renamed } = setup()
    const result = consolidateStylesheet({ css: renamed, verdicts, registry })
    const cname = consolidatedName(['flex', 'items-center', 'p-4'])
    assert.strictEqual(
      result.css,
      LAYER_OPEN +
        `.${cname}{display:flex;align-items:center;padding:1rem}` +
        '}' +
        `.${nameOf(registry, 'site-note')}{color:blue}`,
    )
    assert.deepStrictEqual(
      result.consolidated.map(function (entry) {
        return entry.name
      }),
      [cname],
    )
    assert.deepStrictEqual(result.consolidated[0].removedTokens, [
      'flex',
      'items-center',
      'p-4',
    ])
    assert.deepStrictEqual(result.consolidated[0].keptTokens, [])
  })

  it('produces merged CSS that parses back cleanly with the shared selector present exactly once', function () {
    const { registry, verdicts, renamed } = setup()
    const result = consolidateStylesheet({ css: renamed, verdicts, registry })
    assert.doesNotThrow(function () {
      parse(result.css)
    })
    const cname = consolidatedName(['flex', 'items-center', 'p-4'])
    assert.strictEqual(
      result.css.match(new RegExp(`\\.${cname}\\{`, 'g'))?.length,
      1,
    )
    for (const token of ['flex', 'items-center', 'p-4']) {
      assert.ok(
        !result.css.includes(`.${nameOf(registry, token)}{`),
        `member rule for ${token} must be gone`,
      )
    }
  })

  it('keeps the registry bijection and presence assertions green on the pre-consolidation asset', function () {
    const { registry, verdicts, renamed } = setup()
    assertConsolidatedNames(registry, verdicts)
    assert.doesNotThrow(function () {
      registry.assertBijection()
    })
    // Per the U6 contract, presence is asserted on the renamed asset before
    // consolidation removes merged member rules.
    assert.doesNotThrow(function () {
      assertPresence(registry, [renamed])
    })
    consolidateStylesheet({ css: renamed, verdicts, registry })
    assert.doesNotThrow(function () {
      registry.assertBijection()
    })
  })

  it('keeps a non-removable member rule and still adds the shared rule before it', function () {
    const tokens = ['flex', 'mb-16']
    const css =
      LAYER_OPEN + '.flex{display:flex}' + '.mb-16{margin-bottom:4rem}' + '}'
    const registry = registryFor(tokens)
    const verdicts = computeConsolidationVerdicts(
      [{ tokens, count: 2 }],
      modelStylesheet(css),
      function (token) {
        return registry.nameFor(token) !== undefined
      },
      { dynamicTokens: new Set(['mb-16']) },
    )
    const renamed = transformStylesheet({ css, registry }).css
    const result = consolidateStylesheet({ css: renamed, verdicts, registry })
    const cname = consolidatedName(tokens)
    assert.strictEqual(
      result.css,
      LAYER_OPEN +
        `.${cname}{display:flex;margin-bottom:4rem}` +
        `.${nameOf(registry, 'mb-16')}{margin-bottom:4rem}` +
        '}',
    )
    assert.deepStrictEqual(result.consolidated[0].removedTokens, ['flex'])
    assert.deepStrictEqual(result.consolidated[0].keptTokens, ['mb-16'])
  })

  it('merges two groups sharing a member into two shared rules at the same position', function () {
    const tokens = ['flex', 'items-center', 'p-4']
    const css =
      LAYER_OPEN +
      '.flex{display:flex}' +
      '.items-center{align-items:center}' +
      '.p-4{padding:1rem}' +
      '}'
    const registry = registryFor(tokens)
    const verdicts = computeConsolidationVerdicts(
      [
        { tokens: ['flex', 'items-center'], count: 2 },
        { tokens: ['flex', 'p-4'], count: 2 },
      ],
      modelStylesheet(css),
      function (token) {
        return registry.nameFor(token) !== undefined
      },
    )
    const first = verdictFor(verdicts, ['flex', 'items-center'])
    const second = verdictFor(verdicts, ['flex', 'p-4'])
    assert.ok(first?.safe && second?.safe)
    // flex collapses in every list that uses it, so its rule is removable.
    assert.deepStrictEqual(first.removableTokens, ['flex', 'items-center'])
    const renamed = transformStylesheet({ css, registry }).css
    const result = consolidateStylesheet({ css: renamed, verdicts, registry })
    const ordered = [first.name, second.name].sort()
    assert.strictEqual(
      result.css,
      LAYER_OPEN +
        `.${ordered[0]}{display:flex;align-items:center}` +
        `.${ordered[1]}{display:flex;padding:1rem}` +
        '}',
    )
  })

  it('leaves the stylesheet untouched when every verdict is unsafe', function () {
    const tokens = ['flex-col', 'space-y-4']
    const css =
      LAYER_OPEN +
      '.flex-col{flex-direction:column}' +
      '.space-y-4>:not([hidden])~:not([hidden]){margin-top:1rem}' +
      '}'
    const registry = registryFor(tokens)
    const verdicts = computeConsolidationVerdicts(
      [{ tokens, count: 2 }],
      modelStylesheet(css),
      function (token) {
        return registry.nameFor(token) !== undefined
      },
    )
    const renamed = transformStylesheet({ css, registry }).css
    const result = consolidateStylesheet({ css: renamed, verdicts, registry })
    assert.strictEqual(result.css, renamed)
    assert.deepStrictEqual(result.consolidated, [])
  })

  it('throws loudly when the renamed stylesheet diverges from a frozen safe verdict', function () {
    const tokens = ['flex', 'items-center', 'card-reset']
    const clean =
      LAYER_OPEN +
      '.flex{display:flex}' +
      '.items-center{align-items:center}' +
      '}'
    const tampered =
      LAYER_OPEN +
      '.flex{display:flex}' +
      '.card-reset{display:grid}' +
      '.items-center{align-items:center}' +
      '}'
    const registry = registryFor(tokens)
    const verdicts = computeConsolidationVerdicts(
      [{ tokens: ['flex', 'items-center'], count: 2 }],
      modelStylesheet(clean),
      function (token) {
        return registry.nameFor(token) !== undefined
      },
    )
    const renamed = transformStylesheet({ css: tampered, registry }).css
    assert.throws(function () {
      consolidateStylesheet({ css: renamed, verdicts, registry })
    }, /divergence.*intervening-cascade/s)
  })

  it('throws when a frozen safe verdict member has no rule in the renamed stylesheet', function () {
    const tokens = ['flex', 'items-center', 'p-4']
    const full =
      LAYER_OPEN +
      '.flex{display:flex}' +
      '.items-center{align-items:center}' +
      '.p-4{padding:1rem}' +
      '}'
    const registry = registryFor(tokens)
    const verdicts = computeConsolidationVerdicts(
      [{ tokens: ['flex', 'items-center'], count: 2 }],
      modelStylesheet(full),
      function (token) {
        return registry.nameFor(token) !== undefined
      },
    )
    // A stylesheet where the items-center rule never emitted (shape drift).
    const drifted =
      LAYER_OPEN + '.flex{display:flex}' + '.p-4{padding:1rem}' + '}'
    const driftedRegistry = registryFor(['flex', 'p-4'])
    const renamed = transformStylesheet({
      css: drifted,
      registry: driftedRegistry,
    }).css
    assert.throws(function () {
      consolidateStylesheet({ css: renamed, verdicts, registry })
    }, /divergence.*no-stylesheet-rule/s)
  })
})

describe('transformSource list collapse (R3)', function () {
  const TOKENS = ['flex', 'items-center', 'p-4', 'mb-16']

  function setup() {
    const registry = registryFor(TOKENS)
    const verdicts = computeConsolidationVerdicts(
      [{ tokens: ['flex', 'items-center', 'p-4'], count: 3 }],
      modelStylesheet(
        LAYER_OPEN +
          '.flex{display:flex}' +
          '.items-center{align-items:center}' +
          '.p-4{padding:1rem}' +
          '}',
      ),
      function (token) {
        return registry.nameFor(token) !== undefined
      },
    )
    return { registry, verdicts }
  }

  const CNAME = consolidatedName(['flex', 'items-center', 'p-4'])

  it('collapses three repeated class attributes to the consolidated name (AE4)', function () {
    const { registry, verdicts } = setup()
    const code = `export function A() {
  return (
    <section>
      <div class="flex items-center p-4">one</div>
      <div class="items-center p-4 flex">two</div>
      <div class="p-4 flex items-center">three</div>
    </section>
  )
}
`
    const result = transformSource({
      code,
      id: '/site/src/routes/a.tsx',
      registry,
      consolidationVerdicts: verdicts,
    })
    assert.ok(result !== null)
    assert.strictEqual(
      result.code,
      `export function A() {
  return (
    <section>
      <div class="${CNAME}">one</div>
      <div class="${CNAME}">two</div>
      <div class="${CNAME}">three</div>
    </section>
  )
}
`,
    )
    assert.deepStrictEqual(result.warnings, [])
  })

  it('collapses a fully-literal cn call across arguments and quote styles', function () {
    const { registry, verdicts } = setup()
    const code = `import { cn } from '~/utils/cn'
const el = <div class={cn('flex items-center', \`p-4\`)}>x</div>
`
    const result = transformSource({
      code,
      id: '/site/src/routes/b.tsx',
      registry,
      consolidationVerdicts: verdicts,
    })
    assert.ok(result !== null)
    assert.strictEqual(
      result.code,
      `import { cn } from '~/utils/cn'
const el = <div class={cn('${CNAME}')}>x</div>
`,
    )
    assert.deepStrictEqual(result.warnings, [])
  })

  it('collapses a classList object whose values are all static true', function () {
    const { registry, verdicts } = setup()
    const code = `const el = <div classList={{ 'flex': true, 'items-center': true, 'p-4': true }}>x</div>\n`
    const result = transformSource({
      code,
      id: '/site/src/routes/c.tsx',
      registry,
      consolidationVerdicts: verdicts,
    })
    assert.ok(result !== null)
    assert.strictEqual(
      result.code,
      `const el = <div classList={{ '${CNAME}': true }}>x</div>\n`,
    )
  })

  it('never collapses a conditional classList object; keys rename per token', function () {
    const { registry, verdicts } = setup()
    const code = `const el = <div classList={{ 'flex': wide(), 'items-center': true, 'p-4': true }}>x</div>\n`
    const result = transformSource({
      code,
      id: '/site/src/routes/d.tsx',
      registry,
      consolidationVerdicts: verdicts,
    })
    assert.ok(result !== null)
    assert.strictEqual(
      result.code,
      `const el = <div classList={{ '${nameOf(
        registry,
        'flex',
      )}': wide(), '${nameOf(registry, 'items-center')}': true, '${nameOf(
        registry,
        'p-4',
      )}': true }}>x</div>\n`,
    )
  })

  it('never consolidates a partially-dynamic cn call; static tokens still rename', function () {
    const { registry, verdicts } = setup()
    const code = `import { cn } from '~/utils/cn'
const el = <div class={cn('mb-16', props.class)}>x</div>
`
    const result = transformSource({
      code,
      id: '/site/src/routes/e.tsx',
      registry,
      consolidationVerdicts: verdicts,
    })
    assert.ok(result !== null)
    assert.strictEqual(
      result.code,
      `import { cn } from '~/utils/cn'
const el = <div class={cn('${nameOf(registry, 'mb-16')}', props.class)}>x</div>
`,
    )
    assert.deepStrictEqual(result.warnings, [])
  })

  it('renames per token when a literal list matches no safe verdict exactly', function () {
    const { registry, verdicts } = setup()
    const code = `const el = <div class="flex items-center">x</div>\n`
    const result = transformSource({
      code,
      id: '/site/src/routes/f.tsx',
      registry,
      consolidationVerdicts: verdicts,
    })
    assert.ok(result !== null)
    assert.strictEqual(
      result.code,
      `const el = <div class="${nameOf(registry, 'flex')} ${nameOf(
        registry,
        'items-center',
      )}">x</div>\n`,
    )
  })

  it('collapses only matching groups inside a mixed module and preserves every other byte', function () {
    const { registry, verdicts } = setup()
    const before = '// ⌘ header\n'
    const after = '\n// trailing\n'
    const code =
      before +
      `const a = <div  class="flex items-center p-4"  />\n` +
      `const b = <p class="mb-16">x</p>` +
      after
    const result = transformSource({
      code,
      id: '/site/src/routes/g.tsx',
      registry,
      consolidationVerdicts: verdicts,
    })
    assert.ok(result !== null)
    assert.strictEqual(
      result.code,
      before +
        `const a = <div  class="${CNAME}"  />\n` +
        `const b = <p class="${nameOf(registry, 'mb-16')}">x</p>` +
        after,
    )
    assert.deepStrictEqual(result.warnings, [])
  })

  it('throws when a safe verdict carries no consolidated name', function () {
    const { registry } = setup()
    const code = `const el = <div class="flex items-center p-4">x</div>\n`
    assert.throws(function () {
      transformSource({
        code,
        id: '/site/src/routes/h.tsx',
        registry,
        consolidationVerdicts: [
          { tokens: ['flex', 'items-center', 'p-4'], frequency: 3, safe: true },
        ],
      })
    }, /no consolidated name/)
  })
})

describe('verifyConsolidation (KTD3 re-verification, R10)', function () {
  const TOKENS = ['flex', 'items-center', 'p-4', 'card-reset']
  const EMITTED =
    LAYER_OPEN +
    '.flex{display:flex}' +
    '.items-center{align-items:center}' +
    '.p-4{padding:1rem}' +
    '}'

  function frozenVerdicts(registry: NameRegistry): Array<ConsolidationVerdict> {
    return computeConsolidationVerdicts(
      [
        { tokens: ['flex', 'items-center', 'p-4'], count: 3 },
        { tokens: ['card-reset', 'p-4'], count: 2 },
      ],
      modelStylesheet(EMITTED),
      function (token) {
        return registry.nameFor(token) !== undefined
      },
    )
  }

  it('passes when the emitted stylesheet reproduces every frozen verdict', function () {
    const registry = registryFor(TOKENS)
    const verdicts = frozenVerdicts(registry)
    assert.doesNotThrow(function () {
      verifyConsolidation(EMITTED, verdicts, registry, 'app.css')
    })
  })

  it('passes when a frozen unsafe verdict stays unsafe', function () {
    const registry = registryFor(['flex-col', 'space-y-4'])
    const css =
      LAYER_OPEN +
      '.flex-col{flex-direction:column}' +
      '.space-y-4>:not([hidden])~:not([hidden]){margin-top:1rem}' +
      '}'
    const verdicts = computeConsolidationVerdicts(
      [{ tokens: ['flex-col', 'space-y-4'], count: 2 }],
      modelStylesheet(css),
      allowAll,
    )
    assert.strictEqual(verdicts[0].safe, false)
    assert.doesNotThrow(function () {
      verifyConsolidation(css, verdicts, registry)
    })
  })

  it('passes when an unsafe verdict rejudges unsafe for a different reason', function () {
    // Real-site regression ("accent-inline-button text-sm"): the pre-pass
    // compile keeps native nesting, so the member judges complex-subject;
    // the Lightning-CSS-flattened emitted asset splits the nested rule out,
    // so judging reaches the intervening-cascade check. Both decide unsafe —
    // the reason is diagnostic, not part of the frozen contract.
    const tokens = ['btn', 'p-4']
    const prepassCss =
      LAYER_OPEN +
      '.btn{color:red;&:hover{color:blue}}' +
      '.p-4{padding:1rem}' +
      '}'
    const emitted =
      LAYER_OPEN +
      '.btn{color:red}' +
      '.btn:hover{color:blue}' +
      '.p-4{padding:1rem}' +
      '}'
    const registry = registryFor(tokens)
    const verdicts = computeConsolidationVerdicts(
      [{ tokens, count: 2 }],
      modelStylesheet(prepassCss),
      allowAll,
    )
    assert.strictEqual(verdicts[0].safe, false)
    assert.strictEqual(verdicts[0].reason, 'complex-subject')
    assert.doesNotThrow(function () {
      verifyConsolidation(emitted, verdicts, registry, 'app.css')
    })
  })

  it('does not throw when a frozen unsafe verdict rejudges safe (unsafe→safe is benign)', function () {
    // The pre-pass compile keeps native nesting, so `.flex` judges
    // complex-subject; Lightning CSS flattens the emitted asset into a
    // plain `.flex` rule plus a separate `.flex:hover` rule, which judges
    // safe. unsafe→safe is benign: the frozen verdict already declined the
    // merge, so the shipped output is correct either way.
    const tokens = ['flex', 'p-4']
    const prepassCss =
      LAYER_OPEN +
      '.flex{display:flex;&:hover{outline:none}}' +
      '.p-4{padding:1rem}' +
      '}'
    const emitted =
      LAYER_OPEN +
      '.flex{display:flex}' +
      '.flex:hover{outline:none}' +
      '.p-4{padding:1rem}' +
      '}'
    const registry = registryFor(tokens)
    const verdicts = computeConsolidationVerdicts(
      [{ tokens, count: 2 }],
      modelStylesheet(prepassCss),
      allowAll,
    )
    assert.strictEqual(verdicts[0].safe, false)
    assert.strictEqual(verdicts[0].reason, 'complex-subject')
    assert.doesNotThrow(function () {
      verifyConsolidation(emitted, verdicts, registry, 'app.css')
    })
  })

  it('throws when a tampered emitted stylesheet flips a safe verdict', function () {
    const registry = registryFor(TOKENS)
    const verdicts = frozenVerdicts(registry)
    const tampered =
      LAYER_OPEN +
      '.flex{display:flex}' +
      '.card-reset{display:grid}' +
      '.items-center{align-items:center}' +
      '.p-4{padding:1rem}' +
      '}'
    assert.throws(function () {
      verifyConsolidation(tampered, verdicts, registry, 'app.css')
    }, /divergence/)
  })

  it('throws when a member rule is missing from the emitted stylesheet', function () {
    const registry = registryFor(TOKENS)
    const verdicts = frozenVerdicts(registry)
    const tampered =
      LAYER_OPEN + '.flex{display:flex}' + '.p-4{padding:1rem}' + '}'
    assert.throws(function () {
      verifyConsolidation(tampered, verdicts, registry, 'app.css')
    }, /divergence.*no-stylesheet-rule/s)
  })

  it('re-runs the name collision policy against the registry', function () {
    const name = consolidatedName(['flex', 'items-center', 'p-4'])
    const registry = registryFor(TOKENS, [name])
    const verdicts = computeConsolidationVerdicts(
      [{ tokens: ['flex', 'items-center', 'p-4'], count: 3 }],
      modelStylesheet(EMITTED),
      function (token) {
        return registry.nameFor(token) !== undefined
      },
    )
    assert.throws(function () {
      verifyConsolidation(EMITTED, verdicts, registry, 'app.css')
    }, /collision/)
  })
})

describe('rename → consolidate → re-verify pipeline (U6 contract)', function () {
  it('composes U4 rename, U5 consolidation, and re-verification end to end', function () {
    const tokens = ['flex', 'items-center', 'p-4', 'site-note']
    const emitted =
      LAYER_OPEN +
      '.flex{display:flex}' +
      '.items-center{align-items:center}' +
      '.p-4{padding:1rem}' +
      '}' +
      '.site-note{color:blue}'
    const registry = registryFor(tokens)
    const verdicts = computeConsolidationVerdicts(
      [{ tokens: ['flex', 'items-center', 'p-4'], count: 3 }],
      modelStylesheet(emitted),
      function (token) {
        return registry.nameFor(token) !== undefined
      },
    )
    assertConsolidatedNames(registry, verdicts)

    const renamed = transformStylesheet({ css: emitted, registry }).css
    const consolidated = consolidateStylesheet({
      css: renamed,
      verdicts,
      registry,
    }).css
    verifyConsolidation(emitted, verdicts, registry, 'app.css')
    registry.assertBijection()

    const cname = consolidatedName(['flex', 'items-center', 'p-4'])
    assert.strictEqual(
      consolidated,
      LAYER_OPEN +
        `.${cname}{display:flex;align-items:center;padding:1rem}` +
        '}' +
        `.${nameOf(registry, 'site-note')}{color:blue}`,
    )

    const source = `const el = <div class="flex items-center p-4">x</div>\n`
    const transformed = transformSource({
      code: source,
      id: '/site/src/routes/i.tsx',
      registry,
      consolidationVerdicts: verdicts,
    })
    assert.ok(transformed !== null)
    assert.strictEqual(
      transformed.code,
      `const el = <div class="${cname}">x</div>\n`,
    )
  })
})
