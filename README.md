# minwind

Build-time CSS name compression for Tailwind and CSS Modules.

minwind renames classes to short, stable, or themed names. For Tailwind it can
also consolidate repeated class lists. It rewrites HTML, JavaScript, and CSS
together so every reference stays consistent. It runs only in production
builds; source files and the dev server remain readable.

```html
<!-- before -->
<div class="mx-auto flex min-h-screen max-w-3xl flex-col px-6">
  <span class="flex items-center gap-5 text-sm font-medium"></span>
</div>

<!-- after -->
<div class="xkzu au6h p9ql g3n1 c4vt w7mf">
  <span class="au6h h2jk r8ds m5zp t1bx"></span>
</div>
```

Measured on [jonkwheeler.com](https://jonkwheeler.com), across roughly 40
prerendered routes:

| Metric                 | Before    | After    | Delta  |
| ---------------------- | --------- | -------- | ------ |
| HTML + CSS, raw        | 1,768 KB  | 1,356 KB | -23.3% |
| HTML + CSS, Brotli 11  | 100.9 KB  | 96.9 KB  | -4.0%  |
| Median class attribute | 106 chars | 26 chars | -75%   |

## Is minwind a fit?

Use minwind when all of these are true:

- You use Tailwind CSS v4 and/or CSS Modules (`*.module.css` / `*.module.scss`).
- You ship a production build containing HTML, CSS, and JavaScript.
- Shorter shipped markup, themed production class names, or a cleaner DOM is
  worth adding a build transform.
- Runtime-generated or third-party classes can remain unchanged or be listed as
  exclusions.

minwind is not a CSS minifier, a runtime library, or a source-code formatter.
It does not rename classes in development and never guesses about dynamic class
references. CSS Modules support is rename/theme sync (JS export values match
emitted selectors). It does not consolidate or atomically decompose Modules
stylesheets.

Unsure whether the savings justify it? Measure an existing build first. This is
read-only and does not require adding minwind to your project:

```bash
npx minwind measure .output/public
```

The report separates projected rename savings, consolidation savings, and the
theoretical upper bound, with gzip and Brotli estimates.

## Choose an integration

| Build system                                    | Integration     | Coverage                                    | Trade-off                                           |
| ----------------------------------------------- | --------------- | ------------------------------------------- | --------------------------------------------------- |
| Vite, SolidStart, Astro on Vite, SvelteKit      | `minwind()`     | Source modules, emitted CSS, CSS Modules    | Best coverage; production builds only               |
| webpack or rspack, including Next.js on webpack | Plugin + loader | Source modules, emitted CSS, CSS Modules    | Loader must run before JSX/TS compilation           |
| Turbopack, esbuild, Parcel, or another bundler  | `minwind apply` | Emitted HTML, CSS, and provable JS literals | Tailwind plus CSS/SCSS Modules via export-map remap |

All three routes share the same contract:

1. One global registry maps each original class to one generated name.
2. Every output surface uses that same registry.
3. If a reference cannot be proven safe, the original token is preserved
   everywhere.
4. Internal inconsistency fails the build instead of shipping partial output.

See [Architecture and safety](./docs/architecture.md) for the complete model.

## Install

```bash
npm install minwind
```

Requirements: Node.js 20 or newer. The Tailwind engine needs Tailwind CSS v4.
Vite is an optional peer used only by the Vite integration. `sass` is an
optional peer used only when CSS Modules `words` naming inventories
`*.module.scss` files.

## Vite

```ts
// vite.config.ts, or app.config.ts for SolidStart
import { minwind } from "minwind";

export default defineConfig({
  plugins: [
    minwind(),
    // ...
  ],
});
```

Run the normal production build. The plugin does nothing during development.

### Mode, engines, and CSS Modules

`mode` chooses rename-only vs rename plus consolidation:

- `compress` (default) — rename and consolidate where the engine supports it.
- `morph` — rename or theme class names only; skip consolidation.

```ts
minwind({
  mode: "morph",
  engines: ["css-modules"],
  naming: {
    strategy: "words",
    vocabulary: ["quill", "willow", "ember", "lark"],
  },
});
```

`engines` defaults to `["tailwind"]`. Add `"css-modules"` for CSS/SCSS Modules,
or pass both for a dual-stack app. Modules-only `compress` coerces to `morph`
with a warning: Modules v1 does not consolidate. Dual-stack `compress`
consolidates Tailwind assets only.

CSS Modules morph owns Vite `css.modules.generateScopedName` so `styles.foo`
**keys stay `foo`** while export **values** match the emitted selectors. Use
PostCSS Modules. Vite Lightning CSS Modules is unsupported and fails the build
when the Modules engine is enabled. Themed `words` naming needs a complete
Modules inventory; SCSS Modules + `words` needs the optional `sass` peer.

`quotes` naming is a hard error when the CSS Modules engine is on. Use `hash`
or `words`. For webpack/rspack `getLocalIdent` wiring, including dual-stack
collision, see [webpack and rspack](#webpack-and-rspack).

## webpack and rspack

```ts
// webpack.config.ts
import { MinwindWebpackPlugin } from "minwind/webpack";

export default {
  module: {
    rules: [
      {
        test: /\.(?:[cm]?[jt]s|[jt]sx|vue|svelte|astro)$/,
        enforce: "pre",
        use: [MinwindWebpackPlugin.loader],
      },
    ],
  },
  plugins: [new MinwindWebpackPlugin()],
};
```

`enforce: "pre"` is required. The loader rewrites class contexts before the
framework compiler consumes them; the plugin rewrites emitted CSS before
content hashes are finalized. A zero-rename tripwire fails the build when loader
ordering is wrong. The same configuration works with rspack.

CSS Modules morph owns css-loader `getLocalIdent` so `styles.foo` keys stay
`foo` while export values match the emitted selectors. Dual-stack builds should
share the plugin instance's collision space:

```ts
const plugin = new MinwindWebpackPlugin({
  engines: ["tailwind", "css-modules"],
});

export default {
  // ...rules including MinwindWebpackPlugin.loader with enforce: "pre"
  plugins: [plugin],
  module: {
    rules: [
      {
        test: /\.module\.css$/,
        use: {
          loader: "css-loader",
          options: {
            modules: {
              getLocalIdent: MinwindWebpackPlugin.createGetLocalIdent(
                __dirname,
                { collision: plugin.collision },
              ),
            },
          },
        },
      },
    ],
  },
};
```

## Post-build apply

For bundlers without the necessary plugin hooks, rewrite the completed output
directory in place:

```bash
pnpm build
npx minwind apply .output/public
```

`apply` handles HTML class attributes, CSS selectors and consolidation, and
provable class lists in JavaScript bundles. A token found in an ambiguous
runtime context keeps its original name everywhere and appears in the report as
a `runtime-context` exclusion.

CSS/SCSS Modules are supported on apply for bundlers without a name-generator
hook (Turbopack). Pass `--engines css-modules` (or `tailwind,css-modules`).
Apply proves Module names from CSS Module JS export maps, then rewrites those
proven bundler names in JS, CSS, and HTML. Unprovable strings stay original.
`--naming quotes` with the Modules engine is a hard error.

```text
minwind apply <build-directory> [options]

--root <directory>     Project root used to discover source and write reports
--css-entry <file>     Tailwind CSS entrypoint
--mode morph|compress  morph = rename only; compress = rename + consolidation
--no-consolidate       Alias for --mode morph
--engines <ids>        Comma-separated engines (default: tailwind)
--naming hash|words    Name strategy (default: hash). quotes is rejected when
                       css-modules is on
--vocabulary <file>    JSON array of strings; required for --naming words
--dry-run              Report the result without changing the build
```

Tailwind-only apply without `--naming` still uses stable hash names. Modules
apply accepts `hash` or `words` (`--vocabulary` is required for `words`).

```bash
npx minwind apply out --root . --engines css-modules --naming words --vocabulary words.json
```

## Verify the result

Every plugin or apply build writes:

- `.output/minwind/report.json` — flags, rename summary, exclusions,
  consolidation verdicts, and warnings.
- `.output/minwind/map.json` — original-to-generated classname map.

Print a human-readable summary:

```bash
npx minwind report
```

For end-to-end verification, the repository harness builds a site with minwind
off and on, crawls every prerendered route, compares computed styles and
screenshots, replays interactions, and checks byte deltas:

```bash
pnpm compare --site path/to/your/site
```

The harness fails on a visual, console, navigation, theme, or interaction
mismatch. The checked-in compare site is Tailwind-only; CSS Modules morph is
proven by the Vite `test/fixtures/modules-site` fixture and the Next/Turbopack
apply fixture (`test/fixtures/turbopack-modules-site`), not by `pnpm compare`.

## Naming strategies

The default strategy uses stable four-character content hashes. An unchanged
Tailwind token keeps the same name across builds, which preserves long-term
caching.

You can instead provide a vocabulary or quote corpus:

```ts
minwind({
  naming: {
    strategy: "words",
    vocabulary: ["quill", "willow", "ember", "lark", "glen", "harbor"],
  },
});
```

Available strategies:

- `hash` — stable content hashes; the default and smallest predictable option.
- `words` — generated names drawn from your vocabulary.
- `quotes` — class lists can spell fragments from a quote corpus, then fall
  back to vocabulary words and hashes. Not supported with the CSS Modules
  engine.

Copy-paste vocabularies for Star Wars, Star Trek, Super Mario, Zelda, The
Witcher, Zoolander, and other cult packs are in
[examples/themes](./examples/themes).

Names are sanitized as CSS identifiers and never collide with excluded classes.
Quote words participate only in multi-token lists; isolated words otherwise
read like fragments detached from their sentence.

### Prominence-aware words

The `words` strategy normally assigns shorter words to more frequently rendered
tokens. To give the earliest document-shell elements the most recognizable
vocabulary, generate a prominence manifest from a minwind-off build:

```bash
MINWIND=off pnpm build
npx minwind prominence .output/public
pnpm build
```

Then pass the manifest to the naming configuration:

```ts
import { readFileSync } from "node:fs";

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
    vocabulary: MY_VOCABULARY,
    prominence: loadProminence(),
  },
});
```

See the [Spaceballs naming case study](./docs/spaceballs-case-study.md) for a
real deployment, including why themed words worked better than quotes and how
the prominence window affected compression.

## Consolidation

When an exact static class list occurs repeatedly, minwind can replace it with
one generated rule:

```html
<!-- before, repeated in several components -->
<span class="select-none pointer-events-none"></span>

<!-- after -->
<span class="ckqw"></span>
```

Consolidation occurs only when the list is repeated, variant-free, static, and
provably cascade-safe. Skipped candidates remain individually renamed, and the
report records reasons such as `intervening-cascade` or `has-variants`.

## Dynamic and third-party classes

minwind transforms literal portions of dynamic expressions and preserves
anything it cannot prove. CSS-only tokens are also preserved. Configure known
runtime or third-party names explicitly:

```ts
minwind({
  exclusions: {
    names: ["active", "inactive"],
    prefixes: ["shiki"],
  },
});
```

An exclusion is global: an excluded original token cannot be assigned as a
generated name, and that token remains unchanged across HTML, JavaScript, and
CSS.

## Owned CSS custom properties

minwind can also shorten CSS custom-property names when your application owns
their complete interface. Ownership is explicit—minwind never infers that a
variable is private merely because it sees a declaration:

```ts
minwind({
  customProperties: {
    owned: ["--color-accent", "--surface", "--content-width"],
    aliases: {
      "--color-accent": "--a",
      "--content-width": "--w",
    },
  },
});
```

`owned` defines the complete set minwind may rename. The optional `aliases`
map chooses the emitted name for selected owned properties; owned properties
without an alias still receive a stable generated name. Alias keys must also
appear in `owned`, and every alias must be a unique custom-property name
beginning with `--`. minwind fails the build if an alias conflicts with an
existing property or another configured name.

Declarations, `var()` references, and `@property` registrations use the same
emitted name—either the configured alias or a stable generated name. Static
property-name arguments to
`element.style.setProperty()`, `element.style.removeProperty()`, and
`getComputedStyle(element).getPropertyValue()` are rewritten too.

```css
/* before */
:root {
  --color-accent: #d946ef;
}
.button {
  color: var(--color-accent);
}

/* after */
:root {
  --a: #d946ef;
}
.button {
  color: var(--a);
}
```

If an owned name appears anywhere in source outside those provable CSSOM
contexts—dynamic construction, `cssText`, serialization, framework style
objects, or application content—it keeps its original name globally and is
listed under `customProperties.excluded` in the build report. SFC script usage
is currently conservative and therefore excluded; `<style>` content is handled
later as emitted CSS. Do not opt in variables that form a public theming
interface for third-party code.

This option is available through the Vite and webpack/rspack integrations.
`minwind apply` does not accept it because the post-build CLI has no project
configuration surface on which to declare ownership.

## Supported source files

The source transform supports:

- TypeScript and JavaScript: `ts`, `tsx`, `js`, `jsx`, `mts`, `cts`, `mjs`,
  and `cjs`.
- Single-file components: `.vue`, `.svelte`, and `.astro`.
- JSX/template class attributes, framework bindings such as `:class`,
  `class:list`, and `class:foo`, script blocks, `classList` objects, and common
  literal class-composition calls.

JavaScript files are parsed using JSX grammar, which is a safe superset of valid
JavaScript and supports React projects that place JSX in `.js` files.

## Flags

- `MINWIND=off` — disable all transforms for the build.
- `MINWIND_REPORT=0` — skip writing `report.json`.

## Development

```bash
pnpm install
pnpm test          # full suite, including Next/Turbopack Modules apply
pnpm test:unit     # skip bundler builds (MINWIND_SKIP_BUILD=1)
pnpm compare       # Tailwind browser harness; N/A for CSS Modules
pnpm build         # emit dist/ JavaScript and declarations
pnpm check         # typecheck, formatting, and tests
```

The Next/Turbopack CSS Modules fixture is skipped only when
`MINWIND_SKIP_BUILD=1`. `pnpm compare` remains Tailwind-only; there is no
Modules harness site.

Repository architecture, module ownership, and change invariants are documented
in [Architecture and safety](./docs/architecture.md). Coding agents should also
read [AGENTS.md](./AGENTS.md).

## License

[MIT](./LICENSE)
