import assert from "node:assert";
import { describe, it } from "node:test";
import {
  parseSourceModule,
  tokenize,
  walkClassContexts,
  type RuntimeContextKind,
} from "../src/class-contexts.js";
import { type ConsolidationVerdict } from "../src/consolidate.js";
import { createDialectHasher } from "../src/dialect.js";
import { createNameRegistry, type NameRegistry } from "../src/names.js";
import {
  applySourceEdits,
  shouldTransformModule,
  transformModule,
  transformSource,
  type TransformSourceResult,
} from "../src/transform-source.js";
import { createCustomPropertyRegistry } from "../src/custom-properties.js";

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

describe("transformSource owned custom properties", function () {
  it("rewrites static CSSOM calls through the normal source-transform seam", function () {
    const properties = createCustomPropertyRegistry({
      owned: ["--color-accent"],
    });
    const result = transformSource({
      code:
        `element.style.setProperty("--color-accent", value);\n` +
        `getComputedStyle(element).getPropertyValue("--color-accent");\n` +
        `element.style.removeProperty("--color-accent");`,
      id: "/site/src/theme.ts",
      registry: REGISTRY,
      customProperties: properties,
    });
    assert.ok(result !== null);
    assert.strictEqual(
      result.code,
      `element.style.setProperty("${properties.nameFor("--color-accent")}", value);\n` +
        `getComputedStyle(element).getPropertyValue("${properties.nameFor("--color-accent")}");\n` +
        `element.style.removeProperty("${properties.nameFor("--color-accent")}");`,
    );
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

// R6 (KTD6): built HTML is also scanned decoded, so a token written with
// character references outside a class attribute still counts as a leak.
// The raw and decoded scans see an entity-free occurrence alike, and it
// warns once.
describe("transformModule leak scan over decoded built HTML (R6, KTD6)", function () {
  it("reports an encoded occurrence at its raw position, and each leak once", function () {
    const tokens = ["[&_a]:underline", "flex"];
    const registry = createNameRegistry({
      universe: new Set(tokens),
      sourceTokens: new Set(tokens),
    });
    const line = '<div data-x="[&amp;_a]:underline" data-y="flex"></div>';
    const result = transformModule({
      code: `<p>x</p>\n${line}\n`,
      id: "/out/index.html",
      registry,
    });
    assert.ok(result !== null);
    assert.deepStrictEqual(
      result.warnings
        .map(function (warning) {
          return [warning.kind, warning.token, warning.line, warning.column];
        })
        .sort(),
      [
        ["reverse-leak", "[&_a]:underline", 2, line.indexOf("[&amp;") + 1],
        ["reverse-leak", "flex", 2, line.indexOf("flex") + 1],
      ],
    );
  });

  it("leaves source modules' entity text undecoded", function () {
    const result = transformModule({
      code: 'export const note = "[&amp;_a]:underline";\n',
      id: "/site/src/data/note.ts",
      registry: createNameRegistry({
        universe: new Set(["[&_a]:underline"]),
        sourceTokens: new Set(["[&_a]:underline"]),
      }),
    });
    assert.strictEqual(result, null);
  });
});

// R16 (KTD15): an object literal at a class-composition position (a cn()
// argument, an array element, a conditional branch, or a logical operand
// there) holds class names in its keys. Identifier and shorthand keys rename
// like classList keys; a key minwind cannot prove poisons its tokens.
describe("transformSource class-composition object keys (R16, KTD15)", function () {
  const KEY_TOKENS = [
    "hidden",
    "block",
    "flex",
    "p-4",
    "ring-2",
    "ring-4",
    "w-full",
    "shadow",
  ];
  const KEY_REGISTRY = createNameRegistry({
    universe: new Set(KEY_TOKENS),
    sourceTokens: new Set(KEY_TOKENS),
  });

  function keyName(token: string): string {
    const name = KEY_REGISTRY.nameFor(token);
    assert.ok(name !== undefined, `${token} must be renamed`);
    return name;
  }

  function transformKeys(
    code: string,
    registry: NameRegistry = KEY_REGISTRY,
  ): TransformSourceResult | null {
    return transformSource({
      code,
      id: "/site/src/routes/keys.tsx",
      registry,
    });
  }

  function walkKeys(code: string): {
    renamed: Array<string>;
    poisoned: Array<string>;
    kinds: Array<RuntimeContextKind>;
  } {
    const sourceFile = parseSourceModule("/site/src/routes/keys.tsx", code);
    const renamed: Array<string> = [];
    const poisoned: Array<string> = [];
    const kinds: Array<RuntimeContextKind> = [];
    walkClassContexts(sourceFile, {
      renameLiteral: function (literal) {
        renamed.push(code.slice(literal.start, literal.end));
      },
      runtimeLiteral: function (literal, kind) {
        poisoned.push(code.slice(literal.start, literal.end));
        kinds.push(kind);
      },
    });
    return { renamed, poisoned, kinds };
  }

  it("renames an identifier key beside a string argument and leaves the value alone (AE11)", function () {
    const code = `const el = <div class={cn("p-4", { hidden: open })}>x</div>\n`;
    const result = transformKeys(code);
    assert.ok(result !== null);
    assert.strictEqual(
      result.code,
      `const el = <div class={cn("${keyName("p-4")}", { ${keyName(
        "hidden",
      )}: open })}>x</div>\n`,
    );
    assert.deepStrictEqual(result.warnings, []);
  });

  it("expands a shorthand key so the value binding survives", function () {
    const result = transformKeys(`const c = cn({ hidden })\n`);
    assert.ok(result !== null);
    assert.strictEqual(
      result.code,
      `const c = cn({ ${keyName("hidden")}: hidden })\n`,
    );
  });

  it("renames keys in array elements, && operands, and ?: branches", function () {
    const code = `const c = cn([{ hidden: a }, b && { block: c }], d ? { flex: 1 } : null)\n`;
    const result = transformKeys(code);
    assert.ok(result !== null);
    assert.strictEqual(
      result.code,
      `const c = cn([{ ${keyName("hidden")}: a }, b && { ${keyName(
        "block",
      )}: c }], d ? { ${keyName("flex")}: 1 } : null)\n`,
    );
  });

  it("renames || and ?? operands and keys behind parentheses, as, satisfies, and !", function () {
    const code =
      `const c = cn(a || { hidden: 1 }, b ?? ({ block: 1 }),` +
      ` { flex: 1 } as Classes, { "p-4": 1 } satisfies Classes, x!)\n`;
    assert.deepStrictEqual(walkKeys(code), {
      renamed: ["hidden", "block", "flex", "p-4"],
      poisoned: [],
      kinds: [],
    });
  });

  it("renames a string key and a computed string-literal key", function () {
    const result = transformKeys(
      `const c = cn({ "ring-2": on, ["ring-4"]: off })\n`,
    );
    assert.ok(result !== null);
    assert.strictEqual(
      result.code,
      `const c = cn({ "${keyName("ring-2")}": on, ["${keyName(
        "ring-4",
      )}"]: off })\n`,
    );
  });

  it("emits nothing for a computed identifier key and poisons a computed expression's literals", function () {
    assert.deepStrictEqual(walkKeys(`const c = cn({ [size]: on })\n`), {
      renamed: [],
      poisoned: [],
      kinds: [],
    });
    const scan = walkKeys(`const c = cn({ [base + " shadow"]: on })\n`);
    assert.deepStrictEqual(scan.renamed, []);
    assert.deepStrictEqual(scan.poisoned, [" shadow"]);
  });

  it("recurses into a spread at a composition position", function () {
    const result = transformKeys(
      `const c = cn({ ...(wide ? { "w-full": true } : {}) })\n`,
    );
    assert.ok(result !== null);
    assert.strictEqual(
      result.code,
      `const c = cn({ ...(wide ? { "${keyName("w-full")}": true } : {}) })\n`,
    );
  });

  it("poisons the keys of an object passed to another call inside cn()", function () {
    const scan = walkKeys(`const c = cn(button({ size, block }))\n`);
    assert.deepStrictEqual(scan.renamed, []);
    assert.deepStrictEqual(scan.poisoned, ["size", "block"]);
    assert.deepStrictEqual(scan.kinds, [
      "class-expression",
      "class-expression",
    ]);
    const code = `const c = cn(button({ size, block }))\n`;
    const result = transformKeys(code);
    assert.ok(result !== null);
    assert.strictEqual(result.code, code);
    // A poisoned key warns only when it names a class the registry knows.
    assert.deepStrictEqual(
      result.warnings
        .map(function (warning) {
          return [warning.kind, warning.column];
        })
        .sort(),
      [
        ["reverse-leak", code.indexOf("block") + 1],
        ["unprovable-expression", code.indexOf("block") + 1],
      ],
    );
  });

  it("poisons a getter's name", function () {
    const scan = walkKeys(`const c = cn({ get hidden() { return x } })\n`);
    assert.deepStrictEqual(scan.renamed, []);
    assert.deepStrictEqual(scan.poisoned, ["hidden"]);
  });

  it("poisons the keys of a clsx() object in class position (AE11)", function () {
    const code = `const el = <div class={clsx({ hidden: open, "p-4": wide })}>x</div>\n`;
    const scan = walkKeys(code);
    assert.deepStrictEqual(scan.renamed, []);
    assert.deepStrictEqual(scan.poisoned, ["hidden", "p-4"]);
    assert.deepStrictEqual(scan.kinds, [
      "class-expression",
      "class-expression",
    ]);
    const result = transformKeys(code);
    assert.ok(result !== null);
    assert.strictEqual(result.code, code);
    assert.ok(
      result.warnings.some(function (warning) {
        return (
          warning.kind === "unprovable-expression" &&
          warning.message.includes(`"hidden"`)
        );
      }),
    );
  });

  it("poisons identifier keys of an object a classList conditional holds", function () {
    const scan = walkKeys(
      `const el = <div classList={cond ? { hidden: true } : fallback}>x</div>\n`,
    );
    assert.deepStrictEqual(scan.poisoned, ["hidden"]);
    assert.deepStrictEqual(scan.kinds, ["classList-expression"]);
  });

  it("quotes a dialect key holding ' in cn() and classList, and the output parses", function () {
    const dialect = createNameRegistry({
      universe: new Set(KEY_TOKENS),
      sourceTokens: new Set(KEY_TOKENS),
      hash: createDialectHasher("england"),
    });
    const hidden = dialect.nameFor("hidden");
    assert.strictEqual(hidden, "'idden");
    const code =
      `const c = cn({ hidden: on }, { hidden })\n` +
      `const el = <div classList={{ hidden: on, block: on }}>x</div>\n`;
    const result = transformKeys(code, dialect);
    assert.ok(result !== null);
    assert.strictEqual(
      result.code,
      `const c = cn({ "'idden": on }, { "'idden": hidden })\n` +
        `const el = <div classList={{ "'idden": on, block: on }}>x</div>\n`,
    );
    const parsed = parseSourceModule(
      "/site/src/out.tsx",
      result.code,
    ) as unknown as {
      parseDiagnostics: ReadonlyArray<unknown>;
    };
    assert.deepStrictEqual(parsed.parseDiagnostics, []);
  });

  it("keeps every byte of objects outside a composition and warns on their registry-token keys", function () {
    const code =
      `const options = { hidden: true, block: 1 }\n` +
      `type P = { flex: boolean }\n` +
      `const { shadow: s } = props\n`;
    const result = transformKeys(code);
    assert.ok(result !== null);
    assert.strictEqual(result.code, code);
    assert.deepStrictEqual(
      result.warnings.map(function (warning) {
        return [warning.kind, warning.token, warning.column];
      }),
      [
        ["reverse-leak", "block", code.indexOf("block") + 1],
        ["reverse-leak", "hidden", code.indexOf("hidden") + 1],
      ],
    );
  });

  it("returns null for a module with no class contexts and no registry-token keys", function () {
    const code = `const options = { size: "lg" }\nexport default options\n`;
    assert.strictEqual(transformKeys(code), null);
  });
});
