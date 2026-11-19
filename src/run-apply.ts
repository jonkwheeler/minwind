import path from "node:path";
import process from "node:process";
import { applyBuildOutput, filterRegistry, type ApplyResult } from "./apply.js";
import { assertConsolidatedNames } from "./consolidate.js";
import {
  assertSharedCollision,
  prepareModulesNaming,
  reservedFromRegistry,
} from "./engines/css-modules.js";
import {
  enginesInclude,
  isModulesOnly,
  resolveFlags,
  type MinwindEngineId,
  type MinwindMode,
} from "./flags.js";
import type { ExclusionConfig } from "./names.js";
import { isThemedNaming, type NamingConfig } from "./naming.js";
import { emptyPrepassResult, runPrepass } from "./prepass.js";
import {
  computeProminenceFromDir,
  DEFAULT_WINDOW,
  type ProminenceManifest,
} from "./prominence.js";
import { buildRenameMap, buildReport, writeArtifacts } from "./report.js";

// The post-build engine run behind `minwind apply`, callable in-process:
// runs the same pre-pass the plugins run against the site source, rewrites
// an already-emitted output directory in place, and publishes the report
// and map. Failures throw; argv parsing and printing stay in apply-cli.ts.

export interface RunApplyOptions {
  // Emitted build output, rewritten in place.
  dir: string;
  // Site root: the pre-pass scans its source, and the report and map land
  // in <root>/.output/minwind.
  root: string;
  // Tailwind CSS entry (default: <root>/src/app.css).
  cssEntry?: string;
  naming?: NamingConfig;
  // Classes that keep their names everywhere (runtime-injected or
  // third-party), as in the plugins.
  exclusions?: ExclusionConfig;
  mode?: MinwindMode;
  // Explicit consolidate override (--no-consolidate), applied after mode.
  consolidate?: boolean;
  engines?: ReadonlyArray<MinwindEngineId>;
  // Visibility ranking for words and quotes naming: "auto" ranks dir's own
  // HTML with the default window before renaming it; a manifest from
  // `minwind prominence` carries its own window. Hash, dialect, and maps
  // naming reject prominence, so it applies only to words and quotes.
  prominence?: "auto" | ProminenceManifest;
  // Report what would change without writing files or artifacts.
  dryRun?: boolean;
}

export type RunApplyResult =
  // MINWIND=off or MINWIND_RENAME=off: nothing was ranked, rewritten, or
  // written.
  | { enabled: false }
  | {
      enabled: true;
      result: ApplyResult;
      // Renamed Tailwind and Module tokens, less those kept original.
      renamed: number;
      // Tokens that drew vocabulary by visibility rank.
      prominent: number;
      // Warnings for the caller to print.
      notices: Array<string>;
    };

export async function runApply(
  options: RunApplyOptions,
): Promise<RunApplyResult> {
  // Resolved per call, like the plugin's buildStart, so a caller's
  // environment at run time decides.
  const flags = resolveFlags(process.env, {
    mode: options.mode,
    engines: options.engines,
    consolidate: options.consolidate,
  });
  if (!flags.enabled) return { enabled: false };
  const dryRun = options.dryRun ?? false;
  let naming = options.naming;
  let manifest: ProminenceManifest | undefined;
  if (options.prominence !== undefined && isThemedNaming(naming)) {
    manifest =
      options.prominence === "auto"
        ? computeProminenceFromDir(options.dir, DEFAULT_WINDOW)
        : options.prominence;
    naming = { ...naming, prominence: manifest.tokens };
  }
  const prepass = isModulesOnly(flags.engines)
    ? emptyPrepassResult()
    : await runPrepass({
        root: options.root,
        cssEntry: options.cssEntry ?? path.join(options.root, "src", "app.css"),
        naming,
        exclusions: options.exclusions,
      });
  const prominent = prepass.naming?.prominent ?? 0;
  const notices: Array<string> = [];
  if (
    manifest !== undefined &&
    prepass.naming !== undefined &&
    prominent === 0
  ) {
    notices.push(
      "minwind: prominence ranked zero renamed tokens in the first" +
        ` ${manifest.window} class-bearing elements — rank HTML that` +
        " still carries the original class names (a MINWIND=off build)",
    );
  }
  const modulesPrepared = enginesInclude(flags.engines, "css-modules")
    ? prepareModulesNaming(
        options.root,
        naming,
        isModulesOnly(flags.engines)
          ? undefined
          : reservedFromRegistry(prepass.registry),
        options.exclusions,
      )
    : undefined;
  const modules =
    modulesPrepared === undefined
      ? undefined
      : {
          root: options.root,
          inventory: modulesPrepared.inventory,
          registry: modulesPrepared.registry,
        };
  if (modules !== undefined && !isModulesOnly(flags.engines)) {
    assertSharedCollision(prepass.registry, modules.registry);
  }
  if (flags.consolidate) {
    assertConsolidatedNames(prepass.registry, prepass.consolidationVerdicts);
  }
  const result = applyBuildOutput({
    dir: options.dir,
    registry: prepass.registry,
    consolidationVerdicts: prepass.consolidationVerdicts,
    consolidate: flags.consolidate,
    dryRun,
    modules,
  });
  if (!dryRun) {
    // Artifacts publish to the site root's .output/minwind — the same
    // convention as the plugins, so `minwind report` finds them and the
    // deployable output directory stays clean. The report's registry view
    // reflects the skip-and-warn drops as runtime-context exclusions.
    const effective = filterRegistry(
      prepass.registry,
      new Set(result.keptOriginal),
    );
    const report = buildReport({
      registry: effective,
      verdicts: prepass.consolidationVerdicts,
      warnings: result.warnings,
      consolidate: flags.consolidate,
      mode: flags.mode,
    });
    const map = buildRenameMap(effective, prepass.consolidationVerdicts);
    await writeArtifacts(options.root, report, map);
  }
  const renamed =
    prepass.registry.entries().length +
    (modules === undefined ? 0 : modules.registry.entries().length) -
    result.keptOriginal.length;
  return { enabled: true, result, renamed, prominent, notices };
}
