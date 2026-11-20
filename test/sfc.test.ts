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

  it("renames class:list literals written across lines", function () {
    const result = transform(
      `<div
  class:list={[
    "flex items-center",
    { "p-4": active },
  ]}
>x</div>
`,
      "/site/src/Card.astro",
    );
    assert.ok(result !== null);
    assert.ok(
      result.code.includes(`"${nameOf("flex")} ${nameOf("items-center")}"`),
    );
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

interface ClassEvent {
  event: string;
  kind: string;
  source?: string;
  text?: string;
  quoted?: boolean;
  fullyLiteral?: boolean;
  staticList?: boolean;
}

// Every visitor callback in order. Literal spans are sliced from the file,
// so two layouts that differ only outside the class compare equal exactly
// when they classify the class the same way.
function classEvents(code: string): Array<ClassEvent> {
  const events: Array<ClassEvent> = [];
  function literalEvent(
    event: string,
    literal: { text: string; start: number; end: number; quoted: boolean },
    kind: string,
  ): ClassEvent {
    return {
      event,
      kind,
      source: code.slice(literal.start, literal.end),
      text: literal.text,
      quoted: literal.quoted,
    };
  }
  walkSfcClassContexts("/site/src/layouts/Layout.astro", code, {
    enterRenameGroup: function (kind) {
      events.push({ event: "enter", kind });
    },
    exitRenameGroup: function (kind, fullyLiteral, staticList) {
      events.push({ event: "exit", kind, fullyLiteral, staticList });
    },
    renameLiteral: function (literal, kind) {
      events.push(literalEvent("rename", literal, kind));
    },
    runtimeLiteral: function (literal, kind) {
      events.push(literalEvent("runtime", literal, kind));
    },
    unprovableTemplate: function (_node, kind) {
      events.push({ event: "unprovable", kind });
    },
  });
  return events;
}

function classListLayout(head: string, classList: string): string {
  return `---
import HeadMeta from "../components/HeadMeta.astro";
const dark = true;
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    ${head}
  </head>
  <body class:list=${classList}>
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

  it("ends empty frontmatter at its own fence, not a later --- line", function () {
    // Astro closes frontmatter at the first ---, so everything up to the
    // <pre> line is template too.
    const result = classContexts(`---
---
<p class="flex flex-col">before</p>
<pre>
---
</pre>
<p class="mb-16">after</p>
`);
    assert.deepStrictEqual(result, {
      renamed: ["flex flex-col", "mb-16"],
      runtime: [],
    });
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

  it("reports an adopted <body class:list> exactly like a located one", function () {
    for (const classList of [
      `{["rounded-lg flex gap-4", { "bg-black": dark }]}`,
      `{[
      "rounded-lg flex gap-4",
      { "bg-black": dark },
    ]}`,
    ]) {
      // A plain <head> keeps the body's source location; <HeadMeta /> makes
      // parse5 imply <body> and adopt the literal tag's attributes.
      const control = classEvents(
        classListLayout(`<title>x</title>`, classList),
      );
      const adopted = classEvents(classListLayout(`<HeadMeta />`, classList));
      assert.ok(
        control.some(function (event) {
          return event.source === "rounded-lg flex gap-4";
        }),
      );
      assert.ok(
        control.some(function (event) {
          return event.source === "bg-black";
        }),
      );
      assert.deepStrictEqual(adopted, control);
    }
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
    // The other two sit on markup inside <body>'s {tile && ...} and
    // {brand.base && (...)} expressions (R1).
    assert.deepStrictEqual(result.renamed, [
      "min-h-screen",
      "tile-field",
      "comparison-bar",
    ]);
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

// prettier-plugin-astro breaks long expressions across lines; each must
// classify exactly like its one-line form.
describe("Astro expressions written across lines", function () {
  it("reports class:list array and object tokens like the one-line form", function () {
    const oneLine = classContexts(
      `<span class:list={["inline-flex px-3", { "bg-sky-100": tone === "info" }]}>x</span>\n`,
    );
    const multiLine = classContexts(`<span
  class:list={[
    "inline-flex px-3",
    { "bg-sky-100": tone === "info" },
  ]}
>x</span>
`);
    assert.ok(oneLine.renamed.includes("inline-flex px-3"));
    assert.ok(oneLine.renamed.includes("bg-sky-100"));
    assert.deepStrictEqual(multiLine, oneLine);
  });

  it("reports every class in the astro fixture's Badge.astro", function () {
    // A verbatim copy of test/fixtures/astro-site/src/components/Badge.astro.
    const result = classContexts(`---
interface Props {
  label: string;
  tone: "info" | "warn";
}

const { label, tone } = Astro.props;
---

<span
  data-badge={tone}
  class:list={[
    "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium",
    {
      "bg-sky-100 text-sky-800": tone === "info",
      "bg-amber-100 text-amber-800": tone === "warn",
    },
  ]}
>
  {label}
</span>
`);
    for (const classes of [
      "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium",
      "bg-sky-100 text-sky-800",
      "bg-amber-100 text-amber-800",
    ]) {
      assert.ok(result.renamed.includes(classes), classes);
    }
    assert.deepStrictEqual(result.runtime, []);
  });

  it("keeps a class={...} ternary unprovable", function () {
    const oneLine = classContexts(
      `<div class={open ? "flex p-4" : "items-center"}>x</div>\n`,
    );
    const multiLine = classContexts(`<div
  class={open
    ? "flex p-4"
    : "items-center"}
>x</div>
`);
    assert.deepStrictEqual(oneLine, {
      renamed: [],
      runtime: ["flex p-4", "items-center"],
    });
    assert.deepStrictEqual(multiLine, oneLine);
  });

  it("keeps an adopted <body> class={...} ternary unprovable", function () {
    const result = classContexts(`---
import BaseHead from "../components/BaseHead.astro";
---
<!doctype html>
<html lang="en">
  <head>
    <BaseHead />
  </head>
  <body
    class={open
      ? "min-h-screen"
      : "antialiased"}
  >
    <slot />
  </body>
</html>
`);
    assert.deepStrictEqual(result, {
      renamed: [],
      runtime: ["min-h-screen", "antialiased"],
    });
  });

  it("leaves elements around a content expression unchanged", function () {
    // The expression's own markup is read in place, as on one line.
    const oneLine = classContexts(
      `<ul class="flex flex-col">{items.map((item) => (<li class="p-4">{item}</li>))}</ul>
<p class="mb-16">after</p>
`,
    );
    const multiLine = classContexts(`<ul class="flex flex-col">
  {items.map((item) => (
    <li class="p-4">
      {item}
    </li>
  ))}
</ul>
<p class="mb-16">after</p>
`);
    assert.deepStrictEqual(oneLine, {
      renamed: ["flex flex-col", "p-4", "mb-16"],
      runtime: [],
    });
    assert.deepStrictEqual(multiLine, oneLine);
  });
});

// R1 and R2: markup inside Astro content expressions is read with the JSX
// rules, and its text never moves an expression's end.
describe("Astro expression markup (R1, R2)", function () {
  function svelteContexts(code: string): {
    renamed: Array<string>;
    runtime: Array<string>;
  } {
    const renamed: Array<string> = [];
    const runtime: Array<string> = [];
    walkSfcClassContexts("/site/src/Card.svelte", code, {
      renameLiteral: function (literal) {
        renamed.push(code.slice(literal.start, literal.end));
      },
      runtimeLiteral: function (literal) {
        runtime.push(code.slice(literal.start, literal.end));
      },
    });
    return { renamed, runtime };
  }

  const EXPRESSION_TOKENS = ["flex", "p-4", "w-8", "mt-4"];
  const EXPRESSION_REGISTRY: NameRegistry = createNameRegistry({
    universe: new Set(EXPRESSION_TOKENS),
    sourceTokens: new Set(EXPRESSION_TOKENS),
    runtimeTokens: new Set(),
    exclusions: { names: [], prefixes: [] },
  });

  function expressionNameOf(token: string): string {
    const name = EXPRESSION_REGISTRY.nameFor(token);
    assert.ok(name !== undefined, `${token} must be renamed in the registry`);
    return name;
  }

  function transformExpression(code: string): TransformSourceResult {
    const result = transformSource({
      code,
      id: "/site/src/components/List.astro",
      registry: EXPRESSION_REGISTRY,
    });
    assert.ok(result !== null);
    return result;
  }

  it("classifies a mapped element's class like template markup", function () {
    assert.deepStrictEqual(
      classEvents(
        `<ul>{items.map((item) => <li class="p-4">{item}</li>)}</ul>\n`,
      ),
      classEvents(`<ul><li class="p-4">x</li></ul>\n`),
    );
  });

  it("reports a && conditional's classes", function () {
    assert.deepStrictEqual(
      classContexts(
        `<p>x{cond && <span class="ml-2 text-xs">new</span>}</p>\n`,
      ),
      { renamed: ["ml-2 text-xs"], runtime: [] },
    );
  });

  it("reports both branches of a ternary", function () {
    assert.deepStrictEqual(
      classContexts(
        `{cond ? <b class="font-bold">a</b> : <i class="italic">b</i>}\n`,
      ),
      { renamed: ["font-bold", "italic"], runtime: [] },
    );
  });

  it("reports nested maps", function () {
    assert.deepStrictEqual(
      classContexts(
        `{groups.map((g) => <ul>{g.items.map((i) => <li class="py-1">{i}</li>)}</ul>)}\n`,
      ),
      { renamed: ["py-1"], runtime: [] },
    );
  });

  it("gives class:list cn() semantics, as at top level", function () {
    const inExpression = classEvents(
      `{on && <div class:list={["a", { "b": on }]}>x</div>}\n`,
    );
    assert.deepStrictEqual(inExpression, [
      { event: "enter", kind: "cn-argument" },
      {
        event: "rename",
        kind: "cn-argument",
        source: "a",
        text: "a",
        quoted: true,
      },
      {
        event: "rename",
        kind: "cn-argument",
        source: "b",
        text: "b",
        quoted: true,
      },
      {
        event: "exit",
        kind: "cn-argument",
        fullyLiteral: false,
        staticList: false,
      },
    ]);
    assert.deepStrictEqual(
      inExpression,
      classEvents(`<div class:list={["a", { "b": on }]}>x</div>\n`),
    );
  });

  it("poisons a class={...} ternary, as at top level", function () {
    const inExpression = classContexts(
      `{show && <div class={cond ? "x" : "y"}>z</div>}\n`,
    );
    assert.deepStrictEqual(inExpression, { renamed: [], runtime: ["x", "y"] });
    assert.deepStrictEqual(
      inExpression,
      classContexts(`<div class={cond ? "x" : "y"}>z</div>\n`),
    );
  });

  it("never lets an apostrophe in expression text hide later elements (AE2)", function () {
    assert.deepStrictEqual(
      classContexts(
        `{cond && <p>Don't</p>}<div class="mt-4">x</div>{more && <p>It's</p>}\n`,
      ),
      { renamed: ["mt-4"], runtime: [] },
    );
  });

  for (const [label, expression] of [
    ["a string", `"}"`],
    ["a template literal", "`${a}}`"],
    ["a comment", `/* } */ x`],
  ]) {
    it(`ends a run holding a brace in ${label} at its own brace`, function () {
      // Ended early, the run would leave the string's markup to the parser.
      assert.deepStrictEqual(
        classContexts(
          `<p>{${expression} || '<b class="p-4">'}</p>\n<div class="mt-4">x</div>\n`,
        ),
        { renamed: ["mt-4"], runtime: [] },
      );
    });
  }

  it("reads an unclosed void element and renames it at its exact span", function () {
    const code = `{cond && <><br><img class="w-8" src="a.png"><hr><span class="p-4">x</span></>}\n<div class="mt-4">y</div>\n`;
    assert.deepStrictEqual(classContexts(code), {
      renamed: ["w-8", "p-4", "mt-4"],
      runtime: [],
    });
    const result = transformExpression(code);
    assert.strictEqual(
      result.code,
      `{cond && <><br><img class="${expressionNameOf("w-8")}" src="a.png"><hr><span class="${expressionNameOf("p-4")}">x</span></>}\n<div class="${expressionNameOf("mt-4")}">y</div>\n`,
    );
  });

  it("skips a run TSX rejects and still reads the elements around it", function () {
    assert.deepStrictEqual(
      classContexts(
        `<div class="flex">{cond && <div><!-- note --><span class="p-4">x</span></div>}</div>\n<p class="mt-4">y</p>\n`,
      ),
      { renamed: ["flex", "mt-4"], runtime: [] },
    );
  });

  for (const expression of ["title", "a < b", "a<b"]) {
    it(`reads nothing from {${expression}} and still reads the next element`, function () {
      assert.deepStrictEqual(
        classContexts(`<p>{${expression}}</p>\n<div class="mt-4">x</div>\n`),
        { renamed: ["mt-4"], runtime: [] },
      );
    });
  }

  it("reads markup after a type argument", function () {
    assert.deepStrictEqual(
      classContexts(
        `{(xs as Array<Item>).map((x) => <li class="p-4">{x}</li>)}\n`,
      ),
      { renamed: ["p-4"], runtime: [] },
    );
  });

  it("reads markup after a comparison in the same run", function () {
    assert.deepStrictEqual(
      classContexts(
        `{count<max ? <span class="p-4">x</span> : null}<div class="mt-2">y</div>\n`,
      ),
      { renamed: ["p-4", "mt-2"], runtime: [] },
    );
  });

  it("keeps {count<max} one masked run in Svelte", function () {
    assert.deepStrictEqual(
      svelteContexts(`<p>{count<max}</p>\n<div class="mt-2">y</div>\n`),
      { renamed: ["mt-2"], runtime: [] },
    );
  });

  it("walks no braces inside <style> or <title>", function () {
    assert.deepStrictEqual(
      classContexts(`<html>
  <head>
    <title>{cond && <b class="p-4">x</b>}</title>
    <style>
      .a {(<b class="w-8">x</b>)}
    </style>
  </head>
  <body class="mt-4"></body>
</html>
`),
      { renamed: ["mt-4"], runtime: [] },
    );
  });

  it("renames a class inside an expression at its exact span", function () {
    const result = transformExpression(
      `<ul class="flex">{items.map((item) => <li class="p-4">{item}</li>)}</ul>\n`,
    );
    assert.strictEqual(
      result.code,
      `<ul class="${expressionNameOf("flex")}">{items.map((item) => <li class="${expressionNameOf("p-4")}">{item}</li>)}</ul>\n`,
    );
    assert.deepStrictEqual(result.warnings, []);
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

// R4 and R5: parse5 drops table-fragment and in-select start tags with their
// attributes, lowercases component names onto those same paths, and reads
// <noscript> content as raw text. Each list below is sliced from the file,
// so a wrong offset shows up as the wrong text.
function classAttributesIn(filePath: string, code: string): Array<string> {
  const lists: Array<string> = [];
  walkSfcClassContexts(filePath, code, {
    renameLiteral: function (literal, kind) {
      assert.strictEqual(kind, "class-attribute");
      lists.push(code.slice(literal.start, literal.end));
    },
    runtimeLiteral: function (literal) {
      assert.fail(`runtime literal ${code.slice(literal.start, literal.end)}`);
    },
  });
  return lists;
}

describe("table, select, look-alike component, and noscript markup (R4, R5)", function () {
  it("reports a table row component's root classes (AE4)", function () {
    assert.deepStrictEqual(
      classAttributesIn(
        "/site/src/components/Row.astro",
        `---
const { label } = Astro.props;
---
<tr class="border-b"><td class="px-4">{label}</td></tr>
`,
      ),
      ["border-b", "px-4"],
    );
  });

  it("reports the classes on every table-fragment root", function () {
    for (const [markup, expected] of [
      [
        `<tbody class="divide-y"><tr class="h-8"><td>x</td></tr></tbody>`,
        ["divide-y", "h-8"],
      ],
      [
        `<thead class="bg-stone-50"><tr><th>x</th></tr></thead>`,
        ["bg-stone-50"],
      ],
      [`<tfoot class="font-bold"><tr><td>x</td></tr></tfoot>`, ["font-bold"]],
      [`<th class="text-left">x</th>`, ["text-left"]],
      [`<caption class="sr-only">x</caption>`, ["sr-only"]],
      [`<colgroup><col class="w-1/3" /><col /></colgroup>`, ["w-1/3"]],
      [`<col class="w-1/3">`, ["w-1/3"]],
    ] as const) {
      assert.deepStrictEqual(
        classAttributesIn("/site/src/components/Part.astro", `${markup}\n`),
        expected,
        markup,
      );
    }
  });

  it("reports a row wrapped in a component", function () {
    for (const filePath of [
      "/site/src/components/Rows.astro",
      "/site/src/Rows.svelte",
    ]) {
      assert.deepStrictEqual(
        classAttributesIn(
          filePath,
          `<MyTable><tr class="h-8"><td>x</td></tr></MyTable>\n`,
        ),
        ["h-8"],
        filePath,
      );
    }
    assert.deepStrictEqual(
      classAttributesIn(
        "/site/src/Rows.vue",
        `<template><MyTable><tr class="h-8"><td>x</td></tr></MyTable></template>\n`,
      ),
      ["h-8"],
    );
  });

  it("reports markup inside <select> and <option>", function () {
    const markup = `<select class="w-full"><option class="p-2"><span class="font-bold">x</span></option></select>`;
    for (const [filePath, code] of [
      ["/site/src/components/Picker.astro", `${markup}\n`],
      ["/site/src/Picker.svelte", `${markup}\n`],
      ["/site/src/Picker.vue", `<template>${markup}</template>\n`],
      ["/out/index.html", `<!doctype html><html><body>${markup}</body></html>`],
    ]) {
      assert.deepStrictEqual(
        classAttributesIn(filePath, code),
        ["w-full", "p-2", "font-bold"],
        filePath,
      );
    }
  });

  it("reports a component named like <select> and its children", function () {
    for (const filePath of [
      "/site/src/components/Field.astro",
      "/site/src/Field.svelte",
    ]) {
      assert.deepStrictEqual(
        classAttributesIn(
          filePath,
          `<Select class="w-full"><span class="ml-2">x</span></Select>\n`,
        ),
        ["w-full", "ml-2"],
        filePath,
      );
    }
  });

  it("reads a component named like a raw-text element as an element", function () {
    assert.deepStrictEqual(
      classAttributesIn(
        "/site/src/components/Heading.astro",
        `<Title class="text-xl"><b class="font-bold">x</b></Title>\n`,
      ),
      ["text-xl", "font-bold"],
    );
  });

  it("reports classes on markup inside <noscript> (AE5)", function () {
    const markup = `<noscript><p class="text-sm">Enable JavaScript</p></noscript>`;
    assert.deepStrictEqual(
      classAttributesIn(
        "/site/src/pages/about.astro",
        `<main class="mx-auto">${markup}</main>\n`,
      ),
      ["mx-auto", "text-sm"],
    );
    assert.deepStrictEqual(
      classAttributesIn(
        "/out/about/index.html",
        `<!doctype html><html><body><main class="mx-auto">${markup}</main></body></html>`,
      ),
      ["mx-auto", "text-sm"],
    );
  });

  it("recovers the body class after a <noscript> in <head> implies <body>", function () {
    // With scripting off, the <img> ends <head> and implies <body>, so the
    // real <body> start tag only adds its attributes, without a location.
    // The walk is in tree order: the implied <body> holds the <img>.
    assert.deepStrictEqual(
      classContexts(`---
const title = "x";
---
<!doctype html>
<html lang="en">
  <head>
    <title>{title}</title>
    <noscript><img class="h-0" src="/pixel.gif" alt="" /></noscript>
  </head>
  <body class="min-h-screen">
    <slot />
  </body>
</html>
`),
      { renamed: ["min-h-screen", "h-0"], runtime: [] },
    );
    assert.deepStrictEqual(
      classAttributesIn(
        "/out/index.html",
        `<!doctype html><html lang="en"><head><title>x</title>` +
          `<noscript><img class="h-0" src="/pixel.gif" alt=""></noscript>` +
          `</head><body class="min-h-screen"><main>x</main></body></html>`,
      ),
      ["min-h-screen", "h-0"],
    );
  });

  it("never reads a literal <body inside a <textarea> as a tag", function () {
    assert.deepStrictEqual(
      classContexts(`---
import BaseHead from "../components/BaseHead.astro";
---
<!doctype html>
<html lang="en">
  <head>
    <BaseHead />
    <textarea><body class="antialiased"></textarea>
  </head>
  <body class="min-h-screen">
    <slot />
  </body>
</html>
`),
      { renamed: ["min-h-screen"], runtime: [] },
    );
  });
});

// R3 and KTD5: a top-level, non-exported frontmatter const holding a class
// string is read like a class attribute when every reference to it is a
// class position, and is left unread otherwise.
describe("Astro frontmatter class constants (R3)", function () {
  const CARD = "rounded-lg p-6";
  const CONSTANT_TOKENS = ["rounded-lg", "p-6", "px-2"];
  const CONSTANT_REGISTRY: NameRegistry = createNameRegistry({
    universe: new Set(CONSTANT_TOKENS),
    sourceTokens: new Set(CONSTANT_TOKENS),
    runtimeTokens: new Set(),
    exclusions: { names: [], prefixes: [] },
  });

  function constantNameOf(token: string): string {
    const name = CONSTANT_REGISTRY.nameFor(token);
    assert.ok(name !== undefined, `${token} must be renamed in the registry`);
    return name;
  }

  function transformConstant(code: string): TransformSourceResult {
    const result = transformSource({
      code,
      id: "/site/src/components/Panel.astro",
      registry: CONSTANT_REGISTRY,
    });
    assert.ok(result !== null);
    return result;
  }

  function withCard(template: string, frontmatter = ""): string {
    return `---\nconst card = "${CARD}";\n${frontmatter}---\n${template}\n`;
  }

  // How often the constant's literal is reported as a rename, and whether
  // it is ever reported as a runtime literal.
  function cardReads(code: string): { renamed: number; runtime: boolean } {
    const result = classContexts(code);
    return {
      renamed: result.renamed.filter(function (source) {
        return source === CARD;
      }).length,
      runtime: result.runtime.includes(CARD),
    };
  }

  const READ = { renamed: 1, runtime: false };
  const UNREAD = { renamed: 0, runtime: false };

  it("reports a constant used only as class={card} as one dynamic group (AE3)", function () {
    assert.deepStrictEqual(classEvents(withCard(`<div class={card}>x</div>`)), [
      { event: "enter", kind: "class-attribute" },
      {
        event: "rename",
        kind: "class-attribute",
        source: CARD,
        text: CARD,
        quoted: true,
      },
      {
        event: "exit",
        kind: "class-attribute",
        fullyLiteral: true,
        staticList: false,
      },
    ]);
  });

  it("renames the frontmatter literal in place (AE3)", function () {
    const result = transformConstant(withCard(`<div class={card}>x</div>`));
    assert.strictEqual(
      result.code,
      `---\nconst card = "${constantNameOf("rounded-lg")} ${constantNameOf("p-6")}";\n---\n<div class={card}>x</div>\n`,
    );
    assert.deepStrictEqual(result.warnings, []);
  });

  it("reports the literal once however many class positions use it", function () {
    assert.deepStrictEqual(
      cardReads(
        withCard(
          `<div class={card}>a</div>\n<p class:list={[card]}>b</p>\n{on && <b class={card}>c</b>}`,
        ),
      ),
      READ,
    );
  });

  for (const [label, template] of [
    ["the whole class:list expression", `<div class:list={card}>x</div>`],
    [
      "a class:list array element",
      `<div class:list={[card, { ring: on }]}>x</div>`,
    ],
    [
      "a class:list element nested in arrays",
      `<div class:list={["px-2", [[card]]]}>x</div>`,
    ],
    ["a component's class prop", `<Comp class={card} />`],
    ["a self-closed component's class prop", `<Comp class={card}/>`],
    [
      "class={card} inside expression markup",
      `<ul>{items.map((item) => <li class={card}>{item}</li>)}</ul>`,
    ],
    [
      "class:list inside expression markup",
      `{on && <b class:list={[card, { ring: on }]}>x</b>}`,
    ],
    [
      "a cn() argument inside expression markup",
      `{on && <b class={cn(card, "px-2")}>x</b>}`,
    ],
  ]) {
    it(`reads a constant used as ${label}`, function () {
      assert.deepStrictEqual(cardReads(withCard(template)), READ);
    });
  }

  it("reads a constant used as an adopted <body>'s class", function () {
    assert.deepStrictEqual(
      cardReads(
        withCard(`<html lang="en">
  <head>
    <HeadMeta />
  </head>
  <body class={card}>
    <slot />
  </body>
</html>`),
      ),
      READ,
    );
  });

  it("reads a constant passed to cn() in the frontmatter", function () {
    const code = withCard(
      `<div class={merged}>x</div>`,
      `import { cn } from "../lib/cn";\nconst merged = cn(card, "px-2");\n`,
    );
    assert.deepStrictEqual(cardReads(code), READ);
    const result = transformConstant(code);
    assert.ok(
      result.code.includes(
        `const card = "${constantNameOf("rounded-lg")} ${constantNameOf("p-6")}";`,
      ),
      result.code,
    );
    assert.ok(
      result.code.includes(`cn(card, "${constantNameOf("px-2")}")`),
      result.code,
    );
    assert.deepStrictEqual(result.warnings, []);
  });

  it("reads a constant held in a template literal without substitutions", function () {
    assert.deepStrictEqual(
      cardReads(
        `---\nconst card = \`${CARD}\`;\n---\n<div class={card}>x</div>\n`,
      ),
      READ,
    );
  });

  for (const [label, template, frontmatter] of [
    ["title={card}", `<div class={card} title={card}>x</div>`, ""],
    [
      "<meta content={card}>",
      `<meta content={card} /><div class={card}>x</div>`,
      "",
    ],
    ["a text expression", `<p>{card}</p><div class={card}>x</div>`, ""],
    [
      "part of a class expression",
      `<div class={on ? card : "px-2"}>x</div><p class={card}>y</p>`,
      "",
    ],
    [
      "a quoted class value",
      `<div class="{card}">x</div><p class={card}>y</p>`,
      "",
    ],
    [
      "a non-class attribute inside expression markup",
      `{on && <b class={card} title={card}>x</b>}`,
      "",
    ],
    [
      "a shadowing parameter",
      `{items.map((card) => <li class={card}>{card}</li>)}`,
      "",
    ],
    [
      "a run TSX rejects",
      `<div class={card}>x</div>{on && <div><!-- note --><b title={card}>y</b></div>}`,
      "",
    ],
    [
      "console.log(card) in the frontmatter",
      `<div class={card}>x</div>`,
      "console.log(card);\n",
    ],
    [
      "concatenation in the frontmatter",
      `<div class={card}>x</div>`,
      `const x = card + " y";\n`,
    ],
    [
      "an identifier in a <script> block",
      `<div class={card}>x</div>\n<script>\n  console.log(card);\n</script>`,
      "",
    ],
    ["a spread", `<div class={card}>x</div><p>{[...card].length}</p>`, ""],
  ]) {
    it(`leaves a constant also used in ${label} unread`, function () {
      assert.deepStrictEqual(
        cardReads(withCard(template, frontmatter)),
        UNREAD,
      );
    });
  }

  it("keeps the literal's bytes when the constant is unread", function () {
    const code = withCard(`<div class={card} title={card}>x</div>`);
    assert.strictEqual(transformConstant(code).code, code);
  });

  for (const [label, frontmatter] of [
    ["an exported const", `export const card = "${CARD}";`],
    ["a let", `let card = "${CARD}";`],
    [
      "a template literal with a substitution",
      "const size = 6;\nconst card = `rounded-lg p-${size}`;",
    ],
    ["a const inside a block", `{\n  const card = "${CARD}";\n}`],
  ]) {
    it(`leaves ${label} unread`, function () {
      const result = classContexts(
        `---\n${frontmatter}\n---\n<div class={card}>x</div>\n`,
      );
      assert.deepStrictEqual(result, { renamed: [], runtime: [] });
    });
  }

  it("leaves an unreferenced constant unread", function () {
    assert.deepStrictEqual(
      classContexts(withCard(`<div class="px-2">x</div>`)),
      { renamed: ["px-2"], runtime: [] },
    );
  });

  it("never counts the name in template text, static values, or after a dot", function () {
    assert.deepStrictEqual(
      cardReads(
        withCard(
          `<p title="card" class="card">A card, {item.card}</p>\n<div class={card}>x</div>`,
          `const label = Astro.props.card;\n// card\n`,
        ),
      ),
      READ,
    );
  });
});
