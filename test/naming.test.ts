import assert from "node:assert";
import { describe, it } from "node:test";
import { hashClassName } from "../src/names.js";
import {
  resolveNaming,
  type NamingList,
  type NamingResult,
} from "../src/naming.js";

function list(count: number, ...tokens: Array<string>): NamingList {
  return { tokens: Array.from(tokens).sort(), count };
}

function quotes(
  corpus: ReadonlyArray<string>,
  tokens: ReadonlyArray<string>,
  lists: ReadonlyArray<NamingList>,
  vocabulary: ReadonlyArray<string> = [],
  reserved: ReadonlySet<string> = new Set(),
): NamingResult {
  const result = resolveNaming(
    { strategy: "quotes", corpus, vocabulary },
    tokens,
    lists,
    reserved,
  );
  assert.ok(result !== undefined, "quotes strategy must produce a result");
  return result;
}

describe("resolveNaming hash strategy", function () {
  it("returns undefined so the registry default applies", function () {
    assert.strictEqual(
      resolveNaming({ strategy: "hash" }, ["flex"], [], new Set()),
      undefined,
    );
  });
});

describe("resolveNaming words strategy", function () {
  it("deals vocabulary words in sorted token order", function () {
    const result = resolveNaming(
      { strategy: "words", vocabulary: ["plaid", "schwartz", "ludicrous"] },
      ["p-4", "flex"],
      [],
      new Set(),
    );
    assert.ok(result !== undefined);
    assert.strictEqual(result.names.get("flex"), "plaid");
    assert.strictEqual(result.names.get("p-4"), "schwartz");
    assert.strictEqual(result.order.size, 0);
  });

  it("skips reserved and duplicate vocabulary words", function () {
    const result = resolveNaming(
      { strategy: "words", vocabulary: ["flex", "plaid", "plaid"] },
      ["flex", "p-4"],
      [],
      new Set(["flex"]),
    );
    assert.ok(result !== undefined);
    assert.strictEqual(result.names.get("flex"), "plaid");
    assert.strictEqual(result.names.get("p-4"), hashClassName("p-4"));
  });

  it("sanitizes vocabulary words into CSS idents", function () {
    const result = resolveNaming(
      { strategy: "words", vocabulary: ["Mega-Maid!", "t-shirt"] },
      ["flex", "p-4"],
      [],
      new Set(),
    );
    assert.ok(result !== undefined);
    // Dealt shortest-first, so "tshirt" (6) precedes "megamaid" (8).
    assert.strictEqual(result.names.get("flex"), "tshirt");
    assert.strictEqual(result.names.get("p-4"), "megamaid");
  });

  it("falls back to content-hash names when the vocabulary runs out", function () {
    const result = resolveNaming(
      { strategy: "words", vocabulary: ["plaid"] },
      ["flex", "p-4"],
      [],
      new Set(),
    );
    assert.ok(result !== undefined);
    assert.strictEqual(result.names.get("flex"), "plaid");
    assert.strictEqual(result.names.get("p-4"), hashClassName("p-4"));
  });

  it("deals the shortest words to the hottest tokens", function () {
    // mb-16 renders 100 times across its lists, flex once: the two-letter
    // word goes to mb-16 regardless of curation or code-unit order.
    const result = resolveNaming(
      { strategy: "words", vocabulary: ["schwartz", "mo"] },
      ["flex", "mb-16"],
      [list(1, "flex"), list(100, "mb-16")],
      new Set(),
    );
    assert.ok(result !== undefined);
    assert.strictEqual(result.names.get("mb-16"), "mo");
    assert.strictEqual(result.names.get("flex"), "schwartz");
  });
});

describe("resolveNaming quotes strategy", function () {
  it("assigns a quote's words to a list's tokens and records quote order", function () {
    const result = quotes(
      ["may the schwartz"],
      ["flex", "items-center", "p-4"],
      [list(3, "flex", "items-center", "p-4")],
    );
    assert.strictEqual(result.names.get("flex"), "may");
    assert.strictEqual(result.names.get("items-center"), "the");
    assert.strictEqual(result.names.get("p-4"), "schwartz");
    assert.deepStrictEqual(result.order.get("flex items-center p-4"), [
      "flex",
      "items-center",
      "p-4",
    ]);
    assert.strictEqual(result.quotedLists, 1);
    assert.strictEqual(result.totalLists, 1);
  });

  it("reuses an assigned word when a later list shares its token", function () {
    // [flex p-4] claims "ludicrous speed" first (higher count), so p-4 is
    // pinned to "speed"; [items-center p-4] must pick a fragment containing
    // "speed", and its quote order places p-4 first.
    const result = quotes(
      ["ludicrous speed", "speed of light"],
      ["flex", "items-center", "p-4"],
      [list(5, "flex", "p-4"), list(3, "items-center", "p-4")],
    );
    assert.strictEqual(result.names.get("flex"), "ludicrous");
    assert.strictEqual(result.names.get("p-4"), "speed");
    assert.strictEqual(result.names.get("items-center"), "of");
    assert.deepStrictEqual(result.order.get("items-center p-4"), [
      "p-4",
      "items-center",
    ]);
    assert.strictEqual(result.quotedLists, 2);
  });

  it("never assigns one word to two tokens", function () {
    const result = quotes(
      [
        "may the schwartz be with you",
        "the schwartz is in you",
        "use the schwartz",
      ],
      ["flex", "items-center", "mb-16", "p-4", "site-card", "text-lg"],
      [
        list(4, "flex", "items-center", "p-4"),
        list(2, "flex", "mb-16"),
        list(2, "mb-16", "site-card", "text-lg"),
      ],
    );
    const names = Array.from(result.names.values());
    assert.strictEqual(new Set(names).size, names.length);
  });

  it("treats reserved words as segment breaks", function () {
    const result = quotes(
      ["the ring is yours"],
      ["flex", "items-center", "mb-16", "p-4"],
      [list(1, "flex", "items-center", "mb-16", "p-4")],
      ["plaid", "schwartz", "ludicrous", "megamaid"],
      new Set(["ring"]),
    );
    assert.strictEqual(result.quotedLists, 0);
    assert.strictEqual(result.names.get("flex"), "plaid");
    // Dealt shortest-first: plaid, schwartz, megamaid, then ludicrous.
    assert.strictEqual(result.names.get("p-4"), "ludicrous");
  });

  it("ignores quote runs with repeated words", function () {
    const result = quotes(
      ["now now"],
      ["flex", "p-4"],
      [list(1, "flex", "p-4")],
      ["plaid", "schwartz"],
    );
    assert.strictEqual(result.quotedLists, 0);
    assert.strictEqual(result.names.get("flex"), "plaid");
    assert.strictEqual(result.names.get("p-4"), "schwartz");
  });

  it("deals singletons from the vocabulary, never quote words", function () {
    // A lone word is mid-quote residue and reads as noise in the DOM, so
    // 1-token lists skip the corpus entirely and spend vocabulary words
    // (chosen to stand alone), falling back to hashes when it runs out.
    const result = quotes(
      ["may the schwartz be with you", "plaid"],
      [
        "flex",
        "items-center",
        "mb-16",
        "p-4",
        "site-card",
        "text-lg",
        "block-ish",
        "gap-2",
      ],
      [
        list(100, "block-ish"),
        list(50, "gap-2"),
        list(1, "flex", "items-center", "mb-16", "p-4", "site-card", "text-lg"),
      ],
      ["darkhelmet"],
    );
    assert.strictEqual(result.names.get("flex"), "may");
    assert.strictEqual(result.names.get("block-ish"), "darkhelmet");
    assert.strictEqual(result.names.get("gap-2"), hashClassName("gap-2"));
    assert.strictEqual(result.quotedLists, 1);
  });

  it("breaks size ties by frequency", function () {
    const result = quotes(
      ["ludicrous speed", "gone to plaid"],
      ["flex", "items-center", "p-4", "mb-16"],
      [list(1, "flex", "p-4"), list(9, "items-center", "mb-16")],
    );
    assert.strictEqual(result.names.get("items-center"), "ludicrous");
    assert.strictEqual(result.names.get("mb-16"), "speed");
    assert.strictEqual(result.names.get("flex"), "gone");
    assert.strictEqual(result.names.get("p-4"), "to");
    assert.strictEqual(result.quotedLists, 2);
  });

  it("covers sub-fragments, not just whole quotes", function () {
    const result = quotes(
      ["may the schwartz be with you"],
      ["flex", "p-4"],
      [list(2, "flex", "p-4")],
    );
    assert.strictEqual(result.quotedLists, 1);
    assert.strictEqual(result.names.get("flex"), "may");
    assert.strictEqual(result.names.get("p-4"), "the");
  });

  it("sanitizes punctuation and apostrophes out of quote words", function () {
    const result = quotes(
      ["that's the schwartz!"],
      ["flex", "items-center", "p-4"],
      [list(1, "flex", "items-center", "p-4")],
    );
    assert.strictEqual(result.quotedLists, 1);
    assert.strictEqual(result.names.get("flex"), "thats");
    assert.strictEqual(result.names.get("items-center"), "the");
    assert.strictEqual(result.names.get("p-4"), "schwartz");
  });

  it("skips lists carrying tokens outside the renamed set", function () {
    const result = quotes(
      ["ludicrous speed"],
      ["flex"],
      [list(1, "flex", "ghost-token")],
      ["plaid"],
    );
    assert.strictEqual(result.totalLists, 0);
    assert.strictEqual(result.quotedLists, 0);
    assert.strictEqual(result.names.get("flex"), "plaid");
  });

  it("falls back to vocabulary then hash for uncovered tokens", function () {
    const result = quotes(
      ["ludicrous speed"],
      ["flex", "items-center", "p-4"],
      [list(1, "flex", "p-4")],
      ["plaid"],
    );
    assert.strictEqual(result.names.get("flex"), "ludicrous");
    assert.strictEqual(result.names.get("p-4"), "speed");
    assert.strictEqual(result.names.get("items-center"), "plaid");
    const result2 = quotes(
      ["ludicrous speed"],
      ["flex", "items-center", "p-4"],
      [list(1, "flex", "p-4")],
    );
    assert.strictEqual(
      result2.names.get("items-center"),
      hashClassName("items-center"),
    );
  });

  it("is deterministic across runs", function () {
    const corpus = [
      "may the schwartz be with you",
      "ludicrous speed",
      "the schwartz is in you",
    ];
    const tokens = [
      "flex",
      "items-center",
      "mb-16",
      "p-4",
      "site-card",
      "text-lg",
    ];
    const lists = [
      list(9, "flex", "items-center", "p-4"),
      list(7, "flex", "mb-16"),
      list(5, "site-card", "text-lg"),
    ];
    const first = quotes(corpus, tokens, lists, ["plaid"]);
    const second = quotes(corpus, tokens, lists, ["plaid"]);
    assert.deepStrictEqual(
      Array.from(first.names.entries()),
      Array.from(second.names.entries()),
    );
    assert.deepStrictEqual(
      Array.from(first.order.entries()),
      Array.from(second.order.entries()),
    );
  });
});
