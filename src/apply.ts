import fs from "node:fs";
import path from "node:path";
import type { ConsolidationVerdict } from "./consolidate.js";
import { dependentTokens } from "./dependents.js";
import type * as ts from "typescript";
import {
  applyModulesRemap,
  exportMapProof,
  type ModuleRemapContext,
} from "./engines/modules-remap.js";
import type { ExclusionEntry, NameRegistry } from "./names.js";
import { transformBundle } from "./transform-bundle.js";
import {
  transformModule,
  type TransformSourceResult,
  type TransformWarning,
} from "./transform-source.js";
import {
  selectorArmTokens,
  type CssTransformWarning,
} from "./transform-css.js";
import {
  vendorAttribution,
  type VendorOccurrenceTest,
  type VendorProvenance,
} from "./vendor-provenance.js";
import { rewriteCssAssets } from "./webpack.js";

// The post-build rewriter behind `minwind apply` — the path for bundlers
// without a plugin hook (Turbopack, esbuild, Parcel, plain Rollup). The
// registry comes from the same pre-pass the plugins run; this module applies
// it to an already-emitted output directory: HTML class attributes through
// the same walker the SFC formats use, stylesheets through the webpack
// adapter's pure CSS core, and JS bundles through the conservative bundle
// pass (markup template class="..." spans and class/className property
// literals only). Files rewrite in place; a dry run reports without
// writing.

export interface ApplyOptions {
  dir: string;
  registry: NameRegistry;
  consolidationVerdicts: ReadonlyArray<ConsolidationVerdict>;
  consolidate: boolean;
  dryRun?: boolean;
  modules?: ModuleRemapContext;
  // trustVendorModules (R10): the recorded client chunks. A leak occurrence
  // a chunk's map attributes to a trusted node_modules package stops
  // counting; every other occurrence counts as before.
  vendorProvenance?: VendorProvenance;
}

export interface ApplyResult {
  htmlFiles: number;
  cssFiles: number;
  jsFiles: number;
  rewrittenFiles: number;
  warnings: Array<TransformWarning | CssTransformWarning>;
  consolidated: number;
  // Tokens that kept their original names because a whole-word occurrence
  // appeared in a position the post-build passes cannot rewrite (a minified
  // call argument, an SSR payload in an inline script), plus keptDependent.
  // Skip-and-warn: the conservative choice costs compression, never
  // correctness.
  keptOriginal: Array<string>;
  // The subset of keptOriginal kept only because every selector arm it
  // appears in compounds a class kept original (KTD7), such as a
  // `group-hover:*` utility whose `group` marker leaked.
  keptDependent: Array<string>;
  // Renamed tokens that trusted vendor code mentions at an occurrence that
  // stopped counting (R10): a page a class-toggling library breaks points
  // here.
  vendorMentions: Array<string>;
}

// The tokens kept original for an occurrence in an unrewritable position:
// keptOriginal less keptDependent. Logged apart from the dependents.
export function keptUnrewritable(result: ApplyResult): Array<string> {
  const dependent = new Set(result.keptDependent);
  return result.keptOriginal.filter(function (token) {
    return !dependent.has(token);
  });
}

const BUNDLE_PATTERN = /\.[cm]?js$/;

function walkAssets(directory: string): Array<string> {
  const files: Array<string> = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkAssets(full));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files.sort();
}

// A registry view with the leaked tokens removed. Dropped tokens surface as
// runtime-context exclusions so the report shows exactly what the
// conservative choice cost.
export function filterRegistry(
  registry: NameRegistry,
  dropped: ReadonlySet<string>,
): NameRegistry {
  return {
    nameFor: function (token: string): string | undefined {
      return dropped.has(token) ? undefined : registry.nameFor(token);
    },
    tokenFor: function (name: string): string | undefined {
      const token = registry.tokenFor(name);
      return token !== undefined && dropped.has(token) ? undefined : token;
    },
    entries: function () {
      return registry.entries().filter(function (entry) {
        return !dropped.has(entry.token);
      });
    },
    exclusions: function (): Array<ExclusionEntry> {
      const extra: Array<ExclusionEntry> = [];
      for (const token of Array.from(dropped).sort()) {
        extra.push({ token, reason: "runtime-context" });
      }
      return [...registry.exclusions(), ...extra];
    },
    assertBijection: function (): void {
      registry.assertBijection();
    },
  };
}

// KTD10: a reverse-leak warning at an occurrence copied from trusted vendor
// code. Filtering found occurrences by position covers every kind the scans
// report.
function atVendorOccurrence(
  warning: TransformWarning,
  isVendor: VendorOccurrenceTest | null,
): boolean {
  return (
    isVendor !== null &&
    warning.kind === "reverse-leak" &&
    warning.token !== undefined &&
    isVendor(warning.line, warning.column, warning.token)
  );
}

// HTML through the SFC walker, JS bundles through the bundle pass.
function transformOutput(
  file: string,
  code: string,
  registry: NameRegistry,
  consolidationVerdicts?: ReadonlyArray<ConsolidationVerdict>,
  isExportMap?: (node: ts.ObjectLiteralExpression) => boolean,
): TransformSourceResult | null {
  const options = {
    code,
    id: file,
    registry,
    consolidationVerdicts,
    isExportMap,
  };
  return file.endsWith(".html")
    ? transformModule(options)
    : transformBundle(options);
}

// A registry view that renames nothing and has no entries, so a rewrite
// through it applies only consolidation collapses and runs no leak scan.
// With `asked`, it records each token the rewrite looked up a name for that
// the full registry renames: exactly the tokens the rewrite renames one by
// one.
function namelessView(
  registry: NameRegistry,
  asked?: Set<string>,
): NameRegistry {
  return {
    nameFor: function (token: string): string | undefined {
      if (asked !== undefined && registry.nameFor(token) !== undefined) {
        asked.add(token);
      }
      return undefined;
    },
    tokenFor: function (): string | undefined {
      return undefined;
    },
    entries: function () {
      return [];
    },
    exclusions: function (): Array<ExclusionEntry> {
      return [];
    },
    assertBijection: function (): void {},
  };
}

// Registry tokens the rewrite renames one by one somewhere in the output,
// outside any list that collapses to a consolidated name. Consolidation
// judged member removability from source class lists, but the output's
// lists can differ (an Astro component merging a class prop renders
// `rounded-lg flex gap-4` where the source has `flex gap-4`), and such a
// token needs its own rule. The first rewrite applies only the collapses;
// the second asks for a name for every token left in a class list.
function individuallyRenamedTokens(
  files: ReadonlyArray<string>,
  registry: NameRegistry,
  consolidationVerdicts: ReadonlyArray<ConsolidationVerdict>,
): Set<string> {
  const renamed = new Set<string>();
  for (const file of files) {
    const code = fs.readFileSync(file, "utf8");
    const collapsed = transformOutput(
      file,
      code,
      namelessView(registry),
      consolidationVerdicts,
    );
    transformOutput(
      file,
      collapsed?.code ?? code,
      namelessView(registry, renamed),
    );
  }
  return renamed;
}

export function applyBuildOutput(options: ApplyOptions): ApplyResult {
  const { dir, consolidate } = options;
  const files = walkAssets(dir);
  const classFiles = files.filter(function (file) {
    return file.endsWith(".html") || BUNDLE_PATTERN.test(file);
  });

  // Pass 1 (detection, never written): run the HTML and bundle transforms
  // against the full registry. A reverse-leak warning marks a registry
  // token in a position the post-build passes cannot rewrite — renaming it
  // in the stylesheet while the DOM keeps the original would break the
  // page, so the token drops out of the rename set entirely. With the
  // Modules engine, a proven export map's keys are module locals and never
  // leak (KTD15); the remap that renames its values runs last. With
  // trustVendorModules, an occurrence from trusted vendor code does not leak
  // (KTD10), and renaming still runs on the whole chunk.
  const isExportMap =
    options.modules === undefined ? undefined : exportMapProof(options.modules);
  const vendorTest = vendorAttribution(options.vendorProvenance);
  const leaked = new Set<string>();
  const vendorMentioned = new Set<string>();
  for (const file of classFiles) {
    const code = fs.readFileSync(file, "utf8");
    const detected = transformOutput(
      file,
      code,
      options.registry,
      undefined,
      isExportMap,
    );
    if (detected === null) continue;
    const leaks = detected.warnings.some(function (warning) {
      return warning.kind === "reverse-leak";
    });
    const isVendor = leaks ? vendorTest(file, code) : null;
    for (const warning of detected.warnings) {
      if (warning.kind !== "reverse-leak" || warning.token === undefined) {
        continue;
      }
      if (atVendorOccurrence(warning, isVendor)) {
        vendorMentioned.add(warning.token);
      } else {
        leaked.add(warning.token);
      }
    }
  }
  const stylesheets: Record<string, string> = {};
  const stylesheetPaths = new Map<string, string>();
  for (const file of files) {
    if (!file.endsWith(".css")) continue;
    stylesheets[path.relative(dir, file)] = fs.readFileSync(file, "utf8");
    stylesheetPaths.set(path.relative(dir, file), file);
  }
  // KTD7: a token whose every selector arm in the built stylesheets
  // compounds a dropped or excluded class would have no selector left to
  // rename, so it drops out too, and reports as runtime-context with the
  // leaked tokens.
  const keptDependent = dependentTokens(
    Object.values(stylesheets).flatMap(selectorArmTokens),
    function (token) {
      return (
        !leaked.has(token) && options.registry.nameFor(token) !== undefined
      );
    },
  );
  for (const token of keptDependent) leaked.add(token);
  const registry = filterRegistry(options.registry, leaked);
  // A consolidation verdict mentioning a dropped token can no longer merge:
  // its kept-original member rule must survive.
  const mergeable = options.consolidationVerdicts.filter(function (verdict) {
    return !verdict.tokens.some(function (token) {
      return leaked.has(token);
    });
  });
  // Pass 2 (detection, never written): a member the output renames outside
  // a collapsed list keeps its rule. An empty removable list keeps every
  // member rule; the merged rule ships either way.
  const pinned =
    consolidate &&
    mergeable.some(function (verdict) {
      return (verdict.removableTokens ?? []).length > 0;
    })
      ? individuallyRenamedTokens(classFiles, registry, mergeable)
      : new Set<string>();
  const consolidationVerdicts = mergeable.map(function (verdict) {
    if (verdict.removableTokens === undefined || pinned.size === 0) {
      return verdict;
    }
    return {
      ...verdict,
      removableTokens: verdict.removableTokens.filter(function (token) {
        return !pinned.has(token);
      }),
    };
  });

  const result: ApplyResult = {
    htmlFiles: 0,
    cssFiles: 0,
    jsFiles: 0,
    rewrittenFiles: 0,
    warnings: [],
    consolidated: 0,
    keptOriginal: Array.from(leaked).sort(),
    keptDependent,
    vendorMentions: Array.from(vendorMentioned)
      .filter(function (token) {
        return !leaked.has(token);
      })
      .sort(),
  };

  const css = rewriteCssAssets(
    stylesheets,
    {
      registry,
      consolidationVerdicts,
    },
    consolidate,
  );
  result.cssFiles = Object.keys(stylesheets).length;
  result.warnings.push(...css.warnings);
  result.consolidated = css.consolidated.length;
  for (const name of Object.keys(css.assets)) {
    if (css.assets[name] === stylesheets[name]) continue;
    result.rewrittenFiles += 1;
    if (options.dryRun !== true) {
      fs.writeFileSync(stylesheetPaths.get(name) ?? name, css.assets[name]);
    }
  }

  for (const file of classFiles) {
    const isHtml = file.endsWith(".html");
    const code = fs.readFileSync(file, "utf8");
    const transformed = transformOutput(
      file,
      code,
      registry,
      consolidate ? consolidationVerdicts : undefined,
      isExportMap,
    );
    if (isHtml) result.htmlFiles += 1;
    else result.jsFiles += 1;
    if (transformed === null) continue;
    const isVendor =
      transformed.warnings.length > 0 ? vendorTest(file, code) : null;
    for (const warning of transformed.warnings) {
      if (!atVendorOccurrence(warning, isVendor)) result.warnings.push(warning);
    }
    if (transformed.code === code) continue;
    result.rewrittenFiles += 1;
    if (options.dryRun !== true) fs.writeFileSync(file, transformed.code);
  }
  if (options.modules !== undefined) {
    const remapped = applyModulesRemap(dir, options.modules, {
      dryRun: options.dryRun === true,
    });
    result.rewrittenFiles += remapped.rewrittenFiles;
  }
  return result;
}
