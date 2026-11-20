import * as parse5 from "parse5";
import type { DefaultTreeAdapterMap } from "parse5";
import * as ts from "typescript";
import {
  parseSourceModule,
  tokenize,
  walkClassContexts,
  type ClassContextVisitor,
  type LiteralOccurrence,
} from "./class-contexts.js";

// Single-file-component support (Vue, Svelte, Astro). One walker feeds both
// the U2 pre-pass scan and the U3 transform so classification can never
// drift (KTD4). Script regions reuse the shared TS walker outright; template
// class positions map onto the same rename groups: static class="..."
// attributes behave exactly like JSX class attributes, framework binding
// expressions (Vue :class, Astro class:list) reuse cn() semantics by
// wrapping the expression in a synthetic cn() call, and Svelte class:foo
// directives rename like classList keys. Static text interleaved with
// template expressions (Svelte/Astro class="a {cond}") is unprovable: its
// static runs and nested string literals poison the token everywhere,
// mirroring the template-literal rule. Markup inside Astro content
// expressions ({items.map((item) => <li class="...">)}) is parsed as TSX and
// walked with the JSX rules. An Astro frontmatter const holding a class
// string reads like a class attribute when every reference to it is a class
// position (KTD5).
//
// Both walks run against whitespace masks of the original file — script
// contents blanked for the template parse, everything else blanked for the
// script parse — so every span is absolute into the real file and the two
// walks can never see each other's regions (an HTML-looking string inside a
// script never becomes a phantom element).

// The module-graph SFC formats. Plain .html is deliberately absent: the
// Vite/webpack plugins must not transform HTML modules, and the pre-pass
// must not scan source HTML (an untransformed copy would diverge from the
// renamed stylesheet). The post-build CLI is the only .html consumer — it
// rewrites emitted HTML — so sfcFormatFor maps it but SFC_PATTERN excludes
// it.
export const SFC_PATTERN = /\.(?:vue|svelte|astro)$/;

type SfcFormat = "vue" | "svelte" | "astro" | "html";

export function sfcFormatFor(filePath: string): SfcFormat | null {
  const clean = filePath.split("?")[0];
  if (clean.endsWith(".vue")) return "vue";
  if (clean.endsWith(".svelte")) return "svelte";
  if (clean.endsWith(".astro")) return "astro";
  if (clean.endsWith(".html")) return "html";
  return null;
}

export function isSfcModule(filePath: string): boolean {
  return sfcFormatFor(filePath) !== null;
}

interface ContentRegion {
  contentStart: number;
  contentEnd: number;
  lang: string;
  // The Astro frontmatter, as opposed to a <script> block.
  frontmatter: boolean;
}

const SCRIPT_TAG = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
const STYLE_TAG = /<style\b[^>]*>[\s\S]*?<\/style\s*>/gi;
const LANG_ATTRIBUTE = /\blang\s*=\s*["']([^"']+)["']/i;

// Astro frontmatter is only valid as the very first bytes of the file, and
// Astro ends it at the first `---` after the opening fence. The content group
// is absent for an empty block (---\n---); it is lazy so that block ends at
// its own fence rather than at a later template line starting with `---`.
const FRONTMATTER = /^---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)??---/;

function findScriptRegions(
  format: SfcFormat,
  text: string,
): Array<ContentRegion> {
  const regions: Array<ContentRegion> = [];
  if (format === "astro") {
    const content = FRONTMATTER.exec(text)?.[1];
    if (content !== undefined && content !== "") {
      const contentStart = text.indexOf("\n") + 1;
      regions.push({
        contentStart,
        contentEnd: contentStart + content.length,
        lang: "ts",
        frontmatter: true,
      });
    }
  }
  SCRIPT_TAG.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SCRIPT_TAG.exec(text)) !== null) {
    const langMatch = LANG_ATTRIBUTE.exec(match[1]);
    const contentStart = match.index + "<script".length + match[1].length + 1;
    regions.push({
      contentStart,
      contentEnd: contentStart + match[2].length,
      // Astro compiles its client scripts as TypeScript; Vue, Svelte, and
      // plain HTML inline scripts default to JS unless lang says otherwise.
      lang:
        langMatch !== null
          ? langMatch[1].toLowerCase()
          : format === "astro"
            ? "ts"
            : "js",
      frontmatter: false,
    });
  }
  return regions;
}

// Bytes outside the kept spans become spaces (newlines preserved) so offsets
// and line numbers still index into the original file.
function maskOutside(
  text: string,
  spans: ReadonlyArray<{ start: number; end: number }>,
): string {
  const keep = new Uint8Array(text.length);
  for (const span of spans) {
    for (let i = span.start; i < span.end; i += 1) keep[i] = 1;
  }
  const chars = text.split("");
  for (let i = 0; i < chars.length; i += 1) {
    if (keep[i] === 0 && chars[i] !== "\n" && chars[i] !== "\r") {
      chars[i] = " ";
    }
  }
  return chars.join("");
}

function maskSpans(
  text: string,
  spans: ReadonlyArray<{ start: number; end: number }>,
): string {
  const chars = text.split("");
  for (const span of spans) {
    for (let i = span.start; i < span.end; i += 1) {
      if (chars[i] !== "\n" && chars[i] !== "\r") chars[i] = " ";
    }
  }
  return chars.join("");
}

// Svelte and Astro interpolate {expression} runs in templates — including
// inside UNQUOTED attribute values (class:list={["a", { "b": c }]}), whose
// spaces an HTML parser reads as attribute boundaries. Fill each run's
// contents with x's (braces kept, quote- and escape-aware) so parse5 sees a
// single whitespace-free value; the run's original bytes are recovered from
// the unmasked text at the same offsets. Newlines become x's too: a run
// formatted across lines would otherwise end an unquoted value at its first
// line break. Nothing reads lines from the masked text — warnings locate
// offsets in the original. Vue needs no masking: its attributes are always
// quoted and its bindings always expressions. An unterminated run (a stray
// brace in text) is left alone.
function maskBraceExpressions(text: string): string {
  const chars = text.split("");
  let i = 0;
  while (i < chars.length) {
    if (chars[i] !== "{") {
      i += 1;
      continue;
    }
    let depth = 0;
    let quote: string | null = null;
    let end = i;
    while (end < chars.length) {
      const ch = chars[end];
      if (quote !== null) {
        if (ch === "\\") {
          end += 2;
          continue;
        }
        if (ch === quote) quote = null;
        end += 1;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        quote = ch;
      } else if (ch === "{") {
        depth += 1;
      } else if (ch === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
      end += 1;
    }
    if (depth !== 0 || end >= chars.length) {
      i += 1;
      continue;
    }
    for (let k = i + 1; k < end; k += 1) chars[k] = "x";
    i = end + 1;
  }
  return chars.join("");
}

// An Astro brace run: `start` at its `{`, `end` just past its `}`. markup
// is true when the run holds expression markup, and voidTagEnds are the
// offsets of the `>` ending each void element written without `/>` in it.
interface BraceRun {
  start: number;
  end: number;
  markup: boolean;
  voidTagEnds: Array<number>;
}

const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

function isAsciiLetter(ch: string | undefined): boolean {
  return ch !== undefined && /^[A-Za-z]$/.test(ch);
}

function isWordCharacter(ch: string): boolean {
  return /^[\w$]$/.test(ch) || ch >= "\u0080";
}

// The keywords after which `<` starts an operand, not a comparison.
const OPERAND_KEYWORDS = new Set(["return", "yield", "await"]);

// KTD3: Astro expressions hold markup, and maskBraceExpressions' quote
// tracking would read the apostrophe in {cond && <p>Don't</p>} as a string
// that closes outside the run, masking real elements. This finder is a small
// state machine. In JavaScript it tracks quotes, template literals with
// ${...} nesting, and comments, and `<` followed by a letter or `>` starts
// markup only in operand position (`<` after an operand is a comparison or
// a type argument: {a<b}, Array<Item>). Markup ignores quotes in text,
// skips quoted attribute values and comments, counts element depth (void
// and self-closing tags don't nest), and enters JavaScript at `{`; at depth
// 0 it returns to JavaScript. Regex literals are not tracked. Runs are
// masked as maskBraceExpressions masks them.
function findAstroBraceRuns(text: string): {
  masked: string;
  runs: Array<BraceRun>;
} {
  let markup = false;
  let voidTagEnds: Array<number> = [];

  // Each scan starts at an offset and returns the offset just past what it
  // consumed, or -1 when the text ends first.
  function skipQuoted(from: number, quote: string): number {
    let i = from;
    while (i < text.length) {
      if (text[i] === "\\") {
        i += 2;
        continue;
      }
      if (text[i] === quote) return i + 1;
      i += 1;
    }
    return -1;
  }

  // From just past an opening backtick.
  function skipTemplateLiteral(from: number): number {
    let i = from;
    while (i < text.length) {
      const ch = text[i];
      if (ch === "\\") {
        i += 2;
      } else if (ch === "`") {
        return i + 1;
      } else if (ch === "$" && text[i + 1] === "{") {
        i = scanScript(i + 2);
        if (i === -1) return -1;
      } else {
        i += 1;
      }
    }
    return -1;
  }

  // JavaScript from just past a `{` through the `}` that closes it.
  function scanScript(from: number): number {
    let i = from;
    let depth = 0;
    let operand = true;
    while (i < text.length) {
      const ch = text[i];
      const next = text[i + 1];
      if (ch === "'" || ch === '"' || ch === "`") {
        i = ch === "`" ? skipTemplateLiteral(i + 1) : skipQuoted(i + 1, ch);
        if (i === -1) return -1;
        operand = false;
      } else if (ch === "/" && next === "/") {
        const lineEnd = text.indexOf("\n", i);
        if (lineEnd === -1) return -1;
        i = lineEnd + 1;
      } else if (ch === "/" && next === "*") {
        const close = text.indexOf("*/", i + 2);
        if (close === -1) return -1;
        i = close + 2;
      } else if (
        ch === "<" &&
        operand &&
        (isAsciiLetter(next) || next === ">")
      ) {
        i = scanMarkup(i);
        if (i === -1) return -1;
        operand = false;
      } else if (isWordCharacter(ch)) {
        let end = i + 1;
        while (end < text.length && isWordCharacter(text[end])) end += 1;
        operand = OPERAND_KEYWORDS.has(text.slice(i, end));
        i = end;
      } else {
        if (ch === "}") {
          if (depth === 0) return i + 1;
          depth -= 1;
        } else if (ch === "{") {
          depth += 1;
        }
        if (!isAsciiWhitespace(ch)) {
          const previous = text[i - 1];
          operand =
            "([{,;?:=!".includes(ch) ||
            ((ch === "&" || ch === "|") && previous === ch) ||
            (ch === ">" && previous === "=");
        }
        i += 1;
      }
    }
    return -1;
  }

  // A start tag's attributes, from just past its name. selfClosing is
  // true for `/>`.
  function scanStartTag(
    from: number,
  ): { end: number; selfClosing: boolean } | null {
    let i = from;
    while (i < text.length) {
      const ch = text[i];
      if (ch === '"' || ch === "'") {
        const close = text.indexOf(ch, i + 1);
        if (close === -1) return null;
        i = close + 1;
      } else if (ch === "`" || ch === "{") {
        i = ch === "`" ? skipTemplateLiteral(i + 1) : scanScript(i + 1);
        if (i === -1) return null;
      } else if (ch === "/" && text[i + 1] === ">") {
        return { end: i + 2, selfClosing: true };
      } else if (ch === ">") {
        return { end: i + 1, selfClosing: false };
      } else {
        i += 1;
      }
    }
    return null;
  }

  // Markup from its first `<` until its outermost element closes.
  function scanMarkup(from: number): number {
    markup = true;
    let i = from;
    let depth = 0;
    while (i < text.length) {
      const ch = text[i];
      const next = text[i + 1];
      if (ch === "{") {
        i = scanScript(i + 1);
        if (i === -1) return -1;
      } else if (text.startsWith("<!--", i)) {
        const close = text.indexOf("-->", i + 4);
        if (close === -1) return -1;
        i = close + 3;
      } else if (ch === "<" && next === ">") {
        depth += 1;
        i += 2;
      } else if (ch === "<" && next === "/") {
        const close = text.indexOf(">", i);
        if (close === -1) return -1;
        i = close + 1;
        depth -= 1;
        if (depth <= 0) return i;
      } else if (ch !== "<" || !isAsciiLetter(next)) {
        // Text, quotes included.
        i += 1;
      } else {
        let nameEnd = i + 1;
        while (
          nameEnd < text.length &&
          !isAsciiWhitespace(text[nameEnd]) &&
          text[nameEnd] !== "/" &&
          text[nameEnd] !== ">"
        ) {
          nameEnd += 1;
        }
        const name = text.slice(i + 1, nameEnd);
        const tag = scanStartTag(nameEnd);
        if (tag === null) return -1;
        i = tag.end;
        if (!tag.selfClosing && VOID_ELEMENTS.has(name)) {
          voidTagEnds.push(i - 1);
        } else if (!tag.selfClosing) {
          depth += 1;
          continue;
        }
        if (depth === 0) return i;
      }
    }
    return -1;
  }

  const chars = text.split("");
  const runs: Array<BraceRun> = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] !== "{") {
      i += 1;
      continue;
    }
    markup = false;
    voidTagEnds = [];
    const end = scanScript(i + 1);
    // An unterminated run (a stray brace in text) is left alone.
    if (end === -1) {
      i += 1;
      continue;
    }
    runs.push({ start: i, end, markup, voidTagEnds });
    for (let k = i + 1; k < end - 1; k += 1) chars[k] = "x";
    i = end;
  }
  return { masked: chars.join(""), runs };
}

// The KTD7 reverse-leak check scans the whole module for registry tokens;
// inside <style> content a utility word like `flex` is a CSS value
// (display: flex), not a class reference, and would warn on every scoped
// style block. Blank style contents for the leak check only — selector
// renaming in SFC styles is the CSS transform's job, downstream of the
// framework's style extraction.
export function maskSfcStyleContent(filePath: string, text: string): string {
  if (!isSfcModule(filePath)) return text;
  const spans: Array<{ start: number; end: number }> = [];
  STYLE_TAG.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = STYLE_TAG.exec(text)) !== null) {
    const openEnd = text.indexOf(">", match.index) + 1;
    const closeStart = match.index + match[0].length - "</style>".length;
    if (closeStart > openEnd) spans.push({ start: openEnd, end: closeStart });
  }
  if (spans.length === 0) return text;
  return maskSpans(text, spans);
}

// Forwards callbacks with literal spans mapped from a synthetic parse into
// the original file. unprovableTemplate cannot be mapped — the node belongs
// to the synthetic parse — so its static fragments are re-emitted as runtime
// literals, which poison (pre-pass) and warn (transform) exactly like the
// template path.
function offsetVisitor(
  visitor: ClassContextVisitor,
  toOriginal: (position: number) => number,
): ClassContextVisitor {
  function shift(literal: LiteralOccurrence): LiteralOccurrence {
    return {
      text: literal.text,
      start: toOriginal(literal.start),
      end: toOriginal(literal.end),
      shorthand: literal.shorthand,
      quoted: literal.quoted,
    };
  }
  return {
    enterRenameGroup: function (kind) {
      visitor.enterRenameGroup?.(kind);
    },
    exitRenameGroup: function (kind, fullyLiteral, staticList) {
      visitor.exitRenameGroup?.(kind, fullyLiteral, staticList);
    },
    renameLiteral: function (literal, kind) {
      visitor.renameLiteral?.(shift(literal), kind);
    },
    runtimeLiteral: function (literal, kind) {
      visitor.runtimeLiteral?.(shift(literal), kind);
    },
    unprovableTemplate: function (node) {
      const fragments: Array<LiteralOccurrence> = [];
      const head = node.head;
      fragments.push({
        text: head.text,
        start: head.getStart() + 1,
        end: head.getEnd() - 2,
        shorthand: false,
        quoted: true,
      });
      for (const span of node.templateSpans) {
        const literal = span.literal;
        // A middle span ends with `${`, a tail span with a backtick.
        const trim = literal.kind === ts.SyntaxKind.TemplateTail ? 1 : 2;
        fragments.push({
          text: literal.text,
          start: literal.getStart() + 1,
          end: literal.getEnd() - trim,
          shorthand: false,
          quoted: true,
        });
      }
      for (const fragment of fragments) {
        if (fragment.end <= fragment.start) continue;
        visitor.runtimeLiteral?.(shift(fragment), "class-expression");
      }
    },
  };
}

// A binding expression (Vue :class, Astro class:list) gets cn() semantics
// wholesale: wrap it in a bare cn() call so the shared walker classifies
// string literals, object keys, and nested templates exactly as it would for
// cn(...) in a script — group bookkeeping, consolidation exclusion for
// dynamic groups, and quote-fragment recording all come along unchanged.
function walkBindingExpression(
  filePath: string,
  expression: string,
  expressionStart: number,
  visitor: ClassContextVisitor,
): void {
  const wrapped = `cn(${expression})`;
  const sourceFile = parseSourceModule(`${filePath}::binding.ts`, wrapped);
  const offset = expressionStart - "cn(".length;
  walkClassContexts(
    sourceFile,
    offsetVisitor(visitor, function (position) {
      return position + offset;
    }),
  );
}

// An Astro brace run parsed alone as TSX. toOriginal maps a position in the
// parse back into the file.
interface ParsedRun {
  sourceFile: ts.SourceFile;
  toOriginal: (position: number) => number;
}

// KTD4: a brace run is parsed alone as TSX, wrapped as `(` + content + `)`.
// The copy closes each unclosed void element (<img ...> becomes <img .../>),
// and spans map back through the inserted bytes. A run TSX still rejects (an
// HTML comment, an unquoted attribute value) parses to null.
function parseBraceRun(
  filePath: string,
  templateText: string,
  run: BraceRun,
): ParsedRun | null {
  const contentStart = run.start + 1;
  // Ascending offsets in the copy where a `/` was inserted.
  const inserted: Array<number> = [];
  let copy = "(";
  let cursor = contentStart;
  for (const tagEnd of run.voidTagEnds) {
    copy += templateText.slice(cursor, tagEnd);
    inserted.push(copy.length);
    copy += "/";
    cursor = tagEnd;
  }
  copy += `${templateText.slice(cursor, run.end - 1)})`;
  const sourceFile = parseSourceModule(`${filePath}::expression.tsx`, copy);
  // parseDiagnostics is internal in the TypeScript typings.
  const parsed = sourceFile as unknown as {
    parseDiagnostics: ReadonlyArray<ts.Diagnostic>;
  };
  if (parsed.parseDiagnostics.length > 0) return null;
  return {
    sourceFile,
    toOriginal: function (position) {
      let before = 1;
      for (const at of inserted) {
        if (at >= position) break;
        before += 1;
      }
      return contentStart + position - before;
    },
  };
}

// KTD4: a content run that holds markup is walked with the JSX rules:
// class="..." is a static class attribute, class={expr} poisons what it
// cannot prove, and class:list gets cn() semantics. A run TSX rejects emits
// nothing: the output pass on the Astro route reads the built markup either
// way.
function walkExpressionMarkup(
  parsed: ParsedRun | null,
  visitor: ClassContextVisitor,
): void {
  if (parsed === null) return;
  walkClassContexts(
    parsed.sourceFile,
    offsetVisitor(visitor, parsed.toOriginal),
    { astroClassList: true },
  );
}

// KTD5: a frontmatter const that may hold a class string, with what the
// reference count has found so far.
interface ClassConstant {
  declaration: ts.Identifier;
  literal: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral;
  classPositions: number;
  otherReference: boolean;
}

// Eligible: a top-level, non-exported const declared inside the
// frontmatter, initialized with a string literal or a template literal
// without substitutions. A later declaration of the same name is not the
// declaration, so the count reads it as an other reference.
function frontmatterConstants(
  sourceFile: ts.SourceFile,
  frontmatter: ContentRegion,
): Map<string, ClassConstant> {
  const constants = new Map<string, ClassConstant>();
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    const at = statement.getStart(sourceFile);
    if (at < frontmatter.contentStart || at >= frontmatter.contentEnd) {
      continue;
    }
    if ((statement.modifiers?.length ?? 0) > 0) continue;
    const list = statement.declarationList;
    if ((list.flags & ts.NodeFlags.BlockScoped) !== ts.NodeFlags.Const) {
      continue;
    }
    for (const declaration of list.declarations) {
      const name = declaration.name;
      const literal = declaration.initializer;
      if (!ts.isIdentifier(name) || constants.has(name.text)) continue;
      if (
        literal === undefined ||
        !(
          ts.isStringLiteral(literal) ||
          ts.isNoSubstitutionTemplateLiteral(literal)
        )
      ) {
        continue;
      }
      constants.set(name.text, {
        declaration: name,
        literal,
        classPositions: 0,
        otherReference: false,
      });
    }
  }
  return constants;
}

// How a brace run sits in the template: the whole value of a class or a
// class:list attribute.
type RunRole = "class" | "class-list";

function isClassListName(name: ts.JsxAttributeName): boolean {
  return (
    ts.isJsxNamespacedName(name) &&
    name.namespace.text === "class" &&
    name.name.text === "list"
  );
}

// KTD5's reference count over one parse. A reference is the name as a whole
// identifier, not after `.`, other than the declaration. It is a class
// position when it is the whole value of class={X}, the whole class:list
// expression or an array element at any depth inside it, or a direct cn()
// argument, cn named as walkClassContexts names it. role says the parse
// itself is the value of a class or class:list attribute.
function countConstantReferences(
  sourceFile: ts.SourceFile,
  constants: ReadonlyMap<string, ClassConstant>,
  role: RunRole | undefined,
): void {
  const cnNames = new Set(["cn"]);
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings === undefined || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      const imported = element.propertyName?.text ?? element.name.text;
      if (imported === "cn") cnNames.add(element.name.text);
    }
  }
  const classPositions = new Set<ts.Node>();
  function addClassList(expression: ts.Expression): void {
    if (ts.isIdentifier(expression)) {
      classPositions.add(expression);
    } else if (ts.isArrayLiteralExpression(expression)) {
      for (const element of expression.elements) addClassList(element);
    }
  }
  const first = sourceFile.statements[0];
  if (
    role !== undefined &&
    first !== undefined &&
    ts.isExpressionStatement(first) &&
    ts.isParenthesizedExpression(first.expression)
  ) {
    const value = first.expression.expression;
    if (role === "class-list") addClassList(value);
    else if (ts.isIdentifier(value)) classPositions.add(value);
  }
  // A parent marks its class positions before the walk reaches them.
  function visit(node: ts.Node): void {
    if (ts.isIdentifier(node)) {
      const constant = constants.get(node.text);
      if (constant === undefined || node === constant.declaration) return;
      const parent = node.parent;
      if (
        (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
        (ts.isQualifiedName(parent) && parent.right === node)
      ) {
        return;
      }
      if (classPositions.has(node)) constant.classPositions += 1;
      else constant.otherReference = true;
      return;
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      cnNames.has(node.expression.text)
    ) {
      for (const argument of node.arguments) {
        if (ts.isIdentifier(argument)) classPositions.add(argument);
      }
    } else if (
      ts.isJsxAttribute(node) &&
      node.initializer !== undefined &&
      ts.isJsxExpression(node.initializer) &&
      node.initializer.expression !== undefined
    ) {
      const value = node.initializer.expression;
      if (isClassListName(node.name)) {
        addClassList(value);
      } else if (
        ts.isIdentifier(node.name) &&
        node.name.text === "class" &&
        ts.isIdentifier(value)
      ) {
        classPositions.add(value);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
}

// The names as whole words in a run's text, which picks the runs worth
// parsing and stands in for a parse TSX rejects. A `.` before a name does
// not exclude it here: the spread in [...card] is a reference, and only the
// parse tells it from member access.
function constantNamePattern(names: Iterable<string>): RegExp {
  const alternatives = Array.from(names, function (name) {
    return name.replace(/\$/g, "\\$");
  });
  return new RegExp(
    `(?<![\\w$\\u0080-\\uffff])(?:${alternatives.join("|")})(?![\\w$\\u0080-\\uffff])`,
    "g",
  );
}

const QUOTED_LITERAL =
  /'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"|`((?:\\.|[^`\\])*)`/g;

// String literals inside a template expression run are class tokens in an
// unprovable position; poison them (KTD4).
function emitExpressionLiterals(
  expression: string,
  expressionStart: number,
  visitor: ClassContextVisitor,
): void {
  QUOTED_LITERAL.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = QUOTED_LITERAL.exec(expression)) !== null) {
    const content = match[1] ?? match[2] ?? match[3];
    if (tokenize(content).length === 0) continue;
    const start = expressionStart + match.index + 1;
    visitor.runtimeLiteral?.(
      {
        text: content,
        start,
        end: start + content.length,
        shorthand: false,
        quoted: true,
      },
      "class-expression",
    );
  }
}

// Svelte/Astro class="static {expr}" attributes: the static runs are real
// class tokens co-mingled with runtime output, so the whole attribute is
// unprovable and every static run poisons its tokens (the template-literal
// rule). Expression runs contribute their nested string literals.
function emitMixedTemplate(
  value: string,
  contentStart: number,
  visitor: ClassContextVisitor,
): void {
  function emitStatic(from: number, to: number): void {
    if (to <= from) return;
    const text = value.slice(from, to);
    if (tokenize(text).length === 0) return;
    visitor.runtimeLiteral?.(
      {
        text,
        start: contentStart + from,
        end: contentStart + to,
        shorthand: false,
        quoted: true,
      },
      "class-expression",
    );
  }
  let cursor = 0;
  let staticStart = 0;
  while (cursor < value.length) {
    if (value[cursor] !== "{") {
      cursor += 1;
      continue;
    }
    emitStatic(staticStart, cursor);
    // Brace-match the expression run, quote- and escape-aware.
    let depth = 0;
    let quote: string | null = null;
    let end = cursor;
    while (end < value.length) {
      const ch = value[end];
      if (quote !== null) {
        if (ch === "\\") {
          end += 2;
          continue;
        }
        if (ch === quote) quote = null;
        end += 1;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        quote = ch;
      } else if (ch === "{") {
        depth += 1;
      } else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          end += 1;
          break;
        }
      }
      end += 1;
    }
    emitExpressionLiterals(
      value.slice(cursor, end),
      contentStart + cursor,
      visitor,
    );
    cursor = end;
    staticStart = end;
  }
  emitStatic(staticStart, value.length);
}

function emitStaticClassAttribute(
  value: string,
  contentStart: number,
  contentEnd: number,
  visitor: ClassContextVisitor,
): void {
  visitor.enterRenameGroup?.("class-attribute");
  visitor.renameLiteral?.(
    {
      text: value,
      start: contentStart,
      end: contentEnd,
      shorthand: false,
      quoted: true,
    },
    "class-attribute",
  );
  visitor.exitRenameGroup?.("class-attribute", true, true);
}

interface SourceSpan {
  start: number;
  end: number;
}

// Vue 3 forbids mustache interpolation in attributes and plain HTML has no
// expression syntax, so their class attributes are always static; Svelte
// and Astro interpolate {}.
function emitClassAttribute(
  format: SfcFormat,
  text: string,
  span: SourceSpan,
  visitor: ClassContextVisitor,
): void {
  const value = text.slice(span.start, span.end);
  if ((format === "svelte" || format === "astro") && value.includes("{")) {
    emitMixedTemplate(value, span.start, visitor);
  } else {
    emitStaticClassAttribute(value, span.start, span.end, visitor);
  }
}

// Astro class:list={expr}: the expression between the outermost braces gets
// cn() semantics. A value without braces is not an expression.
function emitClassListAttribute(
  filePath: string,
  text: string,
  span: SourceSpan,
  visitor: ClassContextVisitor,
): void {
  const value = text.slice(span.start, span.end);
  const open = value.indexOf("{");
  const close = value.lastIndexOf("}");
  if (open === -1 || close <= open) return;
  walkBindingExpression(
    filePath,
    value.slice(open + 1, close),
    span.start + open + 1,
    visitor,
  );
}

type TreeNode = DefaultTreeAdapterMap["node"];
type TreeElement = DefaultTreeAdapterMap["element"];
type TreeTemplate = DefaultTreeAdapterMap["template"];

function isElement(node: TreeNode): node is TreeElement {
  return "tagName" in node && "attrs" in node;
}

function isAsciiWhitespace(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\f" || ch === "\r";
}

// parse5 attribute locations span the whole `name="value"` attribute; the
// value span is recovered by scanning the raw source inside that span.
function attributeValueSpan(
  source: string,
  start: number,
  end: number,
): { start: number; end: number } {
  let i = start;
  while (i < end && source[i] !== "=") i += 1;
  if (i >= end) return { start: end, end };
  i += 1;
  while (i < end && isAsciiWhitespace(source[i])) i += 1;
  if (i >= end) return { start: end, end };
  const quote = source[i];
  if (quote === '"' || quote === "'") {
    let close = source.indexOf(quote, i + 1);
    if (close === -1 || close > end) close = end;
    return { start: i + 1, end: close };
  }
  return { start: i, end };
}

// parse5 implies <body> as soon as <head> holds anything but head elements
// (a component tag, a {cond && ...} expression, <ClientRouter />), and
// implies <html> when content precedes it. The real start tag that arrives
// later only adds its attributes to the implied element, without source
// locations, so the class or class:list value span is recovered from that
// literal tag.
const HTML_OR_BODY_START_TAG = /<(html|body)(?=[\t\n\f\r />])/gi;

// HTML elements whose content the tokenizer reads as text. The template
// parse runs with scripting off, so <noscript> content is markup.
const RAW_TEXT_ELEMENTS = new Set([
  "iframe",
  "noembed",
  "noframes",
  "plaintext",
  "script",
  "style",
  "textarea",
  "title",
  "xmp",
]);

// Spans where a literal `<html` or `<body` is not a start tag: comments, the
// doctype, other tags (attribute values), and raw-text element contents.
// Plain text needs no span, since the tokenizer reads any `<body` there as a
// tag. Its spans would also be wrong here: parse5 merges adjacent text
// across the tags it drops, so one text node can cover the adopted tag.
function nonTagSpans(
  node: TreeNode,
  spans: Array<SourceSpan> = [],
): Array<SourceSpan> {
  function push(
    location: { startOffset: number; endOffset: number } | null | undefined,
  ): void {
    if (location === null || location === undefined) return;
    spans.push({ start: location.startOffset, end: location.endOffset });
  }
  let rawText = false;
  if (isElement(node)) {
    push(node.sourceCodeLocation?.startTag);
    push(node.sourceCodeLocation?.endTag);
    if (node.tagName === "template") {
      nonTagSpans((node as TreeTemplate).content, spans);
    }
    rawText =
      node.namespaceURI === parse5.html.NS.HTML &&
      RAW_TEXT_ELEMENTS.has(node.tagName);
  } else if (
    node.nodeName === "#comment" ||
    node.nodeName === "#documentType"
  ) {
    push(node.sourceCodeLocation);
  }
  if ("childNodes" in node) {
    for (const child of node.childNodes) {
      if (rawText) push(child.sourceCodeLocation);
      else nonTagSpans(child, spans);
    }
  }
  return spans;
}

// The value span of a start tag's first `name` attribute (the HTML tokenizer
// drops later duplicates), scanning attributes from just after the tag name;
// null when the tag has none. `name` is lowercase, as parse5 reports it.
function startTagAttributeSpan(
  source: string,
  from: number,
  name: string,
): SourceSpan | null {
  function isNameEnd(ch: string): boolean {
    return isAsciiWhitespace(ch) || ch === "/" || ch === ">" || ch === "=";
  }
  let i = from;
  while (i < source.length) {
    while (
      i < source.length &&
      (isAsciiWhitespace(source[i]) || source[i] === "/")
    ) {
      i += 1;
    }
    if (i >= source.length || source[i] === ">") return null;
    const nameStart = i;
    // A leading "=" is part of the attribute name.
    i += 1;
    while (i < source.length && !isNameEnd(source[i])) i += 1;
    const attributeName = source.slice(nameStart, i).toLowerCase();
    while (i < source.length && isAsciiWhitespace(source[i])) i += 1;
    let value: SourceSpan = { start: i, end: i };
    if (source[i] === "=") {
      i += 1;
      while (i < source.length && isAsciiWhitespace(source[i])) i += 1;
      const quote = source[i];
      if (quote === '"' || quote === "'") {
        const close = source.indexOf(quote, i + 1);
        // An unterminated value runs to EOF, where the tokenizer drops the tag.
        if (close === -1) return null;
        value = { start: i + 1, end: close };
        i = close + 1;
      } else {
        const valueStart = i;
        while (
          i < source.length &&
          !isAsciiWhitespace(source[i]) &&
          source[i] !== ">"
        ) {
          i += 1;
        }
        value = { start: valueStart, end: i };
      }
    }
    if (attributeName === name) return value;
  }
  return null;
}

// The first literal <html> or <body> start tag that carries the attribute is
// the one whose value parse5 adopted.
function adoptedAttributeSpan(
  templateText: string,
  tagName: string,
  attributeName: string,
  nonTags: ReadonlyArray<SourceSpan>,
): SourceSpan | null {
  HTML_OR_BODY_START_TAG.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = HTML_OR_BODY_START_TAG.exec(templateText)) !== null) {
    if (match[1].toLowerCase() !== tagName) continue;
    const at = match.index;
    const notATag = nonTags.some(function (span) {
      return span.start <= at && at < span.end;
    });
    if (notATag) continue;
    const span = startTagAttributeSpan(
      templateText,
      at + match[0].length,
      attributeName,
    );
    if (span !== null) return span;
  }
  return null;
}

// parse5's in-body and in-select modes drop table-fragment and nested
// <select> start tags with their attributes, and lowercased component names
// (<Select>, <Table>, <Title>) land on those paths or on raw-text elements.
// The parse copy renames such tags so every element reaches the tree:
// parser-special names get an `x` first letter (tr -> xr), and in the
// component formats every capitalized name also gets `-` second (Select ->
// x-lect), which no HTML element name has. The rename keeps every length,
// so no offset moves. Lowercase html, head, and body and the lowercase
// raw-text elements never match: the adoption recovery depends on them.
const PARSER_SPECIAL_TAGS = new Set([
  "table",
  "caption",
  "colgroup",
  "col",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "td",
  "th",
  "select",
]);

const TAG_NAME = /(<\/?)([A-Za-z][^\t\n\f\r />]*)(?=[\t\n\f\r />])/g;

function renameParserSpecialTags(format: SfcFormat, text: string): string {
  const components = format !== "html";
  return text.replace(TAG_NAME, function (match, open: string, name: string) {
    const first = name[0];
    if (components && first >= "A" && first <= "Z") {
      return name.length === 1 ? `${open}x` : `${open}x-${name.slice(2)}`;
    }
    if (PARSER_SPECIAL_TAGS.has(name.toLowerCase())) {
      return `${open}x${name.slice(1)}`;
    }
    return match;
  });
}

function walkTemplateElements(
  node: TreeNode,
  visit: (element: TreeElement) => void,
): void {
  if (isElement(node)) {
    visit(node);
    if (node.tagName === "template") {
      for (const child of (node as TreeTemplate).content.childNodes) {
        walkTemplateElements(child, visit);
      }
    }
  }
  if ("childNodes" in node) {
    for (const child of node.childNodes) {
      walkTemplateElements(child, visit);
    }
  }
}

export function walkSfcClassContexts(
  filePath: string,
  text: string,
  visitor: ClassContextVisitor,
): void {
  const format = sfcFormatFor(filePath);
  if (format === null) return;
  const regions = findScriptRegions(format, text);
  // KTD5: the frontmatter's class constants, counted across the script
  // parse here and every template brace run after the element walk.
  let constants: Map<string, ClassConstant> = new Map();

  if (regions.length > 0) {
    const masked = maskOutside(
      text,
      regions.map(function (region) {
        return { start: region.contentStart, end: region.contentEnd };
      }),
    );
    const langs = new Set(
      regions.map(function (region) {
        return region.lang;
      }),
    );
    // One parse for all script blocks: the blocks are all module-scope code,
    // so concatenating them at their absolute offsets is syntactically safe.
    // TSX wins over TS wins over JSX (a parse superset for plain JS).
    const kind = langs.has("tsx") ? "tsx" : langs.has("ts") ? "ts" : "jsx";
    const sourceFile = parseSourceModule(`${filePath}::script.${kind}`, masked);
    walkClassContexts(sourceFile, visitor);
    const frontmatter = regions.find(function (region) {
      return region.frontmatter;
    });
    if (frontmatter !== undefined) {
      constants = frontmatterConstants(sourceFile, frontmatter);
      if (constants.size > 0) {
        countConstantReferences(sourceFile, constants, undefined);
      }
    }
  }

  const templateMask = regions.map(function (region) {
    return { start: region.contentStart, end: region.contentEnd };
  });
  // The frontmatter fences are not markup either: left in, the `---` text
  // makes parse5 imply <html>, <head>, and <body> ahead of the real tags.
  if (format === "astro") {
    const frontmatter = FRONTMATTER.exec(text);
    if (frontmatter !== null) {
      templateMask.push({ start: 0, end: frontmatter[0].length });
    }
  }
  let templateText = maskSpans(text, templateMask);
  // Expression markup is parsed from the template text before run masking.
  const unmaskedTemplate = templateText;
  // Only Svelte and Astro interpolate {} in templates; Vue and plain HTML
  // attribute values are always literal (or always-quoted expressions).
  // Svelte expressions cannot hold markup, so its runs stay JavaScript only.
  let runs: Array<BraceRun> = [];
  let markupRuns: Array<BraceRun> = [];
  if (format === "astro") {
    const found = findAstroBraceRuns(templateText);
    runs = found.runs;
    markupRuns = runs.filter(function (run) {
      return run.markup;
    });
    templateText = found.masked;
  } else if (format === "svelte") {
    templateText = maskBraceExpressions(templateText);
  }
  templateText = renameParserSpecialTags(format, templateText);
  // Scripting off makes <noscript> content elements with locations instead
  // of one raw text node. nonTagSpans mirrors it through RAW_TEXT_ELEMENTS.
  const document = parse5.parse(templateText, {
    sourceCodeLocationInfo: true,
    scriptingEnabled: false,
  });

  let nonTags: Array<SourceSpan> | null = null;

  // KTD4: a run inside a start tag is an attribute value, handled below,
  // and a run in a raw-text element's text (CSS in <style>) or a comment is
  // not an expression. Every other run that holds markup is a content run,
  // walked when the element walk passes it so events keep document order.
  let contentRuns: Array<BraceRun> = [];
  if (markupRuns.length > 0) {
    const spans = nonTagSpans(document);
    nonTags = spans;
    contentRuns = markupRuns.filter(function (run) {
      return !spans.some(function (span) {
        return span.start <= run.start && run.start < span.end;
      });
    });
  }
  // One parse per run, shared by the markup walk and the KTD5 count.
  const parsedRuns = new Map<BraceRun, ParsedRun | null>();
  function parsedRun(run: BraceRun): ParsedRun | null {
    let parsed = parsedRuns.get(run);
    if (parsed === undefined) {
      parsed = parseBraceRun(filePath, unmaskedTemplate, run);
      parsedRuns.set(run, parsed);
    }
    return parsed;
  }
  let nextRun = 0;
  function walkContentRunsBefore(offset: number): void {
    while (
      nextRun < contentRuns.length &&
      contentRuns[nextRun].start < offset
    ) {
      walkExpressionMarkup(parsedRun(contentRuns[nextRun]), visitor);
      nextRun += 1;
    }
  }

  // KTD5: the runs that are the whole unquoted value of a class or
  // class:list attribute. An unquoted value also takes the `/` of a `/>`
  // written without a space.
  const runsByStart = new Map<number, BraceRun>();
  if (constants.size > 0) {
    for (const run of runs) runsByStart.set(run.start, run);
  }
  const runRoles = new Map<BraceRun, RunRole>();
  function noteAttributeRun(span: SourceSpan, role: RunRole): void {
    const run = runsByStart.get(span.start);
    if (run === undefined) return;
    const quote = text[span.start - 1];
    if (quote === '"' || quote === "'") return;
    if (!/^\/*$/.test(text.slice(run.end, span.end))) return;
    runRoles.set(run, role);
  }

  walkTemplateElements(document, function (element) {
    const elementStart = element.sourceCodeLocation?.startOffset;
    if (elementStart !== undefined) walkContentRunsBefore(elementStart);
    const locations = element.sourceCodeLocation?.attrs;
    for (const attr of element.attrs) {
      const location = locations?.[attr.name];
      if (location === undefined) {
        if (element.tagName !== "html" && element.tagName !== "body") continue;
        const classList = format === "astro" && attr.name === "class:list";
        if (attr.name !== "class" && !classList) continue;
        if (nonTags === null) nonTags = nonTagSpans(document);
        const span = adoptedAttributeSpan(
          templateText,
          element.tagName,
          attr.name,
          nonTags,
        );
        if (span === null) continue;
        if (classList) {
          emitClassListAttribute(filePath, text, span, visitor);
          noteAttributeRun(span, "class-list");
        } else {
          emitClassAttribute(format, text, span, visitor);
          noteAttributeRun(span, "class");
        }
        continue;
      }
      if (attr.name === "class") {
        const span = attributeValueSpan(
          text,
          location.startOffset,
          location.endOffset,
        );
        emitClassAttribute(format, text, span, visitor);
        noteAttributeRun(span, "class");
        continue;
      }
      if (
        format === "vue" &&
        (attr.name === ":class" || attr.name === "v-bind:class")
      ) {
        const span = attributeValueSpan(
          text,
          location.startOffset,
          location.endOffset,
        );
        if (span.end <= span.start) continue;
        walkBindingExpression(
          filePath,
          text.slice(span.start, span.end),
          span.start,
          visitor,
        );
        continue;
      }
      if (format === "astro" && attr.name === "class:list") {
        const span = attributeValueSpan(
          text,
          location.startOffset,
          location.endOffset,
        );
        emitClassListAttribute(filePath, text, span, visitor);
        noteAttributeRun(span, "class-list");
        continue;
      }
      if (format === "svelte" && attr.name.startsWith("class:")) {
        // The class name lives in the attribute NAME (class:mb-16). parse5
        // lowercases names, so the token is recovered from the raw bytes —
        // the span math is case-insensitive because lengths match. The
        // directive's value is a boolean condition and never a class.
        const nameStart = location.startOffset;
        const tokenStart = nameStart + "class:".length;
        const tokenEnd = nameStart + attr.name.length;
        if (tokenEnd <= tokenStart) continue;
        const token = text.slice(tokenStart, tokenEnd);
        if (token === "") continue;
        visitor.enterRenameGroup?.("classList-key");
        visitor.renameLiteral?.(
          {
            text: token,
            start: tokenStart,
            end: tokenEnd,
            shorthand: false,
            quoted: false,
          },
          "classList-key",
        );
        // Conditionally applied: never a consolidation list (R3).
        visitor.exitRenameGroup?.("classList-key", true, false);
      }
    }
  });
  walkContentRunsBefore(Infinity);

  if (constants.size === 0) return;
  // KTD5: every brace run is code, wherever it sits. A run that names a
  // constant is counted on its parse; a run TSX rejects has none, so each
  // occurrence of a name in its text is an other reference.
  const names = constantNamePattern(constants.keys());
  for (const run of runs) {
    const named = new Set<string>();
    for (const match of unmaskedTemplate
      .slice(run.start, run.end)
      .matchAll(names)) {
      named.add(match[0]);
    }
    if (named.size === 0) continue;
    const parsed = parsedRun(run);
    if (parsed !== null) {
      countConstantReferences(parsed.sourceFile, constants, runRoles.get(run));
      continue;
    }
    for (const name of named) {
      const constant = constants.get(name);
      if (constant !== undefined) constant.otherReference = true;
    }
  }
  // A constant whose every reference is a class position contributes its
  // literal once, in a group of its own. The group is dynamic and never a
  // consolidation list: the constant may be one of several class sources.
  for (const constant of constants.values()) {
    if (constant.otherReference || constant.classPositions === 0) continue;
    const literal = constant.literal;
    visitor.enterRenameGroup?.("class-attribute");
    visitor.renameLiteral?.(
      {
        text: literal.text,
        start: literal.getStart() + 1,
        end: literal.getEnd() - 1,
        shorthand: false,
        quoted: true,
      },
      "class-attribute",
    );
    visitor.exitRenameGroup?.("class-attribute", true, false);
  }
}

// One entry point for modules of every supported flavor: SFCs get the
// two-region walk above, plain TS/JS modules the shared TS walker.
export function walkModuleContexts(
  filePath: string,
  text: string,
  visitor: ClassContextVisitor,
): void {
  if (isSfcModule(filePath)) {
    walkSfcClassContexts(filePath, text, visitor);
    return;
  }
  walkClassContexts(parseSourceModule(filePath, text), visitor);
}
