import { createHash } from "node:crypto";
import { compareCodeUnits } from "./util.js";

// Content-hash naming (KTD5, R2): every generated name is a deterministic
// function of the whole class token, variant included, so an unchanged class
// keeps its name across builds and independent registry instances agree.
// Names match NAME_PATTERN, so they need no CSS escaping or JS quoting.
export const NAME_LENGTH = 4;

export const NAME_PATTERN = /^[a-z][a-z0-9]*$/;

const FIRST_CHARACTER = "abcdefghijklmnopqrstuvwxyz";
const CONTINUATION = "abcdefghijklmnopqrstuvwxyz0123456789";

// Truncated SHA-256, base-36 encoded per position with a letter forced into
// position 0. Modulo bias against the last few alphabet characters is
// irrelevant here: the registry asserts the bijection loudly (R10), and the
// 26*36^3 space dwarfs this site's ~126 classes.
export function hashClassName(token: string): string {
  if (token === "") {
    throw new Error("minwind: cannot hash an empty class token");
  }
  const digest = createHash("sha256").update(token, "utf8").digest();
  let name = FIRST_CHARACTER[digest[0] % FIRST_CHARACTER.length];
  for (let index = 1; index < NAME_LENGTH; index += 1) {
    name += CONTINUATION[digest[index] % CONTINUATION.length];
  }
  return name;
}

// Exclusion classification (R5): why a token keeps its original bytes.
// - excluded-prefix: matched the configured names/prefixes (runtime-injected
//   overlay classes, Shiki markup classes).
// - runtime-context: seen in a detection-only context (KTD4); one unprovable
//   usage poisons the token everywhere.
// - not-in-universe: used in source but the stylesheet defines no such class.
// - css-only: defined in the stylesheet but never used in source tokens.
export type ExclusionReason =
  "excluded-prefix" | "runtime-context" | "not-in-universe" | "css-only";

export interface ExclusionConfig {
  names: ReadonlyArray<string>;
  prefixes: ReadonlyArray<string>;
}

// The package default excludes nothing: every exclusion is a site-specific
// contract (a runtime-injected class the transform must not touch), so the
// site's plugin config names them explicitly.
export const DEFAULT_EXCLUSIONS: ExclusionConfig = {
  names: [],
  prefixes: [],
};

export interface ExclusionEntry {
  token: string;
  reason: ExclusionReason;
}

export interface RegistryEntry {
  token: string;
  name: string;
}

export interface RegistryInput {
  universe: ReadonlySet<string>;
  sourceTokens: ReadonlySet<string>;
  runtimeTokens?: ReadonlySet<string>;
  exclusions?: ExclusionConfig;
  hash?: (token: string) => string;
}

export interface NameRegistry {
  nameFor: (token: string) => string | undefined;
  tokenFor: (name: string) => string | undefined;
  entries: () => Array<RegistryEntry>;
  exclusions: () => Array<ExclusionEntry>;
  assertBijection: () => void;
}

export function createNameRegistry(input: RegistryInput): NameRegistry {
  const hash = input.hash ?? hashClassName;
  const exclusions = input.exclusions ?? DEFAULT_EXCLUSIONS;
  const runtimeTokens = input.runtimeTokens ?? new Set<string>();

  const renamed = new Map<string, string>();
  const inverse = new Map<string, string>();
  const excluded = new Map<string, ExclusionReason>();

  function configuredReason(token: string): ExclusionReason | undefined {
    if (exclusions.names.includes(token)) return "excluded-prefix";
    for (const prefix of exclusions.prefixes) {
      if (token.startsWith(prefix)) return "excluded-prefix";
    }
    return undefined;
  }

  // Registration is fail-fast per R10: a collision or a malformed generated
  // name is an internal error, never a warn-and-skip. assertBijection
  // re-verifies the same invariant over the finished set at bundle time.
  function register(token: string): void {
    const name = hash(token);
    if (!NAME_PATTERN.test(name)) {
      throw new Error(
        `minwind: generated name "${name}" for "${token}" is not a valid` +
          ` CSS identifier (must match ${NAME_PATTERN})`,
      );
    }
    const existing = inverse.get(name);
    if (existing !== undefined) {
      throw new Error(
        `minwind: name collision: "${existing}" and "${token}" both hash` +
          ` to "${name}"; bump NAME_LENGTH`,
      );
    }
    if (excluded.has(name)) {
      throw new Error(
        `minwind: name collision: generated name "${name}" for` +
          ` "${token}" equals the excluded class "${name}"; bump NAME_LENGTH`,
      );
    }
    renamed.set(token, name);
    inverse.set(name, token);
  }

  function exclude(token: string, reason: ExclusionReason): void {
    const owner = inverse.get(token);
    if (owner !== undefined) {
      throw new Error(
        `minwind: name collision: excluded class "${token}" equals the` +
          ` generated name for "${owner}"; bump NAME_LENGTH`,
      );
    }
    if (!excluded.has(token)) excluded.set(token, reason);
  }

  for (const token of Array.from(input.sourceTokens).sort(compareCodeUnits)) {
    const configured = configuredReason(token);
    if (configured !== undefined) {
      exclude(token, configured);
    } else if (runtimeTokens.has(token)) {
      exclude(token, "runtime-context");
    } else if (!input.universe.has(token)) {
      exclude(token, "not-in-universe");
    } else {
      register(token);
    }
  }

  for (const token of Array.from(input.universe).sort(compareCodeUnits)) {
    if (input.sourceTokens.has(token)) continue;
    exclude(token, runtimeTokens.has(token) ? "runtime-context" : "css-only");
  }

  function assertBijection(): void {
    for (const [token, name] of renamed) {
      if (!NAME_PATTERN.test(name)) {
        throw new Error(
          `minwind: generated name "${name}" for "${token}" is not a` +
            ` valid CSS identifier (must match ${NAME_PATTERN})`,
        );
      }
      if (inverse.get(name) !== token) {
        throw new Error(
          `minwind: bijection violated: "${token}" -> "${name}" has no` +
            ` matching inverse`,
        );
      }
      if (excluded.has(name)) {
        throw new Error(
          `minwind: name collision: generated name "${name}" for` +
            ` "${token}" equals the excluded class "${name}"`,
        );
      }
    }
    if (inverse.size !== renamed.size) {
      throw new Error("minwind: bijection violated: duplicate names present");
    }
  }

  // The maps are frozen once construction finishes, so the sorted views are
  // computed once and shared. Every caller treats them as read-only.
  const entriesList = Array.from(renamed, function ([token, name]) {
    return { token, name };
  }).sort(function (a, b) {
    return compareCodeUnits(a.token, b.token);
  });
  const exclusionsList = Array.from(excluded, function ([token, reason]) {
    return { token, reason };
  }).sort(function (a, b) {
    return compareCodeUnits(a.token, b.token);
  });

  return {
    nameFor: function (token: string): string | undefined {
      return renamed.get(token);
    },
    tokenFor: function (name: string): string | undefined {
      return inverse.get(name);
    },
    entries: function (): Array<RegistryEntry> {
      return entriesList;
    },
    exclusions: function (): Array<ExclusionEntry> {
      return exclusionsList;
    },
    assertBijection,
  };
}
