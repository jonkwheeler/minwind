import { generate, ident, parse, type CssNode } from "css-tree";
import { applySpanEdits, childArray, type SpanEdit } from "./css-util.js";
import { hashClassName, NAME_PATTERN, type NameRegistry } from "./names.js";
import { compareCodeUnits } from "./util.js";

// KTD6 consolidation kernel. U2 freezes these verdicts in the pre-pass; U5
// adds rule synthesis, source-list collapse, and bundle-time re-verification
// on top of this same stylesheet model.

export interface StylesheetRule {
  classes: Array<string>;
  simpleClass: string | undefined;
  inUtilitiesLayer: boolean;
  underConditionalAtRule: boolean;
  nestedRules: boolean;
  nestedAtRules: boolean;
  properties: Array<string>;
  index: number;
  // Present only when the model was built with positions: rule span and the
  // declaration block's inner span (between the braces), for span edits.
  start?: number;
  end?: number;
  blockStart?: number;
  blockEnd?: number;
}

export interface StylesheetModel {
  universe: Set<string>;
  rules: Array<StylesheetRule>;
}

export interface ListFrequency {
  tokens: Array<string>;
  count: number;
}

export type ConsolidationUnsafeReason =
  | "excluded-member"
  | "variant-member"
  | "no-stylesheet-rule"
  | "complex-subject"
  | "outside-utilities-layer"
  | "at-rule-context"
  | "intervening-cascade";

export interface ConsolidationVerdict {
  tokens: Array<string>;
  frequency: number;
  safe: boolean;
  reason?: ConsolidationUnsafeReason;
  // KTD6: the consolidated class name hashes the sorted member list. Present
  // on safe verdicts; the collision policy is enforced separately by
  // assertConsolidatedNames (the registry itself stays closed and immutable).
  name?: string;
  // Member tokens whose stylesheet rules may be removed after the merge: a
  // member is removable only when every source reference to it collapses (no
  // singleton or unsafe list and no partially-dynamic group uses it). Absent
  // on unsafe verdicts; consolidateStylesheet treats a missing list as
  // "keep every member rule" (always safe).
  removableTokens?: Array<string>;
}

// Extra usage knowledge the pre-pass has beyond list frequencies: tokens
// seen in rename groups that are not provably static lists (a dynamic cn()
// argument, a conditional classList object). Their rules must survive
// consolidation because those references never collapse.
export interface ConsolidationUsage {
  dynamicTokens?: ReadonlySet<string>;
  hash?: (token: string) => string;
}

export interface ModelStylesheetOptions {
  positions?: boolean;
  tolerateParseErrors?: boolean;
}

function noop(): void {}

// The canonical identity of a class list: order-insensitive, duplicates
// dropped. Source groups, pre-pass frequencies, and KTD6 naming all key on
// this form so `class="a b"` and `class="b a"` are the same list.
export function canonicalListKey(tokens: ReadonlyArray<string>): string {
  return Array.from(new Set(tokens)).sort(compareCodeUnits).join(" ");
}

function selectorClassTokens(selector: CssNode): Array<string> {
  const tokens: Array<string> = [];
  function descend(node: CssNode): void {
    if (node.type === "ClassSelector" && node.name !== undefined) {
      // ClassSelector.name keeps the source spelling, so `.focus\:underline`
      // must be unescaped back to the candidate token `focus:underline`.
      tokens.push(ident.decode(node.name));
    }
    for (const child of childArray(node)) descend(child);
  }
  descend(selector);
  return tokens;
}

// Parse a built stylesheet into the class universe (every class token seen in
// any selector, including inside @media/@supports/@layer) plus an ordered rule
// model for cascade analysis. Positions and parse-error tolerance default off
// (the pre-pass compiles clean Tailwind output); U5 enables both to plan span
// edits against Lightning-CSS-minified assets.
export function modelStylesheet(
  css: string,
  options?: ModelStylesheetOptions,
): StylesheetModel {
  const positions = options?.positions === true;
  const ast = parse(css, {
    positions,
    onParseError: options?.tolerateParseErrors === true ? noop : undefined,
  });
  const universe = new Set<string>();
  const rules: Array<StylesheetRule> = [];
  let ruleIndex = 0;

  function visit(
    node: CssNode,
    layers: Array<string>,
    conditionalDepth: number,
  ): void {
    if (node.type === "Atrule") {
      const name = node.name ?? "";
      // Keyframe blocks hold percentage rules, not class rules; their
      // declarations must not participate in cascade analysis.
      if (name.endsWith("keyframes")) return;
      const nextLayers =
        name === "layer" && node.prelude != null
          ? layers.concat(generate(node.prelude).trim())
          : layers;
      const nextConditional =
        name === "media" || name === "supports"
          ? conditionalDepth + 1
          : conditionalDepth;
      if (node.block != null) {
        for (const child of childArray(node.block)) {
          visit(child, nextLayers, nextConditional);
        }
      }
      return;
    }
    if (node.type === "Rule") {
      const selectors =
        node.prelude != null && node.prelude.type === "SelectorList"
          ? childArray(node.prelude)
          : [];
      const classes: Array<string> = [];
      let simpleClass: string | undefined;
      if (selectors.length === 1) {
        const parts = childArray(selectors[0]);
        if (
          parts.length === 1 &&
          parts[0].type === "ClassSelector" &&
          parts[0].name !== undefined
        ) {
          simpleClass = ident.decode(parts[0].name);
        }
      }
      for (const selector of selectors) {
        for (const token of selectorClassTokens(selector)) {
          if (!classes.includes(token)) classes.push(token);
          universe.add(token);
        }
      }
      const properties: Array<string> = [];
      let nestedRules = false;
      let nestedAtRules = false;
      if (node.block != null) {
        for (const child of childArray(node.block)) {
          if (child.type === "Declaration" && child.property !== undefined) {
            properties.push(child.property);
          } else if (child.type === "Rule") {
            nestedRules = true;
          } else if (child.type === "Atrule") {
            nestedAtRules = true;
          } else if (child.type === "Raw") {
            // css-tree does not parse nested rules inside declaration blocks:
            // Tailwind v4's native-nesting output (`.x { &:focus { } }`,
            // `.x { :where(& > ...) { } }`) arrives as Raw text. Such rules
            // are conditional or complex-subject, never plain.
            const text = (child.value ?? "").trim();
            if (text.startsWith("@")) nestedAtRules = true;
            else if (text !== "") nestedRules = true;
          }
        }
      }
      const index = ruleIndex;
      ruleIndex += 1;
      const modeled: StylesheetRule = {
        classes,
        simpleClass,
        inUtilitiesLayer: layers.includes("utilities"),
        underConditionalAtRule: conditionalDepth > 0,
        nestedRules,
        nestedAtRules,
        properties,
        index,
      };
      if (positions && node.loc != null) {
        modeled.start = node.loc.start.offset;
        modeled.end = node.loc.end.offset;
        if (node.block != null && node.block.loc != null) {
          // The Block location covers the braces; the declarations live
          // strictly between them.
          modeled.blockStart = node.block.loc.start.offset + 1;
          modeled.blockEnd = node.block.loc.end.offset - 1;
        }
      }
      rules.push(modeled);
      // Nested style rules (native CSS nesting) also contribute to the
      // universe, so keep descending.
      if (node.block != null) {
        for (const child of childArray(node.block)) {
          if (child.type === "Rule" || child.type === "Atrule") {
            visit(child, layers, conditionalDepth);
          }
        }
      }
      return;
    }
    for (const child of childArray(node))
      visit(child, layers, conditionalDepth);
  }

  visit(ast, [], 0);
  return { universe, rules };
}

function judgeList(
  tokens: Array<string>,
  frequency: number,
  model: StylesheetModel,
  isRenameable: (token: string) => boolean,
): ConsolidationVerdict {
  function unsafe(reason: ConsolidationUnsafeReason): ConsolidationVerdict {
    return { tokens, frequency, safe: false, reason };
  }

  // A member outside the registry keeps its original bytes, so the list can
  // never collapse into one shared renamed rule.
  for (const token of tokens) {
    if (!isRenameable(token)) return unsafe("excluded-member");
  }
  // A variant member's declarations apply under a pseudo-class or media
  // query; folding them into one unconditional rule would apply them at rest
  // (R3).
  for (const token of tokens) {
    if (token.includes(":")) return unsafe("variant-member");
  }

  const memberRules: Array<StylesheetRule> = [];
  for (const token of tokens) {
    const simples: Array<StylesheetRule> = [];
    let hasAnyRule = false;
    for (const rule of model.rules) {
      if (rule.simpleClass === token) simples.push(rule);
      if (rule.classes.includes(token)) hasAnyRule = true;
    }
    if (simples.length === 0) {
      // Complex-subject utilities (space-y, divide) compile to selectors with
      // combinators; they are unmergeable per R3.
      return unsafe(hasAnyRule ? "complex-subject" : "no-stylesheet-rule");
    }
    if (simples.length > 1) return unsafe("complex-subject");
    const rule = simples[0];
    // The build emits native nesting, so a simple top-level selector can
    // still hide conditional declarations: `.space-y-4 { :where(& > ...) }`.
    if (rule.nestedAtRules) return unsafe("at-rule-context");
    if (rule.nestedRules) return unsafe("complex-subject");
    memberRules.push(rule);
  }

  for (const rule of memberRules) {
    if (rule.underConditionalAtRule) return unsafe("at-rule-context");
    // KTD6: merges happen only within the utilities layer.
    if (!rule.inUtilitiesLayer) return unsafe("outside-utilities-layer");
  }

  // The shared rule takes the earliest merged position, so no rule sitting
  // between the earliest and latest member may declare a merged property —
  // otherwise the merge flips the cascade against that intervening rule.
  const positions: Array<number> = [];
  const mergedProperties = new Set<string>();
  for (const rule of memberRules) {
    positions.push(rule.index);
    for (const property of rule.properties) mergedProperties.add(property);
  }
  const first = Math.min.apply(null, positions);
  const last = Math.max.apply(null, positions);
  const memberIndexes = new Set(positions);
  for (const rule of model.rules) {
    if (rule.index <= first || rule.index >= last) continue;
    if (memberIndexes.has(rule.index)) continue;
    for (const property of rule.properties) {
      if (mergedProperties.has(property)) return unsafe("intervening-cascade");
    }
  }

  return { tokens, frequency, safe: true };
}

// Only lists seen more than once are consolidation candidates (KTD6), and
// only lists of two or more tokens — a single-token "merge" would duplicate
// what rename already does while evicting the member rule its registry name
// is asserted to occupy (U4's presence check).
export function computeConsolidationVerdicts(
  lists: ReadonlyArray<ListFrequency>,
  model: StylesheetModel,
  isRenameable: (token: string) => boolean,
  usage?: ConsolidationUsage,
): Array<ConsolidationVerdict> {
  const candidates: Array<ListFrequency> = [];
  for (const list of lists) {
    if (list.count > 1 && list.tokens.length > 1) candidates.push(list);
  }
  candidates.sort(function (a, b) {
    return compareCodeUnits(a.tokens.join(" "), b.tokens.join(" "));
  });
  const verdicts: Array<ConsolidationVerdict> = [];
  for (const list of candidates) {
    // Verdict tokens are canonicalized (sorted, deduplicated) so a verdict's
    // identity never depends on the caller's spelling of the list.
    const tokens = Array.from(new Set(list.tokens)).sort(compareCodeUnits);
    verdicts.push(judgeList(tokens, list.count, model, isRenameable));
  }

  // Member removability: a member rule may be deleted only when every source
  // reference to the member collapses — i.e. the member appears in no
  // recorded list that fails to consolidate (singletons, unsafe groups) and
  // in no partially-dynamic rename group (cn('mb-16', props.class)).
  const verdictByKey = new Map<string, ConsolidationVerdict>();
  for (const verdict of verdicts) {
    verdictByKey.set(canonicalListKey(verdict.tokens), verdict);
  }
  for (const verdict of verdicts) {
    if (!verdict.safe) continue;
    verdict.name = (usage?.hash ?? hashClassName)(
      canonicalListKey(verdict.tokens),
    );
    const removable: Array<string> = [];
    for (const member of verdict.tokens) {
      if (usage?.dynamicTokens?.has(member) === true) continue;
      let collapsesEverywhere = true;
      for (const list of lists) {
        if (!list.tokens.includes(member)) continue;
        const other = verdictByKey.get(canonicalListKey(list.tokens));
        if (other === undefined || !other.safe) {
          collapsesEverywhere = false;
          break;
        }
      }
      if (collapsesEverywhere) removable.push(member);
    }
    verdict.removableTokens = removable;
  }
  return verdicts;
}

// ---------------------------------------------------------------------------
// U5: shared-rule synthesis, name registration, and re-verification.
//
// Consolidated-name registration lives here, not inside the registry: the
// pre-pass freezes names into the verdicts (computeConsolidationVerdicts),
// and assertConsolidatedNames enforces the KTD5 collision policy over the
// union of registry names, registry tokens, excluded names, and consolidated
// names. The registry object stays closed and immutable, so its own
// bijection assertion keeps passing unmodified; U6 calls
// assertConsolidatedNames once right after the pre-pass so the full name
// space is proven disjoint before any transform runs.

export function assertConsolidatedNames(
  registry: NameRegistry,
  verdicts: ReadonlyArray<ConsolidationVerdict>,
): void {
  const ownerByName = new Map<string, string>();
  for (const verdict of verdicts) {
    if (!verdict.safe) continue;
    const name = verdict.name;
    if (name === undefined) {
      throw new Error(
        "minwind: safe consolidation verdict for" +
          ` "${verdict.tokens.join(" ")}" has no consolidated name`,
      );
    }
    if (!NAME_PATTERN.test(name)) {
      throw new Error(
        `minwind: consolidated name "${name}" for` +
          ` "${verdict.tokens.join(" ")}" is not a valid CSS identifier` +
          ` (must match ${NAME_PATTERN})`,
      );
    }
    const renamedOwner = registry.tokenFor(name);
    if (renamedOwner !== undefined) {
      throw new Error(
        `minwind: name collision: consolidated name "${name}" for` +
          ` "${verdict.tokens.join(" ")}" equals the generated name for` +
          ` "${renamedOwner}"; increase naming.length`,
      );
    }
    for (const entry of registry.entries()) {
      if (entry.token === name) {
        throw new Error(
          `minwind: name collision: consolidated name "${name}" for` +
            ` "${verdict.tokens.join(" ")}" equals the registry class` +
            ` "${entry.token}"; increase naming.length`,
        );
      }
    }
    for (const exclusion of registry.exclusions()) {
      if (exclusion.token === name) {
        throw new Error(
          `minwind: name collision: consolidated name "${name}" for` +
            ` "${verdict.tokens.join(" ")}" equals the excluded class` +
            ` "${name}"; increase naming.length`,
        );
      }
    }
    const key = canonicalListKey(verdict.tokens);
    const existing = ownerByName.get(name);
    if (existing !== undefined && existing !== key) {
      throw new Error(
        `minwind: name collision: "${existing}" and "${key}" both hash` +
          ` to consolidated name "${name}"; increase naming.length`,
      );
    }
    ownerByName.set(name, key);
  }
}

function consolidationDivergence(fileName: string, detail: string): Error {
  return new Error(
    `minwind: ${fileName}: consolidation divergence (R10): ${detail}`,
  );
}

// The declaration bytes of a positioned member rule, normalized to carry no
// trailing semicolon so merged blocks join with exactly one separator.
function declarationText(css: string, rule: StylesheetRule): string {
  if (rule.blockStart === undefined || rule.blockEnd === undefined) {
    throw new Error(
      "minwind: internal error: member rule has no declaration span",
    );
  }
  let text = css.slice(rule.blockStart, rule.blockEnd);
  while (text.endsWith(";")) text = text.slice(0, -1);
  return text;
}

export interface ConsolidatedRuleInfo {
  name: string;
  tokens: Array<string>;
  removedTokens: Array<string>;
  keptTokens: Array<string>;
}

export interface ConsolidateStylesheetOptions {
  // The RENAMED stylesheet (U4's output): member rules are located by their
  // already-short registry names (KTD6 sequences consolidation after rename).
  css: string;
  verdicts: ReadonlyArray<ConsolidationVerdict>;
  registry: NameRegistry;
  fileName?: string;
}

export interface ConsolidateStylesheetResult {
  css: string;
  consolidated: Array<ConsolidatedRuleInfo>;
}

interface MemberRule {
  token: string;
  renamedName: string;
  rule: StylesheetRule;
}

interface SpanPlan {
  start: number;
  end: number;
  shared: Array<string>;
  keepOriginal: boolean;
  remove: boolean;
}

// Merges each safe verdict's member rules into one shared rule at the
// group's earliest member position and deletes the removable member rules.
// Before planning any edit, every safe verdict is re-judged against this
// stylesheet; a frozen-safe verdict that no longer judges safe is a shape
// divergence and fails loudly (R10) rather than shipping a mis-merge.
export function consolidateStylesheet(
  options: ConsolidateStylesheetOptions,
): ConsolidateStylesheetResult {
  const { css, verdicts, registry } = options;
  const fileName = options.fileName ?? "stylesheet";
  assertConsolidatedNames(registry, verdicts);

  const safeVerdicts = verdicts.filter(function (verdict) {
    return verdict.safe;
  });
  if (safeVerdicts.length === 0) return { css, consolidated: [] };

  const model = modelStylesheet(css, {
    positions: true,
    tolerateParseErrors: true,
  });

  interface PlannedGroup {
    verdict: ConsolidationVerdict;
    name: string;
    members: Array<MemberRule>;
  }
  const groups: Array<PlannedGroup> = [];
  for (const verdict of safeVerdicts) {
    const renamedTokens: Array<string> = [];
    for (const token of verdict.tokens) {
      const renamedName = registry.nameFor(token);
      if (renamedName === undefined) {
        throw new Error(
          `minwind: ${fileName}: internal error: safe verdict member` +
            ` "${token}" is not in the registry`,
        );
      }
      renamedTokens.push(renamedName);
    }
    const verdictName = verdict.name;
    if (verdictName === undefined) {
      throw new Error(
        `minwind: ${fileName}: internal error: safe verdict for` +
          ` "${verdict.tokens.join(" ")}" has no consolidated name`,
      );
    }
    const rejudged = judgeList(
      renamedTokens,
      verdict.frequency,
      model,
      function () {
        return true;
      },
    );
    if (!rejudged.safe) {
      throw consolidationDivergence(
        fileName,
        `frozen verdict for "${verdict.tokens.join(" ")}" was safe in the` +
          ` pre-pass but judges "${rejudged.reason ?? "unsafe"}" against the` +
          " renamed stylesheet",
      );
    }
    const members: Array<MemberRule> = [];
    for (let index = 0; index < verdict.tokens.length; index += 1) {
      const renamedName = renamedTokens[index];
      const rule = model.rules.find(function (candidate) {
        return candidate.simpleClass === renamedName;
      });
      if (
        rule === undefined ||
        rule.start === undefined ||
        rule.end === undefined
      ) {
        throw consolidationDivergence(
          fileName,
          `member rule for "${verdict.tokens[index]}" (renamed` +
            ` "${renamedName}") has no positioned simple rule`,
        );
      }
      members.push({ token: verdict.tokens[index], renamedName, rule });
    }
    members.sort(function (a, b) {
      return (a.rule.start ?? 0) - (b.rule.start ?? 0);
    });
    groups.push({ verdict, name: verdictName, members });
  }

  // Deterministic processing order: by earliest member position, then name.
  groups.sort(function (a, b) {
    const left = a.members[0].rule.start ?? 0;
    const right = b.members[0].rule.start ?? 0;
    if (left !== right) return left - right;
    return compareCodeUnits(a.name, b.name);
  });

  const plans = new Map<string, SpanPlan>();
  function planKey(rule: StylesheetRule): string {
    return `${rule.start ?? 0}:${rule.end ?? 0}`;
  }
  function planFor(rule: StylesheetRule): SpanPlan {
    const start = rule.start ?? 0;
    const end = rule.end ?? 0;
    const key = planKey(rule);
    let plan = plans.get(key);
    if (plan === undefined) {
      plan = { start, end, shared: [], keepOriginal: false, remove: false };
      plans.set(key, plan);
    }
    return plan;
  }

  const consolidated: Array<ConsolidatedRuleInfo> = [];
  for (const group of groups) {
    const declarations: Array<string> = [];
    for (const member of group.members) {
      declarations.push(declarationText(css, member.rule));
    }
    const sharedRule =
      `.${ident.encode(group.name)}{` + declarations.join(";") + "}";
    const removable = new Set(group.verdict.removableTokens ?? []);
    const isRemovable = function (member: MemberRule): boolean {
      return removable.has(member.token);
    };

    // The shared rule takes the earliest merged position (KTD6); when that
    // member's own rule must survive, the shared rule lands just before it.
    // Member removability is a global per-token property, so a span another
    // group already claimed as its merge point is never deleted out from
    // under it — the original member rule is gone either way.
    const earliest = group.members[0];
    const earliestPlan = planFor(earliest.rule);
    earliestPlan.shared.push(sharedRule);
    if (!isRemovable(earliest)) earliestPlan.keepOriginal = true;
    for (const member of group.members) {
      if (member === earliest) continue;
      if (!isRemovable(member)) continue;
      const key = planKey(member.rule);
      if (plans.has(key)) continue;
      planFor(member.rule).remove = true;
    }

    consolidated.push({
      name: group.name,
      tokens: [...group.verdict.tokens],
      removedTokens: group.members
        .filter(isRemovable)
        .map(function (member) {
          return member.token;
        })
        .sort(compareCodeUnits),
      keptTokens: group.members
        .filter(function (member) {
          return !isRemovable(member);
        })
        .map(function (member) {
          return member.token;
        })
        .sort(compareCodeUnits),
    });
  }

  const edits: Array<SpanEdit> = [];
  for (const plan of plans.values()) {
    if (plan.shared.length === 0 && !plan.remove) continue;
    const original = css.slice(plan.start, plan.end);
    edits.push({
      start: plan.start,
      end: plan.end,
      expected: original,
      replacement: plan.shared.join("") + (plan.keepOriginal ? original : ""),
    });
  }

  const output = applySpanEdits(css, edits, fileName);
  // The merged output must parse back cleanly; my edits are the only new
  // bytes, so a hard parse failure here is an internal error, never shipped.
  try {
    parse(output, { onParseError: noop });
  } catch (cause) {
    throw new Error(
      `minwind: ${fileName}: consolidated stylesheet failed to re-parse:` +
        ` ${String(cause)}`,
      { cause },
    );
  }
  return { css: output, consolidated };
}

// Bundle-time re-verification (KTD3, R10). emittedCss must be the stylesheet
// exactly as the bundler emitted it — before rename and consolidation — so
// the frozen verdicts' original tokens judge against their original rules.
// U6 keeps the original asset bytes and calls this after consolidation; any
// divergence between the pre-pass-compiled stylesheet and the emitted one
// (Lightning CSS reshaping, Tailwind drift) fails the build loudly.
//
// The comparison is decision-level and asymmetric: a frozen-safe verdict
// must still judge safe against the emitted stylesheet, while a frozen
// unsafe verdict may rejudge either way. The unsafe REASON is diagnostic —
// judgeList returns the first disqualifier it reaches, and the emitted
// stylesheet legitimately differs in shape from the pre-pass compile
// (Lightning CSS flattens native nesting, so a complex-subject member can
// reach the intervening-cascade check instead). A safe→unsafe flip is the
// dangerous direction (a merge the emitted cascade forbids) and fails the
// build; unsafe→safe only means a merge opportunity the frozen verdict
// already declined, which ships correct output, so it passes silently.
export function verifyConsolidation(
  emittedCss: string,
  verdicts: ReadonlyArray<ConsolidationVerdict>,
  registry: NameRegistry,
  fileName?: string,
): void {
  const name = fileName ?? "stylesheet";
  assertConsolidatedNames(registry, verdicts);
  const model = modelStylesheet(emittedCss, { tolerateParseErrors: true });
  for (const frozen of verdicts) {
    const rejudged = judgeList(
      frozen.tokens,
      frozen.frequency,
      model,
      function (token) {
        return registry.nameFor(token) !== undefined;
      },
    );
    if (frozen.safe && !rejudged.safe) {
      throw consolidationDivergence(
        name,
        `verdict for "${frozen.tokens.join(" ")}" diverged: pre-pass froze` +
          " safe, the emitted stylesheet judges" +
          ` unsafe (${rejudged.reason ?? "?"})`,
      );
    }
  }
}
