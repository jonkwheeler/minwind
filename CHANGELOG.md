# Changelog

## 1.0.0

First release that treats CSS/SCSS Modules as a supported engine alongside
Tailwind. npm still has 0.3.0; git `main` is 0.4.0 (unpublished). Tailwind-only
Vite, webpack, and `minwind apply` defaults are unchanged.

### Added

- CSS/SCSS Modules themed morph (`hash` or `words`) on Vite, webpack/rspack,
  and `minwind apply` (Turbopack and other apply-class bundlers).
- `minwind apply --engines css-modules` with `--naming hash|words` and
  `--vocabulary <file>` (required for `words`).
- Dual-stack collision space so a Module local named `flex` and Tailwind
  `flex` cannot share a generated name.
- `MinwindWebpackPlugin.collision` for `createGetLocalIdent(..., { collision })`.

### Changed

- `quotes` with the CSS Modules engine is a hard error. Use `hash` or `words`.
- Package version jumps 0.4.0 → 1.0.0 to mark Modules as a public contract.
  Existing Tailwind-only CLI invocations do not need flag changes.

### Migration

Tailwind-only projects: upgrade as a feature release. No apply-flag changes.

CSS Modules on Vite or webpack: set `engines: ["css-modules"]` (or both
engines) and `naming.strategy` to `hash` or `words`. Do not use `quotes`.

Turbopack / apply-class bundlers:

```bash
npx minwind apply out --root . --engines css-modules --naming words --vocabulary words.json
```
