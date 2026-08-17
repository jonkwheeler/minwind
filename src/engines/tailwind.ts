import { readFile } from "node:fs/promises";
import path from "node:path";
import { compile } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";
import type { StyleEngine } from "./types.js";

export const tailwindEngine: StyleEngine = {
  id: "tailwind",
  requiresCssEntry: true,
};

export interface TailwindStylesheet {
  stylesheet: string;
}

function scannerSources(
  compilerRoot: "none" | { base: string; pattern: string } | null,
  explicitSources: Array<{ base: string; pattern: string; negated: boolean }>,
  projectRoot: string,
): Array<{ base: string; pattern: string; negated: boolean }> {
  let automatic: Array<{ base: string; pattern: string; negated: boolean }>;
  if (compilerRoot === "none") {
    automatic = [];
  } else if (compilerRoot === null) {
    automatic = [{ base: projectRoot, pattern: "**/*", negated: false }];
  } else {
    automatic = [
      {
        base: compilerRoot.base,
        pattern: compilerRoot.pattern,
        negated: false,
      },
    ];
  }
  return automatic.concat(explicitSources);
}

export async function compileTailwindStylesheet(options: {
  cssEntry: string;
  root: string;
}): Promise<TailwindStylesheet> {
  let css: string;
  try {
    css = await readFile(options.cssEntry, "utf8");
  } catch (cause) {
    throw new Error(
      `minwind: Tailwind engine could not read cssEntry ${options.cssEntry}:` +
        ` ${String(cause)}`,
      { cause },
    );
  }

  let compiler;
  try {
    compiler = await compile(css, {
      base: path.dirname(options.cssEntry),
      shouldRewriteUrls: true,
      onDependency: function () {},
    });
  } catch (cause) {
    throw new Error(
      `minwind: pre-pass failed to compile ${options.cssEntry}: ${String(cause)}`,
      { cause },
    );
  }

  const scanner = new Scanner({
    sources: scannerSources(compiler.root, compiler.sources, options.root),
  });
  const candidates = scanner.scan();

  let stylesheet: string;
  try {
    stylesheet = compiler.build(candidates);
  } catch (cause) {
    throw new Error(
      `minwind: pre-pass failed to build ${options.cssEntry}: ${String(cause)}`,
      { cause },
    );
  }

  return { stylesheet };
}
