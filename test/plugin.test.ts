import assert from "node:assert";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { build, type Plugin } from "vite";
import { hashClassName } from "../src/names.js";
import { resolveFlags, minwind } from "../src/plugin.js";
import {
  writeArtifacts,
  type RenameMap,
  type TransformReport,
} from "../src/report.js";

// U6 plugin wiring (R4, R8, R9, R11; KTD1, KTD7, KTD9). The fixture site is a
// minimal app whose emitted.css mimics Lightning-CSS-minified Tailwind v4
// output for exactly the classes its sources use, so the buildStart pre-pass
// (real Tailwind compile of src/app.css) and the bundle-time CSS pass agree.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(HERE, "fixtures", "plugin-site");
const CSS_ENTRY = path.join(FIXTURE, "src", "app.css");
const ARTIFACT_DIR = path.join(FIXTURE, ".output", "minwind");

const CONSOLIDATED_NAME = hashClassName("flex items-center p-4");
const FLEX = hashClassName("flex");
const FLEX_COL = hashClassName("flex-col");
const ITEMS_CENTER = hashClassName("items-center");
const P_4 = hashClassName("p-4");
const FADE_IN = hashClassName("fade-in");
const SITE_CARD = hashClassName("site-card");

const FLAG_NAMES = ["MINWIND", "MINWIND_RENAME", "MINWIND_CONSOLIDATE"];

function clearFlags(): void {
  for (const name of FLAG_NAMES) delete process.env[name];
}

// Runs fn with the given flags set, restoring the environment afterwards.
// Tests in this file run sequentially (node:test default), so env mutation
// stays local to each test.
async function withFlags(
  flags: Record<string, string>,
  fn: () => Promise<void> | void,
): Promise<void> {
  const saved = new Map<string, string | undefined>();
  for (const name of FLAG_NAMES) saved.set(name, process.env[name]);
  clearFlags();
  for (const [name, value] of Object.entries(flags)) {
    process.env[name] = value;
  }
  try {
    await fn();
  } finally {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

async function cleanOutputs(): Promise<void> {
  await rm(path.join(FIXTURE, ".output"), { recursive: true, force: true });
  for (const entry of await readdir(FIXTURE)) {
    if (entry.startsWith("dist")) {
      await rm(path.join(FIXTURE, entry), { recursive: true, force: true });
    }
  }
}

// All bytes of a build output directory, keyed by POSIX relative path.
async function readOutputTree(dir: string): Promise<Map<string, Buffer>> {
  const files = new Map<string, Buffer>();
  async function walk(current: string): Promise<void> {
    for (const entry of await readdir(current)) {
      const full = path.join(current, entry);
      if ((await stat(full)).isDirectory()) await walk(full);
      else {
        const relative = path.relative(dir, full).split(path.sep).join("/");
        files.set(relative, await readFile(full));
      }
    }
  }
  await walk(dir);
  return files;
}

function findFile(
  files: Map<string, Buffer>,
  pattern: RegExp,
): { name: string; text: string } {
  for (const [name, bytes] of files) {
    if (pattern.test(name)) return { name, text: bytes.toString("utf8") };
  }
  throw new Error(`no output file matching ${pattern}`);
}

async function buildFixture(
  outDirName: string,
  plugins: Array<Plugin>,
): Promise<Map<string, Buffer>> {
  const outDir = path.join(FIXTURE, outDirName);
  await build({
    root: FIXTURE,
    logLevel: "silent",
    plugins,
    build: {
      outDir,
      emptyOutDir: true,
      rollupOptions: { input: path.join(FIXTURE, "index.html") },
    },
  });
  return readOutputTree(outDir);
}

function assertSameOutputs(
  left: Map<string, Buffer>,
  right: Map<string, Buffer>,
): void {
  assert.deepStrictEqual(
    Array.from(left.keys()).sort(),
    Array.from(right.keys()).sort(),
    "output file lists must match",
  );
  for (const [name, bytes] of left) {
    const other = right.get(name);
    assert.ok(other !== undefined, `${name} missing from comparison build`);
    assert.ok(bytes.equals(other), `${name} must be byte-identical`);
  }
}

interface MockContext {
  warnings: Array<string>;
  context: {
    warn: (message: unknown) => void;
    error: (message: unknown) => never;
  };
}

function mockContext(): MockContext {
  const warnings: Array<string> = [];
  return {
    warnings,
    context: {
      warn: function (message: unknown): void {
        warnings.push(typeof message === "string" ? message : String(message));
      },
      error: function (message: unknown): never {
        throw new Error(
          typeof message === "string"
            ? message
            : message instanceof Error
              ? message.message
              : String(message),
        );
      },
    },
  };
}

function findHook(
  plugins: ReadonlyArray<Plugin>,
  name: string,
): Record<string, unknown> {
  const plugin = plugins.find(function (candidate) {
    return candidate.name === name;
  });
  assert.ok(plugin !== undefined, `plugin "${name}" must exist`);
  return plugin as unknown as Record<string, unknown>;
}

interface MockLifecycleResult {
  jsOutputs: Array<string>;
  cssOutputs: Array<string>;
  warnings: Array<string>;
}

// Drives one simulated router build (KTD9): buildStart -> per-module
// transform -> generateBundle -> closeBundle, against the given plugin pair.
// Modules/css are only fed when the simulated router would see them.
async function driveLifecycle(
  plugins: ReadonlyArray<Plugin>,
  options: {
    withModules: boolean;
    withCss: boolean;
    cssText?: string;
    extraModule?: { id: string; code: string };
  },
): Promise<MockLifecycleResult> {
  const source = findHook(plugins, "minwind:source");
  const cssPlugin = findHook(plugins, "minwind:css");
  const mock = mockContext();

  const buildStart = source.buildStart as (
    this: unknown,
    options: unknown,
  ) => Promise<void>;
  await buildStart.call(mock.context, {});

  const jsOutputs: Array<string> = [];
  if (options.withModules) {
    const transform = source.transform as (
      this: unknown,
      code: string,
      id: string,
    ) => unknown;
    for (const file of ["a.tsx", "b.tsx", "c.ts", "render.tsx"]) {
      const id = path.join(FIXTURE, "src", file);
      const code = await readFile(id, "utf8");
      const result = (await transform.call(mock.context, code, id)) as {
        code: string;
      } | null;
      if (result !== null) jsOutputs.push(result.code);
    }
    if (options.extraModule !== undefined) {
      const result = (await transform.call(
        mock.context,
        options.extraModule.code,
        options.extraModule.id,
      )) as { code: string } | null;
      if (result !== null) jsOutputs.push(result.code);
    }
  }

  const cssOutputs: Array<string> = [];
  if (options.withCss) {
    const generateBundle = cssPlugin.generateBundle as (
      this: unknown,
      options: unknown,
      bundle: Record<string, unknown>,
    ) => unknown;
    const bundle: Record<string, unknown> = {
      "assets/app.css": {
        type: "asset",
        fileName: "assets/app.css",
        source:
          options.cssText ??
          (await readFile(path.join(FIXTURE, "src", "emitted.css"), "utf8")),
      },
    };
    await generateBundle.call(mock.context, {}, bundle);
    const asset = bundle["assets/app.css"] as { source: string };
    cssOutputs.push(asset.source);
  }

  for (const plugin of [source, cssPlugin]) {
    const closeBundle = plugin.closeBundle as
      ((this: unknown) => unknown) | undefined;
    if (closeBundle !== undefined) await closeBundle.call(mock.context);
  }

  return { jsOutputs, cssOutputs, warnings: mock.warnings };
}

describe("resolveFlags (R9)", function () {
  it("defaults to fully on when no flags are set", async function () {
    await withFlags({}, function () {
      assert.deepStrictEqual(resolveFlags(), {
        enabled: true,
        consolidate: true,
      });
    });
  });

  it("MINWIND=off disables everything", async function () {
    await withFlags({ MINWIND: "off" }, function () {
      assert.deepStrictEqual(resolveFlags(), {
        enabled: false,
        consolidate: false,
      });
    });
  });

  it("MINWIND_RENAME=off disables rename and consolidation", async function () {
    await withFlags({ MINWIND_RENAME: "off" }, function () {
      assert.deepStrictEqual(resolveFlags(), {
        enabled: false,
        consolidate: false,
      });
    });
  });

  it("MINWIND_CONSOLIDATE=off keeps rename on and consolidation off", async function () {
    await withFlags({ MINWIND_CONSOLIDATE: "off" }, function () {
      assert.deepStrictEqual(resolveFlags(), {
        enabled: true,
        consolidate: false,
      });
    });
  });

  it("fails fast on a value outside the supported set", async function () {
    await withFlags({ MINWIND: "1" }, function () {
      assert.throws(function () {
        resolveFlags();
      }, /MINWIND.*"1".*(on|off)/);
    });
    await withFlags({ MINWIND_RENAME: "yes" }, function () {
      assert.throws(function () {
        resolveFlags();
      }, /MINWIND_RENAME/);
    });
    await withFlags({ MINWIND_CONSOLIDATE: "disabled" }, function () {
      assert.throws(function () {
        resolveFlags();
      }, /MINWIND_CONSOLIDATE/);
    });
  });

  it("fails fast when consolidation is explicitly on but rename is off", async function () {
    await withFlags(
      { MINWIND_RENAME: "off", MINWIND_CONSOLIDATE: "on" },
      function () {
        assert.throws(function () {
          resolveFlags();
        }, /MINWIND_CONSOLIDATE=on.*MINWIND_RENAME/);
      },
    );
  });
});

describe("minwind plugin shape (R4, R9)", function () {
  it("returns a pre source plugin and a post CSS plugin, both build-only", async function () {
    await withFlags({}, function () {
      const plugins = minwind({ root: FIXTURE, cssEntry: CSS_ENTRY });
      assert.strictEqual(plugins.length, 2);
      const [source, css] = plugins;
      assert.strictEqual(source.name, "minwind:source");
      assert.strictEqual(source.enforce, "pre");
      assert.strictEqual(source.apply, "build");
      assert.strictEqual(css.name, "minwind:css");
      assert.strictEqual(css.enforce, "post");
      assert.strictEqual(css.apply, "build");
    });
  });

  it("no-ops when hooks run without a build (dev never calls them)", async function () {
    await withFlags({}, async function () {
      const plugins = minwind({ root: FIXTURE, cssEntry: CSS_ENTRY });
      const source = findHook(plugins, "minwind:source");
      const cssPlugin = findHook(plugins, "minwind:css");
      const mock = mockContext();
      const transform = source.transform as (
        this: unknown,
        code: string,
        id: string,
      ) => unknown;
      assert.strictEqual(
        await transform.call(mock.context, "const x = 1\n", "/site/src/x.ts"),
        null,
      );
      const generateBundle = cssPlugin.generateBundle as (
        this: unknown,
        options: unknown,
        bundle: Record<string, unknown>,
      ) => unknown;
      const bundle: Record<string, unknown> = {
        "app.css": { type: "asset", fileName: "app.css", source: ".a{}" },
      };
      await generateBundle.call(mock.context, {}, bundle);
      assert.strictEqual(
        (bundle["app.css"] as { source: string }).source,
        ".a{}",
      );
      const closeBundle = source.closeBundle as (this: unknown) => unknown;
      await closeBundle.call(mock.context);
    });
  });
});

describe("minwind production build (R1, R3, R8, R11)", function () {
  it("renames modules and CSS, consolidates, and writes artifacts", async function () {
    await withFlags({}, async function () {
      await cleanOutputs();
      const files = await buildFixture("dist-on", [
        ...minwind({ root: FIXTURE, cssEntry: CSS_ENTRY }),
      ]);

      const js = findFile(files, /assets\/.*\.js$/);
      // The repeated list collapses to the consolidated name in all three
      // class="flex items-center p-4" usage sites.
      const occurrences = js.text.split(CONSOLIDATED_NAME).length - 1;
      assert.ok(
        occurrences === 3,
        `expected the consolidated name 3 times in the bundle, got ${occurrences}`,
      );
      assert.ok(!js.text.includes("items-center"));
      assert.ok(!js.text.includes("fade-in"));
      assert.ok(!js.text.includes("site-card"));
      assert.ok(!js.text.includes("flex-col"));
      assert.ok(
        js.text.includes(FLEX_COL) &&
          js.text.includes(FADE_IN) &&
          js.text.includes(SITE_CARD),
        "renamed singleton classes must appear in the bundle",
      );

      const cssFile = findFile(files, /assets\/.*\.css$/);
      assert.ok(
        cssFile.text.includes(`.${CONSOLIDATED_NAME}{`),
        "shared consolidated rule must exist",
      );
      // The three member rules merged away; the shared rule carries their
      // declarations at the earliest member position.
      assert.ok(
        cssFile.text.includes(
          `.${CONSOLIDATED_NAME}{display:flex;align-items:center;padding:1rem}`,
        ),
      );
      assert.ok(!cssFile.text.includes(".flex{"));
      assert.ok(!cssFile.text.includes(".items-center{"));
      assert.ok(!cssFile.text.includes(".p-4{"));
      assert.ok(cssFile.text.includes(`.${FLEX_COL}{flex-direction:column}`));
      assert.ok(cssFile.text.includes(`.${SITE_CARD}{border:1px solid}`));
      // css-only-class is not in source: excluded, byte-identical (R5).
      assert.ok(cssFile.text.includes(".css-only-class{color:red}"));

      const report = JSON.parse(
        await readFile(path.join(ARTIFACT_DIR, "report.json"), "utf8"),
      );
      assert.deepStrictEqual(report.flags, {
        enabled: true,
        consolidate: true,
      });
      assert.deepStrictEqual(
        report.renames.map(function (entry: { token: string }) {
          return entry.token;
        }),
        ["fade-in", "flex", "flex-col", "items-center", "p-4", "site-card"],
      );
      for (const entry of report.renames) {
        assert.strictEqual(entry.name, hashClassName(entry.token));
      }
      assert.deepStrictEqual(report.exclusions, [
        { token: "css-only-class", reason: "css-only" },
      ]);
      assert.deepStrictEqual(report.warnings, []);
      // a.tsx, b.tsx, and render.tsx each use the list once.
      assert.deepStrictEqual(report.consolidation.verdicts, [
        {
          tokens: ["flex", "items-center", "p-4"],
          frequency: 3,
          safe: true,
          name: CONSOLIDATED_NAME,
        },
      ]);
      assert.deepStrictEqual(report.summary, {
        renamed: 6,
        excluded: 1,
        consolidatedRules: 1,
        warnings: 0,
      });

      const map = JSON.parse(
        await readFile(path.join(ARTIFACT_DIR, "map.json"), "utf8"),
      );
      assert.deepStrictEqual(map.names, {
        [FADE_IN]: "fade-in",
        [FLEX]: "flex",
        [FLEX_COL]: "flex-col",
        [ITEMS_CENTER]: "items-center",
        [P_4]: "p-4",
        [SITE_CARD]: "site-card",
      });
      assert.deepStrictEqual(map.consolidated, {
        [CONSOLIDATED_NAME]: ["flex", "items-center", "p-4"],
      });

      await cleanOutputs();
    });
  });

  it("produces byte-identical output to a plugin-free build when MINWIND=off (AE5)", async function () {
    await withFlags({ MINWIND: "off" }, async function () {
      await cleanOutputs();
      const bare = await buildFixture("dist-bare", []);
      const disabled = await buildFixture("dist-off", [
        ...minwind({ root: FIXTURE, cssEntry: CSS_ENTRY }),
      ]);
      assertSameOutputs(bare, disabled);
      const artifactExists = await stat(ARTIFACT_DIR).then(
        function () {
          return true;
        },
        function () {
          return false;
        },
      );
      assert.ok(!artifactExists, "a disabled transform writes no artifacts");
      await cleanOutputs();
    });
  });

  it("produces byte-identical output to a plugin-free build when MINWIND_RENAME=off", async function () {
    await withFlags({ MINWIND_RENAME: "off" }, async function () {
      await cleanOutputs();
      const bare = await buildFixture("dist-bare", []);
      const disabled = await buildFixture("dist-off", [
        ...minwind({ root: FIXTURE, cssEntry: CSS_ENTRY }),
      ]);
      assertSameOutputs(bare, disabled);
      await cleanOutputs();
    });
  });

  it("renames without consolidating when MINWIND_CONSOLIDATE=off", async function () {
    await withFlags({ MINWIND_CONSOLIDATE: "off" }, async function () {
      await cleanOutputs();
      const files = await buildFixture("dist-noconsol", [
        ...minwind({ root: FIXTURE, cssEntry: CSS_ENTRY }),
      ]);

      const js = findFile(files, /assets\/.*\.js$/);
      assert.ok(
        js.text.includes(`${FLEX} ${ITEMS_CENTER} ${P_4}`),
        "the repeated list keeps per-token renames",
      );
      assert.ok(!js.text.includes(CONSOLIDATED_NAME));

      const cssFile = findFile(files, /assets\/.*\.css$/);
      assert.ok(cssFile.text.includes(`.${FLEX}{display:flex}`));
      assert.ok(cssFile.text.includes(`.${ITEMS_CENTER}{align-items:center}`));
      assert.ok(cssFile.text.includes(`.${P_4}{padding:1rem}`));
      assert.ok(!cssFile.text.includes(CONSOLIDATED_NAME));

      const report = JSON.parse(
        await readFile(path.join(ARTIFACT_DIR, "report.json"), "utf8"),
      );
      assert.deepStrictEqual(report.flags, {
        enabled: true,
        consolidate: false,
      });
      assert.deepStrictEqual(report.consolidation.verdicts, []);
      assert.strictEqual(report.summary.consolidatedRules, 0);

      await cleanOutputs();
    });
  });
});

describe("minwind owned custom properties", function () {
  it("wires one property registry through source, CSS, report, and map", async function () {
    await withFlags({}, async function () {
      await cleanOutputs();
      const plugins = minwind({
        root: FIXTURE,
        cssEntry: CSS_ENTRY,
        customProperties: { owned: ["--fixture-accent"] },
      });
      const result = await driveLifecycle(plugins, {
        withModules: true,
        withCss: true,
        extraModule: {
          id: path.join(FIXTURE, "src", "custom-property-runtime.ts"),
          code: `element.style.setProperty("--fixture-accent", value);`,
        },
        cssText:
          ":root{--fixture-accent:red}" +
          (await readFile(path.join(FIXTURE, "src", "emitted.css"), "utf8")) +
          ".uses-property{color:var(--fixture-accent)}",
      });
      const generated = `--${hashClassName("custom-property:--fixture-accent")}`;
      assert.ok(result.cssOutputs[0].includes(`${generated}:red`));
      assert.ok(result.cssOutputs[0].includes(`var(${generated})`));
      assert.ok(
        result.jsOutputs.some(function (code) {
          return code.includes(`style.setProperty("${generated}", value)`);
        }),
      );
      const report = JSON.parse(
        await readFile(path.join(ARTIFACT_DIR, "report.json"), "utf8"),
      );
      assert.deepStrictEqual(report.customProperties.renames, [
        { property: "--fixture-accent", name: generated },
      ]);
      const map = JSON.parse(
        await readFile(path.join(ARTIFACT_DIR, "map.json"), "utf8"),
      );
      assert.deepStrictEqual(map.customProperties, {
        [generated]: "--fixture-accent",
      });
      await cleanOutputs();
    });
  });
});

describe("minwind shared-instance router builds (KTD9)", function () {
  it("three simulated router lifecycles share one deterministic report", async function () {
    await withFlags({}, async function () {
      await cleanOutputs();
      const plugins = minwind({ root: FIXTURE, cssEntry: CSS_ENTRY });

      const ssr = await driveLifecycle(plugins, {
        withModules: true,
        withCss: true,
      });
      const client = await driveLifecycle(plugins, {
        withModules: true,
        withCss: true,
      });
      const serverFns = await driveLifecycle(plugins, {
        withModules: false,
        withCss: false,
      });

      // Identical content-hash registry: both module builds produce the same
      // renamed output (R8).
      assert.deepStrictEqual(client.jsOutputs, ssr.jsOutputs);
      assert.deepStrictEqual(client.cssOutputs, ssr.cssOutputs);
      assert.deepStrictEqual(serverFns.jsOutputs, []);

      // One deterministic report: the first writer (ssr) wins and the client
      // build's identical rewrite is a no-op; the server-fns build saw no
      // class-bearing modules or CSS and skipped writing entirely.
      const report = JSON.parse(
        await readFile(path.join(ARTIFACT_DIR, "report.json"), "utf8"),
      );
      assert.strictEqual(report.summary.renamed, 6);
      assert.strictEqual(report.summary.consolidatedRules, 1);
      const map = JSON.parse(
        await readFile(path.join(ARTIFACT_DIR, "map.json"), "utf8"),
      );
      assert.strictEqual(Object.keys(map.names).length, 6);
      assert.strictEqual(Object.keys(map.consolidated).length, 1);

      await cleanOutputs();
    });
  });

  it("converges report warnings as a union across builds sharing the instance", async function () {
    await withFlags({}, async function () {
      await cleanOutputs();
      const plugins = minwind({ root: FIXTURE, cssEntry: CSS_ENTRY });
      const source = findHook(plugins, "minwind:source");
      const cssPlugin = findHook(plugins, "minwind:css");
      const transform = source.transform as (
        this: unknown,
        code: string,
        id: string,
      ) => unknown;

      // One router build: buildStart, the given modules, both closeBundles.
      // Each build drives the SAME plugin pair, as vinxi's sequential router
      // builds do (KTD9).
      async function driveBuild(
        modules: Array<{ id: string; code?: string }>,
      ): Promise<void> {
        const mock = mockContext();
        const buildStart = source.buildStart as (
          this: unknown,
          options: unknown,
        ) => Promise<void>;
        await buildStart.call(mock.context, {});
        for (const mod of modules) {
          const code = mod.code ?? (await readFile(mod.id, "utf8"));
          await transform.call(mock.context, code, mod.id);
        }
        for (const plugin of [source, cssPlugin]) {
          const closeBundle = plugin.closeBundle as
            ((this: unknown) => unknown) | undefined;
          if (closeBundle !== undefined) await closeBundle.call(mock.context);
        }
      }

      async function readReportWarnings(): Promise<Array<string>> {
        const report = JSON.parse(
          await readFile(path.join(ARTIFACT_DIR, "report.json"), "utf8"),
        );
        return report.warnings
          .map(function (warning: { token?: string }) {
            return warning.token;
          })
          .sort();
      }

      // Build A: a class-attribute rename plus two reverse-leak warnings.
      await driveBuild([
        { id: path.join(FIXTURE, "src", "a.tsx") },
        {
          id: path.join(FIXTURE, "src", "data.ts"),
          code: "export const note = 'flex and p-4 utilities'\n",
        },
      ]);
      assert.deepStrictEqual(await readReportWarnings(), ["flex", "p-4"]);

      // Build B sees a different warning; its publish must keep build A's
      // warnings too — the report converges to the union instead of
      // whichever build happened to write first.
      await driveBuild([
        { id: path.join(FIXTURE, "src", "a.tsx") },
        {
          id: path.join(FIXTURE, "src", "notes.ts"),
          code: "export const note = 'site-card docs'\n",
        },
      ]);
      assert.deepStrictEqual(await readReportWarnings(), [
        "flex",
        "p-4",
        "site-card",
      ]);

      await cleanOutputs();
    });
  });

  it("fails a sibling build that computes a divergent rename map", async function () {
    await withFlags({}, async function () {
      const site = path.join(HERE, "fixtures", `diverge-site-${process.pid}`);
      await rm(site, { recursive: true, force: true });
      await mkdir(path.join(site, "src"), { recursive: true });
      await writeFile(
        path.join(site, "src", "app.css"),
        '@import "tailwindcss";\n',
      );
      const widget = path.join(site, "src", "widget.ts");
      await writeFile(widget, "export const chip = cn('flex')\n");
      try {
        const plugins = minwind({
          root: site,
          cssEntry: path.join(site, "src", "app.css"),
        });
        const source = findHook(plugins, "minwind:source");
        const cssPlugin = findHook(plugins, "minwind:css");
        const transform = source.transform as (
          this: unknown,
          code: string,
          id: string,
        ) => unknown;

        async function driveSite(): Promise<void> {
          const mock = mockContext();
          const buildStart = source.buildStart as (
            this: unknown,
            options: unknown,
          ) => Promise<void>;
          await buildStart.call(mock.context, {});
          await transform.call(
            mock.context,
            await readFile(widget, "utf8"),
            widget,
          );
          for (const plugin of [source, cssPlugin]) {
            const closeBundle = plugin.closeBundle as
              ((this: unknown) => unknown) | undefined;
            if (closeBundle !== undefined) await closeBundle.call(mock.context);
          }
        }

        await driveSite();
        const mapPath = path.join(site, ".output", "minwind", "map.json");
        const firstBytes = await readFile(mapPath, "utf8");

        // The site changed under the shared instance, so the next build's
        // registry diverges from the published one: closeBundle must fail
        // loudly instead of silently accepting or ignoring the divergence.
        await writeFile(widget, "export const chip = cn('flex flex-col')\n");
        await assert.rejects(driveSite(), /divergent/);

        // The failed publish left the first build's bytes untouched.
        assert.strictEqual(await readFile(mapPath, "utf8"), firstBytes);
      } finally {
        await rm(site, { recursive: true, force: true });
      }
    });
  });
});

describe("minwind zero-rename tripwire (KTD7)", function () {
  it("fails when class-bearing modules are detected but nothing renames", async function () {
    await withFlags({}, async function () {
      await cleanOutputs();
      const plugins = minwind({ root: FIXTURE, cssEntry: CSS_ENTRY });
      const source = findHook(plugins, "minwind:source");
      const mock = mockContext();

      const buildStart = source.buildStart as (
        this: unknown,
        options: unknown,
      ) => Promise<void>;
      await buildStart.call(mock.context, {});

      // A module whose only registry-token occurrences are content strings:
      // detected (reverse-leak warnings) but zero applied renames.
      const transform = source.transform as (
        this: unknown,
        code: string,
        id: string,
      ) => unknown;
      await transform.call(
        mock.context,
        "export const note = 'flex and p-4 utilities'\n",
        path.join(FIXTURE, "src", "data.ts"),
      );
      assert.ok(mock.warnings.length > 0, "expected reverse-leak warnings");

      const closeBundle = source.closeBundle as (this: unknown) => unknown;
      assert.throws(function () {
        closeBundle.call(mock.context);
      }, /zero source renames|tripwire/);
      await cleanOutputs();
    });
  });

  it("does not trip when at least one module renamed", async function () {
    await withFlags({}, async function () {
      await cleanOutputs();
      const result = await driveLifecycle(
        minwind({ root: FIXTURE, cssEntry: CSS_ENTRY }),
        { withModules: true, withCss: false },
      );
      assert.ok(result.jsOutputs.length > 0);
      await cleanOutputs();
    });
  });

  it("does not trip when no class-bearing modules were seen (server-fns)", async function () {
    await withFlags({}, async function () {
      await cleanOutputs();
      await driveLifecycle(minwind({ root: FIXTURE, cssEntry: CSS_ENTRY }), {
        withModules: false,
        withCss: false,
      });
      await cleanOutputs();
    });
  });
});

describe("minwind per-build flag resolution (R7, R9)", function () {
  it("re-resolves the environment at every buildStart on a shared instance", async function () {
    await withFlags({ MINWIND: "off" }, async function () {
      await cleanOutputs();
      const plugins = minwind({ root: FIXTURE, cssEntry: CSS_ENTRY });
      const source = findHook(plugins, "minwind:source");
      const mock = mockContext();
      const buildStart = source.buildStart as (
        this: unknown,
        options: unknown,
      ) => Promise<void>;
      const transform = source.transform as (
        this: unknown,
        code: string,
        id: string,
      ) => unknown;
      const id = path.join(FIXTURE, "src", "c.ts");
      const code = await readFile(id, "utf8");

      await buildStart.call(mock.context, {});
      assert.strictEqual(
        await transform.call(mock.context, code, id),
        null,
        "a disabled build must no-op",
      );

      // Programmatic harnesses set flags per build (R7): the same instance's
      // next buildStart must see the flipped environment.
      delete process.env.MINWIND;
      await buildStart.call(mock.context, {});
      const result = (await transform.call(mock.context, code, id)) as {
        code: string;
      } | null;
      assert.ok(result !== null, "the re-enabled build must rename");
      assert.ok(result.code.includes(FADE_IN));
      await cleanOutputs();
    });
  });
});

describe("minwind empty router lifecycle (R11)", function () {
  it("writes no artifacts when the build saw neither modules nor CSS assets", async function () {
    await withFlags({}, async function () {
      await cleanOutputs();
      const plugins = minwind({ root: FIXTURE, cssEntry: CSS_ENTRY });
      const mock = mockContext();
      const source = findHook(plugins, "minwind:source");
      const buildStart = source.buildStart as (
        this: unknown,
        options: unknown,
      ) => Promise<void>;
      await buildStart.call(mock.context, {});

      // No transform or generateBundle calls: an empty router build.
      for (const plugin of [source, findHook(plugins, "minwind:css")]) {
        const closeBundle = plugin.closeBundle as
          ((this: unknown) => unknown) | undefined;
        if (closeBundle !== undefined) await closeBundle.call(mock.context);
      }

      for (const artifact of ["report.json", "map.json"]) {
        const exists = await stat(path.join(ARTIFACT_DIR, artifact)).then(
          function () {
            return true;
          },
          function () {
            return false;
          },
        );
        assert.ok(!exists, `${artifact} must not exist after an empty build`);
      }
      await cleanOutputs();
    });
  });
});

describe("minwind per-context tripwire (KTD1)", function () {
  it("fails when cn calls rename but JSX class attributes yield zero renames", async function () {
    await withFlags({}, async function () {
      await cleanOutputs();
      const plugins = minwind({ root: FIXTURE, cssEntry: CSS_ENTRY });
      const source = findHook(plugins, "minwind:source");
      const mock = mockContext();
      const buildStart = source.buildStart as (
        this: unknown,
        options: unknown,
      ) => Promise<void>;
      await buildStart.call(mock.context, {});

      const transform = source.transform as (
        this: unknown,
        code: string,
        id: string,
      ) => unknown;
      // The cn() call still renames in the broken ordering (renames applied
      // somewhere), while...
      const cnId = path.join(FIXTURE, "src", "c.ts");
      const cnResult = (await transform.call(
        mock.context,
        await readFile(cnId, "utf8"),
        cnId,
      )) as { code: string } | null;
      assert.ok(cnResult !== null, "the cn call must rename");
      // ...the class attributes have dissolved into Solid's compiled
      // template string: detected (reverse-leak warnings) but no
      // class-attribute renames.
      await transform.call(
        mock.context,
        "import { template } from 'solid-js/web'\n" +
          "const _tmpl = template('<div class=\"flex items-center p-4\">a</div>')\n" +
          "export default _tmpl\n",
        path.join(FIXTURE, "src", "compiled-a.tsx"),
      );
      assert.ok(mock.warnings.length > 0, "expected reverse-leak warnings");

      const closeBundle = source.closeBundle as (this: unknown) => unknown;
      assert.throws(function () {
        closeBundle.call(mock.context);
      }, /tripwire: JSX class-attribute/);
      await cleanOutputs();
    });
  });

  it("does not trip a normal build with JSX and cn renames", async function () {
    await withFlags({}, async function () {
      await cleanOutputs();
      const result = await driveLifecycle(
        minwind({ root: FIXTURE, cssEntry: CSS_ENTRY }),
        { withModules: true, withCss: true },
      );
      assert.ok(result.jsOutputs.length > 0);
      await cleanOutputs();
    });
  });

  it("does not fire when the site has no JSX class-attribute contexts", async function () {
    await withFlags({}, async function () {
      const site = path.join(HERE, "fixtures", `nojsx-site-${process.pid}`);
      await rm(site, { recursive: true, force: true });
      await mkdir(path.join(site, "src"), { recursive: true });
      await writeFile(
        path.join(site, "src", "app.css"),
        '@import "tailwindcss";\n',
      );
      await writeFile(
        path.join(site, "src", "widget.ts"),
        "export const chip = cn('flex')\n",
      );
      try {
        const plugins = minwind({
          root: site,
          cssEntry: path.join(site, "src", "app.css"),
        });
        const source = findHook(plugins, "minwind:source");
        const mock = mockContext();
        const buildStart = source.buildStart as (
          this: unknown,
          options: unknown,
        ) => Promise<void>;
        await buildStart.call(mock.context, {});

        const transform = source.transform as (
          this: unknown,
          code: string,
          id: string,
        ) => unknown;
        const id = path.join(site, "src", "widget.ts");
        const result = (await transform.call(
          mock.context,
          await readFile(id, "utf8"),
          id,
        )) as { code: string } | null;
        assert.ok(result !== null, "the cn call must rename");

        // cn renames applied and the registry is non-empty, but the site has
        // no JSX class attributes: both closeBundles must pass.
        for (const plugin of [source, findHook(plugins, "minwind:css")]) {
          const closeBundle = plugin.closeBundle as
            ((this: unknown) => unknown) | undefined;
          if (closeBundle !== undefined) await closeBundle.call(mock.context);
        }

        // The participating build still publishes its artifacts.
        const report = JSON.parse(
          await readFile(
            path.join(site, ".output", "minwind", "report.json"),
            "utf8",
          ),
        );
        assert.strictEqual(report.summary.renamed, 1);
      } finally {
        await rm(site, { recursive: true, force: true });
      }
    });
  });
});

describe("writeArtifacts (R11, KTD9)", function () {
  function makeReport(warningCount: number): TransformReport {
    return {
      version: 1,
      flags: { enabled: true, consolidate: true },
      summary: {
        renamed: 1,
        excluded: 0,
        consolidatedRules: 0,
        warnings: warningCount,
      },
      renames: [{ token: "flex", name: "h4sh" }],
      exclusions: [],
      consolidation: { verdicts: [] },
      warnings: [],
    };
  }

  function makeMap(marker: string): RenameMap {
    return { version: 1, names: { [marker]: "flex" }, consolidated: {} };
  }

  it("publishes report.json and map.json as one pair, then republishes identical bytes", async function () {
    const root = await mkdtemp(path.join(tmpdir(), "minwind-artifacts-"));
    try {
      const result = await writeArtifacts(root, makeReport(0), makeMap("a"));
      assert.strictEqual(
        await readFile(result.mapPath, "utf8"),
        result.mapBytes,
      );
      // A same-bytes republish with the expectation armed resolves — this is
      // what sibling router builds sharing one plugin instance do (KTD9).
      const again = await writeArtifacts(root, makeReport(0), makeMap("a"), {
        expectedMapBytes: result.mapBytes,
      });
      assert.strictEqual(again.mapBytes, result.mapBytes);
      const entries = await readdir(path.dirname(result.reportPath));
      assert.deepStrictEqual(entries.sort(), ["map.json", "report.json"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("replaces existing content instead of silently keeping a first writer", async function () {
    const root = await mkdtemp(path.join(tmpdir(), "minwind-artifacts-"));
    try {
      const first = await writeArtifacts(root, makeReport(0), makeMap("a"));
      // A later build with legitimately different bytes (converged warnings
      // grew, or a new process replaced stale output) must win — the old
      // first-writer-wins protocol kept the stale bytes and reported false.
      await writeArtifacts(root, makeReport(3), makeMap("b"));
      const mapNow = JSON.parse(await readFile(first.mapPath, "utf8"));
      assert.deepStrictEqual(Object.keys(mapNow.names), ["b"]);
      const reportNow = JSON.parse(await readFile(first.reportPath, "utf8"));
      assert.strictEqual(reportNow.summary.warnings, 3);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("concurrent writers all resolve and leave no tmp files behind", async function () {
    const root = await mkdtemp(path.join(tmpdir(), "minwind-artifacts-"));
    try {
      // Divergent bytes race: both publishes must resolve (writers are
      // interchangeable once content has converged), the winner's bytes land
      // intact, and no staging file survives — the old protocol let both
      // writers pass its re-read and both rename.
      await Promise.all([
        writeArtifacts(root, makeReport(1), makeMap("x")),
        writeArtifacts(root, makeReport(2), makeMap("y")),
      ]);
      const directory = path.join(root, ".output", "minwind");
      const entries = await readdir(directory);
      assert.deepStrictEqual(entries.sort(), ["map.json", "report.json"]);
      const final = JSON.parse(
        await readFile(path.join(directory, "map.json"), "utf8"),
      );
      assert.ok(
        ["x", "y"].includes(Object.keys(final.names)[0]),
        "the surviving map must be one writer's intact bytes",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("throws before writing when a sibling build's map bytes diverge", async function () {
    const root = await mkdtemp(path.join(tmpdir(), "minwind-artifacts-"));
    try {
      const first = await writeArtifacts(root, makeReport(0), makeMap("a"));
      await assert.rejects(
        writeArtifacts(root, makeReport(0), makeMap("b"), {
          expectedMapBytes: first.mapBytes,
        }),
        /divergent/,
      );
      // The rejected publish wrote nothing over the good bytes.
      const mapNow = JSON.parse(await readFile(first.mapPath, "utf8"));
      assert.deepStrictEqual(Object.keys(mapNow.names), ["a"]);
      const entries = await readdir(path.dirname(first.reportPath));
      assert.deepStrictEqual(entries.sort(), ["map.json", "report.json"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
