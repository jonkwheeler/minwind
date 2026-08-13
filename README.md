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
  naming: { strategy: "words", theme: "star-wars" },
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
For webpack/rspack `getLocalIdent` wiring, including dual-stack collision,
see [webpack and rspack](#webpack-and-rspack).

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

```text
minwind apply <build-directory> [options]

--root <directory>     Project root used to discover source and write reports
--css-entry <file>     Tailwind CSS entrypoint
--mode morph|compress  morph = rename only; compress = rename + consolidation
--no-consolidate       Alias for --mode morph
--engines <ids>        Comma-separated engines (default: tailwind)
--naming hash|words|quotes|<dialect>
                       Name strategy (default: hash). Dialect ids:
                       boston, australia, texas, england, scotland,
                       ireland, wales, newyork, canada, savannah,
                       ghetto, degenerate, emojis
--hash-length <n>      Hash name length (default 4, minimum 4)
--theme <id>           Built-in words pack (star-wars, klingon, …)
--vocabulary <file>    JSON array of strings; custom words list
--quotes <file>        JSON array of sentences; implies quotes naming
--dry-run              Report the result without changing the build
```

Tailwind-only apply without `--naming` still uses stable hash names. Modules
apply accepts `hash`, `words`, `quotes`, or a dialect id. `--theme` or
`--vocabulary` for `words`; `--quotes` for `quotes`.

```bash
npx minwind apply out --root . --engines css-modules --naming words --theme star-wars
npx minwind apply out --root . --engines css-modules --naming words --vocabulary words.json
npx minwind apply out --naming boston
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
caching. Raise `length` when you want more collision headroom; the minimum is 4.

```ts
minwind({
  naming: { strategy: "hash", length: 6 },
});
```

You can instead deal names from a built-in theme. Tokens the pack cannot cover
fall back to the same content-hash names (including `length`):

```ts
minwind({
  naming: { strategy: "words", theme: "star-wars", length: 6 },
});
```

Or pass your own list. `theme` and `vocabulary` cannot both be set; to extend a
pack, spread it into `vocabulary`:

```ts
import { THEMES } from "minwind";

minwind({
  naming: {
    strategy: "words",
    vocabulary: [...THEMES["star-wars"], "myword"],
    length: 6,
  },
});
```

Available strategies:

- `hash` — stable content hashes; the default and smallest predictable option.
- `words` — generated names drawn from a built-in `theme` or a custom
  `vocabulary`, then hash fallback.
- `quotes` — sentences split into CSS idents and dealt in quote order. With
  a prominence manifest, the document shell wears the start of the line.
  Leftover tokens still hash. Personality, not extra compression. See
  [Subliminal messages](#subliminal-messages).
- `boston`, `australia`, `texas`, `england`, `scotland`, `ireland`,
  `wales`, `newyork`, `canada`, `savannah`, `ghetto`, `degenerate`,
  `emojis` — keep the Tailwind hyphen string (emoji drops hyphens) and
  respell each word in that mouth. `hover:items-center` becomes
  `hovah:items-centah`. Abbreviations expand (`px-6` → `pee-ecks-6`).
  Emoji concatenates (`bg-red-500` → `🎨🔴5️⃣0️⃣0️⃣`). Not a `words`
  pack. Two tokens that land on the same ident fail the build.

```ts
minwind({
  naming: { strategy: "boston" },
});
```

```html
<!-- source -->
<div class="mx-auto flex px-6 items-center hover:border"></div>

<!-- boston -->
<div class="em-ecks-auto flex pee-ecks-6 items-centah hovah:bawdah"></div>

<!-- emojis -->
<div class="↔️🚗 💪 ↔️6️⃣ 🧺🎯 🛸:🖼️"></div>
```

Built-in theme ids: `star-wars`, `huttese`, `mandoa`, `aurebesh`, `star-trek`,
`klingon`, `game-of-thrones`, `high-valyrian`, `dothraki`, `stranger-things`,
`twin-peaks`, `buffy`, `x-files`, `cowboy-bebop`, `mr-robot`,
`battlestar-galactica`, `lost`, `severance`, `dark`, `the-expanse`,
`rick-and-morty`, `super-mario`, `zelda`, `witcher`, `zoolander`, `lebowski`,
`portal`, `dune`, `princess-bride`, `office-space`, `firefly`, `disney`,
`pirates`, `classic-cartoon`, `pokemon`, `lotr`, `harry-potter`, `futurama`.
See [examples/themes](./examples/themes) for what the shell might read.

Names are sanitized as CSS identifiers and never collide with excluded classes.

### Bring your own names

Built-in packs are a demo. The interesting DOM is yours.

A golf major can ship player names and course slang (`augusta`, `amen`,
`albatross`). Any sport can do the same with roster, venues, and broadcast
calls. A brand can use product names and the jokes only that team tells. If
you are building something people will inspect, the class list should be
the thing they screenshot.

```ts
minwind({
  naming: {
    strategy: "words",
    vocabulary: ["augusta", "amen", "albatross", "birdie", "fore"],
    prominence: loadProminence(),
  },
});
```

Speeches and slogans use `quotes` the same way. See
[Subliminal messages](#subliminal-messages) for the inspector recipe and
the one-token-one-name limits.

Safe-for-work is optional. The list that goes viral is the one a stranger
would send to the group chat with "I can't believe this is in the DOM."
Innuendo, cursed fandom, locker-room vernacular, an in-joke legal would
sweat: those belong. Generic words like `button` and `hero` do not.

Drop [examples/themes/SKILL.md](./examples/themes/SKILL.md) into a project's
`.cursor/skills/` (or paste it as a prompt) and ask the agent for a list.
Every entry has to be a CSS identifier (`/^(?:[a-z][a-z0-9]*|_[a-z0-9]+)$/`),
unique, and at least 40 words so leftovers can still hash. Digit-leading
words get a leading underscore (`2b` becomes `_2b`).

### Subliminal messages

Class names are not painted as text. Visitors see the page. Anyone who
opens Inspect or views source sees your words instead of `flex` and
`px-4`. The names are in the HTML. Treat it as an Easter egg.

**A line of speech.** Use `quotes` and a prominence manifest so the first
unique utilities on the document shell take the first unique words of the
line:

```ts
minwind({
  naming: {
    strategy: "quotes",
    quotes: [
      "Ask not what your country can do for you. Ask what you can do for your country.",
    ],
    prominence: loadProminence(),
  },
});
```

```bash
MINWIND=off pnpm build
npx minwind prominence .output/public
pnpm build
```

Open the production page, Inspect, and read `<html>` plus the next few
class-bearing elements.

Those elements received the start of the quote. They will not always
spell it from left to right. Each original utility still maps to one
name everywhere, and a class attribute still lists names in source
order. Duplicate quote words are used once (`you` in that speech is one
ident). Leftover utilities hash. Raise `--window` if the first 32
class-bearing elements do not expose enough unique tokens for the line.

A nested shell where each node introduces a new utility gets closer to a
readable sequence. A long class list on `<html>` will mix the words. For
a punchline that survives any neighbor, use `words` and put the screenshot
names first in `vocabulary`. That is the usual Easter egg: every inspected
node is on-theme, none of them have to spell.

The Vite and webpack plugins take `prominence`. `minwind apply` deals
`quotes` without that manifest, so the most frequent tokens get the start
of the line rather than the inspector's first nodes.

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
    theme: "star-wars",
    prominence: loadProminence(),
  },
});
```

See the [Spaceballs naming case study](./docs/spaceballs-case-study.md) for a
real deployment, including how the prominence window affected compression.

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
