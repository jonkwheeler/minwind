import path from "node:path";
import { hashClassName } from "../names.js";

// CSS Modules identity: file-qualified locals, hashed on the fly for the
// first proof path (KTD3, KTD7). The bundler naming hook is the rename
// altitude — export keys stay source locals.

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

export function hashModuleLocal(
  root: string,
  filename: string,
  local: string,
): string {
  return hashClassName(moduleLocalKey(root, filename, local));
}

export function createGenerateScopedName(
  root: string,
  onName?: (local: string, filename: string, generated: string) => void,
): (name: string, filename: string, css: string) => string {
  return function (name: string, filename: string, _css: string): string {
    const generated = hashModuleLocal(root, filename, name);
    if (onName !== undefined) onName(name, filename, generated);
    return generated;
  };
}

export interface WebpackLocalIdentContext {
  resourcePath: string;
}

export function createGetLocalIdent(
  root: string,
  onName?: (local: string, filename: string, generated: string) => void,
): (
  context: WebpackLocalIdentContext,
  localIdentName: string,
  localName: string,
) => string {
  return function (
    context: WebpackLocalIdentContext,
    _localIdentName: string,
    localName: string,
  ): string {
    const generated = hashModuleLocal(root, context.resourcePath, localName);
    if (onName !== undefined) {
      onName(localName, context.resourcePath, generated);
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
