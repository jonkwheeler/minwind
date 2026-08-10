import fs from "node:fs";
import path from "node:path";
import type { ConsolidationVerdict } from "./consolidate.js";
import type { ExclusionEntry, NameRegistry } from "./names.js";
import { transformBundle } from "./transform-bundle.js";
import { transformModule, type TransformWarning } from "./transform-source.js";
import type { CssTransformWarning } from "./transform-css.js";
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
  quoteOrder?: ReadonlyMap<string, ReadonlyArray<string>>;
  consolidate: boolean;
  dryRun?: boolean;
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
  // call argument, an SSR payload in an inline script). Skip-and-warn: the
  // conservative choice costs compression, never correctness.
  keptOriginal: Array<string>;
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

export function applyBuildOutput(options: ApplyOptions): ApplyResult {
  const { dir, consolidate } = options;
  const files = walkAssets(dir);

  // Pass 1 (detection, never written): run the HTML and bundle transforms
  // against the full registry. A reverse-leak warning marks a registry
  // token in a position the post-build passes cannot rewrite — renaming it
  // in the stylesheet while the DOM keeps the original would break the
  // page, so the token drops out of the rename set entirely.
  const leaked = new Set<string>();
  for (const file of files) {
    const isHtml = file.endsWith(".html");
    if (!isHtml && !BUNDLE_PATTERN.test(file)) continue;
    const code = fs.readFileSync(file, "utf8");
    const detected = isHtml
      ? transformModule({ code, id: file, registry: options.registry })
      : transformBundle({ code, id: file, registry: options.registry });
    if (detected === null) continue;
    for (const warning of detected.warnings) {
      if (warning.kind === "reverse-leak" && warning.token !== undefined) {
        leaked.add(warning.token);
      }
    }
  }
  const registry = filterRegistry(options.registry, leaked);
  // A consolidation verdict mentioning a dropped token can no longer merge:
  // its kept-original member rule must survive.
  const consolidationVerdicts = options.consolidationVerdicts.filter(
    function (verdict) {
      return !verdict.tokens.some(function (token) {
        return leaked.has(token);
      });
    },
  );

  const result: ApplyResult = {
    htmlFiles: 0,
    cssFiles: 0,
    jsFiles: 0,
    rewrittenFiles: 0,
    warnings: [],
    consolidated: 0,
    keptOriginal: Array.from(leaked).sort(),
  };

  const stylesheets: Record<string, string> = {};
  const stylesheetPaths = new Map<string, string>();
  for (const file of files) {
    if (!file.endsWith(".css")) continue;
    stylesheets[path.relative(dir, file)] = fs.readFileSync(file, "utf8");
    stylesheetPaths.set(path.relative(dir, file), file);
  }

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

  for (const file of files) {
    if (file.endsWith(".css")) continue;
    const isHtml = file.endsWith(".html");
    const isBundle = BUNDLE_PATTERN.test(file);
    if (!isHtml && !isBundle) continue;
    const code = fs.readFileSync(file, "utf8");
    const transformed = isHtml
      ? transformModule({
          code,
          id: file,
          registry,
          consolidationVerdicts: consolidate
            ? consolidationVerdicts
            : undefined,
          quoteOrder: options.quoteOrder,
        })
      : transformBundle({
          code,
          id: file,
          registry,
          consolidationVerdicts: consolidate
            ? consolidationVerdicts
            : undefined,
          quoteOrder: options.quoteOrder,
        });
    if (isHtml) result.htmlFiles += 1;
    else result.jsFiles += 1;
    if (transformed === null) continue;
    result.warnings.push(...transformed.warnings);
    if (transformed.code === code) continue;
    result.rewrittenFiles += 1;
    if (options.dryRun !== true) fs.writeFileSync(file, transformed.code);
  }
  return result;
}
