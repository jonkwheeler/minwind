import assert from "node:assert";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { simulateBaseline } from "../../src/measure/arms/baseline.js";
import { simulateConsolidate } from "../../src/measure/arms/consolidate.js";
import { simulateRename } from "../../src/measure/arms/rename.js";
import { discoverBuild } from "../../src/measure/discover.js";
import { buildClassModel } from "../../src/measure/exclusions.js";
import { measureBuild, type Measurement } from "../../src/measure/measure.js";
import {
  ReportPathError,
  assertReportPathOutside,
  buildJsonReport,
  readToolMeta,
  renderDiscoveryReport,
  renderMeasurementReport,
  runtimeVersionWarning,
  type ReportContext,
} from "../../src/measure/report.js";
import { buildSimulationInput } from "../../src/measure/span-edit.js";
import { BUILD_DIR, assertDemoBuild, buildGate } from "./helpers/build-gate.js";

const execFileAsync = promisify(execFile);
const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(TEST_DIR, "fixtures");
const CLI_PATH = path.resolve(TEST_DIR, "../../src/measure/cli.ts");
const RENAME_SITE = path.join(FIXTURES_DIR, "arm-rename");
const STRADDLE_SITE = path.join(FIXTURES_DIR, "measure-straddle");
const NEGATIVE_SITE = path.join(FIXTURES_DIR, "measure-negative");
const PLAIN_SITE = path.join(FIXTURES_DIR, "site");

const PACKAGE_VERSION = (
  JSON.parse(
    fs.readFileSync(path.resolve(TEST_DIR, "../../package.json"), "utf8"),
  ) as { version: string }
).version;

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

async function runCli(args: Array<string>): Promise<RunResult> {
  try {
    const result = await execFileAsync("pnpm", ["tsx", CLI_PATH, ...args], {
      cwd: path.resolve(TEST_DIR, "../.."),
    });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const err = error as {
      code?: number;
      stdout?: string;
      stderr?: string;
    };
    return {
      code: typeof err.code === "number" ? err.code : -1,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
    };
  }
}

function reportFor(
  dir: string,
  thresholdPercent?: number,
): { context: ReportContext; measurement: Measurement } {
  const build = discoverBuild(dir);
  const model = buildClassModel(build);
  const input = buildSimulationInput(build, model);
  const arms = {
    baseline: simulateBaseline(input),
    rename: simulateRename(input),
    consolidate: simulateConsolidate(input),
  };
  const context: ReportContext = {
    build,
    model,
    armSummaries: [
      arms.baseline.summary,
      arms.rename.summary,
      arms.consolidate.summary,
    ],
  };
  const measurement = measureBuild(input, arms, { thresholdPercent });
  return { context, measurement };
}

describe("terminal measurement report", () => {
  it("labels per-route rows as cold-cache and never sums them", () => {
    const { measurement } = reportFor(RENAME_SITE);
    const report = renderMeasurementReport(measurement);
    assert.match(report, /cold cache/i);
    assert.match(report, /never summed/i);
    assert.match(report, /index\.html/);
  });

  it("renders whole-site rows for every arm plus the upper bound", () => {
    const { measurement } = reportFor(RENAME_SITE);
    const report = renderMeasurementReport(measurement);
    assert.match(report, /whole-site/i);
    assert.match(report, /baseline/);
    assert.match(report, /rename/);
    assert.match(report, /consolidate/);
    assert.match(report, /upper bound \(ignoring JS-reference exclusions\)/i);
  });

  it("states the estimate nature and the JS measurement scope", () => {
    const { measurement } = reportFor(RENAME_SITE);
    const report = renderMeasurementReport(measurement);
    assert.match(report, /static precompression estimates/i);
    assert.match(report, /out of measurement scope/i);
    assert.match(report, /never simulated/i);
  });

  it("shows not-worth-it verdicts with per-route and total numbers", () => {
    const { measurement } = reportFor(RENAME_SITE, 100);
    const report = renderMeasurementReport(measurement);
    assert.match(report, /rename:\s+NOT WORTH IT/);
    assert.match(report, /consolidate:\s+NOT WORTH IT/);
    assert.match(report, /100\.0%/);
    assert.match(report, /\d+ B \(/);
  });

  it("marks an at-threshold rename as potentially worth it with the caveat", () => {
    const { measurement } = reportFor(RENAME_SITE, 0);
    const report = renderMeasurementReport(measurement);
    assert.match(report, /rename:\s+POTENTIALLY WORTH IT/);
    assert.match(report, /best-case/i);
  });

  it("annotates a verdict whose upper bound straddles the threshold", () => {
    const probe = reportFor(STRADDLE_SITE, 0);
    const rename = probe.measurement.arms.find(function (arm) {
      return arm.arm === "rename";
    });
    assert.ok(rename);
    const threshold =
      (-rename.brotliDeltaPercent +
        -probe.measurement.upperBoundRename.brotliDeltaPercent) /
      2;
    const { measurement } = reportFor(STRADDLE_SITE, threshold);
    const report = renderMeasurementReport(measurement);
    assert.match(report, /rename:\s+NOT WORTH IT/);
    assert.match(report, /low confidence/i);
  });

  it("reports a net-negative consolidate delta as-is", () => {
    const { measurement } = reportFor(NEGATIVE_SITE);
    const consolidate = measurement.arms.find(function (arm) {
      return arm.arm === "consolidate";
    });
    assert.ok(consolidate);
    assert.ok(consolidate.brotliDeltaBytes > 0);
    const report = renderMeasurementReport(measurement);
    const row = report.split("\n").find(function (line) {
      return line.startsWith("  consolidate");
    });
    assert.ok(row, "expected a whole-site row for consolidate");
    assert.match(row, /\+\d+ B \(\+\d+\.\d%\)/);
    assert.match(report, /consolidate:\s+NOT WORTH IT/);
  });
});

describe("discovery report exclusions", () => {
  it("lists excluded classes by category with byte shares", () => {
    const { context } = reportFor(RENAME_SITE);
    const report = renderDiscoveryReport(context);
    assert.match(report, /js-referenced \(1\)/);
    assert.match(report, /js-locked/);
    assert.match(report, /marker \(1\)/);
    assert.match(report, /excluded class-token bytes/i);
    assert.match(report, /js-referenced: \d+\.\d%/);
  });
});

describe("json report", () => {
  it("carries tool version, runtime compression versions, and input hashes", () => {
    const { context, measurement } = reportFor(RENAME_SITE);
    const meta = readToolMeta();
    const report = buildJsonReport(context, measurement, meta);
    assert.strictEqual(report.tool.name, "minwind");
    assert.strictEqual(report.tool.version, PACKAGE_VERSION);
    assert.strictEqual(report.runtime.node, process.versions.node);
    assert.strictEqual(typeof report.runtime.zlib, "string");
    assert.strictEqual(typeof report.runtime.brotli, "string");
    assert.strictEqual(report.thresholdPercent, 5);
    assert.ok(report.measurement !== null);
    assert.strictEqual(report.measurement.inputHashes.length, 2);
    assert.match(report.measurement.inputHashes[0].sha256, /^[0-9a-f]{64}$/);
    assert.ok(Array.isArray(report.measurement.routes));
    assert.ok(Array.isArray(report.measurement.arms));
    assert.ok(report.measurement.upperBoundRename !== undefined);
    assert.ok(report.measurement.coverage !== undefined);
  });
});

describe("report path guard", () => {
  const buildDir = path.join(path.sep, "tmp", "minwind-guard", "dist");

  it("refuses destinations inside the analyzed directory", () => {
    assert.throws(function () {
      assertReportPathOutside(buildDir, path.join(buildDir, "report.json"));
    }, ReportPathError);
    assert.throws(function () {
      assertReportPathOutside(
        buildDir,
        path.join(buildDir, "nested", "report.json"),
      );
    }, ReportPathError);
    assert.throws(function () {
      assertReportPathOutside(buildDir, buildDir);
    }, ReportPathError);
  });

  it("accepts destinations outside or beside the analyzed directory", () => {
    assertReportPathOutside(
      buildDir,
      path.join(path.sep, "tmp", "report.json"),
    );
    assertReportPathOutside(
      buildDir,
      path.join(path.sep, "tmp", "minwind-guard", "dist-report.json"),
    );
  });

  it("refuses a destination inside a symlinked build directory", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "minwind-guard-"));
    const realBuild = path.join(dir, "real-dist");
    fs.mkdirSync(realBuild);
    const linkBuild = path.join(dir, "link-dist");
    fs.symlinkSync(realBuild, linkBuild, "dir");
    // Lexically outside the symlinked path, canonically inside the build.
    assert.throws(function () {
      assertReportPathOutside(linkBuild, path.join(realBuild, "report.json"));
    }, ReportPathError);
    // A genuinely outside destination is still accepted.
    assertReportPathOutside(linkBuild, path.join(dir, "report.json"));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("refuses a destination whose parent directory symlinks into the build", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "minwind-guard-"));
    const realBuild = path.join(dir, "dist");
    fs.mkdirSync(realBuild);
    const linkParent = path.join(dir, "outside");
    fs.symlinkSync(realBuild, linkParent, "dir");
    // Lexically outside the build, canonically inside it.
    assert.throws(function () {
      assertReportPathOutside(realBuild, path.join(linkParent, "report.json"));
    }, ReportPathError);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("refuses an existing report-file symlink regardless of its target", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "minwind-guard-"));
    const realBuild = path.join(dir, "dist");
    fs.mkdirSync(realBuild);
    const reportPath = path.join(dir, "report.json");
    fs.symlinkSync(path.join(realBuild, "inside.json"), reportPath);
    assert.throws(function () {
      assertReportPathOutside(realBuild, reportPath);
    }, ReportPathError);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("runtime version check", () => {
  it("reads the tool metadata from the package manifest", () => {
    const meta = readToolMeta();
    assert.strictEqual(meta.name, "minwind");
    assert.strictEqual(meta.version, PACKAGE_VERSION);
    assert.strictEqual(meta.enginesNode, ">=20");
  });

  it("warns only when the runtime does not satisfy the pin", () => {
    assert.strictEqual(runtimeVersionWarning("22.14.0", "v22.14.0"), null);
    assert.match(
      runtimeVersionWarning("22.14.0", "v22.13.0") ?? "",
      /does not satisfy/i,
    );
    assert.strictEqual(runtimeVersionWarning(">=22", "v22.14.0"), null);
    assert.match(
      runtimeVersionWarning(">=22", "v20.11.0") ?? "",
      /does not satisfy/i,
    );
  });
});

describe("cli report output", () => {
  it("emits parseable JSON with version, runtime versions, and hashes", async () => {
    const result = await runCli([RENAME_SITE, "--json"]);
    assert.strictEqual(result.code, 0);
    const report = JSON.parse(result.stdout);
    assert.strictEqual(report.tool.name, "minwind");
    assert.strictEqual(report.tool.version, PACKAGE_VERSION);
    assert.strictEqual(report.runtime.node, process.versions.node);
    assert.strictEqual(typeof report.runtime.zlib, "string");
    assert.strictEqual(typeof report.runtime.brotli, "string");
    assert.strictEqual(report.thresholdPercent, 5);
    assert.strictEqual(report.measurement.inputHashes.length, 2);
    assert.strictEqual(report.measurement.routes.length, 1);
    const rename = report.measurement.arms.find(function (arm: {
      arm: string;
    }) {
      return arm.arm === "rename";
    });
    assert.ok(rename);
    assert.match(rename.verdict, /^(not-worth-it|potentially-worth-it)$/);
  });

  it("produces byte-identical JSON across repeated runs", async () => {
    const first = await runCli([RENAME_SITE, "--json"]);
    const second = await runCli([RENAME_SITE, "--json"]);
    assert.strictEqual(first.code, 0);
    assert.strictEqual(second.code, 0);
    assert.strictEqual(first.stdout, second.stdout);
  });

  it("honors --threshold in the verdicts and JSON", async () => {
    const result = await runCli([RENAME_SITE, "--json", "--threshold", "100"]);
    assert.strictEqual(result.code, 0);
    const report = JSON.parse(result.stdout);
    assert.strictEqual(report.thresholdPercent, 100);
    for (const arm of report.measurement.arms) {
      assert.strictEqual(arm.verdict, "not-worth-it");
    }
  });

  it("exits 1 with usage for invalid --threshold values", async () => {
    for (const args of [
      [RENAME_SITE, "--threshold", "abc"],
      [RENAME_SITE, "--threshold", "-1"],
      [RENAME_SITE, "--threshold=NaN"],
      [RENAME_SITE, "--threshold"],
    ]) {
      const result = await runCli(args);
      assert.strictEqual(result.code, 1, args.join(" "));
      assert.match(result.stderr, /usage/i, args.join(" "));
    }
  });

  it("writes the report to --report-path outside the analyzed directory", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "minwind-report-"));
    const reportPath = path.join(dir, "report.txt");
    const result = await runCli([RENAME_SITE, "--report-path", reportPath]);
    assert.strictEqual(result.code, 0);
    assert.ok(fs.existsSync(reportPath));
    assert.strictEqual(fs.readFileSync(reportPath, "utf8"), result.stdout);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("refuses a --report-path inside the analyzed directory", async () => {
    const reportPath = path.join(RENAME_SITE, "report.json");
    const result = await runCli([RENAME_SITE, "--report-path", reportPath]);
    assert.strictEqual(result.code, 1);
    assert.match(result.stderr, /outside the analyzed directory/i);
    assert.strictEqual(fs.existsSync(reportPath), false);
    fs.rmSync(reportPath, { force: true });
  });

  it("aborts with a diagnostic and no verdict when no stylesheet qualifies", async () => {
    const result = await runCli([PLAIN_SITE]);
    assert.strictEqual(result.code, 1);
    assert.match(result.stderr, /no stylesheet qualifies/i);
    assert.match(result.stdout, /discovery summary/i);
    assert.doesNotMatch(result.stdout, /Verdicts/);
  });

  it(
    "reports not-worth-it verdicts and a positive upper bound on dist",
    buildGate(),
    async () => {
      assertDemoBuild();
      const result = await runCli([BUILD_DIR]);
      assert.strictEqual(result.code, 0);
      assert.match(result.stdout, /rename:\s+NOT WORTH IT/);
      assert.match(result.stdout, /consolidate:\s+NOT WORTH IT/);
      assert.match(
        result.stdout,
        /upper bound \(ignoring JS-reference exclusions\)/i,
      );
      const json = await runCli([BUILD_DIR, "--json"]);
      assert.strictEqual(json.code, 0);
      const report = JSON.parse(json.stdout);
      for (const arm of report.measurement.arms) {
        assert.strictEqual(arm.brotliDeltaBytes, 0);
        assert.strictEqual(arm.verdict, "not-worth-it");
      }
      assert.ok(report.measurement.upperBoundRename.brotliDeltaBytes < 0);
    },
  );
});
