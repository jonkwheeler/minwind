import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { parse, generate, type CssNode } from "css-tree";
import { childArray } from "../css-util.js";
import type { StyleEngine } from "./types.js";
import {
  createNameRegistry,
  hashClassName,
  type ExclusionConfig,
  type NameRegistry,
} from "../names.js";
import { resolveNaming, type NamingConfig } from "../naming.js";
import { compareCodeUnits } from "../util.js";

// CSS Modules identity: file-qualified locals, hashed on the fly for the
// first proof path (KTD3, KTD7). The bundler naming hook is the rename
// altitude — export keys stay source locals.

const MODULE_FILE_PATTERN = /\.module\.(css|scss)$/;
const SKIP_DIRECTORY_NAMES = new Set([
  "node_modules",
  ".git",
  ".output",
  ".context",
  ".worktrees",
  ".next",
  "dist",
  "out",
]);

const requireFromHere = createRequire(import.meta.url);

export const cssModulesEngine: StyleEngine = {
  id: "css-modules",
  requiresCssEntry: false,
};

export function normalizeModulePath(root: string, filename: string): string {
  const relative = path.relative(root, filename);
  return relative.split(path.sep).join("/");
}

export function moduleLocalKey(
  root: string,
  filename: string,
  local: string,
): string {
  return normalizeModulePath(root, filename) + "\0" + local;
}

export function formatModuleKey(key: string): string {
  const split = key.indexOf("\0");
  if (split === -1) return key;
  return key.slice(0, split) + ":" + key.slice(split + 1);
}

export function hashModuleLocal(
  root: string,
  filename: string,
  local: string,
): string {
  return hashClassName(moduleLocalKey(root, filename, local));
}

export interface ModuleLocal {
  file: string;
  local: string;
  key: string;
}

export interface ModuleInventory {
  locals: Array<ModuleLocal>;
  globals: Array<ModuleLocal>;
  scssFiles: Array<string>;
  sassAvailable: boolean;
}

export class NameCollisionSpace {
  private readonly inverse = new Map<string, string>();

  claim(token: string, name: string): void {
    const owner = this.inverse.get(name);
    if (owner !== undefined && owner !== token) {
      throw new Error(
        `minwind: name collision: "${formatModuleKey(owner)}" and` +
          ` "${formatModuleKey(token)}" both generate "${name}"`,
      );
    }
    this.inverse.set(name, token);
  }

  seed(registry: NameRegistry): void {
    for (const entry of registry.entries()) {
      this.claim(entry.token, entry.name);
    }
  }

  reservedNames(): Set<string> {
    const names = new Set<string>();
    for (const [name, token] of this.inverse) {
      names.add(name);
      names.add(token);
    }
    return names;
  }
}

export function reservedFromRegistry(registry: NameRegistry): Set<string> {
  const names = new Set<string>();
  for (const entry of registry.entries()) {
    names.add(entry.name);
    names.add(entry.token);
  }
  for (const exclusion of registry.exclusions()) {
    names.add(exclusion.token);
  }
  return names;
}

export function assertSharedCollision(
  tailwind: NameRegistry,
  modules: NameRegistry,
): void {
  const space = new NameCollisionSpace();
  space.seed(tailwind);
  for (const entry of modules.entries()) {
    space.claim(entry.token, entry.name);
  }
}

export interface ScopedNameOptions {
  onName?: (local: string, filename: string, generated: string) => void;
  naming?: NamingConfig;
  registry?: NameRegistry;
  collision?: NameCollisionSpace;
}

function scopedOptions(
  onNameOrOptions?:
    | ((local: string, filename: string, generated: string) => void)
    | ScopedNameOptions,
): ScopedNameOptions {
  if (typeof onNameOrOptions === "function") {
    return { onName: onNameOrOptions };
  }
  return onNameOrOptions ?? {};
}

function lookupScopedName(
  root: string,
  filename: string,
  local: string,
  options: ScopedNameOptions,
): string {
  if (options.registry !== undefined) {
    const key = moduleLocalKey(root, filename, local);
    const name = options.registry.nameFor(key);
    if (name === undefined) {
      throw new Error(
        `${MODULES_WORDS_UNKNOWN_ERROR}: ${formatModuleKey(key)}`,
      );
    }
    return name;
  }
  return hashModuleLocal(root, filename, local);
}

export function createGenerateScopedName(
  root: string,
  onNameOrOptions?:
    | ((local: string, filename: string, generated: string) => void)
    | ScopedNameOptions,
): (name: string, filename: string, css: string) => string {
  const options = scopedOptions(onNameOrOptions);
  return function (name: string, filename: string, _css: string): string {
    const generated = lookupScopedName(root, filename, name, options);
    if (options.collision !== undefined) {
      options.collision.claim(moduleLocalKey(root, filename, name), generated);
    }
    if (options.onName !== undefined) options.onName(name, filename, generated);
    return generated;
  };
}

export interface WebpackLocalIdentContext {
  resourcePath: string;
}

export function createGetLocalIdent(
  root: string,
  onNameOrOptions?:
    | ((local: string, filename: string, generated: string) => void)
    | ScopedNameOptions,
): (
  context: WebpackLocalIdentContext,
  localIdentName: string,
  localName: string,
) => string {
  const options = scopedOptions(onNameOrOptions);
  return function (
    context: WebpackLocalIdentContext,
    _localIdentName: string,
    localName: string,
  ): string {
    const generated = lookupScopedName(
      root,
      context.resourcePath,
      localName,
      options,
    );
    if (options.collision !== undefined) {
      options.collision.claim(
        moduleLocalKey(root, context.resourcePath, localName),
        generated,
      );
    }
    if (options.onName !== undefined) {
      options.onName(localName, context.resourcePath, generated);
    }
    return generated;
  };
}

export const LIGHTNING_MODULES_ERROR =
  "minwind: CSS Modules engine requires PostCSS Modules" +
  " (css.modules.generateScopedName). Vite Lightning CSS Modules is" +
  " unsupported in this milestone";

export const MODULES_HOOK_MISSING_ERROR =
  "minwind: CSS Modules engine is enabled but the scoped-name hook was not" +
  " applied — check that css.modules is not disabled and Lightning CSS" +
  " Modules is off";

export const SCSS_SASS_ERROR =
  'minwind: naming.strategy "words" requires the optional peer `sass`' +
  " to inventory SCSS Modules";

export const MODULES_WORDS_UNKNOWN_ERROR =
  'minwind: naming.strategy "words" saw a CSS Modules local that was not' +
  " in the inventory";

export const MODULES_COMPOSE_ERROR = "minwind: unresolved CSS Modules composes";

export const MODULES_QUOTES_ERROR =
  'minwind: naming.strategy "quotes" is not supported with the CSS Modules' +
  " engine";

export function assertModulesQuotes(naming: NamingConfig | undefined): void {
  if (naming !== undefined && naming.strategy === "quotes") {
    throw new Error(MODULES_QUOTES_ERROR);
  }
}

function skipDirectory(name: string): boolean {
  return SKIP_DIRECTORY_NAMES.has(name) || name.startsWith("dist");
}

function tryLoadSass(): { compile: (file: string) => { css: string } } | null {
  try {
    return requireFromHere("sass") as {
      compile: (file: string) => { css: string };
    };
  } catch {
    return null;
  }
}

function walkCss(
  node: CssNode,
  enter: (node: CssNode) => void,
  leave: (node: CssNode) => void,
): void {
  enter(node);
  if (node.type === "Rule" || node.type === "Atrule") {
    if (node.prelude != null) walkCss(node.prelude, enter, leave);
    if (node.block != null) walkCss(node.block, enter, leave);
  }
  for (const child of childArray(node)) {
    walkCss(child, enter, leave);
  }
  leave(node);
}

function parseCss(css: string): CssNode {
  return parse(css);
}

function parseSelector(raw: string): CssNode {
  return parse(raw, { context: "selector" } as Parameters<typeof parse>[1]);
}

function parseFragment(raw: string): CssNode | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (!trimmed.includes("{")) {
    try {
      return parseSelector(trimmed);
    } catch {
      return null;
    }
  }
  try {
    return parseCss(raw);
  } catch {
    return null;
  }
}

function preludeIsGlobalOnly(rule: CssNode): boolean {
  if (rule.type !== "Rule" || rule.prelude == null) return false;
  let foundGlobal = false;
  let foundClass = false;
  walkCss(
    rule.prelude,
    function (node: CssNode) {
      if (node.type === "PseudoClassSelector" && node.name === "global") {
        foundGlobal = true;
      }
      if (node.type === "ClassSelector") foundClass = true;
    },
    function () {},
  );
  return foundGlobal && !foundClass;
}

interface FileExtraction {
  locals: Set<string>;
  globals: Set<string>;
  composeErrors: Array<string>;
}

function extractFromCss(css: string, filename: string): FileExtraction {
  const locals = new Set<string>();
  const globals = new Set<string>();
  const composeDecls: Array<CssNode> = [];
  const ast = parseCss(css);
  let globalDepth = 0;
  let globalBlockDepth = 0;
  const globalRuleStack: Array<boolean> = [];

  function addClass(name: string): void {
    if (globalDepth + globalBlockDepth > 0) globals.add(name);
    else locals.add(name);
  }

  function visit(node: CssNode): void {
    walkCss(
      node,
      function (child: CssNode) {
        if (child.type === "Rule") {
          const isGlobal = preludeIsGlobalOnly(child);
          globalRuleStack.push(isGlobal);
          if (isGlobal) globalBlockDepth += 1;
        }
        if (child.type === "PseudoClassSelector" && child.name === "global") {
          globalDepth += 1;
        }
        if (child.type === "ClassSelector" && child.name !== undefined) {
          addClass(child.name);
        }
        if (child.type === "Raw" && typeof child.value === "string") {
          const fragment = parseFragment(child.value);
          if (fragment !== null) visit(fragment);
        }
        if (child.type === "Declaration" && child.property === "composes") {
          composeDecls.push(child);
        }
      },
      function (child: CssNode) {
        if (child.type === "PseudoClassSelector" && child.name === "global") {
          globalDepth -= 1;
        }
        if (child.type === "Rule") {
          const isGlobal = globalRuleStack.pop();
          if (isGlobal === true) globalBlockDepth -= 1;
        }
      },
    );
  }

  visit(ast);
  const composeErrors: Array<string> = [];
  for (const declaration of composeDecls) {
    inspectComposes(declaration, filename, locals, globals, composeErrors);
  }
  return { locals, globals, composeErrors };
}

function inspectComposes(
  declaration: CssNode,
  filename: string,
  locals: Set<string>,
  globals: Set<string>,
  composeErrors: Array<string>,
): void {
  if (declaration.type !== "Declaration" || declaration.value == null) {
    return;
  }
  const valueNode = declaration.value;
  const text =
    typeof valueNode === "string"
      ? valueNode.trim()
      : generate(valueNode).trim();
  const fromGlobal = /^(.*?)\s+from\s+global$/i.exec(text);
  if (fromGlobal !== null) {
    for (const name of fromGlobal[1].split(/\s+/)) {
      if (name !== "") globals.add(name);
    }
    return;
  }
  const fromFile = /^(.*?)\s+from\s*(["'])(.+)\2$/i.exec(text);
  if (fromFile !== null) {
    const target = path.resolve(path.dirname(filename), fromFile[3]);
    if (!existsSync(target)) {
      composeErrors.push(
        `${MODULES_COMPOSE_ERROR}: ${filename} composes from missing` +
          ` "${fromFile[3]}"`,
      );
    }
    return;
  }
  for (const name of text.split(/\s+/)) {
    if (name === "") continue;
    if (!locals.has(name)) {
      composeErrors.push(
        `${MODULES_COMPOSE_ERROR}: ${filename} composes unknown local` +
          ` "${name}"`,
      );
    }
  }
}

function toModuleLocals(
  root: string,
  filename: string,
  names: Iterable<string>,
): Array<ModuleLocal> {
  const file = normalizeModulePath(root, filename);
  const result: Array<ModuleLocal> = [];
  for (const local of Array.from(names).sort(compareCodeUnits)) {
    result.push({
      file,
      local,
      key: moduleLocalKey(root, filename, local),
    });
  }
  return result;
}

export function collectModuleInventory(root: string): ModuleInventory {
  const files: Array<string> = [];
  function walkDir(directory: string): void {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!skipDirectory(entry.name)) walkDir(full);
        continue;
      }
      if (MODULE_FILE_PATTERN.test(entry.name)) files.push(full);
    }
  }
  walkDir(root);
  files.sort(compareCodeUnits);

  const sass = tryLoadSass();
  const locals: Array<ModuleLocal> = [];
  const globals: Array<ModuleLocal> = [];
  const scssFiles: Array<string> = [];

  for (const filename of files) {
    const isScss = filename.endsWith(".scss");
    if (isScss) scssFiles.push(filename);
    let css: string;
    if (isScss) {
      if (sass === null) continue;
      css = sass.compile(filename).css;
    } else {
      css = readFileSync(filename, "utf8");
    }
    const extracted = extractFromCss(css, filename);
    if (extracted.composeErrors.length > 0) {
      throw new Error(extracted.composeErrors[0]);
    }
    locals.push(...toModuleLocals(root, filename, extracted.locals));
    globals.push(...toModuleLocals(root, filename, extracted.globals));
  }

  return {
    locals,
    globals,
    scssFiles,
    sassAvailable: sass !== null,
  };
}

export function assertWordsInventory(inventory: ModuleInventory): void {
  if (inventory.scssFiles.length > 0 && !inventory.sassAvailable) {
    throw new Error(SCSS_SASS_ERROR);
  }
}

export function createModuleNameRegistry(
  inventory: ModuleInventory,
  naming?: NamingConfig,
  reserved?: ReadonlySet<string>,
  exclusions?: ExclusionConfig,
): NameRegistry {
  const keys = inventory.locals.map(function (entry) {
    return entry.key;
  });
  const universe = new Set(keys);
  const sourceTokens = new Set(keys);
  let registry = createNameRegistry({
    universe,
    sourceTokens,
    exclusions,
  });
  if (naming === undefined || naming.strategy !== "words") {
    return registry;
  }
  const renamedTokens = registry.entries().map(function (entry) {
    return entry.token;
  });
  const reservedNames = new Set<string>(reserved ?? []);
  for (const global of inventory.globals) reservedNames.add(global.local);
  for (const name of exclusions?.names ?? []) reservedNames.add(name);
  const result = resolveNaming(naming, renamedTokens, [], reservedNames);
  if (result === undefined) return registry;
  const names = result.names;
  registry = createNameRegistry({
    universe,
    sourceTokens,
    exclusions,
    hash: function (token: string): string {
      return names.get(token) ?? hashClassName(token);
    },
  });
  registry.assertBijection();
  return registry;
}

export function prepareModulesNaming(
  root: string,
  naming: NamingConfig | undefined,
  reserved?: ReadonlySet<string>,
  exclusions?: ExclusionConfig,
): { inventory: ModuleInventory; registry: NameRegistry } {
  const inventory = collectModuleInventory(root);
  if (naming !== undefined && naming.strategy === "words") {
    assertWordsInventory(inventory);
  }
  return {
    inventory,
    registry: createModuleNameRegistry(inventory, naming, reserved, exclusions),
  };
}
