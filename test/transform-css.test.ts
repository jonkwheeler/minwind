import assert from "node:assert";
import { describe, it } from "node:test";
import { createNameRegistry, type NameRegistry } from "../src/names.js";
import {
  assertNoSurvivingTokens,
  assertPresence,
  transformStylesheet,
  type TransformCssResult,
} from "../src/transform-css.js";
import { createCustomPropertyRegistry } from "../src/custom-properties.js";

// A toy registry as the U2 pre-pass would build it: `tokens` are renamed,
// `cssOnly` tokens are defined in the stylesheet but never used in source
// (css-only exclusion), so they keep their original bytes.
function registryFor(
  tokens: ReadonlyArray<string>,
  cssOnly: ReadonlyArray<string> = [],
): NameRegistry {
  return createNameRegistry({
    universe: new Set([...tokens, ...cssOnly]),
    sourceTokens: new Set(tokens),
  });
}

function nameOf(registry: NameRegistry, token: string): string {
  const name = registry.nameFor(token);
  assert.ok(
    name !== undefined,
    `${token} must be renamed in the test registry`,
  );
  return name;
}

function transform(
  css: string,
  registry: NameRegistry,
  fileName = "app.css",
): TransformCssResult {
  return transformStylesheet({ css, registry, fileName });
}

describe("transformStylesheet happy path (R1, AE3)", function () {
  const REGISTRY = registryFor([
    "flex",
    "items-center",
    "hover:border-accent",
    "fade-in",
    "site-card",
  ]);

  // Minified Lightning-CSS-shaped fixture: a utility, a second utility, a
  // variant utility, a custom @utility, and a plain hand-written class.
  const CSS =
    "@layer theme,base,components,utilities;" +
    "@layer utilities{" +
    ".flex{display:flex}" +
    ".items-center{align-items:center}" +
    ".hover\\:border-accent:hover{border-color:var(--accent)}" +
    ".fade-in{opacity:0;animation:fade-in 1s ease forwards}" +
    "}" +
    ".site-card{border:1px solid}";

  it("renames utilities, a custom @utility, and a plain class", function () {
    const result = transform(CSS, REGISTRY);
    assert.strictEqual(
      result.css,
      "@layer theme,base,components,utilities;" +
        "@layer utilities{" +
        `.${nameOf(REGISTRY, "flex")}{display:flex}` +
        `.${nameOf(REGISTRY, "items-center")}{align-items:center}` +
        `.${nameOf(REGISTRY, "hover:border-accent")}:hover{border-color:var(--accent)}` +
        `.${nameOf(REGISTRY, "fade-in")}{opacity:0;animation:fade-in 1s ease forwards}` +
        "}" +
        `.${nameOf(REGISTRY, "site-card")}{border:1px solid}`,
    );
    assert.deepStrictEqual(result.warnings, []);
  });

  it("keeps the pseudo-class when renaming a variant token", function () {
    const result = transform(CSS, REGISTRY);
    const renamed = `.${nameOf(REGISTRY, "hover:border-accent")}:hover`;
    assert.ok(result.css.includes(renamed));
    assert.ok(!result.css.includes("hover\\:border-accent"));
    // The pseudo-class stayed a pseudo-class: exactly one `:hover{` arm.
    assert.strictEqual(result.css.match(/:hover\{/g)?.length, 1);
  });

  it("reports which tokens were renamed in this asset", function () {
    const result = transform(CSS, REGISTRY);
    assert.deepStrictEqual(
      result.renamed.map(function (entry) {
        return entry.token;
      }),
      ["fade-in", "flex", "hover:border-accent", "items-center", "site-card"],
    );
  });

  it("produces output that parses back cleanly through css-tree", function () {
    const result = transform(CSS, REGISTRY);
    const second = transform(result.css, REGISTRY);
    assert.strictEqual(
      second.css,
      result.css,
      "re-transform must be a fixed point",
    );
    assert.deepStrictEqual(second.warnings, []);
  });
});

describe("transformStylesheet owned custom properties", function () {
  it("renames declarations, var() references, and @property without touching strings or comments", function () {
    const registry = registryFor(["text-accent"]);
    const properties = createCustomPropertyRegistry({
      owned: ["--color-accent"],
    });
    const propertyName = properties.nameFor("--color-accent") ?? "";
    const result = transformStylesheet({
      css:
        `@property --color-accent{syntax:"<color>";inherits:true;initial-value:red}` +
        `:root{--color-accent:red;content:"--color-accent"}` +
        `@layer utilities{.text-accent{color:var(--color-accent,blue)}}` +
        `/* --color-accent */`,
      registry,
      customProperties: properties,
    });
    assert.strictEqual(
      result.css,
      `@property ${propertyName}{syntax:"<color>";inherits:true;initial-value:red}` +
        `:root{${propertyName}:red;content:"--color-accent"}` +
        `@layer utilities{.${nameOf(registry, "text-accent")}{color:var(${propertyName},blue)}}` +
        `/* --color-accent */`,
    );
  });
});

describe("transformStylesheet compound and grouped selectors (R1)", function () {
  it("renames every class token of a compound arm", function () {
    const registry = registryFor(["flex", "items-center"]);
    const result = transform(
      "@layer utilities{.flex.items-center:hover{outline:none}}",
      registry,
    );
    assert.strictEqual(
      result.css,
      `@layer utilities{.${nameOf(registry, "flex")}.${nameOf(
        registry,
        "items-center",
      )}:hover{outline:none}}`,
    );
  });

  it("renames marker references inside :where() of a qualifying arm", function () {
    const registry = registryFor(["group", "group-hover:opacity-100"]);
    const result = transform(
      "@layer utilities{.group-hover\\:opacity-100:is(:where(.group):hover *){opacity:1}}",
      registry,
    );
    assert.strictEqual(
      result.css,
      `@layer utilities{.${nameOf(
        registry,
        "group-hover:opacity-100",
      )}:is(:where(.${nameOf(registry, "group")}):hover *){opacity:1}}`,
    );
  });

  it("splits a grouped selector when only one arm qualifies", function () {
    const registry = registryFor(["flex"], ["keep-me"]);
    const result = transform(
      "@layer utilities{.flex{display:flex}}.flex,.keep-me{color:red}",
      registry,
    );
    assert.strictEqual(
      result.css,
      `@layer utilities{.${nameOf(registry, "flex")}{display:flex}}` +
        `.${nameOf(registry, "flex")}{color:red}.keep-me{color:red}`,
    );
  });

  it("splits a pretty-printed grouped selector byte-preservingly", function () {
    const registry = registryFor(["flex"], ["keep-me"]);
    const css =
      "@layer utilities {\n" +
      "  .flex {\n" +
      "    outline: none;\n" +
      "  }\n" +
      "}\n" +
      ".flex,\n" +
      ".keep-me { color: red }\n";
    const result = transform(css, registry);
    assert.strictEqual(
      result.css,
      "@layer utilities {\n" +
        `  .${nameOf(registry, "flex")} {\n` +
        "    outline: none;\n" +
        "  }\n" +
        "}\n" +
        `.${nameOf(registry, "flex")} { color: red }\n` +
        ".keep-me { color: red }\n",
    );
  });

  it("renames all arms in place when every arm qualifies", function () {
    const registry = registryFor(["flex", "items-center"]);
    const result = transform(
      "@layer utilities{.flex{display:flex}.items-center{align-items:center}}" +
        ".flex,.items-center{color:red}",
      registry,
    );
    assert.strictEqual(
      result.css,
      `@layer utilities{.${nameOf(registry, "flex")}{display:flex}` +
        `.${nameOf(registry, "items-center")}{align-items:center}}` +
        `.${nameOf(registry, "flex")},.${nameOf(
          registry,
          "items-center",
        )}{color:red}`,
    );
    assert.deepStrictEqual(result.warnings, []);
  });
});

describe("transformStylesheet skips and warnings (R5, R10)", function () {
  it("skips a compound arm mixing registry and non-registry classes with a warning", function () {
    const registry = registryFor(["flex"], ["shiki"]);
    const css =
      "@layer utilities{.flex{display:flex}}.shiki .flex{outline:none}";
    const result = transform(css, registry);
    assert.strictEqual(
      result.css,
      `@layer utilities{.${nameOf(registry, "flex")}{display:flex}}` +
        ".shiki .flex{outline:none}",
    );
    assert.strictEqual(result.warnings.length, 1);
    const warning = result.warnings[0];
    assert.strictEqual(warning.kind, "mixed-compound-skipped");
    assert.strictEqual(warning.fileName, "app.css");
    assert.strictEqual(warning.selector, ".shiki .flex");
    assert.deepStrictEqual(warning.registryTokens, ["flex"]);
  });

  it("keeps selectors with no registry classes byte-identical without warnings", function () {
    const registry = registryFor(["flex"], ["keep-me", "note"]);
    const css =
      '@layer utilities{.flex{display:flex}}.keep-me{color:red}.note::before{content:"x"}';
    const result = transform(css, registry);
    assert.strictEqual(
      result.css,
      `@layer utilities{.${nameOf(registry, "flex")}{display:flex}}` +
        '.keep-me{color:red}.note::before{content:"x"}',
    );
    assert.deepStrictEqual(result.warnings, []);
  });

  it("returns the stylesheet unchanged when the registry is empty", function () {
    const registry = registryFor([]);
    const css = "@layer utilities{.flex{display:flex}}";
    const result = transform(css, registry);
    assert.strictEqual(result.css, css);
    assert.deepStrictEqual(result.warnings, []);
    assert.deepStrictEqual(result.renamed, []);
  });
});

describe("transformStylesheet nested rules (KTD2)", function () {
  it("renames variant tokens inside @media blocks", function () {
    const registry = registryFor(["sm:items-start"]);
    const result = transform(
      "@media (min-width:40rem){@layer utilities{.sm\\:items-start{align-items:flex-start}}}",
      registry,
    );
    assert.strictEqual(
      result.css,
      `@media (min-width:40rem){@layer utilities{.${nameOf(
        registry,
        "sm:items-start",
      )}{align-items:flex-start}}}`,
    );
  });

  it("renames selectors inside @supports blocks", function () {
    const registry = registryFor(["flex"]);
    const result = transform(
      "@supports (display:grid){@layer utilities{.flex{display:flex}}}",
      registry,
    );
    assert.strictEqual(
      result.css,
      `@supports (display:grid){@layer utilities{.${nameOf(
        registry,
        "flex",
      )}{display:flex}}}`,
    );
  });

  it("renames class-led nested rules that css-tree parses as Raw", function () {
    const registry = registryFor(["flex", "site-card"]);
    const result = transform(
      "@layer utilities{.flex{display:flex}}.site-card{.flex{outline:none}}",
      registry,
    );
    assert.strictEqual(
      result.css,
      `@layer utilities{.${nameOf(registry, "flex")}{display:flex}}` +
        `.${nameOf(registry, "site-card")}{.${nameOf(
          registry,
          "flex",
        )}{outline:none}}`,
    );
  });

  it("renames classes in &-led nested rules", function () {
    const registry = registryFor(["flex", "site-card"]);
    const result = transform(
      "@layer utilities{.flex{display:flex}}.site-card{&:hover .flex{outline:none}}",
      registry,
    );
    assert.strictEqual(
      result.css,
      `@layer utilities{.${nameOf(registry, "flex")}{display:flex}}` +
        `.${nameOf(registry, "site-card")}{&:hover .${nameOf(
          registry,
          "flex",
        )}{outline:none}}`,
    );
  });

  it("never touches @keyframes content", function () {
    const registry = registryFor(["flex"]);
    const css =
      "@layer utilities{.flex{display:flex}}@keyframes spin{0%{opacity:0}to{opacity:1}}";
    const result = transform(css, registry);
    assert.strictEqual(
      result.css,
      `@layer utilities{.${nameOf(registry, "flex")}{display:flex}}` +
        "@keyframes spin{0%{opacity:0}to{opacity:1}}",
    );
  });
});

describe("transformStylesheet error paths (R10)", function () {
  it("fails the qualification gate when no utilities layer exists", function () {
    const registry = registryFor(["flex"]);
    assert.throws(function () {
      transform(".flex{display:flex}", registry);
    }, /@layer utilities/);
  });

  it("fails the qualification gate on an undecodable selector", function () {
    const registry = registryFor(["flex"]);
    assert.throws(function () {
      transform(
        "@layer utilities{.flex{display:flex}}.a,,,.b{color:red}",
        registry,
      );
    }, /selector/);
  });

  it("fails the qualification gate on undecodable nested rule content", function () {
    const registry = registryFor(["flex", "site-card"]);
    assert.throws(function () {
      transform(
        "@layer utilities{.flex{display:flex}}.site-card{%%%}",
        registry,
      );
    }, /Raw|nested|decod/i);
  });

  it("leaves a missing registry name to the cross-asset presence check", function () {
    const registry = registryFor(["flex", "ghost-class"]);
    const result = transform("@layer utilities{.flex{display:flex}}", registry);
    assert.ok(result.css.includes(nameOf(registry, "flex")));
    assert.throws(function () {
      assertPresence(registry, [result.css]);
    }, /presence.*ghost-class/s);
  });

  it("ignores a registry token inside a declaration value", function () {
    // R10 calibration: a value is never a class reference, so a token in a
    // content string must not fail the build.
    const registry = registryFor(["flex"], ["note"]);
    const result = transform(
      '@layer utilities{.flex{display:flex}}.note::before{content:"flex"}',
      registry,
    );
    assert.strictEqual(
      result.css,
      `@layer utilities{.${nameOf(registry, "flex")}{display:flex}}.note::before{content:"flex"}`,
    );
  });

  it("ignores a registry token inside a harvested arbitrary-value utility", function () {
    // Real-site regression (2026-08-10): Tailwind's automatic content
    // detection harvested `content-['flex']` from a docs markdown file, so
    // the emitted stylesheet carried
    // `.content-\[\'flex\'\]{--tw-content:"flex";content:var(--tw-content)}`
    // next to the renamed `.flex` rule. Neither the escaped selector text
    // nor the declaration value is a class reference to `flex`.
    const registry = registryFor(["flex"]);
    const result = transform(
      `@layer utilities{.flex{display:flex}}.content-\\[\\'flex\\'\\]{--tw-content:"flex";content:var(--tw-content)}`,
      registry,
    );
    assert.strictEqual(
      result.css,
      `@layer utilities{.${nameOf(registry, "flex")}{display:flex}}.content-\\[\\'flex\\'\\]{--tw-content:"flex";content:var(--tw-content)}`,
    );
  });

  it("fails when a renamed class selector survives in the output", function () {
    const registry = registryFor(["flex"]);
    assert.throws(function () {
      assertNoSurvivingTokens(
        registry,
        "@layer utilities{.flex{display:flex}}",
        "app.css",
      );
    }, /survives as a class selector/);
  });

  it("exempts a mixed compound that kept its original bytes", function () {
    // `.flex.note` mixes a registry token with a css-only class, so the arm
    // is deliberately left unrenamed; the survivor check must not trip on it.
    const registry = registryFor(["flex"], ["note"]);
    assertNoSurvivingTokens(
      registry,
      "@layer utilities{.flex.note{display:flex}}",
      "app.css",
    );
  });

  it("does not trip on a token nested inside an important-modifier selector", function () {
    // Real-site regression: Tailwind's automatic content detection harvested
    // `!block` from tool source code, so the emitted stylesheet carries
    // `.\!block{display:block!important}` next to the renamed `.block` rule.
    // The token `block` inside the important candidate is not a survivor.
    const registry = registryFor(["block"]);
    const result = transform(
      "@layer utilities{.\\!block{display:block!important}.block{display:block}}",
      registry,
    );
    assert.strictEqual(
      result.css,
      `@layer utilities{.\\!block{display:block!important}.${nameOf(registry, "block")}{display:block}}`,
    );
  });
});

describe("transformStylesheet multi-asset builds (cssCodeSplit)", function () {
  it("passes an asset with no registry-token selectors through unchanged", function () {
    const registry = registryFor(["flex", "items-center"]);
    const css = '.keep-me{color:red}.note::before{content:"x"}';
    const result = transform(css, registry);
    assert.strictEqual(result.css, css);
    assert.deepStrictEqual(result.warnings, []);
    assert.deepStrictEqual(result.renamed, []);
  });

  it("still fails the gate when an asset with registry selectors lacks the utilities layer", function () {
    const registry = registryFor(["flex"]);
    assert.throws(function () {
      transform("@media (min-width:40rem){.flex{display:flex}}", registry);
    }, /@layer utilities/);
  });

  it("no longer asserts per-asset presence: a subset asset passes", function () {
    const registry = registryFor(["flex", "items-center"]);
    const result = transform("@layer utilities{.flex{display:flex}}", registry);
    assert.strictEqual(
      result.css,
      `@layer utilities{.${nameOf(registry, "flex")}{display:flex}}`,
    );
    // Coverage stays a bundle-level contract: the subset alone fails the
    // caller's assertPresence, both halves together pass it.
    assert.throws(function () {
      assertPresence(registry, [result.css]);
    }, /presence.*items-center/s);
    assert.doesNotThrow(function () {
      assertPresence(registry, [
        result.css,
        `.${nameOf(registry, "items-center")}{align-items:center}`,
      ]);
    });
  });
});

describe("assertPresence (cross-asset, U6 contract)", function () {
  const REGISTRY = registryFor(["flex", "site-card"]);

  it("passes when every registry name appears across the asset list", function () {
    const cssA = `.${nameOf(REGISTRY, "flex")}{display:flex}`;
    const cssB = `.${nameOf(REGISTRY, "site-card")}{border:0}`;
    assert.doesNotThrow(function () {
      assertPresence(REGISTRY, [cssA, cssB]);
    });
  });

  it("fails when a name is missing from every asset", function () {
    const cssA = `.${nameOf(REGISTRY, "flex")}{display:flex}`;
    assert.throws(function () {
      assertPresence(REGISTRY, [cssA]);
    }, /presence.*site-card/s);
  });
});
