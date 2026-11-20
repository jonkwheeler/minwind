import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { generate, ident, parse, walk, type CssNode } from "css-tree";
import { applyBuildOutput, filterRegistry, type ApplyResult } from "./apply.js";
import { assertConsolidatedNames } from "./consolidate.js";
import { classAttributeTokens } from "./css-util.js";
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
import type { ExclusionConfig, NameRegistry } from "./names.js";
import { isThemedNaming, type NamingConfig } from "./naming.js";
import { emptyPrepassResult, runPrepass } from "./prepass.js";
import {
  computeProminenceFromDir,
  DEFAULT_WINDOW,
  type ProminenceManifest,
  walkHtmlFiles,
} from "./prominence.js";
import { buildRenameMap, buildReport, writeArtifacts } from "./report.js";
import { compareCodeUnits } from "./util.js";

// The post-build engine run behind `minwind apply`, callable in-process:
// runs the same pre-pass the plugins run against the site source, rewrites
// an already-emitted output directory in place, and publishes the report
// and map. Failures throw; argv parsing and printing stay in apply-cli.ts.

export interface RunApplyOptions {
  // Emitted build output, rewritten in place.
  dir: string;
  // Site root: the report and map land in <root>/.output/minwind.
  root: string;
  // Source directory the pre-pass scans for class names and lists
  // (default: <root>/src).
  sourceDir?: string;
  // Tailwind CSS entry (default: <sourceDir>/app.css).
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
      notices: Array<string>;
    };

// The R7 tripwire (KTD8). Nothing rewrites HTML <style> contents, and the
// leak check blanks them (maskSfcStyleContent: a utility word there is
// usually a CSS value), so a renamed class referenced in one would stop
// matching without a warning. This is the span the mask blanks.
const STYLE_CONTENT = /<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi;

// Decoded class names in a stylesheet's selectors, and its attribute
// selectors. walk() follows the structure fields that children lists miss:
// the selector list in `:nth-child(2n of .x)` and both preludes of
// `@scope (.a) to (.b)` (KTD12). css-tree 3.2.1 leaves a nested rule whose
// selector does not start with `&` as a Raw node (see transform-css.ts), so
// Raw text reparses as rules. A Raw value is a slice of the text it came
// from and only a strictly shorter one reparses, so the recursion ends.
function collectSelectorReferences(
  css: string,
  classes: Set<string>,
  attributes: Array<CssNode>,
): void {
  walk(parse(css, { onParseError: function () {} }), {
    enter: function (node) {
      if (node.type === "ClassSelector" && node.name !== undefined) {
        classes.add(ident.decode(node.name));
      } else if (node.type === "AttributeSelector") {
        attributes.push(node);
      } else if (
        node.type === "Raw" &&
        node.value !== undefined &&
        node.value.length < css.length
      ) {
        collectSelectorReferences(node.value, classes, attributes);
      }
    },
  });
}

function assertInlineStylesUnrenamed(
  dir: string,
  registry: NameRegistry,
): void {
  const originals = registry.entries().map(function (entry) {
    return entry.token;
  });
  const matches: Array<string> = [];
  for (const file of walkHtmlFiles(dir).sort(compareCodeUnits)) {
    const classes = new Set<string>();
    const attributes: Array<CssNode> = [];
    for (const match of fs.readFileSync(file, "utf8").matchAll(STYLE_CONTENT)) {
      collectSelectorReferences(match[1], classes, attributes);
    }
    const references = new Set<string>();
    for (const token of classes) {
      if (registry.nameFor(token) !== undefined) references.add(`.${token}`);
    }
    // KTD12: a class attribute selector names the originals it could match.
    for (const attribute of attributes) {
      for (const token of classAttributeTokens(attribute, originals)) {
        references.add(`.${token} in ${generate(attribute)}`);
      }
    }
    for (const reference of Array.from(references).sort(compareCodeUnits)) {
      matches.push(`  ${file}: ${reference}`);
    }
  }
  if (matches.length > 0) {
    throw new Error(
      "minwind: HTML <style> blocks reference renamed classes. minwind" +
        " does not rewrite inline styles, so these selectors would stop" +
        ` matching them:\n${matches.join("\n")}`,
    );
  }
}

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
  const sourceDir = options.sourceDir ?? path.join(options.root, "src");
  const prepass = isModulesOnly(flags.engines)
    ? emptyPrepassResult()
    : await runPrepass({
        root: options.root,
        sourceDir,
        cssEntry: options.cssEntry ?? path.join(sourceDir, "app.css"),
        naming,
        exclusions: options.exclusions,
        scansBuiltOutput: true,
      });
  const prominent = prepass.naming?.prominent ?? 0;
  const notices: Array<string> = [];
  if (flags.modeWarning !== undefined) notices.push(flags.modeWarning);
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
  const effective = filterRegistry(
    prepass.registry,
    new Set(result.keptOriginal),
  );
  // Fails before the artifacts publish. The output files are already
  // rewritten by then (applyBuildOutput writes as it goes), but the build
  // fails instead of shipping.
  assertInlineStylesUnrenamed(options.dir, effective);
  if (!dryRun) {
    // Artifacts publish to the site root's .output/minwind — the same
    // convention as the plugins, so `minwind report` finds them and the
    // deployable output directory stays clean. The report's registry view
    // reflects the skip-and-warn drops as runtime-context exclusions.
    const report = buildReport({
      registry: effective,
      verdicts: prepass.consolidationVerdicts,
      warnings: result.warnings,
      consolidate: flags.consolidate,
      mode: flags.mode,
      modeWarning: flags.modeWarning,
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
