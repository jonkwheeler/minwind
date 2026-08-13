# Changelog

## 1.0.0

First release that treats CSS/SCSS Modules as a supported engine alongside
Tailwind. npm still has 0.3.0; git `main` is 0.4.0 (unpublished).
Tailwind-only Vite, webpack, and `minwind apply` defaults stay
`engines: ["tailwind"]` with hash names.

### Added

- CSS/SCSS Modules themed morph (`hash` or `words`) on Vite, webpack/rspack,
  and `minwind apply` (Turbopack and other apply-class bundlers).
- `minwind apply --engines css-modules` with `--naming hash|words|quotes|maps`
  or a dialect id (`boston`, `australia`, `texas`, `england`, `scotland`,
  `ireland`, `wales`, `newyork`, `canada`, `savannah`, `ghetto`,
  `degenerate`, `emojis`, `yorkshire`, `newzealand`, `jamaica`,
  `appalachia`, `geordie`), plus
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
- Built-in `words` themes (`naming.theme: "star-wars"` / `--theme star-wars`),
  including `game-of-thrones`, `high-valyrian`, `dothraki`,
  `stranger-things`, `twin-peaks`, `buffy`, `x-files`, `cowboy-bebop`,
  `mr-robot`, `battlestar-galactica`, `lost`, `severance`, `dark`,
  `the-expanse`, `rick-and-morty`, `disney`, `pirates`,
  `classic-cartoon`, `pokemon`, `lotr`, `harry-potter`, and `futurama`.
  Custom lists stay `naming.vocabulary` or `--vocabulary <file>`.
- `naming.strategy: "quotes"` / `--quotes <file>`: sentences become ordered
  CSS idents (prominence shell first). Personality, not extra compression.
- `naming.strategy` dialect ids `boston`, `australia`, `texas`, `england`,
  `scotland`, `ireland`, `wales`, `newyork`, `canada`, `savannah`,
  `ghetto`, `degenerate`, `emojis`, `yorkshire`, `newzealand`,
  `jamaica`, `appalachia`, `geordie`: keep Tailwind hyphens and
  colons (`hover:items-center` → `hovah:items-centah`). Yorkshire
  `right-4` → `reet-4`. New Zealand `sticky` → `stucky`. Jamaica
  `flex-row` → `flex-roh`. Appalachia `right-4` → `raht-4`. Geordie
  `flex-row` → `flex-roo`. Abbreviations expand (`p-4` → `pee-4`). Emoji
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
  line.

### Changed

- Package version jumps 0.4.0 → 1.0.0 to mark Modules as a public contract.
- Digit-leading vocabulary and quote words get a leading underscore
  (`2b` → `_2b`) so they stay valid CSS idents. Hash names are unchanged.

### Migration

Tailwind-only hash or words projects: upgrade as a feature release. No
apply-flag changes.

Projects using the old quote-order rewrite: switch to `quotes` with a
prominence manifest, or to `words` with a custom `vocabulary`.

CSS Modules on Vite or webpack: set `engines: ["css-modules"]` (or both
engines) and `naming.strategy` to `hash` or `words`.

Turbopack / apply-class bundlers:

```bash
npx minwind apply out --root . --engines css-modules --naming words --theme star-wars
```
