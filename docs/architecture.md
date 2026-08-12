# Architecture and safety

This document is the stable mental model for minwind. It explains how the
system fits together, which invariants define correctness, and where each part
lives. User setup belongs in the [README](../README.md); repository execution
rules belong in [AGENTS.md](../AGENTS.md).

## System contract

minwind is a production-build compiler transform, not a runtime library. Its
correctness depends on four rules:

1. One global registry maps every original class token to at most one generated
   name, and every generated name back to exactly one original token.
2. Source/markup references and emitted CSS selectors consume the same registry.
3. When any relevant usage of a token is unprovable, that token keeps its
   original name everywhere.
4. Classification uncertainty is reported; internal inconsistency, collisions,
   or partial transformation fail the build.

These rules matter more than any adapter or naming strategy. A change that
violates one is not a valid optimization.

Owned CSS custom properties use a separate registry at the same seam. They
share the global-poison rule but not the classname universe or naming
configuration: custom properties are an explicit application-owned interface,
and their generated or explicitly aliased names always retain the required
`--` prefix. Alias selection never expands the owned set.

## Pipeline

```text
Tailwind CSS and/or CSS/SCSS Modules
              |
              v
     engine providers (pre-pass / inventory)
              |
              v
      one global name registry
          /             \
         v               v
 source/markup       emitted CSS
   transform          transform
   (Tailwind)        (Tailwind layer gate)
         \               /
          v             v
 CSS Modules naming hooks (generateScopedName / getLocalIdent)
              |
              v
        production output
              |
              v
       report + rename map
```

### 1. Pre-pass

The pre-pass compiles the Tailwind entry, scans supported source files, and
classifies the complete token universe before rewriting begins. It establishes
which tokens may be renamed, which must be excluded, and which static lists may
be considered for consolidation.

Primary modules:

- `src/prepass.ts` — orchestration and source discovery.
- `src/engines/tailwind.ts` — Tailwind compile + oxide scan.
- `src/engines/css-modules.ts` — Modules inventory and bundler naming hooks.
- `src/engines/modules-remap.ts` — post-build inverse rename from JS export maps.
- `src/engines/types.ts` — shared engine provider surface.
- `src/class-contexts.ts` — shared syntax/context classification.
- `src/names.ts` — exclusion rules and bijective registry.
- `src/naming.ts` — hash, word, quote, and prominence assignment.
- `src/flags.ts` — morph/compress mode and engine selection.

The pre-pass and source transform must share the same classifier. Adding syntax
to only one side creates a dangerous disagreement between what the build thinks
it can rename and what it actually rewrites.

### 2. Source and markup transform

Source-level adapters parse modules before framework compilation and rewrite
only recognized class contexts using span-precise edits. This causes server
rendering and hydration bundles to inherit the same names.

Primary modules:

- `src/transform-source.ts` — TypeScript/JavaScript and script-block edits.
- `src/sfc.ts` — Vue, Svelte, and Astro template handling.
- `src/plugin.ts` — Vite lifecycle adapter.
- `src/webpack-loader.ts` and `src/webpack.ts` — webpack/rspack adapter.

Post-build apply cannot rely on source syntax. `src/transform-bundle.ts` rewrites
only emitted JavaScript literals that are still provably class contexts;
ambiguous occurrences exclude the token globally.

### 3. CSS transform and consolidation

`src/transform-css.ts` parses emitted stylesheets with css-tree and rewrites
class selectors through the registry. `src/consolidate.ts` can replace repeated
static lists with a generated rule only when variants, complex selectors,
at-rule context, and cascade order are proven safe.

The CSS phase must happen before content hashes are finalized. A transformed
stylesheet may never be paired with untransformed markup or JavaScript.

`src/custom-properties.ts` rewrites explicitly owned custom-property
declarations, `var()` references, `@property` registrations, and provable
CSSOM string arguments. Its scanner ignores comments and strings and recognizes
only semantic CSS positions; custom-property-looking URL text is not rewritten.
Any source occurrence outside a supported CSSOM call excludes that property
globally before source or CSS edits begin.

### 4. Reports and artifacts

`src/report.ts` writes the build report and rename map outside the deployable
public directory. Reports include:

- active flags and summary counts;
- original/generated mappings;
- exclusion tokens and reasons;
- consolidation candidates and verdicts;
- transform warnings.

`src/report-cli.ts` renders the build report for humans. Reports are part of the
safety model: conservative skips must be visible rather than silently reducing
coverage.

## Adapter differences

### Vite

`src/plugin.ts` runs the pre-pass in `buildStart`, transforms source modules in
`transform`, and rewrites emitted CSS in `generateBundle`. The adapter is
production-only and includes tripwires for builds that discover class-bearing
source but perform no renames. When the CSS Modules engine is enabled it owns
`css.modules.generateScopedName` (PostCSS Modules only; Lightning CSS Modules
fails the build).

### webpack and rspack

`src/webpack-loader.ts` rewrites modules before framework compilers.
`src/webpack.ts` owns the pre-pass, emitted CSS rewrite, reports, and ordering
tripwire. The loader must be configured as `enforce: "pre"`. CSS Modules morph
uses `MinwindWebpackPlugin.createGetLocalIdent`.

### Post-build apply

`src/apply.ts` operates on completed HTML, CSS, and JavaScript assets. Because
compiled bundles have lost some source semantics, it deliberately accepts lower
rename coverage in exchange for never breaking an ambiguous runtime reference.

Tailwind apply rewrites HTML class attributes, stylesheet selectors, and
provable JS `class` / `className` literals. CSS/SCSS Modules apply is an inverse
rename for bundlers without a name-generator hook (Turbopack, and the same
`minwind apply` path for esbuild or Parcel). It proves Module generated names
from CSS Module JS export maps whose keys uniquely identify one inventory file,
then rewrites every whole-word occurrence of those proven bundler names in JS,
CSS, and HTML. Unprovable strings stay original. Once a name is proven, JS and
CSS must both contain it after remap or the build fails; missing HTML is not a
fail. `quotes` with the Modules engine is a hard error.

### CSS Modules

Modules locals are rename-eligible by definition-site inventory (file-qualified
`path + "\0" + local`), not by Tailwind's source∩universe predicate. Generated
names share a collision space with Tailwind. Tailwind assets that reference
registry tokens still require `@layer utilities`; Modules-emitted CSS that only
carries Modules-generated names skips that gate. Follow-up engine altitudes
(StyleX, Vanilla Extract, Panda) are documented in
[Engine follow-ups](./engines-followups.md).

## Exclusion semantics

Exclusions are token-wide, not occurrence-wide. If one occurrence cannot be
rewritten safely, the original token remains unchanged across every output
surface. This prevents a preserved runtime reference from pointing at a renamed
CSS selector.

Common reasons include:

- configured names or prefixes;
- runtime or ambiguous bundle contexts;
- CSS-only tokens with no proven source reference;
- source contexts the classifier intentionally treats as detection-only.

Generated names are checked against excluded originals as well as other
generated names. The finished registry asserts its own bijection before output
is accepted.

## Consolidation semantics

Consolidation is an optional layer on top of renaming. A candidate list must be
static, repeated, variant-free, and safe under the stylesheet cascade. Rejected
candidates remain renamed normally. Never broaden consolidation eligibility
without tests covering selector specificity, ordering, at-rules, and
complex-subject utilities.

## Measurement and verification

The measurement subsystem under `src/measure/` models an existing production
build without changing it. It reports cold-route and whole-site compression
deltas for rename, consolidation, and a theoretical upper bound. It is an
adoption tool, not proof of rendered equivalence.

The comparison harness under `harness/` supplies that proof. It builds a target
with minwind off and on and checks:

- computed styles element by element;
- pixel-level screenshots;
- console and page errors;
- clicks, client navigation, and theme toggles;
- raw, gzip, and Brotli deltas;
- class-attribute length deltas.

Unit tests live under `test/` and mirror module boundaries. A change to syntax
classification normally needs source-classification, source-transform, and
adapter coverage. A change to registry or exclusion behavior needs both direct
registry tests and an end-to-end transform case.

## Public surfaces

| Surface                                  | Source                                    |
| ---------------------------------------- | ----------------------------------------- |
| `minwind()` and shared public types      | `src/index.ts`, `src/plugin.ts`           |
| webpack/rspack plugin and loader         | `src/webpack.ts`, `src/webpack-loader.ts` |
| `minwind measure`                        | `src/measure/cli.ts`                      |
| `minwind apply`                          | `src/apply-cli.ts`                        |
| `minwind report`                         | `src/report-cli.ts`                       |
| `minwind prominence`                     | `src/prominence-cli.ts`                   |
| Package exports and runtime requirements | `package.json`                            |

When a public surface changes, update the README and any relevant examples in
the same change.
