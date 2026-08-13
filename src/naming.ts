import {
  createDialectHasher,
  createMapsHasher,
  isDialectId,
  type DialectId,
} from "./dialect.js";
import {
  createHasher,
  hashClassName,
  NAME_PATTERN,
  resolveHashAlphabet,
  resolveHashPrefix,
} from "./names.js";
import { vocabularyForTheme, type ThemeId } from "./themes/index.js";
import { compareCodeUnits } from "./util.js";

// Themed naming: an opt-in alternative to content-hash naming (KTD5) for
// sites that want personality in the DOM. 'words' deals a curated
// vocabulary. 'quotes' splits sentences into the same ident pool and deals
// them in quote order (compression is not the goal). Dialect strategies
// (`boston`, …) are hashers: they keep Tailwind hyphens and colons and
// respell English runs from the shipped word maps.
// Uncovered words/quotes tokens fall back to content-hash names.

export type NamingConfig =
  | {
      strategy: "hash";
      length?: number;
      // Prepended to each hash body. Does not change the digest. Hyphens
      // are allowed (`tw-` + `s2k9` → `tw-s2k9`). Empty is rejected.
      // Hash strategy only: not words leftover hashes, not dialects.
      prefix?: string;
      // Character set for the hash body (`a-z0-9` by default). Position 0
      // still uses only the letters in the set. Hash strategy only.
      alphabet?: string;
    }
  | {
      strategy: DialectId;
      // Optional overlay: word → spelling for alphanumeric runs. A hit
      // replaces the mouth spelling; a miss still uses the mouth.
      maps?: Readonly<Record<string, string>>;
    }
  | {
      strategy: "maps";
      // Word → spelling for alphanumeric runs (`flex` in `flex-col`).
      maps: Readonly<Record<string, string>>;
    }
  | {
      strategy: "words";
      // Built-in pack id (`star-wars`, `klingon`, …). Exactly one of
      // `theme` or `vocabulary` is required.
      theme?: ThemeId;
      // Custom word list. Use this instead of `theme` when you bring your
      // own names.
      vocabulary?: ReadonlyArray<string>;
      // Prominence manifest (minwind prominence): original token -> the
      // document-order index of the first class-bearing element carrying
      // it. Tokens in the map draw the vocabulary in curation order — the
      // most iconic names first — ahead of the length-weighted deal, so
      // the DOM shell reads on-theme; unmapped tokens keep the
      // byte-optimal shortest-word deal.
      prominence?: Readonly<Record<string, number>>;
      // Hash length for tokens the vocabulary cannot cover. Same floor as
      // strategy "hash": default 4, minimum 4.
      length?: number;
    }
  | {
      strategy: "quotes";
      // Sentences. Split on non-alphanumerics, sanitized to CSS idents,
      // dealt in quote order. Duplicate words keep the first occurrence.
      quotes: ReadonlyArray<string>;
      prominence?: Readonly<Record<string, number>>;
      length?: number;
    };

export type ThemedNamingConfig = Extract<
  NamingConfig,
  { strategy: "words" | "quotes" }
>;

export function isThemedNaming(
  config: NamingConfig | undefined,
): config is ThemedNamingConfig {
  return (
    config !== undefined &&
    (config.strategy === "words" || config.strategy === "quotes")
  );
}

export function isDialectNaming(config: NamingConfig | undefined): config is {
  strategy: DialectId;
  maps?: Readonly<Record<string, string>>;
} {
  return config !== undefined && isDialectId(config.strategy);
}

export function isMapsNaming(
  config: NamingConfig | undefined,
): config is { strategy: "maps"; maps: Readonly<Record<string, string>> } {
  return config !== undefined && config.strategy === "maps";
}

export function assertMapsConfig(config: NamingConfig): void {
  if (!isMapsNaming(config)) return;
  assertBannedNamingFields(config, "maps", [
    "theme",
    "vocabulary",
    "quotes",
    "prominence",
    "length",
    "prefix",
    "alphabet",
  ]);
  if (config.maps === undefined) {
    throw new Error('minwind: naming.strategy "maps" requires maps');
  }
}

export function assertDialectConfig(config: NamingConfig): void {
  if (!isDialectNaming(config)) return;
  assertBannedNamingFields(config, config.strategy, [
    "theme",
    "vocabulary",
    "quotes",
    "prominence",
    "length",
    "prefix",
    "alphabet",
  ]);
}

export function assertHashConfig(config: NamingConfig): void {
  if (config.strategy !== "hash") return;
  assertBannedNamingFields(config, "hash", [
    "theme",
    "vocabulary",
    "quotes",
    "prominence",
    "maps",
  ]);
  resolveHashPrefix(config.prefix);
  resolveHashAlphabet(config.alphabet);
}

export function assertThemedConfig(config: NamingConfig): void {
  if (!isThemedNaming(config)) return;
  assertBannedNamingFields(config, config.strategy, ["prefix", "alphabet"]);
}

function assertBannedNamingFields(
  config: NamingConfig,
  strategy: string,
  banned: ReadonlyArray<string>,
): void {
  const record = config as unknown as Record<string, unknown>;
  for (const key of banned) {
    if (record[key] !== undefined) {
      throw new Error(
        `minwind: naming.strategy "${strategy}" cannot set ${key}`,
      );
    }
  }
}

export function hashLengthOf(
  config: NamingConfig | undefined,
): number | undefined {
  if (config === undefined || isDialectNaming(config) || isMapsNaming(config)) {
    return undefined;
  }
  return config.length;
}

export function hashPrefixOf(
  config: NamingConfig | undefined,
): string | undefined {
  if (config === undefined || config.strategy !== "hash") return undefined;
  return config.prefix;
}

export function hashAlphabetOf(
  config: NamingConfig | undefined,
): string | undefined {
  if (config === undefined || config.strategy !== "hash") return undefined;
  return config.alphabet;
}

export function resolveHasher(
  config: NamingConfig | undefined,
): (token: string) => string {
  if (config !== undefined && isDialectNaming(config)) {
    assertDialectConfig(config);
    return createDialectHasher(config.strategy, config.maps);
  }
  if (config !== undefined && isMapsNaming(config)) {
    assertMapsConfig(config);
    return createMapsHasher(config.maps);
  }
  if (config !== undefined && isThemedNaming(config)) {
    assertThemedConfig(config);
  }
  if (config !== undefined && config.strategy === "hash") {
    assertHashConfig(config);
  }
  return createHasher(
    hashLengthOf(config),
    hashPrefixOf(config),
    hashAlphabetOf(config),
  );
}

export interface NamingList {
  // Sorted, deduplicated (canonical list-key shape), and every token
  // registry-renamed — the pre-pass filters before calling.
  tokens: ReadonlyArray<string>;
  count: number;
}

export interface NamingResult {
  // Every input token's assigned name (vocabulary word or content-hash
  // fallback).
  names: Map<string, string>;
  // Tokens dealt a vocabulary word via the prominence manifest (words
  // strategy only). Zero with a manifest provided means the manifest
  // matched nothing — usually a sign it was generated from a renamed
  // build instead of a minwind-off one.
  prominent: number;
}

// Words become CSS class names, so they must satisfy the registry's ident
// pattern: punctuation and apostrophes strip away ("you're" -> "youre",
// "t-shirt" -> "tshirt"). A digit-leading remainder gets a leading
// underscore ("2b" -> "_2b") so it stays a CSS ident without escaping.
// A symbol-only remainder is dropped. Reserved words (real stylesheet
// classes, source tokens) are dropped too: assigning one would collide
// with a name the stylesheet keeps, and the registry's bijection check
// fails the build on that.
function sanitizeWord(raw: string): string | null {
  const stripped = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (stripped === "") return null;
  const word = /^[0-9]/.test(stripped) ? `_${stripped}` : stripped;
  return NAME_PATTERN.test(word) ? word : null;
}

function sanitizeVocabulary(
  vocabulary: ReadonlyArray<string>,
  reserved: ReadonlySet<string>,
): Array<string> {
  const seen = new Set<string>();
  const words: Array<string> = [];
  for (const raw of vocabulary) {
    const word = sanitizeWord(raw);
    if (word === null || reserved.has(word) || seen.has(word)) continue;
    seen.add(word);
    words.push(word);
  }
  return words;
}

// Split sentences into candidate idents. Punctuation is a boundary
// ("you're" -> "youre" after sanitize; "t-shirt" stays one word because
// sanitize strips the hyphen). Callers still run sanitizeVocabulary.
export function vocabularyFromQuotes(
  quotes: ReadonlyArray<string>,
): Array<string> {
  const words: Array<string> = [];
  for (const quote of quotes) {
    const parts = quote.split(/[^A-Za-z0-9]+/);
    for (const part of parts) {
      if (part === "") continue;
      words.push(part);
    }
  }
  return words;
}

export function resolveVocabulary(
  config: ThemedNamingConfig,
): ReadonlyArray<string> {
  if (config.strategy === "quotes") {
    if (config.quotes.length === 0) {
      throw new Error('minwind: naming.strategy "quotes" requires quotes');
    }
    return vocabularyFromQuotes(config.quotes);
  }
  if (config.theme !== undefined && config.vocabulary !== undefined) {
    throw new Error(
      "minwind: naming.theme and naming.vocabulary cannot both be set",
    );
  }
  if (config.theme !== undefined) return vocabularyForTheme(config.theme);
  if (config.vocabulary !== undefined) return config.vocabulary;
  throw new Error(
    'minwind: naming.strategy "words" requires theme or vocabulary',
  );
}

// Returns undefined for the hash strategy (the registry's default naming
// applies). Otherwise assigns every token a name: vocabulary words first,
// content-hash names when the words run out.
export function resolveNaming(
  config: NamingConfig,
  tokens: ReadonlyArray<string>,
  lists: ReadonlyArray<NamingList>,
  reserved: ReadonlySet<string>,
): NamingResult | undefined {
  if (!isThemedNaming(config)) return undefined;
  assertThemedConfig(config);

  const vocabulary = sanitizeVocabulary(resolveVocabulary(config), reserved);
  if (config.strategy === "quotes" && vocabulary.length === 0) {
    throw new Error(
      "minwind: naming.quotes produced no CSS idents; every word was empty," +
        " reserved, or invalid",
    );
  }
  const names = new Map<string, string>();

  // Prominence dealing: tokens first-seen near the top of the prerendered
  // DOM — the shell a devtools inspector meets first — draw the vocabulary
  // in curation order, so the most iconic names land where they are seen.
  // The shell renders once per page, so spending longer names there costs
  // almost nothing; everything else keeps the length-weighted deal below.
  let prominent = 0;
  const prominence = config.prominence;
  if (prominence !== undefined) {
    const shell = tokens
      .filter(function (token) {
        return prominence[token] !== undefined && !names.has(token);
      })
      .sort(function (a, b) {
        return prominence[a] - prominence[b] || compareCodeUnits(a, b);
      });
    for (const token of shell) {
      if (prominent >= vocabulary.length) break;
      names.set(token, vocabulary[prominent]);
      prominent += 1;
    }
  }

  // Deal leftover words. Words spends shortest names on the hottest
  // tokens. Quotes keeps quote order so a speech still reads in sequence
  // even off the shell; leftover tokens hash. Weight ties keep token
  // code-unit order.
  const weight = new Map<string, number>();
  for (const list of lists) {
    for (const token of list.tokens) {
      weight.set(token, (weight.get(token) ?? 0) + list.count);
    }
  }
  const dealOrder = Array.from(tokens).sort(function (a, b) {
    return (
      (weight.get(b) ?? 0) - (weight.get(a) ?? 0) || compareCodeUnits(a, b)
    );
  });
  const spent = new Set<string>(names.values());
  const pool = vocabulary.filter(function (word) {
    return !spent.has(word);
  });
  if (config.strategy === "words") {
    pool.sort(function (a, b) {
      return a.length - b.length;
    });
  }

  let dealt = 0;
  for (const token of dealOrder) {
    if (names.has(token)) continue;
    if (dealt < pool.length) {
      names.set(token, pool[dealt]);
      dealt += 1;
    } else {
      names.set(token, hashClassName(token, config.length));
    }
  }

  return {
    names,
    prominent,
  };
}
