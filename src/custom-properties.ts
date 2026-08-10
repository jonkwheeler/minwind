import * as ts from "typescript";
import { hashClassName } from "./names.js";
import { isSfcModule, maskSfcStyleContent } from "./sfc.js";
import { parseSourceModule } from "./class-contexts.js";
import { compareCodeUnits } from "./util.js";

export interface CustomPropertiesConfig {
  // Explicit ownership is the safety contract: minwind never infers that a
  // property is private merely because it sees a declaration for it.
  owned: ReadonlyArray<string>;
  aliases?: Readonly<Record<string, string>>;
}

export interface CustomPropertyEntry {
  property: string;
  name: string;
}

export interface CustomPropertyRegistry {
  nameFor: (property: string) => string | undefined;
  propertyFor: (name: string) => string | undefined;
  entries: () => Array<CustomPropertyEntry>;
  excluded: () => Array<string>;
  assertBijection: () => void;
}

const CUSTOM_PROPERTY = /^--[A-Za-z_][A-Za-z0-9_-]*$/;
const CUSTOM_PROPERTY_CHARACTER = /[A-Za-z0-9_-]/;

export function createCustomPropertyRegistry(
  config: CustomPropertiesConfig,
  unsafe: ReadonlySet<string> = new Set<string>(),
  reserved: ReadonlySet<string> = new Set<string>(),
): CustomPropertyRegistry {
  const owned = new Set<string>();
  for (const property of config.owned) {
    if (!property.startsWith("--")) {
      throw new Error(
        `minwind: owned custom property "${property}" must start with --`,
      );
    }
    if (!CUSTOM_PROPERTY.test(property)) {
      throw new Error(
        `minwind: owned custom property "${property}" is not a supported CSS identifier`,
      );
    }
    if (owned.has(property)) {
      throw new Error(`minwind: duplicate owned custom property "${property}"`);
    }
    owned.add(property);
  }

  const configuredAliases = new Set<string>();
  for (const [property, alias] of Object.entries(config.aliases ?? {})) {
    if (!owned.has(property)) {
      throw new Error(
        `minwind: custom-property alias key "${property}" must appear in owned`,
      );
    }
    if (!alias.startsWith("--")) {
      throw new Error(
        `minwind: custom-property alias "${alias}" for "${property}" must start with --`,
      );
    }
    if (!CUSTOM_PROPERTY.test(alias)) {
      throw new Error(
        `minwind: custom-property alias "${alias}" for "${property}" is not a supported CSS identifier`,
      );
    }
    if (configuredAliases.has(alias)) {
      throw new Error(
        `minwind: custom-property alias "${alias}" is configured more than once`,
      );
    }
    configuredAliases.add(alias);
  }

  const names = new Map<string, string>();
  const inverse = new Map<string, string>();
  const unavailable = new Set<string>(reserved);
  for (const property of owned) unavailable.add(property);
  for (const property of Array.from(owned).sort(compareCodeUnits)) {
    if (unsafe.has(property)) continue;
    const name = config.aliases?.[property];
    if (name === undefined) continue;
    if (unavailable.has(name)) {
      throw new Error(
        `minwind: custom-property alias "${name}" for "${property}" is already in use`,
      );
    }
    names.set(property, name);
    inverse.set(name, property);
    unavailable.add(name);
  }
  for (const property of Array.from(owned).sort(compareCodeUnits)) {
    if (unsafe.has(property) || names.has(property)) continue;
    let attempt = 0;
    let name: string;
    do {
      const hashInput =
        attempt === 0
          ? `custom-property:${property}`
          : `custom-property:${property}:${attempt}`;
      name = `--${hashClassName(hashInput)}`;
      attempt += 1;
    } while (unavailable.has(name));
    names.set(property, name);
    inverse.set(name, property);
    unavailable.add(name);
  }

  const entries = Array.from(names, function ([property, name]) {
    return { property, name };
  }).sort(function (a, b) {
    return compareCodeUnits(a.property, b.property);
  });
  const excluded = Array.from(unsafe)
    .filter(function (property) {
      return owned.has(property);
    })
    .sort(compareCodeUnits);

  function assertBijection(): void {
    if (names.size !== inverse.size) {
      throw new Error(
        "minwind: custom-property bijection contains duplicate names",
      );
    }
    for (const [property, name] of names) {
      if (inverse.get(name) !== property) {
        throw new Error(
          `minwind: custom-property bijection is missing the inverse for "${property}"`,
        );
      }
    }
  }

  return {
    nameFor: function (property) {
      return names.get(property);
    },
    propertyFor: function (name) {
      return inverse.get(name);
    },
    entries: function () {
      return entries;
    },
    excluded: function () {
      return excluded;
    },
    assertBijection,
  };
}

export interface CustomPropertySourceScan {
  rewritable: Array<{ start: number; end: number; property: string }>;
  unsafe: Set<string>;
}

const CSSOM_METHODS = new Set([
  "setProperty",
  "getPropertyValue",
  "removeProperty",
]);

function isCssomPropertyArgument(node: ts.StringLiteralLike): boolean {
  const call = node.parent;
  if (!ts.isCallExpression(call) || call.arguments[0] !== node) return false;
  const expression = call.expression;
  if (!ts.isPropertyAccessExpression(expression)) return false;
  const method = expression.name.text;
  if (!CSSOM_METHODS.has(method)) return false;
  if (method === "getPropertyValue") {
    const receiver = expression.expression;
    return (
      ts.isCallExpression(receiver) &&
      ts.isIdentifier(receiver.expression) &&
      receiver.expression.text === "getComputedStyle"
    );
  }
  return (
    ts.isPropertyAccessExpression(expression.expression) &&
    expression.expression.name.text === "style"
  );
}

function isPropertyBoundary(
  text: string,
  start: number,
  length: number,
): boolean {
  const before = start > 0 ? text[start - 1] : "";
  const after = start + length < text.length ? text[start + length] : "";
  return (
    !CUSTOM_PROPERTY_CHARACTER.test(before) &&
    !CUSTOM_PROPERTY_CHARACTER.test(after)
  );
}

export function scanCustomPropertySource(
  code: string,
  id: string,
  registry: CustomPropertyRegistry,
): CustomPropertySourceScan {
  const text = isSfcModule(id) ? maskSfcStyleContent(id, code) : code;
  const source = isSfcModule(id) ? null : parseSourceModule(id, text);
  const rewritable: Array<{ start: number; end: number; property: string }> =
    [];

  if (source !== null) {
    const sourceFile = source;
    function visit(node: ts.Node): void {
      if (
        (ts.isStringLiteral(node) ||
          ts.isNoSubstitutionTemplateLiteral(node)) &&
        registry.nameFor(node.text) !== undefined &&
        isCssomPropertyArgument(node)
      ) {
        rewritable.push({
          start: node.getStart(sourceFile) + 1,
          end: node.getEnd() - 1,
          property: node.text,
        });
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
  }

  const unsafe = new Set<string>();
  const rewritableStarts = new Set(
    rewritable.map(function (span) {
      return `${span.start}:${span.end}`;
    }),
  );
  let index = 0;
  while (index < text.length) {
    if (text[index] !== "-" || text[index + 1] !== "-") {
      index += 1;
      continue;
    }
    let end = index + 2;
    while (end < text.length && CUSTOM_PROPERTY_CHARACTER.test(text[end])) {
      end += 1;
    }
    const property = text.slice(index, end);
    if (
      registry.nameFor(property) !== undefined &&
      isPropertyBoundary(text, index, property.length) &&
      !rewritableStarts.has(`${index}:${end}`)
    ) {
      unsafe.add(property);
    }
    index = end;
  }
  return { rewritable, unsafe };
}

interface CustomPropertySpan {
  start: number;
  end: number;
  property: string;
}

function customPropertySpans(css: string): Array<CustomPropertySpan> {
  const spans: Array<CustomPropertySpan> = [];
  let index = 0;
  let quote: string | null = null;
  let comment = false;
  while (index < css.length) {
    if (comment) {
      if (css[index] === "*" && css[index + 1] === "/") {
        comment = false;
        index += 2;
      } else index += 1;
      continue;
    }
    if (quote !== null) {
      if (css[index] === "\\") index += 2;
      else {
        if (css[index] === quote) quote = null;
        index += 1;
      }
      continue;
    }
    if (css[index] === "/" && css[index + 1] === "*") {
      comment = true;
      index += 2;
      continue;
    }
    if (css[index] === '"' || css[index] === "'") {
      quote = css[index];
      index += 1;
      continue;
    }
    if (css[index] !== "-" || css[index + 1] !== "-") {
      index += 1;
      continue;
    }
    let end = index + 2;
    while (end < css.length && CUSTOM_PROPERTY_CHARACTER.test(css[end])) {
      end += 1;
    }
    const property = css.slice(index, end);
    if (isPropertyBoundary(css, index, property.length)) {
      spans.push({ start: index, end, property });
    }
    index = end;
  }
  return spans;
}

export function collectCustomPropertyNamesInCss(css: string): Set<string> {
  return new Set(
    customPropertySpans(css).map(function (span) {
      return span.property;
    }),
  );
}

// Token-aware CSS rewriting. Custom-property identifiers are rewritten in
// CSS syntax but never inside comments or quoted strings. This covers
// declarations, var() references, and @property preludes without reserializing
// the stylesheet or depending on css-tree's handling of every Tailwind value.
export function transformCustomPropertiesInCss(
  css: string,
  registry: CustomPropertyRegistry,
): string {
  function previousNonWhitespace(from: number): number {
    let index = from;
    while (index >= 0 && /\s/.test(css[index])) index -= 1;
    return index;
  }

  function nextNonWhitespace(from: number): number {
    let index = from;
    while (index < css.length && /\s/.test(css[index])) index += 1;
    return index;
  }

  function isSemanticContext(start: number, end: number): boolean {
    const before = previousNonWhitespace(start - 1);
    if (before >= 3 && css.slice(before - 3, before + 1) === "var(") {
      return true;
    }
    if (before >= 8 && css.slice(before - 8, before + 1) === "@property") {
      return true;
    }
    const after = nextNonWhitespace(end);
    return (
      (before === -1 ||
        css[before] === ";" ||
        css[before] === "{" ||
        css[before] === "(") &&
      css[after] === ":"
    );
  }
  let output = "";
  let cursor = 0;
  for (const span of customPropertySpans(css)) {
    const { start: index, end, property } = span;
    const name = registry.nameFor(property);
    if (name !== undefined && isSemanticContext(index, end)) {
      output += css.slice(cursor, index) + name;
      cursor = end;
    }
  }
  return output + css.slice(cursor);
}
