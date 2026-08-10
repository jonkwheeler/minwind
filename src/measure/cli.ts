import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { simulateBaseline } from "./arms/baseline.js";
import { simulateConsolidate } from "./arms/consolidate.js";
import { simulateRename } from "./arms/rename.js";
import {
  discoverBuild,
  InputError,
  InvalidUtf8Error,
  type DiscoveredBuild,
} from "./discover.js";
import { buildClassModel } from "./exclusions.js";
import {
  DEFAULT_THRESHOLD_PERCENT,
  NoQualifiedStylesheetError,
  measureBuild,
  type ArmResults,
  type Measurement,
} from "./measure.js";
import {
  ReportPathError,
  assertReportPathOutside,
  buildJsonReport,
  readToolMeta,
  renderDiscoveryReport,
  renderMeasurementReport,
  runtimeVersionWarning,
  type ReportContext,
} from "./report.js";
import { buildSimulationInput } from "./span-edit.js";
import { relativeToBuild } from "./util.js";

const USAGE = `Usage: minwind measure <build-output-directory> [options]

Measures whether Tailwind classname compression pays for itself after
gzip/Brotli on an existing production build. v1 is report-only and
read-only against the build directory.

Options:
  --threshold <n>      Whole-site Brotli savings percent required for a
                       "potentially worth it" verdict (default: 5)
  --json               Emit the full report as JSON, including the CLI
                       version, runtime compression versions, and SHA-256
                       input hashes
  --report-path <path> Also write the report to a file; the destination
                       must be outside the analyzed directory

Exit codes:
  0  analysis completed
  1  usage, input, or measurement-qualification error
  2  completed with skipped files
`;

interface CliOptions {
  buildDir: string;
  threshold: number | null;
  json: boolean;
  reportPath: string | null;
}

function usageError(message: string): never {
  process.stderr.write(`Error: ${message}\n\n${USAGE}`);
  process.exit(1);
}

export function parseArgs(argv: Array<string>): CliOptions {
  let buildDir: string | null = null;
  let threshold: number | null = null;
  let json = false;
  let reportPath: string | null = null;

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === "--json") {
      json = true;
      i += 1;
    } else if (arg === "--threshold") {
      const value = argv[i + 1];
      if (value === undefined) usageError("--threshold requires a value");
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < 0) {
        usageError(`--threshold must be a non-negative number, got "${value}"`);
      }
      threshold = parsed;
      i += 2;
    } else if (arg.startsWith("--threshold=")) {
      const value = arg.slice("--threshold=".length);
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < 0) {
        usageError(`--threshold must be a non-negative number, got "${value}"`);
      }
      threshold = parsed;
      i += 1;
    } else if (arg === "--report-path") {
      const value = argv[i + 1];
      if (value === undefined) usageError("--report-path requires a value");
      reportPath = value;
      i += 2;
    } else if (arg.startsWith("--report-path=")) {
      reportPath = arg.slice("--report-path=".length);
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
  return { buildDir, threshold, json, reportPath };
}

function relativePath(build: DiscoveredBuild, file: string): string {
  return relativeToBuild(build.buildDir, file);
}

function discoverOrExit(buildDirArg: string): DiscoveredBuild {
  try {
    return discoverBuild(buildDirArg);
  } catch (error) {
    if (error instanceof InputError) {
      process.stderr.write(`Error: ${error.message}\n\n${USAGE}`);
      process.exit(1);
    }
    if (error instanceof InvalidUtf8Error) {
      process.stderr.write(`Error: ${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }
}

function checkReportPath(build: DiscoveredBuild, reportPath: string): void {
  try {
    assertReportPathOutside(build.buildDir, reportPath);
  } catch (error) {
    if (error instanceof ReportPathError) {
      process.stderr.write(`Error: ${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }
}

// Returns the exit code instead of calling process.exit on the success and
// gate-abort paths: process.exit can truncate a large piped stdout payload
// (observed at 8192 bytes), while exitCode lets the stream drain first.
export function runMeasureCli(argv: Array<string>): number {
  const options = parseArgs(argv);

  const meta = readToolMeta();
  const runtimeWarning = runtimeVersionWarning(
    meta.enginesNode,
    process.version,
  );
  if (runtimeWarning !== null) {
    process.stderr.write(`Warning: ${runtimeWarning}\n`);
  }

  const build = discoverOrExit(options.buildDir);
  if (options.reportPath !== null) {
    checkReportPath(build, options.reportPath);
  }

  for (const warning of build.warnings) {
    process.stderr.write(`Warning: ${warning}\n`);
  }

  const classModel = buildClassModel(build);
  for (const skipped of classModel.skippedFiles) {
    process.stderr.write(
      `Warning: skipped ${relativePath(build, skipped.filePath)}: ` +
        `${skipped.reason}\n`,
    );
  }
  for (const warning of classModel.parseWarnings) {
    process.stderr.write(
      `Warning: ${relativePath(build, warning.filePath)}: ` +
        `${warning.reason}\n`,
    );
  }

  // Transform simulation arms (R3): baseline, rename, and consolidate run
  // over everything discovered. Arms are pure and read-only (R6).
  const simulationInput = buildSimulationInput(build, classModel);
  const armResults: ArmResults = {
    baseline: simulateBaseline(simulationInput),
    rename: simulateRename(simulationInput),
    consolidate: simulateConsolidate(simulationInput),
  };
  const context: ReportContext = {
    build,
    model: classModel,
    armSummaries: [
      armResults.baseline.summary,
      armResults.rename.summary,
      armResults.consolidate.summary,
    ],
  };

  // The zero report: with no HTML entry points there is nothing to measure
  // and no verdict to compute, so the qualification gate does not apply.
  let measurement: Measurement | null = null;
  if (build.htmlFiles.length > 0) {
    try {
      measurement = measureBuild(simulationInput, armResults, {
        thresholdPercent: options.threshold ?? DEFAULT_THRESHOLD_PERCENT,
      });
    } catch (error) {
      if (error instanceof NoQualifiedStylesheetError) {
        if (!options.json) {
          process.stdout.write(renderDiscoveryReport(context));
        }
        process.stderr.write(`Error: ${error.message}\n`);
        return 1;
      }
      throw error;
    }
  }

  const payload = options.json
    ? JSON.stringify(buildJsonReport(context, measurement, meta), null, 2) +
      "\n"
    : renderDiscoveryReport(context) +
      (measurement === null ? "" : renderMeasurementReport(measurement));

  if (options.reportPath !== null) {
    fs.writeFileSync(options.reportPath, payload);
  }
  process.stdout.write(payload);
  return classModel.skippedFiles.length > 0 ? 2 : 0;
}

// Direct execution (tsx src/measure/cli.ts, as the harness and tests spawn
// it) runs the CLI; the minwind bin imports runMeasureCli instead.
const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  process.exitCode = runMeasureCli(process.argv.slice(2));
}
