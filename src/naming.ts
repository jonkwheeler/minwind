import { canonicalListKey } from "./consolidate.js";
import { hashClassName, NAME_PATTERN } from "./names.js";
import { compareCodeUnits } from "./util.js";

// Themed naming strategies: an opt-in alternative to content-hash naming
// (KTD5) for sites that want personality in the DOM. 'words' deals a curated
// vocabulary to class tokens; 'quotes' goes further — it assigns words so a
// whole class list reads as a quote fragment. Only lists of two or more
// tokens participate in quotes: a single-word class can never read as a
// phrase, so singletons draw from the vocabulary instead. Class order
// inside an attribute is semantically free (only stylesheet order matters),
// so the source transform may reorder a fully-renamed static list to match
// its quote's word order; the global token->name bijection (R2) is
// untouched, and uncovered tokens fall back to vocabulary words, then to
// content-hash names. Everything is a deterministic function of the token
// set, the list frequencies, and the corpus.

export type NamingConfig =
  | { strategy: "hash" }
  | {
      strategy: "words";
      vocabulary: ReadonlyArray<string>;
      // Prominence manifest (minwind prominence): original token -> the
      // document-order index of the first class-bearing element carrying
      // it. Tokens in the map draw the vocabulary in curation order — the
      // most iconic names first — ahead of the length-weighted deal, so
      // the DOM shell reads on-theme; unmapped tokens keep the
      // byte-optimal shortest-word deal.
      prominence?: Readonly<Record<string, number>>;
    }
  | {
      strategy: "quotes";
      corpus: ReadonlyArray<string>;
      vocabulary?: ReadonlyArray<string>;
    };

export interface NamingList {
  // Sorted, deduplicated (canonical list-key shape), and every token
  // registry-renamed — the pre-pass filters before calling.
  tokens: ReadonlyArray<string>;
  count: number;
}

export interface NamingResult {
  // Every input token's assigned name (quote word, vocabulary word, or
  // content-hash fallback).
  names: Map<string, string>;
  // Canonical list key -> that list's tokens in quote word order. Only
  // quote-covered lists appear; the source transform reorders to match.
  order: Map<string, Array<string>>;
  quotedLists: number;
  totalLists: number;
  // Tokens dealt a vocabulary word via the prominence manifest (words
  // strategy only). Zero with a manifest provided means the manifest
  // matched nothing — usually a sign it was generated from a renamed
  // build instead of a minwind-off one.
  prominent: number;
}

// Words become CSS class names, so they must satisfy the registry's ident
// pattern: punctuation and apostrophes strip away ("you're" -> "youre",
// "t-shirt" -> "tshirt"), and a word that cannot survive as
// [a-z][a-z0-9]* (a bare number, a symbol) breaks the quote into segments
// there. Reserved words (real stylesheet classes, source tokens) break
// segments too: assigning one would collide with a name the stylesheet
// keeps, and the registry's bijection check fails the build on that.
function sanitizeWord(raw: string): string | null {
  const word = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
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

// The fragment inventory: every contiguous run of distinct usable words in
// every quote, grouped by run length. Names are a bijection, so a run with a
// repeated word ("now now") can never map a token list — runs stop at the
// repeat. Corpus order is the priority order (earlier quotes win contested
// words), so the corpus lists the most iconic lines first.
function buildFragments(
  corpus: ReadonlyArray<string>,
  reserved: ReadonlySet<string>,
  maxLength: number,
): Map<number, Array<Array<string>>> {
  const byLength = new Map<number, Array<Array<string>>>();
  const seen = new Set<string>();

  function flush(segment: Array<string>): void {
    for (let start = 0; start < segment.length; start += 1) {
      const run: Array<string> = [];
      for (let end = start; end < segment.length; end += 1) {
        const word = segment[end];
        if (run.includes(word)) break;
        run.push(word);
        if (run.length > maxLength) break;
        const key = run.join(" ");
        if (seen.has(key)) continue;
        seen.add(key);
        let bucket = byLength.get(run.length);
        if (bucket === undefined) {
          bucket = [];
          byLength.set(run.length, bucket);
        }
        bucket.push([...run]);
      }
    }
  }

  for (const quote of corpus) {
    let segment: Array<string> = [];
    for (const raw of quote.split(/\s+/)) {
      const word = sanitizeWord(raw);
      if (word === null || reserved.has(word)) {
        flush(segment);
        segment = [];
      } else {
        segment.push(word);
      }
    }
    flush(segment);
  }
  return byLength;
}

// Returns undefined for the hash strategy (the registry's default naming
// applies). Otherwise assigns every token a name: quote words where the
// greedy solver can cover lists, vocabulary words after that, content-hash
// names when the words run out.
export function resolveNaming(
  config: NamingConfig,
  tokens: ReadonlyArray<string>,
  lists: ReadonlyArray<NamingList>,
  reserved: ReadonlySet<string>,
): NamingResult | undefined {
  if (config.strategy === "hash") return undefined;
  const corpus = config.strategy === "quotes" ? config.corpus : [];
  const tokenSet = new Set<string>(tokens);

  // Only lists whose tokens all rename can participate: a list carrying an
  // excluded token keeps that token's original bytes, so its words can
  // never form a clean quote in the DOM.
  const eligible = lists.filter(function (list) {
    return list.tokens.every(function (token) {
      return tokenSet.has(token);
    });
  });
  const maxLength = eligible.reduce(function (max, list) {
    return Math.max(max, list.tokens.length);
  }, 1);
  const fragments = buildFragments(corpus, reserved, maxLength);

  const assigned = new Map<string, string>();
  const tokenForWord = new Map<string, string>();
  const order = new Map<string, Array<string>>();

  // Longest first: long lists are the hardest to satisfy (few long quotes
  // exist) and are typically the components that render most (cards, chips),
  // while a source count is nearly flat — a card's list appears once no
  // matter how often the component renders. Singletons pick last and spend
  // the leftover words.
  const sortedLists = Array.from(eligible).sort(function (a, b) {
    return (
      b.tokens.length - a.tokens.length ||
      b.count - a.count ||
      compareCodeUnits(a.tokens.join(" "), b.tokens.join(" "))
    );
  });

  let quotedLists = 0;
  for (const list of sortedLists) {
    // Singletons never take quote words: a lone word is mid-quote residue
    // ("feet" from "my brains are going into my feet") and reads as noise
    // in the DOM. They draw from the vocabulary below, where every word is
    // chosen to stand alone, and the corpus stays whole for lists that can
    // actually carry a phrase.
    if (list.tokens.length < 2) continue;
    const candidates = fragments.get(list.tokens.length);
    if (candidates === undefined) continue;
    for (const fragment of candidates) {
      const pinned: Array<string> = [];
      let blocked = false;
      for (const token of list.tokens) {
        const word = assigned.get(token);
        if (word === undefined) continue;
        if (!fragment.includes(word)) {
          blocked = true;
          break;
        }
        pinned.push(word);
      }
      if (blocked) continue;
      const fresh = fragment.filter(function (word) {
        return !pinned.includes(word);
      });
      if (
        fresh.some(function (word) {
          return tokenForWord.has(word);
        })
      ) {
        continue;
      }
      // list.tokens is canonical (sorted), so pairing open tokens with the
      // fragment's leftover words in fragment order is deterministic.
      const open = list.tokens.filter(function (token) {
        return !assigned.has(token);
      });
      for (let index = 0; index < open.length; index += 1) {
        assigned.set(open[index], fresh[index]);
        tokenForWord.set(fresh[index], open[index]);
      }
      const orderedTokens: Array<string> = [];
      for (const word of fragment) {
        const token = tokenForWord.get(word);
        if (token === undefined) {
          throw new Error(
            `minwind: internal error: quote word "${word}" lost its token`,
          );
        }
        orderedTokens.push(token);
      }
      order.set(canonicalListKey(list.tokens), orderedTokens);
      quotedLists += 1;
      break;
    }
  }

  const vocabulary = sanitizeVocabulary(
    config.vocabulary ?? [],
    reserved,
  ).filter(function (word) {
    return !tokenForWord.has(word);
  });

  const names = new Map<string, string>(assigned);

  // Prominence dealing: tokens first-seen near the top of the prerendered
  // DOM — the shell a devtools inspector meets first — draw the vocabulary
  // in curation order, so the most iconic names land where they are seen.
  // The shell renders once per page, so spending longer names there costs
  // almost nothing; everything else keeps the length-weighted deal below.
  let prominent = 0;
  const prominence =
    config.strategy === "words" ? config.prominence : undefined;
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

  // Deal the shortest words to the hottest tokens: a token's render weight
  // is the summed count of every list carrying it, and short names cost the
  // fewest bytes where they render most. Weight ties keep token code-unit
  // order; word length ties keep the vocabulary's curation order. Words
  // already spent (quote fragments, prominence deals) leave the pool.
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
  const shortestFirst = vocabulary
    .filter(function (word) {
      return !spent.has(word);
    })
    .sort(function (a, b) {
      return a.length - b.length;
    });

  let dealt = 0;
  for (const token of dealOrder) {
    if (names.has(token)) continue;
    if (dealt < shortestFirst.length) {
      names.set(token, shortestFirst[dealt]);
      dealt += 1;
    } else {
      names.set(token, hashClassName(token));
    }
  }

  return {
    names,
    order,
    quotedLists,
    totalLists: sortedLists.length,
    prominent,
  };
}
