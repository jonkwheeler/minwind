import assert from "node:assert";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  modelCssFile,
  unescapeCssIdentifier,
  type SelectorArmModel,
} from "../../src/measure/css-model.js";
import { modelHtmlFile } from "../../src/measure/html-model.js";

const execFileAsync = promisify(execFile);
const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(TEST_DIR, "fixtures");
const MODEL_SITE = path.join(FIXTURES_DIR, "model-site");
const CLI_PATH = path.resolve(TEST_DIR, "../../src/measure/cli.ts");

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

async function runCli(args: Array<string>): Promise<RunResult> {
  try {
    const result = await execFileAsync("pnpm", ["tsx", CLI_PATH, ...args], {
      cwd: path.resolve(TEST_DIR, "../.."),
    });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const err = error as {
      code?: number;
      stdout?: string;
      stderr?: string;
    };
    return {
      code: typeof err.code === "number" ? err.code : -1,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
    };
  }
}

describe("unescapeCssIdentifier", () => {
  it("unescapes a variant colon to the exact markup token", () => {
    assert.strictEqual(
      unescapeCssIdentifier("hover\\:bg-red-500"),
      "hover:bg-red-500",
    );
  });

  it("unescapes brackets, dots, slashes, and ampersands", () => {
    assert.strictEqual(
      unescapeCssIdentifier("contrast-\\[0\\.9\\]"),
      "contrast-[0.9]",
    );
    assert.strictEqual(unescapeCssIdentifier("max-w-162\\.5"), "max-w-162.5");
    assert.strictEqual(
      unescapeCssIdentifier("divide-dark-border\\/75"),
      "divide-dark-border/75",
    );
    assert.strictEqual(
      unescapeCssIdentifier("\\[\\&_pre\\]\\:overflow-x-auto"),
      "[&_pre]:overflow-x-auto",
    );
  });

  it("decodes hexadecimal escapes and consumes one trailing whitespace", () => {
    assert.strictEqual(unescapeCssIdentifier("\\31 23"), "123");
  });

  it("leaves plain identifiers untouched", () => {
    assert.strictEqual(unescapeCssIdentifier("bg-white"), "bg-white");
  });
});

describe("html-model", () => {
  it("records class attribute value spans and decoded tokens", () => {
    const filePath = path.join(MODEL_SITE, "index.html");
    const result = modelHtmlFile(filePath);
    assert.ok(result.ok);
    const source = fs.readFileSync(filePath, "utf8");
    const body = result.model.classAttributes.find(function (occ) {
      return occ.tokens.includes("bg-white");
    });
    assert.ok(body, "expected a class attribute containing bg-white");
    assert.deepStrictEqual(body.tokens, [
      "bg-white",
      "hover:bg-red-500",
      "alpha",
      "space-y-3",
    ]);
    assert.strictEqual(
      source.slice(body.span.start, body.span.end),
      "bg-white hover:bg-red-500 alpha space-y-3",
    );
  });

  it("captures inline script text for the exclusion scan", () => {
    const result = modelHtmlFile(path.join(MODEL_SITE, "index.html"));
    assert.ok(result.ok);
    const scripts = result.model.inlineScripts;
    assert.strictEqual(scripts.length, 1);
    assert.match(scripts[0], /'inline-toggled'/);
  });

  it("skips a file with a duplicate class attribute on one element", () => {
    const result = modelHtmlFile(
      path.join(FIXTURES_DIR, "dup-class", "index.html"),
    );
    assert.ok(!result.ok);
    assert.match(result.reason, /duplicate class attribute/i);
  });
});

describe("css-model", () => {
  it("unescapes an escaped utility selector to the exact markup token", () => {
    const model = modelCssFile(path.join(MODEL_SITE, "assets", "app.css"));
    const rule = model.rules.find(function (r) {
      return r.arms.some(function (arm) {
        return arm.candidates.includes("hover:bg-red-500");
      });
    });
    assert.ok(rule, "expected a rule with candidate hover:bg-red-500");
    assert.ok(rule.inUtilitiesLayer);
    assert.deepStrictEqual(model.parseWarnings, []);
  });

  it("maps every arm of a comma-grouped rule to its candidate", () => {
    const model = modelCssFile(path.join(MODEL_SITE, "assets", "app.css"));
    const rule = model.rules.find(function (r) {
      return r.arms.some(function (arm) {
        return arm.candidates.includes("alpha");
      });
    });
    assert.ok(rule, "expected the comma-grouped rule");
    assert.strictEqual(rule.arms.length, 2);
    assert.deepStrictEqual(rule.arms[0].candidates, ["alpha"]);
    assert.deepStrictEqual(rule.arms[1].candidates, ["beta"]);
  });

  it("records selector spans over the raw stylesheet text", () => {
    const filePath = path.join(MODEL_SITE, "assets", "app.css");
    const model = modelCssFile(filePath);
    const source = fs.readFileSync(filePath, "utf8");
    const rule = model.rules.find(function (r) {
      return r.arms.some(function (arm) {
        return arm.candidates.includes("hover:bg-red-500");
      });
    });
    assert.ok(rule);
    const arm = rule.arms[0];
    assert.strictEqual(
      source.slice(arm.span.start, arm.span.end),
      ".hover\\:bg-red-500:hover",
    );
  });

  function firstArmOf(source: string): SelectorArmModel {
    const model = modelCssFile("inline.css", source);
    assert.strictEqual(model.rules.length, 1);
    assert.strictEqual(model.rules[0].arms.length, 1);
    return model.rules[0].arms[0];
  }

  it("records the candidate identifier span over the raw stylesheet text", () => {
    const source =
      "@layer utilities {\n" +
      "  .hover\\:bg-red-500:hover {\n" +
      "    color: red;\n" +
      "  }\n" +
      "}\n";
    const arm = firstArmOf(source);
    assert.ok(arm.candidateSpan !== null);
    assert.strictEqual(
      source.slice(arm.candidateSpan.start, arm.candidateSpan.end),
      "hover\\:bg-red-500",
    );
    // The identifier starts one offset past the selector's leading dot.
    assert.strictEqual(arm.candidateSpan.start, arm.span.start + 1);
    assert.ok(arm.candidateSpan.end <= arm.span.end);
  });

  it("records the candidate span nested inside a :where() wrapper", () => {
    const source =
      "@layer utilities {\n" +
      "  :where(.space-y-3>:not(:last-child)) {\n" +
      "    margin-top: 0;\n" +
      "  }\n" +
      "}\n";
    const arm = firstArmOf(source);
    assert.deepStrictEqual(arm.candidates, ["space-y-3"]);
    assert.ok(arm.candidateSpan !== null);
    assert.strictEqual(
      source.slice(arm.candidateSpan.start, arm.candidateSpan.end),
      "space-y-3",
    );
  });

  it("records the span of the last top-level class in a descendant selector", () => {
    const source =
      "@layer utilities {\n" +
      "  .group:hover .group-hover\\:glow {\n" +
      "    filter: none;\n" +
      "  }\n" +
      "}\n";
    const arm = firstArmOf(source);
    assert.deepStrictEqual(arm.candidates, ["group-hover:glow"]);
    assert.deepStrictEqual(arm.references, ["group"]);
    assert.ok(arm.candidateSpan !== null);
    assert.strictEqual(
      source.slice(arm.candidateSpan.start, arm.candidateSpan.end),
      "group-hover\\:glow",
    );
  });

  it("records a null candidate span when no class selector is present", () => {
    const arm = firstArmOf("div {\n  color: red;\n}\n");
    assert.deepStrictEqual(arm.candidates, []);
    assert.strictEqual(arm.candidateSpan, null);
  });

  it("marks rules outside the utilities layer as non-utility", () => {
    const model = modelCssFile(path.join(MODEL_SITE, "assets", "app.css"));
    const rule = model.rules.find(function (r) {
      return r.arms.some(function (arm) {
        return arm.candidates.includes("brand-title");
      });
    });
    assert.ok(rule, "expected a rule for brand-title");
    assert.ok(!rule.inUtilitiesLayer);
  });

  it("treats marker classes in earlier compounds as references, not candidates", () => {
    const model = modelCssFile(path.join(MODEL_SITE, "assets", "app.css"));
    const rule = model.rules.find(function (r) {
      return r.arms.some(function (arm) {
        return arm.candidates.includes("group-hover:glow");
      });
    });
    assert.ok(rule);
    assert.deepStrictEqual(rule.arms[0].candidates, ["group-hover:glow"]);
    assert.deepStrictEqual(rule.arms[0].references, ["group"]);
  });

  it("treats marker classes nested in pseudo-class arguments as references", () => {
    const model = modelCssFile(path.join(MODEL_SITE, "assets", "app.css"));
    const rule = model.rules.find(function (r) {
      return r.arms.some(function (arm) {
        return arm.candidates.includes("group-hover:v4");
      });
    });
    assert.ok(rule);
    assert.deepStrictEqual(rule.arms[0].candidates, ["group-hover:v4"]);
    assert.deepStrictEqual(rule.arms[0].references, ["group"]);
  });

  it("extracts the candidate from a fully :where()-wrapped selector", () => {
    const model = modelCssFile(path.join(MODEL_SITE, "assets", "app.css"));
    const rule = model.rules.find(function (r) {
      return r.arms.some(function (arm) {
        return arm.candidates.includes("space-y-3");
      });
    });
    assert.ok(rule, "expected a rule with candidate space-y-3");
    assert.ok(rule.inUtilitiesLayer);
    assert.deepStrictEqual(rule.arms[0].candidates, ["space-y-3"]);
    assert.deepStrictEqual(rule.arms[0].references, []);
  });

  it("recovers from @supports prelude parse errors and still extracts rules", () => {
    const model = modelCssFile(
      path.join(FIXTURES_DIR, "supports-prelude", "assets", "app.css"),
    );
    assert.ok(
      model.parseWarnings.length > 0,
      "expected parse warnings for the supports prelude",
    );
    const candidates = model.rules.flatMap(function (rule) {
      return rule.arms.flatMap(function (arm) {
        return arm.candidates;
      });
    });
    assert.ok(candidates.includes("supports-rule"));
    assert.ok(candidates.includes("plain-rule"));
  });
});

describe("cli class inventory", () => {
  it("prints a per-category inventory dump and exits 0", async () => {
    const result = await runCli([MODEL_SITE]);
    assert.strictEqual(result.code, 0);
    assert.match(result.stdout, /class inventory/i);
    assert.match(result.stdout, /utility \(7\)/);
    assert.match(result.stdout, /custom \(1\)/);
    assert.match(result.stdout, /marker \(2\)/);
    assert.match(result.stdout, /css-only \(2\)/);
    assert.match(result.stdout, /js-referenced \(2\)/);
    assert.match(result.stdout, /unmodelable \(1\)/);
    assert.match(result.stdout, /hover:bg-red-500/);
    assert.match(result.stdout, /excluded class-token bytes/i);
  });

  it("lists the skipped file, then aborts at the qualification gate", async () => {
    const result = await runCli([path.join(FIXTURES_DIR, "dup-class")]);
    // The skipped HTML file leaves no HTML-used tokens, so no utility
    // selector can map and the U4 qualification gate aborts the run.
    assert.strictEqual(result.code, 1);
    assert.match(result.stderr, /index\.html/);
    assert.match(result.stderr, /duplicate class attribute/i);
    assert.match(result.stderr, /no stylesheet qualifies/i);
  });

  it("completes with a skipped file and exits 2", async function () {
    const result = await runCli([path.join(FIXTURES_DIR, "dup-class-mixed")]);
    // index.html qualifies on its own, so the gate passes and the run
    // completes; the skipped dup.html only moves the exit code to 2.
    assert.strictEqual(result.code, 2);
    assert.match(result.stderr, /skipped dup\.html/i);
    assert.match(result.stderr, /duplicate class attribute/i);
    assert.match(result.stdout, /class inventory/i);
    assert.match(result.stdout, /Measurement/);
  });
});
