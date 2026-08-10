import assert from "node:assert";
import { describe, it } from "node:test";
import {
  createCustomPropertyRegistry,
  scanCustomPropertySource,
  transformCustomPropertiesInCss,
  transformCustomPropertiesInSource,
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

  it("rejects malformed and duplicate ownership declarations", function () {
    assert.throws(function () {
      createCustomPropertyRegistry({ owned: ["color-accent"] });
    }, /must start with --/);
    assert.throws(function () {
      createCustomPropertyRegistry({ owned: ["--accent", "--accent"] });
    }, /duplicate/);
  });

  it("rewrites static CSSOM property-name arguments", function () {
    const registry = createCustomPropertyRegistry({
      owned: ["--color-accent"],
    });
    const code =
      `node.style.setProperty("--color-accent", value);\n` +
      `getComputedStyle(node).getPropertyValue("--color-accent");\n` +
      `node.style.removeProperty("--color-accent");`;
    const result = transformCustomPropertiesInSource(
      code,
      "/site/src/theme.ts",
      registry,
    );
    const name = registry.nameFor("--color-accent") ?? "";
    assert.strictEqual(result.unsafe.size, 0);
    assert.strictEqual(result.code.match(new RegExp(name, "g"))?.length, 3);
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
