import * as ts from "typescript";
import { objectLiteralKeys, parseSourceModule } from "./class-contexts.js";
import { canonicalListKey, type ConsolidationVerdict } from "./consolidate.js";
import {
  decodeClassTokens,
  escapeClassName,
  leakViews,
  type EncodedClassToken,
} from "./html-entities.js";
import { maskCommentsAndReservedWords } from "./js-mask.js";
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
// Everything else keeps its bytes. Consolidation collapses full-list spans
// exactly as in the source transform; whole-word registry-token occurrences
// and identifier object keys no edit consumed warn (the KTD7 leak posture)
// rather than failing. Markup is HTML, so its class values decode as built
// HTML does (KTD6).

export interface TransformBundleOptions {
  code: string;
  id: string;
  registry: NameRegistry;
  consolidationVerdicts?: ReadonlyArray<ConsolidationVerdict>;
  // Objects proven to be CSS Modules export maps, whose keys are module
  // locals and never count as leaks (KTD15).
  isExportMap?: (node: ts.ObjectLiteralExpression) => boolean;
}

// htmlEncoded marks a class="..." span of markup, whose character
// references the DOM decodes; a property literal's `&` is literal.
interface ClassListSpan {
  start: number;
  end: number;
  text: string;
  htmlEncoded: boolean;
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
      found.push({
        start,
        end: start + match[1].length,
        text: match[1],
        htmlEncoded: true,
      });
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
        spans.push({ start, end, text, htmlEncoded: false });
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

  // The span's tokens with their offsets; null for markup whose tokens
  // cannot be told apart, which gets no edits.
  function spanTokens(span: ClassListSpan): Array<EncodedClassToken> | null {
    if (span.htmlEncoded) return decodeClassTokens(span.text);
    return Array.from(span.text.matchAll(/[^ \t\n\f\r]+/g), function (match) {
      return { raw: match[0], offset: match.index, token: match[0] };
    });
  }

  function written(span: ClassListSpan, name: string): string {
    return span.htmlEncoded ? escapeClassName(name) : name;
  }

  // One span is one class list: collapse when the canonical list matches a
  // safe verdict, else rename token by token — the source transform's
  // class-attribute rules.
  for (const span of spans) {
    const tokens = spanTokens(span);
    if (tokens === null || tokens.length === 0) continue;
    const key = canonicalListKey(
      tokens.map(function (token) {
        return token.token;
      }),
    );
    const collapsed = collapseByKey.get(key);
    if (collapsed !== undefined) {
      addEdit(span.start, span.end, span.text, written(span, collapsed));
      continue;
    }
    for (const token of tokens) {
      const name = registry.nameFor(token.token);
      if (name === undefined) continue;
      const start = span.start + token.offset;
      addEdit(start, start + token.raw.length, token.raw, written(span, name));
    }
  }

  const warnings: Array<TransformWarning> = [];

  function location(position: number): { line: number; column: number } {
    const at = sourceFile.getLineAndCharacterOfPosition(position);
    return { line: at.line + 1, column: at.character + 1 };
  }

  // KTD7 leak check: whole-word registry tokens no edit consumed — class
  // names the stylesheet renames but this bundle keeps. Comments and
  // reserved words are blanked first (KTD9). The bundle is also scanned
  // decoded (KTD6), and an occurrence both scans find warns once. An
  // identifier object key counts too (KTD15): a minifier renames cn(), so no
  // object in a bundle can be told apart from a class list.
  const entries = registry.entries();
  const views =
    entries.length === 0
      ? []
      : leakViews(maskCommentsAndReservedWords(sourceFile), true);
  const keysByToken = new Map<string, Array<{ start: number; end: number }>>();
  if (entries.length > 0) {
    for (const key of objectLiteralKeys(sourceFile, options.isExportMap)) {
      const list = keysByToken.get(key.text);
      if (list === undefined) keysByToken.set(key.text, [key]);
      else list.push(key);
    }
  }
  for (const entry of entries) {
    const reported = new Set<number>();
    function report(span: { start: number; end: number }): void {
      if (reported.has(span.start)) return;
      for (const edit of edits.values()) {
        if (edit.start <= span.start && edit.end >= span.end) return;
      }
      reported.add(span.start);
      const atLocation = location(span.start);
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
    for (const view of views) {
      let from = 0;
      for (;;) {
        const at = view.text.indexOf(entry.token, from);
        if (at === -1) break;
        from = at + entry.token.length;
        if (!isWholeWord(view.text, at, entry.token.length)) continue;
        report(view.rawSpan(at, at + entry.token.length));
      }
    }
    for (const key of keysByToken.get(entry.token) ?? []) report(key);
  }

  if (edits.size === 0 && warnings.length === 0) return null;
  const applied = applySourceEdits(code, id, Array.from(edits.values()));
  return { code: applied.code, map: applied.map, warnings };
}
