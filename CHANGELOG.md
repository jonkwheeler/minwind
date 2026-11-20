# Changelog

## 1.2.0

Closes the rename gaps a static Astro site hit on 1.1.0, and adds
`trustVendorModules` to `minwind/astro`. No option or flag is removed or
changes meaning. More classes rename, so names in `map.json` shift. Some
builds that passed on 1.1.0 can now fail; see Builds that can now fail.

### Added

- `trustVendorModules` on `minwind/astro`, off by default. `true` trusts every
  `node_modules` package, and an array trusts only the packages it names
  (`["gsap"]`, `["@scope/name"]`). An occurrence of a class name in an
  emitted client chunk that the chunk's sourcemap attributes to a trusted
  package no longer keeps that class original. Project code in the same
  chunk, inline `<script>` blocks, JavaScript copied from `public/`, and any
  chunk minwind cannot attribute count as before. When the site configures
  no client sourcemaps, minwind asks Vite for hidden ones and removes them
  before the write, so `dist` is unchanged. The build log names each renamed
  class that trusted code mentions. The risk: a trusted library that adds a
  utility class by its original name, as Flowbite, Preline, and Alpine
  plugins do, breaks the page. Trust only packages that never do, or list
  the classes they add in `exclusions.names`. A value other than `true`,
  `false`, or an array of package names fails the build.
- `minwind/astro` works with a custom `srcDir`. It reads class names and
  lists from that directory and looks for the default `cssEntry` there:
  `<srcDir>/styles/global.css` when it exists, otherwise `<srcDir>/app.css`.
  1.1.0 refused any `srcDir` but `src/`.
- `runApply` accepts `sourceDir`, the directory the pre-pass reads class
  names and lists from (default `<root>/src`). `cssEntry` defaults to
  `<sourceDir>/app.css`, which is `<root>/src/app.css` as before when
  `sourceDir` is unset. `runApply` also accepts `vendorProvenance`, through
  which `minwind/astro` passes the chunks it records for
  `trustVendorModules`. Its result gains `keptDependent` and
  `vendorMentions`.

### Changed

- More classes rename: markup in Astro expressions, frontmatter class
  constants, table, `<select>`, and `<noscript>` markup, entity-encoded
  variants, and object keys in `cn()`, Vue `:class`, and Astro `class:list`
  (see Fixed), plus classes that prose and keyword attributes used to hold
  back (below). `map.json` changes with them. With `words` or `quotes`
  naming, the words dealt to classes that already renamed shift too. Hash,
  dialect, and `maps` names depend only on the class, so a class that
  renames in both versions keeps its name.
- In built HTML, text content, comments, JSON-LD, and the values of `role`,
  `type`, `aria-*`, `alt`, `title`, `placeholder`, `lang`, `dir`, `rel`,
  `autocomplete`, `loading`, `decoding`, `fetchpriority`, `style`, and
  `content` on `<meta>` no longer keep a class original. In built
  JavaScript, comments and reserved words no longer do. A script that copies
  page text or a `title`, `alt`, or `aria-*` value into a class list is now
  unsupported, like a class name fetched at runtime; list such classes in
  `exclusions.names`. `data-*`, `value`, event handlers, URLs, island props,
  every other attribute, and executable scripts are still scanned, and so is
  the text of a `<textarea>` and of an `<option>` without a `value`
  attribute, which a script reads back as the field's value.
- A utility whose every selector compounds a class kept original now keeps
  its original name too: `group-*` when `group` keeps its name, `peer-*`,
  named groups, a class-strategy `dark` variant, and any custom variant that
  compounds a class. 1.1.0 failed these builds instead (see Fixed). The
  report lists them as `runtime-context`, and `minwind apply` and
  `minwind/astro` log them on their own line ("depends on a class kept
  original"), apart from classes kept for an unrewritable position.
- These now keep a class original by default where 1.1.0 renamed it:
  - An identifier object key, shorthand, or method name that names a class,
    outside `cn()`, Vue `:class`, and Astro `class:list`: in source on the
    Vite and webpack routes, in built JavaScript, and in built HTML
    attribute values that parse as JavaScript, such as Alpine `:class`,
    `x-bind:class`, and `x-data`. That covers React
    `className={clsx({ hidden: !open })}`, Svelte 5 `class={{ … }}`, and
    plain objects such as `{ flex: 1 }`. GSAP's CSS plugin, part of the main
    `gsap` import, holds `{grid:1,flex:1}`, so `grid` and `flex` keep their
    original names unless `trustVendorModules` covers `gsap`.
  - A class selector inside a JavaScript string, such as
    `querySelector(".hidden")` or ``String.raw`.md\:flex` ``, on every
    route, and in built HTML one inside an inline event handler or an
    Alpine or htmx attribute that runs as JavaScript (`@click`, `x-init`,
    `x-data`, `:*` bindings, `hx-on:*`, and the like). A string that only
    looks like a selector counts too. On the Vite and webpack
    routes that includes a class string in JavaScript or JSX holding an
    arbitrary variant such as `[&_.hidden]:block`.
  - Inside `cn()`, the string keys of an object passed to another call, such
    as `cn(button({ "ring-2": on }))`, and the strings inside a computed key
    such as `{ [base + " shadow"]: on }`.
  - A Tailwind `nth-[…_of_.x]` utility, when `x` keeps its own name. When
    `x` renames, the class inside `:nth-child(… of …)` now renames with it.
  - An entity-encoded class name in a scanned attribute or island props,
    and the classes of a built class attribute whose encoded value cannot be
    split into tokens, such as one holding `&#32;`.
- `entities` and `@jridgewell/sourcemap-codec` are new runtime
  dependencies. Both were already installed through `parse5` and
  `magic-string`.

### Builds that can now fail

- Emitted CSS that keeps a renamed class in a class attribute selector
  (`[class~="flex"]`, or the `=`, `*=`, `^=`, `$=`, or `|=` matcher) or in
  an `@scope` prelude fails the build on every route, because minwind renames
  neither. HTML `<style>` blocks, which `minwind apply` and `minwind/astro`
  never rewrite, now fail on those forms and on a class inside
  `:nth-child(… of …)` too. A multi-branch prelude such as
  `@scope (#panel, .grid)`, or a substring matcher, can fail a build whose
  rule still applies through another branch or match. The error names the
  class; add it to `exclusions.names` to keep its original name everywhere.
- A renamed object key whose new name is not a valid JavaScript identifier,
  such as England's `'idden` or an emoji name, needs quotes. In an unquoted
  Vue `:class` attribute value no quote can be written, so the build fails.
  Quote the attribute.

### Fixed

- `group-*`, `peer-*`, and other variants that compound a marker class no
  longer fail the build with "presence assertion failed" when the marker
  keeps its original name, for example through `exclusions.names` or a
  runtime reference.
- Entity-encoded classes in built HTML and bundle markup, such as
  `[&amp;_a]:underline`, `has-[&gt;img]:p-2`, and `content-[&#39;x&#39;]`,
  rename. 1.1.0 renamed the CSS selector but missed the HTML token, so the
  page lost those styles without a warning.
- Classes on markup inside Astro expressions, such as
  `{items.map((item) => <li class="…">)}` and `{cond && <p class="…">}`,
  `class:list` included, are read. Classes used only there kept their
  Tailwind names in 1.1.0.
- An Astro frontmatter `const` holding a class string is read when every
  reference to it is a class position. See the README for the limits.
- An apostrophe in Astro expression markup text, such as
  `{cond && <p>Don't</p>}`, no longer hides the template elements after it.
- Table elements such as a component whose root is `<tr>` or `<td>`,
  elements inside `<select>`, components named like HTML elements
  (`<Select>`, `<Table>`, `<Title>`), and `<noscript>` markup are read in
  `.astro`, `.svelte`, `.vue`, and built HTML. The template parse used to
  drop them. On the Vite and webpack routes their classes could keep
  original names while other files renamed them, which broke the page; on
  the Astro route they cost compression.
- The inline-style tripwire in `minwind apply` and `minwind/astro` sees
  class attribute selectors, `:nth-child(… of …)` arguments, and `@scope`
  preludes. 1.1.0 let them through, and the rules stopped matching.
- In emitted CSS, a class inside `:nth-child(… of …)` renames with its
  selector. 1.1.0 left it original while renaming the class elsewhere.
- Identifier and shorthand keys in `cn()`, Vue `:class`, and Astro
  `class:list` objects rename. Before, they were neither renamed nor
  flagged, so `cn({ hidden: open })` added the original `hidden` after the
  stylesheet renamed it, and the page broke silently.
- A `.token` selector string in JavaScript keeps its class original. Before,
  it was neither renamed nor flagged, so `querySelector(".hidden")` selected
  nothing once `hidden` renamed.
- `clsx({ hidden: c })` and other unrecognized calls in a class position keep
  their identifier keys' classes original. 1.1.0 poisoned only their string
  literals.
- A renamed object key whose new name is not a valid identifier is written
  quoted. That fixes Solid `classList`, where 1.1.0 wrote a dialect name such
  as England's `'idden` bare, which is not valid JavaScript. Svelte `class:`
  directive names stay bare.

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
