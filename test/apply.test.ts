import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { applyBuildOutput } from "../src/apply.js";
import { parseArgs } from "../src/apply-cli.js";
import { createNameRegistry, type NameRegistry } from "../src/names.js";
import { transformBundle } from "../src/transform-bundle.js";
import { transformModule } from "../src/transform-source.js";
import type { ConsolidationVerdict } from "../src/consolidate.js";

// The post-build path (`minwind apply`): emitted HTML rewrites through the
// same walker as the SFC formats, stylesheets through the shared CSS core,
// and compiled JS bundles through the conservative bundle pass.

const TOKENS = ["flex", "flex-col", "items-center", "p-4", "mb-16"];

const REGISTRY: NameRegistry = createNameRegistry({
  universe: new Set(TOKENS),
  sourceTokens: new Set(TOKENS),
  runtimeTokens: new Set(),
  exclusions: { names: [], prefixes: [] },
});

function nameOf(token: string): string {
  const name = REGISTRY.nameFor(token);
  assert.ok(name !== undefined, `${token} must be renamed`);
  return name;
}

const LAYERED_CSS =
  "@layer theme,base,components,utilities;" +
  "@layer utilities{" +
  ".flex{display:flex}" +
  ".flex-col{flex-direction:column}" +
  ".items-center{align-items:center}" +
  ".p-4{padding:1rem}" +
  ".mb-16{margin-bottom:4rem}" +
  "}";

describe("parseArgs mode flags", function () {
  it("defaults to compress", function () {
    const options = parseArgs(["/tmp/out"]);
    assert.strictEqual(options.mode, "compress");
    assert.strictEqual(options.consolidate, true);
  });

  it("maps --mode morph and --no-consolidate to morph", function () {
    assert.strictEqual(parseArgs(["/tmp/out", "--mode", "morph"]).mode, "morph");
    assert.strictEqual(parseArgs(["/tmp/out", "--no-consolidate"]).mode, "morph");
    assert.strictEqual(
      parseArgs(["/tmp/out", "--no-consolidate"]).consolidate,
      false,
    );
  });
});

describe("transformModule on emitted HTML", function () {
  it("renames class attributes in a built page", function () {
    const result = transformModule({
      code: `<!doctype html><html><body><div class="flex flex-col">x</div></body></html>`,
      id: "/out/index.html",
      registry: REGISTRY,
    });
    assert.ok(result !== null);
    assert.ok(
      result.code.includes(`class="${nameOf("flex")} ${nameOf("flex-col")}"`),
    );
  });

  it("collapses a repeated list to its consolidated name", function () {
    const verdicts: Array<ConsolidationVerdict> = [
      { tokens: ["flex", "p-4"], frequency: 4, safe: true, name: "combo" },
    ];
    const result = transformModule({
      code: `<div class="flex p-4">x</div>`,
      id: "/out/index.html",
      registry: REGISTRY,
      consolidationVerdicts: verdicts,
    });
    assert.ok(result !== null);
    assert.ok(result.code.includes(`class="combo"`));
  });

  it("warns on registry tokens left in inline scripts", function () {
    const result = transformModule({
      code: `<div class="flex">x</div><script>el.classList.add("mb-16")</script>`,
      id: "/out/index.html",
      registry: REGISTRY,
    });
    assert.ok(result !== null);
    assert.ok(result.code.includes(`classList.add("mb-16")`));
    assert.ok(
      result.warnings.some(function (warning) {
        return warning.kind === "reverse-leak" && warning.token === "mb-16";
      }),
    );
  });
});

describe("transformBundle", function () {
  it("renames class spans inside markup template strings", function () {
    // Solid-style compiled output: markup lives in template literals.
    const result = transformBundle({
      code: 'const tpl = `<div class="flex items-center">x</div>`;\n',
      id: "/out/assets/app.js",
      registry: REGISTRY,
    });
    assert.ok(result !== null);
    assert.ok(
      result.code.includes(
        `class="${nameOf("flex")} ${nameOf("items-center")}"`,
      ),
    );
  });

  it("renames escaped-quote markup in double-quoted strings", function () {
    const result = transformBundle({
      code: 'const tpl = "<div class=\\"flex p-4\\">x</div>";\n',
      id: "/out/assets/app.js",
      registry: REGISTRY,
    });
    assert.ok(result !== null);
    assert.ok(
      result.code.includes(`class=\\"${nameOf("flex")} ${nameOf("p-4")}\\"`),
    );
  });

  it("renames className property literals (jsx-runtime props)", function () {
    const result = transformBundle({
      code: 'jsx("div", { className: "flex flex-col", onClick: h });\n',
      id: "/out/assets/app.js",
      registry: REGISTRY,
    });
    assert.ok(result !== null);
    assert.ok(
      result.code.includes(
        `{ className: "${nameOf("flex")} ${nameOf("flex-col")}", onClick: h }`,
      ),
    );
  });

  it("collapses full-list spans to consolidated names", function () {
    const verdicts: Array<ConsolidationVerdict> = [
      { tokens: ["flex", "p-4"], frequency: 5, safe: true, name: "combo" },
    ];
    const result = transformBundle({
      code: 'jsx("div", { className: "flex p-4" });\n',
      id: "/out/assets/app.js",
      registry: REGISTRY,
      consolidationVerdicts: verdicts,
    });
    assert.ok(result !== null);
    assert.ok(result.code.includes(`className: "combo"`));
  });

  it("never touches tokens in non-class strings, and warns instead", function () {
    const result = transformBundle({
      code: 'console.log("flex"); el.classList.add("mb-16");\n',
      id: "/out/assets/app.js",
      registry: REGISTRY,
    });
    assert.ok(result !== null);
    assert.ok(result.code.includes('console.log("flex")'));
    assert.ok(result.code.includes('classList.add("mb-16")'));
    const leaks = result.warnings.filter(function (warning) {
      return warning.kind === "reverse-leak";
    });
    assert.strictEqual(leaks.length, 2);
  });
});

describe("applyBuildOutput", function () {
  it("rewrites html, css, and js in a directory together", function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "minwind-apply-"));
    try {
      fs.writeFileSync(
        path.join(dir, "index.html"),
        `<!doctype html><div class="flex p-4">x</div>`,
      );
      fs.mkdirSync(path.join(dir, "assets"));
      fs.writeFileSync(path.join(dir, "assets", "app.css"), LAYERED_CSS);
      fs.writeFileSync(
        path.join(dir, "assets", "app.js"),
        'const tpl = `<span class="mb-16">y</span>`;\n',
      );
      const result = applyBuildOutput({
        dir,
        registry: REGISTRY,
        consolidationVerdicts: [],
        consolidate: false,
      });
      assert.strictEqual(result.htmlFiles, 1);
      assert.strictEqual(result.cssFiles, 1);
      assert.strictEqual(result.jsFiles, 1);
      assert.strictEqual(result.rewrittenFiles, 3);
      assert.ok(
        fs
          .readFileSync(path.join(dir, "index.html"), "utf8")
          .includes(`class="${nameOf("flex")} ${nameOf("p-4")}"`),
      );
      const css = fs.readFileSync(path.join(dir, "assets", "app.css"), "utf8");
      assert.ok(css.includes(`.${nameOf("flex")}{display:flex}`));
      assert.ok(css.includes(`.${nameOf("mb-16")}{margin-bottom:4rem}`));
      assert.ok(
        fs
          .readFileSync(path.join(dir, "assets", "app.js"), "utf8")
          .includes(`class="${nameOf("mb-16")}"`),
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("dry-run reports without writing", function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "minwind-apply-"));
    try {
      const html = `<!doctype html><div class="flex">x</div>`;
      fs.writeFileSync(path.join(dir, "index.html"), html);
      const result = applyBuildOutput({
        dir,
        registry: REGISTRY,
        consolidationVerdicts: [],
        consolidate: false,
        dryRun: true,
      });
      assert.strictEqual(result.rewrittenFiles, 1);
      assert.strictEqual(
        fs.readFileSync(path.join(dir, "index.html"), "utf8"),
        html,
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("drops tokens that leak in unrewritable positions, everywhere", function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "minwind-apply-"));
    try {
      // mb-16 appears in a minified call argument (unrewritable) and in a
      // provable markup template; flex only in provable positions.
      fs.writeFileSync(
        path.join(dir, "index.html"),
        `<!doctype html><div class="flex">x</div><span class="mb-16">y</span>`,
      );
      fs.writeFileSync(path.join(dir, "app.css"), LAYERED_CSS);
      fs.writeFileSync(
        path.join(dir, "app.js"),
        'const tpl = `<b class="mb-16">z</b>`; r(el, "mb-16");\n',
      );
      const result = applyBuildOutput({
        dir,
        registry: REGISTRY,
        consolidationVerdicts: [],
        consolidate: false,
      });
      assert.deepStrictEqual(result.keptOriginal, ["mb-16"]);
      // The DOM keeps the original name in every position...
      const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
      assert.ok(html.includes(`class="${nameOf("flex")}"`));
      assert.ok(html.includes(`class="mb-16"`));
      const js = fs.readFileSync(path.join(dir, "app.js"), "utf8");
      assert.ok(js.includes(`class="mb-16"`));
      assert.ok(js.includes(`r(el, "mb-16")`));
      // ...and the stylesheet keeps the original selector to match.
      const css = fs.readFileSync(path.join(dir, "app.css"), "utf8");
      assert.ok(css.includes(".mb-16{margin-bottom:4rem}"));
      assert.ok(css.includes(`.${nameOf("flex")}{display:flex}`));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
