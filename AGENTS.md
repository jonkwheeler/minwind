# minwind agent guide

Read [README.md](./README.md) for the user-facing product contract and
[docs/architecture.md](./docs/architecture.md) for the system model.

## Project in one paragraph

minwind is a production-build Tailwind v4 classname compressor. A pre-pass
creates one bijective name registry; source/markup and emitted CSS transforms
consume it; ambiguous usage excludes the original token globally; reports make
all conservative skips visible. Vite, webpack/rspack, and post-build apply are
adapters around that contract.

## Non-negotiable invariants

- HTML, JavaScript, and CSS must use one registry. Never rename only one output
  surface.
- Unprovable usage preserves the original token everywhere. Do not optimize one
  occurrence while leaving another runtime reference behind.
- Classification uncertainty may skip with a report; collisions, inconsistent
  state, or partial transforms must fail the build.
- The pre-pass and transform must agree on supported syntax. Extend and test
  both sides together.
- Development output remains untouched.
- Consolidation is optional and strictly more conservative than renaming.
- Custom-property ownership is explicit. An unprovable source occurrence must
  preserve that property name globally.

## Where to work

| Task                                   | Primary files                                                    | Start with tests                                                                                                        |
| -------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Source syntax or class-context support | `src/class-contexts.ts`, `src/transform-source.ts`, `src/sfc.ts` | `test/transform-source.test.ts`, `test/sfc.test.ts`                                                                     |
| Registry, exclusions, or hash names    | `src/names.ts`, `src/naming.ts`                                  | `test/names.test.ts`, `test/naming.test.ts`                                                                             |
| CSS selector rewriting                 | `src/transform-css.ts`, `src/css-util.ts`                        | `test/transform-css.test.ts`                                                                                            |
| Consolidation safety                   | `src/consolidate.ts`                                             | `test/consolidate.test.ts`                                                                                              |
| Vite lifecycle                         | `src/plugin.ts`, `src/prepass.ts`                                | `test/plugin.test.ts`, `test/prepass.test.ts`                                                                           |
| webpack/rspack lifecycle               | `src/webpack.ts`, `src/webpack-loader.ts`                        | `test/webpack.test.ts`                                                                                                  |
| Post-build apply                       | `src/apply.ts`, `src/apply-cli.ts`, `src/transform-bundle.ts`    | `test/apply.test.ts`                                                                                                    |
| Reports and artifacts                  | `src/report.ts`, `src/report-cli.ts`                             | `test/plugin.test.ts`, `test/webpack.test.ts`, `test/apply.test.ts`                                                     |
| Owned CSS custom properties            | `src/custom-properties.ts`, adapter wiring                       | `test/custom-properties.test.ts`, `test/transform-css.test.ts`, `test/transform-source.test.ts`, `test/prepass.test.ts` |
| Measurement                            | `src/measure/`                                                   | `test/measure/`                                                                                                         |
| Browser equivalence and byte gates     | `harness/`                                                       | `pnpm compare`                                                                                                          |

Confirm current filenames with `rg --files` before assuming a mapped test exists.

## Commands

```bash
pnpm run typecheck
pnpm run test:unit
pnpm test
pnpm run format:check
pnpm run check
pnpm compare
pnpm build
```

During implementation, run the narrowest relevant test file first. Before
finishing a code change, run `pnpm check`. Run `pnpm compare` when behavior can
affect emitted HTML, JavaScript, CSS, naming, exclusions, consolidation, or
adapter ordering.

## Change rules

- Preserve unrelated working-tree changes.
- Add regression coverage at the module boundary where a bug or new behavior is
  introduced.
- Update README examples and compatibility claims when public exports, options,
  CLI flags, supported syntax, or runtime requirements change.
- Keep deep implementation explanation in `docs/architecture.md`; keep the
  README focused on evaluation, setup, usage, and verification.
- Do not treat `docs/design-plan.md` as the current product contract. It records
  the earlier Vite-only implementation stage and is useful as historical
  rationale only.
- Generated `dist/` output is build output; edit `src/` and rebuild instead of
  hand-editing generated files.

## Done criteria

A change is done when its targeted tests pass, typechecking and formatting pass,
the full unit suite is green, relevant public documentation is current, and any
output-surface change has been exercised through the comparison harness or has a
written reason why the harness is not applicable.
