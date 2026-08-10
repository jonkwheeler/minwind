import assert from "node:assert";
import { describe, it } from "node:test";
import { createNameRegistry, type NameRegistry } from "../src/names.js";
import {
  transformSource,
  type TransformSourceResult,
} from "../src/transform-source.js";
import { maskSfcStyleContent } from "../src/sfc.js";
import type { ConsolidationVerdict } from "../src/consolidate.js";

// SFC transforms (Vue, Svelte, Astro): template class positions and script
// blocks share the TS walker's classification, so these tests pin the
// per-format mapping — static attributes, binding expressions, Svelte
// directives, mixed templates — against one toy registry.

const TOKENS = [
  "flex",
  "flex-col",
  "items-center",
  "p-4",
  "mb-16",
  "opacity-50",
  "site-card",
];

const REGISTRY: NameRegistry = createNameRegistry({
  universe: new Set(TOKENS),
  sourceTokens: new Set(TOKENS),
  runtimeTokens: new Set(),
  exclusions: { names: [], prefixes: [] },
});

function nameOf(token: string): string {
  const name = REGISTRY.nameFor(token);
  assert.ok(name !== undefined, `${token} must be renamed in the registry`);
  return name;
}

function transform(
  code: string,
  id: string,
  verdicts?: ReadonlyArray<ConsolidationVerdict>,
): TransformSourceResult | null {
  return transformSource({
    code,
    id,
    registry: REGISTRY,
    consolidationVerdicts: verdicts,
  });
}

describe("Vue SFC transforms", function () {
  it("renames static class attributes in the template", function () {
    const result = transform(
      `<template>
  <div class="flex flex-col">x</div>
</template>
`,
      "/site/src/Card.vue",
    );
    assert.ok(result !== null);
    assert.ok(
      result.code.includes(`class="${nameOf("flex")} ${nameOf("flex-col")}"`),
    );
    assert.deepStrictEqual(result.warnings, []);
  });

  it("renames literals and object keys inside :class bindings", function () {
    const result = transform(
      `<template>
  <div :class="['flex', { 'mb-16': active, 'opacity-50': dim }]">x</div>
</template>
`,
      "/site/src/Card.vue",
    );
    assert.ok(result !== null);
    assert.ok(result.code.includes(`'${nameOf("flex")}'`));
    assert.ok(result.code.includes(`'${nameOf("mb-16")}': active`));
    assert.ok(result.code.includes(`'${nameOf("opacity-50")}': dim`));
  });

  it("renames v-bind:class string literals", function () {
    const result = transform(
      `<template>
  <div v-bind:class="cond ? 'flex' : 'flex-col'">x</div>
</template>
`,
      "/site/src/Card.vue",
    );
    assert.ok(result !== null);
    assert.ok(
      result.code.includes(
        `cond ? '${nameOf("flex")}' : '${nameOf("flex-col")}'`,
      ),
    );
  });

  it("poisons template expressions inside bindings with a warning", function () {
    const result = transform(
      `<template>
  <div :class="\`flex \${size}\`">x</div>
</template>
`,
      "/site/src/Card.vue",
    );
    assert.ok(result !== null);
    // The static fragment keeps its original bytes and the transform warns.
    assert.ok(result.code.includes("flex ${size}"));
    assert.ok(
      result.warnings.some(function (warning) {
        return warning.kind === "unprovable-expression";
      }),
    );
  });

  it("walks <script setup> blocks with the TS walker", function () {
    const result = transform(
      `<script setup lang="ts">
import { cn } from "./cn"
const cls = cn("flex", "p-4")
const el = document.createElement("div")
el.classList.add("mb-16")
</script>
<template><div>x</div></template>
`,
      "/site/src/Card.vue",
    );
    assert.ok(result !== null);
    assert.ok(
      result.code.includes(`cn("${nameOf("flex")}", "${nameOf("p-4")}")`),
    );
    // Detection-only: classList.add literals keep their original bytes.
    assert.ok(result.code.includes(`classList.add("mb-16")`));
  });

  it("never lets HTML-looking strings in scripts become phantom renames", function () {
    const result = transform(
      `<script setup>
const html = "<div class=\\"flex\\">not a real attribute</div>"
</script>
<template><div class="p-4">x</div></template>
`,
      "/site/src/Card.vue",
    );
    assert.ok(result !== null);
    // The string is module-scope code, not a class context: untouched.
    assert.ok(result.code.includes(`class=\\"flex\\"`));
    assert.ok(result.code.includes(`class="${nameOf("p-4")}"`));
  });

  it("collapses a repeated static list to its consolidated name", function () {
    const verdicts: Array<ConsolidationVerdict> = [
      { tokens: ["flex", "p-4"], frequency: 3, safe: true, name: "combo" },
    ];
    const result = transform(
      `<template>
  <div class="flex p-4">x</div>
</template>
`,
      "/site/src/Card.vue",
      verdicts,
    );
    assert.ok(result !== null);
    assert.ok(result.code.includes(`class="combo"`));
  });
});

describe("Svelte SFC transforms", function () {
  it("renames static class attributes", function () {
    const result = transform(
      `<script>
  export let tone
</script>
<div class="flex items-center">x</div>
`,
      "/site/src/Card.svelte",
    );
    assert.ok(result !== null);
    assert.ok(
      result.code.includes(
        `class="${nameOf("flex")} ${nameOf("items-center")}"`,
      ),
    );
  });

  it("renames class: directive names and leaves conditions alone", function () {
    const result = transform(
      `<div class:mb-16={active} class:opacity-50>x</div>
`,
      "/site/src/Card.svelte",
    );
    assert.ok(result !== null);
    assert.ok(result.code.includes(`class:${nameOf("mb-16")}={active}`));
    assert.ok(result.code.includes(`class:${nameOf("opacity-50")}`));
  });

  it("poisons mixed static/expression class attributes", function () {
    const result = transform(
      `<div class="flex {cond ? 'p-4' : ''} end">x</div>
`,
      "/site/src/Card.svelte",
    );
    assert.ok(result !== null);
    // Static runs and nested literals keep their original bytes.
    assert.ok(result.code.includes(`class="flex {cond ? 'p-4' : ''} end"`));
    const unprovable = result.warnings.filter(function (warning) {
      return warning.kind === "unprovable-expression";
    });
    assert.ok(unprovable.length >= 2);
  });

  it("walks <script> blocks", function () {
    const result = transform(
      `<script lang="ts">
  import { cn } from "./cn"
  const cls = cn("flex-col", "p-4")
</script>
<div>x</div>
`,
      "/site/src/Card.svelte",
    );
    assert.ok(result !== null);
    assert.ok(
      result.code.includes(`cn("${nameOf("flex-col")}", "${nameOf("p-4")}")`),
    );
  });
});

describe("Astro SFC transforms", function () {
  it("renames static class attributes", function () {
    const result = transform(
      `---
const title = "x"
---
<div class="flex p-4">{title}</div>
`,
      "/site/src/Card.astro",
    );
    assert.ok(result !== null);
    assert.ok(
      result.code.includes(`class="${nameOf("flex")} ${nameOf("p-4")}"`),
    );
  });

  it("walks frontmatter with the TS walker", function () {
    const result = transform(
      `---
import { cn } from "./cn"
const cls = cn("flex", "items-center")
---
<div class={cls}>x</div>
`,
      "/site/src/Card.astro",
    );
    assert.ok(result !== null);
    assert.ok(
      result.code.includes(
        `cn("${nameOf("flex")}", "${nameOf("items-center")}")`,
      ),
    );
  });

  it("renames class:list array literals", function () {
    const result = transform(
      `<div class:list={["flex", { "p-4": active }]}>x</div>
`,
      "/site/src/Card.astro",
    );
    assert.ok(result !== null);
    assert.ok(result.code.includes(`"${nameOf("flex")}"`));
    assert.ok(result.code.includes(`"${nameOf("p-4")}": active`));
  });

  it("poisons mixed class templates", function () {
    const result = transform(
      `<div class="flex {modifier}">x</div>
`,
      "/site/src/Card.astro",
    );
    assert.ok(result !== null);
    assert.ok(result.code.includes(`class="flex {modifier}"`));
    assert.ok(
      result.warnings.some(function (warning) {
        return warning.kind === "unprovable-expression";
      }),
    );
  });
});

describe("SFC leak-check masking", function () {
  it("blanks <style> contents so CSS values never warn as leaks", function () {
    const masked = maskSfcStyleContent(
      "/site/src/Card.vue",
      `<template><div class="flex">x</div></template>
<style>
.card { display: flex; margin-bottom: 4rem; }
</style>
`,
    );
    assert.ok(!masked.includes("display"));
    assert.ok(masked.includes(`class="flex"`));
  });

  it("does not warn about utility words used as CSS values", function () {
    const result = transform(
      `<template><div class="flex">x</div></template>
<style>
.card { display: flex; }
</style>
`,
      "/site/src/Card.vue",
    );
    assert.ok(result !== null);
    assert.deepStrictEqual(
      result.warnings.filter(function (warning) {
        return warning.kind === "reverse-leak";
      }),
      [],
    );
  });
});
