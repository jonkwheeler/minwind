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
    srcDir: pathToFileURL(path.join(root, "src") + path.sep),
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
          srcDir: pathToFileURL(path.join(os.tmpdir(), "app") + path.sep),
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

  it("accepts a srcDir other than src/ (AE10)", function () {
    const integration = minwind();
    setup(integration, "build");
    integration.hooks["astro:config:done"]({
      config: configFor(os.tmpdir(), {
        srcDir: pathToFileURL(path.join(os.tmpdir(), "app") + path.sep),
      }),
      buildOutput: "static",
    });
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

describe("custom srcDir (R13)", function () {
  // makeSite's site with its sources under app/ and no src/ directory.
  // cssEntry is relative to app/.
  async function makeAppSite(
    cssEntry: string = path.join("styles", "global.css"),
  ): Promise<string> {
    const root = await makeSite(path.join("src", cssEntry));
    fs.renameSync(path.join(root, "src"), path.join(root, "app"));
    return root;
  }

  function buildFromApp(
    options: MinwindAstroOptions,
    root: string,
  ): Promise<Logs> {
    const integration = minwind(options);
    setup(integration, "build");
    integration.hooks["astro:config:done"]({
      config: configFor(root, {
        srcDir: pathToFileURL(path.join(root, "app") + path.sep),
      }),
      buildOutput: "static",
    });
    return buildDone(integration, root);
  }

  it("renames the classes of app/pages/index.astro and its layout (AE10)", async function () {
    const root = await makeAppSite();
    try {
      const logs = await buildFromApp({ mode: "morph" }, root);
      const html = builtPage(root);
      assert.ok(
        html.includes(
          `<html lang="en" class="${hashClassName("scroll-smooth")}">`,
        ),
        html,
      );
      assert.ok(
        html.includes(
          `<ul class="${hashClassName("flex")} ${hashClassName("flex-col")}">`,
        ),
        html,
      );
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

  it("falls back to app/app.css when app/styles/global.css is absent", async function () {
    const root = await makeAppSite("app.css");
    try {
      await buildFromApp({}, root);
      assert.ok(
        builtPage(root).includes(
          `<html lang="en" class="${hashClassName("scroll-smooth")}">`,
        ),
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("still resolves an explicit cssEntry against the Astro root", async function () {
    const root = await makeAppSite(path.join("styles", "site.css"));
    try {
      await buildFromApp(
        { cssEntry: path.join("app", "styles", "site.css") },
        root,
      );
      assert.ok(
        builtPage(root).includes(
          `<html lang="en" class="${hashClassName("scroll-smooth")}">`,
        ),
      );
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

    describe("table rows, <noscript>, and the stale-class guard (R4, R5)", function () {
      const ABOUT = "about/index.html";

      function renamedTokens(): Set<string> {
        return new Set(
          report.renames.map(function (entry) {
            return entry.token;
          }),
        );
      }

      // The source classes behind built names, a merged name's members
      // included.
      function originalsOf(names: Array<string>): Array<string> {
        return names.flatMap(function (name) {
          if (Object.hasOwn(map.consolidated, name)) {
            return map.consolidated[name];
          }
          return Object.hasOwn(map.names, name) ? [map.names[name]] : [name];
        });
      }

      function decodeEntities(value: string): string {
        return value
          .replace(/&#x([0-9a-f]+);/gi, function (_match, hex: string) {
            return String.fromCodePoint(parseInt(hex, 16));
          })
          .replace(/&#(\d+);/g, function (_match, decimal: string) {
            return String.fromCodePoint(Number(decimal));
          })
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&amp;/g, "&");
      }

      // KTD14's stale-class guard, mirroring GTM Frontier's check 7: the
      // classes an element still wears under an original name the build
      // renamed. The CSS selector carries the new name, so such an element
      // loses its rule. Every start tag counts, including tags a parser
      // would drop or read as text (<noscript> content).
      function staleClasses(html: string): Array<string> {
        const renamed = renamedTokens();
        const stale = new Set<string>();
        const markup = html.replace(
          /<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,
          "",
        );
        for (const tag of markup.matchAll(
          /<[a-z][a-z0-9-]*\b(?:"[^"]*"|'[^']*'|[^"'>])*>/gi,
        )) {
          const value = /\sclass=(["'])(.*?)\1/is.exec(tag[0])?.[2];
          if (value === undefined) continue;
          for (const token of splitClasses(decodeEntities(value))) {
            if (renamed.has(token) && !isRenamed(token)) stale.add(token);
          }
        }
        return sorted(stale);
      }

      it("finds no element wearing a renamed class's original name", function () {
        for (const page of pagesOf(builds.on)) {
          assert.deepStrictEqual(staleClasses(builds.on[page]), [], page);
        }
        // The guard can fire: the no-integration build wears every original.
        assert.ok(
          staleClasses(builds.baseline["index.html"]).includes("scroll-smooth"),
        );
      });

      it("renames a table-row component's classes (AE4)", function () {
        const renamed = renamedTokens();
        for (const tag of ["tr", "th", "td"]) {
          const source = classesOf(builds.baseline[ABOUT], tag);
          const built = classesOf(builds.on[ABOUT], tag);
          for (const name of built) {
            assert.ok(isRenamed(name), `<${tag}> kept ${name}`);
          }
          assert.deepStrictEqual(
            sorted(originalsOf(built)),
            sorted(source),
            tag,
          );
          for (const token of source) {
            assert.ok(renamed.has(token), `${token} is not a rename`);
          }
        }
      });

      it("gives <noscript> markup the name the class has elsewhere (AE5)", function () {
        const textSm = report.renames.find(function (entry) {
          return entry.token === "text-sm";
        });
        assert.ok(textSm !== undefined, "text-sm kept its original name");
        const noscript = /<noscript>([\s\S]*?)<\/noscript>/.exec(
          builds.on[ABOUT],
        );
        assert.ok(noscript !== null, builds.on[ABOUT]);
        assert.deepStrictEqual(classesOf(noscript[1], "p"), [textSm.name]);
        assert.ok(classesOf(builds.on[ABOUT], "nav").includes(textSm.name));
      });
    });

    describe("SiteNav's group marker (R7, KTD7)", function () {
      interface Arm {
        classes: Array<string>;
        text: string;
      }

      // Every selector arm's source text and class names, at any depth.
      function armsOf(css: string): Array<Arm> {
        const arms: Array<Arm> = [];
        function collect(node: CssNode, arm: Arm): void {
          if (node.type === "ClassSelector" && node.name !== undefined) {
            arm.classes.push(ident.decode(node.name));
          }
          if (node.children) {
            node.children.forEach(function (child) {
              collect(child, arm);
            });
          }
        }
        function visit(node: CssNode): void {
          if (node.type === "Rule" && node.prelude?.type === "SelectorList") {
            node.prelude.children?.forEach(function (selector) {
              const arm: Arm = {
                classes: [],
                text: css.slice(
                  selector.loc?.start.offset,
                  selector.loc?.end.offset,
                ),
              };
              collect(selector, arm);
              arms.push(arm);
            });
          }
          if (node.children) node.children.forEach(visit);
          if (node.block) visit(node.block);
        }
        visit(parse(css, { positions: true }));
        return arms;
      }

      function original(name: string): string {
        return decode(name) ?? name;
      }

      it("keeps the marker and its variant together, and the variant's selector matches", function () {
        const arms = armsOf(stylesheetOf(builds.on));
        const pages = pagesOf(builds.on);
        assert.ok(pages.length >= 2, pages.join(", "));
        for (const page of pages) {
          const html = builds.on[page];
          assert.match(html, /<div\b[^>]*\srole="group"/, page);
          const current = Array.from(
            html.matchAll(
              /<a\b([^>]*\saria-current="page"[^>]*)>\s*<span class="([^"]*)">/g,
            ),
          );
          assert.strictEqual(current.length, 1, `${page}: one current link`);
          const anchor = /\sclass="([^"]*)"/.exec(current[0][1]);
          assert.ok(anchor !== null, current[0][0]);
          const marker = splitClasses(anchor[1]).find(function (name) {
            return original(name) === "group";
          });
          assert.ok(marker !== undefined, current[0][0]);
          const variant = current[0][2];
          assert.strictEqual(
            original(variant),
            "group-aria-[current=page]:underline",
          );
          // Renamed together or kept together, never split.
          assert.strictEqual(
            isRenamed(marker),
            isRenamed(variant),
            `${page}: ${marker} and ${variant}`,
          );
          assert.ok(
            arms.some(function (arm) {
              return (
                sorted(new Set(arm.classes)).join(" ") ===
                  sorted([marker, variant]).join(" ") &&
                /\[aria-current="?page"?\]/.test(arm.text)
              );
            }),
            `${page}: no .${variant} arm compounding .${marker}[aria-current]`,
          );
        }
      });
    });

    describe("expression markup (R1, R2)", function () {
      interface ClassedTag {
        tag: string;
        classes: Array<string>;
      }

      // The class-bearing start tags inside ReplyList's <section>, in order.
      function replyListTags(html: string): Array<ClassedTag> {
        const section = /<section data-replies>([\s\S]*?)<\/section>/.exec(
          html,
        );
        assert.ok(section !== null, html);
        const tags: Array<ClassedTag> = [];
        for (const tag of section[1].matchAll(/<([a-z]+)\b[^>]*>/g)) {
          const value = /\sclass="([^"]*)"/.exec(tag[0]);
          if (value !== null) {
            tags.push({ tag: tag[1], classes: splitClasses(value[1]) });
          }
        }
        return tags;
      }

      // The source classes behind built names, a merged name's members
      // included.
      function originalsOf(names: Array<string>): Array<string> {
        return names.flatMap(function (name) {
          if (Object.hasOwn(map.consolidated, name)) {
            return map.consolidated[name];
          }
          return Object.hasOwn(map.names, name) ? [map.names[name]] : [name];
        });
      }

      it("renames ReplyList's mapped, conditional, and void-element classes (AE1, AE2)", function () {
        const source = replyListTags(builds.baseline["index.html"]);
        assert.deepStrictEqual(source, [
          { tag: "li", classes: ["px-4", "py-2"] },
          { tag: "li", classes: ["px-4", "py-2"] },
          { tag: "p", classes: ["mt-3", "text-emerald-700"] },
          { tag: "p", classes: ["mt-2", "text-stone-500"] },
          { tag: "img", classes: ["size-8"] },
        ]);
        const renamed = new Set(
          report.renames.map(function (entry) {
            return entry.token;
          }),
        );
        const built = replyListTags(builds.on["index.html"]);
        assert.deepStrictEqual(
          built.map(function (entry) {
            return entry.tag;
          }),
          source.map(function (entry) {
            return entry.tag;
          }),
        );
        for (let i = 0; i < built.length; i += 1) {
          const { tag, classes } = built[i];
          for (const name of classes) {
            assert.ok(isRenamed(name), `<${tag}> kept ${name}`);
          }
          assert.deepStrictEqual(
            sorted(originalsOf(classes)),
            sorted(source[i].classes),
            tag,
          );
          for (const token of source[i].classes) {
            assert.ok(renamed.has(token), `${token} is not a rename`);
          }
        }
      });

      it("reaches size-8 only through the unclosed <img> in an expression", function () {
        const sources = readTree(path.join(FIXTURE, "src"));
        const uses = Object.keys(sources).filter(function (file) {
          return /\bsize-8\b/.test(sources[file]);
        });
        assert.deepStrictEqual(uses, ["components/ReplyList.astro"]);
        assert.strictEqual(
          sources["components/ReplyList.astro"].match(/\bsize-8\b/g)?.length,
          1,
        );
      });
    });

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

    it("gives every class on every page a selector, a merged class prop's included", function () {
      const selectors = selectorClasses(stylesheetOf(builds.on));
      for (const page of pagesOf(builds.on)) {
        for (const attribute of builds.on[page].matchAll(
          /\sclass="([^"]*)"/g,
        )) {
          for (const name of splitClasses(attribute[1])) {
            assert.ok(selectors.has(name), `${page}: no .${name} selector`);
          }
        }
      }
      // <Card class="flex-col gap-2"> renders the card's own class plus the
      // two it merges, a list no source file spells out.
      const page = builds.on["index.html"];
      const card = /<div\b[^>]*\sdata-card\b[^>]*>/.exec(page);
      assert.ok(card !== null, page);
      const classes = classesOf(card[0], "div");
      assert.deepStrictEqual(sorted(classes.map(decode)), [
        "flex-col",
        "gap-2",
        "rounded-lg",
      ]);
      for (const name of classes) {
        assert.ok(selectors.has(name), `card: no .${name} selector`);
      }
      // The same list written out on both sections still merges into one
      // shared rule.
      const merged = Object.keys(map.consolidated).filter(function (name) {
        return sorted(map.consolidated[name]).join(" ") === "flex-col gap-2";
      });
      assert.strictEqual(merged.length, 1, JSON.stringify(map.consolidated));
      assert.strictEqual(
        page.split(`<section class="${merged[0]}">`).length - 1,
        2,
        page,
      );
      assert.ok(selectors.has(merged[0]), `no .${merged[0]} selector`);
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

    describe("frontmatter class constants (R3)", function () {
      const ABOUT = "about/index.html";
      // Panel.astro's class constants, as the fixture writes them.
      const PANEL_CONSTANTS = [
        "rounded-xl border-dashed p-6",
        "text-lg tracking-wide",
        "italic leading-snug",
        "ring-1 ring-sky-300",
      ];

      interface ClassedTag {
        tag: string;
        classes: Array<string>;
      }

      // Panel's <section> and the class-bearing start tags inside it, in
      // order.
      function panelTags(html: string): Array<ClassedTag> {
        const section =
          /<section\b[^>]*\sdata-panel\b[^>]*>[\s\S]*?<\/section>/.exec(html);
        assert.ok(section !== null, html);
        const tags: Array<ClassedTag> = [];
        for (const tag of section[0].matchAll(/<([a-z0-9]+)\b[^>]*>/g)) {
          const value = /\sclass="([^"]*)"/.exec(tag[0]);
          if (value !== null) {
            tags.push({ tag: tag[1], classes: splitClasses(value[1]) });
          }
        }
        return tags;
      }

      function originalsOf(names: Array<string>): Array<string> {
        return names.flatMap(function (name) {
          if (Object.hasOwn(map.consolidated, name)) {
            return map.consolidated[name];
          }
          return Object.hasOwn(map.names, name) ? [map.names[name]] : [name];
        });
      }

      it("renames the classes Panel holds in frontmatter constants (AE3)", function () {
        const source = panelTags(builds.baseline[ABOUT]);
        assert.deepStrictEqual(source, [
          { tag: "section", classes: ["rounded-xl", "border-dashed", "p-6"] },
          { tag: "h2", classes: ["text-lg", "tracking-wide", "uppercase"] },
          { tag: "p", classes: ["italic", "leading-snug"] },
          { tag: "p", classes: ["italic", "leading-snug"] },
          { tag: "div", classes: ["rounded-lg", "ring-1", "ring-sky-300"] },
        ]);
        const renamed = new Set(
          report.renames.map(function (entry) {
            return entry.token;
          }),
        );
        const built = panelTags(builds.on[ABOUT]);
        assert.deepStrictEqual(
          built.map(function (entry) {
            return entry.tag;
          }),
          source.map(function (entry) {
            return entry.tag;
          }),
        );
        for (let i = 0; i < built.length; i += 1) {
          const { tag, classes } = built[i];
          for (const name of classes) {
            assert.ok(isRenamed(name), `<${tag}> kept ${name}`);
          }
          assert.deepStrictEqual(
            sorted(originalsOf(classes)),
            sorted(source[i].classes),
            tag,
          );
        }
        for (const literal of PANEL_CONSTANTS) {
          for (const token of literal.split(" ")) {
            assert.ok(renamed.has(token), `${token} is not a rename`);
          }
        }
      });

      it("reaches those classes only through Panel's constants", function () {
        const sources = readTree(path.join(FIXTURE, "src"));
        for (const literal of PANEL_CONSTANTS) {
          for (const token of literal.split(" ")) {
            const word = `(?<![\\w-])${token}(?![\\w-])`;
            const uses = Object.keys(sources).filter(function (file) {
              return new RegExp(word).test(sources[file]);
            });
            assert.deepStrictEqual(uses, ["components/Panel.astro"], token);
            assert.strictEqual(
              sources["components/Panel.astro"].match(new RegExp(word, "g"))
                ?.length,
              1,
              token,
            );
          }
        }
        const panel = sources["components/Panel.astro"];
        for (const literal of PANEL_CONSTANTS) {
          assert.match(panel, new RegExp(`\\nconst \\w+ = "${literal}";\\n`));
        }
      });
    });

    describe("entity-encoded classes (R6)", function () {
      const ABOUT = "about/index.html";

      // The raw class values of Prose's wrapper and list, in order.
      function proseClassValues(html: string): Array<string> {
        const prose =
          /<div data-prose class="([^"]*)">[\s\S]*?<ul class="([^"]*)">/.exec(
            html,
          );
        assert.ok(prose !== null, html);
        return [prose[1], prose[2]];
      }

      it("renames Prose's encoded classes, each with a selector (AE6)", function () {
        // Astro writes `&` as an entity, statically and through class:list.
        assert.deepStrictEqual(proseClassValues(builds.baseline[ABOUT]), [
          "[&amp;_a]:underline",
          "[&amp;>li]:mt-2",
        ]);
        const built = proseClassValues(builds.on[ABOUT]);
        assert.deepStrictEqual(built.map(decode), [
          "[&_a]:underline",
          "[&>li]:mt-2",
        ]);
        const selectors = selectorClasses(stylesheetOf(builds.on));
        for (const name of built) {
          assert.ok(selectors.has(name), `no .${name} selector`);
        }
      });
    });

    describe("prose and keyword attributes (R8, AE8)", function () {
      const SPELLED = ["grid", "flex", "group"];
      const VARIANT = "group-aria-[current=page]:underline";

      it("renames the utilities that prose and a role value spell", function () {
        // About's prose spells grid and flex, and SiteNav's wrapper has
        // role="group" on every page.
        const prose = builds.baseline["about/index.html"].replace(/\s+/g, " ");
        assert.match(
          prose,
          /<p\b[^>]*>[^<]* a grid, [^<]* a flex row\.\s*<\/p>/,
        );
        const renamed = new Set(
          report.renames.map(function (entry) {
            return entry.token;
          }),
        );
        for (const token of [...SPELLED, VARIANT]) {
          assert.ok(renamed.has(token), `${token} kept its original name`);
        }
        assert.deepStrictEqual(
          report.exclusions.filter(function (entry) {
            return [...SPELLED, VARIANT].includes(entry.token);
          }),
          [],
        );
      });

      it("renames SiteNav's group marker and its variant together on every page", function () {
        const pages = pagesOf(builds.on);
        assert.ok(pages.length >= 2, pages.join(", "));
        for (const page of pages) {
          const html = builds.on[page];
          assert.match(html, /<div\b[^>]*\srole="group"/, page);
          const current =
            /<a\b[^>]*\sclass="([^"]*)"[^>]*\saria-current="page"[^>]*>\s*<span class="([^"]*)">/.exec(
              html,
            );
          assert.ok(current !== null, page);
          assert.ok(
            splitClasses(current[1]).map(decode).includes("group"),
            `${page}: ${current[1]}`,
          );
          assert.strictEqual(decode(current[2]), VARIANT, page);
        }
      });
    });

    // R16 (KTD15): Toggle reaches lowercase only through an identifier key
    // in its class:list object, which 1.1.0 never read.
    describe("class-composition object keys (R16)", function () {
      function toggleClasses(html: string): Array<string> {
        const tag = /<button\b[^>]*\sdata-toggle\b[^>]*>/.exec(html);
        assert.ok(tag !== null, "no <button data-toggle>");
        const value = /\sclass="([^"]*)"/.exec(tag[0]);
        assert.ok(value !== null, tag[0]);
        return splitClasses(value[1]);
      }

      it("renames Toggle's class:list key, with a selector in _astro/*.css", function () {
        assert.deepStrictEqual(toggleClasses(builds.baseline["index.html"]), [
          "px-2",
          "lowercase",
        ]);
        const built = toggleClasses(builds.on["index.html"]);
        const selectors = selectorClasses(stylesheetOf(builds.on));
        for (const name of built) {
          assert.ok(isRenamed(name), `<button> kept ${name}`);
          assert.ok(selectors.has(name), `no .${name} selector`);
        }
        assert.deepStrictEqual(sorted(built.map(decode)), [
          "lowercase",
          "px-2",
        ]);
        assert.ok(
          report.renames.some(function (entry) {
            return entry.token === "lowercase";
          }),
        );
      });

      it("reaches lowercase only through Toggle's object key", function () {
        const sources = readTree(path.join(FIXTURE, "src"));
        const uses = Object.keys(sources).filter(function (file) {
          return /\blowercase\b/.test(sources[file]);
        });
        assert.deepStrictEqual(uses, ["components/Toggle.astro"]);
        assert.match(
          sources["components/Toggle.astro"],
          /class:list=\{\["px-2", \{ lowercase: on \}\]\}/,
        );
      });
    });

    // R17 (KTD16): Disclosure's script selects its panel with a ".hidden"
    // selector string, and no other file spells hidden.
    describe("selector strings (R17, AE12)", function () {
      const ABOUT = "about/index.html";
      const SELECTOR = "[data-disclosure] > .hidden";

      function panelClasses(html: string): Array<string> {
        const disclosure =
          /<div\b[^>]*\sdata-disclosure\b[^>]*>([\s\S]*?)<\/div>/.exec(html);
        assert.ok(disclosure !== null, "no <div data-disclosure>");
        return classesOf(disclosure[1], "p");
      }

      it("keeps Disclosure's class original in the markup, the stylesheet, and the script (AE12)", function () {
        assert.deepStrictEqual(panelClasses(builds.baseline[ABOUT]), [
          "hidden",
        ]);
        assert.deepStrictEqual(panelClasses(builds.on[ABOUT]), ["hidden"]);
        assert.ok(selectorClasses(stylesheetOf(builds.on)).has("hidden"));
        const scripts = Array.from(
          builds.on[ABOUT].matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g),
          function (match) {
            return match[1];
          },
        );
        for (const file of Object.keys(builds.on)) {
          if (file.endsWith(".js")) scripts.push(builds.on[file]);
        }
        assert.ok(
          scripts.some(function (script) {
            return script.includes(SELECTOR);
          }),
          `no script selects ${SELECTOR}`,
        );
        assert.ok(
          !report.renames.some(function (entry) {
            return entry.token === "hidden";
          }),
        );
        assert.deepStrictEqual(
          report.exclusions.filter(function (entry) {
            return entry.token === "hidden";
          }),
          [{ token: "hidden", reason: "runtime-context" }],
        );
      });

      it("reaches hidden only through Disclosure's markup and selector string", function () {
        const sources = readTree(path.join(FIXTURE, "src"));
        const uses = Object.keys(sources).filter(function (file) {
          return /\bhidden\b/.test(sources[file]);
        });
        assert.deepStrictEqual(uses, ["components/Disclosure.astro"]);
        const disclosure = sources["components/Disclosure.astro"];
        assert.ok(disclosure.includes('<p class="hidden">'), disclosure);
        assert.ok(disclosure.includes(`"${SELECTOR}"`), disclosure);
      });
    });
  },
);

// KTD7 on the Astro route: GTM Frontier's nav marks the current page's link
// with a group variant, and a data-* hook spells the marker in an attribute
// minwind cannot rewrite. The marker keeps its name, and the variant
// compounding it keeps its name too, logged on a line of its own.
const NAV_STYLESHEET = `@layer utilities {
  .flex { display: flex; }
  .group-aria-\\[current\\=page\\]\\:underline:is(:where(.group)[aria-current="page"] *) { text-decoration-line: underline; }
}
`;

const NAV_MARKUP =
  '<nav class="flex"><div data-active-class="group">' +
  '<a href="/" class="group" aria-current="page">' +
  '<span class="group-aria-[current=page]:underline">Inbox</span>' +
  "</a></div></nav>";

describe("astro:build:done dependent variants (R7, KTD7)", function () {
  it("logs a kept marker's dependents apart from the unrewritable classes", async function () {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "minwind-astro-nav-"));
    try {
      const cssEntry = path.join("src", "styles", "global.css");
      writeFile(root, cssEntry, NAV_STYLESHEET);
      writeFile(root, path.join("src", "pages", "index.astro"), NAV_MARKUP);
      const compiled = await compileTailwindStylesheet({
        cssEntry: path.join(root, cssEntry),
        root,
      });
      writeFile(
        root,
        path.join("dist", "_astro", "index.css"),
        compiled.stylesheet,
      );
      writeFile(
        root,
        path.join("dist", "index.html"),
        "<!DOCTYPE html><html><head>" +
          '<link rel="stylesheet" href="/_astro/index.css"></head>' +
          `<body>${NAV_MARKUP}</body></html>`,
      );
      const logs = await build({}, root);
      const kept = logs.info.filter(function (line) {
        return line.includes("kept original");
      });
      assert.strictEqual(kept.length, 2, logs.info.join("\n"));
      assert.match(kept[0], /cannot rewrite/);
      assert.match(kept[0], /: group$/);
      assert.match(kept[1], /depends on a class kept original/);
      assert.ok(
        kept[1].endsWith(": group-aria-[current=page]:underline"),
        kept[1],
      );
      const page = builtPage(root);
      assert.ok(page.includes('class="group"'), page);
      assert.ok(
        page.includes('<span class="group-aria-[current=page]:underline">'),
        page,
      );
      assert.ok(page.includes(`<nav class="${hashClassName("flex")}">`), page);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
