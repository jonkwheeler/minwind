# Changelog

## 1.1.0

Adds an Astro integration and one-build visibility ranking for `minwind
apply`. No option or flag is removed or renamed, but a new check can fail a
build that used to ship broken styles; see Changed.

### Added

- `minwind/astro`, an integration for Astro 7 static sites. It runs the apply
  engine on the finished output at the end of `astro build`. With `words` or
  `quotes` naming it first ranks the built pages by visibility, so `<html>`,
  `<body>`, and the first class-bearing elements get the first vocabulary
  words in one build. Options: `naming`, `mode`, `engines`, `exclusions`,
  `cssEntry`, and `prominence` (on by default; `false` turns ranking off).
  On `astro build` it sets `build.inlineStylesheets` to `"never"` and refuses
  an adapter, server output, `security.csp`, `customProperties`, a `srcDir`
  other than `src/`, and a final config that still inlines stylesheets. `astro dev`, `preview`, and `sync`
  are untouched. Tested on Astro 7.4.13, which needs Node.js 22.23.4 or
  newer. Set it up by hand in `astro.config.mjs`; `astro add` is not
  supported.
- `minwind apply --prominence <file|auto>` for `words` and `quotes` naming.
  `auto` ranks the output directory's HTML before renaming it. For a custom
  window, pass a manifest from `minwind prominence --window <n>`.
- `runApply`, exported from the package root, runs `minwind apply`
  in-process and throws on failure.
- Vite 8 support. The plugin's build suites pass on Vite 6 and Vite 8, and
  the `vite` peer range is now `^5 || ^6 || ^7 || ^8`.

### Changed

- `minwind apply` and `minwind/astro` now fail when an HTML `<style>` block
  in the output references a renamed class, and the error lists each file
  and class. minwind does not rewrite inline styles, so those rules used to
  match nothing and the page shipped with broken styling. Builds that passed
  before can fail now.
- `minwind apply` honors `MINWIND=off`: it prints that it is disabled and
  leaves the directory unchanged.
- In `.astro` layouts, `<html>` and `<body>` classes, `class:list` included,
  are renamed after frontmatter (including empty frontmatter) and when
  `<head>` holds components or `{...}` expressions. They used to keep their
  original names.
- The same recovery applies to plain `.html` (`minwind apply` and the Vite
  plugin): when content in `<head>` makes the HTML parser imply `<body>`, the
  literal `<body>` tag's classes are now renamed. They used to keep their
  original names, so the output bytes of such pages change.
- The README no longer lists Astro under the Vite plugin. Astro compiles
  `.astro` files before Vite plugins run; use `minwind/astro`.
- The README no longer documents `MINWIND_REPORT=0`. No code read it.

### Fixed

- Brace expressions written across lines in Astro and Svelte templates, the
  usual shape after Prettier formats a file, were cut short at the first
  line break. Multi-line `class:list` tokens are now renamed. A multi-line
  `class={cond ? ... : ...}` is now marked unprovable; before, it emitted
  nothing, so a class renamed elsewhere could lose its styling there.
- In compress mode, `minwind apply` deleted a merged class list's member
  rules even when the built output still used those classes outside that
  list, for example a component that merges a `class` prop into its own
  classes. Those elements shipped unstyled with no warning. Members the
  output renames on their own now keep their rules.
- `minwind apply` and `runApply` report the CSS Modules-only
  compress-to-morph coercion, as the Vite and webpack plugins already do.

## 1.0.3

npm release of the 1.0 contract. Versions 1.0.0–1.0.2 were published and
unpublished earlier this year; the registry will not accept those numbers
again.

## 1.0.0

First release that treats CSS/SCSS Modules as a supported engine alongside
Tailwind. Tailwind-only Vite, webpack, and `minwind apply` defaults stay
`engines: ["tailwind"]` with hash names.

### Added

- CSS/SCSS Modules themed morph (`hash` or `words`) on Vite, webpack/rspack,
  and `minwind apply` (Turbopack and other apply-class bundlers).
- `minwind apply --engines css-modules` with `--naming hash|words|quotes|maps`
  or a dialect id (`boston`, `australia`, `texas`, `england`, `scotland`,
  `ireland`, `wales`, `newyork`, `canada`, `savannah`, `ghetto`,
  `degenerate`, `emojis`, `yorkshire`, `newzealand`, `jamaica`,
  `appalachia`, `geordie`, `piglatin`), plus
  `--theme <id>`, `--vocabulary <file>`, `--quotes <file>`, and `--maps <file>`.
- Dual-stack collision space so a Module local named `flex` and Tailwind
  `flex` cannot share a generated name.
- `MinwindWebpackPlugin.collision` for `createGetLocalIdent(..., { collision })`.
- `naming.length` / `--hash-length` (default 4, minimum 4) for hash names and
  for `words` fallback hashes.
- `naming.prefix` / `--hash-prefix` prepends a string to hash-strategy names
  (`tw` + `s2k9` → `tws2k9`). Does not change the digest. Hash strategy only.
- `naming.alphabet` / `--hash-alphabet` sets the hash-body character set
  (lowercase letters and digits; first character stays a letter from that set).
  Hash strategy only.
- `naming.salt` / `--hash-salt` mixes extra bytes into the digest so a site
  can rotate every hash name without leaving content-hash stability. Hash
  strategy only.
- Built-in `words` themes (`naming.theme: "star-wars"` / `--theme star-wars`),
  including `game-of-thrones`, `high-valyrian`, `dothraki`,
  `stranger-things`, `twin-peaks`, `buffy`, `x-files`, `cowboy-bebop`,
  `mr-robot`, `battlestar-galactica`, `lost`, `severance`, `dark`,
  `the-expanse`, `rick-and-morty`, `disney`, `pirates`,
  `classic-cartoon`, `pokemon`, `lotr`, `harry-potter`, `futurama`, and
  `lorem-ipsum`.
  Custom lists stay `naming.vocabulary` or `--vocabulary <file>`.
- `naming.strategy: "quotes"` / `--quotes <file>`: sentences become ordered
  CSS idents (prominence shell first). Personality, not extra compression.
- `naming.strategy` dialect ids `boston`, `australia`, `texas`, `england`,
  `scotland`, `ireland`, `wales`, `newyork`, `canada`, `savannah`,
  `ghetto`, `degenerate`, `emojis`, `yorkshire`, `newzealand`,
  `jamaica`, `appalachia`, `geordie`, `piglatin`: keep Tailwind hyphens and
  colons (`hover:items-center` → `hovah:items-centah`). Yorkshire
  `right-4` → `reet-4`. New Zealand `sticky` → `stucky`. Jamaica
  `flex-row` → `flex-roh`. Appalachia `right-4` → `raht-4`. Geordie
  `flex-row` → `flex-roo`. Pig Latin `flex-row` → `exflay-owray`.
  Abbreviations expand (`p-4` → `pee-4`). Emoji
  drops hyphens (`bg-red-500` → `🎨🔴5️⃣0️⃣0️⃣`). Collision fails the
  build. Not a `words` pack.
- `naming.strategy: "maps"` / `--maps <file>`: site-supplied word→spelling
  table on the dialect hasher (`flex-col` → `muscles-col` when
  `flex` → `muscles`). Unmapped runs stay themselves. The same `maps`
  object on a dialect strategy overlays those runs onto the mouth
  (`boston` plus `flex` → `muscles` turns `flex-col` into `muscles-cawl`).

### Breaking

- The old quote-order rewrite (one class list spells a quote) is gone. The
  `quotes` strategy now splits sentences into CSS idents and deals them in
  quote order. Use a prominence manifest so the document shell reads the
  line. A leftover `naming.corpus` config fails the build and tells you
  to switch to `naming.quotes`.

### Changed

- Package version jumps 0.4.0 → 1.0.0 to mark Modules as a public contract.
- Digit-leading vocabulary and quote words get a leading underscore
  (`2b` → `_2b`) so they stay valid CSS idents. Hash names are unchanged.

### Migration

Tailwind-only hash or words projects: upgrade as a feature release. No
apply-flag changes.

Projects using the old quote-order rewrite (`naming.corpus`): the build
stops and prints the fix. Switch to `quotes` with a prominence manifest,
or to `words` with a custom `vocabulary`.

CSS Modules on Vite or webpack: set `engines: ["css-modules"]` (or both
engines) and `naming.strategy` to `hash` or `words`.

Turbopack / apply-class bundlers:

```bash
npx minwind apply out --root . --engines css-modules --naming words --theme star-wars
```
