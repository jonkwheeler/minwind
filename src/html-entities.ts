import { decodeHTMLAttribute, escapeUTF8 } from "entities";
import { DecodingMode, EntityDecoder, htmlDecodeTree } from "entities/decode";
import { tokenize } from "./class-contexts.js";

// KTD6: built HTML, and markup strings in built bundles, write `&`, `<`, `>`,
// and quotes in a class attribute as character references (Astro writes
// [&_a]:underline as [&amp;_a]:underline). The DOM decodes them, so the
// decoded token is the class the stylesheet selects. Source formats are not
// decoded: their attributes hold the raw `&` the registry was built from.

// One class token of an encoded attribute value: its raw bytes, their offset
// in the value, and the token the DOM decodes them to.
export interface EncodedClassToken {
  raw: string;
  offset: number;
  token: string;
}

// The value's tokens, split on raw ASCII whitespace and decoded one by one.
// null when the decoded value splits differently: an encoded separator
// (&#32;, &Tab;) joins DOM tokens inside one raw token, so no raw span holds
// exactly one of them.
export function decodeClassTokens(
  value: string,
): Array<EncodedClassToken> | null {
  const tokens: Array<EncodedClassToken> = [];
  for (const match of value.matchAll(/[^ \t\n\f\r]+/g)) {
    tokens.push({
      raw: match[0],
      offset: match.index,
      token: decodeHTMLAttribute(match[0]),
    });
  }
  const decoded = tokenize(decodeHTMLAttribute(value));
  if (decoded.length !== tokens.length) return null;
  for (let i = 0; i < tokens.length; i += 1) {
    if (decoded[i] !== tokens[i].token) return null;
  }
  return tokens;
}

// A generated name written into an encoded attribute value. Only dialect
// names, which keep Tailwind punctuation, hold anything to escape.
export function escapeClassName(name: string): string {
  return escapeUTF8(name);
}

interface Span {
  start: number;
  end: number;
}

// A text a leak scan searches, and the raw span behind each of its spans.
export interface LeakView {
  text: string;
  rawSpan: (start: number, end: number) => Span;
}

// One character reference: its raw span and the span of what it decodes to.
interface Reference {
  raw: Span;
  decoded: Span;
}

// The text with every character reference decoded, or null when it holds
// none. A span of the copy maps back to raw bytes through the references,
// widened to cover any reference it cuts into.
function decodedView(raw: string): LeakView | null {
  let emitted = "";
  const decoder = new EntityDecoder(htmlDecodeTree, function (codePoint) {
    emitted += String.fromCodePoint(codePoint);
  });
  const references: Array<Reference> = [];
  let text = "";
  let copied = 0;
  let at = raw.indexOf("&");
  while (at !== -1) {
    decoder.startEntity(DecodingMode.Attribute);
    // The length counts the `&`; it is negative when the text ends first.
    let length = decoder.write(raw, at + 1);
    if (length < 0) length = decoder.end();
    if (length === 0) {
      at = raw.indexOf("&", at + 1);
      continue;
    }
    text += raw.slice(copied, at);
    references.push({
      raw: { start: at, end: at + length },
      decoded: { start: text.length, end: text.length + emitted.length },
    });
    text += emitted;
    emitted = "";
    copied = at + length;
    at = raw.indexOf("&", copied);
  }
  if (references.length === 0) return null;
  text += raw.slice(copied);

  function rawPosition(position: number, end: boolean): number {
    // The last reference whose decoded text starts at or before position.
    let low = 0;
    let high = references.length - 1;
    let found = -1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (references[mid].decoded.start <= position) {
        found = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    if (found === -1) return position;
    const reference = references[found];
    if (position >= reference.decoded.end) {
      return reference.raw.end + position - reference.decoded.end;
    }
    if (position === reference.decoded.start) return reference.raw.start;
    return end ? reference.raw.end : reference.raw.start;
  }

  return {
    text,
    rawSpan: function (start, end) {
      return { start: rawPosition(start, false), end: rawPosition(end, true) };
    },
  };
}

// The leak scans always search the raw text, because a reference in a
// JavaScript string is literal (&copy;). With decode, they also search the
// decoded text, which holds a token written encoded in a data-* value or in
// island props.
export function leakViews(text: string, decode: boolean): Array<LeakView> {
  const views: Array<LeakView> = [
    {
      text,
      rawSpan: function (start, end) {
        return { start, end };
      },
    },
  ];
  if (decode && text.includes("&")) {
    const decoded = decodedView(text);
    if (decoded !== null) views.push(decoded);
  }
  return views;
}
