import fs from "node:fs";
import path from "node:path";
import * as ts from "typescript";
import { parseSourceModule } from "../class-contexts.js";
import { moduleLocalKey, type ModuleInventory } from "./css-modules.js";
import type { NameRegistry } from "../names.js";

// Inverse rename for apply-class bundlers (KTD1, KTD7, KTD8): prove Module
// generated names from JS export maps whose keys uniquely identify one
// inventory file, then rewrite every whole-word occurrence of those names
// in JS, CSS, and HTML. Unprovable strings stay original. A proven name
// missing from JS or CSS after remap fails the build; missing HTML does not.

export const MODULES_REMAP_MISSING_SURFACE_ERROR =
  "minwind: proven CSS Modules name missing from JS or CSS after remap";

export interface ModuleRemapContext {
  root: string;
  inventory: ModuleInventory;
  registry: NameRegistry;
}

export interface ModuleSourceSet {
  js: string;
  css: string;
  html?: string;
}

export interface RemappedModuleSources {
  js: string;
  css: string;
  html?: string;
}

const BUNDLE_PATTERN = /\.[cm]?js$/;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wholeWordPattern(name: string): RegExp {
  return new RegExp(
    "(?<![A-Za-z0-9_])" + escapeRegExp(name) + "(?![A-Za-z0-9_])",
    "g",
  );
}

function containsWholeWord(code: string, name: string): boolean {
  const pattern = wholeWordPattern(name);
  pattern.lastIndex = 0;
  return pattern.test(code);
}

function localsByFile(inventory: ModuleInventory): Map<string, Set<string>> {
  const byFile = new Map<string, Set<string>>();
  for (const entry of inventory.locals) {
    let locals = byFile.get(entry.file);
    if (locals === undefined) {
      locals = new Set<string>();
      byFile.set(entry.file, locals);
    }
    locals.add(entry.local);
  }
  return byFile;
}

function setsEqual(left: Set<string>, right: Set<string>): boolean {
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
}

function isSubset(keys: Set<string>, locals: Set<string>): boolean {
  for (const key of keys) {
    if (!locals.has(key)) return false;
  }
  return true;
}

function owningFile(
  keys: Set<string>,
  byFile: Map<string, Set<string>>,
): string | undefined {
  if (keys.size === 0) return undefined;
  const exact: Array<string> = [];
  const subset: Array<string> = [];
  for (const [file, locals] of byFile) {
    if (setsEqual(keys, locals)) exact.push(file);
    else if (isSubset(keys, locals)) subset.push(file);
  }
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return undefined;
  if (subset.length === 1) return subset[0];
  return undefined;
}

function propertyKey(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  return undefined;
}

function stringValue(node: ts.Expression): string | undefined {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return undefined;
}

function readExportMap(
  node: ts.ObjectLiteralExpression,
): Map<string, string> | undefined {
  const values = new Map<string, string>();
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property)) return undefined;
    const key = propertyKey(property.name);
    const value = stringValue(property.initializer);
    if (key === undefined || value === undefined) return undefined;
    values.set(key, value);
  }
  if (values.size === 0) return undefined;
  return values;
}

function claimProven(
  proven: Map<string, string>,
  bundlerName: string,
  registryName: string,
): void {
  const existing = proven.get(bundlerName);
  if (existing !== undefined && existing !== registryName) {
    throw new Error(
      `minwind: name collision: bundler name "${bundlerName}" maps to both` +
        ` "${existing}" and "${registryName}"`,
    );
  }
  proven.set(bundlerName, registryName);
}

const CSS_IDENT = /^-?(?:[_a-zA-Z]|\\[0-9a-fA-F]+)[_a-zA-Z0-9-]*$/;

function proveObject(
  node: ts.ObjectLiteralExpression,
  context: ModuleRemapContext,
  byFile: Map<string, Set<string>>,
  proven: Map<string, string>,
): void {
  const values = readExportMap(node);
  if (values === undefined) return;
  const file = owningFile(new Set(values.keys()), byFile);
  if (file === undefined) return;
  for (const [local, raw] of values) {
    const tokens = raw.trim().split(/\s+/);
    const bundlerName = tokens[0];
    if (bundlerName === undefined || bundlerName === "") continue;
    if (!CSS_IDENT.test(bundlerName)) continue;
    const key = moduleLocalKey(
      context.root,
      path.join(context.root, file),
      local,
    );
    const registryName = context.registry.nameFor(key);
    if (registryName === undefined) continue;
    claimProven(proven, bundlerName, registryName);
  }
}

export function collectProvenModuleNames(
  jsSources: ReadonlyArray<string>,
  context: ModuleRemapContext,
): Map<string, string> {
  const byFile = localsByFile(context.inventory);
  const proven = new Map<string, string>();
  for (let index = 0; index < jsSources.length; index += 1) {
    const sourceFile = parseSourceModule(
      `bundle-${index}.js`,
      jsSources[index],
    );
    function visit(node: ts.Node): void {
      if (ts.isObjectLiteralExpression(node)) {
        proveObject(node, context, byFile, proven);
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
  }
  return proven;
}

export function rewriteProvenModuleNames(
  code: string,
  proven: ReadonlyMap<string, string>,
): string {
  const names = Array.from(proven.keys());
  names.sort(function (a, b) {
    return b.length - a.length;
  });
  let result = code;
  for (const bundlerName of names) {
    const registryName = proven.get(bundlerName);
    if (registryName === undefined) continue;
    result = result.replace(wholeWordPattern(bundlerName), registryName);
  }
  return result;
}

function assertProvenSurfaces(
  proven: ReadonlyMap<string, string>,
  js: string,
  css: string,
  cssBefore: string,
): void {
  for (const [bundlerName, registryName] of proven) {
    if (!containsWholeWord(cssBefore, bundlerName)) {
      throw new Error(`${MODULES_REMAP_MISSING_SURFACE_ERROR}: ${bundlerName}`);
    }
    if (
      !containsWholeWord(js, registryName) ||
      !containsWholeWord(css, registryName)
    ) {
      throw new Error(`${MODULES_REMAP_MISSING_SURFACE_ERROR}: ${bundlerName}`);
    }
  }
}

export function remapModuleSources(
  sources: ModuleSourceSet,
  context: ModuleRemapContext,
): RemappedModuleSources {
  const proven = collectProvenModuleNames([sources.js], context);
  if (proven.size === 0) {
    return {
      js: sources.js,
      css: sources.css,
      html: sources.html,
    };
  }
  const js = rewriteProvenModuleNames(sources.js, proven);
  const css = rewriteProvenModuleNames(sources.css, proven);
  const html =
    sources.html === undefined
      ? undefined
      : rewriteProvenModuleNames(sources.html, proven);
  assertProvenSurfaces(proven, js, css, sources.css);
  return { js, css, html };
}

function walkAssets(directory: string): Array<string> {
  const files: Array<string> = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkAssets(full));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files.sort();
}

export function applyModulesRemap(
  dir: string,
  context: ModuleRemapContext,
  options?: { dryRun?: boolean },
): { rewrittenFiles: number } {
  const files = walkAssets(dir);
  const jsFiles: Array<string> = [];
  const cssFiles: Array<string> = [];
  const htmlFiles: Array<string> = [];
  for (const file of files) {
    if (BUNDLE_PATTERN.test(file)) jsFiles.push(file);
    else if (file.endsWith(".css")) cssFiles.push(file);
    else if (file.endsWith(".html")) htmlFiles.push(file);
  }
  const jsSources: Array<string> = [];
  for (const file of jsFiles) {
    jsSources.push(fs.readFileSync(file, "utf8"));
  }
  const cssBeforeParts: Array<string> = [];
  for (const file of cssFiles) {
    cssBeforeParts.push(fs.readFileSync(file, "utf8"));
  }
  const cssBefore = cssBeforeParts.join("\n");
  const proven = collectProvenModuleNames(jsSources, context);
  if (proven.size === 0) return { rewrittenFiles: 0 };

  const dryRun = options?.dryRun === true;
  let rewrittenFiles = 0;
  const jsAfterParts: Array<string> = [];
  for (let index = 0; index < jsFiles.length; index += 1) {
    const original = jsSources[index];
    const next = rewriteProvenModuleNames(original, proven);
    jsAfterParts.push(next);
    if (next === original) continue;
    rewrittenFiles += 1;
    if (!dryRun) fs.writeFileSync(jsFiles[index], next);
  }
  const cssAfterParts: Array<string> = [];
  for (const file of cssFiles) {
    const original = fs.readFileSync(file, "utf8");
    const next = rewriteProvenModuleNames(original, proven);
    cssAfterParts.push(next);
    if (next === original) continue;
    rewrittenFiles += 1;
    if (!dryRun) fs.writeFileSync(file, next);
  }
  for (const file of htmlFiles) {
    const original = fs.readFileSync(file, "utf8");
    const next = rewriteProvenModuleNames(original, proven);
    if (next === original) continue;
    rewrittenFiles += 1;
    if (!dryRun) fs.writeFileSync(file, next);
  }
  assertProvenSurfaces(
    proven,
    jsAfterParts.join("\n"),
    cssAfterParts.join("\n"),
    cssBefore,
  );
  return { rewrittenFiles };
}
