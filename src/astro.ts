import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { keptUnrewritable } from "./apply.js";
import {
  resolveFlags,
  type MinwindEngineId,
  type MinwindMode,
} from "./flags.js";
import type { ExclusionConfig } from "./names.js";
import {
  isThemedNaming,
  resolveHasher,
  resolveVocabulary,
  type NamingConfig,
} from "./naming.js";
import { runApply, type RunApplyResult } from "./run-apply.js";
import {
  vendorProvenancePlugin,
  type ChunkProvenance,
  type VendorProvenancePlugin,
  type VendorTrust,
} from "./vendor-provenance.js";

// Astro integration (KTD1). Astro compiles and renders the site itself;
// astro:build:done then runs the apply engine in-process on the finished
// output, ranking visibility from that same output before renaming it.
// Static output only, with no adapter and no Astro CSP (KTD5): anything
// rendered or hashed outside the build-done directory would keep or pin
// the original class names. Types are structural: Astro is the host's
// dependency, not minwind's.

export interface MinwindAstroOptions {
  // Tailwind CSS entry compiled by the pre-pass, resolved against the Astro
  // root. Defaults to <srcDir>/styles/global.css when it exists, otherwise
  // <srcDir>/app.css.
  cssEntry?: string;
  // As in the Vite plugin: content-hash naming by default; words, quotes,
  // dialect, and maps strategies are opt-in.
  naming?: NamingConfig;
  // Classes that keep their names everywhere (runtime-injected or
  // third-party markup).
  exclusions?: ExclusionConfig;
  // morph (rename only) or compress (rename + consolidation). Defaults to
  // compress. Env MINWIND_* flags override when set.
  mode?: MinwindMode;
  // Engines participating in this build. Defaults to Tailwind-only.
  engines?: ReadonlyArray<MinwindEngineId>;
  // Words and quotes naming rank the built pages' classes by visibility
  // and deal the first vocabulary words to the most visible ones (<html>,
  // <body>, then the first class-bearing elements). false deals by length
  // alone. Hash, dialect, and maps naming never rank.
  prominence?: boolean;
  // Off by default. true, or the names of the node_modules packages to
  // trust: a class name that only trusted vendor JavaScript mentions, such
  // as a motion library's el.style.display = "block", no longer keeps the
  // class original. A trusted script that adds such a class by its
  // original name breaks, so the build log names each renamed class
  // trusted code mentions. Project code always counts.
  trustVendorModules?: boolean | ReadonlyArray<string>;
}

export interface AstroLoggerLike {
  info(message: string): void;
  warn(message: string): void;
}

export interface AstroConfigLike {
  root: URL;
  srcDir: URL;
  adapter?: { name: string };
  build: { inlineStylesheets: string };
  security?: { csp?: unknown };
}

export type AstroConfigUpdate =
  | { build: { inlineStylesheets: "never" } }
  | { vite: { plugins: Array<VendorProvenancePlugin> } };

export interface MinwindAstroIntegration {
  name: string;
  hooks: {
    "astro:config:setup": (params: {
      // "dev", "build", "preview", or "sync".
      command: string;
      updateConfig(config: AstroConfigUpdate): unknown;
    }) => void;
    "astro:config:done": (params: {
      config: AstroConfigLike;
      // "static" or "server".
      buildOutput: string;
    }) => void;
    "astro:build:done": (params: {
      dir: URL;
      logger: AstroLoggerLike;
    }) => Promise<void>;
  };
}

const CUSTOM_PROPERTIES_ERROR =
  "minwind/astro does not support customProperties. It renames Astro's" +
  " built output, and custom-property ownership is proven from source," +
  " while built output also carries define:vars styles, <style is:inline>" +
  " blocks, and bundled library strings. Custom-property aliases are" +
  " supported by the Vite plugin (minwind) and the webpack plugin" +
  " (minwind/webpack).";

// The pre-pass validates naming only once Astro has rendered every page;
// the same checks here fail the build before it starts.
function assertNaming(naming: NamingConfig | undefined): void {
  resolveHasher(naming);
  if (isThemedNaming(naming)) resolveVocabulary(naming);
}

// A package name as it appears after node_modules/: one segment, or two
// for a scoped package.
const PACKAGE_NAME = /^(?:@[^@/\s]+\/)?[^@/\s]+$/;

function resolveVendorTrust(value: unknown): VendorTrust | undefined {
  if (value === undefined || value === false) return undefined;
  if (value === true) return true;
  if (
    Array.isArray(value) &&
    value.every(function (name) {
      return typeof name === "string" && PACKAGE_NAME.test(name);
    })
  ) {
    return value.slice();
  }
  throw new Error(
    "minwind/astro: trustVendorModules must be true, false, or an array of" +
      ' package names such as ["gsap", "@scope/name"], but got' +
      ` ${JSON.stringify(value) ?? String(value)}`,
  );
}

function assertRenameableConfig(
  config: AstroConfigLike,
  buildOutput: string,
): void {
  if (config.adapter !== undefined) {
    throw new Error(
      `minwind/astro does not support adapters: remove "${config.adapter.name}"` +
        " or build without minwind/astro. Astro runs an adapter's" +
        " astro:build:done hook before minwind's, so it can copy files" +
        " before they are renamed.",
    );
  }
  if (buildOutput === "server") {
    throw new Error(
      "minwind/astro supports static output only. On-demand pages render" +
        " from server chunks that minwind never sees, so their HTML would" +
        " keep the original class names while the stylesheets are renamed.",
    );
  }
  const csp = config.security?.csp;
  if (csp !== undefined && csp !== false) {
    throw new Error(
      "minwind/astro does not support Astro's security.csp. Astro hashes" +
        " inline scripts and styles while rendering, and renaming classes" +
        " afterwards leaves those hashes stale, so the browser would block" +
        " the scripts.",
    );
  }
  if (config.build.inlineStylesheets !== "never") {
    throw new Error(
      'minwind/astro needs build.inlineStylesheets "never", but the final' +
        ` config has "${config.build.inlineStylesheets}". minwind sets it` +
        " during astro:config:setup, so an integration listed after minwind" +
        " changed it; list minwind after that integration.",
    );
  }
}

function resolveCssEntry(
  root: string,
  sourceDir: string,
  cssEntry: string | undefined,
): string {
  if (cssEntry !== undefined) return path.resolve(root, cssEntry);
  const global = path.join(sourceDir, "styles", "global.css");
  return fs.existsSync(global) ? global : path.join(sourceDir, "app.css");
}

function logSummary(
  logger: AstroLoggerLike,
  outcome: RunApplyResult,
  ranked: boolean,
): void {
  if (!outcome.enabled) {
    logger.info(
      "disabled by MINWIND=off or MINWIND_RENAME=off; the build output" +
        " keeps its original class names",
    );
    return;
  }
  const { result } = outcome;
  for (const notice of outcome.notices) logger.warn(notice);
  for (const warning of result.warnings) logger.warn(warning.message);
  logger.info(
    `renamed ${outcome.renamed} class(es) across ${result.rewrittenFiles}` +
      ` file(s) (${result.htmlFiles} html, ${result.cssFiles} css,` +
      ` ${result.jsFiles} js scanned)` +
      (result.consolidated > 0
        ? `; consolidated ${result.consolidated} list(s)`
        : ""),
  );
  if (ranked) {
    logger.info(
      `ranked ${outcome.prominent} class(es) by visibility; the most` +
        " visible drew the first vocabulary words",
    );
  }
  const unrewritable = keptUnrewritable(result);
  if (unrewritable.length > 0) {
    logger.info(
      `kept original names for ${unrewritable.length} class(es)` +
        " that also appear where minwind cannot rewrite them (a minified" +
        " call argument or an inline script):" +
        ` ${unrewritable.join(", ")}`,
    );
  }
  if (result.keptDependent.length > 0) {
    logger.info(
      `kept original names for ${result.keptDependent.length} class(es)` +
        " because each depends on a class kept original:" +
        ` ${result.keptDependent.join(", ")}`,
    );
  }
  if (result.vendorMentions.length > 0) {
    logger.info(
      `renamed ${result.vendorMentions.length} class(es) that trusted` +
        " vendor code mentions (trustVendorModules); if a vendor script" +
        " adds one by its original name, list it in exclusions:" +
        ` ${result.vendorMentions.join(", ")}`,
    );
  }
  if (result.warnings.length > 0) {
    logger.warn(
      `${result.warnings.length} warning(s); inspect` +
        " .output/minwind/report.json before deploying",
    );
  }
}

export default function minwind(
  options: MinwindAstroOptions = {},
): MinwindAstroIntegration {
  // astro:config:done also runs for dev, preview, and sync and carries no
  // command, so the later hooks read the one astro:config:setup stored.
  let command: string | undefined;
  let root: string | undefined;
  let sourceDir: string | undefined;
  let cssEntry: string | undefined;
  let trust: VendorTrust | undefined;
  let vendorChunks: Array<ChunkProvenance> = [];

  return {
    name: "minwind",
    hooks: {
      "astro:config:setup": function (params) {
        command = params.command;
        if (command !== "build") return;
        // Config enforcement runs under MINWIND=off too (R5, KTD4), so on
        // and off builds differ only by class names.
        const passed = options as Record<string, unknown>;
        if (passed.customProperties !== undefined) {
          throw new Error(CUSTOM_PROPERTIES_ERROR);
        }
        assertNaming(options.naming);
        trust = resolveVendorTrust(passed.trustVendorModules);
        // Overrides the user's value. A later integration can change it
        // again, so astro:config:done checks the final value.
        params.updateConfig({ build: { inlineStylesheets: "never" } });
        // Not under MINWIND=off or MINWIND_RENAME=off: nothing reads the
        // chunks there, so the off build stays a build without minwind.
        if (
          trust !== undefined &&
          resolveFlags(process.env, {
            mode: options.mode,
            engines: options.engines,
          }).enabled
        ) {
          vendorChunks = [];
          params.updateConfig({
            vite: { plugins: [vendorProvenancePlugin(vendorChunks)] },
          });
        }
      },

      "astro:config:done": function (params) {
        if (command !== "build") return;
        assertRenameableConfig(params.config, params.buildOutput);
        root = fileURLToPath(params.config.root);
        sourceDir = path.resolve(fileURLToPath(params.config.srcDir));
        cssEntry = resolveCssEntry(root, sourceDir, options.cssEntry);
      },

      "astro:build:done": async function (params) {
        if (command !== "build") return;
        if (
          root === undefined ||
          sourceDir === undefined ||
          cssEntry === undefined
        ) {
          throw new Error(
            "minwind/astro: astro:build:done ran before astro:config:done",
          );
        }
        const ranked =
          isThemedNaming(options.naming) && options.prominence !== false;
        const outcome = await runApply({
          dir: fileURLToPath(params.dir),
          root,
          sourceDir,
          cssEntry,
          naming: options.naming,
          exclusions: options.exclusions,
          mode: options.mode,
          engines: options.engines,
          prominence: ranked ? "auto" : undefined,
          vendorProvenance:
            trust === undefined ? undefined : { trust, chunks: vendorChunks },
        });
        vendorChunks.length = 0;
        logSummary(params.logger, outcome, ranked);
      },
    },
  };
}
