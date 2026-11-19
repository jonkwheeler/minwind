import assert from "node:assert";
import { describe, it } from "node:test";
import { createNameRegistry, type NameRegistry } from "../src/names.js";
import {
  transformSource,
  type TransformSourceResult,
} from "../src/transform-source.js";
import { maskSfcStyleContent, walkSfcClassContexts } from "../src/sfc.js";
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

// R8: <html> and <body> classes in .astro layouts. Spans are sliced from the
// file itself, so a wrong offset shows up as the wrong text.
function classContexts(code: string): {
  renamed: Array<string>;
  runtime: Array<string>;
} {
  const renamed: Array<string> = [];
  const runtime: Array<string> = [];
  walkSfcClassContexts("/site/src/layouts/Layout.astro", code, {
    renameLiteral: function (literal) {
      renamed.push(code.slice(literal.start, literal.end));
    },
    runtimeLiteral: function (literal) {
      runtime.push(code.slice(literal.start, literal.end));
    },
  });
  return { renamed, runtime };
}

function layoutMarkup(head: string): string {
  return `<!doctype html>
<html lang="en" class="scroll-smooth">
  <head>
    <meta charset="utf-8" />
${head}
  </head>
  <body class="min-h-screen">
    <slot />
  </body>
</html>
`;
}

const LAYOUT_TOKENS = ["scroll-smooth", "antialiased", "min-h-screen"];

const LAYOUT_REGISTRY: NameRegistry = createNameRegistry({
  universe: new Set(LAYOUT_TOKENS),
  sourceTokens: new Set(LAYOUT_TOKENS),
  runtimeTokens: new Set(),
  exclusions: { names: [], prefixes: [] },
});

function layoutNameOf(token: string): string {
  const name = LAYOUT_REGISTRY.nameFor(token);
  assert.ok(name !== undefined, `${token} must be renamed in the registry`);
  return name;
}

// A verbatim copy of chef-tony's src/layouts/Layout.astro. Its <head> holds
// {cond && <meta />} expressions and a <JsonLd /> component.
const CHEF_TONY_LAYOUT = `---
import "../styles/global.css";
import { SITE } from "../data/site";
import { siteVariant } from "../data/site-variant";
import { PASTAS } from "../data/pasta";
import Nav from "../components/Nav.astro";
import Footer from "../components/Footer.astro";
import BrandKitModal from "../components/BrandKitModal.astro";
import OrderDialog from "../components/OrderDialog.astro";
import JsonLd from "../components/JsonLd.astro";

interface Props {
  title?: string;
  description?: string;
  crumbs?: { name: string; href: string }[];
  tile?: boolean;
  comparison?: boolean;
}

const { title, description, crumbs, tile = true, comparison = false } = Astro.props;
const brand = siteVariant(Astro.url.pathname);
const pageTitle = comparison ? "Choose a website — Chef Tony" : title ? \`\${title} — \${brand.name}\` : \`\${brand.name} — Italian Catering in Tampa\`;
const desc = (description ?? SITE.description).replaceAll(SITE.name, brand.name);
const canonicalUrl = new URL(Astro.url.pathname, SITE.url).href;
const shareImage = \`\${SITE.url}/photos/dining-wall.webp\`;
const shareImageAlt = \`\${brand.name} dining room in Tampa\`;

const positions = [
  [70, 72, -12], [240, 72, 14], [400, 72, -10], [570, 72, 12],
  [70, 208, -14], [240, 208, 16], [400, 208, -12], [570, 208, 12],
  [70, 344, 12], [240, 344, -14], [400, 344, 10], [570, 344, -15],
];
// Repeat one shape to complete an even four-by-three tile.
const patternPastas = [...Object.values(PASTAS), PASTAS.Fettuccine];
// shortcut: this tile fits the current pasta roster; re-space it when shapes are added.
if (positions.length !== patternPastas.length) throw new Error("Update the pasta tile for the new pasta roster.");
// Balance visibility so darker colors do not leave apparent holes in the repeat.
const pastaColors = [["#fdc415", .13], ["#e02d2d", .32], ["#2fae5f", .21], ["#f2ead9", .1]];
const pastaTile = \`<svg xmlns="http://www.w3.org/2000/svg" width="660" height="420" viewBox="0 0 660 420" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">\${patternPastas.map(({ shape }, index) => {
  const [x, y, angle] = positions[index];
  const [color, opacity] = pastaColors[index % pastaColors.length];
  return \`<path d="\${shape}" stroke="\${color}" stroke-opacity="\${opacity}" transform="translate(\${x} \${y}) rotate(\${angle}) scale(2.25) translate(-12 -12)"/>\`;
}).join("")}</svg>\`;
const pattern = \`url("data:image/svg+xml,\${encodeURIComponent(pastaTile)}")\`;
---

<!doctype html>
<html lang="en" data-credit="jonkwheeler made this site" data-credit-url="https://jonkwheeler.com">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{pageTitle}</title>
    <meta name="description" content={desc} />
    {brand.base && <meta name="robots" content="noindex, follow" />}
    <link rel="canonical" href={canonicalUrl} />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content={comparison ? "Chef Tony" : brand.name} />
    <meta property="og:locale" content="en_US" />
    <meta property="og:title" content={pageTitle} />
    <meta property="og:description" content={desc} />
    <meta property="og:url" content={canonicalUrl} />
    <meta property="og:image" content={shareImage} />
    <meta property="og:image:alt" content={shareImageAlt} />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content={pageTitle} />
    <meta name="twitter:description" content={desc} />
    <meta name="twitter:image" content={shareImage} />
    <meta name="twitter:image:alt" content={shareImageAlt} />
    <link rel="icon" href={brand.mascot ? "/brand/macaroni.png" : "/brand/favicon.png"} type="image/png" />
    {!brand.mascot && <link rel="icon" href="/brand/favicon.svg" type="image/svg+xml" />}
    <meta name="theme-color" content="#0a0a0c" />
    <link
      rel="preload"
      href="/fonts/big-shoulders-display-400800-normal.woff2"
      as="font"
      type="font/woff2"
      crossorigin
    />
    <link
      rel="preload"
      href="/fonts/rubik-spray-paint-400-normal.woff2"
      as="font"
      type="font/woff2"
      crossorigin
    />
    <link
      rel="preload"
      href="/fonts/archivo-400-normal.woff2"
      as="font"
      type="font/woff2"
      crossorigin
    />
    {!comparison && <JsonLd title={pageTitle} description={desc} crumbs={crumbs} />}
  </head>
  <body class="min-h-screen">
    {tile && <div class="tile-field" style={\`--pasta-repeat: \${pattern}\`} aria-hidden="true"></div>}
    {brand.base && (
      <nav class="comparison-bar" aria-label="Website comparison">
        <a href="/">Both versions</a>
        <span>{brand.mascot ? "A · Macaroni Man" : "B · Rigatoni Tower"}</span>
        <a href={\`\${brand.mascot ? "/b" : "/a"}\${brand.pathname}\`} data-version-switch>View {brand.mascot ? "B" : "A"}</a>
      </nav>
    )}
    {!comparison && <Nav />}
    <main>
      <slot />
    </main>
    {!comparison && <><Footer /><BrandKitModal /><OrderDialog /></>}
  </body>
</html>

<style>
  .comparison-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 4px 20px; border-bottom: 1px solid var(--color-line); background: var(--color-ink); font-size: 12px; }
  .comparison-bar a { display: inline-flex; min-height: 44px; align-items: center; text-decoration: underline; text-underline-offset: 4px; }
  .comparison-bar a:hover { color: var(--color-tag); }
  @media print { .comparison-bar { display: none; } }
</style>

<script>
  const versionSwitch = document.querySelector<HTMLAnchorElement>("[data-version-switch]");
  versionSwitch?.addEventListener("click", () => {
    const target = new URL(versionSwitch.href);
    target.search = location.search;
    target.hash = location.hash;
    versionSwitch.href = target.href;
  });
</script>
`;

describe("Astro html and body classes (R8)", function () {
  it("reports both classes after frontmatter", function () {
    const result = classContexts(`---
import "../styles/global.css";
const title = "x";
---
${layoutMarkup(`    <title>{title}</title>`)}`);
    assert.deepStrictEqual(result.renamed, ["scroll-smooth", "min-h-screen"]);
  });

  it("reports both classes after empty frontmatter", function () {
    const result = classContexts(`---\n---\n${layoutMarkup("")}`);
    assert.deepStrictEqual(result.renamed, ["scroll-smooth", "min-h-screen"]);
  });

  it("reports both classes after frontmatter holding a blank line", function () {
    const result = classContexts(`---\n\n---\n${layoutMarkup("")}`);
    assert.deepStrictEqual(result.renamed, ["scroll-smooth", "min-h-screen"]);
  });

  it("reports the body class when <head> holds a component tag", function () {
    const result = classContexts(`---
import BaseHead from "../components/BaseHead.astro";
---
${layoutMarkup(`    <BaseHead />`)}`);
    assert.deepStrictEqual(result.renamed, ["scroll-smooth", "min-h-screen"]);
  });

  it("reports the body class when <head> holds a conditional expression", function () {
    const result = classContexts(`---
const noindex = true;
---
${layoutMarkup(`    {noindex && <meta name="robots" content="noindex" />}`)}`);
    assert.deepStrictEqual(result.renamed, ["scroll-smooth", "min-h-screen"]);
  });

  it("reports the body class when <head> holds <ClientRouter />", function () {
    const result = classContexts(`---
import { ClientRouter } from "astro:transitions";
---
${layoutMarkup(`    <ClientRouter />`)}`);
    assert.deepStrictEqual(result.renamed, ["scroll-smooth", "min-h-screen"]);
  });

  it("recovers the body class from the real tag, not a commented-out one", function () {
    const result = classContexts(`---
import BaseHead from "../components/BaseHead.astro";
---
${layoutMarkup(`    <BaseHead />
    <!-- <body class="antialiased"> -->`)}`);
    assert.deepStrictEqual(result.renamed, ["scroll-smooth", "min-h-screen"]);
  });

  it("reports the html class when content precedes <html>", function () {
    const result = classContexts(`---
---
{/* The site shell. */}
${layoutMarkup("")}`);
    assert.deepStrictEqual(result.renamed, ["scroll-smooth", "min-h-screen"]);
  });

  it("reports min-h-screen on <body> in chef-tony's layout", function () {
    const result = classContexts(CHEF_TONY_LAYOUT);
    assert.deepStrictEqual(result.renamed, ["min-h-screen"]);
  });

  it("renames html and body classes in a layout", function () {
    const result = transformSource({
      code: `---
import BaseHead from "../components/BaseHead.astro";
---
<!doctype html>
<html lang="en" class="scroll-smooth antialiased">
  <head>
    <BaseHead />
  </head>
  <body class="min-h-screen">
    <slot />
  </body>
</html>
`,
      id: "/site/src/layouts/Layout.astro",
      registry: LAYOUT_REGISTRY,
    });
    assert.ok(result !== null);
    assert.ok(
      result.code.includes(
        `<html lang="en" class="${layoutNameOf("scroll-smooth")} ${layoutNameOf("antialiased")}">`,
      ),
    );
    assert.ok(
      result.code.includes(`<body class="${layoutNameOf("min-h-screen")}">`),
    );
    assert.deepStrictEqual(result.warnings, []);
  });

  it("keeps template-expression html and body classes unprovable", function () {
    const code = `---
import BaseHead from "../components/BaseHead.astro";
const dark = true;
const open = true;
---
<!doctype html>
<html lang="en" class={dark ? "scroll-smooth" : "antialiased"}>
  <head>
    <BaseHead />
  </head>
  <body class={open ? "min-h-screen" : ""}>
    <slot />
  </body>
</html>
`;
    const result = transformSource({
      code,
      id: "/site/src/layouts/Layout.astro",
      registry: LAYOUT_REGISTRY,
    });
    assert.ok(result !== null);
    assert.strictEqual(result.code, code);
    assert.strictEqual(
      result.warnings.filter(function (warning) {
        return warning.kind === "unprovable-expression";
      }).length,
      3,
    );
    assert.deepStrictEqual(classContexts(code), {
      renamed: [],
      runtime: ["scroll-smooth", "antialiased", "min-h-screen"],
    });
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
