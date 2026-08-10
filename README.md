# minwind

Shrinks Tailwind CSS classnames at build time. It renames every utility class
to a short generated name, rewrites your HTML, JS, and CSS together, and
consolidates repeated class lists into single rules. Production builds only —
your source and your dev server stay readable.

Ships as a Vite plugin, a webpack/rspack plugin + loader, and a post-build
CLI for bundlers without a plugin hook (Turbopack, esbuild, Parcel).

```html
<!-- before -->
<div class="mx-auto flex min-h-screen max-w-3xl flex-col px-6">
  <span class="flex items-center gap-5 text-sm font-medium"></span>
</div>

<!-- after -->
<div class="quill willow north lark ember ljaa">
  <span class="willow glen brook dog drift"></span>
</div>
```

## Why

Tailwind class attributes are long, repeated on every element, and shipped in
every HTML page. Brotli hides some of it, but not all: the class strings still
cost bytes on the wire, and they dominate the DOM you read in devtools.

Measured on a real SolidStart site ([jonkwheeler.com](https://jonkwheeler.com),
~40 prerendered routes):

|                        | before    | after    | delta  |
| ---------------------- | --------- | -------- | ------ |
| HTML + CSS, raw        | 1,768 KB  | 1,356 KB | -23.3% |
| HTML + CSS, Brotli 11  | 100.9 KB  | 96.9 KB  | -4.0%  |
| median class attribute | 106 chars | 26 chars | -75%   |

And on the tiny demo app in `examples/demo` (3 routes):

|                        | before   | after    | delta |
| ---------------------- | -------- | -------- | ----- |
| HTML + CSS, raw        | 58.0 KB  | 53.4 KB  | -8.0% |
| median class attribute | 47 chars | 23 chars | -51%  |

Every claim above is gated by the comparison harness: it builds your site with
the plugin off and on, crawls both outputs, and fails unless the rendered
styles match element-for-element, screenshots are pixel-identical, there are
zero console errors, and interactions (clicks, client-side navigation, theme
toggles) behave the same.

## Install

```bash
npm install minwind
# peer deps: tailwindcss v4, plus vite for the Vite plugin
```

## Use

### Vite (and SolidStart, Astro-on-Vite, SvelteKit, ...)

```ts
// vite.config.ts (or app.config.ts for SolidStart)
import { minwind } from "minwind";

export default defineConfig({
  plugins: [
    minwind(),
    // ...
  ],
});
```

Build. That's it. The plugin only runs on `vite build`; dev is untouched.

### webpack / rspack (including Next.js on webpack)

```ts
// webpack.config.ts
import { MinwindWebpackPlugin } from "minwind/webpack";

export default {
  module: {
    rules: [
      {
        test: /\.(?:[cm]?[jt]s|[jt]sx|vue|svelte|astro)$/,
        enforce: "pre", // required: minwind must run before any JSX/TS compiler
        use: [MinwindWebpackPlugin.loader],
      },
    ],
  },
  plugins: [new MinwindWebpackPlugin()],
};
```

The loader rewrites class contexts per module; the plugin runs the pre-pass
in `beforeCompile` and rewrites emitted CSS after minification (before
content hashing, so hashes reflect the final bytes). The same zero-rename
tripwire as the Vite plugin fails the build if the loader ordering breaks.
Works with rspack unchanged — same hooks, same stage constants.

### Turbopack, esbuild, Parcel — anything else: `minwind apply`

Turbopack has no equivalent of "run before the framework compiler, rewrite
emitted CSS after minification", so for plugin-less bundlers minwind rewrites
the build output directory instead:

```bash
pnpm build                          # your normal production build
npx minwind apply .output/public    # rewrites HTML, CSS, and JS in place
```

`apply` computes the same rename registry from your source, then rewrites
emitted `.html` (class attributes), `.css` (selectors plus consolidation),
and `.js` bundles — conservatively: only provable class lists in bundles
(markup-template `class="..."` spans and `class`/`className` property
literals). A token that shows up anywhere the rewriter can't prove — a
minified call argument, an SSR payload in an inline script — keeps its
original name everywhere, stylesheet included, and the report lists it as a
`runtime-context` exclusion. That is the trade-off of post-build rewriting:
slightly less compression than a source-level plugin, never a broken
runtime reference. Flags: `--root`, `--css-entry`, `--no-consolidate`,
`--dry-run`. Themed naming (`words`/`quotes`) needs plugin options, so
`apply` is hash-naming only.

### Supported sources

The source transform walks `ts`, `tsx`, `js`, `jsx`, `mts`, `cts`, `mjs`,
`cjs`, and the single-file-component formats `.vue`, `.svelte`, and `.astro`
(template class attributes, framework bindings like `:class` /
`class:list` / `class:foo`, and `<script>` blocks all classify through the
same walker, so the pre-pass and the transform can never disagree). The JS
family parses `.js`/`.mjs`/`.cjs` as JSX — a safe superset for valid JS, and
React-flavored projects legitimately put JSX in `.js` files.

### Measure first, before installing anything

Point the read-only CLI at an existing production build to project the savings:

```bash
npx minwind measure .output/public
```

It reports the projected gzip/Brotli delta for the rename arm, the consolidate
arm, and the theoretical upper bound, without modifying anything.

After a plugin build, summarize what happened:

```bash
npx minwind report        # reads .output/minwind/report.json
```

## Naming strategies

The default is content-hash naming: each class maps to a short stable hash
(`xkzu`, `au6h`), identical across builds, so long-term caching works.

If you want the DOM to have some personality, provide a vocabulary or a quote
corpus:

```ts
minwind({
  naming: {
    strategy: "quotes",
    corpus: ["the quick brown fox jumps over the lazy dog"],
    vocabulary: ["quill", "willow", "ember", "lark", "glen", "harbor"],
  },
});
```

With `quotes`, the classes on a single element spell out fragments of your
corpus — `class="the quick brown"` — and leftover tokens fall back to
vocabulary words, then hashes. With `words`, every token draws from the
vocabulary. Names are always valid CSS identifiers and never collide with
classes you excluded.

A fair warning about `quotes`: names are a global bijection, so a quote word
appears everywhere its token appears — the one list that assembles
`"everything that happens now"` is outnumbered by the elements where
`everything` sits next to unrelated words. Quotes land best on sites with
long, distinctive class lists; if your DOM is mostly short lists of common
utilities, `words` reads better. Single-token lists never take quote words
for this reason — a lone word is mid-quote residue.

### Prominence-aware dealing

With `words`, the default deal is purely byte-driven: the shortest words go
to the most-rendered tokens, blind to where a class sits in the DOM. If
you'd rather the document shell — the elements someone meets first in
devtools — wear the most iconic names, generate a prominence manifest from
a minwind-off build and pass it in:

```bash
MINWIND=off pnpm build
npx minwind prominence .output/public   # writes minwind.prominence.json
pnpm build
```

```ts
import { readFileSync } from "node:fs";

// The manifest is a build artifact; read it leniently so a missing file
// means "no prominence deal" rather than a config-load error. (A static
// `import ... with { type: "json" }` would hard-fail without the file, and
// config bundlers like esbuild may not support import attributes.)
function loadProminence(): Record<string, number> | undefined {
  try {
    return JSON.parse(readFileSync("minwind.prominence.json", "utf8")).tokens;
  } catch {
    return undefined;
  }
}

minwind({
  naming: {
    strategy: "words",
    vocabulary: SPACEBALLS_VOCABULARY, // curation order = iconic-first
    prominence: loadProminence(),
  },
});
```

Tokens first-seen within the window (default: the first 32 class-bearing
elements) draw the vocabulary in curation order, so `vocabulary[0]` lands on
the earliest classed element in the document. Everything else keeps the
length-weighted deal. Shell elements render once per page, so spending
longer names there costs almost nothing. Regenerate the manifest when your
above-the-fold markup changes; if a build warns that the manifest matched
zero tokens, it was generated from a renamed build — regenerate it with
`MINWIND=off`.

### Case study: Spaceballs-themed classnames

The `words` strategy exists because of
[jonkwheeler.com](https://jonkwheeler.com), which ships class names drawn
from Spaceballs — open devtools there and read the DOM. The whole setup,
lessons included:

**1. Curate a vocabulary.** Every word must stand alone in a class
attribute — single words, no phrases, nothing that reads as mid-sentence
residue. Order the list iconic-first; curation order is the prominence
priority.

```ts
// spaceballs.ts
export const SPACEBALLS_VOCABULARY: ReadonlyArray<string> = [
  // the greatest hits — the DOM shell wears these
  "schwartz",
  "lonestar",
  "darkhelmet",
  "vespa",
  "barf",
  "dotmatrix",
  "yogurt",
  "megamaid",
  "winnebago",
  "ludicrous",
  // ...~150 words total: characters, planets, ships, props, bits
];
```

**2. Wire the strategy with prominence**, using the lenient
`loadProminence()` from the section above:

```ts
// app.config.ts
minwind({
  naming: {
    strategy: "words",
    vocabulary: SPACEBALLS_VOCABULARY,
    prominence: loadProminence(),
  },
});
```

**3. Generate the manifest** once, and again after above-the-fold markup
changes:

```bash
MINWIND=off pnpm build && npx minwind prominence .output/public && pnpm build
```

The result: open devtools and the document shell reads like the cast list —

```html
<div class="darkhelmet lonestar schwartz">
  <header class="darkhelmet dotmatrix barf vespa">
    <nav class="eagle5 sandurz"></nav>
  </header>
</div>
```

— while the hot, deeply-nested elements keep the shortest remaining words
(`dot`, `jam`, `vega`), which is where the bytes actually are. With this
exact setup the site's gate reports: median class attribute 77 → 36 chars
(-53%), whole-site raw -21.9%, Brotli -3.6%, pixel-identical rendering.

What the exercise taught:

- **The window is a budget.** A 32-element window spent so many short words
  on the shell that the median class-length drop fell under the site's 50%
  gate. Eight elements — root, header, nav — reads just as iconic and costs
  nothing measurable. Tune with `--window`.
- **Long names are nearly free on the shell.** `megamaid` on an element that
  renders once per page costs less than `jam` on a card that renders fifty
  times. Prominence and byte-optimality only conflict where an element is
  both early and hot, which is rare in practice.
- **Quotes didn't survive contact with a real DOM** (see the warning above);
  single themed words did. Curate for words that still make sense next to a
  random neighbor, because every pairing happens somewhere.

## Consolidation

When the exact same class list appears in several places, minwind can fold it
into one generated rule and replace every occurrence with a single class:

```html
<!-- before, in 12 components -->
<span class="select-none pointer-events-none"></span>

<!-- after -->
<span class="ckqw"></span>
```

Consolidation is conservative. A list only folds when it is static, repeated,
variant-free, and provably cascade-safe; otherwise the report says exactly why
it was skipped (`intervening-cascade`, `has-variants`, ...).

## Safety model

minwind only renames what it can prove safe. Anything it cannot prove is left
untouched and listed in the report:

- Classes constructed dynamically at runtime (`cn()` with non-literal parts)
  are transformed literal-by-literal; unprovable parts pass through.
- Classes that appear in CSS but never in source (`css-only`) are kept.
- Classes you list in `exclusions` are never renamed or assigned as generated
  names — important for classes injected by third-party scripts or routers:

```ts
minwind({
  exclusions: {
    names: ["active", "inactive"], // e.g. Solid Router's <A> link classes
    prefixes: ["shiki"], // e.g. syntax highlighter themes
  },
});
```

Every build writes `.output/minwind/report.json` with the full rename map,
exclusion reasons, consolidation verdicts, and warnings.

### Verify it yourself

The same harness that gates this repo works against any site using the plugin:

```bash
pnpm compare --site path/to/your/site
```

It builds with `MINWIND=off` and `MINWIND=on`, crawls every prerendered route
in headless Chromium, diffs computed styles and screenshots, replays
interactions, and checks the byte and class-length deltas. If anything
mismatches, the build fails and you keep the untransformed output.

## Flags

- `MINWIND=off` — build with the plugin disabled (used by the harness).
- `MINWIND_REPORT=0` — skip writing `report.json`.

## How it works

1. **Pre-pass** (Vite `buildStart`, webpack `beforeCompile`, CLI startup):
   compiles your CSS with Tailwind once, scans your content, and builds the
   class universe — every token, where it came from, and whether it is
   excludable.
2. **Source transform** (Vite `transform`, webpack loader): parses each
   JS/TS module with the TypeScript compiler API and rewrites class strings
   in JSX attributes, `classList` objects, and `cn()` calls with
   span-precise edits (sourcemaps intact). SFC files walk their template
   class attributes and bindings through the same classifier; `minwind
apply` rewrites emitted HTML and, conservatively, compiled bundles.
3. **CSS transform** (Vite `generateBundle`, webpack `processAssets`, CLI
   in place): parses the emitted stylesheet with css-tree and rewrites
   selectors to the same generated names, appending consolidated rules.

One global bijection — original token to generated name — is shared by all
three phases, so HTML, JS, and CSS always agree.

## Development

```bash
pnpm install
pnpm test          # unit tests
pnpm compare       # full harness against examples/demo
pnpm build         # emit dist/ (JS + d.ts)
```

## License

[MIT](./LICENSE)
