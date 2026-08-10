import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

// minwind report subcommand (R11 companion): prints a human summary of the
// latest .output/minwind/report.json. Read-only; exit 1 on a missing or
// malformed report.

const USAGE = `Usage: minwind report [path-to-report.json]

Prints the summary of the latest minwind build report. Defaults to
.output/minwind/report.json relative to the current directory.
`;

interface ReportShape {
  flags?: { enabled?: boolean; consolidate?: boolean };
  summary?: {
    renamed?: number;
    excluded?: number;
    consolidatedRules?: number;
    warnings?: number;
  };
  exclusions?: Array<{ token?: string; reason?: string }>;
  consolidation?: {
    verdicts?: Array<{
      tokens?: Array<string>;
      frequency?: number;
      safe?: boolean;
      reason?: string;
      name?: string;
    }>;
  };
  warnings?: Array<{
    kind?: string;
    id?: string;
    fileName?: string;
    line?: number;
    column?: number;
    token?: string;
    selector?: string;
    message?: string;
  }>;
}

function location(warning: {
  id?: string;
  fileName?: string;
  line?: number;
  column?: number;
}): string {
  const file = warning.id ?? warning.fileName ?? "?";
  const at =
    warning.line !== undefined ? `:${warning.line}:${warning.column ?? 0}` : "";
  return `${file}${at}`;
}

export async function runReportCli(args: Array<string>): Promise<number> {
  if (args.length > 1 || args[0] === "--help" || args[0] === "-h") {
    process.stdout.write(USAGE);
    return args.length > 1 ? 1 : 0;
  }
  const reportPath = path.resolve(
    args[0] ?? path.join(".output", "minwind", "report.json"),
  );

  return readFile(reportPath, "utf8")
    .then(function (text) {
      const report = JSON.parse(text) as ReportShape;
      const summary = report.summary ?? {};
      const flags = report.flags ?? {};
      const lines: Array<string> = [];
      lines.push(`minwind report: ${reportPath}`);
      lines.push(
        `flags: enabled=${String(flags.enabled)} consolidate=${String(flags.consolidate)}`,
      );
      lines.push(
        `renamed: ${summary.renamed ?? 0}  excluded: ${summary.excluded ?? 0}  ` +
          `consolidated rules: ${summary.consolidatedRules ?? 0}  ` +
          `warnings: ${summary.warnings ?? 0}`,
      );

      const exclusions = report.exclusions ?? [];
      if (exclusions.length > 0) {
        lines.push("", "exclusions:");
        for (const entry of exclusions) {
          lines.push(`  ${entry.token ?? "?"} (${entry.reason ?? "?"})`);
        }
      }

      const verdicts = report.consolidation?.verdicts ?? [];
      if (verdicts.length > 0) {
        lines.push("", "consolidation verdicts:");
        for (const verdict of verdicts) {
          const tokens = (verdict.tokens ?? []).join(" ");
          lines.push(
            verdict.safe === true
              ? `  ${verdict.name ?? "?"} <- ${tokens} (x${verdict.frequency ?? "?"})`
              : `  [skipped: ${verdict.reason ?? "?"}] ${tokens} (x${verdict.frequency ?? "?"})`,
          );
        }
      }

      const warnings = report.warnings ?? [];
      if (warnings.length > 0) {
        lines.push("", "warnings:");
        for (const warning of warnings) {
          const detail = warning.token ?? warning.selector ?? "";
          lines.push(
            `  [${warning.kind ?? "?"}] ${location(warning)} ${detail}`.trimEnd(),
          );
        }
      }

      process.stdout.write(lines.join("\n") + "\n");
      return 0;
    })
    .catch(function (cause: unknown) {
      process.stderr.write(
        `Error: cannot read ${reportPath}: ${
          cause instanceof Error ? cause.message : String(cause)
        }\n`,
      );
      return 1;
    });
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  process.exitCode = await runReportCli(process.argv.slice(2));
}
