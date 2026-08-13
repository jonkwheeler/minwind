import assert from "node:assert";
import { describe, it } from "node:test";
import { hashClassName } from "../src/names.js";
import { dialectClassName } from "../src/dialect.js";
import {
  assertDialectConfig,
  assertHashConfig,
  assertMapsConfig,
  assertThemedConfig,
  resolveHasher,
  resolveNaming,
  type NamingList,
} from "../src/naming.js";

function list(count: number, ...tokens: Array<string>): NamingList {
  return { tokens: Array.from(tokens).sort(), count };
}

describe("resolveNaming hash strategy", function () {
  it("returns undefined so the registry default applies", function () {
    assert.strictEqual(
      resolveNaming({ strategy: "hash" }, ["flex"], [], new Set()),
      undefined,
    );
  });

  it("resolveHasher prepends naming.prefix to the hash body", function () {
    const hash = resolveHasher({ strategy: "hash", prefix: "tw" });
    assert.strictEqual(hash("flex"), "tw" + hashClassName("flex"));
  });

  it("resolveHasher combines prefix with naming.length", function () {
    const hash = resolveHasher({
      strategy: "hash",
      prefix: "tw-",
      length: 6,
    });
    assert.strictEqual(hash("flex"), "tw-" + hashClassName("flex", 6));
  });

  it("rejects an invalid prefix on the hash strategy", function () {
    assert.throws(function () {
      assertHashConfig({ strategy: "hash", prefix: "1" });
    }, /ident prefix/);
  });

  it("rejects prefix on words, quotes, dialect, and maps", function () {
    assert.throws(function () {
      assertThemedConfig({
        strategy: "words",
        vocabulary: ["plaid"],
        prefix: "tw",
      } as never);
    }, /cannot set prefix/);
    assert.throws(function () {
      resolveHasher({ strategy: "boston", prefix: "tw" } as never);
    }, /cannot set prefix/);
    assert.throws(function () {
      assertMapsConfig({
        strategy: "maps",
        maps: { flex: "muscles" },
        prefix: "tw",
      } as never);
    }, /cannot set prefix/);
  });
});

describe("dialect naming hasher", function () {
  it("resolveNaming returns undefined so the dialect hasher applies", function () {
    assert.strictEqual(
      resolveNaming({ strategy: "boston" }, ["flex"], [], new Set()),
      undefined,
    );
  });

  it("resolveHasher keeps hyphens and respells in the chosen mouth", function () {
    const hash = resolveHasher({ strategy: "boston" });
    assert.strictEqual(hash("hover:items-center"), "hovah:items-centah");
    assert.strictEqual(hash("p-4"), "pee-4");
    assert.strictEqual(hash("flex"), "flex");
  });

  it("rejects prominence, length, and words fields on a dialect strategy", function () {
    assert.throws(function () {
      assertDialectConfig({
        strategy: "boston",
        prominence: { flex: 0 },
      } as never);
    }, /cannot set prominence/);
    assert.throws(function () {
      resolveHasher({ strategy: "boston", length: 6 } as never);
    }, /cannot set length/);
  });

  it("matches dialectClassName", function () {
    assert.strictEqual(
      resolveHasher({ strategy: "texas" })("right-4"),
      dialectClassName("right-4", "texas"),
    );
  });

  it("resolveHasher yorkshire respells right-4", function () {
    assert.strictEqual(
      resolveHasher({ strategy: "yorkshire" })("right-4"),
      "reet-4",
    );
  });

  it("resolveHasher pins the four new mouths", function () {
    assert.strictEqual(
      resolveHasher({ strategy: "newzealand" })("sticky"),
      "stucky",
    );
    assert.strictEqual(
      resolveHasher({ strategy: "jamaica" })("flex-row"),
      "flex-roh",
    );
    assert.strictEqual(
      resolveHasher({ strategy: "appalachia" })("right-4"),
      "raht-4",
    );
    assert.strictEqual(
      resolveHasher({ strategy: "geordie" })("flex-row"),
      "flex-roo",
    );
  });

  it("overlays maps onto a dialect mouth", function () {
    const hash = resolveHasher({
      strategy: "boston",
      maps: { flex: "muscles" },
    });
    assert.strictEqual(hash("flex-col"), "muscles-cawl");
    assert.strictEqual(hash("p-4"), "pee-4");
  });
});

describe("maps naming hasher", function () {
  it("resolveHasher applies the site map", function () {
    const hash = resolveHasher({
      strategy: "maps",
      maps: { flex: "muscles" },
    });
    assert.strictEqual(hash("flex-col"), "muscles-col");
    assert.strictEqual(hash("p-4"), "p-4");
  });

  it("rejects prominence on maps", function () {
    assert.throws(function () {
      assertMapsConfig({
        strategy: "maps",
        maps: { flex: "muscles" },
        prominence: { flex: 0 },
      } as never);
    }, /cannot set prominence/);
  });
});

describe("resolveNaming words strategy", function () {
  it("deals a built-in theme pack by id", function () {
    const result = resolveNaming(
      {
        strategy: "words",
        theme: "star-wars",
        prominence: { flex: 0, "p-4": 1 },
      },
      ["flex", "p-4"],
      [],
      new Set(),
    );
    assert.ok(result !== undefined);
    assert.strictEqual(result.names.get("flex"), "vader");
    assert.strictEqual(result.names.get("p-4"), "yoda");
  });

  it("rejects words naming with neither theme nor vocabulary", function () {
    assert.throws(function () {
      resolveNaming({ strategy: "words" }, ["flex"], [], new Set());
    }, /theme or vocabulary/);
  });

  it("rejects words naming with both theme and vocabulary", function () {
    assert.throws(function () {
      resolveNaming(
        { strategy: "words", theme: "star-wars", vocabulary: ["plaid"] },
        ["flex"],
        [],
        new Set(),
      );
    }, /cannot both be set/);
  });

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

  it("prefixes a leading underscore onto digit-leading vocabulary words", function () {
    const result = resolveNaming(
      { strategy: "words", vocabulary: ["2b", "_2b", "ornot"] },
      ["flex", "p-4"],
      [],
      new Set(),
    );
    assert.ok(result !== undefined);
    // "2b" and "_2b" both sanitize to "_2b"; the duplicate is skipped.
    // Dealt shortest-first: "_2b" (3) precedes "ornot" (5).
    assert.strictEqual(result.names.get("flex"), "_2b");
    assert.strictEqual(result.names.get("p-4"), "ornot");
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

  it("uses naming.length for hash fallback names", function () {
    const result = resolveNaming(
      { strategy: "words", vocabulary: ["plaid"], length: 6 },
      ["flex", "p-4"],
      [],
      new Set(),
    );
    assert.ok(result !== undefined);
    assert.strictEqual(result.names.get("flex"), "plaid");
    assert.strictEqual(result.names.get("p-4"), hashClassName("p-4", 6));
    assert.strictEqual(result.names.get("p-4")?.length, 6);
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

  it("deals prominent tokens the vocabulary in curation order by rank", function () {
    const result = resolveNaming(
      {
        strategy: "words",
        vocabulary: ["schwartz", "plaid", "mo"],
        prominence: { "p-4": 0, flex: 2 },
      },
      ["flex", "p-4", "mb-16"],
      [list(100, "mb-16")],
      new Set(),
    );
    assert.ok(result !== undefined);
    // Rank order beats both word length and render weight: p-4 (rank 0)
    // takes the first curated word even though it is the longest.
    assert.strictEqual(result.names.get("p-4"), "schwartz");
    assert.strictEqual(result.names.get("flex"), "plaid");
    // mb-16 has no rank: it keeps the length-weighted deal and takes the
    // shortest word left in the pool.
    assert.strictEqual(result.names.get("mb-16"), "mo");
    assert.strictEqual(result.prominent, 2);
  });

  it("breaks prominence rank ties in code-unit order", function () {
    const result = resolveNaming(
      {
        strategy: "words",
        vocabulary: ["aa", "bb"],
        prominence: { "p-4": 3, flex: 3 },
      },
      ["flex", "p-4"],
      [],
      new Set(),
    );
    assert.ok(result !== undefined);
    assert.strictEqual(result.names.get("flex"), "aa");
    assert.strictEqual(result.names.get("p-4"), "bb");
    assert.strictEqual(result.prominent, 2);
  });

  it("ignores prominence entries for tokens outside the renamed set", function () {
    const result = resolveNaming(
      {
        strategy: "words",
        vocabulary: ["schwartz", "plaid"],
        prominence: { "ghost-token": 0 },
      },
      ["flex", "p-4"],
      [],
      new Set(),
    );
    assert.ok(result !== undefined);
    assert.strictEqual(result.prominent, 0);
    // No prominent deals, so the length-weighted pool is unspent.
    assert.strictEqual(result.names.get("flex"), "plaid");
    assert.strictEqual(result.names.get("p-4"), "schwartz");
  });
});

describe("resolveNaming quotes strategy", function () {
  it("splits sentences and deals words in quote order", function () {
    const result = resolveNaming(
      {
        strategy: "quotes",
        quotes: ["Ask not what your country can do for you"],
        prominence: { flex: 0, "p-4": 1, "mb-16": 2 },
      },
      ["flex", "p-4", "mb-16"],
      [],
      new Set(),
    );
    assert.ok(result !== undefined);
    assert.strictEqual(result.names.get("flex"), "ask");
    assert.strictEqual(result.names.get("p-4"), "not");
    assert.strictEqual(result.names.get("mb-16"), "what");
    assert.strictEqual(result.prominent, 3);
  });

  it("keeps leftover quote words in quote order, not shortest-first", function () {
    const result = resolveNaming(
      {
        strategy: "quotes",
        quotes: ["Ask not what"],
      },
      ["flex", "p-4", "mb-16"],
      [list(100, "mb-16"), list(1, "flex"), list(1, "p-4")],
      new Set(),
    );
    assert.ok(result !== undefined);
    assert.strictEqual(result.names.get("mb-16"), "ask");
    assert.strictEqual(result.names.get("flex"), "not");
    assert.strictEqual(result.names.get("p-4"), "what");
  });

  it("prefixes a leading underscore onto digit-leading quote words", function () {
    const result = resolveNaming(
      {
        strategy: "quotes",
        quotes: ["2b or not"],
        prominence: { flex: 0, "p-4": 1, "mb-16": 2 },
      },
      ["flex", "p-4", "mb-16"],
      [],
      new Set(),
    );
    assert.ok(result !== undefined);
    assert.strictEqual(result.names.get("flex"), "_2b");
    assert.strictEqual(result.names.get("p-4"), "or");
    assert.strictEqual(result.names.get("mb-16"), "not");
  });

  it("skips duplicate quote words", function () {
    const result = resolveNaming(
      {
        strategy: "quotes",
        quotes: ["you can do for you"],
        prominence: { flex: 0, "p-4": 1, "mb-16": 2 },
      },
      ["flex", "p-4", "mb-16"],
      [],
      new Set(),
    );
    assert.ok(result !== undefined);
    assert.strictEqual(result.names.get("flex"), "you");
    assert.strictEqual(result.names.get("p-4"), "can");
    assert.strictEqual(result.names.get("mb-16"), "do");
  });
});
