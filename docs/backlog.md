# Backlog

Standing later-work list. This is not a roadmap and not a promise of order.
The current Modules theming plan is [docs/plans/2026-08-12-002-feat-modules-themed-morph-plan.md](./plans/2026-08-12-002-feat-modules-themed-morph-plan.md).

## Naming

- Restore `quotes` only after the strategy is good enough to ship beside `hash` and `words`. Until then public Modules (and this version's default story) is hash or words.
- Additional hash variants (length, alphabet, stability policy beyond today's content hash).

## Compression

- Atomic decomposition of CSS/SCSS Modules into shared utilities.
- Rewriting call sites so `styles.button` is no longer the API.

## Engines

- StyleX (compile-time identity hook).
- Vanilla Extract (`identifiers`).
- Panda CSS (codegen hash/prefix).
- Indented Sass syntax (`*.module.sass`).
- Vite Lightning CSS Modules parity (today: fail loud when the Modules engine is on and the naming hook cannot be applied).

## Adapters

- SFC `<style module>` beyond `*.module.css` / `*.module.scss` if it needs a different altitude than the bundler hook.
