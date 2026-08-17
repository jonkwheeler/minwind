import process from "node:process";

// Shared flag and mode resolution for Vite, webpack, and apply.
// Env flags remain the lower-level override; `mode` is the user-facing control.

export type MinwindMode = "morph" | "compress";
export type MinwindEngineId = "tailwind" | "css-modules";

export const DEFAULT_ENGINES: ReadonlyArray<MinwindEngineId> = ["tailwind"];

export const MODULES_COMPRESS_WARNING =
  "minwind: CSS Modules-only builds coerce mode compress to morph;" +
  " Modules v1 does not consolidate";

export const MODULES_CONSOLIDATE_SKIP_WARNING =
  "minwind: CSS Modules assets skip consolidation;" +
  " Tailwind may still consolidate";

const FLAG_NAMES = {
  master: "MINWIND",
  rename: "MINWIND_RENAME",
  consolidate: "MINWIND_CONSOLIDATE",
} as const;

export interface ResolveFlagsInput {
  mode?: MinwindMode;
  engines?: ReadonlyArray<MinwindEngineId>;
  // Explicit consolidate override (webpack option / apply --no-consolidate).
  // Applied after `mode`, before env.
  consolidate?: boolean;
}

export interface MinwindFlags {
  // Master && rename: when false, every hook is a no-op.
  enabled: boolean;
  // Consolidation operates on renamed rules (KTD6), so it implies rename.
  consolidate: boolean;
  // Effective user-facing mode after env overrides and Modules coerce.
  mode: MinwindMode;
  engines: Array<MinwindEngineId>;
  modeWarning: string | undefined;
}

function readFlag(env: NodeJS.ProcessEnv, name: string): boolean | undefined {
  const value = env[name];
  if (value === undefined) return undefined;
  if (value === "on") return true;
  if (value === "off") return false;
  throw new Error(
    `minwind: ${name} must be "on" or "off", got "${value}"` +
      " (unset means on)",
  );
}

function isEngineId(value: string): value is MinwindEngineId {
  return value === "tailwind" || value === "css-modules";
}

export function parseEngineList(value: string): Array<MinwindEngineId> {
  const parts = value.split(",");
  const parsed: Array<MinwindEngineId> = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed === "") continue;
    if (!isEngineId(trimmed)) {
      throw new Error(`minwind: unknown engine "${trimmed}"`);
    }
    parsed.push(trimmed);
  }
  return normalizeEngines(parsed);
}

function normalizeEngines(
  engines: ReadonlyArray<MinwindEngineId> | undefined,
): Array<MinwindEngineId> {
  const source = engines ?? DEFAULT_ENGINES;
  if (source.length === 0) {
    throw new Error("minwind: engines must list at least one engine");
  }
  const seen = new Set<MinwindEngineId>();
  const result: Array<MinwindEngineId> = [];
  for (const engine of source) {
    if (!isEngineId(engine)) {
      throw new Error(`minwind: unknown engine "${String(engine)}"`);
    }
    if (seen.has(engine)) continue;
    seen.add(engine);
    result.push(engine);
  }
  return result;
}

export function enginesInclude(
  engines: ReadonlyArray<MinwindEngineId>,
  id: MinwindEngineId,
): boolean {
  for (const engine of engines) {
    if (engine === id) return true;
  }
  return false;
}

export function isModulesOnly(
  engines: ReadonlyArray<MinwindEngineId>,
): boolean {
  let hasModules = false;
  for (const engine of engines) {
    if (engine === "tailwind") return false;
    if (engine === "css-modules") hasModules = true;
  }
  return hasModules;
}

export function resolveFlags(
  env: NodeJS.ProcessEnv = process.env,
  input: ResolveFlagsInput = {},
): MinwindFlags {
  const engines = normalizeEngines(input.engines);
  let mode: MinwindMode = input.mode ?? "compress";
  if (
    input.mode !== undefined &&
    input.mode !== "morph" &&
    input.mode !== "compress"
  ) {
    throw new Error(
      `minwind: mode must be "morph" or "compress", got "${String(input.mode)}"`,
    );
  }
  if (input.consolidate === false) mode = "morph";
  if (input.consolidate === true) mode = "compress";

  const envConsolidate = readFlag(env, FLAG_NAMES.consolidate);
  if (envConsolidate === false) mode = "morph";
  if (envConsolidate === true) mode = "compress";

  let modeWarning: string | undefined;
  if (mode === "compress" && isModulesOnly(engines)) {
    mode = "morph";
    modeWarning = MODULES_COMPRESS_WARNING;
  }

  const master = readFlag(env, FLAG_NAMES.master) ?? true;
  const rename = readFlag(env, FLAG_NAMES.rename) ?? true;
  if (!rename && env[FLAG_NAMES.consolidate] === "on") {
    throw new Error(
      `minwind: MINWIND_CONSOLIDATE=on requires MINWIND_RENAME=on:` +
        " consolidation operates on renamed rules (KTD6)",
    );
  }
  const enabled = master && rename;
  return {
    enabled,
    consolidate: enabled && mode === "compress",
    mode,
    engines,
    modeWarning,
  };
}
