import assert from "node:assert";
import { describe, it } from "node:test";
import { DIALECT_IDS, dialectClassName, isDialectId } from "../src/dialect.js";
import { createNameRegistry } from "../src/names.js";

describe("isDialectId", function () {
  it("accepts every shipped mouth", function () {
    for (const id of DIALECT_IDS) {
      assert.strictEqual(isDialectId(id), true, id);
    }
  });

  it("rejects hash, words, quotes, and old ids", function () {
    assert.strictEqual(isDialectId("hash"), false);
    assert.strictEqual(isDialectId("words"), false);
    assert.strictEqual(isDialectId("quotes"), false);
    assert.strictEqual(isDialectId("australian"), false);
    assert.strictEqual(isDialectId("cockney"), false);
    assert.strictEqual(isDialectId("yorkshire"), false);
  });
});

describe("dialectClassName boston", function () {
  it("keeps hyphens and colons and respells English runs", function () {
    assert.strictEqual(
      dialectClassName("hover:items-center", "boston"),
      "hovah:items-centah",
    );
  });

  it("expands abbreviations and keeps the hyphen string", function () {
    assert.strictEqual(dialectClassName("p-4", "boston"), "pee-4");
    assert.strictEqual(dialectClassName("px-6", "boston"), "pee-ecks-6");
    assert.strictEqual(dialectClassName("mx-auto", "boston"), "em-ecks-auto");
    assert.strictEqual(
      dialectClassName("bg-zinc-900", "boston"),
      "bee-gee-zinc-900",
    );
    assert.strictEqual(
      dialectClassName("bg-red-500", "boston"),
      "bee-gee-red-500",
    );
  });

  it("leaves boston flex as flex", function () {
    assert.strictEqual(dialectClassName("flex", "boston"), "flex");
    assert.strictEqual(dialectClassName("flex-col", "boston"), "flex-cawl");
  });

  it("respells hover:border as hovah:bawdah", function () {
    assert.strictEqual(
      dialectClassName("hover:border", "boston"),
      "hovah:bawdah",
    );
  });
});

describe("dialectClassName australia", function () {
  it("keeps hyphens and uses the australia table", function () {
    assert.strictEqual(
      dialectClassName("hover:items-center", "australia"),
      "hovah:items-centah",
    );
  });
});

describe("dialectClassName texas", function () {
  it("respells right-4 as raaaht-4", function () {
    assert.strictEqual(dialectClassName("right-4", "texas"), "raaaht-4");
  });
});

describe("dialectClassName england", function () {
  it("drops h on hover and respells right", function () {
    assert.strictEqual(dialectClassName("right-0", "england"), "roight-0");
    assert.strictEqual(dialectClassName("hover:flex", "england"), "'ovah:flex");
  });

  it("respells light and brightness and keeps hyphens", function () {
    assert.strictEqual(
      dialectClassName("brightness-100", "england"),
      "broightness-100",
    );
    assert.strictEqual(
      dialectClassName("font-light", "england"),
      "font-loight",
    );
  });
});

describe("dialectClassName emojis", function () {
  it("drops hyphens and keeps colons", function () {
    assert.strictEqual(dialectClassName("flex", "emojis"), "💪");
    assert.strictEqual(dialectClassName("flex-col", "emojis"), "💪🏛️");
    assert.strictEqual(dialectClassName("hover:flex", "emojis"), "🛸:💪");
    assert.strictEqual(dialectClassName("p-4", "emojis"), "🅿️4️⃣");
    assert.strictEqual(dialectClassName("bg-red-500", "emojis"), "🎨🔴5️⃣0️⃣0️⃣");
    assert.strictEqual(dialectClassName("overflow-hidden", "emojis"), "🌊🙈");
  });
});

describe("dialectClassName collisions", function () {
  it("registers hyphenated dialect names", function () {
    const registry = createNameRegistry({
      universe: new Set(["p-4", "hover:items-center", "flex"]),
      sourceTokens: new Set(["p-4", "hover:items-center", "flex"]),
      hash: function (token: string): string {
        return dialectClassName(token, "boston");
      },
    });
    assert.strictEqual(registry.nameFor("p-4"), "pee-4");
    assert.strictEqual(
      registry.nameFor("hover:items-center"),
      "hovah:items-centah",
    );
    assert.strictEqual(registry.nameFor("flex"), "flex");
  });

  it("fails the registry when two tokens respell to the same ident", function () {
    assert.throws(function () {
      createNameRegistry({
        universe: new Set(["cover", "covah"]),
        sourceTokens: new Set(["cover", "covah"]),
        hash: function (token: string): string {
          return dialectClassName(token, "boston");
        },
      });
    }, /name collision/);
  });
});
