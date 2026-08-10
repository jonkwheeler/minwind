#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { computeProminence, type ProminencePage } from "./prominence.js";

const USAGE = `Usage: minwind prominence <build-output-directory> [options]

Scans prerendered HTML for class attributes in document order and writes a
prominence manifest mapping each original class token to the index of the
first class-bearing element it appears on (minimum across pages). Pass the
manifest's tokens to the words strategy's prominence option so the DOM
shell — the elements a devtools inspector meets first — draws the
vocabulary's most iconic names.

Generate the manifest from a minwind-off build so the DOM carries the
original class names:

  MINWIND=off pnpm build
  minwind prominence .output/public
  pnpm build

Options:
  --out <path>     Manifest destination (default: minwind.prominence.json)
  --window <n>     Record tokens first-seen within the first n
                   class-bearing elements (default: 32)

Exit codes:
  0  manifest written
  1  usage or input error
`;

const DEFAULT_WINDOW = 32;

interface CliOptions {
  buildDir: string;
  out: string;
  window: number;
}

function usageError(message: string): never {
  process.stderr.write(`Error: ${message}\n\n${USAGE}`);
  process.exit(1);
}

function parseWindow(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    usageError(`--window must be a positive integer, got "${value}"`);
  }
  return parsed;
}

export function parseArgs(argv: Array<string>): CliOptions {
  let buildDir: string | null = null;
  let out = "minwind.prominence.json";
  let window = DEFAULT_WINDOW;

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === "--out") {
      const value = argv[i + 1];
      if (value === undefined) usageError("--out requires a value");
      out = value;
      i += 2;
    } else if (arg.startsWith("--out=")) {
      out = arg.slice("--out=".length);
      i += 1;
    } else if (arg === "--window") {
      const value = argv[i + 1];
      if (value === undefined) usageError("--window requires a value");
      window = parseWindow(value);
      i += 2;
    } else if (arg.startsWith("--window=")) {
      window = parseWindow(arg.slice("--window=".length));
      i += 1;
    } else if (arg.startsWith("-")) {
      usageError(`unknown option: ${arg}`);
    } else {
      if (buildDir !== null) usageError(`unexpected extra argument: ${arg}`);
      buildDir = arg;
      i += 1;
    }
  }

  if (buildDir === null) usageError("missing build output directory argument");
  return { buildDir, out, window };
}

function walkHtmlFiles(directory: string): Array<string> {
  const files: Array<string> = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkHtmlFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      files.push(full);
    }
  }
  return files;
}

export function runProminenceCli(argv: Array<string>): number {
  const options = parseArgs(argv);
  if (
    !fs.existsSync(options.buildDir) ||
    !fs.statSync(options.buildDir).isDirectory()
  ) {
    process.stderr.write(
      `Error: ${options.buildDir} is not a directory\n\n${USAGE}`,
    );
    return 1;
  }
  const htmlFiles = walkHtmlFiles(options.buildDir);
  if (htmlFiles.length === 0) {
    process.stderr.write(
      `Error: no .html files under ${options.buildDir}\n`,
    );
    return 1;
  }
  const pages: Array<ProminencePage> = htmlFiles.map(function (file) {
    return {
      path: path.relative(options.buildDir, file),
      html: fs.readFileSync(file, "utf8"),
    };
  });
  const manifest = computeProminence(pages, options.window);
  fs.writeFileSync(options.out, JSON.stringify(manifest, null, 2) + "\n");
  const count = Object.keys(manifest.tokens).length;
  process.stdout.write(
    `minwind prominence: ${count} token(s) first-seen within the first` +
      ` ${manifest.window} class-bearing elements across` +
      ` ${manifest.pages} page(s)\n` +
      `  wrote ${options.out}\n` +
      "  wire it into the words strategy:\n" +
      "    naming: { strategy: 'words', vocabulary, prominence: manifest.tokens }\n",
  );
  return 0;
}

// Direct execution (tsx src/prominence-cli.ts) runs the CLI; the minwind
// bin imports runProminenceCli instead.
const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  process.exitCode = runProminenceCli(process.argv.slice(2));
}
