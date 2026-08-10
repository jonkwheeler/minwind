import assert from "node:assert";
import { describe, it } from "node:test";
import {
  parseSourceModule,
  tokenize,
  walkClassContexts,
  type RuntimeContextKind,
} from "../src/class-contexts.js";
import {
  canonicalListKey,
  type ConsolidationVerdict,
} from "../src/consolidate.js";
import { createNameRegistry, type NameRegistry } from "../src/names.js";
import {
  applySourceEdits,
  shouldTransformModule,
  transformSource,
  type TransformSourceResult,
} from "../src/transform-source.js";

// A fixed toy registry as the U2 pre-pass would build it: eight renameable
// tokens, one excluded-prefix token (dissolve-reduced), and two
// runtime-context tokens (mb-4, js-assigned) that keep their original bytes.
const TOKENS = [
  "flex",
  "flex-col",
  "items-center",
  "p-4",
  "hover:border-accent",
  "mb-16",
  "opacity-50",
  "site-card",
  "dissolve-reduced",
  "mb-4",
  "js-assigned",
];
const RUNTIME_TOKENS = ["mb-4", "js-assigned"];

function testRegistry(): NameRegistry {
  return createNameRegistry({
    universe: new Set(TOKENS),
    sourceTokens: new Set(TOKENS),
    runtimeTokens: new Set(RUNTIME_TOKENS),
    exclusions: { names: [], prefixes: ["dissolve-"] },
  });
}

const REGISTRY = testRegistry();

function nameOf(token: string): string {
  const name = REGISTRY.nameFor(token);
  assert.ok(
    name !== undefined,
    `${token} must be renamed in the test registry`,
  );
  return name;
}

function transform(
  code: string,
  id: string = "/site/src/routes/test.tsx",
): TransformSourceResult | null {
  return transformSource({ code, id, registry: REGISTRY });
}

function safeVerdict(
  tokens: Array<string>,
  name: string,
): ConsolidationVerdict {
  return { tokens, frequency: 2, safe: true, name };
}

function transformWithVerdicts(
  code: string,
  verdicts: ReadonlyArray<ConsolidationVerdict>,
): TransformSourceResult | null {
  return transformSource({
    code,
    id: "/site/src/routes/test.tsx",
    registry: REGISTRY,
    consolidationVerdicts: verdicts,
  });
}

describe("shouldTransformModule", function () {
  it("accepts src TS/JS-family modules and rejects everything else", function () {
    assert.ok(shouldTransformModule("/site/src/routes/index.tsx"));
    assert.ok(shouldTransformModule("/site/src/utils/dissolve.ts"));
    assert.ok(shouldTransformModule("src/app.tsx"));
    assert.ok(shouldTransformModule("C:\\site\\src\\app.tsx"));
    assert.ok(shouldTransformModule("/site/src/app.tsx?import"));
    assert.ok(shouldTransformModule("/site/src/routes/plain.js"));
    assert.ok(shouldTransformModule("/site/src/routes/widget.jsx"));
    assert.ok(shouldTransformModule("/site/src/lib/server.mts"));
    assert.ok(shouldTransformModule("/site/src/lib/legacy.cts"));
    assert.ok(shouldTransformModule("/site/src/lib/util.mjs"));
    assert.ok(shouldTransformModule("/site/src/lib/util.cjs"));
    assert.ok(!shouldTransformModule("/site/node_modules/pkg/index.tsx"));
    assert.ok(!shouldTransformModule("/site/node_modules/pkg/index.jsx"));
    assert.ok(!shouldTransformModule("/site/src/styles.css"));
    assert.ok(!shouldTransformModule("/site/src/types.d.ts"));
    assert.ok(!shouldTransformModule("/site/src/types.d.mts"));
    assert.ok(!shouldTransformModule("/site/src/types.d.cts"));
    assert.ok(!shouldTransformModule("/site/src/styles.scss"));
  });

  it("accepts SFC main modules and rejects framework-carved sub-modules", function () {
    assert.ok(shouldTransformModule("/site/src/component.vue"));
    assert.ok(shouldTransformModule("/site/src/component.svelte"));
    assert.ok(shouldTransformModule("/site/src/page.astro"));
    // ?vue&type=script slices are carved from the already-transformed main
    // module by the framework plugin; transforming them again would double
    // the walk.
    assert.ok(
      !shouldTransformModule("/site/src/component.vue?vue&type=script"),
    );
    assert.ok(!shouldTransformModule("/site/src/page.astro?astro&type=script"));
    assert.ok(!shouldTransformModule("/site/node_modules/pkg/component.vue"));
  });
});

describe("transformSource JS-family modules", function () {
  it("renames JSX class attributes in .jsx modules", function () {
    const result = transform(
      `export function A() {
  return <div class="flex flex-col">x</div>
}
`,
      "/site/src/routes/test.jsx",
    );
    assert.ok(result !== null);
    assert.strictEqual(
      result.code,
      `export function A() {
  return <div class="${nameOf("flex")} ${nameOf("flex-col")}">x</div>
}
`,
    );
  });

  it("parses JSX in .js modules (React-flavored projects compile it)", function () {
    const result = transform(
      `export function A() {
  return <div class="flex p-4">x</div>
}
`,
      "/site/src/routes/test.js",
    );
    assert.ok(result !== null);
    assert.ok(
      result.code.includes(`class="${nameOf("flex")} ${nameOf("p-4")}"`),
    );
  });

  it("renames cn() arguments in plain .js modules without JSX", function () {
    const result = transform(
      `import { cn } from "./cn.js"
export const cls = cn("flex", "mb-16")
`,
      "/site/src/lib/util.js",
    );
    assert.ok(result !== null);
    assert.ok(
      result.code.includes(`cn("${nameOf("flex")}", "${nameOf("mb-16")}")`),
    );
  });

  it("renames class attributes in .mjs and .cjs modules", function () {
    for (const id of ["/site/src/a.mjs", "/site/src/b.cjs"]) {
      const result = transform(
        `export const el = <span class="items-center">y</span>\n`,
        id,
      );
      assert.ok(result !== null, `${id} must transform`);
      assert.ok(result.code.includes(`class="${nameOf("items-center")}"`));
    }
  });

  it("renames cn() arguments in .mts and .cts modules", function () {
    const code = `export function A() {
  return <div class="flex">x</div>
}
`;
    // .mts/.cts are TypeScript: no JSX, but cn() and classList contexts apply.
    for (const id of ["/site/src/a.mts", "/site/src/b.cts"]) {
      const result = transform(
        `import { cn } from "./cn.js"\nexport const cls = cn("flex", "p-4")\n`,
        id,
      );
      assert.ok(result !== null, `${id} must transform`);
      assert.ok(
        result.code.includes(`cn("${nameOf("flex")}", "${nameOf("p-4")}")`),
      );
    }
    // A .mts file is never JSX-parsed: JSX-looking text stays untouched.
    const tsOnly = transform(code, "/site/src/c.mts");
    assert.ok(tsOnly === null || !tsOnly.code.includes(nameOf("flex")));
  });
});

describe("transformSource class attributes (R1, AE1)", function () {
  it("renames class attribute tokens in a query-suffixed module id", function () {
    // Real-site regression: vinxi's tree-shake emits the route component as
    // `index.tsx?pick=default&pick=$css`; a script-kind check on the raw id
    // parses that JSX as plain TS and silently renames nothing.
    const id = "/site/src/routes/index.tsx?pick=default&pick=$css";
    const result = transform(
      `export default function Home() {
  return <div class="flex flex-col">x</div>
}
`,
      id,
    );
    assert.ok(result !== null);
    assert.ok(
      result.code.includes(`class="${nameOf("flex")} ${nameOf("flex-col")}"`),
    );
    assert.deepStrictEqual(result.warnings, []);
  });

  it("renames class attribute tokens to registry names", function () {
    const code = `export function A() {
  return <div class="flex flex-col">x</div>
}
`;
    const result = transform(code);
    assert.ok(result !== null);
    assert.strictEqual(
      result.code,
      `export function A() {
  return <div class="${nameOf("flex")} ${nameOf("flex-col")}">x</div>
}
`,
    );
    assert.deepStrictEqual(result.warnings, []);
  });

  it("preserves every byte outside the edited token spans", function () {
    const before = "// ⌘ header\nconst answer = 42\n";
    const after = "\n// trailing comment\n";
    const code = `${before}const el = <div  class="flex   p-4"  />${after}`;
    const result = transform(code);
    assert.ok(result !== null);
    assert.strictEqual(
      result.code,
      `${before}const el = <div  class="${nameOf("flex")}   ${nameOf(
        "p-4",
      )}"  />${after}`,
    );
  });

  it("renames a variant token as one whole token", function () {
    const code = `const el = <a class="hover:border-accent">x</a>\n`;
    const result = transform(code);
    assert.ok(result !== null);
    assert.strictEqual(
      result.code,
      `const el = <a class="${nameOf("hover:border-accent")}">x</a>\n`,
    );
    assert.ok(!result.code.includes("hover:"));
    assert.ok(!result.code.includes("border-accent"));
  });

  it("keeps skipped tokens byte-identical inside an edited literal (R5)", function () {
    const code = `const el = <div class="flex dissolve-reduced mb-4">x</div>\n`;
    const result = transform(code);
    assert.ok(result !== null);
    assert.strictEqual(
      result.code,
      `const el = <div class="${nameOf(
        "flex",
      )} dissolve-reduced mb-4">x</div>\n`,
    );
    assert.deepStrictEqual(result.warnings, []);
  });

  it("renames a no-substitution template literal in class position", function () {
    const code = "const el = <p class={`flex p-4`}>x</p>\n";
    const result = transform(code);
    assert.ok(result !== null);
    assert.strictEqual(
      result.code,
      `const el = <p class={\`${nameOf("flex")} ${nameOf("p-4")}\`}>x</p>\n`,
    );
  });
});

describe("transformSource classList keys (R1)", function () {
  it("renames classList object keys and never touches value expressions", function () {
    const code = `const el = <span classList={{ 'opacity-50': isPending() }}>x</span>\n`;
    const result = transform(code);
    assert.ok(result !== null);
    assert.strictEqual(
      result.code,
      `const el = <span classList={{ '${nameOf(
        "opacity-50",
      )}': isPending() }}>x</span>\n`,
    );
    assert.deepStrictEqual(result.warnings, []);
  });

  it("renames an unquoted identifier key", function () {
    const code = `const el = <div classList={{ flex: wide() }}>x</div>\n`;
    const result = transform(code);
    assert.ok(result !== null);
    assert.strictEqual(
      result.code,
      `const el = <div classList={{ ${nameOf("flex")}: wide() }}>x</div>\n`,
    );
  });

  it("expands a shorthand key so the value binding survives", function () {
    const code = `const el = <div classList={{ flex }}>x</div>\n`;
    const result = transform(code);
    assert.ok(result !== null);
    assert.strictEqual(
      result.code,
      `const el = <div classList={{ ${nameOf("flex")}: flex }}>x</div>\n`,
    );
    assert.deepStrictEqual(result.warnings, []);
  });
});

describe("transformSource cn() arguments (R1)", function () {
  it("renames static arguments and skips dynamic ones", function () {
    const code = `import { cn } from '~/utils/cn'
const el = <div class={cn('mb-16', props.class)}>x</div>
`;
    const result = transform(code);
    assert.ok(result !== null);
    assert.strictEqual(
      result.code,
      `import { cn } from '~/utils/cn'
const el = <div class={cn('${nameOf("mb-16")}', props.class)}>x</div>
`,
    );
    assert.deepStrictEqual(result.warnings, []);
  });

  it("identifies cn through an aliased import binding", function () {
    const code = `import { cn as merge } from '~/utils/cn'
const el = <div class={merge('mb-16')}>x</div>
`;
    const result = transform(code);
    assert.ok(result !== null);
    assert.strictEqual(
      result.code,
      `import { cn as merge } from '~/utils/cn'
const el = <div class={merge('${nameOf("mb-16")}')}>x</div>
`,
    );
  });

  it("falls back to a bare-name match when cn is not imported", function () {
    const code = `const el = <div class={cn('mb-16')}>x</div>\n`;
    const result = transform(code);
    assert.ok(result !== null);
    assert.strictEqual(
      result.code,
      `const el = <div class={cn('${nameOf("mb-16")}')}>x</div>\n`,
    );
  });

  it("renames every literal branch of a multiline cn() call", function () {
    const code = `import { cn } from '~/utils/cn'
const el = (
  <div
    class={cn(
      'flex',
      wide() ? 'items-center' : 'flex-col',
      'p-4',
    )}
  >
    x
  </div>
)
`;
    const result = transform(code);
    assert.ok(result !== null);
    assert.strictEqual(
      result.code,
      `import { cn } from '~/utils/cn'
const el = (
  <div
    class={cn(
      '${nameOf("flex")}',
      wide() ? '${nameOf("items-center")}' : '${nameOf("flex-col")}',
      '${nameOf("p-4")}',
    )}
  >
    x
  </div>
)
`,
    );
    assert.deepStrictEqual(result.warnings, []);
  });
});

describe("transformSource nested cn() collapse (R3, regression)", function () {
  it("collapses an inner static cn() group reported twice without overlapping edits", function () {
    // At module scope the walker reports the inner literals twice: once
    // through the outer call's argument scan and once through the inner
    // call's own visit. The inner group's collapse must withdraw the edits
    // from either pass — otherwise the surviving per-token edits overlap
    // the collapse span and applySourceEdits throws.
    const code = `import { cn } from '~/utils/cn'
export const cardClass = cn('mb-16', cn('flex', 'p-4'))
`;
    const result = transformWithVerdicts(code, [
      safeVerdict(["flex", "p-4"], "mergedfp"),
    ]);
    assert.ok(result !== null);
    assert.strictEqual(
      result.code,
      `import { cn } from '~/utils/cn'
export const cardClass = cn('${nameOf("mb-16")}', cn('mergedfp'))
`,
    );
    assert.deepStrictEqual(result.warnings, []);
  });
});

describe("transformSource quote ordering", function () {
  // The 'quotes' naming strategy's order map: canonical list key -> tokens
  // in quote word order. Here [flex flex-col] reads as a two-word quote
  // whose first word is flex-col's name.
  const ORDER: ReadonlyMap<string, ReadonlyArray<string>> = new Map([
    [canonicalListKey(["flex", "flex-col"]), ["flex-col", "flex"]],
  ]);

  function transformWithOrder(
    code: string,
    verdicts: ReadonlyArray<ConsolidationVerdict> = [],
  ): TransformSourceResult | null {
    return transformSource({
      code,
      id: "/site/src/routes/test.tsx",
      registry: REGISTRY,
      consolidationVerdicts: verdicts,
      quoteOrder: ORDER,
    });
  }

  it("reorders a class attribute to quote order", function () {
    const result = transformWithOrder(
      'const el = <div class="flex flex-col">x</div>\n',
    );
    assert.ok(result !== null);
    assert.strictEqual(
      result.code,
      `const el = <div class="${nameOf("flex-col")} ${nameOf("flex")}">x</div>\n`,
    );
    assert.deepStrictEqual(result.warnings, []);
  });

  it("reorders a cn() call into one quoted literal", function () {
    const result = transformWithOrder(
      `import { cn } from '~/utils/cn'
const el = <div class={cn('flex', 'flex-col')}>x</div>
`,
    );
    assert.ok(result !== null);
    assert.strictEqual(
      result.code,
      `import { cn } from '~/utils/cn'
const el = <div class={cn('${nameOf("flex-col")} ${nameOf("flex")}')}>x</div>
`,
    );
    assert.deepStrictEqual(result.warnings, []);
  });

  it("keeps original order for a list outside the order map", function () {
    const result = transformWithOrder(
      'const el = <div class="flex p-4">x</div>\n',
    );
    assert.ok(result !== null);
    assert.strictEqual(
      result.code,
      `const el = <div class="${nameOf("flex")} ${nameOf("p-4")}">x</div>\n`,
    );
  });

  it("never reorders a classList group", function () {
    const result = transformWithOrder(
      `const el = <div classList={{ 'flex': true, 'flex-col': true }}>x</div>\n`,
    );
    assert.ok(result !== null);
    assert.strictEqual(
      result.code,
      `const el = <div classList={{ '${nameOf("flex")}': true, '${nameOf(
        "flex-col",
      )}': true }}>x</div>\n`,
    );
  });

  it("lets consolidation win over quote order", function () {
    const result = transformWithOrder(
      'const el = <div class="flex flex-col">x</div>\n',
      [safeVerdict(["flex", "flex-col"], "mergedfc")],
    );
    assert.ok(result !== null);
    assert.strictEqual(
      result.code,
      'const el = <div class="mergedfc">x</div>\n',
    );
  });

  it("reorders a static literal inside a partially dynamic group", function () {
    // cn('flex flex-col', props.class) never forms a static list, but its
    // first literal is one contiguous run in the rendered attribute, so it
    // reorders into its quote fragment in place.
    const result = transformWithOrder(
      `import { cn } from '~/utils/cn'
const el = <div class={cn('flex flex-col', props.class)}>x</div>
`,
    );
    assert.ok(result !== null);
    assert.strictEqual(
      result.code,
      `import { cn } from '~/utils/cn'
const el = <div class={cn('${nameOf("flex-col")} ${nameOf(
        "flex",
      )}', props.class)}>x</div>
`,
    );
  });

  it("reorders each covered literal of a conditional cn() group", function () {
    const order: ReadonlyMap<string, ReadonlyArray<string>> = new Map([
      [canonicalListKey(["flex", "flex-col"]), ["flex-col", "flex"]],
      [canonicalListKey(["mb-16", "p-4"]), ["p-4", "mb-16"]],
    ]);
    const result = transformSource({
      code: `import { cn } from '~/utils/cn'
const el = <div class={cn('flex flex-col', cond ? 'mb-16 p-4' : 'p-4')}>x</div>
`,
      id: "/site/src/routes/test.tsx",
      registry: REGISTRY,
      quoteOrder: order,
    });
    assert.ok(result !== null);
    assert.strictEqual(
      result.code,
      `import { cn } from '~/utils/cn'
const el = <div class={cn('${nameOf("flex-col")} ${nameOf(
        "flex",
      )}', cond ? '${nameOf("p-4")} ${nameOf("mb-16")}' : '${nameOf(
        "p-4",
      )}')}>x</div>
`,
    );
    assert.deepStrictEqual(result.warnings, []);
  });

  it("keeps original order for an uncovered literal in a dynamic group", function () {
    const result = transformWithOrder(
      `import { cn } from '~/utils/cn'
const el = <div class={cn('flex p-4', props.class)}>x</div>
`,
    );
    assert.ok(result !== null);
    assert.strictEqual(
      result.code,
      `import { cn } from '~/utils/cn'
const el = <div class={cn('${nameOf("flex")} ${nameOf(
        "p-4",
      )}', props.class)}>x</div>
`,
    );
  });
});

describe("transformSource classList collapse guard (R3, regression)", function () {
  it("never collapses a static classList group with an unquoted identifier key", function () {
    // The collapse span math assumes quotes; an identifier key carries none,
    // so the group keeps its (always safe) per-token renames instead of
    // collapsing to invalid JS like {{ 'mergedic' true }}.
    const code = `const el = <div classList={{ 'items-center': true, flex: true }}>x</div>
`;
    const result = transformWithVerdicts(code, [
      safeVerdict(["flex", "items-center"], "mergedic"),
    ]);
    assert.ok(result !== null);
    assert.strictEqual(
      result.code,
      `const el = <div classList={{ '${nameOf(
        "items-center",
      )}': true, ${nameOf("flex")}: true }}>x</div>
`,
    );
    assert.ok(!result.code.includes("mergedic"));
    assert.deepStrictEqual(result.warnings, []);
  });
});

describe("transformSource non-ASCII whitespace (R5, regression)", function () {
  it("treats an NBSP-joined class list as one DOM token: no renames, no collapse", function () {
    // NBSP is not an HTML5 class separator, so the attribute is a single
    // DOM token the registry does not know; collapsing it would apply
    // styles the element never had.
    const code = 'const el = <div class="items-center\u00A0flex">x</div>\n';
    const result = transformWithVerdicts(code, [
      safeVerdict(["flex", "items-center"], "mergednb"),
    ]);
    assert.ok(result !== null);
    assert.strictEqual(result.code, code);
    assert.strictEqual(result.warnings.length, 2);
    for (const warning of result.warnings) {
      assert.strictEqual(warning.kind, "reverse-leak");
    }
  });

  it("tokenize splits on the HTML5 ASCII whitespace set only", function () {
    // tokenize() is shared with the pre-pass, so this pins the pre-pass
    // tokenization to the same DOM semantics.
    assert.deepStrictEqual(tokenize("flex \titems-center\np-4\fmb-16\r"), [
      "flex",
      "items-center",
      "p-4",
      "mb-16",
    ]);
    assert.deepStrictEqual(tokenize("items-center\u00A0flex"), [
      "items-center\u00A0flex",
    ]);
  });
});

describe("transformSource detection-only contexts (KTD4, AE2)", function () {
  it("returns null for a module with only detection-only usage", function () {
    const code = `export function attach(el: HTMLElement) {
  el.classList.add('dissolve-reduced')
  el.className = 'js-assigned'
}
`;
    const result = transform(code, "/site/src/utils/dissolve.ts");
    assert.strictEqual(result, null);
  });

  it("leaves detection-only spans byte-identical inside an edited module", function () {
    const code = `export function attach(el: HTMLElement) {
  el.classList.add('dissolve-reduced')
  el.className = 'js-assigned'
  return <div class="flex">x</div>
}
`;
    const result = transform(code);
    assert.ok(result !== null);
    assert.ok(result.code.includes(`el.classList.add('dissolve-reduced')`));
    assert.ok(result.code.includes(`el.className = 'js-assigned'`));
    assert.ok(result.code.includes(`class="${nameOf("flex")}"`));
    assert.deepStrictEqual(result.warnings, []);
  });
});

describe("transformSource unprovable and leaked usage (R5, KTD7)", function () {
  it("skips a template literal with expressions in class position and warns", function () {
    const code = "const el = <p class={`mb-4 ${props.extra}`}>x</p>\n";
    const result = transform(code);
    assert.ok(result !== null);
    assert.strictEqual(result.code, code);
    assert.strictEqual(result.warnings.length, 1);
    const warning = result.warnings[0];
    assert.strictEqual(warning.kind, "unprovable-template");
    assert.strictEqual(warning.line, 1);
    assert.strictEqual(warning.column, code.indexOf("`mb-4") + 1);
    assert.match(warning.message, /template literal/);
    assert.match(warning.message, /class-attribute/);
  });

  it("never rewrites strings outside the rename contexts, warning on leaks", function () {
    const code = `export const article = 'Tailwind flex and items-center utilities'\n`;
    const result = transform(code, "/site/src/data/article.ts");
    assert.ok(result !== null);
    assert.strictEqual(result.code, code);
    assert.strictEqual(result.warnings.length, 2);
    const [flex, itemsCenter] = result.warnings;
    assert.strictEqual(flex.kind, "reverse-leak");
    assert.strictEqual(flex.token, "flex");
    assert.strictEqual(flex.line, 1);
    assert.strictEqual(flex.column, code.indexOf("flex") + 1);
    assert.strictEqual(itemsCenter.kind, "reverse-leak");
    assert.strictEqual(itemsCenter.token, "items-center");
    assert.strictEqual(itemsCenter.column, code.indexOf("items-center") + 1);
  });

  it("warns when a registry token survives in a non-rename call", function () {
    const code = `const el = <div class={clsx('mb-16')}>x</div>\n`;
    const result = transform(code);
    assert.ok(result !== null);
    assert.strictEqual(result.code, code);
    // KTD4: a non-cn call in class position is unprovable, so its literal
    // poisons the token (unprovable-expression); the kept registry bytes
    // still surface as a reverse leak.
    assert.strictEqual(result.warnings.length, 2);
    const [unprovable, leak] = result.warnings;
    assert.strictEqual(unprovable.kind, "unprovable-expression");
    assert.match(unprovable.message, /mb-16/);
    assert.strictEqual(leak.kind, "reverse-leak");
    assert.strictEqual(leak.token, "mb-16");
    assert.strictEqual(leak.column, code.indexOf("mb-16") + 1);
  });

  it("does not warn for tokens embedded in larger words", function () {
    const code = `// flexible layout helpers
export const flexible = 1
`;
    assert.strictEqual(transform(code, "/site/src/utils/text.ts"), null);
  });
});

describe("walkClassContexts unprovable class expressions (KTD4)", function () {
  function scanRuntime(code: string): {
    poisoned: Array<string>;
    kinds: Array<RuntimeContextKind>;
    renamed: Array<string>;
  } {
    const sourceFile = parseSourceModule("/site/src/routes/test.tsx", code);
    const poisoned: Array<string> = [];
    const kinds: Array<RuntimeContextKind> = [];
    const renamed: Array<string> = [];
    walkClassContexts(sourceFile, {
      renameLiteral: function (literal) {
        renamed.push(literal.text);
      },
      runtimeLiteral: function (literal, kind) {
        kinds.push(kind);
        for (const token of tokenize(literal.text)) poisoned.push(token);
      },
    });
    return { poisoned, kinds, renamed };
  }

  it("poisons the literal branches of a conditional in class position", function () {
    const scan = scanRuntime(`const a = <i class="flex">a</i>
const b = <div class={cond ? 'flex' : 'block'}>b</div>
`);
    assert.deepStrictEqual(scan.poisoned, ["flex", "block"]);
    assert.deepStrictEqual(scan.kinds, [
      "class-expression",
      "class-expression",
    ]);
    // The provable attribute still reports through the rename channel.
    assert.deepStrictEqual(scan.renamed, ["flex"]);
  });

  it("poisons the arguments of a non-cn call in class position", function () {
    const scan = scanRuntime(
      `const el = <div class={clsx('flex', 'block')}>x</div>\n`,
    );
    assert.deepStrictEqual(scan.poisoned, ["flex", "block"]);
    assert.deepStrictEqual(scan.kinds, [
      "class-expression",
      "class-expression",
    ]);
    assert.deepStrictEqual(scan.renamed, []);
  });

  it("poisons nested keys of a non-object classList expression", function () {
    const scan = scanRuntime(
      `const el = <div classList={cond ? { 'flex': true } : fallback}>x</div>\n`,
    );
    assert.deepStrictEqual(scan.poisoned, ["flex"]);
    assert.deepStrictEqual(scan.kinds, ["classList-expression"]);
    assert.deepStrictEqual(scan.renamed, []);
  });
});

describe("transformSource unprovable class expressions (KTD4, KTD7)", function () {
  it("warns on each poisoned literal and keeps every byte", function () {
    const code = `const el = <div class={cond ? 'flex' : 'block'}>x</div>\n`;
    const result = transform(code);
    assert.ok(result !== null);
    assert.strictEqual(result.code, code);
    const unprovable = result.warnings.filter(function (warning) {
      return warning.kind === "unprovable-expression";
    });
    assert.strictEqual(unprovable.length, 2);
    assert.strictEqual(unprovable[0].line, 1);
    assert.strictEqual(unprovable[0].column, code.indexOf(`'flex'`) + 2);
    assert.match(unprovable[0].message, /class-expression/);
    assert.match(unprovable[0].message, /flex/);
    assert.match(unprovable[1].message, /block/);
  });
});

describe("transformSource unchanged modules", function () {
  it("returns null when the module has no class contexts", function () {
    assert.strictEqual(transform("export const answer = 42\n"), null);
  });

  it("returns null for modules outside the src filter", function () {
    const code = `const el = <div class="flex">x</div>\n`;
    assert.strictEqual(transform(code, "/site/node_modules/pkg/x.tsx"), null);
  });
});

describe("applySourceEdits integrity (R10)", function () {
  it("throws loudly on a span content mismatch and emits nothing", function () {
    assert.throws(function () {
      applySourceEdits("const a = 1\n", "/site/src/x.ts", [
        { start: 0, end: 5, expected: "zzz", replacement: "q" },
      ]);
    }, /span mismatch/);
  });

  it("throws loudly on overlapping edits", function () {
    assert.throws(function () {
      applySourceEdits("const a = 1\n", "/site/src/x.ts", [
        { start: 0, end: 5, expected: "const", replacement: "var" },
        { start: 2, end: 4, expected: "ns", replacement: "NN" },
      ]);
    }, /overlap/);
  });
});

describe("transformSource sourcemaps (KTD1)", function () {
  it("returns a real, parseable sourcemap when edits were applied", function () {
    const code = `const el = <div class="flex">x</div>\n`;
    const result = transform(code);
    assert.ok(result !== null);
    const parsed = JSON.parse(result.map.toString());
    assert.strictEqual(parsed.version, 3);
    assert.deepStrictEqual(parsed.sources, ["/site/src/routes/test.tsx"]);
    assert.strictEqual(typeof parsed.mappings, "string");
    assert.ok(parsed.mappings.length > 0);
  });
});
