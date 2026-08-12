import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { applyBuildOutput } from "../src/apply.js";
import { parseArgs, runApplyCli } from "../src/apply-cli.js";
import {
  collectModuleInventory,
  createModuleNameRegistry,
  hashModuleLocal,
  SCSS_SASS_ERROR,
} from "../src/engines/css-modules.js";
import {
  createNameRegistry,
  hashClassName,
  type NameRegistry,
} from "../src/names.js";
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
    assert.strictEqual(
      parseArgs(["/tmp/out", "--mode", "morph"]).mode,
      "morph",
    );
    assert.strictEqual(
      parseArgs(["/tmp/out", "--no-consolidate"]).mode,
      "morph",
    );
    assert.strictEqual(
      parseArgs(["/tmp/out", "--no-consolidate"]).consolidate,
      false,
    );
  });

  it("accepts the CSS Modules engine with hash naming", function () {
    const options = parseArgs(["/tmp/out", "--engines", "css-modules"]);
    assert.deepStrictEqual(options.engines, ["css-modules"]);
    assert.strictEqual(options.naming, undefined);
  });

  it("rejects quotes with the CSS Modules engine (AE6)", function () {
    const exit = process.exit;
    const writes: Array<string> = [];
    const write = process.stderr.write;
    process.stderr.write = function (chunk: string | Uint8Array) {
      writes.push(String(chunk));
      return true;
    } as typeof process.stderr.write;
    process.exit = function (code?: number): never {
      throw new Error(`exit ${code}`);
    } as typeof process.exit;
    try {
      assert.throws(function () {
        parseArgs([
          "/tmp/out",
          "--engines",
          "css-modules",
          "--naming",
          "quotes",
        ]);
      }, /exit 1/);
      assert.ok(writes.join("").includes("quotes"));
      assert.ok(!writes.join("").includes("does not support the CSS Modules"));
    } finally {
      process.exit = exit;
      process.stderr.write = write;
    }
  });

  it("loads words vocabulary from --vocabulary", function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "minwind-vocab-"));
    const vocab = path.join(dir, "words.json");
    fs.writeFileSync(vocab, JSON.stringify(["alpha", "bravo"]));
    try {
      const options = parseArgs([
        "/tmp/out",
        "--engines",
        "css-modules",
        "--naming",
        "words",
        "--vocabulary",
        vocab,
      ]);
      assert.deepStrictEqual(options.naming, {
        strategy: "words",
        vocabulary: ["alpha", "bravo"],
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("requires --vocabulary for --naming words", function () {
    const exit = process.exit;
    const writes: Array<string> = [];
    const write = process.stderr.write;
    process.stderr.write = function (chunk: string | Uint8Array) {
      writes.push(String(chunk));
      return true;
    } as typeof process.stderr.write;
    process.exit = function (code?: number): never {
      throw new Error(`exit ${code}`);
    } as typeof process.exit;
    try {
      assert.throws(function () {
        parseArgs([
          "/tmp/out",
          "--engines",
          "css-modules",
          "--naming",
          "words",
        ]);
      }, /exit 1/);
      assert.ok(writes.join("").includes("--vocabulary"));
    } finally {
      process.exit = exit;
      process.stderr.write = write;
    }
  });

  it("fails words apply when SCSS modules exist without sass (R8)", async function () {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "minwind-scss-root-"));
    const out = fs.mkdtempSync(path.join(os.tmpdir(), "minwind-scss-out-"));
    const vocab = path.join(root, "words.json");
    fs.mkdirSync(path.join(root, "src"));
    fs.writeFileSync(
      path.join(root, "src", "button.module.scss"),
      ".root { color: red }",
    );
    fs.writeFileSync(vocab, JSON.stringify(["alpha"]));
    const previous = process.env.MINWIND_FORCE_NO_SASS;
    process.env.MINWIND_FORCE_NO_SASS = "1";
    try {
      await assert.rejects(
        function () {
          return runApplyCli([
            out,
            "--root",
            root,
            "--engines",
            "css-modules",
            "--naming",
            "words",
            "--vocabulary",
            vocab,
          ]);
        },
        new RegExp(SCSS_SASS_ERROR.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      );
    } finally {
      if (previous === undefined) {
        delete process.env.MINWIND_FORCE_NO_SASS;
      } else {
        process.env.MINWIND_FORCE_NO_SASS = previous;
      }
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(out, { recursive: true, force: true });
    }
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

describe("applyBuildOutput Modules remap", function () {
  it("rewrites proven Module names in JS, CSS, and HTML together", function () {
    const site = fs.mkdtempSync(path.join(os.tmpdir(), "minwind-mod-root-"));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "minwind-mod-out-"));
    try {
      fs.mkdirSync(path.join(site, "src"));
      const moduleFile = path.join(site, "src", "Button.module.css");
      fs.writeFileSync(moduleFile, ".root { color: red }");
      const inventory = collectModuleInventory(site);
      const registry = createModuleNameRegistry(inventory);
      const expected = hashModuleLocal(site, moduleFile, "root");
      const bundler = "Button-module__abc__root";
      fs.writeFileSync(
        path.join(dir, "index.html"),
        `<div class="${bundler}">x</div>`,
      );
      fs.mkdirSync(path.join(dir, "assets"));
      fs.writeFileSync(
        path.join(dir, "assets", "app.css"),
        `.${bundler}{color:red}`,
      );
      fs.writeFileSync(
        path.join(dir, "assets", "app.js"),
        `const styles = { root: "${bundler}" };\n`,
      );
      applyBuildOutput({
        dir,
        registry: createNameRegistry({
          universe: new Set(),
          sourceTokens: new Set(),
        }),
        consolidationVerdicts: [],
        consolidate: false,
        modules: { root: site, inventory, registry },
      });
      assert.ok(
        fs
          .readFileSync(path.join(dir, "index.html"), "utf8")
          .includes(`class="${expected}"`),
      );
      assert.ok(
        fs
          .readFileSync(path.join(dir, "assets", "app.css"), "utf8")
          .includes(`.${expected}{color:red}`),
      );
      const js = fs.readFileSync(path.join(dir, "assets", "app.js"), "utf8");
      assert.ok(js.includes(`root: "${expected}"`));
      assert.ok(!js.includes(bundler));
    } finally {
      fs.rmSync(site, { recursive: true, force: true });
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not fail when HTML is missing after a proven JS and CSS remap", function () {
    const site = fs.mkdtempSync(path.join(os.tmpdir(), "minwind-mod-root-"));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "minwind-mod-out-"));
    try {
      fs.mkdirSync(path.join(site, "src"));
      const moduleFile = path.join(site, "src", "Button.module.css");
      fs.writeFileSync(moduleFile, ".root { color: red }");
      const inventory = collectModuleInventory(site);
      const registry = createModuleNameRegistry(inventory);
      const expected = hashModuleLocal(site, moduleFile, "root");
      const bundler = "Button-module__abc__root";
      fs.writeFileSync(path.join(dir, "app.css"), `.${bundler}{color:red}`);
      fs.writeFileSync(
        path.join(dir, "app.js"),
        `const styles = { root: "${bundler}" };\n`,
      );
      applyBuildOutput({
        dir,
        registry: createNameRegistry({
          universe: new Set(),
          sourceTokens: new Set(),
        }),
        consolidationVerdicts: [],
        consolidate: false,
        modules: { root: site, inventory, registry },
      });
      assert.ok(
        fs
          .readFileSync(path.join(dir, "app.css"), "utf8")
          .includes(`.${expected}`),
      );
      assert.ok(
        fs
          .readFileSync(path.join(dir, "app.js"), "utf8")
          .includes(`"${expected}"`),
      );
    } finally {
      fs.rmSync(site, { recursive: true, force: true });
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("gives Module local flex and Tailwind flex distinct names (AE5)", function () {
    const site = fs.mkdtempSync(path.join(os.tmpdir(), "minwind-dual-root-"));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "minwind-dual-out-"));
    try {
      fs.mkdirSync(path.join(site, "src"));
      const moduleFile = path.join(site, "src", "Card.module.css");
      fs.writeFileSync(moduleFile, ".flex { gap: 4px }");
      const inventory = collectModuleInventory(site);
      const modulesRegistry = createModuleNameRegistry(inventory);
      const twFlex = hashClassName("flex");
      const modFlex = hashModuleLocal(site, moduleFile, "flex");
      assert.notStrictEqual(twFlex, modFlex);
      const bundler = "Card-module__abc__flex";
      fs.writeFileSync(
        path.join(dir, "index.html"),
        `<div class="flex ${bundler}">x</div>`,
      );
      fs.writeFileSync(path.join(dir, "app.css"), LAYERED_CSS);
      fs.writeFileSync(path.join(dir, "card.css"), `.${bundler}{gap:4px}`);
      fs.writeFileSync(
        path.join(dir, "app.js"),
        `const styles = { flex: "${bundler}" };\n`,
      );
      applyBuildOutput({
        dir,
        registry: REGISTRY,
        consolidationVerdicts: [],
        consolidate: false,
        modules: {
          root: site,
          inventory,
          registry: modulesRegistry,
        },
      });
      const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
      assert.ok(html.includes(`class="${twFlex} ${modFlex}"`));
      const card = fs.readFileSync(path.join(dir, "card.css"), "utf8");
      assert.ok(card.includes(`.${modFlex}{gap:4px}`));
      assert.ok(!card.includes("@layer"));
      const app = fs.readFileSync(path.join(dir, "app.css"), "utf8");
      assert.ok(app.includes(`.${twFlex}{display:flex}`));
    } finally {
      fs.rmSync(site, { recursive: true, force: true });
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not consolidate Module stylesheets under dual-stack compress", function () {
    const site = fs.mkdtempSync(path.join(os.tmpdir(), "minwind-dual-root-"));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "minwind-dual-out-"));
    try {
      fs.mkdirSync(path.join(site, "src"));
      const moduleFile = path.join(site, "src", "Card.module.css");
      fs.writeFileSync(
        moduleFile,
        ".root { color: red }\n.title { color: blue }",
      );
      const inventory = collectModuleInventory(site);
      const modulesRegistry = createModuleNameRegistry(inventory);
      const bundlerRoot = "Card-module__abc__root";
      const bundlerTitle = "Card-module__abc__title";
      fs.writeFileSync(path.join(dir, "app.css"), LAYERED_CSS);
      fs.writeFileSync(
        path.join(dir, "card.css"),
        `.${bundlerRoot}{color:red}.${bundlerTitle}{color:blue}`,
      );
      fs.writeFileSync(
        path.join(dir, "app.js"),
        `const styles = { root: "${bundlerRoot}", title: "${bundlerTitle}" };\n`,
      );
      const verdicts: Array<ConsolidationVerdict> = [
        { tokens: ["flex", "p-4"], frequency: 4, safe: true, name: "combo" },
      ];
      applyBuildOutput({
        dir,
        registry: REGISTRY,
        consolidationVerdicts: verdicts,
        consolidate: true,
        modules: {
          root: site,
          inventory,
          registry: modulesRegistry,
        },
      });
      const card = fs.readFileSync(path.join(dir, "card.css"), "utf8");
      const expectedRoot = hashModuleLocal(site, moduleFile, "root");
      const expectedTitle = hashModuleLocal(site, moduleFile, "title");
      assert.ok(card.includes(`.${expectedRoot}{color:red}`));
      assert.ok(card.includes(`.${expectedTitle}{color:blue}`));
      assert.ok(!card.includes("combo"));
    } finally {
      fs.rmSync(site, { recursive: true, force: true });
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
