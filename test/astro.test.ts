import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { pathToFileURL } from "node:url";
import minwind, {
  type AstroConfigLike,
  type MinwindAstroIntegration,
  type MinwindAstroOptions,
} from "../src/astro.js";
import { compileTailwindStylesheet } from "../src/engines/tailwind.js";
import { hashClassName } from "../src/names.js";

// minwind/astro driven through its hooks with fake hook arguments, in the
// order `astro build` calls them. No Astro build runs here; the built-site
// fixture (U5) covers that. astro:build:done runs the real apply engine on
// a miniature site written to a temp root: the layout and page the pre-pass
// scans, and dist/ as Astro would emit it. The stylesheet is plain CSS in
// the utilities layer, so the pre-pass compiles it without resolving the
// tailwindcss package from the temp root.

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
