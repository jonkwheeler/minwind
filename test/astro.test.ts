import assert from "node:assert";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { before, describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { ident, parse, type CssNode } from "css-tree";
import minwind, {
  type AstroConfigLike,
  type MinwindAstroIntegration,
  type MinwindAstroOptions,
} from "../src/astro.js";
import { compileTailwindStylesheet } from "../src/engines/tailwind.js";
import { hashClassName } from "../src/names.js";
import type { RenameMap, TransformReport } from "../src/report.js";

// minwind/astro driven through its hooks with fake hook arguments, in the
// order `astro build` calls them; the end-to-end section at the bottom runs
// the real `astro build` on a fixture site. astro:build:done runs the real
// apply engine on a miniature site written to a temp root: the layout and
// page the pre-pass scans, and dist/ as Astro would emit it. The stylesheet
// is plain CSS in the utilities layer, so the pre-pass compiles it without
// resolving the tailwindcss package from the temp root.

const STYLESHEET = `@layer utilities {
  .scroll-smooth { scroll-behavior: smooth; }
  .min-h-screen { min-height: 100vh; }
  .flex { display: flex; }
  .flex-col { flex-direction: column; }
  .items-center { align-items: center; }
}
`;

const LAYOUT = `---
const { title } = Astro.props;
---
<html lang="en" class="scroll-smooth">
  <head><title>{title}</title></head>
  <body class="min-h-screen"><slot /></body>
</html>
`;

const PAGE = `---
import Layout from "../layouts/Layout.astro";
---
<Layout title="Inbox">
  <ul class="flex flex-col">
    <li class="flex items-center">One</li>
    <li class="flex items-center">Two</li>
    <li class="flex items-center">Three</li>
  </ul>
</Layout>
`;

const HTML =
  '<!DOCTYPE html><html lang="en" class="scroll-smooth"><head>' +
  '<title>Inbox</title><link rel="stylesheet" href="/_astro/index.css">' +
  '</head><body class="min-h-screen"><ul class="flex flex-col">' +
  '<li class="flex items-center">One</li>' +
  '<li class="flex items-center">Two</li>' +
  '<li class="flex items-center">Three</li>' +
  "</ul></body></html>";

// Curation order puts the shortest word first, so the length-weighted deal
// (shortest word to flex, in four lists) and the visibility deal (first
// word to the <html> class) give it to different classes.
const VOCABULARY = [
  "fyi",
  "circlingback",
  "pinging",
  "touchbase",
  "perourlastemail",
  "justbumpingthis",
  "hopethisfindsyouwell",
];

function writeFile(root: string, relative: string, text: string): void {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

// cssEntry is relative to the site root.
async function makeSite(
  cssEntry: string = path.join("src", "styles", "global.css"),
): Promise<string> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "minwind-astro-int-"));
  writeFile(root, cssEntry, STYLESHEET);
  writeFile(root, path.join("src", "layouts", "Layout.astro"), LAYOUT);
  writeFile(root, path.join("src", "pages", "index.astro"), PAGE);
  const compiled = await compileTailwindStylesheet({
    cssEntry: path.join(root, cssEntry),
    root,
  });
  writeFile(
    root,
    path.join("dist", "_astro", "index.css"),
    compiled.stylesheet,
  );
  writeFile(root, path.join("dist", "index.html"), HTML);
  return root;
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

function builtPage(root: string): string {
  return fs.readFileSync(path.join(root, "dist", "index.html"), "utf8");
}

async function withEnv<T>(
  name: string,
  value: string,
  fn: () => Promise<T> | T,
): Promise<T> {
  const previous = process.env[name];
  process.env[name] = value;
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  }
}

// Astro's config.root is a directory URL with a trailing slash.
function configFor(
  root: string,
  overrides: Partial<AstroConfigLike> = {},
): AstroConfigLike {
  return {
    root: pathToFileURL(root + path.sep),
    build: { inlineStylesheets: "never" },
    ...overrides,
  };
}

function setup(
  integration: MinwindAstroIntegration,
  command: string,
): Array<unknown> {
  const updates: Array<unknown> = [];
  integration.hooks["astro:config:setup"]({
    command,
    updateConfig: function (config) {
      updates.push(config);
      return config;
    },
  });
  return updates;
}

interface Logs {
  info: Array<string>;
  warn: Array<string>;
}

async function buildDone(
  integration: MinwindAstroIntegration,
  root: string,
): Promise<Logs> {
  const logs: Logs = { info: [], warn: [] };
  await integration.hooks["astro:build:done"]({
    dir: pathToFileURL(path.join(root, "dist") + path.sep),
    logger: {
      info: function (message) {
        logs.info.push(message);
      },
      warn: function (message) {
        logs.warn.push(message);
      },
    },
  });
  return logs;
}

// The three hooks an `astro build` runs, in order, for a static site.
async function build(
  options: MinwindAstroOptions,
  root: string,
): Promise<Logs> {
  const integration = minwind(options);
  setup(integration, "build");
  integration.hooks["astro:config:done"]({
    config: configFor(root),
    buildOutput: "static",
  });
  return buildDone(integration, root);
}

describe("astro:config:setup", function () {
  it("makes no updateConfig call in dev", function () {
    assert.deepStrictEqual(setup(minwind(), "dev"), []);
  });

  it("forces inlineStylesheets never on a build", function () {
    assert.deepStrictEqual(setup(minwind(), "build"), [
      { build: { inlineStylesheets: "never" } },
    ]);
  });

  it("rejects customProperties, naming the Vite and webpack plugins", function () {
    const options = {
      customProperties: { names: ["--brand"], prefixes: [] },
    } as unknown as MinwindAstroOptions;
    assert.throws(
      function () {
        setup(minwind(options), "build");
      },
      function (error: Error) {
        assert.match(error.message, /customProperties/);
        assert.match(error.message, /Vite plugin/);
        assert.match(error.message, /webpack/);
        return true;
      },
    );
  });

  it("rejects invalid naming before Astro renders anything", function () {
    assert.throws(function () {
      setup(minwind({ naming: { strategy: "words" } }), "build");
    }, /requires theme or vocabulary/);
    assert.throws(function () {
      setup(
        minwind({
          naming: {
            strategy: "hash",
            prominence: {},
          } as unknown as MinwindAstroOptions["naming"],
        }),
        "build",
      );
    }, /cannot set prominence/);
  });
});

describe("astro:config:done", function () {
  for (const command of ["dev", "preview", "sync"]) {
    it(`checks nothing for ${command}`, function () {
      const integration = minwind();
      setup(integration, command);
      integration.hooks["astro:config:done"]({
        config: configFor(os.tmpdir(), {
          build: { inlineStylesheets: "auto" },
          adapter: { name: "@astrojs/node" },
          security: { csp: true },
        }),
        buildOutput: "server",
      });
    });
  }

  it("rejects a configured adapter on static output, naming it", function () {
    const integration = minwind();
    setup(integration, "build");
    assert.throws(function () {
      integration.hooks["astro:config:done"]({
        config: configFor(os.tmpdir(), {
          adapter: { name: "@astrojs/netlify" },
        }),
        buildOutput: "static",
      });
    }, /@astrojs\/netlify/);
  });

  it("rejects server output (AE2)", function () {
    const integration = minwind();
    setup(integration, "build");
    assert.throws(function () {
      integration.hooks["astro:config:done"]({
        config: configFor(os.tmpdir()),
        buildOutput: "server",
      });
    }, /minwind\/astro supports static output only/);
  });

  it("rejects security.csp, explaining that the hashes would go stale", function () {
    const integration = minwind();
    setup(integration, "build");
    assert.throws(
      function () {
        integration.hooks["astro:config:done"]({
          config: configFor(os.tmpdir(), { security: { csp: true } }),
          buildOutput: "static",
        });
      },
      function (error: Error) {
        assert.match(error.message, /security\.csp/);
        assert.match(error.message, /hashes/);
        assert.match(error.message, /stale/);
        return true;
      },
    );
  });

  it("rejects a final config that still inlines stylesheets", function () {
    const integration = minwind();
    setup(integration, "build");
    assert.throws(function () {
      integration.hooks["astro:config:done"]({
        config: configFor(os.tmpdir(), {
          build: { inlineStylesheets: "auto" },
        }),
        buildOutput: "static",
      });
    }, /inlineStylesheets/);
  });

  it("still enforces the config under MINWIND=off (R5)", async function () {
    await withEnv("MINWIND", "off", function () {
      const integration = minwind();
      assert.deepStrictEqual(setup(integration, "build"), [
        { build: { inlineStylesheets: "never" } },
      ]);
      assert.throws(function () {
        integration.hooks["astro:config:done"]({
          config: configFor(os.tmpdir()),
          buildOutput: "server",
        });
      }, /static output only/);
    });
  });
});

describe("astro:build:done", function () {
  it("renames the output and logs a summary", async function () {
    const root = await makeSite();
    try {
      const logs = await build({}, root);
      const html = builtPage(root);
      assert.ok(
        html.includes(`class="${hashClassName("scroll-smooth")}"`),
        html,
      );
      assert.ok(fs.existsSync(path.join(root, ".output", "minwind")));
      assert.ok(
        logs.info.some(function (line) {
          return /renamed 5 class\(es\)/.test(line);
        }),
        logs.info.join("\n"),
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("logs the classes it kept original, with the reason", async function () {
    const root = await makeSite();
    try {
      // A call argument the bundle pass cannot rewrite keeps flex original
      // everywhere.
      writeFile(
        root,
        path.join("dist", "_astro", "page.js"),
        'r(document.body, "flex");\n',
      );
      const logs = await build({}, root);
      const kept = logs.info.find(function (line) {
        return line.includes("kept original");
      });
      assert.ok(kept !== undefined, logs.info.join("\n"));
      assert.match(kept, /cannot rewrite/);
      assert.match(kept, /: flex$/);
      assert.ok(builtPage(root).includes('<li class="flex '));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("leaves the output and artifacts untouched under MINWIND=off", async function () {
    const root = await makeSite();
    try {
      const before = readTree(path.join(root, "dist"));
      const logs = await withEnv("MINWIND", "off", function () {
        return build(
          { naming: { strategy: "words", vocabulary: VOCABULARY } },
          root,
        );
      });
      assert.deepStrictEqual(readTree(path.join(root, "dist")), before);
      assert.ok(!fs.existsSync(path.join(root, ".output")));
      assert.strictEqual(logs.info.length, 1);
      assert.match(logs.info[0], /MINWIND=off/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("ranks visibility for words naming, dealing the first word to <html>", async function () {
    const root = await makeSite();
    try {
      const logs = await build(
        {
          naming: { strategy: "words", vocabulary: VOCABULARY },
          mode: "morph",
        },
        root,
      );
      const html = builtPage(root);
      assert.ok(html.includes('<html lang="en" class="fyi">'), html);
      assert.ok(html.includes('<body class="circlingback">'), html);
      assert.ok(
        logs.info.some(function (line) {
          return /ranked 5 class\(es\)/.test(line);
        }),
        logs.info.join("\n"),
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("deals words by length alone with prominence false", async function () {
    const root = await makeSite();
    try {
      const logs = await build(
        {
          naming: { strategy: "words", vocabulary: VOCABULARY },
          mode: "morph",
          prominence: false,
        },
        root,
      );
      const html = builtPage(root);
      // The shortest word goes to flex, the class in the most lists.
      assert.ok(html.includes('<ul class="fyi '), html);
      assert.ok(!html.includes('<html lang="en" class="fyi">'), html);
      assert.ok(
        !logs.info.some(function (line) {
          return line.includes("ranked");
        }),
        logs.info.join("\n"),
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("never ranks for hash naming", async function () {
    const root = await makeSite();
    try {
      const logs = await build({ naming: { strategy: "hash" } }, root);
      assert.ok(
        builtPage(root).includes(
          `<html lang="en" class="${hashClassName("scroll-smooth")}">`,
        ),
      );
      assert.ok(
        !logs.info.some(function (line) {
          return line.includes("ranked");
        }),
        logs.info.join("\n"),
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("resolves a relative cssEntry against the Astro root", async function () {
    const cssEntry = path.join("src", "styles", "site.css");
    const root = await makeSite(cssEntry);
    try {
      // The test process runs from the repository, not the site root.
      assert.notStrictEqual(process.cwd(), root);
      await build({ cssEntry }, root);
      assert.ok(
        builtPage(root).includes(
          `<html lang="en" class="${hashClassName("scroll-smooth")}">`,
        ),
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("falls back to src/app.css when src/styles/global.css is absent", async function () {
    const root = await makeSite(path.join("src", "app.css"));
    try {
      await build({}, root);
      assert.ok(
        builtPage(root).includes(
          `<html lang="en" class="${hashClassName("scroll-smooth")}">`,
        ),
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("propagates an engine error so astro build fails", async function () {
    const root = await makeSite();
    try {
      writeFile(
        root,
        path.join("dist", "index.html"),
        HTML.replace("</head>", "<style>.flex{gap:1rem}</style></head>"),
      );
      await assert.rejects(build({}, root), function (error: Error) {
        assert.match(error.message, /index\.html: \.flex/);
        return true;
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

// End-to-end (KTD10): the real `astro build` CLI on test/fixtures/astro-site,
// a self-contained site with its own lockfile that links this package. Each
// run builds the same source three times: with the integration, with it
// under MINWIND=off, and without it (MINWIND_FIXTURE_NO_INTEGRATION=1, the
// AE4 baseline).

const execFileAsync = promisify(execFile);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = path.join(REPO, "test", "fixtures", "astro-site");
const ASTRO_CLI = path.join(
  FIXTURE,
  "node_modules",
  "astro",
  "bin",
  "astro.mjs",
);
const ARTIFACTS = path.join(FIXTURE, ".output", "minwind");
const OUT_DIRS = {
  on: path.join(FIXTURE, "dist-on"),
  off: path.join(FIXTURE, "dist-off"),
  baseline: path.join(FIXTURE, "dist-baseline"),
};

// The fixture pins astro exactly, and that version's CLI exits on Node below
// its engines floor. The floor moves with the pin.
const ASTRO_VERSION = "7.4.13";
const ASTRO_NODE_FLOOR = "22.23.4";

function nodeBelow(floor: string): boolean {
  const running = process.versions.node.split(".").map(Number);
  const minimum = floor.split(".").map(Number);
  for (let i = 0; i < minimum.length; i += 1) {
    if (running[i] !== minimum[i]) return running[i] < minimum[i];
  }
  return false;
}

function endToEndSkip(): string | false {
  if (process.env.MINWIND_SKIP_BUILD === "1") return "MINWIND_SKIP_BUILD=1";
  if (nodeBelow(ASTRO_NODE_FLOOR)) {
    return (
      `astro ${ASTRO_VERSION} needs Node >=${ASTRO_NODE_FLOOR};` +
      ` this is ${process.versions.node}`
    );
  }
  return false;
}

// process.execPath runs Astro on the Node this suite was gated on, whatever
// node comes first on PATH.
async function astroBuild(
  outDir: string,
  env: Record<string, string>,
): Promise<void> {
  await execFileAsync(
    process.execPath,
    [ASTRO_CLI, "build", "--outDir", outDir],
    { cwd: FIXTURE, env: { ...process.env, ...env } },
  );
}

interface Builds {
  on: Record<string, string>;
  off: Record<string, string>;
  baseline: Record<string, string>;
  offWroteArtifacts: boolean;
}

async function ensureBuilt(): Promise<Builds> {
  // The fixture's minwind/astro is this package's dist, so build it first.
  await execFileAsync("pnpm", ["run", "build"], { cwd: REPO });
  if (!fs.existsSync(path.join(FIXTURE, "node_modules", "astro"))) {
    await execFileAsync("pnpm", ["install", "--ignore-workspace"], {
      cwd: FIXTURE,
    });
  }
  for (const dir of Object.values(OUT_DIRS)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.rmSync(path.join(FIXTURE, ".output"), { recursive: true, force: true });
  await astroBuild(OUT_DIRS.baseline, { MINWIND_FIXTURE_NO_INTEGRATION: "1" });
  await astroBuild(OUT_DIRS.off, { MINWIND: "off" });
  const offWroteArtifacts = fs.existsSync(ARTIFACTS);
  await astroBuild(OUT_DIRS.on, {});
  return {
    on: readTree(OUT_DIRS.on),
    off: readTree(OUT_DIRS.off),
    baseline: readTree(OUT_DIRS.baseline),
    offWroteArtifacts,
  };
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

function pagesOf(tree: Record<string, string>): Array<string> {
  return Object.keys(tree)
    .filter(function (file) {
      return file.endsWith(".html");
    })
    .sort();
}

function splitClasses(value: string): Array<string> {
  return value.split(/\s+/).filter(function (token) {
    return token !== "";
  });
}

function classesOf(html: string, tag: string): Array<string> {
  const match = new RegExp(`<${tag}\\b[^>]*\\sclass="([^"]*)"`).exec(html);
  assert.ok(match !== null, `no <${tag} class="..."> in:\n${html}`);
  return splitClasses(match[1]);
}

function sorted<T>(values: Iterable<T>): Array<T> {
  return Array.from(values).sort();
}

// Every stylesheet in _astro/, concatenated.
function stylesheetOf(tree: Record<string, string>): string {
  const files = Object.keys(tree).filter(function (file) {
    return path.dirname(file) === "_astro" && file.endsWith(".css");
  });
  assert.ok(files.length > 0, "no _astro/*.css in the build");
  return files
    .map(function (file) {
      return tree[file];
    })
    .join("\n");
}

function selectorClasses(css: string): Set<string> {
  const classes = new Set<string>();
  function visit(node: CssNode): void {
    if (node.type === "ClassSelector" && node.name !== undefined) {
      classes.add(ident.decode(node.name));
    }
    if (node.children) node.children.forEach(visit);
    if (node.prelude) visit(node.prelude);
    if (node.block) visit(node.block);
  }
  visit(parse(css));
  return classes;
}

describe(
  "astro build on the fixture site",
  { skip: endToEndSkip() },
  function () {
    let builds: Builds;
    let report: TransformReport;
    let map: RenameMap;

    before(
      async function () {
        builds = await ensureBuilt();
        report = readJson(path.join(ARTIFACTS, "report.json"));
        map = readJson(path.join(ARTIFACTS, "map.json"));
      },
      { timeout: 600000 },
    );

    // A generated name's source class, or undefined when it is not one.
    function decode(name: string): string | undefined {
      return Object.hasOwn(map.names, name) ? map.names[name] : undefined;
    }

    function isRenamed(name: string): boolean {
      return (
        Object.hasOwn(map.names, name) || Object.hasOwn(map.consolidated, name)
      );
    }

    it("pins the astro version whose Node floor gates this suite", function () {
      const fixture = readJson<{ dependencies: Record<string, string> }>(
        path.join(FIXTURE, "package.json"),
      );
      assert.strictEqual(fixture.dependencies.astro, ASTRO_VERSION);
      const installed = readJson<{
        version: string;
        engines: { node: string };
      }>(path.join(FIXTURE, "node_modules", "astro", "package.json"));
      assert.strictEqual(installed.version, ASTRO_VERSION);
      assert.strictEqual(installed.engines.node, `>=${ASTRO_NODE_FLOOR}`);
    });

    it("puts the first vocabulary words on every page's <html> and <body> (AE1)", function () {
      const vocabulary = readJson<Array<string>>(
        path.join(FIXTURE, "words.json"),
      );
      assert.deepStrictEqual(vocabulary.slice(0, 2), [
        "hopethisfindsyouwell",
        "justbumpingthis",
      ]);
      const pages = pagesOf(builds.on);
      assert.deepStrictEqual(pages, pagesOf(builds.baseline));
      assert.ok(pages.length >= 2, pages.join(", "));
      for (const page of pages) {
        const sourceHtml = classesOf(builds.baseline[page], "html");
        const sourceBody = classesOf(builds.baseline[page], "body");
        assert.deepStrictEqual(sourceHtml, ["scroll-smooth", "antialiased"]);
        const html = classesOf(builds.on[page], "html");
        const body = classesOf(builds.on[page], "body");
        // <html> is the first class-bearing element and <body> the second, so
        // they draw the vocabulary in order.
        assert.deepStrictEqual(
          sorted(html),
          sorted(vocabulary.slice(0, 2)),
          page,
        );
        assert.deepStrictEqual(
          sorted(body),
          sorted(vocabulary.slice(2, 2 + sourceBody.length)),
          page,
        );
        assert.deepStrictEqual(
          sorted(html.map(decode)),
          sorted(sourceHtml),
          page,
        );
        assert.deepStrictEqual(
          sorted(body.map(decode)),
          sorted(sourceBody),
          page,
        );
      }
    });

    it("renames the class:list classes, each with a selector", function () {
      const selectors = selectorClasses(stylesheetOf(builds.on));
      const tones = new Map<string, Array<string>>();
      for (const page of pagesOf(builds.on)) {
        for (const tag of builds.on[page].matchAll(
          /<span\b[^>]*\sdata-badge="([^"]*)"[^>]*>/g,
        )) {
          const value = /\sclass="([^"]*)"/.exec(tag[0]);
          assert.ok(value !== null, tag[0]);
          tones.set(tag[1], splitClasses(value[1]));
        }
      }
      assert.deepStrictEqual(sorted(tones.keys()), ["info", "warn"]);
      for (const [tone, classes] of tones) {
        for (const name of classes) {
          assert.ok(isRenamed(name), `${tone} badge kept ${name}`);
          assert.ok(selectors.has(name), `${tone} badge: no .${name}`);
        }
      }
      // The object-syntax entries render only for their tone.
      assert.ok(tones.get("info")?.map(decode).includes("bg-sky-100"));
      assert.ok(tones.get("warn")?.map(decode).includes("bg-amber-100"));
    });

    it("extracts every stylesheet to _astro/*.css, holding the renamed selectors", function () {
      for (const [label, tree] of [
        ["on", builds.on],
        ["off", builds.off],
      ] as const) {
        for (const page of pagesOf(tree)) {
          assert.ok(!/<style\b/i.test(tree[page]), `${label} ${page} <style>`);
        }
      }
      const selectors = selectorClasses(stylesheetOf(builds.on));
      let used = 0;
      for (const page of pagesOf(builds.on)) {
        for (const attribute of builds.on[page].matchAll(
          /\sclass="([^"]*)"/g,
        )) {
          for (const name of splitClasses(attribute[1])) {
            if (!isRenamed(name)) continue;
            used += 1;
            assert.ok(selectors.has(name), `${page}: no .${name} selector`);
          }
        }
      }
      assert.ok(used > 0);
      for (const entry of report.renames) {
        assert.ok(!selectors.has(entry.token), `.${entry.token} kept in CSS`);
      }
    });

    it("keeps the data-* hooked script's element and selector", function () {
      const page = builds.on["index.html"];
      assert.match(page, /<p\b[^>]*\sdata-follow-up[\s=>]/);
      const scripts = Array.from(
        page.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g),
        function (match) {
          return match[1];
        },
      );
      for (const file of Object.keys(builds.on)) {
        if (file.endsWith(".js")) scripts.push(builds.on[file]);
      }
      assert.ok(
        scripts.some(function (script) {
          return script.includes("[data-follow-up]");
        }),
        "no script queries [data-follow-up]",
      );
    });

    it("builds the no-integration output under MINWIND=off, without artifacts (AE4)", function () {
      assert.deepStrictEqual(
        Object.keys(builds.off).sort(),
        Object.keys(builds.baseline).sort(),
      );
      for (const file of Object.keys(builds.off)) {
        assert.ok(
          builds.off[file] === builds.baseline[file],
          `${file} differs`,
        );
      }
      assert.strictEqual(builds.offWroteArtifacts, false);
    });

    it("reports the renames, and map.json reverses every one", function () {
      assert.ok(report.summary.renamed > 0);
      assert.strictEqual(report.renames.length, report.summary.renamed);
      assert.strictEqual(Object.keys(map.names).length, report.renames.length);
      for (const entry of report.renames) {
        assert.strictEqual(map.names[entry.name], entry.token, entry.name);
      }
    });
  },
);
