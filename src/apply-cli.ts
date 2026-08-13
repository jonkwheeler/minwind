import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { applyBuildOutput, filterRegistry } from "./apply.js";
import { assertConsolidatedNames } from "./consolidate.js";
import {
  enginesInclude,
  isModulesOnly,
  parseEngineList,
  resolveFlags,
  type MinwindEngineId,
  type MinwindMode,
} from "./flags.js";
import {
  assertSharedCollision,
  prepareModulesNaming,
  reservedFromRegistry,
} from "./engines/css-modules.js";
import type { NamingConfig } from "./naming.js";
import { DIALECT_IDS, isDialectId, type DialectId } from "./dialect.js";
import { resolveNameLength } from "./names.js";
import { isThemeId, THEME_IDS, type ThemeId } from "./themes/index.js";
import { emptyPrepassResult, runPrepass } from "./prepass.js";
import { buildRenameMap, buildReport, writeArtifacts } from "./report.js";

// `minwind apply` — the post-build path for bundlers without a plugin hook
// (Turbopack, esbuild, Parcel, plain Rollup). Runs the same pre-pass the
// plugins run against the site source, then rewrites an already-emitted
// output directory in place. Tailwind apply rewrites HTML class attributes,
// stylesheet selectors (plus consolidation), and conservative JS class
// literals. Modules apply proves export maps and remaps those bundler names
// in JS, CSS, and HTML. Tailwind-only apply stays content-hash unless
// `--naming` is set. Modules apply accepts `hash`, `words`, `quotes`, or a
// dialect id. `--theme` or `--vocabulary` for words; `--quotes` for quotes.

const USAGE = `Usage: minwind apply <build-output-directory> [options]

Rewrites a production build's HTML, CSS, and JS with compressed class names.
For bundlers without a minwind plugin (Turbopack, esbuild, Parcel). The
rename registry is computed from your source with the same pre-pass the
plugins run, so output matches what a plugin-equipped build would produce.

Options:
  --root <path>       Site root scanned by the pre-pass (default: cwd)
  --css-entry <path>  Tailwind CSS entry (default: <root>/src/app.css)
  --mode <morph|compress>
                      morph = rename only; compress = rename + consolidation
                      (default: compress)
  --no-consolidate    Alias for --mode morph
  --engines <ids>     Comma-separated engines (default: tailwind)
  --naming <hash|words|quotes|maps|${DIALECT_IDS.join("|")}>
                      Name strategy (default: hash)
  --hash-length <n>   Hash name length (default 4, minimum 4)
  --theme <id>        Built-in words pack (star-wars, klingon, …)
  --vocabulary <path> JSON array of strings; custom words list
                      --naming words requires --theme or --vocabulary
  --quotes <path>     JSON array of sentences; --naming quotes requires this
  --maps <path>       JSON object of word→spelling; --naming maps requires this.
                      With a dialect id, overlays those runs onto the mouth
  --dry-run           Report what would change without writing files

Exit codes:
  0  applied (or dry-run reported)
  1  usage or input error
`;

interface CliOptions {
  dir: string;
  root: string;
  cssEntry: string | undefined;
  consolidate: boolean;
  mode: "morph" | "compress";
  engines: Array<MinwindEngineId>;
  naming: NamingConfig | undefined;
  dryRun: boolean;
}

function readJsonFile(filePath: string, flag: string, shape: string): unknown {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    usageError(`${flag} file not found: ${filePath}`);
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    usageError(`${flag} must be a JSON ${shape}`);
  }
}

function loadJsonStringArray(filePath: string, flag: string): Array<string> {
  const parsed = readJsonFile(filePath, flag, "array of strings");
  if (!Array.isArray(parsed)) {
    usageError(`${flag} must be a JSON array of strings`);
  }
  const words: Array<string> = [];
  for (const item of parsed) {
    if (typeof item !== "string") {
      usageError(`${flag} must be a JSON array of strings`);
    }
    words.push(item);
  }
  return words;
}

function loadJsonStringRecord(
  filePath: string,
  flag: string,
): Record<string, string> {
  const parsed = readJsonFile(filePath, flag, "object of strings");
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    usageError(`${flag} must be a JSON object of strings`);
  }
  const maps: Record<string, string> = {};
  for (const key of Object.keys(parsed)) {
    const value = (parsed as Record<string, unknown>)[key];
    if (typeof value !== "string") {
      usageError(`${flag} must be a JSON object of strings`);
    }
    maps[key] = value;
  }
  return maps;
}

function usageError(message: string): never {
  process.stderr.write(`Error: ${message}\n\n${USAGE}`);
  process.exit(1);
}

function parseThemeId(value: string): ThemeId {
  if (!isThemeId(value)) {
    usageError(
      `--theme must be one of ${THEME_IDS.join(", ")}, got "${value}"`,
    );
  }
  return value;
}

function parseHashLength(raw: string): number {
  const parsed = Number(raw);
  try {
    return resolveNameLength(parsed);
  } catch (error) {
    usageError(error instanceof Error ? error.message : String(error));
  }
}

function parseNamingStrategy(
  value: string,
): "hash" | "words" | "quotes" | "maps" | DialectId {
  if (
    value === "hash" ||
    value === "words" ||
    value === "quotes" ||
    value === "maps" ||
    isDialectId(value)
  ) {
    return value;
  }
  usageError(
    `--naming must be hash, words, quotes, maps, or a dialect id (${DIALECT_IDS.join(", ")}), got "${value}"`,
  );
}

export function parseArgs(argv: Array<string>): CliOptions {
  let dir: string | null = null;
  let root = process.cwd();
  let cssEntry: string | undefined;
  let mode: MinwindMode | undefined;
  let consolidateOverride: boolean | undefined;
  let dryRun = false;
  let enginesValue: string | undefined;
  let namingStrategy:
    "hash" | "words" | "quotes" | "maps" | DialectId | undefined;
  let vocabularyPath: string | undefined;
  let quotesPath: string | undefined;
  let mapsPath: string | undefined;
  let themeId: ThemeId | undefined;
  let hashLength: number | undefined;

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === "--root") {
      const value = argv[i + 1];
      if (value === undefined) usageError("--root requires a value");
      root = value;
      i += 2;
    } else if (arg.startsWith("--root=")) {
      root = arg.slice("--root=".length);
      i += 1;
    } else if (arg === "--css-entry") {
      const value = argv[i + 1];
      if (value === undefined) usageError("--css-entry requires a value");
      cssEntry = value;
      i += 2;
    } else if (arg.startsWith("--css-entry=")) {
      cssEntry = arg.slice("--css-entry=".length);
      i += 1;
    } else if (arg === "--mode") {
      const value = argv[i + 1];
      if (value === undefined) usageError("--mode requires a value");
      if (value !== "morph" && value !== "compress") {
        usageError(`--mode must be morph or compress, got "${value}"`);
      }
      mode = value;
      i += 2;
    } else if (arg.startsWith("--mode=")) {
      const value = arg.slice("--mode=".length);
      if (value !== "morph" && value !== "compress") {
        usageError(`--mode must be morph or compress, got "${value}"`);
      }
      mode = value;
      i += 1;
    } else if (arg === "--no-consolidate") {
      consolidateOverride = false;
      i += 1;
    } else if (arg === "--dry-run") {
      dryRun = true;
      i += 1;
    } else if (arg === "--engines") {
      const value = argv[i + 1];
      if (value === undefined) usageError("--engines requires a value");
      enginesValue = value;
      i += 2;
    } else if (arg.startsWith("--engines=")) {
      enginesValue = arg.slice("--engines=".length);
      i += 1;
    } else if (arg === "--naming") {
      const value = argv[i + 1];
      if (value === undefined) usageError("--naming requires a value");
      namingStrategy = parseNamingStrategy(value);
      i += 2;
    } else if (arg.startsWith("--naming=")) {
      const value = arg.slice("--naming=".length);
      namingStrategy = parseNamingStrategy(value);
      i += 1;
    } else if (arg === "--hash-length") {
      const value = argv[i + 1];
      if (value === undefined) usageError("--hash-length requires a value");
      hashLength = parseHashLength(value);
      i += 2;
    } else if (arg.startsWith("--hash-length=")) {
      hashLength = parseHashLength(arg.slice("--hash-length=".length));
      i += 1;
    } else if (arg === "--vocabulary") {
      const value = argv[i + 1];
      if (value === undefined) usageError("--vocabulary requires a value");
      vocabularyPath = value;
      i += 2;
    } else if (arg.startsWith("--vocabulary=")) {
      vocabularyPath = arg.slice("--vocabulary=".length);
      i += 1;
    } else if (arg === "--quotes") {
      const value = argv[i + 1];
      if (value === undefined) usageError("--quotes requires a value");
      quotesPath = value;
      i += 2;
    } else if (arg.startsWith("--quotes=")) {
      quotesPath = arg.slice("--quotes=".length);
      i += 1;
    } else if (arg === "--theme") {
      const value = argv[i + 1];
      if (value === undefined) usageError("--theme requires a value");
      themeId = parseThemeId(value);
      i += 2;
    } else if (arg.startsWith("--theme=")) {
      themeId = parseThemeId(arg.slice("--theme=".length));
      i += 1;
    } else if (arg === "--maps") {
      const value = argv[i + 1];
      if (value === undefined) usageError("--maps requires a value");
      mapsPath = value;
      i += 2;
    } else if (arg.startsWith("--maps=")) {
      mapsPath = arg.slice("--maps=".length);
      i += 1;
    } else if (arg.startsWith("-")) {
      usageError(`unknown option: ${arg}`);
    } else {
      if (dir !== null) usageError(`unexpected extra argument: ${arg}`);
      dir = arg;
      i += 1;
    }
  }

  if (dir === null) usageError("missing build output directory argument");
  let engines: Array<MinwindEngineId> | undefined;
  if (enginesValue !== undefined) {
    try {
      engines = parseEngineList(enginesValue);
    } catch (error) {
      usageError(error instanceof Error ? error.message : String(error));
    }
  }
  const flags = resolveFlags(process.env, {
    mode,
    engines,
    consolidate: consolidateOverride,
  });
  let naming: NamingConfig | undefined;
  if (themeId !== undefined && namingStrategy === "hash") {
    usageError("--theme requires --naming words");
  }
  if (themeId !== undefined && vocabularyPath !== undefined) {
    usageError("--theme and --vocabulary cannot both be set");
  }
  if (quotesPath !== undefined && namingStrategy === "hash") {
    usageError("--quotes requires --naming quotes");
  }
  if (quotesPath !== undefined && namingStrategy === "words") {
    usageError("--quotes cannot be used with --naming words");
  }
  if (
    quotesPath !== undefined &&
    (themeId !== undefined || vocabularyPath !== undefined)
  ) {
    usageError("--quotes cannot be used with --theme or --vocabulary");
  }
  if (namingStrategy !== undefined && isDialectId(namingStrategy)) {
    if (
      themeId !== undefined ||
      vocabularyPath !== undefined ||
      quotesPath !== undefined
    ) {
      usageError(
        `--naming ${namingStrategy} cannot be used with --theme, --vocabulary, or --quotes`,
      );
    }
    if (hashLength !== undefined) {
      usageError(
        `--naming ${namingStrategy} cannot be used with --hash-length`,
      );
    }
    naming = { strategy: namingStrategy };
    if (mapsPath !== undefined) {
      naming.maps = loadJsonStringRecord(mapsPath, "--maps");
    }
  } else if (namingStrategy === "maps" || mapsPath !== undefined) {
    if (namingStrategy !== undefined && namingStrategy !== "maps") {
      usageError("--maps requires --naming maps");
    }
    if (mapsPath === undefined) {
      usageError("--naming maps requires --maps");
    }
    if (
      themeId !== undefined ||
      vocabularyPath !== undefined ||
      quotesPath !== undefined
    ) {
      usageError(
        "--naming maps cannot be used with --theme, --vocabulary, or --quotes",
      );
    }
    if (hashLength !== undefined) {
      usageError("--naming maps cannot be used with --hash-length");
    }
    naming = {
      strategy: "maps",
      maps: loadJsonStringRecord(mapsPath, "--maps"),
    };
  } else if (namingStrategy === "quotes" || quotesPath !== undefined) {
    if (quotesPath === undefined) {
      usageError("--naming quotes requires --quotes");
    }
    naming = {
      strategy: "quotes",
      quotes: loadJsonStringArray(quotesPath, "--quotes"),
    };
    if (hashLength !== undefined) naming.length = hashLength;
  } else if (namingStrategy === "words" || themeId !== undefined) {
    if (themeId === undefined && vocabularyPath === undefined) {
      usageError("--naming words requires --theme or --vocabulary");
    }
    naming = { strategy: "words" };
    if (themeId !== undefined) naming.theme = themeId;
    if (vocabularyPath !== undefined) {
      naming.vocabulary = loadJsonStringArray(vocabularyPath, "--vocabulary");
    }
    if (hashLength !== undefined) naming.length = hashLength;
  } else if (namingStrategy === "hash" || hashLength !== undefined) {
    naming = { strategy: "hash" };
    if (hashLength !== undefined) naming.length = hashLength;
  }
  return {
    dir,
    root,
    cssEntry,
    consolidate: flags.consolidate,
    mode: flags.mode,
    engines: flags.engines,
    naming,
    dryRun,
  };
}

export async function runApplyCli(argv: Array<string>): Promise<number> {
  const options = parseArgs(argv);
  if (!fs.existsSync(options.dir) || !fs.statSync(options.dir).isDirectory()) {
    process.stderr.write(
      `Error: ${options.dir} is not a directory\n\n${USAGE}`,
    );
    return 1;
  }
  const prepass = isModulesOnly(options.engines)
    ? emptyPrepassResult()
    : await runPrepass({
        root: options.root,
        cssEntry: options.cssEntry ?? path.join(options.root, "src", "app.css"),
        naming: options.naming,
      });
  const modulesPrepared = enginesInclude(options.engines, "css-modules")
    ? prepareModulesNaming(
        options.root,
        options.naming,
        isModulesOnly(options.engines)
          ? undefined
          : reservedFromRegistry(prepass.registry),
      )
    : undefined;
  const modules =
    modulesPrepared === undefined
      ? undefined
      : {
          root: options.root,
          inventory: modulesPrepared.inventory,
          registry: modulesPrepared.registry,
        };
  if (modules !== undefined && !isModulesOnly(options.engines)) {
    assertSharedCollision(prepass.registry, modules.registry);
  }
  if (options.consolidate) {
    assertConsolidatedNames(prepass.registry, prepass.consolidationVerdicts);
  }
  const result = applyBuildOutput({
    dir: options.dir,
    registry: prepass.registry,
    consolidationVerdicts: prepass.consolidationVerdicts,
    consolidate: options.consolidate,
    dryRun: options.dryRun,
    modules,
  });
  if (!options.dryRun) {
    // Artifacts publish to the site root's .output/minwind — the same
    // convention as the plugins, so `minwind report` finds them and the
    // deployable output directory stays clean. The report's registry view
    // reflects the skip-and-warn drops as runtime-context exclusions.
    const effective = filterRegistry(
      prepass.registry,
      new Set(result.keptOriginal),
    );
    const report = buildReport({
      registry: effective,
      verdicts: prepass.consolidationVerdicts,
      warnings: result.warnings,
      consolidate: options.consolidate,
      mode: options.mode,
    });
    const map = buildRenameMap(effective, prepass.consolidationVerdicts);
    await writeArtifacts(options.root, report, map);
  }
  const renamed =
    prepass.registry.entries().length +
    (modules === undefined ? 0 : modules.registry.entries().length) -
    result.keptOriginal.length;
  process.stdout.write(
    `minwind apply${options.dryRun ? " (dry run)" : ""}: renamed ${renamed}` +
      ` class(es) across ${result.rewrittenFiles} file(s)` +
      ` (${result.htmlFiles} html, ${result.cssFiles} css,` +
      ` ${result.jsFiles} js scanned)` +
      (result.consolidated > 0
        ? `; consolidated ${result.consolidated} list(s)`
        : "") +
      (result.keptOriginal.length > 0
        ? `\n  kept original names for ${result.keptOriginal.length}` +
          ` token(s) in unrewritable positions: ${result.keptOriginal.join(", ")}`
        : "") +
      (result.warnings.length > 0
        ? `\n  ${result.warnings.length} warning(s) — inspect before deploy`
        : "") +
      "\n",
  );
  return 0;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  process.exitCode = await runApplyCli(process.argv.slice(2));
}
