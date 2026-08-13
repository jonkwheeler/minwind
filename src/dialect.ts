import { isGeneratedIdent } from "./names.js";
import { DIALECT_IDS, type DialectId } from "./dialect-ids.js";
import { applyRules } from "./dialect-rules.js";
import { specialFor } from "./dialect-specials.js";

export { DIALECT_IDS, type DialectId };

export function isDialectId(value: string): value is DialectId {
  for (const id of DIALECT_IDS) {
    if (id === value) return true;
  }
  return false;
}

export function dialectClassName(token: string, dialect: DialectId): string {
  const parts = tokenParts(token);
  const spoken: Array<string> = [];
  for (const part of parts) {
    if (dialect === "emojis" && part === "-") continue;
    spoken.push(respellPart(part, dialect));
  }
  let name = spoken.join("");
  if (name === "") {
    throw new Error(
      `minwind: dialect name for "${token}" is empty after respell`,
    );
  }
  if (/^[0-9]/.test(name)) name = `_${name}`;
  if (!isGeneratedIdent(name)) {
    throw new Error(
      `minwind: dialect name "${name}" for "${token}" is not a valid` +
        ` CSS identifier`,
    );
  }
  return name;
}

export function createDialectHasher(
  dialect: DialectId,
): (token: string) => string {
  return function (token: string): string {
    return dialectClassName(token, dialect);
  };
}

const DIGIT_EMOJI: Record<string, string> = {
  "0": "0️⃣",
  "1": "1️⃣",
  "2": "2️⃣",
  "3": "3️⃣",
  "4": "4️⃣",
  "5": "5️⃣",
  "6": "6️⃣",
  "7": "7️⃣",
  "8": "8️⃣",
  "9": "9️⃣",
};

function toEmojiDigits(value: string): string {
  const chars = value.split("");
  const out: Array<string> = [];
  let i = 0;
  while (i < chars.length) {
    const mapped = DIGIT_EMOJI[chars[i]];
    if (mapped !== undefined) {
      out.push(mapped);
    } else {
      out.push(chars[i]);
    }
    i += 1;
  }
  return out.join("");
}

function sizeToken(word: string, dialect: DialectId): string | null {
  const match = word.match(/^(\d+)xl$/);
  if (!match) return null;
  const n = match[1];
  if (dialect === "emojis") return toEmojiDigits(n) + "🐋";
  if (dialect === "texas") return n + "-eeeecks-ellll";
  if (dialect === "canada") return n + "-ecks-ell-eh";
  if (dialect === "savannah") return n + "-eeeeecks-elllll";
  if (dialect === "ghetto") return n + "-ecksell";
  if (dialect === "degenerate") return n + "-exx-eww";
  return n + "-ecks-ell";
}

function applyWord(word: string, dialect: DialectId): string {
  const sized = sizeToken(word, dialect);
  if (sized !== null) return sized;
  const special = specialFor(word, dialect);
  if (special !== null) return special;
  return applyRules(word, dialect);
}

function respellPart(part: string, dialect: DialectId): string {
  if (!/^[a-z0-9]+$/.test(part)) return part;
  if (/^[0-9]+$/.test(part)) {
    if (dialect === "emojis") return toEmojiDigits(part);
    return part;
  }
  return applyWord(part, dialect);
}

// Alphanumeric runs stay together so `2xl` is one word. Hyphens, colons,
// and other punctuation stay as their own parts.
function tokenParts(token: string): Array<string> {
  const source = token.toLowerCase();
  const parts: Array<string> = [];
  let i = 0;
  while (i < source.length) {
    const code = source.charCodeAt(i);
    if (isAlnum(code)) {
      let j = i + 1;
      while (j < source.length && isAlnum(source.charCodeAt(j))) {
        j += 1;
      }
      parts.push(source.slice(i, j));
      i = j;
    } else {
      parts.push(source[i]);
      i += 1;
    }
  }
  return parts;
}

function isAlnum(code: number): boolean {
  return (code >= 48 && code <= 57) || (code >= 97 && code <= 122);
}
