import MagicString, { type SourceMap } from "magic-string";
import {
  DECLARATION_PATTERN,
  parseSourceModule,
  SOURCE_MODULE_PATTERN,
  tokenize,
  walkClassContexts,
  type ClassContextKind,
  type ClassContextVisitor,
  type LiteralOccurrence,
  type RenameContextKind,
  type RuntimeContextKind,
} from "./class-contexts.js";
import { canonicalListKey, type ConsolidationVerdict } from "./consolidate.js";
import type { NameRegistry } from "./names.js";
import {
  isSfcModule,
  maskSfcStyleContent,
  SFC_PATTERN,
  walkSfcClassContexts,
} from "./sfc.js";

// U3 source-module transform (KTD1, KTD4): the pure function the Vite
// plugin's enforce-pre transform hook calls per module. Renames class
// literals in exactly the three KTD4 contexts via MagicString span edits
// against the original source, preserving byte fidelity elsewhere (R1, R5).
// Detection-only contexts are never edited; unprovable class positions and
// reverse leaks surface as warnings, never errors (KTD7 — they can fire on
// intentional content strings such as article code samples).

export type TransformWarningKind =
  "unprovable-template" | "unprovable-expression" | "reverse-leak";

export interface TransformWarning {
  kind: TransformWarningKind;
  id: string;
  line: number;
  column: number;
  token?: string;
  message: string;
}

export interface TransformSourceOptions {
  code: string;
  id: string;
  registry: NameRegistry;
  // U5 consolidation (R3): the frozen pre-pass verdicts. A fully-static
  // rename group whose tokens exactly match a safe verdict's list (order-
  // insensitive) collapses to the consolidated name; partially-dynamic
  // groups never collapse and their tokens still rename per R1.
  consolidationVerdicts?: ReadonlyArray<ConsolidationVerdict>;
  // Quote naming: canonical list key -> tokens in quote word order. A
  // fully-static rename group whose canonical key appears is rewritten with
  // its renamed tokens in that order — class order inside an attribute is
  // semantically free, so the DOM reads as the quote. Consolidation wins
  // when both match (a collapsed list has no order to preserve).
  quoteOrder?: ReadonlyMap<string, ReadonlyArray<string>>;
}

export interface TransformSourceResult {
  code: string;
  map: SourceMap;
  warnings: Array<TransformWarning>;
}

export interface SourceEdit {
  start: number;
  end: number;
  expected: string;
  replacement: string;
}

// The KTD1 module filter: src/**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs} plus the
// SFC formats (.vue/.svelte/.astro), node_modules and declaration files
// excluded. Any absolute path with a /src/ segment qualifies; Vite only
// feeds the plugin modules from the app graph. Query-suffixed SFC ids are
// framework-carved sub-modules (?vue&type=script) whose content is a slice
// of the already-transformed main module — only the raw main module
// transforms.
export function shouldTransformModule(id: string): boolean {
  const clean = id.split("?")[0].replace(/\\/g, "/");
  if (clean.includes("node_modules")) return false;
  if (DECLARATION_PATTERN.test(clean)) return false;
  if (SFC_PATTERN.test(clean)) {
    if (id.includes("?")) return false;
    return clean.startsWith("src/") || clean.includes("/src/");
  }
  if (!SOURCE_MODULE_PATTERN.test(clean)) return false;
  return clean.startsWith("src/") || clean.includes("/src/");
}

// Applies span edits against the original source. Every edit's recorded
// content is verified against the raw bytes and edits must not overlap; any
// violation is an internal error that aborts the module loudly (R10) —
// partial output is never produced because the throw happens before any
// result is returned.
export function applySourceEdits(
  code: string,
  id: string,
  edits: ReadonlyArray<SourceEdit>,
): { code: string; map: SourceMap } {
  const ordered = [...edits].sort(function (a, b) {
    return a.start - b.start;
  });
  let previousEnd = 0;
  for (const edit of ordered) {
    if (edit.start < 0 || edit.end > code.length || edit.start > edit.end) {
      throw new Error(
        `minwind: ${id}: span edit out of bounds ${edit.start}..${edit.end}`,
      );
    }
    if (edit.start < previousEnd) {
      throw new Error(
        `minwind: ${id}: overlapping span edits at ${edit.start}..${edit.end}`,
      );
    }
    const actual = code.slice(edit.start, edit.end);
    if (actual !== edit.expected) {
      throw new Error(
        `minwind: ${id}: span mismatch at ${edit.start}..${edit.end}:` +
          ` expected "${edit.expected}", found "${actual}"`,
      );
    }
    previousEnd = edit.end;
  }
  const magic = new MagicString(code);
  for (const edit of ordered) {
    magic.overwrite(edit.start, edit.end, edit.replacement);
  }
  return {
    code: magic.toString(),
    map: magic.generateMap({
      source: id,
      includeContent: true,
      hires: "boundary",
    }),
  };
}

// Whole-word convention shared with tools/minwind: an occurrence counts
// only when the adjacent characters cannot be part of a larger candidate
// token, so `flex` never matches inside `flex-col` or `flexible`.
const CLASSNAME_CHAR = /[A-Za-z0-9\-_:/.[\]%#]/;

function isWholeWord(text: string, start: number, length: number): boolean {
  const before = start > 0 ? text[start - 1] : "";
  const afterIndex = start + length;
  const after = afterIndex < text.length ? text[afterIndex] : "";
  return !CLASSNAME_CHAR.test(before) && !CLASSNAME_CHAR.test(after);
}

// Line/column lookup for SFC modules, whose spans are absolute offsets into
// the raw file and never pass through a TS parse of the whole text.
function lineStartOffsets(text: string): Array<number> {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "\n") starts.push(i + 1);
  }
  return starts;
}

function locateInText(
  starts: Array<number>,
  position: number,
): { line: number; column: number } {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (starts[mid] <= position) low = mid;
    else high = mid - 1;
  }
  return { line: low + 1, column: position - starts[low] + 1 };
}

export function transformSource(
  options: TransformSourceOptions,
): TransformSourceResult | null {
  if (!shouldTransformModule(options.id)) return null;
  return transformModule(options);
}

// The filter-free core: the Vite/webpack plugins gate on shouldTransformModule
// (module-graph ids), while the post-build CLI rewrites emitted .html files
// that live outside any module graph. Everything else — contexts, edits,
// warnings — is identical.
export function transformModule(
  options: TransformSourceOptions,
): TransformSourceResult | null {
  const { code, id, registry } = options;
  const sfc = isSfcModule(id);
  const sourceFile = sfc ? null : parseSourceModule(id, code);
  const lineStarts = sfc ? lineStartOffsets(code) : null;

  const edits = new Map<string, SourceEdit>();
  const warnings: Array<TransformWarning> = [];

  function location(position: number): { line: number; column: number } {
    if (sourceFile !== null) {
      const at = sourceFile.getLineAndCharacterOfPosition(position);
      return { line: at.line + 1, column: at.character + 1 };
    }
    return locateInText(lineStarts ?? [0], position);
  }

  function addEdit(
    start: number,
    end: number,
    expected: string,
    replacement: string,
  ): void {
    const key = `${start}:${end}`;
    // Record the key in every open group BEFORE the dedupe early return: the
    // walk reports a nested cn() literal twice (once through the outer call's
    // argument scan, once through the inner call's own visit), and a
    // collapsing group must withdraw edits its literals added on either
    // report pass — otherwise the surviving per-token edits overlap the
    // collapse span and applySourceEdits throws (R10).
    for (const group of groupStack) group.editKeys.push(key);
    const existing = edits.get(key);
    if (existing !== undefined) {
      // Identical re-edits dedupe, diverging ones are an internal error.
      if (
        existing.expected !== expected ||
        existing.replacement !== replacement
      ) {
        throw new Error(
          `minwind: ${id}: conflicting span edits at ${start}..${end}:` +
            ` "${existing.replacement}" vs "${replacement}"`,
        );
      }
      return;
    }
    edits.set(key, { start, end, expected, replacement });
  }

  // U5 collapse bookkeeping: safe verdicts keyed by canonical (sorted,
  // deduplicated) list; open rename groups stack their literals and the edit
  // keys they added so a collapse can replace them with one span edit.
  const collapseByKey = new Map<string, string>();
  if (options.consolidationVerdicts !== undefined) {
    for (const verdict of options.consolidationVerdicts) {
      if (!verdict.safe) continue;
      if (verdict.name === undefined) {
        throw new Error(
          `minwind: ${id}: safe consolidation verdict for` +
            ` "${verdict.tokens.join(" ")}" has no consolidated name`,
        );
      }
      collapseByKey.set(canonicalListKey(verdict.tokens), verdict.name);
    }
  }
  interface OpenGroup {
    kind: RenameContextKind;
    literals: Array<LiteralOccurrence>;
    editKeys: Array<string>;
    // Per-literal spans of the edit keys it added, so a dynamic group's
    // literal-level quote reorder can withdraw exactly its own per-token
    // edits.
    literalEdits: Array<{ literal: LiteralOccurrence; keys: Array<string> }>;
  }
  const groupStack: Array<OpenGroup> = [];

  function collapseGroup(group: OpenGroup): boolean {
    // class="..." groups hold one literal: rewrite its content span only, so
    // the attribute's own quotes survive. cn() and classList groups can span
    // several literals with different quote styles, so the collapse span
    // runs from the first literal's opening quote through the last literal's
    // closing quote and the replacement is a fresh single-quoted literal.
    const single = group.kind === "class-attribute";
    // That span math assumes quotes: a classList identifier key
    // ({ flex: true }) carries none, so a group containing any unquoted
    // literal never collapses — its per-token renames are always safe.
    for (const literal of group.literals) {
      if (!literal.quoted) return false;
    }
    const first = group.literals[0];
    const last = group.literals[group.literals.length - 1];
    const name = collapseByKey.get(
      canonicalListKey(
        group.literals.flatMap(function (literal) {
          return tokenize(literal.text);
        }),
      ),
    );
    if (name === undefined) return false;
    for (const key of group.editKeys) edits.delete(key);
    const start = single ? first.start : first.start - 1;
    const end = single ? last.end : last.end + 1;
    const replacement = single ? name : `'${name}'`;
    const expected = code.slice(start, end);
    edits.set(`${start}:${end}`, { start, end, expected, replacement });
    return true;
  }

  // Quote-order rewrite (naming 'quotes' strategy): same span math as the
  // collapse, but the replacement is the group's renamed tokens in the
  // quote's word order. classList groups never reorder — object semantics
  // are not string-joinable — and a group keeps its per-token renames
  // whenever the order map or the registry cannot vouch for every token.
  function reorderGroup(group: OpenGroup): boolean {
    if (options.quoteOrder === undefined) return false;
    if (group.kind === "classList-key") return false;
    for (const literal of group.literals) {
      if (!literal.quoted) return false;
    }
    const ordered = options.quoteOrder.get(
      canonicalListKey(
        group.literals.flatMap(function (literal) {
          return tokenize(literal.text);
        }),
      ),
    );
    if (ordered === undefined) return false;
    const names: Array<string> = [];
    for (const token of ordered) {
      const name = registry.nameFor(token);
      if (name === undefined) return false;
      names.push(name);
    }
    for (const key of group.editKeys) edits.delete(key);
    const single = group.kind === "class-attribute";
    const first = group.literals[0];
    const last = group.literals[group.literals.length - 1];
    const start = single ? first.start : first.start - 1;
    const end = single ? last.end : last.end + 1;
    const replacement = single ? names.join(" ") : `'${names.join(" ")}'`;
    const expected = code.slice(start, end);
    edits.set(`${start}:${end}`, { start, end, expected, replacement });
    return true;
  }

  function handleLiteral(literal: LiteralOccurrence): void {
    const raw = code.slice(literal.start, literal.end);
    if (raw !== literal.text) {
      // An escape sequence desynchronizes the AST's cooked text from the raw
      // bytes, so no provable token span exists; fail loudly (R10) rather
      // than diverge from the pre-pass registry.
      throw new Error(
        `minwind: ${id}: class literal at offset ${literal.start} contains` +
          ` escape sequences; refusing to span-edit`,
      );
    }
    for (const match of raw.matchAll(/[^ \t\n\f\r]+/g)) {
      const token = match[0];
      const name = registry.nameFor(token);
      // Skipped tokens (excluded, runtime-only, not in the universe) are not
      // in the registry and stay byte-identical (R5).
      if (name === undefined) continue;
      const start = literal.start + match.index;
      // A shorthand classList key ({ flex }) is both key and value binding:
      // expand it so only the class name is renamed ({ h4sh: flex }).
      const replacement = literal.shorthand ? `${name}: ${token}` : name;
      addEdit(start, start + token.length, token, replacement);
    }
  }

  // Dynamic groups (cn('base', cond && 'extra')) never reorder as a whole —
  // the rendered attribute's token set varies at runtime — but each static
  // string literal is one contiguous run in that attribute, so a literal
  // whose tokens the solver covered reorders in place into its fragment.
  function reorderDynamicLiterals(group: OpenGroup): void {
    if (options.quoteOrder === undefined) return;
    if (group.kind !== "cn-argument") return;
    const done = new Set<string>();
    for (const entry of group.literalEdits) {
      const spanKey = `${entry.literal.start}:${entry.literal.end}`;
      if (done.has(spanKey)) continue;
      const tokens = tokenize(entry.literal.text);
      if (tokens.length < 2) continue;
      const ordered = options.quoteOrder.get(canonicalListKey(tokens));
      if (ordered === undefined) continue;
      const names: Array<string> = [];
      let missing = false;
      for (const token of ordered) {
        const name = registry.nameFor(token);
        if (name === undefined) {
          missing = true;
          break;
        }
        names.push(name);
      }
      if (missing) continue;
      for (const key of entry.keys) edits.delete(key);
      edits.set(spanKey, {
        start: entry.literal.start,
        end: entry.literal.end,
        expected: code.slice(entry.literal.start, entry.literal.end),
        replacement: names.join(" "),
      });
      done.add(spanKey);
    }
  }

  const visitor: ClassContextVisitor = {
    enterRenameGroup: function (kind: RenameContextKind): void {
      groupStack.push({ kind, literals: [], editKeys: [], literalEdits: [] });
    },
    renameLiteral: function (literal: LiteralOccurrence): void {
      const open = groupStack[groupStack.length - 1];
      const before = open !== undefined ? open.editKeys.length : 0;
      handleLiteral(literal);
      if (open !== undefined) {
        open.literals.push(literal);
        open.literalEdits.push({
          literal,
          keys: open.editKeys.slice(before),
        });
      }
    },
    exitRenameGroup: function (
      _kind: RenameContextKind,
      _fullyLiteral: boolean,
      staticList: boolean,
    ): void {
      const group = groupStack.pop();
      if (group === undefined || group.literals.length === 0) return;
      // Only a provably static list may collapse or reorder as a whole (R3);
      // a partially-dynamic group keeps per-token renames except that its
      // static literals may still reorder into quote fragments.
      // Consolidation wins when both match.
      if (staticList) {
        if (!collapseGroup(group)) reorderGroup(group);
      } else {
        reorderDynamicLiterals(group);
      }
    },
    unprovableTemplate: function (node, kind: ClassContextKind): void {
      // No sourceFile argument: in the SFC path the node belongs to the
      // masked script-block parse, whose offsets are already absolute into
      // the file (whitespace masking preserves positions).
      const at = location(node.getStart());
      warnings.push({
        kind: "unprovable-template",
        id,
        line: at.line,
        column: at.column,
        message:
          `minwind: ${id}:${at.line}:${at.column} skipping template literal` +
          ` with expressions in ${kind} position; its class tokens keep` +
          ` their original names`,
      });
    },
    runtimeLiteral: function (
      literal: LiteralOccurrence,
      kind: RuntimeContextKind,
    ): void {
      // Only the unprovable class-position expressions warn here (KTD7);
      // classList-method / className-assignment literals are detection-only
      // by design and stay silent.
      if (kind !== "class-expression" && kind !== "classList-expression") {
        return;
      }
      const at = location(literal.start);
      warnings.push({
        kind: "unprovable-expression",
        id,
        line: at.line,
        column: at.column,
        message:
          `minwind: ${id}:${at.line}:${at.column} skipping unprovable` +
          ` expression in ${kind} position; class tokens in` +
          ` "${literal.text}" keep their original names`,
      });
    },
  };
  if (sourceFile !== null) {
    walkClassContexts(sourceFile, visitor);
  } else {
    walkSfcClassContexts(id, code, visitor);
  }

  // Reverse-leak check (KTD7): whole-word occurrences of registry tokens in
  // the original source that no edit consumed are class names the stylesheet
  // renames but this module keeps — warn with locations, never fail. SFCs
  // scan with <style> contents blanked: a utility word used as a CSS value
  // (display: flex) is not a class reference.
  const leakText = sfc ? maskSfcStyleContent(id, code) : code;
  for (const entry of registry.entries()) {
    let from = 0;
    for (;;) {
      const at = leakText.indexOf(entry.token, from);
      if (at === -1) break;
      from = at + entry.token.length;
      if (!isWholeWord(leakText, at, entry.token.length)) continue;
      let consumed = false;
      for (const edit of edits.values()) {
        if (edit.start <= at && edit.end >= at + entry.token.length) {
          consumed = true;
          break;
        }
      }
      if (consumed) continue;
      const atLocation = location(at);
      warnings.push({
        kind: "reverse-leak",
        id,
        line: atLocation.line,
        column: atLocation.column,
        token: entry.token,
        message:
          `minwind: ${id}:${atLocation.line}:${atLocation.column} registry` +
          ` token "${entry.token}" remains outside a rename context`,
      });
    }
  }

  // Unchanged means no edits AND nothing to report; a warnings-only module
  // still returns so U6 can surface the warnings via this.warn.
  if (edits.size === 0 && warnings.length === 0) return null;
  const applied = applySourceEdits(code, id, Array.from(edits.values()));
  return { code: applied.code, map: applied.map, warnings };
}
