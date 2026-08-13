import assert from "node:assert";
import { describe, it } from "node:test";
import {
  DEFAULT_EXCLUSIONS,
  NAME_LENGTH,
  NAME_PATTERN,
  createNameRegistry,
  hashClassName,
  isGeneratedIdent,
  safeNameLength,
  type ExclusionConfig,
  type RegistryInput,
} from "../src/names.js";

const KNOWN_TOKENS = [
  "flex",
  "hover:border-accent",
  "[&_pre]:p-4",
  "max-w-162.5",
];

function inputFor(overrides: {
  universe?: Array<string>;
  sourceTokens?: Array<string>;
  runtimeTokens?: Array<string>;
  exclusions?: ExclusionConfig;
  hash?: (token: string) => string;
}): RegistryInput {
  return {
    universe: new Set(overrides.universe ?? []),
    sourceTokens: new Set(overrides.sourceTokens ?? []),
    runtimeTokens: new Set(overrides.runtimeTokens ?? []),
    exclusions: overrides.exclusions,
    hash: overrides.hash,
  };
}

// A site-style exclusion contract, passed explicitly: the package default
// excludes nothing.
const SITE_EXCLUSIONS: ExclusionConfig = {
  names: ["shiki", "line", "min-dark"],
  prefixes: ["dissolve-"],
};

describe("isGeneratedIdent", function () {
  it("accepts hash names and hyphenated dialect names", function () {
    assert.strictEqual(isGeneratedIdent("xkzu"), true);
    assert.strictEqual(isGeneratedIdent("_2b"), true);
    assert.strictEqual(isGeneratedIdent("p-4"), true);
    assert.strictEqual(isGeneratedIdent("hovah:bawdah"), true);
  });

  it("rejects empty, spaced, and digit-leading names", function () {
    assert.strictEqual(isGeneratedIdent(""), false);
    assert.strictEqual(isGeneratedIdent("p 4"), false);
    assert.strictEqual(isGeneratedIdent("4px"), false);
  });
});

describe("hashClassName", () => {
  it("produces ident-safe fixed-length names for known tokens", function () {
    for (const token of KNOWN_TOKENS) {
      const name = hashClassName(token);
      assert.match(name, NAME_PATTERN, `name for ${token}`);
      assert.strictEqual(name.length, NAME_LENGTH, `length for ${token}`);
    }
  });

  it("is a pure function of the whole token", function () {
    for (const token of KNOWN_TOKENS) {
      assert.strictEqual(hashClassName(token), hashClassName(token), token);
    }
  });

  it("hashes the variant as part of the token", function () {
    assert.notStrictEqual(
      hashClassName("border-accent"),
      hashClassName("hover:border-accent"),
    );
  });

  it("rejects an empty token", function () {
    assert.throws(function () {
      hashClassName("");
    }, /empty/);
  });

  it("uses length 4 by default and rejects shorter lengths", function () {
    assert.strictEqual(hashClassName("flex").length, 4);
    assert.strictEqual(hashClassName("flex", 4), hashClassName("flex"));
    assert.throws(function () {
      hashClassName("flex", 3);
    }, /naming.length/);
  });

  it("produces a longer ident when length is raised", function () {
    const name = hashClassName("flex", 6);
    assert.strictEqual(name.length, 6);
    assert.match(name, NAME_PATTERN);
    assert.notStrictEqual(name, hashClassName("flex"));
  });
});

describe("safeNameLength", function () {
  it("returns 4 when the token set is injective at the default length", function () {
    assert.strictEqual(safeNameLength(["flex", "grid", "p-4"]), 4);
  });

  it("returns 5 when a reserved name occupies the length-4 hash", function () {
    const taken = hashClassName("flex");
    assert.strictEqual(safeNameLength(["flex"], new Set([taken])), 5);
  });
});

describe("createNameRegistry happy path", function () {
  const registry = createNameRegistry(
    inputFor({ universe: KNOWN_TOKENS, sourceTokens: KNOWN_TOKENS }),
  );

  it("renames every provable token to an ident-safe name", function () {
    for (const token of KNOWN_TOKENS) {
      const name = registry.nameFor(token);
      assert.ok(name !== undefined, `expected a name for ${token}`);
      assert.match(name, NAME_PATTERN, `name for ${token}`);
      assert.strictEqual(name, hashClassName(token));
    }
  });

  it("round-trips name -> token", function () {
    for (const token of KNOWN_TOKENS) {
      const name = registry.nameFor(token);
      assert.ok(name !== undefined);
      assert.strictEqual(registry.tokenFor(name), token);
    }
  });

  it("gives tokens differing only in variant distinct names", function () {
    const pair = createNameRegistry(
      inputFor({
        universe: ["border-accent", "hover:border-accent"],
        sourceTokens: ["border-accent", "hover:border-accent"],
      }),
    );
    assert.notStrictEqual(
      pair.nameFor("border-accent"),
      pair.nameFor("hover:border-accent"),
    );
  });

  it("produces an identical map regardless of insertion order", function () {
    const forward = createNameRegistry(
      inputFor({ universe: KNOWN_TOKENS, sourceTokens: KNOWN_TOKENS }),
    );
    const reversed = [...KNOWN_TOKENS].reverse();
    const backward = createNameRegistry(
      inputFor({ universe: reversed, sourceTokens: reversed }),
    );
    assert.deepStrictEqual(backward.entries(), forward.entries());
  });

  it("produces an identical map in a second independent instance", function () {
    const again = createNameRegistry(
      inputFor({ universe: KNOWN_TOKENS, sourceTokens: KNOWN_TOKENS }),
    );
    assert.deepStrictEqual(again.entries(), registry.entries());
  });

  it("keeps the bijection over the full name set", function () {
    assert.doesNotThrow(function () {
      registry.assertBijection();
    });
  });
});

describe("createNameRegistry exclusion classification", function () {
  it("excludes configured prefix and exact-name tokens", function () {
    const tokens = [
      "dissolve-reduced",
      "dissolve-night-mask",
      "shiki",
      "line",
      "min-dark",
    ];
    const registry = createNameRegistry(
      inputFor({
        universe: tokens,
        sourceTokens: tokens,
        exclusions: SITE_EXCLUSIONS,
      }),
    );
    for (const token of tokens) {
      assert.strictEqual(
        registry.nameFor(token),
        undefined,
        `${token} must not be renamed`,
      );
    }
    const byToken = new Map(
      registry.exclusions().map(function (entry) {
        return [entry.token, entry.reason];
      }),
    );
    for (const token of tokens) {
      assert.strictEqual(byToken.get(token), "excluded-prefix", token);
    }
  });

  it("excludes nothing by default: exclusions are a site contract", function () {
    assert.deepStrictEqual(DEFAULT_EXCLUSIONS, {
      names: [],
      prefixes: [],
    });
  });

  it("excludes source tokens that are not in the universe", function () {
    const registry = createNameRegistry(
      inputFor({ universe: ["flex"], sourceTokens: ["flex", "mystery-token"] }),
    );
    assert.strictEqual(registry.nameFor("mystery-token"), undefined);
    const exclusion = registry.exclusions().find(function (entry) {
      return entry.token === "mystery-token";
    });
    assert.ok(exclusion);
    assert.strictEqual(exclusion.reason, "not-in-universe");
  });

  it("excludes tokens seen in runtime contexts even when provable elsewhere", function () {
    const registry = createNameRegistry(
      inputFor({
        universe: ["flex"],
        sourceTokens: ["flex"],
        runtimeTokens: ["flex"],
      }),
    );
    assert.strictEqual(registry.nameFor("flex"), undefined);
    const exclusion = registry.exclusions().find(function (entry) {
      return entry.token === "flex";
    });
    assert.ok(exclusion);
    assert.strictEqual(exclusion.reason, "runtime-context");
  });

  it("keeps runtime-toggled universe classes out of the rename side", function () {
    const registry = createNameRegistry(
      inputFor({ universe: ["theme-dark"], runtimeTokens: ["theme-dark"] }),
    );
    assert.strictEqual(registry.nameFor("theme-dark"), undefined);
    const exclusion = registry.exclusions().find(function (entry) {
      return entry.token === "theme-dark";
    });
    assert.ok(exclusion);
    assert.strictEqual(exclusion.reason, "runtime-context");
  });

  it("excludes universe classes absent from source tokens as css-only", function () {
    const registry = createNameRegistry(
      inputFor({ universe: ["flex", "sr-only"], sourceTokens: ["flex"] }),
    );
    assert.strictEqual(registry.nameFor("sr-only"), undefined);
    const exclusion = registry.exclusions().find(function (entry) {
      return entry.token === "sr-only";
    });
    assert.ok(exclusion);
    assert.strictEqual(exclusion.reason, "css-only");
  });

  it("prefers the configured-prefix reason over runtime-context", function () {
    const registry = createNameRegistry(
      inputFor({
        universe: ["dissolve-reduced"],
        sourceTokens: ["dissolve-reduced"],
        runtimeTokens: ["dissolve-reduced"],
        exclusions: SITE_EXCLUSIONS,
      }),
    );
    const exclusion = registry.exclusions().find(function (entry) {
      return entry.token === "dissolve-reduced";
    });
    assert.ok(exclusion);
    assert.strictEqual(exclusion.reason, "excluded-prefix");
  });

  it("honors a custom exclusion config over the default", function () {
    const registry = createNameRegistry({
      universe: new Set(["shiki", "xyz-widget"]),
      sourceTokens: new Set(["shiki", "xyz-widget"]),
      exclusions: { names: [], prefixes: ["xyz-"] },
    });
    assert.ok(
      registry.nameFor("shiki") !== undefined,
      "shiki is renamed once the default config is replaced",
    );
    assert.strictEqual(registry.nameFor("xyz-widget"), undefined);
    const exclusion = registry.exclusions().find(function (entry) {
      return entry.token === "xyz-widget";
    });
    assert.ok(exclusion);
    assert.strictEqual(exclusion.reason, "excluded-prefix");
  });
});

describe("createNameRegistry collision policy (R10)", function () {
  it("fails loudly when two tokens hash to the same name", function () {
    assert.throws(function () {
      createNameRegistry(
        inputFor({
          universe: ["flex", "grid"],
          sourceTokens: ["flex", "grid"],
          hash: function () {
            return "aaaa";
          },
        }),
      );
    }, /collision.*flex.*grid|collision.*grid.*flex/);
  });

  it("fails loudly when a generated name collides with an excluded name", function () {
    // Only ident-safe excluded names can collide with a generated name; the
    // default config's ident-safe members are the Shiki classes.
    assert.throws(function () {
      createNameRegistry(
        inputFor({
          universe: ["flex", "shiki"],
          sourceTokens: ["flex", "shiki"],
          hash: function () {
            return "shiki";
          },
        }),
      );
    }, /collision.*shiki/);
  });

  it("fails loudly even for an excluded name outside the ident alphabet", function () {
    // A hash could never return dissolve-reduced (hyphens are outside the
    // alphabet), but a stubbed hash must still die loudly — here via the
    // identifier guard, never silently.
    assert.throws(function () {
      createNameRegistry(
        inputFor({
          universe: ["flex", "dissolve-reduced"],
          sourceTokens: ["flex", "dissolve-reduced"],
          hash: function () {
            return "dissolve-reduced";
          },
        }),
      );
    });
  });

  it("fails loudly when a generated name collides with a css-only name", function () {
    assert.throws(function () {
      createNameRegistry(
        inputFor({
          universe: ["flex", "ab12"],
          sourceTokens: ["flex"],
          hash: function () {
            return "ab12";
          },
        }),
      );
    }, /collision.*ab12/);
  });

  it("names the next length that would miss a reserved hash", function () {
    const taken = hashClassName("flex");
    assert.notStrictEqual(taken, "flex");
    assert.throws(function () {
      createNameRegistry(
        inputFor({
          universe: ["flex", taken],
          sourceTokens: ["flex"],
        }),
      );
    }, /increase naming.length to 5/);
  });

  it("fails loudly when a hash produces a non-ident-safe name", function () {
    assert.throws(function () {
      createNameRegistry(
        inputFor({
          universe: ["flex"],
          sourceTokens: ["flex"],
          hash: function () {
            return "9ab";
          },
        }),
      );
    }, /identifier/);
  });
});

describe("createNameRegistry file-qualified module keys", function () {
  it("renames definition-site locals without a class-context source token", function () {
    const a = "src/a.module.css\0button";
    const b = "src/b.module.css\0button";
    const registry = createNameRegistry(
      inputFor({ universe: [a, b], sourceTokens: [a, b] }),
    );
    assert.notStrictEqual(registry.nameFor(a), registry.nameFor(b));
    assert.ok(registry.nameFor(a) !== undefined);
    assert.ok(registry.nameFor(b) !== undefined);
  });
});
