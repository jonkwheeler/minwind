# minwind

Build-time CSS name compression for Tailwind and CSS Modules.

<video src="./minwind-promo.mp4" controls playsinline></video>

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
| Vite, SolidStart, SvelteKit                     | `minwind()`     | Source modules, emitted CSS, CSS Modules    | Best coverage; production builds only               |
| Astro 7 static sites                            | `minwind/astro` | Emitted HTML, CSS, and provable JS literals | Static output only; no adapter or `security.csp`    |
| webpack or rspack, including Next.js on webpack | Plugin + loader | Source modules, emitted CSS, CSS Modules    | Loader must run before JSX/TS compilation           |
| Turbopack, esbuild, Parcel, or another bundler  | `minwind apply` | Emitted HTML, CSS, and provable JS literals | Tailwind plus CSS/SCSS Modules via export-map remap |

All four routes share the same contract:

1. One global registry maps each original class to one generated name.
2. Every output surface uses that same registry.
3. If a reference cannot be proven safe, the original token is preserved
   everywhere.
4. Internal inconsistency fails the build instead of shipping partial output.

## Install

```bash
npm install minwind
```

Requirements: Node.js 20 or newer. The Tailwind engine needs Tailwind CSS v4.
Vite 5 through 8 is an optional peer used only by the Vite integration. `sass`
is an optional peer used only when CSS Modules `words` naming inventories
`*.module.scss` files. Astro is not a peer dependency: `minwind/astro` runs
inside the Astro 7 your site already installs (see [Astro](#astro)).

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

## Astro

```js
// astro.config.mjs
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import minwind from "minwind/astro";

export default defineConfig({
  integrations: [
    // ...other integrations first
    minwind({ naming: { strategy: "words", theme: "star-wars" } }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
```

Run the normal `astro build`. Astro compiles `.astro` files before Vite plugins
see them, so the Vite plugin cannot rename an Astro site. `minwind/astro`
instead renames the finished static output at the end of the build, with the
same engine as [`minwind apply`](#post-build-apply). It does nothing during
`astro dev`, `astro preview`, or `astro sync`.

Options match the Vite plugin's `naming`, `mode`, `engines`, and `exclusions`,
plus [`trustVendorModules`](#vendor-javascript-trustvendormodules). `cssEntry`
resolves against the Astro root. It defaults to `styles/global.css` inside
Astro's `srcDir` when that file exists, otherwise `app.css` there
(`src/styles/global.css` or `src/app.css` with the default `srcDir`). With
`words` or `quotes` naming, minwind ranks the built pages by visibility before
renaming them, so `<html>`, `<body>`, and the first class-bearing elements get
the first vocabulary words in one build. Pass `prominence: false` to skip the
ranking.

- Static output only. A configured adapter (the error names it), server
  output, or `security.csp` fails the build. Adapters run their build hooks
  before minwind's, and Astro computes CSP hashes before minwind renames.
- List minwind after your other integrations, so it renames what their build
  hooks write.
- On `astro build`, minwind sets `build.inlineStylesheets` to `"never"`,
  overriding your value, so every stylesheet is a file it can rewrite. If an
  integration listed after it changes the value back, the build fails.
- minwind does not rewrite HTML `<style>` blocks such as `<style is:inline>`.
  If one references a renamed class, the build fails and lists each file and
  class. That includes a class attribute selector, a `:nth-child(… of …)`
  argument, and an `@scope` prelude (see
  [Selectors minwind does not rename](#selectors-minwind-does-not-rename)).
- `customProperties` is not supported here and fails the build. Use the Vite
  or webpack plugin for [owned custom properties](#owned-css-custom-properties).
- A custom `srcDir` works. minwind reads class names and lists from Astro's
  `srcDir` (`src/` by default) and looks for the default `cssEntry` there.
- `astro add minwind` is not supported: it would register the package root,
  which is the Vite plugin. Add the integration by hand as above.
- Node.js 22.23.4 or newer. That floor is Astro's, not minwind's: Astro
  7.4.13, the version minwind is tested on, refuses older Node.
- minwind rewrites built CSS and JS in place after Astro has hashed their
  filenames, so a file's contents can change while its name stays the same.
  Serve `/_astro/*` with revalidation (for example
  `Cache-Control: public, max-age=0, must-revalidate`), never `immutable`.

### Vendor JavaScript (`trustVendorModules`)

A class name that appears in a client bundle as a word in a string, template
literal, identifier, or object key keeps its original name everywhere (see
[What keeps a class original](#what-keeps-a-class-original)). Code from
`node_modules` counts too. A motion library that sets
`el.style.display = "block"` keeps `block` original site-wide. GSAP's CSS
plugin, which the main `gsap` import includes, holds `{grid:1,flex:1}`, so
`grid` and `flex` keep their original names. `trustVendorModules` stops
counting those mentions:

```js
minwind({ trustVendorModules: ["gsap"] });
```

- `true` trusts every `node_modules` package. An array trusts only the
  packages it names, and a scoped name is written whole (`"@scope/name"`).
  The array keeps new and unaudited dependencies under the default rule. Any
  other value fails the build. The option is off by default.
- minwind maps each occurrence in an emitted client chunk back to its source
  through the chunk's sourcemap and skips the ones copied from a trusted
  package. Everything else still counts: project code in the same chunk,
  inline `<script>` blocks, JavaScript copied from `public/`, and any chunk
  minwind cannot attribute.
- When the site configures no client sourcemaps, minwind asks Vite for hidden
  ones and removes them before the write, so `dist` matches a build without
  the option. Sourcemaps the site configures itself stay as configured.
- Renaming still covers whole chunks, so a class list in trusted code renames
  with the rest of the site.
- The build log names each renamed class that trusted code mentions.

Trust a package when it never adds a class by name: libraries that only set
inline styles, and scripts that select elements by `data-*` attribute or id.
Do not trust libraries that toggle utility classes by name, such as Flowbite,
Preline, and Alpine plugins. Their `classList.add("hidden")` adds a name the
renamed stylesheet no longer has, and the page breaks. If a trusted package
does add a class by name, list that class in `exclusions.names`.

The option is Astro-only. The Vite and webpack plugins never scan
`node_modules`, and `minwind apply` cannot tell which module a built file's
code came from.

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
a `runtime-context` exclusion. See
[What keeps a class original](#what-keeps-a-class-original).

`apply` does not rewrite HTML `<style>` blocks. If one references a renamed
class, apply fails and lists each file and class rather than ship a rule that
matches nothing. The output is already rewritten by then, so rebuild before
running apply again.

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
--naming hash|words|quotes|maps|<dialect>
                       Name strategy (default: hash). Dialect ids:
                       boston, australia, texas, england, scotland,
                       ireland, wales, newyork, canada, savannah,
                       ghetto, degenerate, emojis, yorkshire,
                       newzealand, jamaica, appalachia, geordie,
                       piglatin
--hash-length <n>      Hash name length (default 4, minimum 4)
--hash-prefix <s>      Prepended to hash names (hash strategy only)
--hash-alphabet <s>    Hash body characters (lowercase letters and digits)
--hash-salt <s>        Mixed into the hash digest (hash strategy only)
--theme <id>           Built-in words pack (star-wars, klingon, …)
--vocabulary <file>    JSON array of strings; custom words list
--quotes <file>        JSON array of sentences; implies quotes naming
--maps <file>          JSON object of word→spelling; maps naming, or
                       overlay on a dialect id
--prominence <file|auto>
                       Deal words or quotes to the most visible classes
                       first: a manifest from minwind prominence, or auto
                       to rank this directory's HTML before renaming it
--dry-run              Report the result without changing the build
```

Tailwind-only apply without `--naming` still uses stable hash names. Modules
apply accepts `hash`, `words`, `quotes`, `maps`, or a dialect id. `--theme` or
`--vocabulary` for `words`; `--quotes` for `quotes`; `--maps` for `maps`, or
with a dialect id to overlay those runs onto the mouth. `--prominence` needs
`words` or `quotes` naming; see
[Prominence-aware words](#prominence-aware-words).

```bash
npx minwind apply out --root . --engines css-modules --naming words --theme star-wars
npx minwind apply out --root . --engines css-modules --naming words --vocabulary words.json
npx minwind apply out --naming boston
npx minwind apply out --naming words --theme star-wars --prominence auto
```

Scripts can run the same thing in-process with `runApply` from `minwind`. Its
options cover the same ground as the flags (`dir`, `root`, `cssEntry`,
`naming`, `mode`, `consolidate`, `engines`, `prominence`, `dryRun`) and add
`exclusions` and `sourceDir`. `sourceDir` is the directory the pre-pass reads
class names and lists from (default `<root>/src`), and `cssEntry` defaults to
`<sourceDir>/app.css`. `naming` takes the plugin's config object, and
`prominence` takes `"auto"` or a parsed manifest. It throws on failure and
returns `{ enabled: false }` under `MINWIND=off`.

### What keeps a class original

`minwind apply` and `minwind/astro` rewrite finished output, so they look for
every place a script could read a class name that the rewrite cannot reach. A
registry class found in one of these places keeps its original name in the
HTML, CSS, and JavaScript, and the report lists it as `runtime-context`:

- Built JavaScript, meaning bundles and executable inline scripts: a whole
  word in a string, template literal, or identifier, as in
  `el.className === "hidden"` or `el.style.display = "block"`; an identifier
  object key, shorthand, or method name, as in `e({hidden:t})`; and a class
  selector inside a string, as in `querySelector(".hidden")`,
  `":not(.hidden)"`, `".md\\:flex"`, or ``String.raw`.md\:flex` ``.
- Built HTML: a whole word in the value of any attribute not listed below,
  such as `data-*`, `value`, `id`, `name`, event handlers, URLs, and
  `<astro-island>` props; a whole word in the text of a `<textarea>` or of
  an `<option>` without a `value` attribute, which a script reads back as
  the field's value; a whole word in a script whose type is neither
  JavaScript nor JSON-LD, such as `application/json`; an identifier object
  key in an attribute value that parses as JavaScript, such as Alpine
  `:class="{ hidden: !open }"`, `x-bind:class`, or `x-data`; and a class
  selector inside a string of an attribute that runs as JavaScript: an
  event handler, as in `onclick="document.querySelector('.hidden').remove()"`,
  or an Alpine or htmx attribute (`@*`, `x-on:*`, `x-init`, `x-effect`,
  `x-data`, `x-bind:*`, `:*`, `hx-on:*`, or `hx-on-*`). Other attributes,
  such as `data-bs-target=".hidden"`, are not read for selectors. Markup
  held in a script whose type is neither JavaScript nor JSON, such as Vue's
  `text/x-template`, gets the same key and selector reads. Entity-encoded
  names count too.

These positions never count:

- JavaScript comments and reserved words (`static` is the one Tailwind
  utility among them), and property access outside strings (`el.hidden`).
- Other HTML text, including `<title>`, `<noscript>`, and the text of an
  `<option>` with a `value` attribute, and HTML comments.
- The contents of `<script type="application/ld+json">`.
- The values of `role`, `type`, `aria-*`, `alt`, `title`, `placeholder`,
  `lang`, `dir`, `rel`, `autocomplete`, `loading`, `decoding`,
  `fetchpriority`, `style`, and `content` on `<meta>`.

Those positions hold no class names unless a script copies them into a class
list. A script that copies page text or a `title`, `alt`, or `aria-*` value
into a class list is unsupported, like a class name fetched at runtime. List
such classes in `exclusions.names`.

Object keys and selector strings keep their classes original on the Vite and
webpack routes too; see
[Class-composition objects](#class-composition-objects) and
[Selector strings in JavaScript](#selector-strings-in-javascript).

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
proven by the Vite and webpack builds of `test/fixtures/modules-site` and the
Next/Turbopack apply fixture (`test/fixtures/turbopack-modules-site`), not by
`pnpm compare`.

## Naming strategies

The default strategy uses stable four-character content hashes. An unchanged
Tailwind token keeps the same name across builds, which preserves long-term
caching. Raise `length` when you want more collision headroom; the minimum is 4.
Set `prefix` to prepend a string to each hash body (the digest stays the same).
Hyphens are allowed (`tw-s2k9`). Set `alphabet` to restrict the hash body to
those lowercase letters and digits; the first character still comes from the
letters in the set. Set `salt` to mix extra bytes into the digest: the same
token keeps the same name for a given salt, and a new salt rotates every name.
Prefix, alphabet, and salt are hash-strategy only: they do not apply to dialect
mouths, maps, or leftover `words` / `quotes` hashes.

```ts
minwind({
  naming: { strategy: "hash", length: 6 },
});

minwind({
  naming: { strategy: "hash", prefix: "tw" },
});

minwind({
  naming: { strategy: "hash", alphabet: "abcdefghijk" },
});

minwind({
  naming: { strategy: "hash", salt: "v2" },
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
  Optional `prefix` prepends a string to each hash body. Optional `alphabet`
  sets the characters used in that body. Optional `salt` rotates the map
  without leaving content-hash stability.
- `words` — generated names drawn from a built-in `theme` or a custom
  `vocabulary`, then hash fallback.
- `quotes` — sentences split into CSS idents and dealt in quote order. With
  a prominence manifest, the document shell wears the start of the line.
  Leftover tokens still hash. Personality, not extra compression. See
  [Subliminal messages](#subliminal-messages).
- `boston`, `australia`, `texas`, `england`, `scotland`, `ireland`,
  `wales`, `newyork`, `canada`, `savannah`, `ghetto`, `degenerate`,
  `emojis`, `yorkshire`, `newzealand`, `jamaica`, `appalachia`,
  `geordie`, `piglatin` — keep the Tailwind hyphen string (emoji drops
  hyphens) and respell each word in that mouth. `hover:items-center`
  becomes `hovah:items-centah`. Yorkshire `right-4` is `reet-4`.
  New Zealand `sticky` is `stucky`. Jamaica `flex-row` is `flex-roh`.
  Appalachia `right-4` is `raht-4`. Geordie `flex-row` is `flex-roo`.
  Pig Latin `flex-row` is `exflay-owray`. `hover:items-center` is
  `overhay:itemsway-entercay`. Abbreviations expand (`px-6` → `pee-ecks-6`)
  except pig Latin, which respells the letters (`px-6` → `pxay-6`). Emoji
  concatenates
  (`bg-red-500` → `🎨🔴5️⃣0️⃣0️⃣`). Not a `words` pack. Two tokens that
  land on the same ident fail the build.
- `maps` — the same hyphen-preserving hasher with a site-supplied
  word→spelling table. `{ flex: "muscles" }` turns `flex-col` into
  `muscles-col`. Unmapped runs stay themselves. Pass the same `maps`
  object on a dialect strategy to overlay: mapped runs replace the
  mouth spelling, unmapped runs still use the mouth (`boston` plus
  `{ flex: "muscles" }` turns `flex-col` into `muscles-cawl`). Not a
  `words` pack.

```ts
minwind({
  naming: { strategy: "boston" },
});

minwind({
  naming: { strategy: "maps", maps: { flex: "muscles" } },
});

minwind({
  naming: { strategy: "boston", maps: { flex: "muscles" } },
});
```

```html
<!-- source -->
<div class="mx-auto flex px-6 items-center hover:border"></div>

<!-- boston -->
<div class="em-ecks-auto flex pee-ecks-6 items-centah hovah:bawdah"></div>

<!-- piglatin -->
<div
  class="mxay-autoway exflay pxay-6 itemsway-entercay overhay:orderbay"
></div>

<!-- emojis -->
<div class="↔️🚗 💪 ↔️6️⃣ 🧺🎯 🛸:🖼️"></div>
```

Built-in theme ids: `star-wars`, `huttese`, `mandoa`, `aurebesh`, `star-trek`,
`klingon`, `game-of-thrones`, `high-valyrian`, `dothraki`, `stranger-things`,
`twin-peaks`, `buffy`, `x-files`, `cowboy-bebop`, `mr-robot`,
`battlestar-galactica`, `lost`, `severance`, `dark`, `the-expanse`,
`rick-and-morty`, `super-mario`, `zelda`, `witcher`, `zoolander`, `lebowski`,
`portal`, `dune`, `princess-bride`, `office-space`, `firefly`, `disney`,
`pirates`, `classic-cartoon`, `pokemon`, `lotr`, `harry-potter`, `futurama`,
`lorem-ipsum`.
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

Every custom word has to be a CSS identifier
(`/^(?:[a-z][a-z0-9]*|_[a-z0-9]+)$/`), unique, and you want at least 40
so leftovers can still hash. Digit-leading words get a leading underscore
(`2b` becomes `_2b`).

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

The Vite and webpack plugins take `prominence` in `naming`. `minwind apply`
takes `--prominence <file|auto>`, and `minwind/astro` ranks on its own. See
[Prominence-aware words](#prominence-aware-words).

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

That two-build flow is for the Vite and webpack plugins, which rename while
bundling. The routes that rename finished output can rank that output first,
so one build is enough:

- `minwind/astro` ranks the built pages whenever naming is `words` or
  `quotes`. Pass `prominence: false` to turn it off.
- `minwind apply --prominence auto` ranks the output directory's first 32
  class-bearing elements per page, then renames. For a different window,
  write a manifest with `minwind prominence <dir> --window <n>` and pass the
  file instead: `--prominence minwind.prominence.json`.

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

A utility whose every selector compounds a class kept original keeps its
original name too, whatever kept that class: an exclusion, a runtime
reference, or no use in source. `group-hover:underline` keeps its name when
`group` does, and the same goes for `peer-*`, named groups, a class-strategy
`dark` variant, and any custom variant that compounds a class. The report
lists these as `runtime-context`. `minwind apply` and `minwind/astro` also
log them on their own line ("depends on a class kept original").

### Class-composition objects

In a recognized composition, every key of an object literal is a class name
and renames. The recognized compositions are a `cn()` argument (`cn` by that
name, or imported as `cn` under another name), a Vue `:class` or
`v-bind:class` value, and an Astro `class:list` value. Identifier, shorthand,
and string keys all count, in objects nested in arrays, in either branch of
`?:`, on the right of `&&`, on either side of `||` and `??`, and in spreads.
Values are conditions and keep their bytes.

```tsx
<div class={cn("p-4", { hidden: !open, "font-bold": active })} />
```

- A shorthand key `{ hidden }` expands to `{ <name>: hidden }`, so its value
  binding survives.
- A renamed key that is not a valid identifier, such as a dialect name, is
  written quoted. In a Vue `:class` attribute it takes the quote the
  attribute does not use. An unquoted attribute value can hold no quote, so
  the build fails and asks you to quote the attribute. Svelte `class:`
  directive names stay bare, since directive names allow hyphens.
- A method or accessor name, a computed key other than a string literal, and
  the keys of an object passed to another call inside `cn()`, such as
  `cn(button({ size }))`, keep their classes original.

Any other identifier key, shorthand, or method name that names a class keeps
that class original on every route. That covers keys passed to `clsx`,
`classnames`, or another call minwind does not recognize, React
`className={clsx({ hidden: !open })}`, Svelte 5 `class={{ hidden: open }}`,
and any object outside a composition, such as `{ flex: 1 }` in a config. In
built output, where a minifier has renamed `cn`, every identifier key counts
this way, except in a CSS Modules export map that the Modules engine proves.

minwind treats `cn()` as plain concatenation. A `cn()` that wraps `twMerge`,
as in shadcn/ui, receives renamed names, so tailwind-merge cannot resolve
conflicts between them. String arguments have behaved this way since 1.1.0,
and 1.2.0 extends it to object keys.

### Selector strings in JavaScript

A class written as a selector inside a JavaScript string, as in
`document.querySelector(".hidden")` or `el.closest(".group")`, keeps its
original name on every route. minwind cannot prove which API reads a string,
so it does not rename the selector. Property access such as `el.hidden` does
not count. A tagged template counts in its raw form too, so
``String.raw`.md\:flex` `` keeps `md:flex` original. On the `minwind apply`
and `minwind/astro` routes, so does a selector in an HTML attribute that
runs as JavaScript: an inline event handler such as `onclick`, or an Alpine
or htmx attribute such as `@click`, `x-init`, or `hx-on:click`. Select by
`data-*` attribute or id to let the class rename.

A string that only looks like a selector counts too, such as a file name
ending in `.hidden`. On the Vite and webpack routes, so does a class string in
JavaScript or JSX that holds an arbitrary variant such as `[&_.hidden]:block`.
That costs compression, never correctness.

### Selectors minwind does not rename

minwind renames class selectors in emitted CSS, including a class inside
`:nth-child(… of …)`. It never renames class attribute selectors
(`[class~="flex"]`, `[class*="fle"]`) or `@scope` preludes, so a renamed
class left in one fails the build, and the error names the class.
`minwind apply` and `minwind/astro` never rewrite HTML `<style>` blocks, so
there a renamed class fails the build in any selector form. A multi-branch
prelude such as `@scope (#panel, .grid)`, or a substring matcher (`*=`, `^=`,
`$=`, `|=`), can fail a build whose rule still applies through another branch
or match. Add the named class to `exclusions.names` to keep its original name
everywhere.

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
configuration surface on which to declare ownership. `minwind/astro` rejects
it: ownership is proven from source, and built Astro output also carries
`define:vars` styles, `<style is:inline>` blocks, and bundled library strings.

## Supported source files

The source transform supports:

- TypeScript and JavaScript: `ts`, `tsx`, `js`, `jsx`, `mts`, `cts`, `mjs`,
  and `cjs`.
- Single-file components: `.vue`, `.svelte`, and `.astro`.
- JSX/template class attributes, framework bindings such as `:class`,
  `class:list`, and `class:foo`, script blocks, `classList` objects, and
  `cn()` calls (see
  [Class-composition objects](#class-composition-objects)).
- In templates and built HTML, classes on table elements (`<tr>`, `<td>`,
  `<th>`, `<thead>`, `<tbody>`, `<tfoot>`, `<caption>`, `<col>`,
  `<colgroup>`), including a component whose root is one of them, on
  elements inside `<select>`, and on `<noscript>` markup. In `.vue`,
  `.svelte`, and `.astro`, also inside components named like HTML elements
  (`<Select>`, `<Table>`, `<Title>`).
- In `.astro`, markup inside expressions, such as
  `{items.map((item) => <li class="px-4">{item}</li>)}` and
  `{open && <p class="text-sm">…</p>}`, `class:list` included. Unclosed void
  elements such as `<img class="w-8">` are fine there. An expression that
  still does not parse as TSX is skipped; on the Astro route its classes
  still match the rest of the site and only cost compression.
- In `.astro` frontmatter, a top-level, non-exported `const` holding a string,
  or a template literal without substitutions, reads like a class attribute
  when every reference to it is a class position. A class position is the
  whole value of `class={card}`, the `class:list` value or an array element
  inside it, or a direct `cn()` argument. Any other reference, such as
  `title={card}`, leaves the constant unread. Variant maps
  (`class={tones[tone]}`) and destructured prop defaults are not read.

JavaScript files are parsed using JSX grammar, which is a safe superset of valid
JavaScript and supports React projects that place JSX in `.js` files.

## Flags

- `MINWIND=off` — disable all transforms for the build. The Vite and webpack
  plugins, `minwind/astro`, and `minwind apply` all honor it, and none of
  them write `.output/minwind/`. `minwind apply` prints that it is disabled
  and leaves the directory unchanged. `minwind/astro` still runs its config
  checks and still sets `inlineStylesheets: "never"`, so on and off builds
  differ only in class names.

## Development

```bash
pnpm install
pnpm test          # full suite, including Next/Turbopack and Astro builds
pnpm test:unit     # skip bundler builds (MINWIND_SKIP_BUILD=1)
pnpm compare       # Tailwind browser harness; N/A for CSS Modules
pnpm build         # emit dist/ JavaScript and declarations
pnpm check         # typecheck, formatting, and tests
```

The Next/Turbopack CSS Modules fixture is skipped only when
`MINWIND_SKIP_BUILD=1`. The Astro fixture (`test/fixtures/astro-site`) has its
own lockfile and pins Astro 7.4.13; the suite installs it on first run. It
needs Node.js 22.23.4 or newer, the floor that Astro version enforces, so it
is skipped on older Node and when `MINWIND_SKIP_BUILD=1`. The floor moves
with the pin. `pnpm compare` remains Tailwind-only; there is no Modules
harness site.

## License

[MIT](./LICENSE)
