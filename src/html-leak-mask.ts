import * as parse5 from "parse5";
import type * as ts from "typescript";
import type { SourceSpan } from "./brace-runs.js";
import {
  objectLiteralKeys,
  parseSourceModule,
  type LiteralOccurrence,
} from "./class-contexts.js";
import { leakViews } from "./html-entities.js";
import {
  maskCommentsAndReservedWords,
  selectorClassReferences,
} from "./js-mask.js";
import {
  attributeValueSpan,
  isElement,
  maskSpans,
  renameParserSpecialTags,
  walkTemplateElements,
  type TreeDocument,
  type TreeElement,
  type TreeNode,
  type TreeTemplate,
} from "./sfc.js";
import { parseExpression } from "./template-expressions.js";

// KTD8: built-HTML attributes whose values never hold a class name. A
// script that copies one into a class list is unsupported, like a class
// name fetched at runtime. `content` joins them on <meta> only.
const NON_CLASS_ATTRIBUTES = new Set([
  "role",
  "type",
  "alt",
  "title",
  "placeholder",
  "lang",
  "dir",
  "rel",
  "autocomplete",
  "loading",
  "decoding",
  "fetchpriority",
  "style",
]);

function isNonClassAttribute(element: TreeElement, name: string): boolean {
  return (
    NON_CLASS_ATTRIBUTES.has(name) ||
    name.startsWith("aria-") ||
    (name === "content" && element.tagName === "meta")
  );
}

// The type values a browser runs as script: none, empty, module, or a
// JavaScript MIME type essence (the HTML standard's list).
const JAVASCRIPT_TYPES = new Set([
  "",
  "module",
  "application/ecmascript",
  "application/javascript",
  "application/x-ecmascript",
  "application/x-javascript",
  "text/ecmascript",
  "text/javascript",
  "text/javascript1.0",
  "text/javascript1.1",
  "text/javascript1.2",
  "text/javascript1.3",
  "text/javascript1.4",
  "text/javascript1.5",
  "text/jscript",
  "text/livescript",
  "text/x-ecmascript",
  "text/x-javascript",
]);

// Every other type is data: JSON (a JSON MIME type, an import map, or
// speculation rules), or else markup that a script compiles at runtime,
// such as Vue's text/x-template.
type ScriptContent = "javascript" | "json-ld" | "json" | "markup";

function scriptContent(element: TreeElement): ScriptContent {
  const type = element.attrs.find(function (attr) {
    return attr.name === "type";
  });
  if (type === undefined) return "javascript";
  const essence = type.value
    .replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, "")
    .toLowerCase();
  if (JAVASCRIPT_TYPES.has(essence)) return "javascript";
  if (essence === "application/ld+json") return "json-ld";
  if (
    essence === "importmap" ||
    essence === "speculationrules" ||
    essence.endsWith("json")
  ) {
    return "json";
  }
  return "markup";
}

// The attribute values a browser or a framework runs as JavaScript: on*
// handlers, Alpine's @*, x-on:*, x-init, x-effect, x-data, and x-bind:*
// or :* bindings, and htmx's hx-on handlers.
function holdsJavaScript(name: string): boolean {
  return (
    name.startsWith("on") ||
    name.startsWith("@") ||
    name.startsWith(":") ||
    name.startsWith("x-on:") ||
    name.startsWith("x-bind:") ||
    name === "x-init" ||
    name === "x-effect" ||
    name === "x-data" ||
    name.startsWith("hx-on:") ||
    name.startsWith("hx-on-")
  );
}

// The leak text of a built page, and the object keys and selector strings
// it holds.
export interface HtmlLeakText {
  text: string;
  objectKeys: Array<LiteralOccurrence>;
  selectorReferences: Array<LiteralOccurrence>;
}

// KTD8: the leak text of a built page, with the positions that never hold a
// class reference blanked: text, comments, JSON-LD, and the values of
// NON_CLASS_ATTRIBUTES. Text a script reads back as a form value stays:
// a <textarea>'s, and an <option>'s without a value attribute, which the
// option's value returns. Executable scripts keep everything but comments
// and reserved words (KTD9). Every other script type, every other
// attribute (data-*, value, on* handlers, island props), and attributes
// the parser adopted without a location stay scanned. `document` is the
// tree walkSfcClassContexts parsed from the same file, so its offsets index
// `text`. KTD15: objectKeys are the identifier object keys of executable
// scripts and of scanned attribute values that parse as a JavaScript
// expression once decoded (Alpine :class and x-data), less the objects
// `skipObject` drops. KTD16: selectorReferences are the class selectors
// inside the strings of executable scripts and of the attribute values
// holdsJavaScript names, read decoded. The attribute values of markup held in a
// script of another non-JSON type (text/x-template) give both too.
export function maskHtmlLeakText(
  filePath: string,
  text: string,
  document: TreeDocument,
  skipObject?: (node: ts.ObjectLiteralExpression) => boolean,
): HtmlLeakText {
  const blank: Array<SourceSpan> = [];
  const scripts: Array<SourceSpan> = [];
  const objectKeys: Array<LiteralOccurrence> = [];
  const selectorReferences: Array<LiteralOccurrence> = [];

  function readAttribute(name: string, span: SourceSpan): void {
    const raw = text.slice(span.start, span.end);
    const script = holdsJavaScript(name);
    if (!script && !raw.includes("{")) return;
    const views = leakViews(raw, true);
    const view = views[views.length - 1];
    function inPage(
      occurrence: LiteralOccurrence,
      toView: (position: number) => number,
    ): LiteralOccurrence {
      const at = view.rawSpan(toView(occurrence.start), toView(occurrence.end));
      return {
        ...occurrence,
        start: span.start + at.start,
        end: span.start + at.end,
      };
    }
    const parsed = raw.includes("{")
      ? parseExpression(filePath, view.text, 0, "ts")
      : null;
    if (parsed !== null) {
      for (const key of objectLiteralKeys(parsed.sourceFile, skipObject)) {
        objectKeys.push(inPage(key, parsed.toOriginal));
      }
    }
    if (!script) return;
    // A value that is not one expression is a handler body of statements.
    const body = parsed ?? {
      sourceFile: parseSourceModule(`${filePath}::attribute.js`, view.text),
      toOriginal: function (position: number): number {
        return position;
      },
    };
    for (const reference of selectorClassReferences(body.sourceFile)) {
      selectorReferences.push(inPage(reference, body.toOriginal));
    }
  }
  // `offset` places the element's locations in `text`; `mask` blanks the
  // values of NON_CLASS_ATTRIBUTES.
  function readAttributes(
    element: TreeElement,
    offset: number,
    mask: boolean,
  ): void {
    const attributes = element.sourceCodeLocation?.attrs;
    for (const attr of element.attrs) {
      const at = attributes?.[attr.name];
      if (at === undefined) continue;
      const span = attributeValueSpan(
        text,
        offset + at.startOffset,
        offset + at.endOffset,
      );
      if (isNonClassAttribute(element, attr.name)) {
        if (mask) blank.push(span);
      } else if (attr.name !== "class") {
        readAttribute(attr.name, span);
      }
    }
  }
  // Markup a script compiles at runtime keeps its text and every attribute
  // in the whole-word scan; only the attribute reads are added.
  function readMarkup(content: SourceSpan): void {
    const fragment = parse5.parseFragment(
      renameParserSpecialTags("html", text.slice(content.start, content.end)),
      { sourceCodeLocationInfo: true, scriptingEnabled: false },
    );
    walkTemplateElements(fragment, function (element) {
      readAttributes(element, content.start, false);
    });
  }
  // `valueText`: the node sits in a <textarea> or a value-less <option>.
  function visit(node: TreeNode, valueText: boolean): void {
    const location = node.sourceCodeLocation;
    if (node.nodeName === "#comment" || node.nodeName === "#text") {
      if (location === null || location === undefined) return;
      const span = { start: location.startOffset, end: location.endOffset };
      if (node.nodeName === "#text" && valueText) return;
      // parse5 merges the text on both sides of a tag it drops or adopts,
      // so a text node holding `<` can span an adopted <body> start tag,
      // whose attributes stay scanned.
      if (
        node.nodeName === "#text" &&
        text.slice(span.start, span.end).includes("<")
      ) {
        return;
      }
      blank.push(span);
      return;
    }
    if (!isElement(node)) {
      if ("childNodes" in node) {
        for (const child of node.childNodes) visit(child, valueText);
      }
      return;
    }
    readAttributes(node, 0, true);
    if (node.tagName === "script") {
      const first = node.childNodes[0]?.sourceCodeLocation;
      const last =
        node.childNodes[node.childNodes.length - 1]?.sourceCodeLocation;
      if (first === null || first === undefined) return;
      if (last === null || last === undefined) return;
      const content = { start: first.startOffset, end: last.endOffset };
      const kind = scriptContent(node);
      if (kind === "json-ld") blank.push(content);
      else if (kind === "javascript") scripts.push(content);
      else if (kind === "markup") readMarkup(content);
      return;
    }
    const childValueText =
      valueText ||
      node.tagName === "textarea" ||
      (node.tagName === "option" &&
        !node.attrs.some(function (attr) {
          return attr.name === "value";
        }));
    if (node.tagName === "template") {
      visit((node as TreeTemplate).content, childValueText);
    }
    for (const child of node.childNodes) visit(child, childValueText);
  }
  visit(document, false);

  const blanked = maskSpans(text, blank);
  const maskedScripts: Array<SourceSpan & { masked: string }> = [];
  for (const span of scripts) {
    const script = parseSourceModule(
      `${filePath}::script.js`,
      text.slice(span.start, span.end),
    );
    maskedScripts.push({
      ...span,
      masked: maskCommentsAndReservedWords(script),
    });
    for (const key of objectLiteralKeys(script, skipObject)) {
      objectKeys.push({
        ...key,
        start: span.start + key.start,
        end: span.start + key.end,
      });
    }
    for (const reference of selectorClassReferences(script)) {
      selectorReferences.push({
        ...reference,
        start: span.start + reference.start,
        end: span.start + reference.end,
      });
    }
  }
  maskedScripts.sort(function (a, b) {
    return a.start - b.start;
  });
  let leakText = "";
  let copied = 0;
  for (const script of maskedScripts) {
    leakText += blanked.slice(copied, script.start) + script.masked;
    copied = script.end;
  }
  leakText += blanked.slice(copied);
  return { text: leakText, objectKeys, selectorReferences };
}
