import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import type { Plugin } from "vite";
import {
  DECLARATION_PATTERN,
  SOURCE_MODULE_PATTERN,
  tokenize,
  type RenameContextKind,
} from "./class-contexts.js";
import { SFC_PATTERN, walkModuleContexts } from "./sfc.js";
import {
  assertConsolidatedNames,
  consolidateStylesheet,
  verifyConsolidation,
  type ConsolidatedRuleInfo,
} from "./consolidate.js";
import type { ExclusionConfig, NameRegistry } from "./names.js";
import { isThemedNaming, type NamingConfig } from "./naming.js";
import {
  emptyPrepassResult,
  runPrepass,
  type PrepassResult,
} from "./prepass.js";
import {
  buildRenameMap,
  buildReport,
  writeArtifacts,
  type ReportWarning,
} from "./report.js";
import { assertPresence, transformStylesheet } from "./transform-css.js";
import { shouldTransformModule, transformSource } from "./transform-source.js";
import type { CustomPropertiesConfig } from "./custom-properties.js";
import {
  enginesInclude,
  isModulesOnly,
  resolveFlags,
  MODULES_CONSOLIDATE_SKIP_WARNING,
  type MinwindEngineId,
  type MinwindFlags,
  type MinwindMode,
} from "./flags.js";
import {
  createGenerateScopedName,
  LIGHTNING_MODULES_ERROR,
  MODULES_HOOK_MISSING_ERROR,
  NameCollisionSpace,
  prepareModulesNaming,
} from "./engines/css-modules.js";

export type { MinwindEngineId, MinwindFlags, MinwindMode };
export { resolveFlags };

// U6 plugin wiring (R4, R8, R9, R11). One factory returns two build-only
// plugins sharing per-build state: the source plugin (enforce 'pre', so it
// renames raw TSX before Solid's JSX compile per KTD1) and the CSS plugin
// (enforce 'post', so generateBundle sees the final post-minification assets
// per KTD2). The plugin is pure Vite — no vinxi/SolidStart imports.
//
// Note on module loading: vinxi bundles the app config (which imports this
// factory) with esbuild at the repo root and externalizes every bare package
// import, so this module's dependency chain (css-tree, magic-string,
// @tailwindcss/*) must resolve from the ROOT node_modules — those packages
// are exact-pinned root devDependencies for exactly this reason.

export interface MinwindOptions {
  // Site root scanned by the pre-pass; defaults to Vite's config.root.
  root?: string;
  // Tailwind CSS entry compiled by the pre-pass; defaults to
  // <root>/src/app.css. This is the pre-pass universe only — the shipped CSS
  // still comes from the site's own build (KTD3).
  cssEntry?: string;
  // Themed naming: 'words' deals a built-in theme or a custom vocabulary;
  // 'quotes' deals sentence words in order. Dialect ids (`boston`, …) keep
  // Tailwind hyphens and respell English runs. Default (absent or 'hash') is
  // content-hash naming, the only strategy with cross-build name stability
  // (KTD5). `naming.prefix` prepends a string to hash bodies (hash strategy
  // only).
  naming?: NamingConfig;
  // Classes the transform must not touch: exact names and prefixes for
  // runtime-injected or third-party markup classes (e.g. a syntax
  // highlighter's 'shiki' class). Excluded classes keep their original
  // bytes everywhere. Defaults to none.
  exclusions?: ExclusionConfig;
  // Explicitly application-owned CSS custom properties. minwind never
  // infers ownership; unprovable source usage keeps a property unchanged.
  customProperties?: CustomPropertiesConfig;
  // User-facing morph (rename only) vs compress (rename + consolidation).
  // Defaults to compress. Env MINWIND_* flags override when set.
  mode?: MinwindMode;
  // Engines participating in this build. Defaults to Tailwind-only.
  engines?: ReadonlyArray<MinwindEngineId>;
}

// Per-build state. SolidStart passes the same plugin objects to vinxi's ssr,
// client, and server-fns builds (KTD9), so anything per-build lives here:
// buildStart assigns a fresh state each build and every other hook reads the
// current one. The deliberately cross-build state (the warnings union and
// the published-map verification) lives in documented factory closures.
// Content-hash naming (KTD5) makes each build compute the identical
// registry.
interface BuildState {
  root: string;
  flags: MinwindFlags;
  prepass: PrepassResult;
  // Modules where a registry token was observed (a rename-context edit or a
  // reverse-leak/unprovable warning) versus modules actually rewritten — the
  // KTD7 zero-rename tripwire counters.
  detectedModules: number;
  renamedModules: number;
  // Applied renames by KTD4 context kind — the per-context KTD1 tripwire
  // counters: a Solid-compiled build still renames cn() calls while its JSX
  // class attributes dissolve into template strings before this plugin runs.
  renamesByKind: Record<RenameContextKind, number>;
  // Whether the buildStart source scan saw a JSX class-attribute literal
  // carrying a registry token; gates the per-context tripwire so a site
  // without JSX class contexts (e.g. CSS-only) can never trip it.
  observedJsxClassTokens: boolean;
  cssAssets: number;
  consolidated: Array<ConsolidatedRuleInfo>;
}

function asError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}

// Applied renames per KTD4 context kind for one transformed module.
// transformSource does not report which context kind its edits came from, so
// the plugin re-walks the module with the same shared walker: every registry
// token in a rename context is exactly what transformSource rewrote (a
// consolidation collapse still rewrites the group's literal, so the count
// stays nonzero under U5). Only zero-versus-nonzero per kind feeds the
// tripwire, so the double-visit of a nested cn() literal is harmless.
function accumulateRenamesByKind(
  counts: Record<RenameContextKind, number>,
  code: string,
  id: string,
  registry: NameRegistry,
): void {
  walkModuleContexts(id, code, {
    renameLiteral: function (literal, kind) {
      for (const token of tokenize(literal.text)) {
        if (registry.nameFor(token) !== undefined) counts[kind] += 1;
      }
    },
  });
}

// KTD1 per-context tripwire gate: does the site contain a JSX
// class-attribute literal carrying a registry token? The pre-pass walks
// these same contexts but exposes only kind-agnostic token sets, so the
// plugin re-scans with the same shared walker and the pre-pass's discovery
// rule (every .ts/.tsx module under <root>/src, which is also what Vite
// feeds the transform hook). An empty registry short-circuits — with nothing
// to rename there is no ordering break to detect — and the scan exits at the
// first hit.
async function scanForJsxClassTokens(
  root: string,
  registry: NameRegistry,
): Promise<boolean> {
  if (registry.entries().length === 0) return false;
  async function walk(directory: string): Promise<boolean> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (await walk(full)) return true;
        continue;
      }
      if (DECLARATION_PATTERN.test(entry.name)) continue;
      if (
        !SOURCE_MODULE_PATTERN.test(entry.name) &&
        !SFC_PATTERN.test(entry.name)
      ) {
        continue;
      }
      const text = await readFile(full, "utf8");
      let hit = false;
      walkModuleContexts(full, text, {
        renameLiteral: function (literal, kind) {
          if (hit || kind !== "class-attribute") return;
          for (const token of tokenize(literal.text)) {
            if (registry.nameFor(token) !== undefined) {
              hit = true;
              return;
            }
          }
        },
      });
      if (hit) return true;
    }
    return false;
  }
  return walk(path.join(root, "src"));
}

export function minwind(options: MinwindOptions = {}): Array<Plugin> {
  // R9 flag resolution is deferred to buildStart — and re-resolved at EVERY
  // buildStart: vinxi loads app config in the same process that runs the
  // builds, and a memoized first resolution would pin a stale environment on
  // the programmatic harnesses that set flags per build (R7) and on the
  // sibling router builds sharing this instance (KTD9). resolveFlags still
  // fails fast on a bad value, so an invalid flag aborts the build it
  // appears in.
  //
  // KTD9 shared-instance state. vinxi runs its three router builds
  // sequentially in one process against this one instance, and the report
  // content must not depend on which build observed what: warnings
  // accumulate as a union across builds (CSS-transform warnings exist only
  // in CSS-emitting builds; an SSR-only module's warnings only in that
  // graph's build), and the first participating build's map bytes arm the
  // divergence check for its siblings.
  const sharedWarnings: Array<ReportWarning> = [];
  let publishedMapBytes: string | undefined;

  let viteRoot: string | undefined;
  let state: BuildState | undefined;
  const collision = new NameCollisionSpace();

  function currentRoot(): string {
    return options.root ?? viteRoot ?? process.cwd();
  }

  function currentCssEntry(root: string): string {
    return options.cssEntry ?? path.join(root, "src", "app.css");
  }

  const source: Plugin = {
    name: "minwind:source",
    apply: "build",
    enforce: "pre",

    config: function (userConfig, env) {
      if (env.command !== "build") return;
      const flags = resolveFlags(process.env, {
        mode: options.mode,
        engines: options.engines,
      });
      if (!flags.enabled) return;
      if (!enginesInclude(flags.engines, "css-modules")) return;
      const root = options.root ?? userConfig.root ?? process.cwd();
      const themed = isThemedNaming(options.naming)
        ? prepareModulesNaming(
            root,
            options.naming,
            undefined,
            options.exclusions,
          )
        : undefined;
      return {
        css: {
          modules: {
            generateScopedName: createGenerateScopedName(root, {
              registry: themed?.registry,
              collision,
              naming: options.naming,
            }),
          },
        },
      };
    },

    configResolved: function (config) {
      viteRoot = config.root;
      const flags = resolveFlags(process.env, {
        mode: options.mode,
        engines: options.engines,
      });
      if (!flags.enabled) return;
      if (!enginesInclude(flags.engines, "css-modules")) return;
      const css = config.css as {
        transformer?: string;
        modules?: boolean | { generateScopedName?: unknown };
      };
      if (css.transformer === "lightningcss") {
        throw new Error(LIGHTNING_MODULES_ERROR);
      }
      if (css.modules === false) {
        throw new Error(MODULES_HOOK_MISSING_ERROR);
      }
      const generateScopedName =
        typeof css.modules === "object" && css.modules !== null
          ? css.modules.generateScopedName
          : undefined;
      if (typeof generateScopedName !== "function") {
        throw new Error(MODULES_HOOK_MISSING_ERROR);
      }
    },

    buildStart: async function () {
      const root = currentRoot();
      const active = resolveFlags(process.env, {
        mode: options.mode,
        engines: options.engines,
      });
      if (active.modeWarning !== undefined) {
        this.warn(active.modeWarning);
      }
      if (
        active.consolidate &&
        enginesInclude(active.engines, "css-modules") &&
        enginesInclude(active.engines, "tailwind")
      ) {
        this.warn(MODULES_CONSOLIDATE_SKIP_WARNING);
      }
      if (!active.enabled) {
        state = undefined;
        return;
      }
      try {
        const prepass = isModulesOnly(active.engines)
          ? emptyPrepassResult()
          : await runPrepass({
              root,
              cssEntry: currentCssEntry(root),
              naming: options.naming,
              exclusions: options.exclusions,
              customProperties: options.customProperties,
            });
        if (
          enginesInclude(active.engines, "css-modules") &&
          !isModulesOnly(active.engines)
        ) {
          collision.seed(prepass.registry);
        }
        if (active.consolidate) {
          assertConsolidatedNames(
            prepass.registry,
            prepass.consolidationVerdicts,
          );
        }
        if (
          isThemedNaming(options.naming) &&
          options.naming.prominence !== undefined &&
          prepass.naming !== undefined &&
          prepass.naming.prominent === 0
        ) {
          this.warn(
            "minwind: the prominence manifest matched zero renamed" +
              " tokens — regenerate it from a MINWIND=off build" +
              " (minwind prominence <build-output-directory>)",
          );
        }
        state = {
          root,
          flags: active,
          prepass,
          detectedModules: 0,
          renamedModules: 0,
          renamesByKind: {
            "class-attribute": 0,
            "classList-key": 0,
            "cn-argument": 0,
          },
          observedJsxClassTokens: await scanForJsxClassTokens(
            root,
            prepass.registry,
          ),
          cssAssets: 0,
          consolidated: [],
        };
      } catch (cause) {
        this.error(asError(cause));
      }
    },

    transform: function (code, id) {
      const current = state;
      if (current === undefined) return null;
      if (!shouldTransformModule(id)) return null;
      try {
        const result = transformSource({
          code,
          id,
          registry: current.prepass.registry,
          consolidationVerdicts: current.flags.consolidate
            ? current.prepass.consolidationVerdicts
            : undefined,
          customProperties: current.prepass.customProperties,
        });
        if (result === null) return null;
        current.detectedModules += 1;
        for (const warning of result.warnings) {
          this.warn(warning.message);
          sharedWarnings.push(warning);
        }
        if (result.code === code) return null;
        current.renamedModules += 1;
        accumulateRenamesByKind(
          current.renamesByKind,
          code,
          id,
          current.prepass.registry,
        );
        return {
          code: result.code,
          // MagicString's map type is wider than Vite's SourceMapInput
          // (nullable sourcesContent); our generateMap always includes
          // content, so the runtime shape is compatible.
          map: JSON.parse(result.map.toString()),
        };
      } catch (cause) {
        this.error(asError(cause));
      }
    },

    closeBundle: function () {
      const current = state;
      if (current === undefined) return;
      // KTD7 tripwire: a non-empty registry plus observed class-bearing
      // modules but zero applied renames means the enforce-pre ordering
      // assumption (KTD1) broke — fail loudly instead of shipping
      // unrenamed output. A build that saw no class-bearing modules at all
      // (e.g. server-fns) does not trip.
      const renamedCount = current.prepass.registry.entries().length;
      if (
        renamedCount > 0 &&
        current.detectedModules > 0 &&
        current.renamedModules === 0
      ) {
        this.error(
          `minwind: tripwire: the registry renames ${renamedCount} classes` +
            ` and ${current.detectedModules} class-bearing module(s) were` +
            " detected, but zero source renames were applied — the" +
            " enforce-pre plugin-ordering assumption (KTD1) broke",
        );
      }
      // KTD1 per-context tripwire: the zero-rename check above only catches
      // a total ordering break. The realistic break leaves cn() calls
      // renameable while Solid's JSX compile dissolves class="..."
      // attributes into compiled template strings before this plugin runs,
      // so also fail when the source scan saw JSX class attributes carrying
      // registry tokens (which implies a non-empty registry), some renames
      // were applied, but no class-attribute rename was. Builds that renamed
      // nothing are caught above; sites without JSX class contexts
      // (observedJsxClassTokens false) can never reach this check.
      if (
        current.renamedModules > 0 &&
        current.observedJsxClassTokens &&
        current.renamesByKind["class-attribute"] === 0
      ) {
        this.error(
          "minwind: tripwire: JSX class-attribute contexts carry registry" +
            " tokens and renames were applied in other contexts, but zero" +
            " class-attribute renames were applied — the enforce-pre" +
            " plugin-ordering assumption (KTD1) broke for JSX sources",
        );
      }
    },
  };

  const css: Plugin = {
    name: "minwind:css",
    apply: "build",
    enforce: "post",

    generateBundle: async function (_outputOptions, bundle) {
      const current = state;
      if (current === undefined) return;
      const registry = current.prepass.registry;
      const verdicts = current.prepass.consolidationVerdicts;
      try {
        // Deterministic asset order keeps warning collection stable (R8).
        const renamedAssets: Array<string> = [];
        for (const fileName of Object.keys(bundle).sort()) {
          const item = bundle[fileName];
          if (item.type !== "asset" || !fileName.endsWith(".css")) continue;
          const original =
            typeof item.source === "string"
              ? item.source
              : Buffer.from(item.source).toString("utf8");
          current.cssAssets += 1;

          const renamed = transformStylesheet({
            css: original,
            registry,
            fileName,
            customProperties: current.prepass.customProperties,
          });
          for (const warning of renamed.warnings) {
            this.warn(warning.message);
            sharedWarnings.push(warning);
          }
          // Presence is asserted over the renamed (pre-consolidation) bytes:
          // consolidation legitimately removes removable member rules, so the
          // member names must be witnessed before any merge.
          renamedAssets.push(renamed.css);

          let finalCss = renamed.css;
          if (current.flags.consolidate) {
            const merged = consolidateStylesheet({
              css: renamed.css,
              verdicts,
              registry,
              fileName,
            });
            finalCss = merged.css;
            current.consolidated.push(...merged.consolidated);
            // Re-verify the frozen pre-pass verdicts against the ORIGINAL
            // emitted bytes; a divergence fails the build (KTD3, R10).
            verifyConsolidation(original, verdicts, registry, fileName);
          }

          item.source = finalCss;
        }
        if (renamedAssets.length > 0) {
          assertPresence(registry, renamedAssets);
        }
      } catch (cause) {
        this.error(asError(cause));
      }
    },

    closeBundle: async function () {
      const current = state;
      if (current === undefined) return;
      // R11 artifacts: only builds that participated in the transform write
      // (a server-fns build that saw neither class modules nor CSS assets
      // skips). Warnings come from the shared union, so whichever
      // participating build publishes last leaves the converged content.
      if (current.detectedModules === 0 && current.cssAssets === 0) return;
      try {
        const report = buildReport({
          registry: current.prepass.registry,
          verdicts: current.prepass.consolidationVerdicts,
          warnings: sharedWarnings,
          consolidate: current.flags.consolidate,
          mode: current.flags.mode,
          modeWarning: current.flags.modeWarning,
          customProperties: current.prepass.customProperties,
        });
        const map = buildRenameMap(
          current.prepass.registry,
          current.prepass.consolidationVerdicts,
          current.prepass.customProperties,
        );
        // The first participating build of this process publishes
        // unconditionally (clearing any stale artifacts a previous process
        // left); every sibling build must then compute the identical map
        // bytes. A mismatch means the content-hash registry determinism
        // assumption (KTD5) broke between router builds — writeArtifacts
        // throws before writing, and the catch below fails the build.
        const written = await writeArtifacts(current.root, report, map, {
          expectedMapBytes: publishedMapBytes,
        });
        publishedMapBytes = written.mapBytes;
      } catch (cause) {
        this.error(asError(cause));
      }
    },
  };

  return [source, css];
}

export default minwind;
