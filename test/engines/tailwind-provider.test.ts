import assert from "node:assert";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  compileTailwindStylesheet,
  tailwindEngine,
} from "../../src/engines/tailwind.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.join(HERE, "..", "fixtures", "prepass-site");

describe("Tailwind engine provider", function () {
  it("identifies as the css-entry engine", function () {
    assert.strictEqual(tailwindEngine.id, "tailwind");
    assert.strictEqual(tailwindEngine.requiresCssEntry, true);
  });

  it("compiles a readable Tailwind entry", async function () {
    const result = await compileTailwindStylesheet({
      cssEntry: path.join(SITE, "src", "app.css"),
      root: SITE,
    });
    assert.ok(result.stylesheet.includes("@layer"));
  });

  it("fails with an actionable error when cssEntry is missing", async function () {
    await assert.rejects(async function () {
      await compileTailwindStylesheet({
        cssEntry: path.join(SITE, "src", "does-not-exist.css"),
        root: SITE,
      });
    }, /could not read cssEntry/);
  });
});
