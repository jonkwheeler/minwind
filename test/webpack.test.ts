import assert from "node:assert";
import { describe, it } from "node:test";
import { createNameRegistry } from "../src/names.js";
import type { PrepassResult } from "../src/prepass.js";
import {
  MinwindWebpackPlugin,
  rewriteCssAssets,
  type WebpackCompilationLike,
  type WebpackCompilerLike,
} from "../src/webpack.js";
import minwindLoader from "../src/webpack-loader.js";
import { createCustomPropertyRegistry } from "../src/custom-properties.js";

// The webpack adapter's wiring is exercised against structural fakes — the
// pure cores (transformSource, transformStylesheet, consolidateStylesheet)
// have their own suites; these tests pin the adapter contract: the loader
// finds its plugin on the compiler, CSS assets rewrite after minification,
// and the zero-rename tripwire fires.

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
