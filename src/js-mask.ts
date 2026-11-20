import * as ts from "typescript";
import type { LiteralOccurrence } from "./class-contexts.js";

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

// A string's contents with its JavaScript escapes decoded. starts[i] and
// ends[i] span the raw bytes code unit i came from, offsets into the raw
// contents; null when nothing was escaped, so both are the identity.
interface DecodedString {
  value: string;
  starts: Array<number> | null;
  ends: Array<number> | null;
}

const HEX_DIGITS = /^[0-9a-fA-F]+$/;

function decodeJavaScript(raw: string): DecodedString {
  if (!raw.includes("\\")) return { value: raw, starts: null, ends: null };
  let value = "";
  const starts: Array<number> = [];
  const ends: Array<number> = [];
  function emit(decoded: string, start: number, end: number): void {
    for (let k = 0; k < decoded.length; k += 1) {
      starts.push(start);
      ends.push(end);
    }
    value += decoded;
  }
  let i = 0;
  while (i < raw.length) {
    if (raw[i] !== "\\" || i + 1 === raw.length) {
      emit(raw[i], i, i + 1);
      i += 1;
      continue;
    }
    const next = raw[i + 1];
    if (next === "\r") {
      i += raw[i + 2] === "\n" ? 3 : 2;
      continue;
    }
    if (next === "\n" || next === "\u2028" || next === "\u2029") {
      i += 2;
      continue;
    }
    const single = "bfnrtv".indexOf(next);
    if (single !== -1) {
      emit("\b\f\n\r\t\v"[single], i, i + 2);
      i += 2;
      continue;
    }
    if (next === "x" && HEX_DIGITS.test(raw.slice(i + 2, i + 4))) {
      emit(
        String.fromCharCode(parseInt(raw.slice(i + 2, i + 4), 16)),
        i,
        i + 4,
      );
      i += 4;
      continue;
    }
    if (next === "u") {
      const close = raw[i + 2] === "{" ? raw.indexOf("}", i + 3) : -1;
      const digits =
        close === -1 ? raw.slice(i + 2, i + 6) : raw.slice(i + 3, close);
      const code = HEX_DIGITS.test(digits) ? parseInt(digits, 16) : -1;
      if (close === -1 && digits.length === 4 && code !== -1) {
        emit(String.fromCharCode(code), i, i + 6);
        i += 6;
        continue;
      }
      if (close !== -1 && code !== -1 && code <= 0x10ffff) {
        emit(String.fromCodePoint(code), i, close + 1);
        i = close + 1;
        continue;
      }
    }
    const octal = /^[0-3][0-7]{0,2}|^[4-7][0-7]?/.exec(raw.slice(i + 1, i + 4));
    if (octal !== null) {
      const end = i + 1 + octal[0].length;
      emit(String.fromCharCode(parseInt(octal[0], 8)), i, end);
      i = end;
      continue;
    }
    const code = raw.codePointAt(i + 1) ?? 0;
    const end = i + (code > 0xffff ? 3 : 2);
    emit(String.fromCodePoint(code), i, end);
    i = end;
  }
  return { value, starts, ends };
}

// CSS Syntax: a name code point, a name-start code point, and a valid
// escape (a backslash not followed by a newline or the end).
function isNameStart(code: number): boolean {
  return (
    (code >= 0x41 && code <= 0x5a) ||
    (code >= 0x61 && code <= 0x7a) ||
    code === 0x5f ||
    code >= 0x80
  );
}

function isNameCharacter(code: number): boolean {
  return isNameStart(code) || (code >= 0x30 && code <= 0x39) || code === 0x2d;
}

function isValidEscape(text: string, at: number): boolean {
  if (text[at] !== "\\" || at + 1 >= text.length) return false;
  const next = text[at + 1];
  return next !== "\n" && next !== "\r" && next !== "\f";
}

function startsIdentifier(text: string, at: number): boolean {
  const code = text.charCodeAt(at);
  if (code === 0x2d) {
    const next = text.charCodeAt(at + 1);
    return isNameStart(next) || next === 0x2d || isValidEscape(text, at + 1);
  }
  return isNameStart(code) || isValidEscape(text, at);
}

// The code point a valid escape at `at` stands for, and the index after it:
// up to six hex digits and one whitespace character, or any other
// character as itself.
function consumeEscape(
  text: string,
  at: number,
): { value: string; next: number } {
  let end = at + 1;
  while (end < text.length && end - at <= 6 && /[0-9a-fA-F]/.test(text[end])) {
    end += 1;
  }
  if (end === at + 1) {
    const code = text.codePointAt(at + 1) ?? 0;
    return {
      value: String.fromCodePoint(code),
      next: at + (code > 0xffff ? 3 : 2),
    };
  }
  let code = parseInt(text.slice(at + 1, end), 16);
  if (code === 0 || (code >= 0xd800 && code <= 0xdfff) || code > 0x10ffff) {
    code = 0xfffd;
  }
  if (text[end] === "\r" && text[end + 1] === "\n") end += 2;
  else if (end < text.length && /[ \t\n\r\f]/.test(text[end])) end += 1;
  return { value: String.fromCodePoint(code), next: end };
}

// KTD16: a class selector inside a JavaScript string or template part
// (".hidden", "ul > .flex", ":not(.hidden)") names the class a script
// selects, whichever API reads the string. Each is an occurrence of its
// class name: text is the name with the string's JavaScript escapes and
// then its CSS escapes decoded, so ".md\\:flex" names md:flex, and start
// and end span the name's raw bytes in the parse. A name ends where a CSS
// identifier ends, so ".hidden:hover" and ".hidden.open" name hidden, and
// an escaped dot ("a\\.hidden") starts none. A JSX attribute string has no
// JavaScript escapes. A tagged template is read cooked and raw, since its
// tag gets both, so String.raw`.md\:flex` names md:flex. Only string
// contents are read: property access (el.hidden), comments, and regular
// expressions never count.
export function selectorClassReferences(
  sourceFile: ts.SourceFile,
): Array<LiteralOccurrence> {
  const text = sourceFile.text;
  const references: Array<LiteralOccurrence> = [];

  function scan(start: number, end: number, escapes: boolean): void {
    const raw = text.slice(start, end);
    if (!raw.includes(".") && !raw.includes("\\")) return;
    const decoded = escapes
      ? decodeJavaScript(raw)
      : { value: raw, starts: null, ends: null };
    const value = decoded.value;
    let i = 0;
    while (i < value.length) {
      if (value[i] === "\\") {
        i = isValidEscape(value, i) ? consumeEscape(value, i).next : i + 1;
        continue;
      }
      if (value[i] !== "." || !startsIdentifier(value, i + 1)) {
        i += 1;
        continue;
      }
      let name = "";
      let at = i + 1;
      for (;;) {
        if (at < value.length && isNameCharacter(value.charCodeAt(at))) {
          name += value[at];
          at += 1;
        } else if (isValidEscape(value, at)) {
          const escape = consumeEscape(value, at);
          name += escape.value;
          at = escape.next;
        } else {
          break;
        }
      }
      references.push({
        text: name,
        start: start + (decoded.starts?.[i + 1] ?? i + 1),
        end: start + (decoded.ends?.[at - 1] ?? at),
        shorthand: false,
        quoted: true,
      });
      i = at;
    }
  }

  function scanTemplatePart(part: ts.TemplateLiteralToken): void {
    const start = part.getStart(sourceFile) + 1;
    const end =
      part.getEnd() -
      (ts.isTemplateHead(part) || ts.isTemplateMiddle(part) ? 2 : 1);
    scan(start, end, true);
    const template: ts.Node = ts.isNoSubstitutionTemplateLiteral(part)
      ? part
      : ts.isTemplateHead(part)
        ? part.parent
        : part.parent.parent;
    const tag = template.parent;
    if (
      ts.isTaggedTemplateExpression(tag) &&
      tag.template === template &&
      text.slice(start, end).includes("\\")
    ) {
      scan(start, end, false);
    }
  }

  function visit(node: ts.Node): void {
    if (ts.isStringLiteral(node)) {
      const escapes = !ts.isJsxAttribute(node.parent);
      scan(node.getStart(sourceFile) + 1, node.getEnd() - 1, escapes);
      return;
    }
    if (
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      scanTemplatePart(node);
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return references;
}
