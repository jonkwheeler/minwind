import { createHash } from "node:crypto";
import { compareCodeUnits } from "./util.js";

// Content-hash naming (KTD5, R2): every generated name is a deterministic
// function of the whole class token, variant included, so an unchanged class
// keeps its name across builds and independent registry instances agree.
// Unprefixed hash names match NAME_PATTERN. An optional prefix is prepended
// after the hash body is built; the result must still be a generated ident
// (hyphens allowed). An optional salt is mixed into the digest before the
// token so a site can rotate names without leaving content-hash stability.
// Hash names stay letter-first. Vocabulary may prefix a digit-leading word
// with `_` (`2b` -> `_2b`).
export const MIN_NAME_LENGTH = 4;
export const DEFAULT_NAME_LENGTH = 4;
export const MAX_NAME_LENGTH = 32;
export const NAME_LENGTH = DEFAULT_NAME_LENGTH;

export const NAME_PATTERN = /^(?:[a-z][a-z0-9]*|_[a-z0-9]+)$/;

// Hash and words names match NAME_PATTERN. Dialect names keep Tailwind
// punctuation (`items-centah`, `hovah:flex`), so the registry accepts
// those too as long as they do not start with a digit or contain space.
export function isGeneratedIdent(name: string): boolean {
  if (NAME_PATTERN.test(name)) return true;
  if (name === "" || /\s/.test(name)) return false;
  const first = name.charCodeAt(0);
  if (first >= 48 && first <= 57) return false;
  return true;
}

const FIRST_CHARACTER = "abcdefghijklmnopqrstuvwxyz";
const CONTINUATION = "abcdefghijklmnopqrstuvwxyz0123456789";
const HASH_ALPHABET_PATTERN = /^[a-z0-9]+$/;

export function resolveHashAlphabet(
  alphabet: string | undefined,
): string | undefined {
  if (alphabet === undefined) return undefined;
  if (alphabet === "") {
    throw new Error("minwind: naming.alphabet must be a non-empty string");
  }
  if (!HASH_ALPHABET_PATTERN.test(alphabet)) {
    throw new Error(
      "minwind: naming.alphabet must contain only lowercase letters and digits",
    );
  }
  const seen = new Set<string>();
  for (const char of alphabet) {
    if (seen.has(char)) {
      throw new Error(
        `minwind: naming.alphabet has duplicate character ${JSON.stringify(char)}`,
      );
    }
    seen.add(char);
  }
  if (!/[a-z]/.test(alphabet)) {
    throw new Error(
      "minwind: naming.alphabet must include at least one letter so names" +
        " stay ident-safe",
    );
  }
  return alphabet;
}

function alphabetsOf(alphabet: string | undefined): {
  first: string;
  rest: string;
} {
  const resolved = resolveHashAlphabet(alphabet);
  if (resolved === undefined) {
    return { first: FIRST_CHARACTER, rest: CONTINUATION };
  }
  let first = "";
  for (const char of resolved) {
    if (char >= "a" && char <= "z") first += char;
  }
  return { first, rest: resolved };
}

export function resolveNameLength(length: number | undefined): number {
  if (length === undefined) return DEFAULT_NAME_LENGTH;
  if (!Number.isInteger(length) || length < MIN_NAME_LENGTH) {
    throw new Error(
      `minwind: naming.length must be an integer >= ${MIN_NAME_LENGTH},` +
        ` got ${String(length)}`,
    );
  }
  if (length > MAX_NAME_LENGTH) {
    throw new Error(
      `minwind: naming.length must be an integer <= ${MAX_NAME_LENGTH},` +
        ` got ${String(length)}`,
    );
  }
  return length;
}

export function resolveHashPrefix(prefix: string | undefined): string {
  if (prefix === undefined) return "";
  if (prefix === "") {
    throw new Error("minwind: naming.prefix must be a non-empty string");
  }
  if (/\s/.test(prefix)) {
    throw new Error("minwind: naming.prefix cannot contain whitespace");
  }
  if (!isGeneratedIdent(prefix + "a")) {
    throw new Error(
      `minwind: naming.prefix ${JSON.stringify(prefix)} is not a valid` +
        " CSS ident prefix",
    );
  }
  return prefix;
}

export function resolveHashSalt(salt: string | undefined): string {
  if (salt === undefined) return "";
  if (salt === "") {
    throw new Error("minwind: naming.salt must be a non-empty string");
  }
  return salt;
}

export function createHasher(
  length?: number,
  prefix?: string,
  alphabet?: string,
  salt?: string,
): (token: string) => string {
  const resolved = resolveNameLength(length);
  const resolvedPrefix = resolveHashPrefix(prefix);
  resolveHashAlphabet(alphabet);
  const resolvedSalt = resolveHashSalt(salt);
  return function (token: string): string {
    return hashClassName(
      token,
      resolved,
      resolvedPrefix === "" ? undefined : resolvedPrefix,
      alphabet,
      resolvedSalt === "" ? undefined : resolvedSalt,
    );
  };
}

function hashesInjective(
  tokens: ReadonlyArray<string>,
  reserved: ReadonlySet<string>,
  length: number,
): boolean {
  const seen = new Set<string>();
  for (const token of tokens) {
    const name = hashClassName(token, length);
    if (seen.has(name) || reserved.has(name)) return false;
    seen.add(name);
  }
  return true;
}

// Smallest length in [MIN_NAME_LENGTH, MAX_NAME_LENGTH] where every token
// hashes to a unique ident that misses `reserved` (excluded and css-only
// names). Undefined if even length 32 collides. Used to tell a colliding
// build the next length that would have worked; the build still fails.
export function safeNameLength(
  tokens: ReadonlyArray<string>,
  reserved: ReadonlySet<string> = new Set(),
): number | undefined {
  for (let length = MIN_NAME_LENGTH; length <= MAX_NAME_LENGTH; length += 1) {
    if (hashesInjective(tokens, reserved, length)) return length;
  }
  return undefined;
}

function lengthAdvice(
  tokens: ReadonlyArray<string>,
  reserved: ReadonlySet<string>,
): string {
  const next = safeNameLength(tokens, reserved);
  if (next === undefined || next <= DEFAULT_NAME_LENGTH) {
    return "increase naming.length";
  }
  return `increase naming.length to ${next}`;
}

// Truncated SHA-256, one digest byte per character, with a letter forced
// into position 0. Modulo bias against the last few alphabet characters is
// irrelevant here: the registry asserts the bijection loudly (R10). Length
// defaults to 4 and cannot go below MIN_NAME_LENGTH; raise it when a site
// is large enough that 26*36^(n-1) is tight.
export function hashClassName(
  token: string,
  length: number = DEFAULT_NAME_LENGTH,
  prefix?: string,
  alphabet?: string,
  salt?: string,
): string {
  if (token === "") {
    throw new Error("minwind: cannot hash an empty class token");
  }
  const resolved = resolveNameLength(length);
  const resolvedPrefix = resolveHashPrefix(prefix);
  const resolvedSalt = resolveHashSalt(salt);
  const { first, rest } = alphabetsOf(alphabet);
  const hasher = createHash("sha256");
  if (resolvedSalt !== "") {
    hasher.update(resolvedSalt, "utf8");
    hasher.update("\0", "utf8");
  }
  const digest = hasher.update(token, "utf8").digest();
  let name = first[digest[0] % first.length];
  for (let index = 1; index < resolved; index += 1) {
    name += rest[digest[index] % rest.length];
  }
  return resolvedPrefix + name;
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
  const renameTokens: Array<string> = [];
  const reservedNames = new Set<string>();

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
    if (!isGeneratedIdent(name)) {
      throw new Error(
        `minwind: generated name "${name}" for "${token}" is not a valid` +
          ` CSS identifier`,
      );
    }
    const existing = inverse.get(name);
    if (existing !== undefined) {
      throw new Error(
        `minwind: name collision: "${existing}" and "${token}" both hash` +
          ` to "${name}"; ${lengthAdvice(renameTokens, reservedNames)}`,
      );
    }
    if (excluded.has(name)) {
      throw new Error(
        `minwind: name collision: generated name "${name}" for` +
          ` "${token}" equals the excluded class "${name}";` +
          ` ${lengthAdvice(renameTokens, reservedNames)}`,
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
          ` generated name for "${owner}";` +
          ` ${lengthAdvice(renameTokens, reservedNames)}`,
      );
    }
    if (!excluded.has(token)) excluded.set(token, reason);
  }

  const sourceList = Array.from(input.sourceTokens).sort(compareCodeUnits);
  const universeList = Array.from(input.universe).sort(compareCodeUnits);
  const reasons = new Map<string, ExclusionReason>();

  for (const token of sourceList) {
    const configured = configuredReason(token);
    if (configured !== undefined) {
      reservedNames.add(token);
      reasons.set(token, configured);
    } else if (runtimeTokens.has(token)) {
      reservedNames.add(token);
      reasons.set(token, "runtime-context");
    } else if (!input.universe.has(token)) {
      reservedNames.add(token);
      reasons.set(token, "not-in-universe");
    } else {
      renameTokens.push(token);
    }
  }

  for (const token of universeList) {
    if (input.sourceTokens.has(token)) continue;
    reservedNames.add(token);
    reasons.set(
      token,
      runtimeTokens.has(token) ? "runtime-context" : "css-only",
    );
  }

  for (const token of renameTokens) register(token);
  for (const [token, reason] of reasons) exclude(token, reason);

  function assertBijection(): void {
    for (const [token, name] of renamed) {
      if (!isGeneratedIdent(name)) {
        throw new Error(
          `minwind: generated name "${name}" for "${token}" is not a` +
            ` valid CSS identifier`,
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
