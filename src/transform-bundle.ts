import * as ts from "typescript";
import { parseSourceModule, tokenize } from "./class-contexts.js";
import { canonicalListKey, type ConsolidationVerdict } from "./consolidate.js";
import type { NameRegistry } from "./names.js";
import {
  applySourceEdits,
  type SourceEdit,
  type TransformSourceResult,
  type TransformWarning,
} from "./transform-source.js";

// Conservative post-build bundle pass (the JS half of `minwind apply`).
// Compiled, often-minified bundles no longer carry JSX class contexts, so
// instead of the KTD4 context walk this pass renames registry tokens only
// where a string is provably a class list:
//
//   - class="..." spans inside markup string literals (Solid/Svelte-style
//     compiled templates, escaped-quote bundles included), and
//   - string literal values of class / className object properties
//     (React/Vue jsx-runtime props).
//
// Everything else keeps its bytes. Consolidation collapses and quote
// reordering apply to full-list spans exactly as in the source transform;
// whole-word registry-token occurrences no edit consumed warn (the KTD7
// leak posture) rather than failing.

export interface TransformBundleOptions {
  code: string;
  id: string;
  registry: NameRegistry;
  consolidationVerdicts?: ReadonlyArray<ConsolidationVerdict>;
  quoteOrder?: ReadonlyMap<string, ReadonlyArray<string>>;
}

interface ClassListSpan {
  start: number;
  end: number;
  text: string;
}

// class="..." spans inside a string literal's raw bytes. Three shapes:
// double-quoted, single-quoted (both appear verbatim inside backtick
// templates and opposite-quoted strings), and backslash-escaped double
// quotes (compiled templates inside double-quoted strings). The escaped
// shape refuses content containing backslashes, so cooked/raw desync can
// never shift a token span.
const CLASS_ATTR_SHAPES: ReadonlyArray<{ pattern: RegExp; prefix: number }> = [
  { pattern: /class="([^"]*)"/g, prefix: 'class="'.length },
  { pattern: /class='([^']*)'/g, prefix: "class='".length },
  { pattern: /class=\\"([^"\\]*)\\"/g, prefix: 'class=\\"'.length },
];

function markupClassSpans(
  code: string,
  contentStart: number,
  contentEnd: number,
): Array<ClassListSpan> {
  const raw = code.slice(contentStart, contentEnd);
  const found: Array<ClassListSpan> = [];
  for (const shape of CLASS_ATTR_SHAPES) {
    shape.pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = shape.pattern.exec(raw)) !== null) {
      const start = contentStart + match.index + shape.prefix;
      found.push({ start, end: start + match[1].length, text: match[1] });
    }
  }
  // The shapes can overlap on pathological nesting (class="a 'b' c" sees no
  // second match, but class='x class="y" z' in a template would); first span
  // by offset wins and later overlaps drop, never throwing on a bundle.
  found.sort(function (a, b) {
    return a.start - b.start;
  });
  const spans: Array<ClassListSpan> = [];
  let covered = -1;
  for (const span of found) {
    if (span.start < covered) continue;
    spans.push(span);
    covered = span.end;
  }
  return spans;
}

// Whole-word convention shared with the source transform: an occurrence
// counts only when the adjacent characters cannot be part of a larger
// candidate token.
const CLASSNAME_CHAR = /[A-Za-z0-9\-_:/.[\]%#]/;

function isWholeWord(text: string, start: number, length: number): boolean {
  const before = start > 0 ? text[start - 1] : "";
  const afterIndex = start + length;
  const after = afterIndex < text.length ? text[afterIndex] : "";
  return !CLASSNAME_CHAR.test(before) && !CLASSNAME_CHAR.test(after);
}

export function transformBundle(
  options: TransformBundleOptions,
): TransformSourceResult | null {
  const { code, id, registry } = options;
  const sourceFile = parseSourceModule(id, code);

  const collapseByKey = new Map<string, string>();
  if (options.consolidationVerdicts !== undefined) {
    for (const verdict of options.consolidationVerdicts) {
      if (!verdict.safe || verdict.name === undefined) continue;
      collapseByKey.set(canonicalListKey(verdict.tokens), verdict.name);
    }
  }

  const spans: Array<ClassListSpan> = [];

  function visit(node: ts.Node): void {
    // class / className object-literal properties with string literal values
    // (jsx-runtime props: { className: "flex p-4" }).
    if (ts.isPropertyAssignment(node)) {
      const name = node.name;
      const property = ts.isIdentifier(name)
        ? name.text
        : ts.isStringLiteral(name)
          ? name.text
          : "";
      if (
        (property === "class" || property === "className") &&
        (ts.isStringLiteral(node.initializer) ||
          ts.isNoSubstitutionTemplateLiteral(node.initializer))
      ) {
        const literal = node.initializer;
        const start = literal.getStart(sourceFile) + 1;
        const end = literal.getEnd() - 1;
        const text = code.slice(start, end);
        if (text !== literal.text) {
          // Escape desync: cooked text and raw bytes disagree, so no provable
          // token span exists inside this literal — skip, never guess.
          return;
        }
        spans.push({ start, end, text });
        return;
      }
    }
    // class="..." spans inside markup string literals.
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const start = node.getStart(sourceFile) + 1;
      const end = node.getEnd() - 1;
      if (node.text.includes('class="') || node.text.includes("class='")) {
        spans.push(...markupClassSpans(code, start, end));
      }
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  const edits = new Map<string, SourceEdit>();

  function addEdit(
    start: number,
    end: number,
    expected: string,
    replacement: string,
  ): void {
    const key = `${start}:${end}`;
    const existing = edits.get(key);
    if (existing !== undefined) {
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

  // One span is one class list: collapse when the canonical list matches a
  // safe verdict, reorder when the quote solver covered it, else rename
  // token by token — the source transform's class-attribute rules.
  for (const span of spans) {
    const tokens = tokenize(span.text);
    if (tokens.length === 0) continue;
    const key = canonicalListKey(tokens);
    const collapsed = collapseByKey.get(key);
    if (collapsed !== undefined) {
      addEdit(span.start, span.end, span.text, collapsed);
      continue;
    }
    const ordered = options.quoteOrder?.get(key);
    if (ordered !== undefined) {
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
      if (!missing) {
        addEdit(span.start, span.end, span.text, names.join(" "));
        continue;
      }
    }
    for (const match of span.text.matchAll(/[^ \t\n\f\r]+/g)) {
      const token = match[0];
      const name = registry.nameFor(token);
      if (name === undefined) continue;
      const start = span.start + match.index;
      addEdit(start, start + token.length, token, name);
    }
  }

  const warnings: Array<TransformWarning> = [];

  function location(position: number): { line: number; column: number } {
    const at = sourceFile.getLineAndCharacterOfPosition(position);
    return { line: at.line + 1, column: at.character + 1 };
  }

  // KTD7 leak check: whole-word registry tokens no edit consumed — class
  // names the stylesheet renames but this bundle keeps.
  for (const entry of registry.entries()) {
    let from = 0;
    for (;;) {
      const at = code.indexOf(entry.token, from);
      if (at === -1) break;
      from = at + entry.token.length;
      if (!isWholeWord(code, at, entry.token.length)) continue;
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

  if (edits.size === 0 && warnings.length === 0) return null;
  const applied = applySourceEdits(code, id, Array.from(edits.values()));
  return { code: applied.code, map: applied.map, warnings };
}
