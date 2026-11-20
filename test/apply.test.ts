import assert from "node:assert";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import MagicString, { Bundle } from "magic-string";
import * as parse5 from "parse5";
import { applyBuildOutput, type ApplyResult } from "../src/apply.js";
import { parseArgs, runApplyCli } from "../src/apply-cli.js";
import { createDialectHasher } from "../src/dialect.js";
import { compileTailwindStylesheet } from "../src/engines/tailwind.js";
import { MODULES_COMPRESS_WARNING } from "../src/flags.js";
import { runProminenceCli } from "../src/prominence-cli.js";
import type { RenameMap, TransformReport } from "../src/report.js";
import { runApply } from "../src/run-apply.js";
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
import {
  transformModule,
  type TransformSourceResult,
} from "../src/transform-source.js";
import type { ConsolidationVerdict } from "../src/consolidate.js";
import type { SourceMapLike, VendorTrust } from "../src/vendor-provenance.js";

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

  it("requires --quotes for --naming quotes", function () {
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
        parseArgs(["/tmp/out", "--naming", "quotes"]);
      }, /exit 1/);
      assert.ok(writes.join("").includes("--quotes"));
    } finally {
      process.exit = exit;
      process.stderr.write = write;
    }
  });

  it("loads sentences from --quotes", function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "minwind-quotes-"));
    const file = path.join(dir, "quotes.json");
    fs.writeFileSync(
      file,
      JSON.stringify(["Ask not what your country can do for you"]),
    );
    try {
      const options = parseArgs(["/tmp/out", "--quotes", file]);
      assert.deepStrictEqual(options.naming, {
        strategy: "quotes",
        quotes: ["Ask not what your country can do for you"],
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("accepts --hash-length on the hash strategy", function () {
    const options = parseArgs(["/tmp/out", "--hash-length", "6"]);
    assert.deepStrictEqual(options.naming, { strategy: "hash", length: 6 });
  });

  it("accepts --hash-prefix on the hash strategy", function () {
    const options = parseArgs(["/tmp/out", "--hash-prefix", "tw"]);
    assert.deepStrictEqual(options.naming, {
      strategy: "hash",
      prefix: "tw",
    });
  });

  it("accepts --hash-prefix together with --hash-length", function () {
    const options = parseArgs([
      "/tmp/out",
      "--hash-prefix",
      "tw-",
      "--hash-length",
      "6",
    ]);
    assert.deepStrictEqual(options.naming, {
      strategy: "hash",
      length: 6,
      prefix: "tw-",
    });
  });

  it("accepts --hash-alphabet on the hash strategy", function () {
    const options = parseArgs(["/tmp/out", "--hash-alphabet", "abcd"]);
    assert.deepStrictEqual(options.naming, {
      strategy: "hash",
      alphabet: "abcd",
    });
  });

  it("accepts --hash-salt on the hash strategy", function () {
    const options = parseArgs(["/tmp/out", "--hash-salt", "v2"]);
    assert.deepStrictEqual(options.naming, {
      strategy: "hash",
      salt: "v2",
    });
  });

  it("rejects --hash-length below 4", function () {
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
        parseArgs(["/tmp/out", "--hash-length", "3"]);
      }, /exit 1/);
      assert.ok(writes.join("").includes("naming.length"));
    } finally {
      process.exit = exit;
      process.stderr.write = write;
    }
  });

  it("rejects --hash-prefix with --naming boston", function () {
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
        parseArgs(["/tmp/out", "--naming", "boston", "--hash-prefix", "tw"]);
      }, /exit 1/);
      assert.ok(writes.join("").includes("hash-prefix"));
    } finally {
      process.exit = exit;
      process.stderr.write = write;
    }
  });

  it("accepts --naming boston", function () {
    const options = parseArgs(["/tmp/out", "--naming", "boston"]);
    assert.deepStrictEqual(options.naming, { strategy: "boston" });
  });

  it("accepts --naming yorkshire", function () {
    const options = parseArgs(["/tmp/out", "--naming", "yorkshire"]);
    assert.deepStrictEqual(options.naming, { strategy: "yorkshire" });
  });

  it("accepts --naming geordie", function () {
    const options = parseArgs(["/tmp/out", "--naming", "geordie"]);
    assert.deepStrictEqual(options.naming, { strategy: "geordie" });
  });

  it("accepts --naming piglatin", function () {
    const options = parseArgs(["/tmp/out", "--naming", "piglatin"]);
    assert.deepStrictEqual(options.naming, { strategy: "piglatin" });
  });

  it("loads maps from --maps", function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "minwind-maps-"));
    const mapsFile = path.join(dir, "maps.json");
    fs.writeFileSync(mapsFile, JSON.stringify({ flex: "muscles" }));
    try {
      const options = parseArgs([
        "/tmp/out",
        "--naming",
        "maps",
        "--maps",
        mapsFile,
      ]);
      assert.deepStrictEqual(options.naming, {
        strategy: "maps",
        maps: { flex: "muscles" },
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("overlays --maps onto --naming boston", function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "minwind-overlay-"));
    const mapsFile = path.join(dir, "maps.json");
    fs.writeFileSync(mapsFile, JSON.stringify({ flex: "muscles" }));
    try {
      const options = parseArgs([
        "/tmp/out",
        "--naming",
        "boston",
        "--maps",
        mapsFile,
      ]);
      assert.deepStrictEqual(options.naming, {
        strategy: "boston",
        maps: { flex: "muscles" },
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects --naming maps without --maps", function () {
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
        parseArgs(["/tmp/out", "--naming", "maps"]);
      }, /exit 1/);
      assert.ok(writes.join("").includes("maps"));
    } finally {
      process.exit = exit;
      process.stderr.write = write;
    }
  });

  it("rejects --naming yorkshire together with --theme", function () {
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
          "--naming",
          "yorkshire",
          "--theme",
          "star-wars",
        ]);
      }, /exit 1/);
      assert.ok(writes.join("").includes("yorkshire"));
    } finally {
      process.exit = exit;
      process.stderr.write = write;
    }
  });

  it("accepts --theme star-wars for words naming", function () {
    const options = parseArgs(["/tmp/out", "--theme", "star-wars"]);
    assert.deepStrictEqual(options.naming, {
      strategy: "words",
      theme: "star-wars",
    });
  });

  it("rejects an unknown --theme", function () {
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
        parseArgs(["/tmp/out", "--theme", "spaceballs"]);
      }, /exit 1/);
      assert.ok(writes.join("").includes("star-wars"));
    } finally {
      process.exit = exit;
      process.stderr.write = write;
    }
  });

  it("rejects --theme together with --vocabulary", function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "minwind-vocab-"));
    const vocab = path.join(dir, "words.json");
    fs.writeFileSync(vocab, JSON.stringify(["alpha"]));
    const exit = process.exit;
    const write = process.stderr.write;
    process.stderr.write = function () {
      return true;
    } as typeof process.stderr.write;
    process.exit = function (code?: number): never {
      throw new Error(`exit ${code}`);
    } as typeof process.exit;
    try {
      assert.throws(function () {
        parseArgs(["/tmp/out", "--theme", "star-wars", "--vocabulary", vocab]);
      }, /exit 1/);
    } finally {
      process.exit = exit;
      process.stderr.write = write;
      fs.rmSync(dir, { recursive: true, force: true });
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

  it("requires --theme or --vocabulary for --naming words", function () {
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

// R4 and R5 in built HTML: parse5 drops markup inside <option> and reads
// <noscript> content as raw text, so both leaked their tokens in 1.1.0.
describe("transformModule on emitted <select> and <noscript> markup (R4, R5)", function () {
  it("renames classes inside <option> and <noscript> without a leak", function () {
    const result = transformModule({
      code:
        `<!doctype html><html><head>` +
        `<noscript><link rel="stylesheet" href="/nojs.css"></noscript>` +
        `</head><body>` +
        `<select class="flex"><option class="p-4">` +
        `<span class="items-center">One</span></option></select>` +
        `<noscript><p class="mb-16">Enable JavaScript</p></noscript>` +
        `</body></html>`,
      id: "/out/index.html",
      registry: REGISTRY,
    });
    assert.ok(result !== null);
    assert.deepStrictEqual(result.warnings, []);
    assert.ok(
      result.code.includes(
        `<select class="${nameOf("flex")}"><option class="${nameOf("p-4")}">` +
          `<span class="${nameOf("items-center")}">One</span>`,
      ),
      result.code,
    );
    assert.ok(
      result.code.includes(`<noscript><p class="${nameOf("mb-16")}">`),
      result.code,
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

// runApply on test/fixtures/apply-site: src/ is the source the pre-pass
// scans, out/ the emitted pages. The stylesheet is compiled from
// src/app.css at test time so it tracks the installed Tailwind. Artifacts
// land in the fixture's .output/minwind (gitignored); each test clears it.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const APPLY_SITE = path.join(HERE, "fixtures", "apply-site");
// Curation order: the shortest word first, so the length-weighted deal
// (shortest word to the most-listed token) and the prominence deal (first
// word to the first class-bearing element) pick different tokens for it.
const VOCABULARY = [
  "fyi",
  "circlingback",
  "pinging",
  "touchbase",
  "perourlastemail",
  "justbumpingthis",
  "hopethisfindsyouwell",
];

let applySiteCss: string | undefined;

async function copyApplySiteOut(): Promise<string> {
  if (applySiteCss === undefined) {
    const compiled = await compileTailwindStylesheet({
      cssEntry: path.join(APPLY_SITE, "src", "app.css"),
      root: APPLY_SITE,
    });
    applySiteCss = compiled.stylesheet;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "minwind-apply-site-"));
  fs.cpSync(path.join(APPLY_SITE, "out"), dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "assets", "app.css"), applySiteCss);
  return dir;
}

function readTree(dir: string): Record<string, string> {
  const files: Record<string, string> = {};
  function walk(directory: string): void {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else files[path.relative(dir, full)] = fs.readFileSync(full, "utf8");
    }
  }
  walk(dir);
  return files;
}

function artifactsDir(): string {
  return path.join(APPLY_SITE, ".output", "minwind");
}

function readArtifacts(): { report: TransformReport; map: RenameMap } {
  return {
    report: JSON.parse(
      fs.readFileSync(path.join(artifactsDir(), "report.json"), "utf8"),
    ) as TransformReport,
    map: JSON.parse(
      fs.readFileSync(path.join(artifactsDir(), "map.json"), "utf8"),
    ) as RenameMap,
  };
}

function cleanArtifacts(): void {
  fs.rmSync(path.join(APPLY_SITE, ".output"), {
    recursive: true,
    force: true,
  });
}

function writeVocabulary(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "minwind-vocab-"));
  const file = path.join(dir, "words.json");
  fs.writeFileSync(file, JSON.stringify(VOCABULARY));
  return file;
}

describe("runApply (apply-site fixture)", function () {
  it("rewrites files and artifacts exactly as runApplyCli does", async function () {
    const viaCli = await copyApplySiteOut();
    const direct = await copyApplySiteOut();
    cleanArtifacts();
    try {
      assert.strictEqual(await runApplyCli([viaCli, "--root", APPLY_SITE]), 0);
      const cliArtifacts = readArtifacts();
      cleanArtifacts();
      const outcome = await runApply({ dir: direct, root: APPLY_SITE });
      assert.ok(outcome.enabled);
      assert.strictEqual(outcome.renamed, 6);
      assert.deepStrictEqual(readTree(direct), readTree(viaCli));
      assert.deepStrictEqual(readArtifacts(), cliArtifacts);
      const html = readTree(direct)["index.html"];
      assert.ok(
        html.includes(`<main class="${hashClassName("min-h-screen")}">`),
      );
      assert.ok(
        html.includes(
          `<ul class="${hashClassName("flex")} ${hashClassName("flex-col")}">`,
        ),
      );
    } finally {
      cleanArtifacts();
      fs.rmSync(viaCli, { recursive: true, force: true });
      fs.rmSync(direct, { recursive: true, force: true });
    }
  });

  it("keeps an excluded class's name and reports it excluded", async function () {
    const dir = await copyApplySiteOut();
    cleanArtifacts();
    try {
      await runApply({
        dir,
        root: APPLY_SITE,
        exclusions: { names: ["sr-only"], prefixes: [] },
      });
      const tree = readTree(dir);
      assert.ok(tree["index.html"].includes('<h1 class="sr-only">'));
      assert.ok(tree["assets/app.css"].includes(".sr-only"));
      const { report, map } = readArtifacts();
      assert.deepStrictEqual(report.exclusions, [
        { token: "sr-only", reason: "excluded-prefix" },
      ]);
      assert.ok(!Object.values(map.names).includes("sr-only"));
    } finally {
      cleanArtifacts();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rewrites nothing and writes no artifacts under MINWIND=off", async function () {
    const dir = await copyApplySiteOut();
    const before = readTree(dir);
    const previous = process.env.MINWIND;
    cleanArtifacts();
    process.env.MINWIND = "off";
    try {
      const outcome = await runApply({ dir, root: APPLY_SITE });
      assert.deepStrictEqual(readTree(dir), before);
      assert.ok(!fs.existsSync(artifactsDir()));
      assert.strictEqual(outcome.enabled, false);
    } finally {
      if (previous === undefined) delete process.env.MINWIND;
      else process.env.MINWIND = previous;
      cleanArtifacts();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("surfaces the modules-only compress-to-morph coercion", async function () {
    const dir = await copyApplySiteOut();
    try {
      const outcome = await runApply({
        dir,
        root: APPLY_SITE,
        engines: ["css-modules"],
        dryRun: true,
      });
      assert.ok(outcome.enabled);
      assert.ok(outcome.notices.includes(MODULES_COMPRESS_WARNING));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("runApply sourceDir (R13)", function () {
  it("scans sourceDir and compiles <sourceDir>/app.css by default", async function () {
    // No src/ directory: the sources and the CSS entry live under app/.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "minwind-source-dir-"));
    function write(relative: string, text: string): void {
      const file = path.join(root, relative);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, text);
    }
    try {
      write(
        path.join("app", "app.css"),
        "@layer utilities {\n  .flex { display: flex; }\n" +
          "  .gap-4 { gap: 1rem; }\n}\n",
      );
      write(
        path.join("app", "pages", "index.astro"),
        '<section class="flex gap-4">a</section>\n',
      );
      const compiled = await compileTailwindStylesheet({
        cssEntry: path.join(root, "app", "app.css"),
        root,
      });
      write(path.join("dist", "_astro", "index.css"), compiled.stylesheet);
      write(
        path.join("dist", "index.html"),
        '<!DOCTYPE html><html><head><link rel="stylesheet"' +
          ' href="/_astro/index.css"></head><body>' +
          '<section class="flex gap-4">a</section></body></html>',
      );
      const outcome = await runApply({
        dir: path.join(root, "dist"),
        root,
        sourceDir: path.join(root, "app"),
      });
      assert.ok(outcome.enabled);
      assert.strictEqual(outcome.renamed, 2);
      const html = fs.readFileSync(
        path.join(root, "dist", "index.html"),
        "utf8",
      );
      assert.ok(
        html.includes(
          `<section class="${hashClassName("flex")} ${hashClassName("gap-4")}">`,
        ),
        html,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

// Consolidation judges member removability from source class lists, but apply
// rewrites the built output, whose lists can differ: an Astro component that
// merges a class prop renders `<Card class="flex gap-4">` as
// `<div class="rounded-lg flex gap-4">`, a list the source scan never saw.
// The stylesheet is plain CSS in the utilities layer, so the pre-pass
// compiles it without resolving tailwindcss from the temp root.
const MERGE_CSS = `@layer utilities {
  .flex { display: flex; }
  .gap-4 { gap: 1rem; }
  .rounded-lg { border-radius: 0.5rem; }
}
`;

const MERGE_CARD = `---
const { class: className } = Astro.props;
---
<div class:list={["rounded-lg", className]}><slot /></div>
`;

const MERGE_PAGE = `---
import Card from "../components/Card.astro";
---
<Card class="flex gap-4">a</Card>
<section class="flex gap-4">b</section>
<section class="flex gap-4">c</section>
`;

const MERGE_HTML =
  '<!DOCTYPE html><html><head><link rel="stylesheet" href="/_astro/index.css">' +
  '</head><body><div class="rounded-lg flex gap-4">a</div>' +
  '<section class="flex gap-4">b</section>' +
  '<section class="flex gap-4">c</section></body></html>';

async function makeMergeSite(): Promise<string> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "minwind-merge-"));
  function write(relative: string, text: string): void {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  }
  write(path.join("src", "app.css"), MERGE_CSS);
  write(path.join("src", "components", "Card.astro"), MERGE_CARD);
  write(path.join("src", "pages", "index.astro"), MERGE_PAGE);
  const compiled = await compileTailwindStylesheet({
    cssEntry: path.join(root, "src", "app.css"),
    root,
  });
  write(path.join("dist", "_astro", "index.css"), compiled.stylesheet);
  write(path.join("dist", "index.html"), MERGE_HTML);
  return root;
}

function hasRule(css: string, name: string): boolean {
  return new RegExp(`\\.${name}\\s*\\{`).test(css);
}

describe("consolidation against built class lists", function () {
  it("keeps the member rules a merged class prop still uses (compress)", async function () {
    const root = await makeMergeSite();
    try {
      const outcome = await runApply({ dir: path.join(root, "dist"), root });
      assert.ok(outcome.enabled);
      const tree = readTree(path.join(root, "dist"));
      const html = tree["index.html"];
      const css = tree[path.join("_astro", "index.css")];
      // The repeated list still merges: both sections wear its shared rule.
      const merged = Object.keys(
        (
          JSON.parse(
            fs.readFileSync(
              path.join(root, ".output", "minwind", "map.json"),
              "utf8",
            ),
          ) as RenameMap
        ).consolidated,
      );
      assert.strictEqual(merged.length, 1);
      assert.strictEqual(outcome.result.consolidated, 1);
      assert.strictEqual(
        html.split(`<section class="${merged[0]}">`).length - 1,
        2,
        html,
      );
      assert.ok(hasRule(css, merged[0]), css);
      // Every class the built page wears, the merged card's included, has
      // a rule.
      for (const attribute of html.matchAll(/\sclass="([^"]*)"/g)) {
        for (const name of attribute[1].split(" ")) {
          assert.ok(hasRule(css, name), `no .${name} rule in:\n${css}`);
        }
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps only the member rules a bundle renames outside the merged list", function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "minwind-apply-"));
    try {
      fs.writeFileSync(
        path.join(dir, "index.html"),
        `<!doctype html><div class="flex p-4">a</div><div class="p-4 flex">b</div>`,
      );
      fs.writeFileSync(path.join(dir, "app.css"), LAYERED_CSS);
      fs.writeFileSync(
        path.join(dir, "app.js"),
        'jsx("div", { className: "flex mb-16" });\n',
      );
      const verdicts: Array<ConsolidationVerdict> = [
        {
          tokens: ["flex", "p-4"],
          frequency: 2,
          safe: true,
          name: "combo",
          removableTokens: ["flex", "p-4"],
        },
      ];
      const result = applyBuildOutput({
        dir,
        registry: REGISTRY,
        consolidationVerdicts: verdicts,
        consolidate: true,
      });
      assert.strictEqual(result.consolidated, 1);
      const css = fs.readFileSync(path.join(dir, "app.css"), "utf8");
      assert.ok(css.includes(".combo{display:flex;padding:1rem}"), css);
      assert.ok(css.includes(`.${nameOf("flex")}{display:flex}`), css);
      assert.ok(!css.includes(`.${nameOf("p-4")}{`), css);
      assert.ok(
        fs
          .readFileSync(path.join(dir, "app.js"), "utf8")
          .includes(`className: "${nameOf("flex")} ${nameOf("mb-16")}"`),
      );
      assert.deepStrictEqual(verdicts[0].removableTokens, ["flex", "p-4"]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// R7: minwind never rewrites HTML <style> contents, so a renamed class
// referenced there would silently stop matching. The fixture page gains a
// <style> block; page is relative to the copied out/ directory.
function addInlineStyle(dir: string, page: string, css: string): void {
  const html = fs.readFileSync(path.join(APPLY_SITE, "out", "index.html"));
  const file = path.join(dir, page);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    String(html).replace("</head>", `<style>${css}</style></head>`),
  );
}

describe("inline-style tripwire (R7)", function () {
  it("fails naming the class and the page when a <style> references a renamed class (AE3)", async function () {
    const dir = await copyApplySiteOut();
    cleanArtifacts();
    try {
      addInlineStyle(dir, "index.html", ".flex{gap:1rem}");
      await assert.rejects(
        runApply({ dir, root: APPLY_SITE }),
        function (error: Error) {
          assert.ok(
            error.message.includes(`${path.join(dir, "index.html")}: .flex`),
            error.message,
          );
          return true;
        },
      );
      assert.ok(!fs.existsSync(artifactsDir()));
    } finally {
      cleanArtifacts();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("passes when the referenced class kept its original name", async function () {
    const dir = await copyApplySiteOut();
    cleanArtifacts();
    try {
      addInlineStyle(dir, "index.html", ".flex{gap:1rem}");
      // A call argument the bundle pass cannot rewrite keeps flex original
      // everywhere (runtime context).
      fs.appendFileSync(
        path.join(dir, "assets", "app.js"),
        '\nr(document.body, "flex");\n',
      );
      const outcome = await runApply({ dir, root: APPLY_SITE });
      assert.ok(outcome.enabled);
      assert.deepStrictEqual(outcome.result.keptOriginal, ["flex"]);
      assert.ok(
        readTree(dir)["index.html"].includes("<style>.flex{gap:1rem}</style>"),
      );
    } finally {
      cleanArtifacts();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("passes a <style> with only non-renamed classes and element selectors", async function () {
    const dir = await copyApplySiteOut();
    cleanArtifacts();
    try {
      addInlineStyle(
        dir,
        "index.html",
        "body{margin:0}ul{display:flex}.card .title{color:red}",
      );
      const outcome = await runApply({ dir, root: APPLY_SITE });
      assert.ok(outcome.enabled);
      assert.ok(
        readTree(dir)["index.html"].includes(
          `<ul class="${hashClassName("flex")} ${hashClassName("flex-col")}">`,
        ),
      );
    } finally {
      cleanArtifacts();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails naming a renamed class referenced in a nested rule", async function () {
    const dir = await copyApplySiteOut();
    cleanArtifacts();
    try {
      addInlineStyle(dir, "index.html", ".card{.flex{gap:1rem}}");
      await assert.rejects(
        runApply({ dir, root: APPLY_SITE }),
        function (error: Error) {
          assert.ok(
            error.message.includes(`${path.join(dir, "index.html")}: .flex`),
            error.message,
          );
          assert.ok(!error.message.includes(".card"), error.message);
          return true;
        },
      );
      assert.ok(!fs.existsSync(artifactsDir()));
    } finally {
      cleanArtifacts();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("passes a nested rule with only non-renamed classes", async function () {
    const dir = await copyApplySiteOut();
    cleanArtifacts();
    try {
      addInlineStyle(dir, "index.html", ".card{.title{color:red}}");
      const outcome = await runApply({ dir, root: APPLY_SITE });
      assert.ok(outcome.enabled);
      assert.ok(
        readTree(dir)["index.html"].includes(
          "<style>.card{.title{color:red}}</style>",
        ),
      );
    } finally {
      cleanArtifacts();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("lists every offending page in one error from the CLI", async function () {
    const dir = await copyApplySiteOut();
    cleanArtifacts();
    try {
      addInlineStyle(dir, "index.html", ".flex{gap:1rem}");
      addInlineStyle(
        dir,
        path.join("about", "index.html"),
        "@media (min-width:40rem){.p-4{padding:2rem}}",
      );
      await assert.rejects(
        runApplyCli([dir, "--root", APPLY_SITE]),
        function (error: Error) {
          assert.ok(
            error.message.includes(`${path.join(dir, "index.html")}: .flex`),
            error.message,
          );
          assert.ok(
            error.message.includes(
              `${path.join(dir, "about", "index.html")}: .p-4`,
            ),
            error.message,
          );
          return true;
        },
      );
      assert.ok(!fs.existsSync(artifactsDir()));
    } finally {
      cleanArtifacts();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("inline-style tripwire selector forms (R11, KTD12)", function () {
  // Fails runApply on index.html carrying `css` in a <style> block, and
  // checks the error names each `page: reference` line.
  async function assertTripwireNames(
    css: string,
    references: ReadonlyArray<string>,
  ): Promise<void> {
    const dir = await copyApplySiteOut();
    cleanArtifacts();
    try {
      addInlineStyle(dir, "index.html", css);
      await assert.rejects(
        runApply({ dir, root: APPLY_SITE }),
        function (error: Error) {
          for (const reference of references) {
            assert.ok(
              error.message.includes(
                `${path.join(dir, "index.html")}: ${reference}`,
              ),
              error.message,
            );
          }
          return true;
        },
      );
      assert.ok(!fs.existsSync(artifactsDir()));
    } finally {
      cleanArtifacts();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  for (const selector of [
    '[class~="flex"]',
    '[class="flex"]',
    '[class*="fle"]',
    '[class^="fl"]',
  ]) {
    it(`fails naming flex and the page for ${selector}`, async function () {
      await assertTripwireNames(`${selector}{gap:1rem}`, [
        `.flex in ${selector}`,
      ]);
    });
  }

  it("fails naming a renamed class inside :nth-child(… of …)", async function () {
    await assertTripwireNames("li:nth-child(2n of .flex){color:red}", [
      ".flex",
    ]);
  });

  it("fails naming both renamed classes of an @scope prelude", async function () {
    await assertTripwireNames("@scope (.flex) to (.p-4){li{color:red}}", [
      ".flex",
      ".p-4",
    ]);
  });

  async function assertTripwirePasses(css: string): Promise<void> {
    const dir = await copyApplySiteOut();
    cleanArtifacts();
    try {
      addInlineStyle(dir, "index.html", css);
      const outcome = await runApply({ dir, root: APPLY_SITE });
      assert.ok(outcome.enabled);
      assert.ok(readTree(dir)["index.html"].includes(`<style>${css}</style>`));
    } finally {
      cleanArtifacts();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  it("passes attribute selectors that reference no renamed class", async function () {
    await assertTripwirePasses(
      "[data-state=open]{color:red}" +
        '[class~="keep-me"]{color:red}' +
        '[class*="zzz"]{color:red}',
    );
  });
});

describe("apply --prominence", function () {
  it("auto deals the first word to the first class-bearing element", async function () {
    const vocabulary = writeVocabulary();
    const unranked = await copyApplySiteOut();
    const ranked = await copyApplySiteOut();
    cleanArtifacts();
    try {
      const words = ["--naming", "words", "--vocabulary", vocabulary];
      // Without ranking, the shortest word goes to flex (four lists), not
      // to min-h-screen (one list) on the first class-bearing element.
      assert.strictEqual(
        await runApplyCli([unranked, "--root", APPLY_SITE, ...words]),
        0,
      );
      assert.strictEqual(readArtifacts().map.names["fyi"], "flex");
      cleanArtifacts();
      assert.strictEqual(
        await runApplyCli([
          ranked,
          "--root",
          APPLY_SITE,
          ...words,
          "--prominence",
          "auto",
        ]),
        0,
      );
      assert.strictEqual(readArtifacts().map.names["fyi"], "min-h-screen");
      assert.ok(readTree(ranked)["index.html"].includes('<main class="fyi">'));
    } finally {
      cleanArtifacts();
      fs.rmSync(path.dirname(vocabulary), { recursive: true, force: true });
      fs.rmSync(unranked, { recursive: true, force: true });
      fs.rmSync(ranked, { recursive: true, force: true });
    }
  });

  it("a manifest file from minwind prominence matches auto", async function () {
    const vocabulary = writeVocabulary();
    const auto = await copyApplySiteOut();
    const fromFile = await copyApplySiteOut();
    const manifestDir = fs.mkdtempSync(path.join(os.tmpdir(), "minwind-mf-"));
    const manifest = path.join(manifestDir, "minwind.prominence.json");
    cleanArtifacts();
    try {
      assert.strictEqual(runProminenceCli([fromFile, "--out", manifest]), 0);
      const words = ["--naming", "words", "--vocabulary", vocabulary];
      assert.strictEqual(
        await runApplyCli([
          auto,
          "--root",
          APPLY_SITE,
          ...words,
          "--prominence",
          "auto",
        ]),
        0,
      );
      const autoArtifacts = readArtifacts();
      cleanArtifacts();
      assert.strictEqual(
        await runApplyCli([
          fromFile,
          "--root",
          APPLY_SITE,
          ...words,
          "--prominence",
          manifest,
        ]),
        0,
      );
      assert.deepStrictEqual(readArtifacts(), autoArtifacts);
      assert.deepStrictEqual(readTree(fromFile), readTree(auto));
      assert.strictEqual(autoArtifacts.map.names["fyi"], "min-h-screen");
    } finally {
      cleanArtifacts();
      fs.rmSync(path.dirname(vocabulary), { recursive: true, force: true });
      fs.rmSync(manifestDir, { recursive: true, force: true });
      fs.rmSync(auto, { recursive: true, force: true });
      fs.rmSync(fromFile, { recursive: true, force: true });
    }
  });

  it("rejects --prominence with hash naming", function () {
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
        parseArgs(["/tmp/out", "--prominence", "auto", "--naming", "hash"]);
      }, /exit 1/);
      assert.ok(
        writes
          .join("")
          .includes("--prominence requires --naming words or quotes"),
      );
    } finally {
      process.exit = exit;
      process.stderr.write = write;
    }
  });

  it("warns, naming the window, when zero tokens rank", async function () {
    const dir = await copyApplySiteOut();
    try {
      const outcome = await runApply({
        dir,
        root: APPLY_SITE,
        naming: { strategy: "words", vocabulary: VOCABULARY },
        prominence: { window: 7, pages: 1, tokens: { "not-renamed": 0 } },
        dryRun: true,
      });
      assert.ok(outcome.enabled);
      assert.strictEqual(outcome.prominent, 0);
      assert.strictEqual(outcome.notices.length, 1);
      assert.match(outcome.notices[0], /first 7 class-bearing elements/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// KTD7: a class kept original takes the utilities that compound it with it.
// GTM Frontier's nav underlines the current page's label through
// group-aria-[current=page], and a data-* value that spells "group" leaks
// the marker. In 1.1.0 the variant still renamed while its only selector
// arm named the kept .group, so the arm was skipped and the build failed
// on presence.
const GROUP_VARIANT = "group-aria-[current=page]:text-lav";
const GROUP_RULE =
  ".group-aria-\\[current\\=page\\]\\:text-lav" +
  ":is(:where(.group)[aria-current=page] *){color:red}";
const GROUP_LEAK = '<div data-active-class="group"></div>';

function registryOf(tokens: Array<string>): NameRegistry {
  return createNameRegistry({
    universe: new Set(tokens),
    sourceTokens: new Set(tokens),
  });
}

function writeOutput(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "minwind-dependents-"));
  for (const [file, text] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, file), text);
  }
  return dir;
}

const execFileAsync = promisify(execFile);
const CLI = path.join(HERE, "..", "src", "cli.ts");
const TSX = path.join(HERE, "..", "node_modules", ".bin", "tsx");

describe("dependent variants keep their markers (R7, KTD7)", function () {
  it("keeps a leaked marker's variant original instead of failing on presence", function () {
    const html =
      '<!doctype html><a class="group" aria-current="page">' +
      `<span class="${GROUP_VARIANT}">Inbox</span></a>${GROUP_LEAK}`;
    const css = `@layer utilities{${GROUP_RULE}}`;
    const dir = writeOutput({ "index.html": html, "app.css": css });
    try {
      const result = applyBuildOutput({
        dir,
        registry: registryOf(["group", GROUP_VARIANT]),
        consolidationVerdicts: [],
        consolidate: false,
      });
      assert.deepStrictEqual(result.keptOriginal, ["group", GROUP_VARIANT]);
      assert.deepStrictEqual(result.keptDependent, [GROUP_VARIANT]);
      assert.strictEqual(
        fs.readFileSync(path.join(dir, "index.html"), "utf8"),
        html,
      );
      assert.strictEqual(
        fs.readFileSync(path.join(dir, "app.css"), "utf8"),
        css,
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("renames a token with an ordinary arm and skips its dependent arm with a warning", function () {
    const registry = registryOf(["group", "nav-link"]);
    const dir = writeOutput({
      "index.html":
        '<!doctype html><a class="group"><span class="nav-link">Inbox</span>' +
        `</a>${GROUP_LEAK}`,
      "app.css":
        "@layer utilities{.nav-link{color:gray}}" +
        ".group:hover .nav-link{color:black}",
    });
    try {
      const result = applyBuildOutput({
        dir,
        registry,
        consolidationVerdicts: [],
        consolidate: false,
      });
      const name = registry.nameFor("nav-link");
      assert.ok(name !== undefined);
      assert.deepStrictEqual(result.keptOriginal, ["group"]);
      assert.deepStrictEqual(result.keptDependent, []);
      assert.strictEqual(
        fs.readFileSync(path.join(dir, "app.css"), "utf8"),
        `@layer utilities{.${name}{color:gray}}` +
          ".group:hover .nav-link{color:black}",
      );
      const skipped = result.warnings.filter(function (warning) {
        return warning.kind === "mixed-compound-skipped";
      });
      assert.deepStrictEqual(
        skipped.map(function (warning) {
          return "selector" in warning ? warning.selector : "";
        }),
        [".group:hover .nav-link"],
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("still fails presence for a renamed token with no selector arm", function () {
    const dir = writeOutput({
      "index.html":
        '<!doctype html><a class="group" aria-current="page">' +
        `<span class="${GROUP_VARIANT} ghost">Inbox</span></a>${GROUP_LEAK}`,
      "app.css": `@layer utilities{${GROUP_RULE}}`,
    });
    try {
      assert.throws(
        function () {
          applyBuildOutput({
            dir,
            registry: registryOf(["group", GROUP_VARIANT, "ghost"]),
            consolidationVerdicts: [],
            consolidate: false,
          });
        },
        function (error: Error) {
          assert.match(error.message, /presence assertion failed/);
          assert.ok(error.message.includes('"ghost"'), error.message);
          assert.ok(!error.message.includes(GROUP_VARIANT), error.message);
          return true;
        },
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("stops merging a consolidation verdict that names a dependent token", function () {
    const registry = registryOf(["flex", "group", GROUP_VARIANT]);
    const flex = registry.nameFor("flex");
    assert.ok(flex !== undefined);
    const dir = writeOutput({
      "index.html":
        '<!doctype html><a class="group" aria-current="page">' +
        `<span class="flex ${GROUP_VARIANT}">a</span></a>` +
        `<p class="flex ${GROUP_VARIANT}">b</p>${GROUP_LEAK}`,
      "app.css": `@layer utilities{.flex{display:flex}${GROUP_RULE}}`,
    });
    try {
      const result = applyBuildOutput({
        dir,
        registry,
        consolidationVerdicts: [
          {
            tokens: ["flex", GROUP_VARIANT],
            frequency: 2,
            safe: true,
            name: "combo",
            removableTokens: ["flex", GROUP_VARIANT],
          },
        ],
        consolidate: true,
      });
      assert.strictEqual(result.consolidated, 0);
      const css = fs.readFileSync(path.join(dir, "app.css"), "utf8");
      assert.strictEqual(
        css,
        `@layer utilities{.${flex}{display:flex}${GROUP_RULE}}`,
      );
      const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
      assert.ok(html.includes(`<p class="${flex} ${GROUP_VARIANT}">`), html);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("prints dependents on their own line and reports them runtime-context", async function () {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "minwind-dep-site-"));
    try {
      function write(relative: string, text: string): void {
        const file = path.join(root, relative);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, text);
      }
      write(
        path.join("src", "app.css"),
        `@layer utilities {\n  .flex { display: flex; }\n  ${GROUP_RULE}\n}\n`,
      );
      write(
        path.join("src", "nav.tsx"),
        "export function Nav() {\n" +
          "  return (\n" +
          '    <nav class="flex">\n' +
          '      <a class="group" aria-current="page">\n' +
          `        <span class="${GROUP_VARIANT}">Inbox</span>\n` +
          "      </a>\n" +
          "    </nav>\n" +
          "  );\n" +
          "}\n",
      );
      const compiled = await compileTailwindStylesheet({
        cssEntry: path.join(root, "src", "app.css"),
        root,
      });
      write(path.join("dist", "app.css"), compiled.stylesheet);
      write(
        path.join("dist", "index.html"),
        '<!doctype html><nav class="flex"><a class="group"' +
          ` aria-current="page"><span class="${GROUP_VARIANT}">Inbox</span>` +
          `</a></nav>${GROUP_LEAK}`,
      );
      const { stdout } = await execFileAsync(TSX, [
        CLI,
        "apply",
        path.join(root, "dist"),
        "--root",
        root,
      ]);
      const lines = stdout.split("\n");
      assert.ok(
        lines.includes(
          "  kept original names for 1 token(s) in unrewritable positions:" +
            " group",
        ),
        stdout,
      );
      assert.ok(
        lines.includes(
          "  kept original names for 1 token(s) because each depends on a" +
            ` class kept original: ${GROUP_VARIANT}`,
        ),
        stdout,
      );
      const report = JSON.parse(
        fs.readFileSync(
          path.join(root, ".output", "minwind", "report.json"),
          "utf8",
        ),
      ) as TransformReport;
      assert.deepStrictEqual(report.exclusions, [
        { token: "group", reason: "runtime-context" },
        { token: GROUP_VARIANT, reason: "runtime-context" },
      ]);
      assert.deepStrictEqual(
        report.renames.map(function (entry) {
          return entry.token;
        }),
        ["flex"],
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

// R6 (KTD6): emitters write `&`, `>`, and quotes in a class attribute as
// character references, and the DOM decodes them, so the decoded token is the
// class. It renames when the registry holds it, written back escaped.
const ENCODED_TOKENS = [
  "[&_a]:underline",
  "has-[>img]:p-2",
  "content-['x']",
  "[&>li]:mt-2",
  "p-4",
  "flex",
  "items-center",
];

const ENCODED_CSS =
  "@layer utilities{" +
  ".\\[\\&_a\\]\\:underline a{text-decoration-line:underline}" +
  ".has-\\[\\>img\\]\\:p-2:has(>img){padding:.5rem}" +
  ".content-\\[\\'x\\'\\]{content:'x'}" +
  ".\\[\\&\\>li\\]\\:mt-2>li{margin-top:.5rem}" +
  ".p-4{padding:1rem}" +
  ".flex{display:flex}" +
  ".items-center{align-items:center}" +
  "}";

describe("entity-encoded classes in built output (R6, KTD6)", function () {
  const registry = registryOf(ENCODED_TOKENS);

  function encodedName(token: string): string {
    const name = registry.nameFor(token);
    assert.ok(name !== undefined, `${token} must be renamed`);
    return name;
  }

  function transformPage(
    code: string,
    consolidationVerdicts?: ReadonlyArray<ConsolidationVerdict>,
  ): TransformSourceResult {
    const result = transformModule({
      code,
      id: "/out/index.html",
      registry,
      consolidationVerdicts,
    });
    assert.ok(result !== null, code);
    return result;
  }

  function leakedTokens(result: TransformSourceResult): Array<string> {
    return result.warnings
      .filter(function (warning) {
        return warning.kind === "reverse-leak";
      })
      .map(function (warning) {
        return warning.token ?? "";
      })
      .sort();
  }

  function applyTo(files: Record<string, string>): {
    dir: string;
    result: ApplyResult;
  } {
    const dir = writeOutput(files);
    try {
      const result = applyBuildOutput({
        dir,
        registry,
        consolidationVerdicts: [],
        consolidate: false,
      });
      return { dir, result };
    } catch (error) {
      fs.rmSync(dir, { recursive: true, force: true });
      throw error;
    }
  }

  it("renames an encoded token and a plain one in one built attribute (AE6)", function () {
    const result = transformPage(
      '<div class="[&amp;_a]:underline p-4"><a href="/">x</a></div>',
    );
    assert.ok(
      result.code.includes(
        `<div class="${encodedName("[&_a]:underline")} ${encodedName("p-4")}">`,
      ),
      result.code,
    );
    assert.deepStrictEqual(leakedTokens(result), []);
  });

  it("renames tokens written with &gt;, &#39;, and Astro's class:list spelling", function () {
    for (const [written, token] of [
      ["has-[&gt;img]:p-2", "has-[>img]:p-2"],
      ["content-[&#39;x&#39;]", "content-['x']"],
      ["[&amp;&gt;li]:mt-2", "[&>li]:mt-2"],
      ["[&amp;>li]:mt-2", "[&>li]:mt-2"],
    ]) {
      const result = transformPage(`<ul class="${written}"><li>x</li></ul>`);
      assert.strictEqual(
        result.code,
        `<ul class="${encodedName(token)}"><li>x</li></ul>`,
        written,
      );
      assert.deepStrictEqual(leakedTokens(result), [], written);
    }
  });

  it('writes a dialect name holding & or " escaped, so the attribute decodes to it', function () {
    const tokens = ["[&_a]:underline", 'content-["x"]'];
    const dialect = createNameRegistry({
      universe: new Set(tokens),
      sourceTokens: new Set(tokens),
      hash: createDialectHasher("boston"),
    });
    const names = tokens.map(function (token) {
      const name = dialect.nameFor(token);
      assert.ok(name !== undefined, token);
      return name;
    });
    assert.ok(names[0].includes("&"), names[0]);
    assert.ok(names[1].includes('"'), names[1]);
    const result = transformModule({
      code: '<div class="[&amp;_a]:underline content-[&quot;x&quot;]">x</div>',
      id: "/out/index.html",
      registry: dialect,
    });
    assert.ok(result !== null);
    const div = parse5.parseFragment(result.code).childNodes[0];
    assert.ok("attrs" in div, result.code);
    assert.deepStrictEqual(div.attrs, [
      { name: "class", value: names.join(" ") },
    ]);
  });

  it("gives a value with encoded whitespace no edit and keeps its tokens original", function () {
    const html =
      '<!doctype html><div class="flex&#32;p-4 items-center">x</div>';
    const { dir, result } = applyTo({
      "index.html": html,
      "app.css": ENCODED_CSS,
    });
    try {
      assert.deepStrictEqual(result.keptOriginal, [
        "flex",
        "items-center",
        "p-4",
      ]);
      assert.strictEqual(
        fs.readFileSync(path.join(dir, "index.html"), "utf8"),
        html,
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps a token original when an encoded copy sits in a data-* value", function () {
    const html =
      '<!doctype html><div class="[&amp;_a]:underline"><a href="/">x</a></div>' +
      '<div data-x="[&amp;_a]:underline"></div>';
    const { dir, result } = applyTo({
      "index.html": html,
      "app.css": ENCODED_CSS,
    });
    try {
      assert.deepStrictEqual(result.keptOriginal, ["[&_a]:underline"]);
      assert.strictEqual(
        fs.readFileSync(path.join(dir, "index.html"), "utf8"),
        html,
      );
      assert.ok(
        fs
          .readFileSync(path.join(dir, "app.css"), "utf8")
          .includes(".\\[\\&_a\\]\\:underline a{"),
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("collapses a built list whose decoded key matches a safe verdict", function () {
    const result = transformPage(
      '<div class="[&amp;_a]:underline p-4"><a href="/">x</a></div>',
      [
        {
          tokens: ["p-4", "[&_a]:underline"],
          frequency: 2,
          safe: true,
          name: "combo",
        },
      ],
    );
    assert.strictEqual(
      result.code,
      '<div class="combo"><a href="/">x</a></div>',
    );
  });

  it("renames a bundle's encoded markup string and keeps a bare encoded string original", function () {
    const markup = transformBundle({
      code: `const tpl = '<div class="[&amp;_a]:underline">x</div>';\n`,
      id: "/out/assets/app.js",
      registry,
    });
    assert.ok(markup !== null);
    assert.strictEqual(
      markup.code,
      `const tpl = '<div class="${encodedName("[&_a]:underline")}">x</div>';\n`,
    );
    assert.deepStrictEqual(leakedTokens(markup), []);
    const bare = transformBundle({
      code: 'const raw = "[&amp;_a]:underline";\n',
      id: "/out/assets/app.js",
      registry,
    });
    assert.ok(bare !== null);
    assert.strictEqual(bare.code, 'const raw = "[&amp;_a]:underline";\n');
    assert.deepStrictEqual(leakedTokens(bare), ["[&_a]:underline"]);
  });

  it("still scans a bundle's raw text, where &copy; is literal", function () {
    const token = "content-['&copy;']";
    const result = transformBundle({
      code: `el.classList.add("${token}");\n`,
      id: "/out/assets/app.js",
      registry: registryOf([token]),
    });
    assert.ok(result !== null);
    assert.deepStrictEqual(leakedTokens(result), [token]);
  });
});

// R8 and R9: built HTML positions that never hold class names, and
// JavaScript comments and reserved words, no longer keep a class original.
// Every position a script can read a class list from still does.
describe("leak scan narrowing in built HTML and JS (R8, R9, KTD8, KTD9)", function () {
  const registry = registryOf([
    "grid",
    "group",
    "flex",
    "hidden",
    "block",
    "static",
    "dark",
    "opacity-0",
  ]);

  function leaks(result: TransformSourceResult | null): Array<string> {
    if (result === null) return [];
    return result.warnings
      .filter(function (warning) {
        return warning.kind === "reverse-leak";
      })
      .map(function (warning) {
        return warning.token ?? "";
      })
      .sort();
  }

  function pageLeaks(code: string): Array<string> {
    return leaks(transformModule({ code, id: "/out/index.html", registry }));
  }

  function bundleLeaks(code: string): Array<string> {
    return leaks(transformBundle({ code, id: "/out/assets/app.js", registry }));
  }

  it("ignores prose and a role value that spell utilities (AE8)", function () {
    assert.deepStrictEqual(
      pageLeaks(
        '<!doctype html><html><body><div class="grid">' +
          "<p>the grid layout</p>" +
          '<div role="group"><a class="group" href="/">x</a></div>' +
          "</div></body></html>",
      ),
      [],
    );
  });

  it("ignores the values of attributes that never hold class names", function () {
    for (const markup of [
      '<img alt="flex" src="/a.png">',
      '<input type="hidden">',
      '<span style="display:block">x</span>',
      '<meta name="x" content="grid">',
      '<a href="/" title="grid">x</a>',
      '<input placeholder="flex">',
      '<p lang="flex" dir="block">x</p>',
      '<link rel="block" href="/a.css">',
      '<input autocomplete="hidden">',
      '<img loading="block" decoding="flex" fetchpriority="grid" src="/a.png">',
      '<button aria-label="hidden" aria-describedby="flex">x</button>',
    ]) {
      assert.deepStrictEqual(
        pageLeaks(`<!doctype html><html><body>${markup}</body></html>`),
        [],
        markup,
      );
    }
  });

  it("ignores comments, <title>, valued <option>, and <noscript> text", function () {
    for (const markup of [
      "<!-- flex --><p>x</p>",
      '<select><option value="x">flex</option></select>',
      "<noscript>Turn on JavaScript for the grid view.</noscript>",
    ]) {
      assert.deepStrictEqual(
        pageLeaks(`<!doctype html><html><body>${markup}</body></html>`),
        [],
        markup,
      );
    }
    assert.deepStrictEqual(
      pageLeaks(
        "<!doctype html><html><head><title>grid</title></head>" +
          "<body><p>x</p></body></html>",
      ),
      [],
    );
  });

  it("decodes only what the mask leaves, so encoded prose stays ignored", function () {
    assert.deepStrictEqual(
      pageLeaks("<!doctype html><html><body><p>a gr&#105;d</p></body></html>"),
      [],
    );
    assert.deepStrictEqual(
      pageLeaks(
        '<!doctype html><html><body><p data-x="gr&#105;d">x</p></body></html>',
      ),
      ["grid"],
    );
  });

  it("still scans a text node that spans an adopted <body> start tag", function () {
    // The <img> ends <head> and implies <body>, so the real <body> start tag
    // only adds its attributes, and parse5 merges the whitespace around it
    // into one text node whose span covers that tag.
    assert.deepStrictEqual(
      pageLeaks(
        '<!doctype html><html><head><noscript><img src="x"></noscript>\n' +
          '</head>\n<body data-active-class="hidden">\n' +
          '<p class="hidden">x</p></body></html>',
      ),
      ["hidden"],
    );
  });

  it("ignores JSON-LD and still scans other script data", function () {
    assert.deepStrictEqual(
      pageLeaks(
        '<!doctype html><html><head><script type="application/ld+json">' +
          '{"description":"a grid"}</script></head><body></body></html>',
      ),
      [],
    );
    assert.deepStrictEqual(
      pageLeaks(
        '<!doctype html><html><head><script type="application/json">' +
          '{"c":"flex"}</script></head><body></body></html>',
      ),
      ["flex"],
    );
  });

  it("still scans data-*, handlers, value, id, name, island props, and unknown attributes (AE8)", function () {
    for (const [markup, token] of [
      ['<div data-active-class="hidden"></div>', "hidden"],
      [`<button onclick="el.classList.add('hidden')">x</button>`, "hidden"],
      ['<option value="dark">Dark</option>', "dark"],
      ['<div id="block"></div>', "block"],
      ['<input name="block">', "block"],
      [`<astro-island props='{"class":[0,"flex"]}'></astro-island>`, "flex"],
      ['<div x-transition:enter="opacity-0"></div>', "opacity-0"],
      ['<div content="hidden"></div>', "hidden"],
    ]) {
      assert.deepStrictEqual(
        pageLeaks(`<!doctype html><html><body>${markup}</body></html>`),
        [token],
        markup,
      );
    }
  });

  it("ignores comments and reserved words in executable inline scripts", function () {
    for (const script of [
      "<script>// block\n</script>",
      '<script type="module">/* flex */ init();</script>',
      "<script>class A { static x = 1; }</script>",
      "<script>// gr&#105;d\n</script>",
    ]) {
      assert.deepStrictEqual(
        pageLeaks(`<!doctype html><html><body>${script}</body></html>`),
        [],
        script,
      );
    }
    assert.deepStrictEqual(
      pageLeaks(
        '<!doctype html><html><body><script>el.classList.add("block")' +
          "</script></body></html>",
      ),
      ["block"],
    );
  });

  it("ignores comments and reserved words in a bundle", function () {
    for (const code of [
      "/*! flex */\nexport const a = 1;\n",
      "const a = 1; // grid\n",
      "class X { static y }\n",
      "// gr&#105;d\nconst a = 1;\n",
    ]) {
      assert.deepStrictEqual(bundleLeaks(code), [], code);
    }
  });

  it("still counts strings in comparisons, case labels, and style assignments", function () {
    for (const [code, token] of [
      ['if (el.className === "hidden") go();\n', "hidden"],
      ['switch (c) { case "flex": go(); }\n', "flex"],
      ['el.style.display = "block";\n', "block"],
    ]) {
      assert.deepStrictEqual(bundleLeaks(code), [token], code);
    }
  });
});

// R16 (KTD15) on the apply route: an identifier object key in a bundle, an
// inline script, or a built HTML attribute value that parses as JavaScript
// names a class the post-build passes cannot rename, so its token keeps its
// original name everywhere. The whole-word scan misses these keys because
// `:` is a class-name character.
describe("object keys in built output (R16, KTD15)", function () {
  const registry = registryOf(["hidden", "block", "flex", "p-4"]);
  const CSS =
    "@layer utilities{.hidden{display:none}.block{display:block}" +
    ".flex{display:flex}.p-4{padding:1rem}}";

  function leaks(result: TransformSourceResult | null): Array<string> {
    if (result === null) return [];
    return result.warnings
      .filter(function (warning) {
        return warning.kind === "reverse-leak";
      })
      .map(function (warning) {
        return warning.token ?? "";
      })
      .sort();
  }

  function bundleLeaks(code: string): Array<string> {
    return leaks(transformBundle({ code, id: "/out/assets/app.js", registry }));
  }

  function pageLeaks(code: string): Array<string> {
    return leaks(transformModule({ code, id: "/out/index.html", registry }));
  }

  it("counts identifier, shorthand, and method keys in a bundle (AE11)", function () {
    for (const code of [
      "e({hidden:t});\n",
      "const o={hidden};\n",
      "const o={hidden(){return 1}};\n",
      "const o={get hidden(){return 1}};\n",
      'const o={"hidden":t};\n',
    ]) {
      assert.deepStrictEqual(bundleLeaks(code), ["hidden"], code);
    }
  });

  it("never counts member access, binding patterns, class members, or destructuring assignments", function () {
    for (const code of [
      "a.hidden=1;\n",
      "const {hidden:a}=b;\n",
      "function f({hidden:a}){return a}\n",
      "({hidden:a}=b);\n",
      "for(const {hidden:a} of b);\n",
      "[{hidden:a}]=b;\n",
    ]) {
      assert.deepStrictEqual(bundleLeaks(code), [], code);
    }
  });

  it("keeps a bundle key's class original everywhere (AE11)", function () {
    const dir = writeOutput({
      "index.html": '<!doctype html><div class="hidden p-4">x</div>',
      "app.css": CSS,
      "app.js": "e({hidden:t});\n",
    });
    try {
      const result = applyBuildOutput({
        dir,
        registry,
        consolidationVerdicts: [],
        consolidate: false,
      });
      assert.deepStrictEqual(result.keptOriginal, ["hidden"]);
      const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
      assert.ok(
        html.includes(`class="hidden ${registry.nameFor("p-4")}"`),
        html,
      );
      const css = fs.readFileSync(path.join(dir, "app.css"), "utf8");
      assert.ok(css.includes(".hidden{display:none}"), css);
      assert.strictEqual(
        fs.readFileSync(path.join(dir, "app.js"), "utf8"),
        "e({hidden:t});\n",
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("counts keys in an executable inline script", function () {
    assert.deepStrictEqual(
      pageLeaks(
        '<!doctype html><html><body><p class="block">x</p>' +
          "<script>init({block:!0})</script></body></html>",
      ),
      ["block"],
    );
    assert.deepStrictEqual(
      pageLeaks(
        "<!doctype html><html><body>" +
          '<script type="text/x-template">{block:!0}</script>' +
          "</body></html>",
      ),
      [],
    );
  });

  it("counts keys in Alpine and Vue-in-DOM attribute values (AE11)", function () {
    for (const [markup, token] of [
      ['<div :class="{ hidden: !open }" class="hidden"></div>', "hidden"],
      ['<div x-bind:class="{ block: on }" class="block"></div>', "block"],
      ['<div x-data="{ flex: true }" class="flex"></div>', "flex"],
      ['<div x-data="{ flex: a &amp;&amp; b }" class="flex"></div>', "flex"],
    ]) {
      assert.deepStrictEqual(
        pageLeaks(`<!doctype html><html><body>${markup}</body></html>`),
        [token],
        markup,
      );
    }
  });

  it("ignores attribute values that never hold class names or do not parse", function () {
    for (const markup of [
      '<a title="{ flex: true }" href="/">x</a>',
      '<div data-x="{ flex: true" class="p-4"></div>',
      '<div x-init="a = 1; b({ flex: 1 })"></div>',
    ]) {
      assert.deepStrictEqual(
        pageLeaks(`<!doctype html><html><body>${markup}</body></html>`),
        [],
        markup,
      );
    }
  });

  it("keeps Alpine-bound classes original through applyBuildOutput", function () {
    const dir = writeOutput({
      "index.html":
        "<!doctype html><html><body>" +
        '<div :class="{ hidden: !open }" class="hidden"></div>' +
        '<div x-bind:class="{ block: on }" class="block"></div>' +
        '<div x-data="{ flex: true }" class="flex p-4"></div>' +
        "</body></html>",
      "app.css": CSS,
    });
    try {
      const result = applyBuildOutput({
        dir,
        registry,
        consolidationVerdicts: [],
        consolidate: false,
      });
      assert.deepStrictEqual(result.keptOriginal, ["block", "flex", "hidden"]);
      const css = fs.readFileSync(path.join(dir, "app.css"), "utf8");
      for (const token of ["hidden", "block", "flex"]) {
        assert.ok(css.includes(`.${token}{`), token);
      }
      assert.ok(css.includes(`.${registry.nameFor("p-4")}{`), css);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("leaves a source key the build never ships to the output scan (runApply)", async function () {
    // The pre-pass behind runApply counts no key outside a composition: the
    // output scan counts the keys that ship, and a frontmatter object never
    // reaches the built page.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "minwind-keys-"));
    function write(relative: string, text: string): void {
      const file = path.join(root, relative);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, text);
    }
    try {
      write(
        path.join("src", "app.css"),
        "@layer utilities {\n  .flex { display: flex; }\n}\n",
      );
      write(
        path.join("src", "pages", "index.astro"),
        '---\nconst layout = { flex: true };\n---\n<section class="flex">a</section>\n',
      );
      const compiled = await compileTailwindStylesheet({
        cssEntry: path.join(root, "src", "app.css"),
        root,
      });
      write(path.join("dist", "_astro", "index.css"), compiled.stylesheet);
      write(
        path.join("dist", "index.html"),
        '<!DOCTYPE html><html><head><link rel="stylesheet"' +
          ' href="/_astro/index.css"></head><body>' +
          '<section class="flex">a</section></body></html>',
      );
      const outcome = await runApply({ dir: path.join(root, "dist"), root });
      assert.ok(outcome.enabled);
      assert.deepStrictEqual(outcome.result.keptOriginal, []);
      const html = fs.readFileSync(
        path.join(root, "dist", "index.html"),
        "utf8",
      );
      assert.ok(
        html.includes(`<section class="${hashClassName("flex")}">`),
        html,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps a Module export map's Tailwind-named key original without the Modules engine", function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "minwind-dual-out-"));
    try {
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
      const result = applyBuildOutput({
        dir,
        registry: REGISTRY,
        consolidationVerdicts: [],
        consolidate: false,
      });
      assert.deepStrictEqual(result.keptOriginal, ["flex"]);
      const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
      assert.ok(html.includes(`class="flex ${bundler}"`), html);
      const app = fs.readFileSync(path.join(dir, "app.css"), "utf8");
      assert.ok(app.includes(".flex{display:flex}"), app);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// R17 (KTD16) on the apply route: a class selector inside a string of a
// bundle or an executable inline script looks its class up by the original
// name, so the class keeps that name everywhere. The whole-word scan misses
// these because `.` is a class-name character.
describe("selector strings in built output (R17, KTD16)", function () {
  const registry = registryOf([
    "hidden",
    "block",
    "flex",
    "group",
    "grid",
    "md:flex",
    "p-4",
  ]);
  const CSS =
    "@layer utilities{.hidden{display:none}.block{display:block}" +
    ".flex{display:flex}.grid{display:grid}.group{color:red}" +
    ".p-4{padding:1rem}@media (width>=48rem){.md\\:flex{display:flex}}}";

  function leaks(result: TransformSourceResult | null): Array<string> {
    if (result === null) return [];
    return result.warnings
      .filter(function (warning) {
        return warning.kind === "reverse-leak";
      })
      .map(function (warning) {
        return warning.token ?? "";
      })
      .sort();
  }

  function bundleLeaks(code: string): Array<string> {
    return leaks(transformBundle({ code, id: "/out/assets/app.js", registry }));
  }

  function pageLeaks(code: string): Array<string> {
    return leaks(transformModule({ code, id: "/out/index.html", registry }));
  }

  it("counts a class selector in a bundle string (AE12)", function () {
    for (const [code, tokens] of [
      ['document.querySelector(".hidden");\n', ["hidden"]],
      ['document.querySelectorAll("ul > .flex");\n', ["flex"]],
      ['e.closest(".group");\n', ["group"]],
      ['e.matches(".hidden, .block");\n', ["block", "hidden"]],
      ["document.querySelector(`.${a} .flex`);\n", ["flex"]],
      ['e.querySelector(":not(.hidden)");\n', ["hidden"]],
      [
        "e.querySelector('div.hidden > .flex:first-child');\n",
        ["flex", "hidden"],
      ],
      ['e.querySelector(".hidden.block[data-x]");\n', ["block", "hidden"]],
    ] as const) {
      assert.deepStrictEqual(bundleLeaks(code), tokens, code);
    }
  });

  it("decodes the string's JavaScript and CSS escapes", function () {
    for (const [code, tokens] of [
      ['e.querySelector(".md\\\\:flex");\n', ["md:flex"]],
      ['e.querySelector("\\x2ehidden");\n', ["hidden"]],
      ['e.querySelector(".\\\\68 idden");\n', ["hidden"]],
      ['e.querySelector(".grid\\\\:x");\n', []],
      ['e.querySelector("a\\\\.hidden");\n', []],
    ] as const) {
      assert.deepStrictEqual(bundleLeaks(code), tokens, code);
    }
  });

  it("reports the selector's position in the bundle", function () {
    const code = 'x();\ne.querySelector("ul > .md\\\\:flex");\n';
    const result = transformBundle({
      code,
      id: "/out/assets/app.js",
      registry,
    });
    assert.ok(result !== null);
    assert.deepStrictEqual(
      result.warnings.map(function (warning) {
        return [warning.token, warning.line, warning.column];
      }),
      [["md:flex", 2, code.indexOf("md\\\\:flex") - code.indexOf("\n")]],
    );
  });

  it("never counts property access, comments, or a regular expression (AE12)", function () {
    for (const code of [
      "el.hidden=!0;\n",
      "a.flex();\n",
      "// .grid\nx();\n",
      "/* .grid */x();\n",
      "const r=/\\.hidden/;\n",
      'x("1.5rem");\n',
    ]) {
      assert.deepStrictEqual(bundleLeaks(code), [], code);
    }
  });

  it("counts a class selector in an executable inline script", function () {
    assert.deepStrictEqual(
      pageLeaks(
        '<!doctype html><html><body><p class="block">x</p>' +
          '<script>document.querySelector(".block")</script></body></html>',
      ),
      ["block"],
    );
    assert.deepStrictEqual(
      pageLeaks(
        "<!doctype html><html><body>" +
          '<script type="application/ld+json">{"a":".block"}</script>' +
          "</body></html>",
      ),
      [],
    );
  });

  it("keeps a selected class original everywhere, and still renames a class only property access names (AE12)", function () {
    const dir = writeOutput({
      "index.html":
        "<!doctype html><html><body>" +
        '<div class="hidden p-4">x</div><p class="block grid">y</p>' +
        '<script>document.querySelector(".block").dataset.on=1</script>' +
        "</body></html>",
      "app.css": CSS,
      "app.js": 'const e=document.querySelector(".hidden");e.grid=!0;\n',
    });
    try {
      const result = applyBuildOutput({
        dir,
        registry,
        consolidationVerdicts: [],
        consolidate: false,
      });
      assert.deepStrictEqual(result.keptOriginal, ["block", "hidden"]);
      const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
      assert.ok(
        html.includes(`class="hidden ${registry.nameFor("p-4")}"`),
        html,
      );
      assert.ok(
        html.includes(`class="block ${registry.nameFor("grid")}"`),
        html,
      );
      assert.ok(html.includes('querySelector(".block")'), html);
      const css = fs.readFileSync(path.join(dir, "app.css"), "utf8");
      assert.ok(css.includes(".hidden{display:none}"), css);
      assert.ok(css.includes(".block{display:block}"), css);
      assert.ok(css.includes(`.${registry.nameFor("grid")}{`), css);
      assert.strictEqual(
        fs.readFileSync(path.join(dir, "app.js"), "utf8"),
        'const e=document.querySelector(".hidden");e.grid=!0;\n',
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("trusted vendor occurrences (R10, KTD10)", function () {
  const registry = registryOf(["block", "absolute", "relative", "hidden"]);
  const CSS =
    "@layer utilities{.block{display:block}.absolute{position:absolute}" +
    ".relative{position:relative}.hidden{display:none}}";
  const PAGE =
    '<!doctype html><div class="relative">' +
    '<span class="absolute block hidden">x</span></div>';
  const MOTION =
    "/site/node_modules/.pnpm/fake-motion@1.0.0/node_modules/fake-motion/index.js";
  const PROJECT = "/site/src/scripts/motion.ts";
  const SHOW = 'function s(e){e.style.display="block"}';

  interface Part {
    source: string;
    code: string;
    // Rewrites the part the way a minifier does: [original, replacement].
    edit?: [string, string];
  }

  interface Chunk {
    code: string;
    map: SourceMapLike | null;
    // The bytes on disk, when a later hook changed them after recording.
    written?: string;
  }

  // Module code concatenated as a bundler does, with a map at word
  // boundaries, the resolution Rolldown's minified chunks have. Appended
  // and prepended text has no mapping, as text a render hook adds.
  function chunkOf(
    parts: Array<Part>,
    added: { prepend?: string; append?: string } = {},
  ): Chunk {
    const bundle = new Bundle({ separator: "" });
    for (const part of parts) {
      const content = new MagicString(part.code);
      if (part.edit !== undefined) {
        const at = part.code.indexOf(part.edit[0]);
        assert.ok(at !== -1, part.edit[0]);
        content.overwrite(at, at + part.edit[0].length, part.edit[1]);
      }
      bundle.addSource({ filename: part.source, content });
    }
    if (added.prepend !== undefined) bundle.prepend(added.prepend);
    if (added.append !== undefined) bundle.append(added.append);
    const map = bundle.generateMap({ hires: "boundary", includeContent: true });
    return {
      code: bundle.toString(),
      map: {
        sources: map.sources,
        sourcesContent: map.sourcesContent,
        mappings: map.mappings,
      },
    };
  }

  function vendorChunk(source: string, code: string = SHOW): Chunk {
    return chunkOf([{ source, code }]);
  }

  // Applies the output with each chunk recorded, unless trust is undefined.
  function applyChunks(
    chunks: Record<string, Chunk>,
    trust: VendorTrust | undefined,
    extra: Record<string, string> = {},
  ): { result: ApplyResult; files: Record<string, string> } {
    const files: Record<string, string> = {
      "index.html": PAGE,
      "app.css": CSS,
      ...extra,
    };
    for (const [name, chunk] of Object.entries(chunks)) {
      files[name] = chunk.written ?? chunk.code;
    }
    const dir = writeOutput(files);
    try {
      const result = applyBuildOutput({
        dir,
        registry,
        consolidationVerdicts: [],
        consolidate: false,
        vendorProvenance:
          trust === undefined
            ? undefined
            : {
                trust,
                chunks: Object.entries(chunks).map(function ([name, chunk]) {
                  return {
                    file: path.join(dir, name),
                    code: chunk.code,
                    map: chunk.map,
                  };
                }),
              },
      });
      return { result, files: readTree(dir) };
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  function renamed(token: string): string {
    const name = registry.nameFor(token);
    assert.ok(name !== undefined, token);
    return name;
  }

  it("renames block when its one JS occurrence maps to a trusted vendor (AE9)", function () {
    // Rolldown's minifier requotes string literals with backticks.
    const chunk = chunkOf([
      { source: MOTION, code: SHOW, edit: ['"block"', "`block`"] },
      { source: PROJECT, code: "s(document.body);" },
    ]);
    const trusted = applyChunks({ "motion.js": chunk }, true);
    assert.deepStrictEqual(trusted.result.keptOriginal, []);
    const page = trusted.files["index.html"];
    assert.ok(page.includes(renamed("block")), page);
    const css = trusted.files["app.css"];
    assert.ok(css.includes(`.${renamed("block")}{display:block}`), css);
    // The inline style value keeps its bytes.
    assert.strictEqual(trusted.files["motion.js"], chunk.code);
    const untrusted = applyChunks({ "motion.js": chunk }, undefined);
    assert.deepStrictEqual(untrusted.result.keptOriginal, ["block"]);
    assert.ok(untrusted.files["app.css"].includes(".block{display:block}"));
  });

  it("keeps relative original when a project module in the chunk mentions it (AE9)", function () {
    const chunk = chunkOf([
      { source: MOTION, code: SHOW },
      {
        source: PROJECT,
        code: 'if(getComputedStyle(t).position==="relative")s(t);',
      },
    ]);
    assert.deepStrictEqual(
      applyChunks({ "motion.js": chunk }, true).result.keptOriginal,
      ["relative"],
    );
  });

  it("counts an occurrence the attribution does not cover", function () {
    const folded = chunkOf([
      { source: MOTION, code: SHOW },
      {
        source: PROJECT,
        code: 't.classList.add("hid"+"den");',
        edit: ['"hid"+"den"', '"hidden"'],
      },
    ]);
    // Render-hook text after vendor code on the same line has no mapping
    // of its own, so the last vendor segment would otherwise cover it.
    const appended = chunkOf([{ source: MOTION, code: SHOW }], {
      append: ';document.body.classList.add("hidden");',
    });
    const banner = chunkOf([{ source: MOTION, code: SHOW }], {
      prepend: 'const c="hidden";\n',
    });
    for (const chunk of [folded, appended, banner]) {
      assert.deepStrictEqual(
        applyChunks({ "motion.js": chunk }, true).result.keptOriginal,
        ["hidden"],
        chunk.code,
      );
    }
  });

  it("scans a chunk without usable attribution whole", function () {
    const chunk = vendorChunk(MOTION);
    const map = chunk.map;
    assert.ok(map !== null);
    for (const unusable of [
      { ...chunk, map: null },
      { ...chunk, map: { ...map, sourcesContent: undefined } },
      { ...chunk, written: `${chunk.code}\n` },
      { ...chunk, map: { ...map, mappings: "" } },
      { ...chunk, map: { ...map, mappings: "!!!" } },
      // Line breaks a parser and a map generator can count differently,
      // in the chunk or in a source.
      chunkOf([{ source: MOTION, code: SHOW }], { append: "/* */" }),
      { ...chunk, map: { ...map, sourcesContent: [`${SHOW}\r`] } },
    ]) {
      assert.deepStrictEqual(
        applyChunks({ "motion.js": unusable }, true).result.keptOriginal,
        ["block"],
        JSON.stringify(unusable),
      );
    }
  });

  it("adds no leaks for a vendor-only chunk and renames its class markup", function () {
    const chunk = vendorChunk(
      MOTION,
      `e.innerHTML='<i class="block"></i>';${SHOW}`,
    );
    const { result, files } = applyChunks({ "motion.js": chunk }, true);
    assert.deepStrictEqual(result.keptOriginal, []);
    assert.strictEqual(
      files["motion.js"],
      `e.innerHTML='<i class="${renamed("block")}"></i>';${SHOW}`,
    );
  });

  it("scans an unrecorded JS file and an inline script as today", function () {
    const recorded = { "motion.js": vendorChunk(MOTION) };
    assert.deepStrictEqual(
      applyChunks(recorded, true, { "copied.js": SHOW }).result.keptOriginal,
      ["block"],
    );
    assert.deepStrictEqual(
      applyChunks(recorded, true, {
        "index.html": `${PAGE}<script>${SHOW}</script>`,
      }).result.keptOriginal,
      ["block"],
    );
  });

  it("classifies sources by path", function () {
    for (const [source, vendor] of [
      [MOTION, true],
      ["\0vite/preload-helper.js", false],
      ["\0/site/node_modules/fake-motion/index.js", true],
      ["/site/node_modules/fake-motion/index.js?v=1a2b", true],
      ["C:\\site\\node_modules\\fake-motion\\index.js", true],
      ["../../node_modules/fake-motion/index.js", true],
      ["node_modules/fake-motion/index.js", true],
      [PROJECT, false],
      ["/site/src/node_modules.js", false],
      ["/site/src/vendor.js?node_modules/x", false],
    ] as const) {
      assert.deepStrictEqual(
        applyChunks({ "motion.js": vendorChunk(source) }, true).result
          .keptOriginal,
        vendor ? [] : ["block"],
        JSON.stringify(source),
      );
    }
  });

  it("trusts only the listed packages, scoped names by two segments", function () {
    const trust = ["fake-motion", "@scope/tween"];
    for (const [source, trusted] of [
      ["/site/node_modules/fake-motion/index.js", true],
      ["/site/node_modules/other-lib/index.js", false],
      ["/site/node_modules/fake-motion-extra/index.js", false],
      ["/site/node_modules/other-lib/node_modules/fake-motion/a.js", true],
      ["/site/node_modules/fake-motion/node_modules/other-lib/a.js", false],
      ["/site/node_modules/@scope/tween/dist/index.js", true],
      ["/site/node_modules/@scope/other/index.js", false],
      ["/site/node_modules/@scope/index.js", false],
    ] as const) {
      assert.deepStrictEqual(
        applyChunks({ "motion.js": vendorChunk(source) }, trust).result
          .keptOriginal,
        trusted ? [] : ["block"],
        source,
      );
    }
  });

  it("exempts a trusted vendor's identifier key and counts a project key (KTD15)", function () {
    const vendorKey = { source: MOTION, code: "const o={hidden:!0};" };
    assert.deepStrictEqual(
      applyChunks({ "motion.js": chunkOf([vendorKey]) }, true).result
        .keptOriginal,
      [],
    );
    assert.deepStrictEqual(
      applyChunks(
        {
          "motion.js": chunkOf([
            vendorKey,
            { source: PROJECT, code: "f({hidden:!0});" },
          ]),
        },
        true,
      ).result.keptOriginal,
      ["hidden"],
    );
  });

  it("reports no reverse-leak warnings at vendor occurrences", function () {
    const { result } = applyChunks({ "motion.js": vendorChunk(MOTION) }, true);
    assert.deepStrictEqual(result.keptOriginal, []);
    assert.deepStrictEqual(
      result.warnings.filter(function (warning) {
        return warning.kind === "reverse-leak";
      }),
      [],
    );
  });

  it("lists the renamed classes that trusted vendor code mentions", function () {
    const chunk = chunkOf([
      {
        source: MOTION,
        code: 'e.style.display="block";e.style.position="absolute";e.dataset.p="relative";',
      },
      { source: PROJECT, code: 'if(p==="relative")g();' },
    ]);
    const { result } = applyChunks({ "motion.js": chunk }, true);
    assert.deepStrictEqual(result.keptOriginal, ["relative"]);
    assert.deepStrictEqual(result.vendorMentions, ["absolute", "block"]);
    const quiet = chunkOf([{ source: MOTION, code: "e.style.opacity=1;" }]);
    assert.deepStrictEqual(
      applyChunks({ "motion.js": quiet }, true).result.vendorMentions,
      [],
    );
  });
});

// KTD15 with both engines: the object-key leak scan skips only an object the
// Modules remap claims in full, every value a name the module emitted. Any
// other object whose keys happen to be one module's locals is a runtime class
// list as far as the scan can tell, so its keys keep their classes original.
describe("Module export maps the remap does not claim (KTD15)", function () {
  const registry = registryOf(["hidden", "p-4"]);
  const HIDDEN = "Panel-module__abc__hidden";
  const PANEL = "Panel-module__abc__panel";

  function applyBoth(js: string): { result: ApplyResult; dir: string } {
    const site = fs.mkdtempSync(path.join(os.tmpdir(), "minwind-dual-root-"));
    try {
      fs.mkdirSync(path.join(site, "src"));
      fs.writeFileSync(
        path.join(site, "src", "Panel.module.css"),
        ".hidden { opacity: 0 }\n.panel { color: red }",
      );
      const inventory = collectModuleInventory(site);
      const dir = writeOutput({
        "index.html": `<!doctype html><div class="hidden p-4 ${PANEL}">x</div>`,
        "app.css": "@layer utilities{.hidden{display:none}.p-4{padding:1rem}}",
        "panel.css": `.${HIDDEN}{opacity:0}.${PANEL}{color:red}`,
        "app.js": js,
      });
      const result = applyBuildOutput({
        dir,
        registry,
        consolidationVerdicts: [],
        consolidate: false,
        modules: {
          root: site,
          inventory,
          registry: createModuleNameRegistry(inventory),
        },
      });
      return { result, dir };
    } finally {
      fs.rmSync(site, { recursive: true, force: true });
    }
  }

  it("keeps a key original when the remap claims none or only some of the object's values", function () {
    for (const states of [
      '{hidden:""}',
      '{hidden:" "}',
      '{hidden:"0"}',
      `{hidden:"",panel:"${PANEL}"}`,
    ]) {
      const js = `const states=${states};target.classList.add(...Object.keys(states));\n`;
      const { result, dir } = applyBoth(js);
      try {
        assert.deepStrictEqual(result.keptOriginal, ["hidden"], states);
        const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
        assert.ok(
          html.includes(`class="hidden ${registry.nameFor("p-4")} `),
          html,
        );
        const css = fs.readFileSync(path.join(dir, "app.css"), "utf8");
        assert.ok(css.includes(".hidden{display:none}"), css);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it("still skips a map whose every value the remap claims", function () {
    const { result, dir } = applyBoth(
      `const styles={hidden:"${HIDDEN}",panel:"${PANEL}"};\n`,
    );
    try {
      assert.deepStrictEqual(result.keptOriginal, []);
      const css = fs.readFileSync(path.join(dir, "app.css"), "utf8");
      assert.ok(
        css.includes(`.${registry.nameFor("hidden")}{display:none}`),
        css,
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("inline-style tripwire spellings CSS matches case-insensitively (R11, KTD12)", function () {
  // Runs apply on index.html carrying `css` in a <style> block. Returns the
  // error's `page: reference` lines, or null when apply passed and left the
  // block untouched.
  async function tripwireLines(css: string): Promise<Array<string> | null> {
    const dir = await copyApplySiteOut();
    cleanArtifacts();
    try {
      addInlineStyle(dir, "index.html", css);
      try {
        await runApply({ dir, root: APPLY_SITE });
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.ok(!fs.existsSync(artifactsDir()));
        const prefix = `  ${path.join(dir, "index.html")}: `;
        return error.message
          .split("\n")
          .filter(function (line) {
            return line.startsWith(prefix);
          })
          .map(function (line) {
            return line.slice(prefix.length);
          });
      }
      assert.ok(readTree(dir)["index.html"].includes(`<style>${css}</style>`));
      return null;
    } finally {
      cleanArtifacts();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  it("fails naming flex for the i flag and uppercase or escaped class names, and p-4 for @SCOPE", async function () {
    const selectors = [
      '[class~="FLEX"i]',
      '[class*="FLE"I]',
      '[CLASS~="flex"]',
      '[cl\\61ss~="flex"]',
      '[*|class~="flex"]',
    ];
    const css =
      selectors
        .map(function (selector) {
          return `${selector}{gap:1rem}`;
        })
        .join("") + "@SCOPE (.p-4){li{color:red}}";
    const lines = await tripwireLines(css);
    assert.ok(lines !== null, "apply must fail");
    for (const reference of [
      ...selectors.map(function (selector) {
        return `.flex in ${selector}`;
      }),
      ".p-4",
    ]) {
      assert.ok(lines.includes(reference), `${reference} not in ${lines}`);
    }
  });

  it("passes selectors CSS matches case-sensitively or never against class", async function () {
    assert.strictEqual(
      await tripwireLines(
        '[class~="FLEX"]{gap:1rem}' +
          '[class~="FLEX"s]{gap:1rem}' +
          '[class~="zzz"i]{gap:1rem}' +
          '[svg|class~="flex"]{gap:1rem}',
      ),
      null,
    );
  });
});
// R17 (KTD16): a tagged template hands its tag the raw text too,
// and String.raw keeps the backslash that makes `:` part of the CSS class
// name, so String.raw`.md\:flex` selects md:flex.
describe("tagged-template selector strings in built output (R17, KTD16)", function () {
  const registry = registryOf(["hidden", "md", "md:flex", "flex"]);

  function leaks(result: TransformSourceResult | null): Array<string> {
    if (result === null) return [];
    return result.warnings
      .filter(function (warning) {
        return warning.kind === "reverse-leak";
      })
      .map(function (warning) {
        return warning.token ?? "";
      })
      .sort();
  }

  it("counts the raw text of a String.raw selector in a bundle", function () {
    for (const [code, tokens] of [
      ["document.querySelector(String.raw`.md\\:flex`);\n", ["md", "md:flex"]],
      [
        "document.querySelector(String.raw`ul > .md\\:flex ${x}`);\n",
        ["md", "md:flex"],
      ],
      ["e.querySelector(String.raw`${x} .md\\:flex`);\n", ["md", "md:flex"]],
      ["e.querySelector(String.raw`.hidden`);\n", ["hidden"]],
      ["e.querySelector(`.md\\:flex`);\n", ["md"]],
    ] as const) {
      const result = transformBundle({
        code,
        id: "/out/assets/app.js",
        registry,
      });
      assert.deepStrictEqual(leaks(result), tokens, code);
    }
  });

  it("reports the raw selector at the class name", function () {
    const code = "x();\ne.querySelector(String.raw`.md\\:flex`);\n";
    const result = transformBundle({
      code,
      id: "/out/assets/app.js",
      registry: registryOf(["md:flex"]),
    });
    assert.ok(result !== null);
    assert.deepStrictEqual(
      result.warnings.map(function (warning) {
        return [warning.token, warning.line, warning.column];
      }),
      [["md:flex", 2, code.indexOf("md\\:flex") - code.indexOf("\n")]],
    );
  });

  it("counts a String.raw selector in an executable inline script", function () {
    assert.deepStrictEqual(
      leaks(
        transformModule({
          code:
            '<!doctype html><html><body><div class="md:flex">x</div>' +
            "<script>document.querySelector(String.raw`.md\\:flex`)</script>" +
            "</body></html>",
          id: "/out/index.html",
          registry: registryOf(["md:flex"]),
        }),
      ),
      ["md:flex"],
    );
  });

  it("keeps a String.raw-selected class original everywhere", function () {
    const dir = writeOutput({
      "index.html":
        '<!doctype html><html><body><div class="md:flex hidden">x</div>' +
        "</body></html>",
      "app.css":
        "@layer utilities{.hidden{display:none}" +
        "@media (width>=48rem){.md\\:flex{display:flex}}}",
      "app.js": "document.querySelector(String.raw`.md\\:flex`).x=1;\n",
    });
    try {
      const result = applyBuildOutput({
        dir,
        registry: registryOf(["hidden", "md:flex"]),
        consolidationVerdicts: [],
        consolidate: false,
      });
      assert.deepStrictEqual(result.keptOriginal, ["md:flex"]);
      const css = fs.readFileSync(path.join(dir, "app.css"), "utf8");
      assert.ok(css.includes(".md\\:flex{display:flex}"), css);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// R8 and R17 (KTD16): an inline event handler is a script body, so
// a class selector in one of its strings selects that class. The handler
// is read after HTML decoding, and each occurrence reports at its bytes in
// the page.
describe("selector strings in inline event handlers (R8, R17, KTD16)", function () {
  const registry = registryOf(["hidden", "md:flex", "flex", "block"]);

  function pageWarnings(code: string): Array<[string, number]> {
    const result = transformModule({ code, id: "/out/index.html", registry });
    if (result === null) return [];
    return result.warnings
      .filter(function (warning) {
        return warning.kind === "reverse-leak";
      })
      .map(function (warning): [string, number] {
        return [warning.token ?? "", warning.column];
      })
      .sort(function (a, b) {
        return a[1] - b[1];
      });
  }

  it("counts a class selector in an onclick handler", function () {
    const code =
      "<!doctype html><html><body>" +
      `<button onclick="document.querySelector('.hidden').remove()"></button>` +
      '<div class="hidden"></div></body></html>';
    assert.deepStrictEqual(pageWarnings(code), [
      ["hidden", code.indexOf("hidden") + 1],
    ]);
  });

  it("reads a handler body with statements, after HTML decoding", function () {
    for (const [handler, token, raw] of [
      [
        "document.querySelector('.block').hidden = true; return false",
        "block",
        "block",
      ],
      ["q(&quot;.flex&quot;)", "flex", "flex"],
      ["q('.&#104;idden')", "hidden", "&#104;idden"],
      ["q(&quot;.md\\\\:flex&quot;)", "md:flex", "md\\\\:flex"],
    ] as const) {
      const code =
        "<!doctype html><html><body>" +
        `<button onclick="${handler}">x</button></body></html>`;
      assert.deepStrictEqual(
        pageWarnings(code),
        [[token, code.indexOf(raw) + 1]],
        handler,
      );
    }
  });

  it("keeps a class an inline handler selects original everywhere", function () {
    const dir = writeOutput({
      "index.html":
        "<!doctype html><html><body>" +
        `<button onclick="document.querySelector('.hidden').remove()">x</button>` +
        '<div class="hidden block">y</div></body></html>',
      "app.css": "@layer utilities{.hidden{display:none}.block{display:block}}",
    });
    try {
      const result = applyBuildOutput({
        dir,
        registry: registryOf(["hidden", "block"]),
        consolidationVerdicts: [],
        consolidate: false,
      });
      assert.deepStrictEqual(result.keptOriginal, ["hidden"]);
      const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
      assert.ok(html.includes("querySelector('.hidden')"), html);
      assert.ok(html.includes('class="hidden '), html);
      const css = fs.readFileSync(path.join(dir, "app.css"), "utf8");
      assert.ok(css.includes(".hidden{display:none}"), css);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// R8 (KTD8): an <option> without a value attribute exposes its
// text as option.value and select.value, and a <textarea> exposes its text
// as its value, so scripts read both back. Their text stays in the leak
// scan; the text of an option with a value attribute is still masked.
describe("form-value text in built HTML (R8, KTD8)", function () {
  const registry = registryOf(["hidden", "flex", "dark"]);

  function pageLeaks(code: string): Array<string> {
    const result = transformModule({ code, id: "/out/index.html", registry });
    if (result === null) return [];
    return result.warnings
      .filter(function (warning) {
        return warning.kind === "reverse-leak";
      })
      .map(function (warning) {
        return warning.token ?? "";
      })
      .sort();
  }

  it("scans the text of a value-less <option> and of a <textarea>", function () {
    for (const [markup, tokens] of [
      ["<select><option>hidden</option></select>", ["hidden"]],
      ["<select><option> flex </option><option>x</option></select>", ["flex"]],
      ["<datalist><option>hidden</option></datalist>", ["hidden"]],
      ["<textarea>flex</textarea>", ["flex"]],
      ['<select><option value="x">hidden</option></select>', []],
      ['<select><option value="">flex</option></select>', []],
      ['<select><option value="dark">Dark</option></select>', ["dark"]],
    ] as const) {
      assert.deepStrictEqual(
        pageLeaks(`<!doctype html><html><body>${markup}</body></html>`),
        tokens,
        markup,
      );
    }
  });

  it("keeps a class a select's implicit value toggles original everywhere", function () {
    const dir = writeOutput({
      "index.html":
        "<!doctype html><html><body>" +
        '<select id="mode"><option>hidden</option><option>x</option></select>' +
        '<div id="t" class="hidden flex">y</div>' +
        "<script>t.classList.toggle(mode.value)</script></body></html>",
      "app.css": "@layer utilities{.hidden{display:none}.flex{display:flex}}",
    });
    try {
      const result = applyBuildOutput({
        dir,
        registry: registryOf(["hidden", "flex"]),
        consolidationVerdicts: [],
        consolidate: false,
      });
      assert.deepStrictEqual(result.keptOriginal, ["hidden"]);
      const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
      assert.ok(html.includes('class="hidden '), html);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// R16 and R17 (KTD15, KTD16): markup held in a <script> of a type
// that is neither JavaScript nor JSON, such as Vue's text/x-template, is
// compiled at runtime, so its attribute values get the object-key and
// selector scans of page markup. Executable scripts and JSON keep theirs.
describe("markup in non-JavaScript script types (R16, R17, KTD15, KTD16)", function () {
  const registry = registryOf(["hidden", "flex", "block"]);

  function pageLeaks(code: string): Array<string> {
    const result = transformModule({ code, id: "/out/index.html", registry });
    if (result === null) return [];
    return result.warnings
      .filter(function (warning) {
        return warning.kind === "reverse-leak";
      })
      .map(function (warning) {
        return warning.token ?? "";
      })
      .sort();
  }

  function page(script: string): string {
    return `<!doctype html><html><body>${script}<div class="hidden flex"></div></body></html>`;
  }

  it("counts object keys in template markup", function () {
    for (const type of [
      "text/x-template",
      "text/template",
      "text/html",
      "text/x-handlebars-template",
    ]) {
      assert.deepStrictEqual(
        pageLeaks(
          page(
            `<script type="${type}" id="t">` +
              '<div :class="{ hidden: !open }"><template>' +
              "<p x-bind:class=\"{ 'x': a, flex: b }\"></p>" +
              "</template></div></script>",
          ),
        ),
        ["flex", "hidden"],
        type,
      );
    }
  });

  it("reports a template key at its bytes in the page", function () {
    const code = page(
      '<script type="text/x-template"><i :class="{ hidden: a }"></i></script>',
    );
    const result = transformModule({ code, id: "/out/index.html", registry });
    assert.ok(result !== null);
    assert.deepStrictEqual(
      result.warnings.map(function (warning) {
        return [warning.token, warning.column];
      }),
      [["hidden", code.indexOf("hidden") + 1]],
    );
  });

  it("counts a class selector in a template's inline handler", function () {
    assert.deepStrictEqual(
      pageLeaks(
        page(
          '<script type="text/x-template">' +
            `<button onclick="document.querySelector('.block').remove()">x</button>` +
            "</script>",
        ),
      ),
      ["block"],
    );
  });

  it("leaves executable scripts and JSON to their own scans", function () {
    for (const script of [
      `<script>const t = "<div :class='{ hidden: a }'></div>";</script>`,
      `<script type="module">const t = "<i :class='{ hidden: a }'></i>";</script>`,
      `<script type="application/json">"<div :class='{ hidden: a }'></div>"</script>`,
      `<script type="importmap">{"x":"<div :class='{ hidden: a }'></div>"}</script>`,
      `<script type="application/ld+json">{"x":"<i :class='{ hidden: a }'></i>"}</script>`,
    ]) {
      assert.deepStrictEqual(pageLeaks(page(script)), [], script);
    }
  });
});

// R17 (KTD16): the attributes Alpine and htmx run as JavaScript hold
// selector strings as an inline handler does, so a class selector in one
// of their strings counts, read decoded and reported at its page bytes.
// Every other attribute is never parsed for selectors.
describe("selector strings in framework JavaScript attributes (R17, KTD16)", function () {
  const registry = registryOf(["hidden", "block"]);

  function pageWarnings(code: string): Array<[string, number]> {
    const result = transformModule({ code, id: "/out/index.html", registry });
    if (result === null) return [];
    return result.warnings
      .filter(function (warning) {
        return warning.kind === "reverse-leak";
      })
      .map(function (warning): [string, number] {
        return [warning.token ?? "", warning.column];
      });
  }

  function page(attribute: string): string {
    return (
      "<!doctype html><html><body>" +
      `<div ${attribute}>x</div><p class="hidden block">y</p>` +
      "</body></html>"
    );
  }

  it("counts a class selector in Alpine and htmx JavaScript attributes", function () {
    for (const attribute of [
      `@click="document.querySelector('.hidden').remove()"`,
      `x-on:click.prevent="$el.closest('.hidden').remove()"`,
      `x-init="$el.querySelector('.hidden').focus()"`,
      `x-effect="open && $el.querySelector('.hidden')"`,
      `x-data="{ init() { this.$el.querySelector('.hidden') } }"`,
      `x-bind:data-on="!!$el.querySelector('.hidden')"`,
      `:data-on="!!document.querySelector('.hidden')"`,
      `hx-on:click="htmx.find('.hidden')"`,
      `hx-on::after-request="htmx.find('.hidden')"`,
      `hx-on--after-request="htmx.find('.hidden')"`,
    ]) {
      const code = page(attribute);
      assert.deepStrictEqual(
        pageWarnings(code),
        [["hidden", code.indexOf("hidden") + 1]],
        attribute,
      );
    }
  });

  it("reads the value after HTML decoding, reporting the raw bytes", function () {
    const code = page('@click="q(&quot;.&#104;idden&quot;)"');
    assert.deepStrictEqual(pageWarnings(code), [
      ["hidden", code.indexOf("&#104;idden") + 1],
    ]);
  });

  it("never parses another attribute for selectors", function () {
    for (const attribute of [
      `data-x="document.querySelector('.hidden')"`,
      'data-bs-target=".hidden"',
      `x-text="'.hidden'"`,
      'href="/a.hidden"',
      `id="'.block'"`,
    ]) {
      assert.deepStrictEqual(pageWarnings(page(attribute)), [], attribute);
    }
  });
});
