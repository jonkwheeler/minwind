import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import * as csstree from 'css-tree'
import { unescapeCssIdentifier } from '../../src/measure/css-model.js'
import { discoverBuild } from '../../src/measure/discover.js'
import { buildClassModel } from '../../src/measure/exclusions.js'
import { simulateBaseline } from '../../src/measure/arms/baseline.js'
import { simulateConsolidate } from '../../src/measure/arms/consolidate.js'
import { simulateRename } from '../../src/measure/arms/rename.js'
import type { SourceSpan } from '../../src/measure/html-model.js'
import {
  buildSimulationInput,
  type ArmResult,
  type SimulationInput,
} from '../../src/measure/span-edit.js'
import { BUILD_DIR, assertDemoBuild, buildGate } from './helpers/build-gate.js'

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES_DIR = path.join(TEST_DIR, 'fixtures')
const RENAME_SITE = path.join(FIXTURES_DIR, 'arm-rename')
const CONSOLIDATE_SITE = path.join(FIXTURES_DIR, 'arm-consolidate')
const COLLISION_SITE = path.join(FIXTURES_DIR, 'arm-collision')
const COMPLEX_SITE = path.join(FIXTURES_DIR, 'arm-complex')
const ENTITY_SITE = path.join(FIXTURES_DIR, 'arm-entity')

function inputFor(dir: string): SimulationInput {
  const build = discoverBuild(dir)
  return buildSimulationInput(build, buildClassModel(build))
}

function fileText(result: ArmResult, dir: string, relative: string): string {
  const contents = result.files.get(path.join(dir, relative))
  assert.ok(contents !== undefined, `simulated file map contains ${relative}`)
  return contents
}

// Verifies every changed byte falls inside one of the allowed original spans:
// each inter-span segment must survive byte-for-byte and in order.
function assertChangesWithinSpans(
  original: string,
  output: string,
  spans: Array<SourceSpan>,
  context: string,
): void {
  const sorted = spans.slice().sort(function (a, b) {
    return a.start - b.start
  })
  let origPos = 0
  let outPos = 0
  for (let i = 0; i < sorted.length; i += 1) {
    const span = sorted[i]
    const prefix = original.slice(origPos, span.start)
    assert.ok(
      output.startsWith(prefix, outPos),
      `${context}: bytes before span ${i} changed`,
    )
    outPos += prefix.length
    origPos = span.end
    const nextStart =
      i + 1 < sorted.length ? sorted[i + 1].start : original.length
    const anchor = original.slice(span.end, nextStart)
    const anchorAt = output.indexOf(anchor, outPos)
    assert.ok(
      anchorAt >= outPos,
      `${context}: bytes after span ${i} changed or reordered`,
    )
    outPos = anchorAt
  }
  const tail = original.slice(origPos)
  assert.strictEqual(
    output.slice(outPos),
    tail,
    `${context}: bytes after the last span changed`,
  )
}

function assertIdentityOver(dir: string): void {
  const build = discoverBuild(dir)
  const input = buildSimulationInput(build, buildClassModel(build))
  const result = simulateBaseline(input)
  assert.strictEqual(
    result.files.size,
    build.htmlFiles.length + build.cssFiles.length,
    'baseline simulates every discovered HTML and CSS file',
  )
  for (const [filePath, contents] of result.files) {
    assert.strictEqual(
      contents,
      fs.readFileSync(filePath, 'utf8'),
      `identity output for ${filePath}`,
    )
  }
  assert.strictEqual(result.summary.filesChanged, 0)
  assert.strictEqual(result.summary.byteDelta, 0)
  assert.strictEqual(result.summary.classesRenamed, 0)
  assert.strictEqual(result.summary.listsConsolidated, 0)
}

describe('baseline arm (identity transform)', () => {
  const fixtureDirs = fs
    .readdirSync(FIXTURES_DIR, { withFileTypes: true })
    .filter(function (entry) {
      // bad-utf8 is intentionally unreadable by the discovery gate
      return entry.isDirectory() && entry.name !== 'bad-utf8'
    })
    .map(function (entry) {
      return entry.name
    })

  for (const name of fixtureDirs) {
    it(`returns byte-identical output for fixture ${name}`, () => {
      assertIdentityOver(path.join(FIXTURES_DIR, name))
    })
  }

  it(
    'returns byte-identical output for the real dist build (read-only)',
    buildGate(),
    () => {
      assertDemoBuild()
      assertIdentityOver(BUILD_DIR)
    },
  )
})

const RENAME_EXPECTED_HTML = `<!doctype html>
<html lang="en">
  <head>
    <link rel="stylesheet" href="/assets/app.css" />
  </head>
  <body class="a b">
    <p class="a b">one</p>
    <div class="a b">two</div>
    <span class="custom-chip a b">three</span>
    <p class="d a">four</p>
    <div class="group c">five</div>
    <span class="js-locked a">six</span>
    <b class="js-locked a">seven</b>
    <script>
      const keep = 'js-locked'
    </script>
  </body>
</html>
`

const RENAME_EXPECTED_CSS = `@layer utilities {
  .a {
    margin: 0.5rem;
  }
  .b {
    padding: 1rem;
  }
  .d {
    display: block;
  }
  .group:hover .c {
    filter: none;
  }
  .js-locked {
    position: fixed;
  }
}
.custom-chip {
  border: 0;
}
`

describe('rename arm', () => {
  it('rewrites eligible tokens and candidate identifiers with byte fidelity', () => {
    const input = inputFor(RENAME_SITE)
    const result = simulateRename(input)
    // Frequency order: m-2 (7) -> a; p-4 (4) -> b (tag names like <b> are
    // not in the KTD5 presence corpus); group-hover:glow (1) < solo (1) by
    // code unit -> c, d.
    assert.strictEqual(
      fileText(result, RENAME_SITE, 'index.html'),
      RENAME_EXPECTED_HTML,
    )
    assert.strictEqual(
      fileText(result, RENAME_SITE, path.join('assets', 'app.css')),
      RENAME_EXPECTED_CSS,
    )
    assert.strictEqual(result.summary.classesRenamed, 4)
    assert.strictEqual(result.summary.filesChanged, 2)
    assert.deepStrictEqual(result.summary.unmodelableTokens, [])
    const originalHtml = fs.readFileSync(
      path.join(RENAME_SITE, 'index.html'),
      'utf8',
    )
    const originalCss = fs.readFileSync(
      path.join(RENAME_SITE, 'assets', 'app.css'),
      'utf8',
    )
    assert.strictEqual(
      result.summary.byteDelta,
      RENAME_EXPECTED_HTML.length -
        originalHtml.length +
        (RENAME_EXPECTED_CSS.length - originalCss.length),
    )
  })

  it('assigns identical names on repeated runs of the same input', () => {
    const input = inputFor(RENAME_SITE)
    const first = simulateRename(input)
    const second = simulateRename(input)
    assert.deepStrictEqual(Array.from(first.files), Array.from(second.files))
    assert.deepStrictEqual(first.summary, second.summary)
  })

  it('confines changed bytes to class-attribute and selector spans', () => {
    const input = inputFor(RENAME_SITE)
    const result = simulateRename(input)
    const htmlPath = path.join(RENAME_SITE, 'index.html')
    const cssPath = path.join(RENAME_SITE, 'assets', 'app.css')
    const attributeSpans = (input.htmlClassAttributes.get(htmlPath) ?? []).map(
      function (occurrence) {
        return occurrence.span
      },
    )
    assertChangesWithinSpans(
      input.htmlSources.get(htmlPath) ?? '',
      fileText(result, RENAME_SITE, 'index.html'),
      attributeSpans,
      'rename html',
    )
    const selectorSpans = (input.cssModels.get(cssPath)?.rules ?? []).flatMap(
      function (rule) {
        return rule.arms.map(function (arm) {
          return arm.span
        })
      },
    )
    assertChangesWithinSpans(
      input.cssSources.get(cssPath) ?? '',
      fileText(result, RENAME_SITE, path.join('assets', 'app.css')),
      selectorSpans,
      'rename css',
    )
  })

  it('leaves no renamed class token without a corresponding rule', () => {
    const input = inputFor(RENAME_SITE)
    const result = simulateRename(input)
    const originalTokens = new Set(
      input.model.entries.map(function (entry) {
        return entry.token
      }),
    )
    const html = fileText(result, RENAME_SITE, 'index.html')
    const outputTokens = new Set<string>()
    for (const match of html.matchAll(/class="([^"]*)"/g)) {
      for (const token of match[1].split(/\s+/)) {
        if (token !== '') outputTokens.add(token)
      }
    }
    const css = fileText(result, RENAME_SITE, path.join('assets', 'app.css'))
    const ruledClasses = new Set<string>()
    const ast = csstree.parse(css, { positions: false })
    function walk(node: csstree.CssNode): void {
      if (node.type === 'ClassSelector') {
        ruledClasses.add(unescapeCssIdentifier(node.name ?? ''))
      }
      if (node.children) node.children.forEach(walk)
      if (node.prelude) walk(node.prelude)
      if (node.block) walk(node.block)
    }
    walk(ast)
    for (const token of outputTokens) {
      if (originalTokens.has(token)) continue
      assert.ok(
        ruledClasses.has(token),
        `renamed token ${token} has a rule in the output stylesheet`,
      )
    }
  })

  it('skips a generated name already present per KTD5 presence semantics', () => {
    const input = inputFor(COLLISION_SITE)
    const result = simulateRename(input)
    // 'a' is an inline-script literal and 'b' is an existing (css-only) class
    // token, so the single eligible class w-1 takes 'c'.
    const html = fileText(result, COLLISION_SITE, 'index.html')
    assert.ok(html.includes('class="c"'), 'w-1 renamed to c in HTML')
    assert.ok(!html.includes('class="a"'))
    assert.ok(!html.includes('class="b"'))
    const css = fileText(result, COLLISION_SITE, path.join('assets', 'app.css'))
    assert.ok(css.includes('.c {'), 'w-1 rule renamed to .c')
    assert.ok(css.includes('.b {'), 'existing .b rule untouched')
    assert.strictEqual(result.summary.classesRenamed, 1)
  })

  it('renames a candidate nested inside a :where() selector', () => {
    const input = inputFor(COMPLEX_SITE)
    const result = simulateRename(input)
    const css = fileText(result, COMPLEX_SITE, path.join('assets', 'app.css'))
    assert.ok(
      css.includes(':where(.c > :not(:last-child))'),
      'space-y-2 renamed inside the :where() wrapper, structure preserved',
    )
    const html = fileText(result, COMPLEX_SITE, 'index.html')
    assert.ok(html.includes('class="a c"'))
    assert.strictEqual(result.summary.classesRenamed, 3)
  })

  it('routes a class to unmodelable when recorded content mismatches (KTD2)', () => {
    const input = inputFor(ENTITY_SITE)
    const result = simulateRename(input)
    // The body attribute value `m-2&#32;p-4` decodes to two tokens whose raw
    // source cannot be mapped back positionally, so both classes keep their
    // original bytes in every file.
    for (const [filePath, contents] of result.files) {
      assert.strictEqual(
        contents,
        fs.readFileSync(filePath, 'utf8'),
        `original bytes kept for ${filePath}`,
      )
    }
    assert.strictEqual(result.summary.classesRenamed, 0)
    assert.deepStrictEqual(result.summary.unmodelableTokens, ['m-2', 'p-4'])
  })

  it(
    'produces byte-identical output on the real dist build',
    buildGate(),
    () => {
      assertDemoBuild()
      const input = inputFor(BUILD_DIR)
      const baseline = simulateBaseline(input)
      const result = simulateRename(input)
      // On dist every HTML-used class is JS-referenced, so nothing is eligible
      // and rename must equal the identity baseline exactly.
      assert.deepStrictEqual(
        Array.from(result.files),
        Array.from(baseline.files),
      )
      assert.strictEqual(result.summary.filesChanged, 0)
      assert.strictEqual(result.summary.classesRenamed, 0)
      assert.strictEqual(result.summary.byteDelta, 0)
    },
  )
})

const CONSOLIDATE_EXPECTED_HTML = `<!doctype html>
<html lang="en">
  <head>
    <link rel="stylesheet" href="/assets/app.css" />
  </head>
  <body class="a">
    <p class="a">one</p>
    <div class="a">two</div>
    <span class="a">three</span>
    <p class="solo m-2">four</p>
    <span class="js-locked m-2">five</span>
    <b class="js-locked m-2">six</b>
    <script>
      const keep = 'js-locked'
    </script>
  </body>
</html>
`

const CONSOLIDATE_EXPECTED_CSS = `@layer utilities {
  .m-2 {
    margin: 0.5rem;
  }
  .p-4 {
    padding: 1rem;
  }
  .solo {
    display: block;
  }
  .js-locked {
    position: fixed;
  }

  .a {
    margin: 0.5rem;
    padding: 1rem;
  }
}
`

describe('consolidate arm', () => {
  it('merges a repeated utility-only list into one shared class', () => {
    const input = inputFor(CONSOLIDATE_SITE)
    const result = simulateConsolidate(input)
    assert.strictEqual(
      fileText(result, CONSOLIDATE_SITE, 'index.html'),
      CONSOLIDATE_EXPECTED_HTML,
    )
    const css = fileText(
      result,
      CONSOLIDATE_SITE,
      path.join('assets', 'app.css'),
    )
    assert.strictEqual(css, CONSOLIDATE_EXPECTED_CSS)
    // The original utility rules are retained alongside the shared rule.
    assert.ok(css.includes('.m-2 {'))
    assert.ok(css.includes('.p-4 {'))
    assert.strictEqual(result.summary.listsConsolidated, 1)
    assert.strictEqual(result.summary.filesChanged, 2)
    assert.deepStrictEqual(result.summary.unmodelableLists, ['js-locked m-2'])
    const originalHtml = fs.readFileSync(
      path.join(CONSOLIDATE_SITE, 'index.html'),
      'utf8',
    )
    const originalCss = fs.readFileSync(
      path.join(CONSOLIDATE_SITE, 'assets', 'app.css'),
      'utf8',
    )
    assert.strictEqual(
      result.summary.byteDelta,
      CONSOLIDATE_EXPECTED_HTML.length -
        originalHtml.length +
        (CONSOLIDATE_EXPECTED_CSS.length - originalCss.length),
    )
  })

  it('consolidates independently of the rename arm name allocation', () => {
    const input = inputFor(CONSOLIDATE_SITE)
    const result = simulateConsolidate(input)
    // The shared class is 'a' even though rename would also start at 'a':
    // each arm allocates generated names independently (arm contract).
    const html = fileText(result, CONSOLIDATE_SITE, 'index.html')
    assert.ok(html.includes('class="a"'))
  })

  it('assigns identical output on repeated runs of the same input', () => {
    const input = inputFor(CONSOLIDATE_SITE)
    const first = simulateConsolidate(input)
    const second = simulateConsolidate(input)
    assert.deepStrictEqual(Array.from(first.files), Array.from(second.files))
    assert.deepStrictEqual(first.summary, second.summary)
  })

  it('confines changed bytes to class-attribute spans and the layer-end insertion point', () => {
    const input = inputFor(CONSOLIDATE_SITE)
    const result = simulateConsolidate(input)
    const htmlPath = path.join(CONSOLIDATE_SITE, 'index.html')
    const attributeSpans = (input.htmlClassAttributes.get(htmlPath) ?? []).map(
      function (occurrence) {
        return occurrence.span
      },
    )
    assertChangesWithinSpans(
      input.htmlSources.get(htmlPath) ?? '',
      fileText(result, CONSOLIDATE_SITE, 'index.html'),
      attributeSpans,
      'consolidate html',
    )
    // CSS changes are a single insertion immediately before the closing
    // brace of the utilities layer block.
    const originalCss = input.cssSources.get(
      path.join(CONSOLIDATE_SITE, 'assets', 'app.css'),
    )
    assert.ok(originalCss !== undefined)
    const outputCss = fileText(
      result,
      CONSOLIDATE_SITE,
      path.join('assets', 'app.css'),
    )
    const insertion = originalCss.lastIndexOf('}')
    assert.strictEqual(originalCss[insertion - 1], '\n')
    const insertedLength = outputCss.length - originalCss.length
    assert.ok(insertedLength > 0)
    assert.strictEqual(
      outputCss.slice(0, insertion),
      originalCss.slice(0, insertion),
      'bytes before the insertion point are unchanged',
    )
    assert.strictEqual(
      outputCss.slice(insertion + insertedLength),
      originalCss.slice(insertion),
      'bytes after the insertion point are unchanged',
    )
    assert.strictEqual(
      outputCss.slice(insertion, insertion + insertedLength),
      '\n  .a {\n    margin: 0.5rem;\n    padding: 1rem;\n  }\n',
    )
  })

  it('never merges when the utilities layer holds a non-bare rule', () => {
    const input = inputFor(RENAME_SITE)
    const result = simulateConsolidate(input)
    // .group:hover .group-hover\:glow sits in the utilities layer, so the
    // layer is not bare-only and no list qualifies (KTD8).
    for (const [filePath, contents] of result.files) {
      assert.strictEqual(contents, fs.readFileSync(filePath, 'utf8'))
    }
    assert.strictEqual(result.summary.listsConsolidated, 0)
    assert.deepStrictEqual(result.summary.unmodelableLists, [
      'js-locked m-2',
      'm-2 p-4',
    ])
  })

  it('never merges a list containing a complex-subject utility (KTD8)', () => {
    const input = inputFor(COMPLEX_SITE)
    const result = simulateConsolidate(input)
    // space-y-2's rule subject is `:where(.space-y-2>:not(:last-child))`, not
    // the bare class, so lists containing it route to unmodelable.
    for (const [filePath, contents] of result.files) {
      assert.strictEqual(contents, fs.readFileSync(filePath, 'utf8'))
    }
    assert.strictEqual(result.summary.listsConsolidated, 0)
    assert.deepStrictEqual(result.summary.unmodelableLists, [
      'm-2 p-4',
      'm-2 space-y-2',
    ])
  })

  it('replaces an entity-encoded attribute value span wholesale', () => {
    const input = inputFor(ENTITY_SITE)
    const result = simulateConsolidate(input)
    const html = fileText(result, ENTITY_SITE, 'index.html')
    assert.ok(
      html.includes('<body class="a">'),
      'entity-encoded list replaced by the shared class',
    )
    assert.ok(html.includes('<p class="a">'))
    assert.strictEqual(result.summary.listsConsolidated, 1)
  })

  it(
    'produces byte-identical output on the real dist build',
    buildGate(),
    () => {
      assertDemoBuild()
      const input = inputFor(BUILD_DIR)
      const baseline = simulateBaseline(input)
      const result = simulateConsolidate(input)
      assert.deepStrictEqual(
        Array.from(result.files),
        Array.from(baseline.files),
      )
      assert.strictEqual(result.summary.filesChanged, 0)
      assert.strictEqual(result.summary.listsConsolidated, 0)
      assert.strictEqual(result.summary.byteDelta, 0)
    },
  )
})
