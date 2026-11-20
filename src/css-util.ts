import { ident, walk, type AttributeSelector, type CssNode } from "css-tree";
import { tokenize } from "./class-contexts.js";
import type { NameRegistry } from "./names.js";

export interface SpanEdit {
  start: number;
  end: number;
  expected: string;
  replacement: string;
}

export function childArray(node: CssNode | null | undefined): Array<CssNode> {
  if (node == null || node.children == null) {
    return [];
  }
  return node.children.toArray();
}

// Every class selector under a node, in document order. walk() follows the
// structure fields that children lists miss, such as the selector list in
// `:nth-child(2n of .x)` (KTD12).
export function classSelectorNodes(node: CssNode): Array<CssNode> {
  const nodes: Array<CssNode> = [];
  walk(node, {
    visit: "ClassSelector",
    enter: function (classNode) {
      nodes.push(classNode);
    },
  });
  return nodes;
}

// Could `[class<matcher>"…"]` match an element carrying `original`, going by
// one whitespace-separated piece of the selector's value? `=` and `~=`
// compare whole tokens. The substring matchers test the whole class
// attribute, so a piece may cover part of a token: holding each piece to the
// matcher against each original keeps every original the selector could
// match.
function matchesPiece(
  matcher: string,
  original: string,
  piece: string,
): boolean {
  switch (matcher) {
    case "=":
    case "~=":
      return original === piece;
    case "*=":
      return original.includes(piece);
    case "^=":
      return original.startsWith(piece);
    case "$=":
      return original.endsWith(piece);
    case "|=":
      return original === piece || original.startsWith(`${piece}-`);
    default:
      return false;
  }
}

// KTD12: the originals a class attribute selector references, such as
// `[class~="flex"]` or `[class*="fle"]`. minwind renames neither the
// selector nor its value, so a renamed original among them stops matching.
// Empty for any other node, for other attributes, and for a bare `[class]`.
export function classAttributeTokens(
  node: CssNode,
  originals: () => ReadonlyArray<string>,
): Array<string> {
  if (node.type !== "AttributeSelector") return [];
  const attribute = node as unknown as AttributeSelector;
  const { matcher, value } = attribute;
  if (attribute.name.name !== "class" || matcher === null || value === null) {
    return [];
  }
  // A String value arrives decoded; an Identifier keeps its escapes.
  const pieces = tokenize(
    value.type === "String"
      ? (value.value ?? "")
      : ident.decode(value.name ?? ""),
  );
  return originals().filter(function (original) {
    return pieces.some(function (piece) {
      return matchesPiece(matcher, original, piece);
    });
  });
}

export function lazyOriginals(
  registry: NameRegistry,
): () => ReadonlyArray<string> {
  let originals: Array<string> | undefined;
  return function () {
    if (originals === undefined) {
      originals = registry.entries().map(function (entry) {
        return entry.token;
      });
    }
    return originals;
  };
}

// Applies verified, non-overlapping span edits against the original bytes.
// Any bounds, overlap, or content mismatch is an internal error (R10); the
// throw happens before a result is returned, so partial output never ships.
export function applySpanEdits(
  css: string,
  edits: ReadonlyArray<SpanEdit>,
  fileName: string,
): string {
  const ordered = [...edits].sort(function (a, b) {
    if (a.start !== b.start) return a.start - b.start;
    return a.end - b.end;
  });
  let previousEnd = 0;
  for (const edit of ordered) {
    if (edit.start < 0 || edit.end > css.length || edit.start > edit.end) {
      throw new Error(
        `minwind: ${fileName}: span edit out of bounds` +
          ` ${edit.start}..${edit.end}`,
      );
    }
    if (edit.start < previousEnd) {
      throw new Error(
        `minwind: ${fileName}: overlapping span edits at` +
          ` ${edit.start}..${edit.end}`,
      );
    }
    const actual = css.slice(edit.start, edit.end);
    if (actual !== edit.expected) {
      throw new Error(
        `minwind: ${fileName}: span mismatch at` +
          ` ${edit.start}..${edit.end}: expected "${edit.expected}", found` +
          ` "${actual}"`,
      );
    }
    previousEnd = edit.end;
  }
  let output = "";
  let cursor = 0;
  for (const edit of ordered) {
    output += css.slice(cursor, edit.start) + edit.replacement;
    cursor = edit.end;
  }
  return output + css.slice(cursor);
}
