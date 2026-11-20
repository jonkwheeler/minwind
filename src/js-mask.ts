import * as ts from "typescript";

// KTD9: in built JavaScript, a comment or a reserved word can never feed a
// class list, so the leak scans blank them first. Strings, template parts,
// and identifiers still count, in vendor code too: el.className ===
// "hidden" and "a;absolute".split(";") can both reach a class list.

interface Span {
  start: number;
  end: number;
}

// The ECMAScript reserved words, the strict-mode and module ones included.
// `static` is the one Tailwind utility among them. A reserved word used as
// a property name (a.static, { static: 1 }) parses as an identifier, which
// still counts.
function isReservedWord(kind: ts.SyntaxKind): boolean {
  return (
    (kind >= ts.SyntaxKind.FirstReservedWord &&
      kind <= ts.SyntaxKind.LastReservedWord) ||
    (kind >= ts.SyntaxKind.FirstFutureReservedWord &&
      kind <= ts.SyntaxKind.LastFutureReservedWord) ||
    kind === ts.SyntaxKind.AwaitKeyword
  );
}

// The parsed text with every comment and reserved-word token blanked to
// spaces, line breaks kept, so offsets still index the original. The parse
// settles what a scanner alone cannot: a `/` that starts a regular
// expression and a `}` that continues a template belong to tokens of their
// own nodes, which are never scanned. Only a token's leading trivia and the
// bytes between a node's children (punctuation, keywords, and trivia) are.
export function maskCommentsAndReservedWords(
  sourceFile: ts.SourceFile,
): string {
  const text = sourceFile.text;
  const blank: Array<Span> = [];
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    ts.LanguageVariant.Standard,
    text,
  );

  function scanBetween(start: number, end: number): void {
    if (end <= start) return;
    scanner.resetTokenState(start);
    for (;;) {
      const kind = scanner.scan();
      const tokenStart = scanner.getTokenStart();
      if (kind === ts.SyntaxKind.EndOfFileToken || tokenStart >= end) return;
      if (
        kind === ts.SyntaxKind.SingleLineCommentTrivia ||
        kind === ts.SyntaxKind.MultiLineCommentTrivia ||
        isReservedWord(kind)
      ) {
        blank.push({
          start: tokenStart,
          end: Math.min(scanner.getTokenEnd(), end),
        });
      }
    }
  }

  function visit(node: ts.Node): void {
    const children: Array<ts.Node> = [];
    ts.forEachChild(node, function (child) {
      children.push(child);
    });
    if (children.length === 0 && node.kind <= ts.SyntaxKind.LastToken) {
      const start = node.getStart(sourceFile);
      scanBetween(node.pos, start);
      if (isReservedWord(node.kind)) blank.push({ start, end: node.end });
      return;
    }
    let cursor = node.pos;
    for (const child of children) {
      scanBetween(cursor, child.pos);
      visit(child);
      cursor = Math.max(cursor, child.end);
    }
    scanBetween(cursor, node.end);
  }
  visit(sourceFile);

  blank.sort(function (a, b) {
    return a.start - b.start;
  });
  let masked = "";
  let copied = 0;
  for (const span of blank) {
    if (span.start < copied) continue;
    masked +=
      text.slice(copied, span.start) +
      text.slice(span.start, span.end).replace(/[^\n\r]/g, " ");
    copied = span.end;
  }
  return masked + text.slice(copied);
}
