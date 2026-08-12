import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  assertConsolidatedNames,
  consolidateStylesheet,
  verifyConsolidation,
  type ConsolidatedRuleInfo,
} from "./consolidate.js";
import type { ExclusionConfig } from "./names.js";
import type { NamingConfig } from "./naming.js";
import { emptyPrepassResult, runPrepass, type PrepassResult } from "./prepass.js";
import {
  buildRenameMap,
  buildReport,
  writeArtifacts,
  type ReportWarning,
} from "./report.js";
import {
  assertPresence,
  transformStylesheet,
  type CssTransformWarning,
} from "./transform-css.js";
import type { TransformWarning } from "./transform-source.js";
import type { CustomPropertiesConfig } from "./custom-properties.js";
import { isModulesOnly, resolveFlags, type MinwindEngineId, type MinwindMode } from "./flags.js";
import { createGetLocalIdent } from "./engines/css-modules.js";

// webpack/rspack adapter (U3 outside Vite). The shape mirrors the Vite
// plugin: a pre-pass runs once before compilation (beforeCompile), a loader
// rewrites class contexts per module (minwind/webpack/loader, wired with
// enforce: 'pre' so it runs before JSX/TS compilers), and a processAssets
// tap rewrites emitted CSS after minification (SUMMARIZE is past
// css-minimizer's OPTIMIZE_SIZE, before content hashing so hashes reflect
// the final bytes). rspack exposes the same hooks and stage constants, so
// one adapter serves both. Types are structural: webpack is the host's
// dependency, not minwind's.

export interface MinwindWebpackOptions {
  // Site root scanned by the pre-pass; defaults to the compiler context.
  root?: string;
  // Tailwind CSS entry compiled by the pre-pass; defaults to
  // <root>/src/app.css.
  cssEntry?: string;
  // Themed naming (words/quotes) replaces content-hash naming.
  naming?: NamingConfig;
  // Site-specific classes the transform must not touch.
  exclusions?: ExclusionConfig;
  customProperties?: CustomPropertiesConfig;
  // User-facing morph vs compress. Defaults to compress.
  mode?: MinwindMode;
  engines?: ReadonlyArray<MinwindEngineId>;
  // Consolidation (repeated static lists collapse to one generated class).
  // Defaults from mode. Explicit false maps to morph; env still overrides.
  consolidate?: boolean;
  // Master switch. Defaults to true.
  enabled?: boolean;
}

interface WebpackAssetLike {
  source(): string | Buffer;
}

export interface WebpackCompilationLike {
  warnings?: Array<Error>;
  hooks: {
    processAssets: {
      tap(
        options: { name: string; stage: number },
        fn: (assets: Record<string, WebpackAssetLike>) => void,
      ): void;
    };
  };
  updateAsset(fileName: string, source: unknown): void;
}

export interface WebpackCompilerLike {
  context?: string;
  options: { plugins?: ReadonlyArray<unknown> };
  webpack: {
    Compilation: { PROCESS_ASSETS_STAGE_SUMMARIZE: number };
    sources: { RawSource: new (source: string) => unknown };
  };
  hooks: {
    beforeCompile: { tapPromise(name: string, fn: () => Promise<void>): void };
    thisCompilation: {
      tap(
        name: string,
        fn: (compilation: WebpackCompilationLike) => void,
      ): void;
    };
    afterEmit: { tapPromise(name: string, fn: () => Promise<void>): void };
  };
}

export interface CssAssetRewriteResult {
  // Every input stylesheet, rewritten (same keys).
  assets: Record<string, string>;
  warnings: Array<CssTransformWarning>;
  consolidated: Array<ConsolidatedRuleInfo>;
}

// The CSS half of the Vite plugin's generateBundle as a pure function, so
// the webpack tap (and tests) need no compilation object: rename selectors,
// then merge consolidation members and re-verify the frozen verdicts against
// the original emitted bytes (KTD3), then assert every renamed selector is
// witnessed in the output.
export function rewriteCssAssets(
  assets: Readonly<Record<string, string>>,
  prepass: {
    registry: PrepassResult["registry"];
    consolidationVerdicts: ReadonlyArray<
      PrepassResult["consolidationVerdicts"][number]
    >;
    customProperties?: PrepassResult["customProperties"];
  },
  consolidate: boolean,
): CssAssetRewriteResult {
  const registry = prepass.registry;
  const rewritten: Record<string, string> = {};
  const warnings: Array<CssTransformWarning> = [];
  const consolidated: Array<ConsolidatedRuleInfo> = [];
  const renamedAssets: Array<string> = [];
  for (const fileName of Object.keys(assets).sort()) {
    const original = assets[fileName];
    const renamed = transformStylesheet({
      css: original,
      registry,
      fileName,
      customProperties: prepass.customProperties,
    });
    warnings.push(...renamed.warnings);
    renamedAssets.push(renamed.css);
    let finalCss = renamed.css;
    if (consolidate) {
      const merged = consolidateStylesheet({
        css: renamed.css,
        verdicts: prepass.consolidationVerdicts,
        registry,
        fileName,
      });
      finalCss = merged.css;
      consolidated.push(...merged.consolidated);
      verifyConsolidation(
        original,
        prepass.consolidationVerdicts,
        registry,
        fileName,
      );
    }
    rewritten[fileName] = finalCss;
  }
  if (renamedAssets.length > 0) assertPresence(registry, renamedAssets);
  return { assets: rewritten, warnings, consolidated };
}

export class MinwindWebpackPlugin {
  // Rule wiring: { test: SOURCE_AND_SFC, enforce: 'pre', use: [MinwindWebpackPlugin.loader] }.
  static loader: string = fileURLToPath(
    new URL("./webpack-loader.js", import.meta.url),
  );

  static createGetLocalIdent(root: string) {
    return createGetLocalIdent(root);
  }

  // Read by the loader between beforeCompile and the end of compilation.
  prepass: PrepassResult | undefined;
  readonly consolidate: boolean;
  readonly mode: MinwindMode;
  private readonly modeWarning: string | undefined;
  private readonly options: MinwindWebpackOptions;
  private readonly enabled: boolean;
  private detectedModules = 0;
  private renamedModules = 0;
  private cssAssets = 0;
  private readonly warnings: Array<ReportWarning> = [];
  private readonly consolidated: Array<ConsolidatedRuleInfo> = [];

  constructor(options: MinwindWebpackOptions = {}) {
    this.options = options;
    const flags = resolveFlags(process.env, {
      mode: options.mode,
      engines: options.engines,
      consolidate: options.consolidate,
    });
    this.consolidate = flags.consolidate;
    this.enabled = (options.enabled ?? true) && flags.enabled;
    this.mode = flags.mode;
    this.modeWarning = flags.modeWarning;
  }

  // The loader reports each class-bearing module it saw (a transform result,
  // even warnings-only) and whether bytes changed — the zero-rename
  // tripwire's inputs.
  trackModule(
    renamed: boolean,
    warnings: ReadonlyArray<TransformWarning>,
  ): void {
    this.detectedModules += 1;
    if (renamed) this.renamedModules += 1;
    this.warnings.push(...warnings);
  }

  apply(compiler: WebpackCompilerLike): void {
    const plugin = this;

    compiler.hooks.beforeCompile.tapPromise("minwind", async function () {
      if (!plugin.enabled) {
        plugin.prepass = undefined;
        return;
      }
      const root = plugin.options.root ?? compiler.context ?? process.cwd();
      const flags = resolveFlags(process.env, {
        mode: plugin.options.mode,
        engines: plugin.options.engines,
        consolidate: plugin.options.consolidate,
      });
      const prepass = isModulesOnly(flags.engines)
        ? emptyPrepassResult()
        : await runPrepass({
            root,
            cssEntry:
              plugin.options.cssEntry ?? path.join(root, "src", "app.css"),
            naming: plugin.options.naming,
            exclusions: plugin.options.exclusions,
            customProperties: plugin.options.customProperties,
          });
      if (plugin.consolidate) {
        assertConsolidatedNames(
          prepass.registry,
          prepass.consolidationVerdicts,
        );
      }
      plugin.prepass = prepass;
    });

    compiler.hooks.thisCompilation.tap("minwind", function (compilation) {
      compilation.hooks.processAssets.tap(
        {
          name: "minwind",
          stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_SUMMARIZE,
        },
        function (assets) {
          const prepass = plugin.prepass;
          if (prepass === undefined) return;
          const stylesheets: Record<string, string> = {};
          for (const fileName of Object.keys(assets)) {
            if (!fileName.endsWith(".css")) continue;
            stylesheets[fileName] = assets[fileName].source().toString();
          }
          if (Object.keys(stylesheets).length === 0) return;
          const result = rewriteCssAssets(
            stylesheets,
            prepass,
            plugin.consolidate,
          );
          plugin.cssAssets += Object.keys(stylesheets).length;
          plugin.warnings.push(...result.warnings);
          plugin.consolidated.push(...result.consolidated);
          for (const warning of result.warnings) {
            compilation.warnings?.push(new Error(warning.message));
          }
          for (const fileName of Object.keys(result.assets)) {
            if (result.assets[fileName] === stylesheets[fileName]) continue;
            compilation.updateAsset(
              fileName,
              new compiler.webpack.sources.RawSource(result.assets[fileName]),
            );
          }
        },
      );
    });

    compiler.hooks.afterEmit.tapPromise("minwind", async function () {
      const prepass = plugin.prepass;
      if (prepass === undefined) return;
      // Zero-rename tripwire: a non-empty registry plus class-bearing
      // modules but zero applied renames means the loader ran after the
      // framework compiler (missing enforce: 'pre') — fail loudly.
      const renamedCount = prepass.registry.entries().length;
      if (
        renamedCount > 0 &&
        plugin.detectedModules > 0 &&
        plugin.renamedModules === 0
      ) {
        throw new Error(
          `minwind: tripwire: the registry renames ${renamedCount} classes` +
            ` and ${plugin.detectedModules} class-bearing module(s) were` +
            " detected, but zero source renames were applied — the loader" +
            " must run with enforce: 'pre', before any JSX/TS compiler",
        );
      }
      if (plugin.detectedModules === 0 && plugin.cssAssets === 0) return;
      const root = plugin.options.root ?? compiler.context ?? process.cwd();
      const report = buildReport({
        registry: prepass.registry,
        verdicts: prepass.consolidationVerdicts,
        warnings: plugin.warnings,
        consolidate: plugin.consolidate,
        mode: plugin.mode,
        modeWarning: plugin.modeWarning,
        customProperties: prepass.customProperties,
      });
      const map = buildRenameMap(
        prepass.registry,
        prepass.consolidationVerdicts,
        prepass.customProperties,
      );
      await writeArtifacts(root, report, map);
    });
  }
}

export default MinwindWebpackPlugin;
