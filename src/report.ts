import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import type { ConsolidationVerdict } from "./consolidate.js";
import type { NameRegistry } from "./names.js";
import type { CssTransformWarning } from "./transform-css.js";
import type { TransformWarning } from "./transform-source.js";
import { compareCodeUnits } from "./util.js";

// U6 build artifacts (R5, R11; KTD9). The exclusion report and the rename map
// are deterministic functions of the pre-pass registry, the frozen verdicts,
// and the collected warnings; the shared plugin instance accumulates the
// union of every router build's warnings, so vinxi's three router builds
// converge on the same bytes and their publishes are interchangeable. Both
// files land in <root>/.output/minwind/ — gitignored, outside the
// deployed public directory (R11) — and are written atomically (unique tmp +
// rename), report and map as one coordinated pair.

export type ReportWarning = TransformWarning | CssTransformWarning;

export interface ReportVerdict {
  tokens: Array<string>;
  frequency: number;
  safe: boolean;
  reason?: string;
  name?: string;
}

export interface TransformReport {
  version: 1;
  flags: { enabled: boolean; consolidate: boolean };
  summary: {
    renamed: number;
    excluded: number;
    consolidatedRules: number;
    warnings: number;
  };
  renames: Array<{ token: string; name: string }>;
  exclusions: Array<{ token: string; reason: string }>;
  consolidation: { verdicts: Array<ReportVerdict> };
  warnings: Array<Record<string, unknown>>;
}

export interface RenameMap {
  version: 1;
  // Generated name -> original class token, sorted by name (R11 decode).
  names: Record<string, string>;
  // Consolidated name -> the sorted member list it stands for (KTD6).
  consolidated: Record<string, Array<string>>;
}

// Serializes one warning, dropping undefined fields so the bytes are stable.
function warningRecord(
  warning: TransformWarning | CssTransformWarning,
): Record<string, unknown> {
  const record: Record<string, unknown> = { kind: warning.kind };
  if ("id" in warning) record.id = warning.id;
  if ("fileName" in warning) record.fileName = warning.fileName;
  if ("line" in warning && warning.line !== undefined) {
    record.line = warning.line;
  }
  if ("column" in warning && warning.column !== undefined) {
    record.column = warning.column;
  }
  if ("token" in warning && warning.token !== undefined) {
    record.token = warning.token;
  }
  if ("selector" in warning) record.selector = warning.selector;
  record.message = warning.message;
  return record;
}

function warningKey(record: Record<string, unknown>): string {
  // JSON.stringify, not a separator-less join: concatenated fields collide
  // (line 1/column 23 vs line 12/column 3), which would silently drop
  // distinct warnings at the dedup below.
  return JSON.stringify([
    String(record.kind),
    String(record.id ?? record.fileName ?? ""),
    String(record.line ?? ""),
    String(record.column ?? ""),
    String(record.token ?? ""),
    String(record.selector ?? ""),
  ]);
}

export interface BuildReportInput {
  registry: NameRegistry;
  verdicts: ReadonlyArray<ConsolidationVerdict>;
  warnings: ReadonlyArray<TransformWarning | CssTransformWarning>;
  consolidate: boolean;
}

export function buildReport(input: BuildReportInput): TransformReport {
  const renames = input.registry.entries();
  const exclusions = input.registry.exclusions();

  const verdicts: Array<ReportVerdict> = [];
  if (input.consolidate) {
    for (const verdict of input.verdicts) {
      const entry: ReportVerdict = {
        tokens: [...verdict.tokens],
        frequency: verdict.frequency,
        safe: verdict.safe,
      };
      if (verdict.reason !== undefined) entry.reason = verdict.reason;
      if (verdict.name !== undefined) entry.name = verdict.name;
      verdicts.push(entry);
    }
    verdicts.sort(function (a, b) {
      return compareCodeUnits(a.tokens.join(" "), b.tokens.join(" "));
    });
  }

  const warnings: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  for (const warning of input.warnings) {
    const record = warningRecord(warning);
    const key = warningKey(record);
    if (seen.has(key)) continue;
    seen.add(key);
    warnings.push(record);
  }
  warnings.sort(function (a, b) {
    return compareCodeUnits(warningKey(a), warningKey(b));
  });

  return {
    version: 1,
    flags: { enabled: true, consolidate: input.consolidate },
    summary: {
      renamed: renames.length,
      excluded: exclusions.length,
      consolidatedRules: verdicts.filter(function (verdict) {
        return verdict.safe;
      }).length,
      warnings: warnings.length,
    },
    renames,
    exclusions,
    consolidation: { verdicts },
    warnings,
  };
}

export function buildRenameMap(
  registry: NameRegistry,
  verdicts: ReadonlyArray<ConsolidationVerdict>,
): RenameMap {
  const names: Record<string, string> = {};
  for (const entry of registry.entries()) {
    names[entry.name] = entry.token;
  }
  const consolidated: Record<string, Array<string>> = {};
  const consolidatedVerdicts = verdicts
    .filter(function (verdict) {
      return verdict.safe && verdict.name !== undefined;
    })
    .sort(function (a, b) {
      return compareCodeUnits(a.name ?? "", b.name ?? "");
    });
  for (const verdict of consolidatedVerdicts) {
    consolidated[verdict.name ?? ""] = [...verdict.tokens];
  }
  return { version: 1, names, consolidated };
}

export interface ArtifactPaths {
  directory: string;
  report: string;
  map: string;
}

export function artifactPaths(root: string): ArtifactPaths {
  const directory = path.join(root, ".output", "minwind");
  return {
    directory,
    report: path.join(directory, "report.json"),
    map: path.join(directory, "map.json"),
  };
}

// Unique tmp path per write attempt: the pid distinguishes processes and the
// counter (plus a random suffix) distinguishes concurrent writers within one
// process, so two publishes can never stage into the same file.
let tmpCounter = 0;

function uniqueTmpPath(target: string): string {
  tmpCounter += 1;
  return path.join(
    path.dirname(target),
    `.${path.basename(target)}.${process.pid}.${tmpCounter}.${Math.random().toString(36).slice(2)}.tmp`,
  );
}

export interface WriteArtifactsOptions {
  // KTD9 sibling verification: the map bytes this plugin instance's first
  // participating build published this process. Builds sharing the instance
  // compute the identical registry (content-hash naming, KTD5), so a
  // mismatch is a genuine divergence bug and writeArtifacts throws before
  // anything is written. The first build of a process passes undefined and
  // overwrites unconditionally, which also replaces stale artifacts a
  // previous process left behind.
  expectedMapBytes?: string;
}

export interface WriteArtifactsResult {
  reportPath: string;
  mapPath: string;
  // The exact map.json bytes published; the plugin feeds them back as
  // expectedMapBytes on the next sibling build. There is no `wrote` flag:
  // content converges across builds, so writers are interchangeable and a
  // first-writer-wins outcome no longer exists to report.
  mapBytes: string;
}

// Race-free publish (KTD9): write a unique tmp file, then rename it onto the
// target, atomically replacing whatever a sibling build (or a stale previous
// process) left. Converged bytes make writers interchangeable, so there is
// no read-back: the old read-then-tmp-then-re-read-then-rename protocol let
// two writers with different bytes both rename and both report success while
// the last one silently won. Report and map stay one coordinated pair —
// staged together, then renamed sequentially by the same call.
export async function writeArtifacts(
  root: string,
  report: TransformReport,
  map: RenameMap,
  options: WriteArtifactsOptions = {},
): Promise<WriteArtifactsResult> {
  const paths = artifactPaths(root);
  const reportBytes = JSON.stringify(report, null, 2) + "\n";
  const mapBytes = JSON.stringify(map, null, 2) + "\n";
  if (
    options.expectedMapBytes !== undefined &&
    options.expectedMapBytes !== mapBytes
  ) {
    throw new Error(
      "minwind: router builds sharing one plugin instance computed" +
        " divergent rename maps — the content-hash registry determinism" +
        " assumption (KTD5, KTD9) broke; refusing to publish",
    );
  }
  await mkdir(paths.directory, { recursive: true });
  const reportTmp = uniqueTmpPath(paths.report);
  const mapTmp = uniqueTmpPath(paths.map);
  try {
    await writeFile(reportTmp, reportBytes, "utf8");
    await writeFile(mapTmp, mapBytes, "utf8");
    await rename(reportTmp, paths.report);
    await rename(mapTmp, paths.map);
  } finally {
    await rm(reportTmp, { force: true });
    await rm(mapTmp, { force: true });
  }
  return {
    reportPath: paths.report,
    mapPath: paths.map,
    mapBytes,
  };
}
