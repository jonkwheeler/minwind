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
// mirroring the template-literal rule.
//
// Both walks run against whitespace masks of the original file — script
// contents blanked for the template parse, everything else blanked for the
// script parse — so every span is absolute into the real file and the two
// walks can never see each other's regions (an HTML-looking string inside a
// script never becomes a phantom element).

export const SFC_PATTERN = /\.(?:vue|svelte|astro)$/;

type SfcFormat = "vue" | "svelte" | "astro";

export function sfcFormatFor(filePath: string): SfcFormat | null {
  const clean = filePath.split("?")[0];
  if (clean.endsWith(".vue")) return "vue";
  if (clean.endsWith(".svelte")) return "svelte";
  if (clean.endsWith(".astro")) return "astro";
  return null;
}

export function isSfcModule(filePath: string): boolean {
  return sfcFormatFor(filePath) !== null;
}

interface ContentRegion {
  contentStart: number;
  contentEnd: number;
  lang: string;
}

const SCRIPT_TAG = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
const STYLE_TAG = /<style\b[^>]*>[\s\S]*?<\/style\s*>/gi;
const LANG_ATTRIBUTE = /\blang\s*=\s*["']([^"']+)["']/i;

// Astro frontmatter is only valid as the very first bytes of the file.
const FRONTMATTER = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---/;

function findScriptRegions(
  format: SfcFormat,
  text: string,
): Array<ContentRegion> {
  const regions: Array<ContentRegion> = [];
  if (format === "astro") {
    const frontmatter = FRONTMATTER.exec(text);
    if (frontmatter !== null) {
      const contentStart = frontmatter[0].indexOf(frontmatter[1]);
      regions.push({
        contentStart,
        contentEnd: contentStart + frontmatter[1].length,
        lang: "ts",
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
      // Astro compiles its client scripts as TypeScript; Vue and Svelte
      // default to plain JS unless lang says otherwise.
      lang:
        langMatch !== null
          ? langMatch[1].toLowerCase()
          : format === "astro"
            ? "ts"
            : "js",
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
// contents with x's (braces kept, quote- and escape-aware, newlines
// preserved — spaces would re-split the value) so parse5 sees a single
// space-free value; the run's original bytes are recovered from the
// unmasked text at the same offsets. Vue needs no masking: its attributes
// are always quoted and its bindings always expressions. An unterminated
// run (a stray brace in text) is left alone.
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
    for (let k = i + 1; k < end; k += 1) {
      if (chars[k] !== "\n" && chars[k] !== "\r") chars[k] = "x";
    }
    i = end + 1;
  }
  return chars.join("");
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

// Forwards callbacks with literal spans shifted into the original file.
// unprovableTemplate cannot be shifted — the node belongs to a synthetic
// parse — so its static fragments are re-emitted as runtime literals, which
// poison (pre-pass) and warn (transform) exactly like the template path.
function offsetVisitor(
  visitor: ClassContextVisitor,
  offset: number,
): ClassContextVisitor {
  function shift(literal: LiteralOccurrence): LiteralOccurrence {
    return {
      text: literal.text,
      start: literal.start + offset,
      end: literal.end + offset,
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
  walkClassContexts(
    sourceFile,
    offsetVisitor(visitor, expressionStart - "cn(".length),
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
  }

  let templateText = maskSpans(
    text,
    regions.map(function (region) {
      return { start: region.contentStart, end: region.contentEnd };
    }),
  );
  if (format !== "vue") templateText = maskBraceExpressions(templateText);
  const document = parse5.parse(templateText, {
    sourceCodeLocationInfo: true,
  });

  walkTemplateElements(document, function (element) {
    const locations = element.sourceCodeLocation?.attrs;
    if (locations === undefined) return;
    for (const attr of element.attrs) {
      const location = locations[attr.name];
      if (location === undefined) continue;
      if (attr.name === "class") {
        const span = attributeValueSpan(
          text,
          location.startOffset,
          location.endOffset,
        );
        const value = text.slice(span.start, span.end);
        // Vue 3 forbids mustache interpolation in attributes, so a Vue class
        // attribute is always static; Svelte and Astro interpolate {}.
        if (format !== "vue" && value.includes("{")) {
          emitMixedTemplate(value, span.start, visitor);
        } else {
          emitStaticClassAttribute(value, span.start, span.end, visitor);
        }
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
        const value = text.slice(span.start, span.end);
        const open = value.indexOf("{");
        const close = value.lastIndexOf("}");
        if (open === -1 || close <= open) continue;
        walkBindingExpression(
          filePath,
          value.slice(open + 1, close),
          span.start + open + 1,
          visitor,
        );
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
