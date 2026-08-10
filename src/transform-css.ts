import { ident, parse, type CssNode } from "css-tree";
import { applySpanEdits, childArray, type SpanEdit } from "./css-util.js";
import type { NameRegistry, RegistryEntry } from "./names.js";
import { compareCodeUnits } from "./util.js";

// U4 stylesheet transform (KTD2, KTD7): the pure function the Vite plugin's
// enforce-post generateBundle hook calls per emitted CSS asset. Renames class
// selectors to exactly the registry's names via span edits against the
// original bytes — the output is never reserialized, because css-tree's
// generate() is not byte-faithful on real Lightning CSS output. The
// qualification gate runs before any edit is applied and all post-edit
// assertions throw, so a divergent stylesheet fails the build instead of
// shipping half-renamed CSS (R10).

export interface TransformCssOptions {
  css: string;
  registry: NameRegistry;
  fileName?: string;
}

export type CssTransformWarningKind = "mixed-compound-skipped";

export interface CssTransformWarning {
  kind: CssTransformWarningKind;
  fileName: string;
  // The arm's original source text, for the exclusion report.
  selector: string;
  registryTokens: Array<string>;
  message: string;
}

export interface TransformCssResult {
  css: string;
  warnings: Array<CssTransformWarning>;
  // The token->name pairs actually renamed in this asset, sorted by token.
  // U6 can aggregate these across assets as a coverage cross-check next to
  // assertPresence.
  renamed: Array<RegistryEntry>;
}

function divergence(fileName: string, detail: string): Error {
  return new Error(
    `minwind: ${fileName}: stylesheet shape divergence (R10): ${detail}`,
  );
}

// The top-level parse tolerates css-tree's recoverable grammar gaps: real
// Tailwind v4 + Lightning CSS output triggers them in base-layer selectors
// (`abbr:where([title])`, `::-webkit-datetime-edit` lists) and around nested
// rules. Structural decodability is enforced by the qualification gate
// instead of the parse-error count.
function parseStylesheet(css: string, fileName: string): CssNode {
  try {
    return parse(css, {
      positions: true,
      onParseError: function () {},
    });
  } catch (cause) {
    throw new Error(
      `minwind: ${fileName}: stylesheet failed to parse: ${String(cause)}`,
      { cause },
    );
  }
}

// css-tree 3.2.1 does not parse nested rules whose selector does not start
// with `&` inside a declaration block: they arrive as opaque Raw nodes (e.g.
// Tailwind's `.space-y-4 { :where(& > :not(:last-child)) { ... } }`). A Raw
// node must itself parse cleanly as a rule fragment, otherwise selector
// content is undecodable and the gate fails per R10.
function parseRawFragment(
  value: string,
  fileName: string,
  offset: number,
): CssNode {
  const errors: Array<string> = [];
  const ast = parse(value, {
    positions: true,
    onParseError: function (error) {
      errors.push(`${error.line}:${error.column} ${error.message}`);
    },
  });
  if (errors.length > 0) {
    throw divergence(
      fileName,
      `undecodable nested rule content at offset ${offset}: ${errors.join("; ")}`,
    );
  }
  return ast;
}

// Deep class-selector collection in document order: an arm's class tokens
// include marker references nested inside pseudo-class arguments (`.group`
// inside `:where(...)`), which rename alongside the candidate (KTD2).
function collectClassNodes(node: CssNode, out: Array<CssNode>): void {
  if (node.type === "ClassSelector") out.push(node);
  for (const child of childArray(node)) collectClassNodes(child, out);
}

// Qualification gate (R10): runs over the whole stylesheet before any edit
// is applied. Requires fully decodable selectors: every rule has a
// SelectorList prelude with positions, every class selector carries a
// position and a name, and every Raw node parses as a rule fragment. The
// block-form `@layer utilities` requirement (the Tailwind v4 shape KTD2
// renames within) applies only when the asset's selectors reference registry
// classes: a build may emit CSS assets with no Tailwind content at all
// (Vite cssCodeSplit), and those are not Tailwind-shaped by definition.
function assertQualified(
  ast: CssNode,
  css: string,
  fileName: string,
  registry: NameRegistry,
): void {
  let utilitiesLayer = false;
  let referencesRegistry = false;

  function visit(node: CssNode, text: string, base: number): void {
    if (node.type === "Atrule") {
      const name = node.name ?? "";
      // Keyframe blocks hold percentage rules, not class selectors.
      if (name.endsWith("keyframes")) return;
      if (name === "layer" && node.block != null && node.prelude?.loc != null) {
        const prelude = text
          .slice(
            base + node.prelude.loc.start.offset,
            base + node.prelude.loc.end.offset,
          )
          .trim();
        if (prelude === "utilities") utilitiesLayer = true;
      }
      if (node.block != null) {
        for (const child of childArray(node.block)) visit(child, text, base);
      }
      return;
    }
    if (node.type === "Rule") {
      const prelude = node.prelude;
      if (
        prelude == null ||
        prelude.type !== "SelectorList" ||
        prelude.loc == null ||
        node.loc == null ||
        node.block == null
      ) {
        throw divergence(
          fileName,
          `rule at offset ${base + (node.loc?.start.offset ?? 0)} has an` +
            ` undecodable selector prelude`,
        );
      }
      for (const selector of childArray(prelude)) {
        if (selector.type !== "Selector" || selector.loc == null) {
          throw divergence(
            fileName,
            `selector arm at offset ${base + prelude.loc.start.offset} is` +
              ` not a decodable Selector`,
          );
        }
        const classNodes: Array<CssNode> = [];
        collectClassNodes(selector, classNodes);
        for (const classNode of classNodes) {
          if (classNode.loc == null || typeof classNode.name !== "string") {
            throw divergence(
              fileName,
              `class selector at offset ${base + selector.loc.start.offset}` +
                ` carries no position or name`,
            );
          }
          if (registry.nameFor(ident.decode(classNode.name)) !== undefined) {
            referencesRegistry = true;
          }
        }
      }
      for (const child of childArray(node.block)) visit(child, text, base);
      return;
    }
    if (node.type === "Raw") {
      const value = node.value ?? "";
      if (value.trim() === "" || node.loc == null) return;
      const rawStart = base + node.loc.start.offset;
      if (text.slice(node.loc.start.offset, node.loc.end.offset) !== value) {
        throw divergence(
          fileName,
          `Raw node span at offset ${rawStart} does not match its content`,
        );
      }
      const fragment = parseRawFragment(value, fileName, rawStart);
      for (const child of childArray(fragment)) visit(child, value, rawStart);
      return;
    }
  }

  for (const child of childArray(ast)) visit(child, css, 0);

  // The Tailwind v4 shape is required only of assets whose selectors carry
  // registry classes; an asset with none (a split bundle's non-Tailwind
  // chunk) has nothing to rename and skips the layer check.
  if (referencesRegistry && !utilitiesLayer) {
    throw divergence(
      fileName,
      "no @layer utilities block found; the emitted stylesheet does not" +
        " match the expected Tailwind v4 shape",
    );
  }
}

interface EditContext {
  registry: NameRegistry;
  fileName: string;
  warnings: Array<CssTransformWarning>;
  renamed: Map<string, string>;
}

interface ArmInfo {
  node: CssNode;
  // Class nodes in document order, collected once at analysis time and
  // reused by armNameEdits (the AST is never mutated between the phases).
  classNodes: Array<CssNode>;
  tokens: Array<string>;
  // Every class token is in the registry: the arm renames.
  qualifying: boolean;
  // Some but not all tokens are in the registry: the arm keeps its original
  // bytes with a warning (renaming only part of a compound would silently
  // change what it matches).
  mixed: boolean;
}

function analyzeArm(selector: CssNode, registry: NameRegistry): ArmInfo {
  const classNodes: Array<CssNode> = [];
  collectClassNodes(selector, classNodes);
  const tokens: Array<string> = [];
  for (const classNode of classNodes) {
    const token = ident.decode(classNode.name ?? "");
    if (!tokens.includes(token)) tokens.push(token);
  }
  const uniqueRegistryCount = tokens.filter(function (token) {
    return registry.nameFor(token) !== undefined;
  }).length;
  return {
    node: selector,
    classNodes,
    tokens,
    qualifying: tokens.length > 0 && uniqueRegistryCount === tokens.length,
    mixed:
      tokens.length > 0 &&
      uniqueRegistryCount > 0 &&
      uniqueRegistryCount < tokens.length,
  };
}

// A ClassSelector location starts at the dot and ends after the identifier,
// so the renamed span is [start + 1, end). Decode/encode are kept symmetric
// (css-tree's spec-compliant pair) even though registry names match
// [a-z][a-z0-9]* and encode is the identity on them.
function armNameEdits(
  arm: ArmInfo,
  text: string,
  base: number,
  ctx: EditContext,
): Array<SpanEdit> {
  const edits: Array<SpanEdit> = [];
  for (const classNode of arm.classNodes) {
    const loc = classNode.loc;
    const rawName = classNode.name;
    if (loc == null || rawName === undefined) {
      throw divergence(
        ctx.fileName,
        "class selector lost its position between the gate and editing",
      );
    }
    const token = ident.decode(rawName);
    const name = ctx.registry.nameFor(token);
    if (name === undefined) {
      throw new Error(
        `minwind: ${ctx.fileName}: internal error: qualifying arm` +
          ` contains non-registry token "${token}"`,
      );
    }
    const expected = text.slice(loc.start.offset + 1, loc.end.offset);
    if (expected !== rawName) {
      throw divergence(
        ctx.fileName,
        `class selector span at offset ${base + loc.start.offset} contains` +
          ` "${expected}" but parsed as "${rawName}"`,
      );
    }
    edits.push({
      start: base + loc.start.offset + 1,
      end: base + loc.end.offset,
      expected: rawName,
      replacement: ident.encode(name),
    });
    ctx.renamed.set(token, name);
  }
  return edits;
}

function relativize(
  edits: ReadonlyArray<SpanEdit>,
  origin: number,
): Array<SpanEdit> {
  return edits.map(function (edit) {
    return {
      start: edit.start - origin,
      end: edit.end - origin,
      expected: edit.expected,
      replacement: edit.replacement,
    };
  });
}

function collectRuleEdits(
  rule: CssNode,
  text: string,
  base: number,
  ctx: EditContext,
): Array<SpanEdit> {
  const prelude = rule.prelude;
  const block = rule.block;
  if (
    prelude == null ||
    prelude.loc == null ||
    block == null ||
    block.loc == null ||
    rule.loc == null
  ) {
    throw divergence(ctx.fileName, "rule is missing positions during editing");
  }

  // Nested content (rules, at-rules, Raw fragments) renames independently of
  // the arm decision: `.site-card { .flex { } }` renames `.flex` whether or
  // not `.site-card` itself qualifies.
  const innerEdits = collectContainerEdits(childArray(block), text, base, ctx);

  const arms = childArray(prelude).map(function (selector) {
    return analyzeArm(selector, ctx.registry);
  });
  for (const arm of arms) {
    if (!arm.mixed) continue;
    const selectorText = text.slice(
      arm.node.loc?.start.offset ?? 0,
      arm.node.loc?.end.offset ?? 0,
    );
    const registryTokens = arm.tokens.filter(function (token) {
      return ctx.registry.nameFor(token) !== undefined;
    });
    ctx.warnings.push({
      kind: "mixed-compound-skipped",
      fileName: ctx.fileName,
      selector: selectorText,
      registryTokens,
      message:
        `minwind: ${ctx.fileName}: skipping selector "${selectorText}":` +
        ` it mixes registry classes (${registryTokens.join(", ")}) with` +
        ` non-registry classes, so the arm keeps its original bytes`,
    });
  }

  const qualifying = arms.filter(function (arm) {
    return arm.qualifying;
  });

  // Every arm qualifies: rename in place, preserving the prelude's bytes
  // (commas, whitespace) exactly.
  if (arms.length > 0 && qualifying.length === arms.length) {
    const edits: Array<SpanEdit> = [];
    for (const arm of arms) {
      edits.push(...armNameEdits(arm, text, base, ctx));
    }
    return edits.concat(innerEdits);
  }
  if (qualifying.length === 0) return innerEdits;

  // Mixed rule: split into one rule per arm (semantics-preserving for
  // comma-grouped selectors sharing a block), then rename the qualifying
  // arms. Arm and block bytes come from source slices; the only dropped
  // bytes are the commas between arms.
  const blockText = text.slice(block.loc.start.offset, block.loc.end.offset);
  const renamedBlock = applySpanEdits(
    blockText,
    relativize(innerEdits, base + block.loc.start.offset),
    ctx.fileName,
  );
  const between = text.slice(prelude.loc.end.offset, block.loc.start.offset);
  const parts = arms.map(function (arm) {
    const armLoc = arm.node.loc;
    if (armLoc == null) {
      throw divergence(ctx.fileName, "selector arm lost its position");
    }
    const armText = text.slice(armLoc.start.offset, armLoc.end.offset);
    const renamedArm = arm.qualifying
      ? applySpanEdits(
          armText,
          relativize(
            armNameEdits(arm, text, base, ctx),
            base + armLoc.start.offset,
          ),
          ctx.fileName,
        )
      : armText;
    return renamedArm + between + renamedBlock;
  });
  let replacement = parts[0];
  for (let index = 1; index < parts.length; index += 1) {
    const previousLoc = arms[index - 1].node.loc;
    const armLoc = arms[index].node.loc;
    if (previousLoc == null || armLoc == null) {
      throw divergence(ctx.fileName, "selector arm lost its position");
    }
    const gap = text.slice(previousLoc.end.offset, armLoc.start.offset);
    // Drop the separating comma but keep any surrounding bytes (whitespace,
    // comments) so the split stays byte-faithful otherwise.
    const comma = gap.lastIndexOf(",");
    if (comma === -1) {
      throw divergence(
        ctx.fileName,
        `selector list gap "${gap}" contains no comma`,
      );
    }
    replacement += gap.slice(0, comma) + gap.slice(comma + 1) + parts[index];
  }
  return [
    {
      start: base + rule.loc.start.offset,
      end: base + rule.loc.end.offset,
      expected: text.slice(rule.loc.start.offset, rule.loc.end.offset),
      replacement,
    },
  ];
}

function collectContainerEdits(
  children: ReadonlyArray<CssNode>,
  text: string,
  base: number,
  ctx: EditContext,
): Array<SpanEdit> {
  const edits: Array<SpanEdit> = [];
  for (const node of children) {
    if (node.type === "Atrule") {
      const name = node.name ?? "";
      if (name.endsWith("keyframes")) continue;
      if (node.block != null) {
        edits.push(
          ...collectContainerEdits(childArray(node.block), text, base, ctx),
        );
      }
      continue;
    }
    if (node.type === "Rule") {
      edits.push(...collectRuleEdits(node, text, base, ctx));
      continue;
    }
    if (node.type === "Raw") {
      const value = node.value ?? "";
      if (value.trim() === "" || node.loc == null) continue;
      // The gate already strict-parsed every Raw node, so this cannot fail;
      // the offsets are rebased onto the Raw node's position.
      const fragment = parseRawFragment(
        value,
        ctx.fileName,
        base + node.loc.start.offset,
      );
      edits.push(
        ...collectContainerEdits(
          childArray(fragment),
          value,
          base + node.loc.start.offset,
          ctx,
        ),
      );
      continue;
    }
  }
  return edits;
}

// Every class-selector name visible in the given CSS, including inside
// at-rule blocks and Raw nested-rule fragments.
function collectSelectorNames(css: string, out: Set<string>): void {
  const ast = parseStylesheet(css, "stylesheet");
  function visit(node: CssNode): void {
    if (node.type === "Atrule") {
      const name = node.name ?? "";
      if (name.endsWith("keyframes")) return;
      if (node.block != null) {
        for (const child of childArray(node.block)) visit(child);
      }
      return;
    }
    if (node.type === "Rule") {
      if (node.prelude != null) {
        const classNodes: Array<CssNode> = [];
        collectClassNodes(node.prelude, classNodes);
        for (const classNode of classNodes) {
          out.add(ident.decode(classNode.name ?? ""));
        }
      }
      if (node.block != null) {
        for (const child of childArray(node.block)) visit(child);
      }
      return;
    }
    if (node.type === "Raw") {
      const value = node.value ?? "";
      if (value.trim() === "") return;
      // Tolerant here: presence is a cross-asset check U6 runs on transform
      // output, which has already passed the gate's strict Raw parsing.
      try {
        const fragment = parseRawFragment(value, "stylesheet", 0);
        for (const child of childArray(fragment)) visit(child);
      } catch {
        return;
      }
    }
  }
  for (const child of childArray(ast)) visit(child);
}

// Presence assertion (R10): every registry name must appear as a renamed
// class selector in at least one final CSS asset. U6 calls this once across
// all renamed assets: coverage is a bundle-level contract, so a build that
// splits it across several CSS assets (cssCodeSplit) passes where a
// per-asset check would fail loudly.
export function assertPresence(
  registry: NameRegistry,
  renamedCssList: ReadonlyArray<string>,
  fileName?: string,
): void {
  const present = new Set<string>();
  for (const css of renamedCssList) collectSelectorNames(css, present);
  const missing: Array<string> = [];
  for (const entry of registry.entries()) {
    if (!present.has(entry.name)) {
      missing.push(`"${entry.token}" (renamed to "${entry.name}")`);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `minwind: ${fileName ?? "stylesheet"}: presence assertion failed` +
        ` (R10): ${missing.join(", ")} never appear${
          missing.length === 1 ? "s" : ""
        } as a renamed selector in the final CSS`,
    );
  }
}

// Surviving-selector assertion (R10): no class selector in the output may
// still reference a renamed registry token. This walks the parsed output
// rather than scanning text, because a token's characters legitimately
// appear in positions that are not class references: inside another class's
// escaped arbitrary value (`.content-\[\'flex\'\]`, harvested by Tailwind's
// automatic content detection from any file in the repo), inside declaration
// values (`content:"flex"`), or in at-rule preludes. An arm carrying a class
// outside the registry's vocabulary — neither a renamed token nor a
// generated name — kept its original bytes by design (mixed-compound skip,
// or a css-only utility), so only all-registry arms can be survivors.
export function assertNoSurvivingTokens(
  registry: NameRegistry,
  css: string,
  fileName: string,
): void {
  const ast = parseStylesheet(css, fileName);
  const survivors: Array<string> = [];

  function visitArm(selector: CssNode, base: number): void {
    const classNodes: Array<CssNode> = [];
    collectClassNodes(selector, classNodes);
    const tokens = classNodes.map(function (node) {
      return ident.decode(node.name ?? "");
    });
    const foreign = tokens.some(function (token) {
      return (
        registry.nameFor(token) === undefined &&
        registry.tokenFor(token) === undefined
      );
    });
    if (foreign) return;
    for (const classNode of classNodes) {
      const token = ident.decode(classNode.name ?? "");
      if (registry.nameFor(token) === undefined) continue;
      const offset =
        base + (classNode.loc?.start.offset ?? selector.loc?.start.offset ?? 0);
      survivors.push(`"${token}" at offset ${offset}`);
      return;
    }
  }

  function visit(node: CssNode, base: number): void {
    if (node.type === "Atrule") {
      // Keyframe blocks hold percentage rules, not class selectors.
      if ((node.name ?? "").endsWith("keyframes")) return;
      if (node.block != null) {
        for (const child of childArray(node.block)) visit(child, base);
      }
      return;
    }
    if (node.type === "Rule") {
      if (node.prelude != null && node.prelude.type === "SelectorList") {
        for (const selector of childArray(node.prelude))
          visitArm(selector, base);
      }
      if (node.block != null) {
        for (const child of childArray(node.block)) visit(child, base);
      }
      return;
    }
    if (node.type === "Raw") {
      const value = node.value ?? "";
      if (value.trim() === "" || node.loc == null) return;
      const rawStart = base + node.loc.start.offset;
      const fragment = parseRawFragment(value, fileName, rawStart);
      for (const child of childArray(fragment)) visit(child, rawStart);
      return;
    }
  }

  for (const child of childArray(ast)) visit(child, 0);

  if (survivors.length > 0) {
    throw new Error(
      `minwind: ${fileName}: registry token${
        survivors.length === 1 ? "" : "s"
      } ${survivors.join(", ")} survive${
        survivors.length === 1 ? "s" : ""
      } as a class selector in the final CSS (R10)`,
    );
  }
}

// Renames class selectors in one final CSS asset to exactly the registry's
// names. Order of operations per R10: qualify (before any edit), plan edits,
// apply with span verification, then assert the registry bijection and the
// surviving-selector assertion against the output. Per-name presence is
// deliberately not asserted here: it is a cross-asset contract the caller
// enforces with assertPresence over every renamed asset.
export function transformStylesheet(
  options: TransformCssOptions,
): TransformCssResult {
  const { css, registry } = options;
  const fileName = options.fileName ?? "stylesheet";
  const ast = parseStylesheet(css, fileName);
  assertQualified(ast, css, fileName, registry);

  const ctx: EditContext = {
    registry,
    fileName,
    warnings: [],
    renamed: new Map<string, string>(),
  };
  const edits = collectContainerEdits(childArray(ast), css, 0, ctx);
  const output = applySpanEdits(css, edits, fileName);

  registry.assertBijection();
  assertNoSurvivingTokens(registry, output, fileName);

  const renamed = Array.from(ctx.renamed, function ([token, name]) {
    return { token, name };
  }).sort(function (a, b) {
    return compareCodeUnits(a.token, b.token);
  });
  return { css: output, warnings: ctx.warnings, renamed };
}
