import assert from "node:assert";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { discoverBuild } from "../../src/measure/discover.js";
import {
  buildClassModel,
  isTokenReferencedInText,
  type ClassInventoryEntry,
  type ClassModel,
} from "../../src/measure/exclusions.js";
import { BUILD_DIR, assertDemoBuild, buildGate } from "./helpers/build-gate.js";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(TEST_DIR, "fixtures");
const MODEL_SITE = path.join(FIXTURES_DIR, "model-site");

function modelFor(dir: string): ClassModel {
  return buildClassModel(discoverBuild(dir));
}

function entryFor(
  model: ClassModel,
  token: string,
): ClassInventoryEntry | undefined {
  return model.entries.find(function (entry) {
    return entry.token === token;
  });
}

describe("isTokenReferencedInText", () => {
  it("matches an exact literal bounded by quotes", () => {
    assert.ok(isTokenReferencedInText("active", "cls = 'active'"));
    assert.ok(isTokenReferencedInText("active", "active"));
    assert.ok(
      isTokenReferencedInText(
        "hover:border-accent",
        "classList.toggle('hover:border-accent')",
      ),
    );
  });

  it("rejects substrings inside longer class-like tokens", () => {
    assert.ok(!isTokenReferencedInText("active", "cls = 'inactive'"));
    assert.ok(!isTokenReferencedInText("active", "cls = 'interactive'"));
    assert.ok(!isTokenReferencedInText("border", "cls = 'border-accent'"));
    assert.ok(
      !isTokenReferencedInText("transform", "transform:translateX(1px)"),
    );
    assert.ok(!isTokenReferencedInText("mystery", "cls = 'mystery-box'"));
  });

  it("matches tokens containing css-special characters literally", () => {
    assert.ok(isTokenReferencedInText("[&_pre]:p-4", "cls = '[&_pre]:p-4'"));
    assert.ok(isTokenReferencedInText("contrast-[0.9]", "'contrast-[0.9]'"));
  });
});

describe("buildClassModel categorization", () => {
  const model = modelFor(MODEL_SITE);

  it("categorizes utilities with rules in the utilities layer", () => {
    for (const token of [
      "bg-white",
      "hover:bg-red-500",
      "alpha",
      "beta",
      "group-hover:glow",
      "group-hover:v4",
      "space-y-3",
    ]) {
      const entry = entryFor(model, token);
      assert.ok(entry, `expected an inventory entry for ${token}`);
      assert.strictEqual(entry.category, "utility", `category for ${token}`);
      assert.ok(!entry.excluded);
    }
  });

  it("categorizes a class with a rule outside the utilities layer as custom", () => {
    const entry = entryFor(model, "brand-title");
    assert.ok(entry);
    assert.strictEqual(entry.category, "custom");
    assert.ok(!entry.excluded);
    assert.strictEqual(entry.ruleCount, 1);
  });

  it("categorizes rule-less group/peer tokens referenced by variants as markers", () => {
    const group = entryFor(model, "group");
    assert.ok(group);
    assert.strictEqual(group.category, "marker");
    assert.ok(group.excluded);
    assert.strictEqual(group.ruleCount, 0);
    assert.strictEqual(group.variantReferences, 2);
    const peer = entryFor(model, "peer");
    assert.ok(peer);
    assert.strictEqual(peer.category, "marker");
    assert.ok(peer.excluded);
    assert.strictEqual(peer.variantReferences, 1);
  });

  it("categorizes exact literals in JS bundles as js-referenced even with a rule", () => {
    const entry = entryFor(model, "js-toggled");
    assert.ok(entry);
    assert.strictEqual(entry.category, "js-referenced");
    assert.ok(entry.excluded);
    assert.strictEqual(entry.ruleCount, 1);
    assert.strictEqual(entry.htmlOccurrences, 1);
  });

  it("categorizes exact literals in inline script text as js-referenced", () => {
    const entry = entryFor(model, "inline-toggled");
    assert.ok(entry);
    assert.strictEqual(entry.category, "js-referenced");
    assert.ok(entry.excluded);
  });

  it("does not treat near-miss substrings in JS as references", () => {
    const brand = entryFor(model, "brand-title");
    assert.ok(brand);
    assert.ok(!brand.jsReferenced, "brand-title-ish must not mark brand-title");
    const mystery = entryFor(model, "mystery");
    assert.ok(mystery);
    assert.ok(!mystery.jsReferenced, "mystery-box must not mark mystery");
  });

  it("categorizes classes with rules but no HTML usage as css-only", () => {
    for (const token of ["css-only-class", "peer-checked:x"]) {
      const entry = entryFor(model, token);
      assert.ok(entry, `expected an inventory entry for ${token}`);
      assert.strictEqual(entry.category, "css-only", `category for ${token}`);
      assert.ok(entry.excluded);
      assert.strictEqual(entry.htmlOccurrences, 0);
    }
  });

  it("categorizes HTML tokens with no rule, reference, or JS literal as unmodelable", () => {
    const entry = entryFor(model, "mystery");
    assert.ok(entry);
    assert.strictEqual(entry.category, "unmodelable");
    assert.ok(entry.excluded);
    assert.strictEqual(entry.htmlOccurrences, 1);
  });

  it("excludes exactly marker, css-only, js-referenced, and unmodelable", () => {
    const excludedCategories = new Set([
      "marker",
      "css-only",
      "js-referenced",
      "unmodelable",
    ]);
    for (const entry of model.entries) {
      assert.strictEqual(
        entry.excluded,
        excludedCategories.has(entry.category),
        `excluded flag for ${entry.token} (${entry.category})`,
      );
    }
  });

  it("records per-category excluded byte share of class-token bytes", () => {
    assert.strictEqual(model.totalClassTokenBytes, 123);
    assert.strictEqual(model.excludedClassTokenBytes, 40);
    const shares = model.excludedByteShareByCategory;
    assert.ok(Math.abs((shares["marker"] ?? 0) - 9 / 123) < 1e-9);
    assert.ok(Math.abs((shares["js-referenced"] ?? 0) - 24 / 123) < 1e-9);
    assert.ok(Math.abs((shares["unmodelable"] ?? 0) - 7 / 123) < 1e-9);
    assert.ok(Math.abs((shares["css-only"] ?? 0) - 0) < 1e-9);
  });

  it("skips and lists a file with a duplicate class attribute", () => {
    const dupModel = modelFor(path.join(FIXTURES_DIR, "dup-class"));
    assert.strictEqual(dupModel.skippedFiles.length, 1);
    assert.match(dupModel.skippedFiles[0].filePath, /index\.html$/);
    assert.match(dupModel.skippedFiles[0].reason, /duplicate class attribute/i);
    const bgWhite = entryFor(dupModel, "bg-white");
    assert.ok(bgWhite);
    assert.strictEqual(bgWhite.category, "css-only");
  });
});

describe("demo build inventory (known cases)", () => {
  it("classifies known demo build cases correctly", buildGate(), () => {
    assertDemoBuild();
    const model = modelFor(BUILD_DIR);
    const hoverBorder = entryFor(model, "hover:border-accent");
    assert.ok(hoverBorder, "expected hover:border-accent in the inventory");
    assert.strictEqual(hoverBorder.category, "js-referenced");
    // The demo's app.css defines two utility classes nothing references.
    for (const token of ["demo-unused", "demo-also-unused"]) {
      const entry = entryFor(model, token);
      assert.ok(entry, `expected an inventory entry for ${token}`);
      assert.strictEqual(entry.category, "css-only", `category for ${token}`);
    }
    // SolidStart client bundles embed the same markup templates, so classes
    // with HTML usage are also exact literals in JS bundles.
    const flex = entryFor(model, "flex");
    assert.ok(flex);
    assert.strictEqual(flex.category, "js-referenced");
    assert.strictEqual(
      entryFor(model, "group"),
      undefined,
      "group does not appear in the demo build",
    );
    assert.strictEqual(model.skippedFiles.length, 0);
  });
});
