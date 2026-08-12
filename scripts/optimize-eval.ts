import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

// Flat JSON measurement harness for /ce-optimize compression-savings runs.
// Runs unit tests, builds the package, then the compare gate, and emits
// scalar metrics the experiment log can gate and rank on.

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

interface CompareSizes {
  brotliDeltaBytes?: number;
  brotliDeltaPercent?: number;
  rawDeltaBytes?: number;
}

interface CompareClassLength {
  dropPercent?: number | null;
}

interface ComparePayload {
  passed?: boolean;
  sizes?: CompareSizes;
  classLength?: CompareClassLength;
  durationMs?: number;
}

interface HarnessReport {
  compare?: ComparePayload;
  wallClockMs?: number;
  upperBound?: {
    renameArmPercent?: number;
    upperBoundPercent?: number;
  } | null;
}

interface Metrics {
  brotli_saved_bytes: number;
  compare_passed: number;
  unit_tests_passed: number;
  class_length_drop_percent: number;
  raw_saved_bytes: number;
  brotli_delta_percent: number;
  rename_arm_percent: number;
  upper_bound_percent: number;
  compare_duration_ms: number;
  wall_clock_ms: number;
}

function run(
  command: string,
  args: Array<string>,
  options: { cwd?: string; inheritStderr?: boolean } = {},
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: process.env,
  });
  if (options.inheritStderr !== false && result.stderr) {
    process.stderr.write(result.stderr);
  }
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function emit(metrics: Metrics): void {
  process.stdout.write(JSON.stringify(metrics) + "\n");
}

// compare --json writes the report to stdout, but site builds also print
// vinxi/vite noise on the same stream. Walk candidates from the end until
// a parseable harness report with compare.sizes appears.
function extractCompareReport(stdout: string): HarnessReport {
  let searchFrom = stdout.length;
  while (searchFrom > 0) {
    const start = stdout.lastIndexOf("\n{", searchFrom);
    const absoluteStart =
      start === -1 ? (stdout.startsWith("{") ? 0 : -1) : start + 1;
    if (absoluteStart === -1) {
      break;
    }
    const candidate = stdout.slice(absoluteStart).trim();
    try {
      const parsed = JSON.parse(candidate) as HarnessReport;
      if (parsed.compare?.sizes !== undefined) {
        return parsed;
      }
    } catch {
      // try an earlier brace
    }
    searchFrom = absoluteStart - 1;
  }
  throw new Error("no compare JSON object found in harness stdout");
}

function main(): number {
  const unit = run("pnpm", ["run", "test:unit"]);
  const unitPassed = unit.status === 0 ? 1 : 0;
  if (!unitPassed) {
    emit({
      brotli_saved_bytes: 0,
      compare_passed: 0,
      unit_tests_passed: 0,
      class_length_drop_percent: 0,
      raw_saved_bytes: 0,
      brotli_delta_percent: 0,
      rename_arm_percent: 0,
      upper_bound_percent: 0,
      compare_duration_ms: 0,
      wall_clock_ms: 0,
    });
    return 0;
  }

  const build = run("pnpm", ["run", "build"]);
  if (build.status !== 0) {
    process.stderr.write("optimize-eval: package build failed\n");
    emit({
      brotli_saved_bytes: 0,
      compare_passed: 0,
      unit_tests_passed: 1,
      class_length_drop_percent: 0,
      raw_saved_bytes: 0,
      brotli_delta_percent: 0,
      rename_arm_percent: 0,
      upper_bound_percent: 0,
      compare_duration_ms: 0,
      wall_clock_ms: 0,
    });
    return 0;
  }

  const compare = run("pnpm", ["exec", "tsx", "harness/compare.ts", "--json"]);
  let report: HarnessReport;
  try {
    report = extractCompareReport(compare.stdout);
  } catch (cause) {
    process.stderr.write(
      "optimize-eval: failed to parse compare JSON: " +
        (cause instanceof Error ? cause.message : String(cause)) +
        "\n",
    );
    return 2;
  }

  const payload = report.compare;
  if (payload === undefined || payload.sizes === undefined) {
    process.stderr.write("optimize-eval: compare JSON missing compare.sizes\n");
    return 2;
  }

  const brotliDeltaBytes = payload.sizes.brotliDeltaBytes ?? 0;
  const rawDeltaBytes = payload.sizes.rawDeltaBytes ?? 0;
  const dropPercent = payload.classLength?.dropPercent;
  const upperBound = report.upperBound;

  emit({
    // on - off; more negative means smaller on-build. Flip sign so maximize
    // means more bytes saved.
    brotli_saved_bytes: -brotliDeltaBytes,
    compare_passed: payload.passed === true ? 1 : 0,
    unit_tests_passed: 1,
    class_length_drop_percent: dropPercent ?? 0,
    raw_saved_bytes: -rawDeltaBytes,
    brotli_delta_percent: payload.sizes.brotliDeltaPercent ?? 0,
    rename_arm_percent: upperBound?.renameArmPercent ?? 0,
    upper_bound_percent: upperBound?.upperBoundPercent ?? 0,
    compare_duration_ms: payload.durationMs ?? 0,
    wall_clock_ms: report.wallClockMs ?? 0,
  });
  return 0;
}

process.exitCode = main();
