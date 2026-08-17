import assert from "node:assert";
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import MiniCssExtractPlugin from "mini-css-extract-plugin";
import webpack from "webpack";
import { createNameRegistry, hashClassName } from "../src/names.js";
import type { PrepassResult } from "../src/prepass.js";
import type { NamingConfig } from "../src/naming.js";
import {
  hashModuleLocal,
  moduleLocalKey,
  prepareModulesNaming,
} from "../src/engines/css-modules.js";
import {
  MinwindWebpackPlugin,
  rewriteCssAssets,
  type WebpackCompilationLike,
  type WebpackCompilerLike,
} from "../src/webpack.js";
import minwindLoader from "../src/webpack-loader.js";
import { createCustomPropertyRegistry } from "../src/custom-properties.js";

// Adapter wiring uses structural fakes. CSS Modules production proof compiles
// test/fixtures/modules-site with webpack, css-loader, and MiniCssExtractPlugin
// so JS export values match emitted selectors (same bar as Vite).

const TOKENS = ["flex", "items-center", "p-4"];

function fakePrepass(): PrepassResult {
  const registry = createNameRegistry({
    universe: new Set(TOKENS),
    sourceTokens: new Set(TOKENS),
  });
  return {
    registry,
    universe: new Set(TOKENS),
    sourceTokens: new Set(TOKENS),
    renameTokens: new Set(TOKENS),
    runtimeTokens: new Set(),
    listFrequencies: [],
    consolidationVerdicts: [],
    stylesheet: "",
    stylesheetModel: {
      rules: [],
    } as unknown as PrepassResult["stylesheetModel"],
  };
}

function nameOf(prepass: PrepassResult, token: string): string {
  const name = prepass.registry.nameFor(token);
  assert.ok(name !== undefined, `${token} must be renamed`);
  return name;
}

interface LoaderCall {
  error: Error | null;
  content?: string;
  map?: unknown;
}

function runLoader(
  plugin: MinwindWebpackPlugin | null,
  id: string,
  source: string,
): LoaderCall {
  const warnings: Array<Error> = [];
  const context = {
    resourcePath: id,
    _compiler:
      plugin === null
        ? { options: { plugins: [] } }
        : { options: { plugins: [plugin] } },
    async() {
      return function (error: Error | null, content?: string, map?: unknown) {
        call.error = error;
        call.content = content;
        call.map = map;
      };
    },
    emitWarning(warning: Error) {
      warnings.push(warning);
    },
  };
  const call: LoaderCall = { error: null };
  minwindLoader.call(context, source);
  assert.deepStrictEqual(warnings, []);
  return call;
}

describe("rewriteCssAssets", function () {
  it("renames selectors in every stylesheet asset", function () {
    const prepass = fakePrepass();
    const result = rewriteCssAssets(
      {
        "assets/app.css":
          "@layer theme,base,components,utilities;" +
          "@layer utilities{" +
          ".flex{display:flex}" +
          ".p-4{padding:1rem}" +
          "}",
        "assets/other.css":
          "@layer theme,base,components,utilities;" +
          "@layer utilities{" +
          ".items-center{align-items:center}" +
          "}",
      },
      prepass,
      false,
    );
    assert.strictEqual(
      result.assets["assets/app.css"],
      "@layer theme,base,components,utilities;" +
        "@layer utilities{" +
        `.${nameOf(prepass, "flex")}{display:flex}` +
        `.${nameOf(prepass, "p-4")}{padding:1rem}` +
        "}",
    );
    assert.strictEqual(
      result.assets["assets/other.css"],
      "@layer theme,base,components,utilities;" +
        "@layer utilities{" +
        `.${nameOf(prepass, "items-center")}{align-items:center}` +
        "}",
    );
    assert.deepStrictEqual(result.warnings, []);
  });

  it("forwards the owned custom-property registry to every CSS asset", function () {
    const prepass = fakePrepass();
    prepass.customProperties = createCustomPropertyRegistry({
      owned: ["--accent"],
    });
    const result = rewriteCssAssets(
      {
        "assets/app.css":
          ":root{--accent:red}" +
          "@layer utilities{" +
          ".flex{color:var(--accent)}" +
          ".items-center{align-items:center}" +
          ".p-4{padding:1rem}" +
          "}",
      },
      prepass,
      false,
    );
    const name = prepass.customProperties.nameFor("--accent") ?? "";
    assert.ok(result.assets["assets/app.css"].includes(`${name}:red`));
    assert.ok(result.assets["assets/app.css"].includes(`var(${name})`));
  });
});

describe("minwindLoader", function () {
  it("passes through when no plugin is installed", function () {
    const call = runLoader(
      null,
      "/site/src/a.tsx",
      `<div class="flex">x</div>`,
    );
    assert.strictEqual(call.error, null);
    assert.strictEqual(call.content, `<div class="flex">x</div>`);
  });

  it("passes through before the pre-pass completes", function () {
    const plugin = new MinwindWebpackPlugin();
    const call = runLoader(
      plugin,
      "/site/src/a.tsx",
      `<div class="flex">x</div>`,
    );
    assert.strictEqual(call.error, null);
    assert.strictEqual(call.content, `<div class="flex">x</div>`);
  });

  it("renames class contexts once the pre-pass is published", function () {
    const plugin = new MinwindWebpackPlugin();
    const prepass = fakePrepass();
    plugin.prepass = prepass;
    const call = runLoader(
      plugin,
      "/site/src/a.tsx",
      `export const el = <div class="flex p-4">x</div>\n`,
    );
    assert.strictEqual(call.error, null);
    assert.ok(
      call.content?.includes(
        `class="${nameOf(prepass, "flex")} ${nameOf(prepass, "p-4")}"`,
      ),
    );
    assert.ok(call.map !== undefined);
  });

  it("rewrites owned CSSOM property calls through the loader", function () {
    const plugin = new MinwindWebpackPlugin();
    const prepass = fakePrepass();
    prepass.customProperties = createCustomPropertyRegistry({
      owned: ["--accent"],
    });
    plugin.prepass = prepass;
    const call = runLoader(
      plugin,
      "/site/src/theme.ts",
      `element.style.setProperty("--accent", value);`,
    );
    assert.strictEqual(call.error, null);
    assert.strictEqual(
      call.content,
      `element.style.setProperty("${prepass.customProperties.nameFor("--accent")}", value);`,
    );
  });

  it("skips modules outside the transform filter", function () {
    const plugin = new MinwindWebpackPlugin();
    plugin.prepass = fakePrepass();
    const source = `export const el = <div class="flex">x</div>\n`;
    const call = runLoader(plugin, "/site/node_modules/pkg/a.tsx", source);
    assert.strictEqual(call.error, null);
    assert.strictEqual(call.content, source);
  });
});

describe("MinwindWebpackPlugin hooks", function () {
  function fakeCompiler(): {
    compiler: WebpackCompilerLike;
    taps: Map<string, unknown>;
  } {
    const taps = new Map<string, unknown>();
    const compiler: WebpackCompilerLike = {
      context: "/site",
      options: { plugins: [] },
      webpack: {
        Compilation: { PROCESS_ASSETS_STAGE_SUMMARIZE: 1000 },
        sources: {
          RawSource: class {
            constructor(public content: string) {}
          },
        },
      },
      hooks: {
        beforeCompile: {
          tapPromise(name: string, fn: () => Promise<void>) {
            taps.set(`beforeCompile:${name}`, fn);
          },
        },
        thisCompilation: {
          tap(name: string, fn: (compilation: WebpackCompilationLike) => void) {
            taps.set(`thisCompilation:${name}`, fn);
          },
        },
        afterEmit: {
          tapPromise(name: string, fn: () => Promise<void>) {
            taps.set(`afterEmit:${name}`, fn);
          },
        },
      },
    };
    return { compiler, taps };
  }

  it("registers beforeCompile, thisCompilation, and afterEmit taps", function () {
    const plugin = new MinwindWebpackPlugin({ enabled: false });
    const { compiler, taps } = fakeCompiler();
    plugin.apply(compiler);
    assert.ok(taps.has("beforeCompile:minwind"));
    assert.ok(taps.has("thisCompilation:minwind"));
    assert.ok(taps.has("afterEmit:minwind"));
  });

  it("exposes a resolvable loader path", function () {
    assert.ok(MinwindWebpackPlugin.loader.endsWith("webpack-loader.js"));
  });

  it("mode morph disables consolidation", function () {
    const plugin = new MinwindWebpackPlugin({ mode: "morph" });
    assert.strictEqual(plugin.consolidate, false);
    assert.strictEqual(plugin.mode, "morph");
  });

  it("owns a collision space and seeds it from Tailwind in beforeCompile (KTD5)", async function () {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const dual = path.join(here, "fixtures", "dual-site");
    const plugin = new MinwindWebpackPlugin({
      root: dual,
      engines: ["tailwind", "css-modules"],
      cssEntry: path.join(dual, "src", "app.css"),
    });
    const { compiler, taps } = fakeCompiler();
    plugin.apply(compiler);
    const beforeCompile = taps.get(
      "beforeCompile:minwind",
    ) as () => Promise<void>;
    await beforeCompile();
    const twName = hashClassName("flex");
    assert.throws(function () {
      plugin.collision.claim("src/Card.module.css\0flex", twName);
    }, /name collision/);
  });

  it("createGetLocalIdent words names stay distinct from seeded Tailwind names (F1)", function () {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const dual = path.join(here, "fixtures", "dual-site");
    const card = path.join(dual, "src", "Card.module.css");
    const tw = createNameRegistry({
      universe: new Set(["flex"]),
      sourceTokens: new Set(["flex"]),
      hash: function () {
        return "quill";
      },
    });
    const plugin = new MinwindWebpackPlugin({
      engines: ["tailwind", "css-modules"],
      naming: { strategy: "words", vocabulary: ["quill", "willow"] },
    });
    plugin.collision.seed(tw);
    const ident = MinwindWebpackPlugin.createGetLocalIdent(dual, {
      naming: { strategy: "words", vocabulary: ["quill", "willow"] },
      collision: plugin.collision,
    });
    const modName = ident({ resourcePath: card }, "[hash]", "flex");
    assert.strictEqual(tw.nameFor("flex"), "quill");
    assert.strictEqual(modName, "willow");
  });

  it("fires the zero-rename tripwire when modules were detected but none renamed", async function () {
    const plugin = new MinwindWebpackPlugin({ enabled: false });
    const { compiler, taps } = fakeCompiler();
    plugin.apply(compiler);
    // Simulate a completed pre-pass with a non-empty registry and a loader
    // that saw class-bearing modules but rewrote nothing.
    plugin.prepass = fakePrepass();
    plugin.trackModule(false, []);
    const afterEmit = taps.get("afterEmit:minwind") as () => Promise<void>;
    await assert.rejects(afterEmit, /tripwire/);
  });
});

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MODULES_FIXTURE = path.join(HERE, "fixtures", "modules-site");
const WEBPACK_OUT = path.join(MODULES_FIXTURE, "dist-webpack-modules");
const WEBPACK_ENTRY = path.join(MODULES_FIXTURE, "src", "webpack-entry.js");
const BUTTON_CSS = path.join(MODULES_FIXTURE, "src", "Button.module.css");
const OTHER_CSS = path.join(MODULES_FIXTURE, "src", "other.module.css");
const COMPOSED_CSS = path.join(MODULES_FIXTURE, "src", "composed.module.css");
const MINWIND_LOADER = fileURLToPath(
  new URL("./helpers/minwind-webpack-loader.mjs", import.meta.url),
);

function skipBuild(): boolean {
  return process.env.MINWIND_SKIP_BUILD === "1";
}

function compileModules(naming: NamingConfig | undefined): Promise<void> {
  const plugin = new MinwindWebpackPlugin({
    root: MODULES_FIXTURE,
    engines: ["css-modules"],
    mode: "morph",
    naming,
  });
  const compiler = webpack({
    mode: "production",
    context: MODULES_FIXTURE,
    entry: WEBPACK_ENTRY,
    output: {
      path: WEBPACK_OUT,
      filename: "bundle.js",
      clean: true,
    },
    module: {
      rules: [
        {
          test: /\.js$/,
          enforce: "pre",
          use: [MINWIND_LOADER],
        },
        {
          test: /\.module\.css$/,
          use: [
            MiniCssExtractPlugin.loader,
            {
              loader: "css-loader",
              options: {
                modules: {
                  namedExport: false,
                  exportLocalsConvention: "as-is",
                  getLocalIdent: MinwindWebpackPlugin.createGetLocalIdent(
                    MODULES_FIXTURE,
                    {
                      collision: plugin.collision,
                      naming,
                    },
                  ),
                },
              },
            },
          ],
        },
      ],
    },
    plugins: [plugin, new MiniCssExtractPlugin({ filename: "bundle.css" })],
  });
  return new Promise(function (resolve, reject) {
    compiler.run(function (err, stats) {
      compiler.close(function (closeErr) {
        if (err !== null) {
          reject(err);
          return;
        }
        if (closeErr) {
          reject(closeErr);
          return;
        }
        if (stats !== undefined && stats.hasErrors()) {
          reject(new Error(stats.toString({ colors: false })));
          return;
        }
        resolve();
      });
    });
  });
}

describe("webpack CSS Modules production build", function () {
  it(
    "keeps export keys and syncs JS values with CSS selectors",
    { timeout: 120000 },
    async function () {
      if (skipBuild()) return;
      try {
        await compileModules(undefined);
        const js = readFileSync(path.join(WEBPACK_OUT, "bundle.js"), "utf8");
        const css = readFileSync(path.join(WEBPACK_OUT, "bundle.css"), "utf8");
        const rootName = hashModuleLocal(MODULES_FIXTURE, BUTTON_CSS, "root");
        const buttonName = hashModuleLocal(
          MODULES_FIXTURE,
          COMPOSED_CSS,
          "button",
        );
        const baseName = hashModuleLocal(MODULES_FIXTURE, OTHER_CSS, "base");
        assert.ok(js.includes(rootName));
        assert.ok(css.includes(`.${rootName}`));
        assert.ok(js.includes(buttonName));
        assert.ok(js.includes(baseName));
        assert.ok(css.includes(`.${buttonName}`));
        assert.ok(css.includes(`.${baseName}`));
        assert.ok(!js.includes('root:"Button_root'));
      } finally {
        rmSync(WEBPACK_OUT, { recursive: true, force: true });
        rmSync(path.join(MODULES_FIXTURE, ".output"), {
          recursive: true,
          force: true,
        });
      }
    },
  );

  it(
    "syncs words naming between JS exports and CSS selectors",
    { timeout: 120000 },
    async function () {
      if (skipBuild()) return;
      const vocabulary = ["quill", "willow", "ember", "lark"];
      const naming = { strategy: "words" as const, vocabulary };
      try {
        await compileModules(naming);
        const prepared = prepareModulesNaming(MODULES_FIXTURE, naming);
        const rootName = prepared.registry.nameFor(
          moduleLocalKey(MODULES_FIXTURE, BUTTON_CSS, "root"),
        );
        assert.ok(rootName !== undefined);
        const js = readFileSync(path.join(WEBPACK_OUT, "bundle.js"), "utf8");
        const css = readFileSync(path.join(WEBPACK_OUT, "bundle.css"), "utf8");
        assert.ok(js.includes(rootName));
        assert.ok(css.includes(`.${rootName}`));
        assert.ok(vocabulary.includes(rootName));
      } finally {
        rmSync(WEBPACK_OUT, { recursive: true, force: true });
        rmSync(path.join(MODULES_FIXTURE, ".output"), {
          recursive: true,
          force: true,
        });
      }
    },
  );
});
