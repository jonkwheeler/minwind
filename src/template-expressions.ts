import type * as ts from "typescript";
import type { BraceRun } from "./brace-runs.js";
import { parseSourceModule } from "./class-contexts.js";

// parseDiagnostics is internal in the TypeScript typings.
export function parsesCleanly(sourceFile: ts.SourceFile): boolean {
  const parsed = sourceFile as unknown as {
    parseDiagnostics: ReadonlyArray<ts.Diagnostic>;
  };
  return parsed.parseDiagnostics.length === 0;
}

// An expression parsed alone, wrapped in parentheses, or null when it does
// not parse. Positions map back by the wrapper's one byte.
export function parseExpression(
  filePath: string,
  expression: string,
  expressionStart: number,
  kind: "ts" | "tsx",
): ParsedRun | null {
  const sourceFile = parseSourceModule(
    `${filePath}::expression.${kind}`,
    `(${expression})`,
  );
  if (!parsesCleanly(sourceFile)) return null;
  return {
    sourceFile,
    toOriginal: function (position) {
      return position + expressionStart - 1;
    },
  };
}

// An Astro brace run parsed alone as TSX. toOriginal maps a position in the
// parse back into the file.
export interface ParsedRun {
  sourceFile: ts.SourceFile;
  toOriginal: (position: number) => number;
}

// KTD4: a brace run is parsed alone as TSX, wrapped as `(` + content + `)`.
// The copy closes each unclosed void element (<img ...> becomes <img .../>),
// and spans map back through the inserted bytes. A run TSX still rejects (an
// HTML comment, an unquoted attribute value) parses to null.
export function parseBraceRun(
  filePath: string,
  templateText: string,
  run: BraceRun,
): ParsedRun | null {
  const contentStart = run.start + 1;
  const insertedSlashOffsets: Array<number> = [];
  let copy = "(";
  let cursor = contentStart;
  for (const tagEnd of run.voidTagEnds) {
    copy += templateText.slice(cursor, tagEnd);
    insertedSlashOffsets.push(copy.length);
    copy += "/";
    cursor = tagEnd;
  }
  copy += `${templateText.slice(cursor, run.end - 1)})`;
  const sourceFile = parseSourceModule(`${filePath}::expression.tsx`, copy);
  if (!parsesCleanly(sourceFile)) return null;
  return {
    sourceFile,
    toOriginal: function (position) {
      let before = 1;
      for (const at of insertedSlashOffsets) {
        if (at >= position) break;
        before += 1;
      }
      return contentStart + position - before;
    },
  };
}
