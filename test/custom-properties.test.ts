import assert from "node:assert";
import { describe, it } from "node:test";
import {
  createCustomPropertyRegistry,
  scanCustomPropertySource,
  transformCustomPropertiesInCss,
} from "../src/custom-properties.js";
import { createNameRegistry } from "../src/names.js";
import { buildRenameMap, buildReport } from "../src/report.js";

describe("owned custom properties", function () {
  it("creates stable short names only for explicitly owned properties", function () {
    const registry = createCustomPropertyRegistry({
      owned: ["--color-accent", "--surface"],
    });
    assert.match(
      registry.nameFor("--color-accent") ?? "",
      /^--[a-z][a-z0-9]{3}$/,
    );
    assert.strictEqual(registry.nameFor("--third-party"), undefined);
    assert.doesNotThrow(function () {
      registry.assertBijection();
    });
  });

  it("uses explicit aliases while generating names for unmapped owned properties", function () {
    const registry = createCustomPropertyRegistry({
      owned: ["--surface", "--content-width"],
      aliases: { "--surface": "--s" },
    });
    assert.strictEqual(registry.nameFor("--surface"), "--s");
    assert.match(
      registry.nameFor("--content-width") ?? "",
      /^--[a-z][a-z0-9]{3}$/,
    );
  });

  it("rejects malformed and duplicate ownership declarations", function () {
    assert.throws(function () {
      createCustomPropertyRegistry({ owned: ["color-accent"] });
    }, /must start with --/);
    assert.throws(function () {
      createCustomPropertyRegistry({ owned: ["--accent", "--accent"] });
    }, /duplicate/);
  });

  it("rejects invalid, unowned, duplicate, and reserved aliases", function () {
    assert.throws(function () {
      createCustomPropertyRegistry({
        owned: ["--accent"],
        aliases: { "--missing": "--m" },
      });
    }, /alias.*--missing.*owned/);
    assert.throws(function () {
      createCustomPropertyRegistry({
        owned: ["--accent"],
        aliases: { "--accent": "accent" },
      });
    }, /alias.*accent.*start with --/);
    assert.throws(function () {
      createCustomPropertyRegistry({
        owned: ["--accent", "--surface"],
        aliases: { "--accent": "--a", "--surface": "--a" },
      });
    }, /alias.*--a.*more than once/);
    assert.throws(function () {
      createCustomPropertyRegistry(
        { owned: ["--accent"], aliases: { "--accent": "--public" } },
        new Set(),
        new Set(["--public"]),
      );
    }, /alias.*--public.*already in use/);
  });

  it("probes generated names past an explicit alias", function () {
    const generatedAccent = createCustomPropertyRegistry({
      owned: ["--accent"],
    }).nameFor("--accent");
    assert.ok(generatedAccent !== undefined);
    const registry = createCustomPropertyRegistry({
      owned: ["--accent", "--surface"],
      aliases: { "--surface": generatedAccent },
    });
    assert.strictEqual(registry.nameFor("--surface"), generatedAccent);
    assert.notStrictEqual(registry.nameFor("--accent"), generatedAccent);
  });

  it("poisons dynamic or otherwise unrecognized source occurrences", function () {
    const registry = createCustomPropertyRegistry({
      owned: ["--color-accent"],
    });
    const scan = scanCustomPropertySource(
      `const property = "--color-accent"; node.style.setProperty(property, value);`,
      "/site/src/theme.ts",
      registry,
    );
    assert.deepStrictEqual(Array.from(scan.unsafe), ["--color-accent"]);
  });

  it("does not mistake an unrelated setProperty method for CSSOM", function () {
    const registry = createCustomPropertyRegistry({
      owned: ["--color-accent"],
    });
    const scan = scanCustomPropertySource(
      `store.setProperty("--color-accent", value);`,
      "/site/src/store.ts",
      registry,
    );
    assert.deepStrictEqual(Array.from(scan.unsafe), ["--color-accent"]);
  });

  it("does not rewrite custom-property-looking text in unquoted URLs", function () {
    const registry = createCustomPropertyRegistry({ owned: ["--asset"] });
    assert.strictEqual(
      transformCustomPropertiesInCss(
        `.asset{--asset:red;background:url(--asset.png);color:var(--asset)}`,
        registry,
      ),
      `.asset{${registry.nameFor("--asset")}:red;background:url(--asset.png);color:var(${registry.nameFor("--asset")})}`,
    );
  });

  it("rewrites owned property names in CSS conditions", function () {
    const registry = createCustomPropertyRegistry({ owned: ["--accent"] });
    const name = registry.nameFor("--accent") ?? "";
    assert.strictEqual(
      transformCustomPropertiesInCss(
        `@supports (--accent: red){.x{--accent:red}}` +
          `@container style(--accent: red){.y{color:var(--accent)}}`,
        registry,
      ),
      `@supports (${name}: red){.x{${name}:red}}` +
        `@container style(${name}: red){.y{color:var(${name})}}`,
    );
  });

  it("probes deterministically past reserved stylesheet property names", function () {
    const initial = createCustomPropertyRegistry({ owned: ["--accent"] });
    const collision = initial.nameFor("--accent") ?? "";
    const registry = createCustomPropertyRegistry(
      { owned: ["--accent"] },
      new Set(),
      new Set([collision]),
    );
    assert.notStrictEqual(registry.nameFor("--accent"), collision);
    assert.strictEqual(
      registry.nameFor("--accent"),
      createCustomPropertyRegistry(
        { owned: ["--accent"] },
        new Set(),
        new Set([collision]),
      ).nameFor("--accent"),
    );
  });

  it("records renamed and excluded properties in build artifacts", function () {
    const properties = createCustomPropertyRegistry(
      { owned: ["--accent", "--public-theme"] },
      new Set(["--public-theme"]),
    );
    const classes = createNameRegistry({
      universe: new Set<string>(),
      sourceTokens: new Set<string>(),
    });
    const report = buildReport({
      registry: classes,
      verdicts: [],
      warnings: [],
      consolidate: false,
      customProperties: properties,
    });
    assert.deepStrictEqual(report.customProperties, {
      renames: [{ property: "--accent", name: properties.nameFor("--accent") }],
      excluded: [{ property: "--public-theme", reason: "source-context" }],
    });
    const map = buildRenameMap(classes, [], properties);
    assert.deepStrictEqual(map.customProperties, {
      [properties.nameFor("--accent") ?? ""]: "--accent",
    });
  });
});
