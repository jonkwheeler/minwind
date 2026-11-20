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
export function maskBraceExpressions(text: string): {
  masked: string;
  runs: Array<SourceSpan>;
} {
  const runs: Array<SourceSpan> = [];
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
    runs.push({ start: i, end: end + 1 });
    i = end + 1;
  }
  return { masked: chars.join(""), runs };
}

// An Astro brace run: `start` at its `{`, `end` just past its `}`. markup
// is true when the run holds expression markup, and voidTagEnds are the
// offsets of the `>` ending each void element written without `/>` in it.
export interface BraceRun {
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

const UNTERMINATED = -1;

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
export function findAstroBraceRuns(text: string): {
  masked: string;
  runs: Array<BraceRun>;
} {
  let markup = false;
  let voidTagEnds: Array<number> = [];

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
    return UNTERMINATED;
  }

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
        if (i === UNTERMINATED) return UNTERMINATED;
      } else {
        i += 1;
      }
    }
    return UNTERMINATED;
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
        if (i === UNTERMINATED) return UNTERMINATED;
        operand = false;
      } else if (ch === "/" && next === "/") {
        const lineEnd = text.indexOf("\n", i);
        if (lineEnd === -1) return UNTERMINATED;
        i = lineEnd + 1;
      } else if (ch === "/" && next === "*") {
        const close = text.indexOf("*/", i + 2);
        if (close === -1) return UNTERMINATED;
        i = close + 2;
      } else if (
        ch === "<" &&
        operand &&
        (isAsciiLetter(next) || next === ">")
      ) {
        i = scanMarkup(i);
        if (i === UNTERMINATED) return UNTERMINATED;
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
    return UNTERMINATED;
  }

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
        if (i === UNTERMINATED) return null;
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

  function scanMarkup(from: number): number {
    markup = true;
    let i = from;
    let depth = 0;
    while (i < text.length) {
      const ch = text[i];
      const next = text[i + 1];
      if (ch === "{") {
        i = scanScript(i + 1);
        if (i === UNTERMINATED) return UNTERMINATED;
      } else if (text.startsWith("<!--", i)) {
        const close = text.indexOf("-->", i + 4);
        if (close === -1) return UNTERMINATED;
        i = close + 3;
      } else if (ch === "<" && next === ">") {
        depth += 1;
        i += 2;
      } else if (ch === "<" && next === "/") {
        const close = text.indexOf(">", i);
        if (close === -1) return UNTERMINATED;
        i = close + 1;
        depth -= 1;
        if (depth <= 0) return i;
      } else if (ch !== "<" || !isAsciiLetter(next)) {
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
        if (tag === null) return UNTERMINATED;
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
    return UNTERMINATED;
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
    if (end === UNTERMINATED) {
      i += 1;
      continue;
    }
    runs.push({ start: i, end, markup, voidTagEnds });
    for (let k = i + 1; k < end - 1; k += 1) chars[k] = "x";
    i = end;
  }
  return { masked: chars.join(""), runs };
}

export interface SourceSpan {
  start: number;
  end: number;
}

export function isAsciiWhitespace(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\f" || ch === "\r";
}
