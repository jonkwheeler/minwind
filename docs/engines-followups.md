# Engine follow-ups

These engines are **not** implemented. The notes record the rename altitude so
a later adapter does not invent a second identity model. CSS/SCSS Modules is
the only non-Tailwind engine: Vite and webpack own the scoped-name hook;
Turbopack and other apply-class bundlers remap proven export maps after emit.

## StyleX

StyleX generates atomic class names at compile time (Babel plugin / unplugin).
A minwind adapter would own that hash/identity callback so production names
stay bijective with the emitted CSS, the same way Modules owns
`generateScopedName`. Do not post-mangle StyleX hashes in bundled CSS.

## Vanilla Extract

Vanilla Extract exposes an `identifiers` function for generated class names.
That function is the rename altitude: file-qualified local identity in, minwind
generated name out. Treat `.css.ts` exports as keys, not as rewrite targets.

## Panda CSS

Panda's codegen already emits hashed or prefixed class names. An adapter would
plug into that hash/prefix step (or the equivalent config hook) before CSS is
written. Do not regex-replace Panda utilities after the fact.

## Out of scope

Atomic decomposition of CSS Modules into shared utilities is not an engine
follow-up. It would be a different product.
