import assert from "node:assert";
import { execFile } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { runApplyCli } from "../src/apply-cli.js";
import {
  hashModuleLocal,
  moduleLocalKey,
  prepareModulesNaming,
} from "../src/engines/css-modules.js";

const execFileAsync = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(HERE, "fixtures", "turbopack-modules-site");
const OUT = path.join(FIXTURE, "out");
const CARD = path.join(FIXTURE, "app", "Card.module.css");
const VOCABULARY = path.join(FIXTURE, "words.json");
const DECOY = "NotAModule-module__zzz__nope";
const LIGHTNING_ROOT = /Card-module__\w+__root/;

function skipBuild(): boolean {
  return process.env.MINWIND_SKIP_BUILD === "1";
}

function walkFiles(directory: string): Array<string> {
  const files: Array<string> = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(full));
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

function readTree(directory: string): {
  js: string;
  css: string;
  html: string;
} {
  let js = "";
  let css = "";
  let html = "";
  for (const file of walkFiles(directory)) {
    const text = readFileSync(file, "utf8");
    if (file.endsWith(".css")) css += text;
    else if (file.endsWith(".html")) html += text;
    else if (/\.[cm]?js$/.test(file)) js += text;
  }
  return { js, css, html };
}

async function ensureBuilt(): Promise<void> {
  if (!existsSync(path.join(FIXTURE, "node_modules", "next"))) {
    await execFileAsync("pnpm", ["install", "--ignore-workspace"], {
      cwd: FIXTURE,
    });
  }
  await execFileAsync("pnpm", ["run", "build"], { cwd: FIXTURE });
}

function copyOut(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "minwind-turbopack-"));
  cpSync(OUT, dir, { recursive: true });
  return dir;
}

describe("Next/Turbopack Modules apply (AE3)", function () {
  it(
    "remaps words so JS export values match CSS selectors",
    { timeout: 300000 },
    async function () {
      if (skipBuild()) return;
      await ensureBuilt();
      const dir = copyOut();
      try {
        const prepared = prepareModulesNaming(FIXTURE, {
          strategy: "words",
          vocabulary: ["quill", "willow", "ember", "lark"],
        });
        const rootName = prepared.registry.nameFor(
          moduleLocalKey(FIXTURE, CARD, "root"),
        );
        const titleName = prepared.registry.nameFor(
          moduleLocalKey(FIXTURE, CARD, "title"),
        );
        assert.ok(rootName !== undefined);
        assert.ok(titleName !== undefined);
        const code = await runApplyCli([
          dir,
          "--root",
          FIXTURE,
          "--engines",
          "css-modules",
          "--naming",
          "words",
          "--vocabulary",
          VOCABULARY,
        ]);
        assert.strictEqual(code, 0);
        const tree = readTree(dir);
        assert.ok(
          tree.js.includes(`root:"${rootName}"`) ||
            tree.js.includes(`root: "${rootName}"`),
        );
        assert.ok(
          tree.js.includes(`title:"${titleName}"`) ||
            tree.js.includes(`title: "${titleName}"`),
        );
        assert.ok(tree.css.includes(`.${rootName}`));
        assert.ok(tree.css.includes(`.${titleName}`));
        assert.ok(!LIGHTNING_ROOT.test(tree.css));
        assert.ok(!LIGHTNING_ROOT.test(tree.js));
        assert.ok(tree.html.includes(`class="${rootName}"`));
        assert.ok(tree.html.includes(DECOY));
        assert.ok(tree.js.includes(DECOY));
      } finally {
        rmSync(dir, { recursive: true, force: true });
        rmSync(path.join(FIXTURE, ".output"), {
          recursive: true,
          force: true,
        });
      }
    },
  );

  it(
    "remaps hash strategy to hashModuleLocal names",
    { timeout: 300000 },
    async function () {
      if (skipBuild()) return;
      await ensureBuilt();
      const dir = copyOut();
      try {
        const expectedRoot = hashModuleLocal(FIXTURE, CARD, "root");
        const expectedTitle = hashModuleLocal(FIXTURE, CARD, "title");
        const code = await runApplyCli([
          dir,
          "--root",
          FIXTURE,
          "--engines",
          "css-modules",
        ]);
        assert.strictEqual(code, 0);
        const tree = readTree(dir);
        assert.ok(tree.css.includes(`.${expectedRoot}`));
        assert.ok(tree.css.includes(`.${expectedTitle}`));
        assert.ok(
          tree.js.includes(`"${expectedRoot}"`) ||
            tree.js.includes(expectedRoot),
        );
        assert.ok(!LIGHTNING_ROOT.test(tree.css));
        assert.ok(tree.html.includes(DECOY));
      } finally {
        rmSync(dir, { recursive: true, force: true });
        rmSync(path.join(FIXTURE, ".output"), {
          recursive: true,
          force: true,
        });
      }
    },
  );
});
