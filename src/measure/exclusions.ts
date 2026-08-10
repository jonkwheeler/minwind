import { Buffer } from "node:buffer";
import { modelCssFile } from "./css-model.js";
import { requireSource, type DiscoveredBuild } from "./discover.js";
import { modelHtmlFile } from "./html-model.js";
import { compareCodeUnits } from "./util.js";

export type ClassCategory =
  | "utility"
  | "custom"
  | "marker"
  | "css-only"
  | "js-referenced"
  | "unmodelable";

export interface FileDiagnostic {
  filePath: string;
  reason: string;
}

export interface ClassInventoryEntry {
  token: string;
  category: ClassCategory;
  excluded: boolean;
  htmlOccurrences: number;
  htmlBytes: number;
  ruleCount: number;
  utilityRuleCount: number;
  variantReferences: number;
  jsReferenced: boolean;
}

export interface ClassModel {
  entries: Array<ClassInventoryEntry>;
  skippedFiles: Array<FileDiagnostic>;
  parseWarnings: Array<FileDiagnostic>;
  totalClassTokenBytes: number;
  excludedClassTokenBytes: number;
  excludedByteShareByCategory: Partial<Record<ClassCategory, number>>;
}

export const EXCLUDED_CATEGORIES: ReadonlySet<ClassCategory> = new Set([
  "marker",
  "css-only",
  "js-referenced",
  "unmodelable",
]);

// Characters that may appear in a Tailwind candidate token; a JS/inline-script
// match only counts as a reference when the adjacent characters are NOT in
// this set, so `active` never matches `inactive` or `interactive`.
const CLASSNAME_CHAR = /[A-Za-z0-9\-_:/.[\]%#]/;

export function isTokenReferencedInText(token: string, text: string): boolean {
  if (token === "") return false;
  let from = 0;
  for (;;) {
    const index = text.indexOf(token, from);
    if (index === -1) return false;
    const before = index > 0 ? text[index - 1] : "";
    const afterIndex = index + token.length;
    const after = afterIndex < text.length ? text[afterIndex] : "";
    if (!CLASSNAME_CHAR.test(before) && !CLASSNAME_CHAR.test(after))
      return true;
    from = index + 1;
  }
}

export interface TokenStats {
  htmlOccurrences: number;
  htmlBytes: number;
  ruleCount: number;
  utilityRuleCount: number;
  variantReferences: number;
}

export function categorize(
  stats: TokenStats,
  jsReferenced: boolean,
): ClassCategory {
  const hasRule = stats.ruleCount > 0;
  if (!hasRule && stats.variantReferences > 0) return "marker";
  if (jsReferenced) return "js-referenced";
  if (!hasRule) return "unmodelable";
  if (stats.htmlOccurrences === 0) return "css-only";
  if (stats.utilityRuleCount > 0) return "utility";
  return "custom";
}

export function buildClassModel(build: DiscoveredBuild): ClassModel {
  const skippedFiles: Array<FileDiagnostic> = [];
  const statsByToken = new Map<string, TokenStats>();
  const scriptTexts: Array<string> = [];

  function statsFor(token: string): TokenStats {
    let stats = statsByToken.get(token);
    if (!stats) {
      stats = {
        htmlOccurrences: 0,
        htmlBytes: 0,
        ruleCount: 0,
        utilityRuleCount: 0,
        variantReferences: 0,
      };
      statsByToken.set(token, stats);
    }
    return stats;
  }

  for (const htmlFile of build.htmlFiles) {
    const result = modelHtmlFile(
      htmlFile,
      requireSource(build.sources, htmlFile),
    );
    if (!result.ok) {
      skippedFiles.push({ filePath: result.filePath, reason: result.reason });
      continue;
    }
    for (const occurrence of result.model.classAttributes) {
      for (const token of occurrence.tokens) {
        const stats = statsFor(token);
        stats.htmlOccurrences += 1;
        stats.htmlBytes += Buffer.byteLength(token, "utf8");
      }
    }
    for (const script of result.model.inlineScripts) {
      scriptTexts.push(script);
    }
  }

  const parseWarnings: Array<FileDiagnostic> = [];

  for (const cssFile of build.cssFiles) {
    const model = modelCssFile(cssFile, requireSource(build.sources, cssFile));
    for (const message of model.parseWarnings) {
      parseWarnings.push({ filePath: model.filePath, reason: message });
    }
    for (const rule of model.rules) {
      const countedInRule = new Set<string>();
      for (const arm of rule.arms) {
        for (const candidate of arm.candidates) {
          const stats = statsFor(candidate);
          if (!countedInRule.has(candidate)) {
            countedInRule.add(candidate);
            stats.ruleCount += 1;
            if (rule.inUtilitiesLayer) stats.utilityRuleCount += 1;
          }
        }
        for (const reference of arm.references) {
          statsFor(reference).variantReferences += 1;
        }
      }
    }
  }

  for (const jsFile of build.jsFiles) {
    scriptTexts.push(requireSource(build.sources, jsFile));
  }

  const entries: Array<ClassInventoryEntry> = [];
  let totalClassTokenBytes = 0;
  let excludedClassTokenBytes = 0;
  const excludedBytesByCategory = new Map<ClassCategory, number>();

  for (const [token, stats] of statsByToken) {
    const jsReferenced = scriptTexts.some(function (text) {
      return isTokenReferencedInText(token, text);
    });
    const category = categorize(stats, jsReferenced);
    const excluded = EXCLUDED_CATEGORIES.has(category);
    totalClassTokenBytes += stats.htmlBytes;
    if (excluded) {
      excludedClassTokenBytes += stats.htmlBytes;
      excludedBytesByCategory.set(
        category,
        (excludedBytesByCategory.get(category) ?? 0) + stats.htmlBytes,
      );
    }
    entries.push({
      token,
      category,
      excluded,
      htmlOccurrences: stats.htmlOccurrences,
      htmlBytes: stats.htmlBytes,
      ruleCount: stats.ruleCount,
      utilityRuleCount: stats.utilityRuleCount,
      variantReferences: stats.variantReferences,
      jsReferenced,
    });
  }

  entries.sort(function (a, b) {
    return compareCodeUnits(a.token, b.token);
  });

  const excludedByteShareByCategory: Partial<Record<ClassCategory, number>> =
    {};
  if (totalClassTokenBytes > 0) {
    for (const [category, bytes] of excludedBytesByCategory) {
      excludedByteShareByCategory[category] = bytes / totalClassTokenBytes;
    }
  }

  return {
    entries,
    skippedFiles,
    parseWarnings,
    totalClassTokenBytes,
    excludedClassTokenBytes,
    excludedByteShareByCategory,
  };
}
