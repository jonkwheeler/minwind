import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import * as ts from "typescript";
import {
  DECLARATION_PATTERN,
  SOURCE_MODULE_PATTERN,
  tokenize,
  type LiteralOccurrence,
} from "./class-contexts.js";
import { SFC_PATTERN, walkModuleContexts } from "./sfc.js";
import {
  createHasher,
  createNameRegistry,
  type ExclusionConfig,
  type NameRegistry,
} from "./names.js";
import {
  hashLengthOf,
  isThemedNaming,
  resolveHasher,
  resolveNaming,
  type NamingConfig,
  type NamingResult,
} from "./naming.js";
import {
  canonicalListKey,
  computeConsolidationVerdicts,
  modelStylesheet,
  type ConsolidationVerdict,
  type ListFrequency,
  type StylesheetModel,
} from "./consolidate.js";
import { compareCodeUnits } from "./util.js";
import { compileTailwindStylesheet } from "./engines/tailwind.js";
import {
  collectCustomPropertyNamesInCss,
  createCustomPropertyRegistry,
  scanCustomPropertySource,
  type CustomPropertiesConfig,
  type CustomPropertyRegistry,
} from "./custom-properties.js";

// U2 buildStart pre-pass (KTD3): establish the class universe from the
// compiled CSS entry and the source token inventory from the module scan,
// then build the registry and freeze consolidation verdicts before any
// transform runs.

export interface PrepassOptions {
  root: string;
  cssEntry: string;
  // Themed naming (words) replaces content-hash naming; the default
  // (absent or 'hash') keeps KTD5 stability.
  naming?: NamingConfig;
  // Site-specific classes the transform must not touch (runtime-injected
  // markup classes, third-party widget classes). Defaults to none.
  exclusions?: ExclusionConfig;
  customProperties?: CustomPropertiesConfig;
}

export interface PrepassResult {
  registry: NameRegistry;
  universe: Set<string>;
  sourceTokens: Set<string>;
  renameTokens: Set<string>;
  runtimeTokens: Set<string>;
  listFrequencies: Array<ListFrequency>;
  consolidationVerdicts: Array<ConsolidationVerdict>;
  stylesheet: string;
  stylesheetModel: StylesheetModel;
  naming?: NamingResult;
  customProperties?: CustomPropertyRegistry;
}

interface SourceScan {
  renameTokens: Set<string>;
  runtimeTokens: Set<string>;
  // Tokens from rename groups that are not provably static lists (a dynamic
  // cn() argument, a conditional classList object): consolidation must keep
  // their rules, because those references never collapse (R3).
  dynamicTokens: Set<string>;
  listCounts: Map<string, ListFrequency>;
  // Static string literals inside DYNAMIC groups (the quoted branches of
  // cn('base', cond && 'extra')): never a consolidation list (R3), but each
  // literal is one contiguous run in the rendered attribute, so the quote
  // solver may name and reorder its tokens as a fragment.
  literalCounts: Map<string, ListFrequency>;
}

async function sourceModulePaths(root: string): Promise<Array<string>> {
  const found: Array<string> = [];
  async function walk(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    const children: Array<Promise<void>> = [];
    for (const entry of entries) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        children.push(walk(full));
      } else if (DECLARATION_PATTERN.test(entry.name)) {
        continue;
      } else if (
        SOURCE_MODULE_PATTERN.test(entry.name) ||
        SFC_PATTERN.test(entry.name)
      ) {
        found.push(full);
      }
    }
    // Push order is nondeterministic across the parallel recursion; the
    // final found.sort() in sourceModulePaths restores a canonical order.
    await Promise.all(children);
  }
  await walk(path.join(root, "src"));
  return found.sort();
}

function scanModule(filePath: string, text: string, scan: SourceScan): void {
  function recordList(tokens: Array<string>): void {
    const key = canonicalListKey(tokens);
    if (key === "") return;
    const existing = scan.listCounts.get(key);
    if (existing !== undefined) {
      existing.count += 1;
    } else {
      scan.listCounts.set(key, { tokens: key.split(" "), count: 1 });
    }
  }

  function recordLiteral(tokens: Array<string>): void {
    // Singletons carry no ordering information; the solver's word dealing
    // names their token either way.
    if (tokens.length < 2) return;
    const key = canonicalListKey(tokens);
    const existing = scan.literalCounts.get(key);
    if (existing !== undefined) {
      existing.count += 1;
    } else {
      scan.literalCounts.set(key, { tokens: key.split(" "), count: 1 });
    }
  }

  function recordRename(tokens: Array<string>): void {
    for (const token of tokens) scan.renameTokens.add(token);
  }

  function recordRuntime(tokens: Array<string>): void {
    for (const token of tokens) scan.runtimeTokens.add(token);
  }

  // A template literal with expressions in a class position is unprovable:
  // its static fragments are still real class tokens, so they poison the
  // token everywhere (KTD4).
  function poisonTemplate(node: ts.TemplateExpression): void {
    const tokens = tokenize(node.head.text);
    for (const span of node.templateSpans) {
      for (const token of tokenize(span.literal.text)) tokens.push(token);
    }
    recordRuntime(tokens);
  }

  // The walker's rename groups map onto the scan's list recording: one group
  // per class attribute literal, cn(...) call, or classList object; only a
  // statically provable group (staticList) forms a consolidation list, while
  // the tokens of any other group are dynamic usages whose stylesheet rules
  // must survive (R3 excludes runtime-composed lists from consolidation).
  // Groups never nest, so one accumulator is enough. A nested cn() literal
  // is reported twice through the same group, so literal recording dedupes
  // by span.
  let groupTokens: Array<string> = [];
  let groupLiterals: Array<{ start: number; tokens: Array<string> }> = [];

  walkModuleContexts(filePath, text, {
    enterRenameGroup: function (): void {
      groupTokens = [];
      groupLiterals = [];
    },
    renameLiteral: function (literal: LiteralOccurrence): void {
      const tokens = tokenize(literal.text);
      for (const token of tokens) groupTokens.push(token);
      if (
        !groupLiterals.some(function (seen) {
          return seen.start === literal.start;
        })
      ) {
        groupLiterals.push({ start: literal.start, tokens });
      }
    },
    exitRenameGroup: function (_kind, _fullyLiteral, staticList): void {
      recordRename(groupTokens);
      if (staticList) {
        recordList(groupTokens);
      } else {
        for (const token of groupTokens) scan.dynamicTokens.add(token);
        for (const literal of groupLiterals) recordLiteral(literal.tokens);
      }
      groupTokens = [];
      groupLiterals = [];
    },
    unprovableTemplate: function (node: ts.TemplateExpression): void {
      poisonTemplate(node);
    },
    runtimeLiteral: function (literal: LiteralOccurrence): void {
      recordRuntime(tokenize(literal.text));
    },
  });
}

interface SourceInventory {
  scan: SourceScan;
  paths: Array<string>;
  texts: Array<string>;
}

async function scanSources(root: string): Promise<SourceInventory> {
  const scan: SourceScan = {
    renameTokens: new Set<string>(),
    runtimeTokens: new Set<string>(),
    dynamicTokens: new Set<string>(),
    listCounts: new Map<string, ListFrequency>(),
    literalCounts: new Map<string, ListFrequency>(),
  };
  const paths = await sourceModulePaths(root);
  // Reads batch in parallel; the CPU-bound scans stay sequential in path
  // order, and their writes (Sets, Maps, count increments) commute anyway.
  const texts = await Promise.all(
    paths.map(function (filePath) {
      return readFile(filePath, "utf8");
    }),
  );
  for (let index = 0; index < paths.length; index += 1) {
    scanModule(paths[index], texts[index], scan);
  }
  return { scan, paths, texts };
}

export async function runPrepass(
  options: PrepassOptions,
): Promise<PrepassResult> {
  const compiled = await compileTailwindStylesheet({
    cssEntry: options.cssEntry,
    root: options.root,
  });
  const stylesheet = compiled.stylesheet;

  const stylesheetModel = modelStylesheet(stylesheet);
  const sourceInventory = await scanSources(options.root);
  const scan = sourceInventory.scan;

  const hasher = createHasher(hashLengthOf(options.naming));
  const classHasher = resolveHasher(options.naming);
  let customProperties: CustomPropertyRegistry | undefined;
  if (options.customProperties !== undefined) {
    const provisional = createCustomPropertyRegistry(
      options.customProperties,
      new Set(),
      new Set(),
      hasher,
    );
    const unsafe = new Set<string>();
    for (let index = 0; index < sourceInventory.paths.length; index += 1) {
      const sourceScan = scanCustomPropertySource(
        sourceInventory.texts[index],
        sourceInventory.paths[index],
        provisional,
      );
      for (const property of sourceScan.unsafe) unsafe.add(property);
    }
    customProperties = createCustomPropertyRegistry(
      options.customProperties,
      unsafe,
      collectCustomPropertyNamesInCss(stylesheet),
      hasher,
    );
    customProperties.assertBijection();
  }

  // Detection-only tokens feed the exclusion report (KTD4), so they join the
  // registry's source set; the runtime-context precedence in the registry
  // keeps them excluded.
  const sourceTokens = new Set<string>(scan.renameTokens);
  for (const token of scan.runtimeTokens) sourceTokens.add(token);

  const listFrequencies = Array.from(scan.listCounts.values());
  listFrequencies.sort(function (a, b) {
    return compareCodeUnits(a.tokens.join(" "), b.tokens.join(" "));
  });

  let registry = createNameRegistry({
    universe: stylesheetModel.universe,
    sourceTokens,
    runtimeTokens: scan.runtimeTokens,
    exclusions: options.exclusions,
    hash: classHasher,
  });

  // Themed naming: the provisional hash registry determines which tokens
  // rename (the registry's own classification), the solver assigns words,
  // and the final registry is rebuilt with the assignment. Words reserve
  // against the universe and the source tokens so a generated name can
  // never collide with a class the stylesheet or the sources keep.
  let naming: NamingResult | undefined;
  if (options.naming !== undefined && isThemedNaming(options.naming)) {
    const renamedTokens = registry.entries().map(function (entry) {
      return entry.token;
    });
    const reserved = new Set<string>(stylesheetModel.universe);
    for (const token of sourceTokens) reserved.add(token);
    // Excluded exact names reserve too, even when they appear in neither the
    // stylesheet nor the sources: a runtime-injected class (a router's
    // 'active') that matches a generated word would restyle whatever element
    // the runtime adds it to.
    for (const name of options.exclusions?.names ?? []) reserved.add(name);
    // The solver sees consolidation's static lists plus the literal-level
    // runs inside dynamic groups (a cn() branch's quoted string is one
    // contiguous run in the rendered attribute). Consolidation itself never
    // sees the literal runs (R3).
    const solverLists = new Map<string, ListFrequency>();
    for (const list of listFrequencies) {
      solverLists.set(list.tokens.join(" "), list);
    }
    for (const list of scan.literalCounts.values()) {
      const key = list.tokens.join(" ");
      const existing = solverLists.get(key);
      if (existing !== undefined) existing.count += list.count;
      else solverLists.set(key, { tokens: list.tokens, count: list.count });
    }
    naming = resolveNaming(
      options.naming,
      renamedTokens,
      Array.from(solverLists.values()),
      reserved,
    );
    if (naming !== undefined) {
      const names = naming.names;
      registry = createNameRegistry({
        universe: stylesheetModel.universe,
        sourceTokens,
        runtimeTokens: scan.runtimeTokens,
        exclusions: options.exclusions,
        hash: function (token: string): string {
          const name = names.get(token);
          if (name !== undefined) return name;
          return hasher(token);
        },
      });
    }
  }
  registry.assertBijection();

  const consolidationVerdicts = computeConsolidationVerdicts(
    listFrequencies,
    stylesheetModel,
    function (token) {
      return registry.nameFor(token) !== undefined;
    },
    { dynamicTokens: scan.dynamicTokens, hash: hasher },
  );

  return {
    registry,
    universe: stylesheetModel.universe,
    sourceTokens,
    renameTokens: scan.renameTokens,
    runtimeTokens: scan.runtimeTokens,
    listFrequencies,
    consolidationVerdicts,
    stylesheet,
    stylesheetModel,
    naming,
    customProperties,
  };
}

export function emptyPrepassResult(): PrepassResult {
  const empty = new Set<string>();
  return {
    registry: createNameRegistry({
      universe: empty,
      sourceTokens: empty,
    }),
    universe: empty,
    sourceTokens: empty,
    renameTokens: empty,
    runtimeTokens: empty,
    listFrequencies: [],
    consolidationVerdicts: [],
    stylesheet: "",
    stylesheetModel: { universe: new Set<string>(), rules: [] },
  };
}
