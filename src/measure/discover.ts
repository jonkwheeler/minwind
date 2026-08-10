import { Buffer } from "node:buffer";
import fs from "node:fs";
import path from "node:path";
import { compareCodeUnits } from "./util.js";

export const SKIPPED_ENTRY_NAMES = new Set([
  ".DS_Store",
  "_headers",
  "_redirects",
]);
export const SKIPPED_DIRECTORY_NAMES = new Set([".vite"]);

export interface DiscoveredBuild {
  buildDir: string;
  htmlFiles: Array<string>;
  cssFiles: Array<string>;
  jsFiles: Array<string>;
  stylesheetsByHtml: Map<string, Array<string>>;
  warnings: Array<string>;
  // Decoded UTF-8 source of every analyzable file, keyed by path. Each file
  // is read and validated exactly once at discovery; every later phase uses
  // these bytes instead of re-reading from disk.
  sources: Map<string, string>;
}

export class InputError extends Error {}
export class InvalidUtf8Error extends Error {
  constructor(public readonly filePath: string) {
    super(`File is not valid UTF-8: ${filePath}`);
    this.name = "InvalidUtf8Error";
  }
}

// Decodes already-read bytes with a fatal UTF-8 decoder. The round-trip
// check catches lone surrogates that decode without throwing, and rejects
// BOMs because the decoder strips them from the decoded text.
function decodeValidatedUtf8(filePath: string, bytes: Buffer): string {
  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new InvalidUtf8Error(filePath);
  }
  if (Buffer.from(decoded, "utf8").compare(bytes) !== 0) {
    throw new InvalidUtf8Error(filePath);
  }
  return decoded;
}

export function assertValidUtf8(filePath: string): void {
  decodeValidatedUtf8(filePath, fs.readFileSync(filePath));
}

// Every analyzable file has a sources entry by construction; a miss means a
// caller passed a path discovery never enumerated, which is a bug.
export function requireSource(
  sources: Map<string, string>,
  filePath: string,
): string {
  const source = sources.get(filePath);
  if (source === undefined) {
    throw new Error(`missing discovered source: ${filePath}`);
  }
  return source;
}

export function enumerateBuildFiles(buildDir: string): Array<string> {
  const results: Array<string> = [];

  function walk(dir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    entries.sort(function (a, b) {
      return compareCodeUnits(a.name, b.name);
    });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (SKIPPED_ENTRY_NAMES.has(entry.name)) continue;
      if (SKIPPED_DIRECTORY_NAMES.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        results.push(fullPath);
      }
    }
  }

  walk(buildDir);
  results.sort(compareCodeUnits);
  return results;
}

export function isAnalyzableFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ext === ".html" || ext === ".css" || ext === ".js";
}

export function splitAnalyzable(files: Array<string>): {
  htmlFiles: Array<string>;
  cssFiles: Array<string>;
  jsFiles: Array<string>;
} {
  const htmlFiles: Array<string> = [];
  const cssFiles: Array<string> = [];
  const jsFiles: Array<string> = [];
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (ext === ".html") htmlFiles.push(file);
    else if (ext === ".css") cssFiles.push(file);
    else if (ext === ".js") jsFiles.push(file);
  }
  return { htmlFiles, cssFiles, jsFiles };
}

function isExternalHref(href: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//");
}

function extractStylesheetHrefs(html: string): Array<string> {
  const hrefs: Array<string> = [];
  const linkPattern = /<link\b[^>]*>/gi;
  for (const match of html.matchAll(linkPattern)) {
    const tag = match[0];
    const relMatch = /rel\s*=\s*["'][^"']*stylesheet[^"']*["']/i.exec(tag);
    if (!relMatch) continue;
    const hrefMatch = /href\s*=\s*["']([^"']+)["']/i.exec(tag);
    if (!hrefMatch) continue;
    hrefs.push(hrefMatch[1]);
  }
  return hrefs;
}

export function resolveStylesheetHref(
  href: string,
  htmlFile: string,
  buildDir: string,
): string | null {
  if (isExternalHref(href)) return null;
  const pathname = href.split(/[?#]/)[0];
  if (pathname === "") return null;
  const resolved = pathname.startsWith("/")
    ? path.resolve(buildDir, "." + pathname)
    : path.resolve(path.dirname(htmlFile), pathname);
  const relative = path.relative(buildDir, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return resolved;
}

export function associateStylesheets(
  htmlFiles: Array<string>,
  buildDir: string,
  sources: Map<string, string>,
  cssFiles: Array<string>,
): { stylesheetsByHtml: Map<string, Array<string>>; warnings: Array<string> } {
  const stylesheetsByHtml = new Map<string, Array<string>>();
  const warnings: Array<string> = [];
  const discoveredCss = new Set(cssFiles);
  for (const htmlFile of htmlFiles) {
    const html = requireSource(sources, htmlFile);
    const hrefs = extractStylesheetHrefs(html);
    const resolvedSet = new Set<string>();
    for (const href of hrefs) {
      const resolved = resolveStylesheetHref(href, htmlFile, buildDir);
      if (resolved === null) continue;
      if (resolvedSet.has(resolved)) continue;
      resolvedSet.add(resolved);
      if (!fs.existsSync(resolved)) {
        warnings.push(
          `linked stylesheet not found on disk: ${path.relative(buildDir, resolved)} (referenced from ${path.relative(buildDir, htmlFile)})`,
        );
        continue;
      }
      // A linked path can exist on disk without being a discovered CSS file
      // — a directory, a non-.css file, or a symlink enumeration never
      // followed. Only discovered files get measured, so associating one of
      // these would silently report its bytes as zero.
      if (!discoveredCss.has(resolved)) {
        warnings.push(
          `linked stylesheet is not a discovered CSS file: ${path.relative(buildDir, resolved)} (referenced from ${path.relative(buildDir, htmlFile)})`,
        );
        continue;
      }
      const existing = stylesheetsByHtml.get(htmlFile) ?? [];
      existing.push(resolved);
      stylesheetsByHtml.set(htmlFile, existing);
    }
  }
  warnings.sort(compareCodeUnits);
  return { stylesheetsByHtml, warnings };
}

function routeToHtmlRelative(routePath: string): string {
  const clean = routePath.replace(/\/+$/, "");
  if (clean === "") return "index.html";
  return clean.slice(1) + ".html";
}

export function findSitemapRoutesWithoutHtml(
  buildDir: string,
  htmlFiles: Array<string>,
): Array<string> {
  const sitemapPath = path.join(buildDir, "sitemap.xml");
  let sitemap: string;
  try {
    sitemap = fs.readFileSync(sitemapPath, "utf8");
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") return [];
    throw error;
  }
  const htmlRelativeSet = new Set(
    htmlFiles.map(function (f) {
      return path.relative(buildDir, f).split(path.sep).join("/");
    }),
  );
  const missing: Array<string> = [];
  const locPattern = /<loc>\s*([^<]+?)\s*<\/loc>/g;
  for (const match of sitemap.matchAll(locPattern)) {
    const loc = match[1];
    let pathname: string;
    try {
      pathname = new URL(loc).pathname;
    } catch {
      pathname = loc.startsWith("/") ? loc : "/" + loc;
    }
    const expectedHtml = routeToHtmlRelative(pathname);
    if (!htmlRelativeSet.has(expectedHtml)) {
      missing.push(pathname);
    }
  }
  missing.sort(compareCodeUnits);
  return missing;
}

export function discoverBuild(buildDirInput: string): DiscoveredBuild {
  const buildDir = path.resolve(buildDirInput);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(buildDir);
  } catch {
    throw new InputError(`build directory does not exist: ${buildDirInput}`);
  }
  if (!stat.isDirectory()) {
    throw new InputError(`not a directory: ${buildDirInput}`);
  }

  const allFiles = enumerateBuildFiles(buildDir);
  const analyzable = allFiles.filter(isAnalyzableFile);
  // Read each analyzable file once as bytes, validate, and decode once; the
  // decoded sources carry through association, modeling, and simulation so
  // no phase can observe a file that changed after this snapshot.
  const sources = new Map<string, string>();
  for (const file of analyzable) {
    sources.set(file, decodeValidatedUtf8(file, fs.readFileSync(file)));
  }

  const { htmlFiles, cssFiles, jsFiles } = splitAnalyzable(analyzable);
  const { stylesheetsByHtml, warnings } = associateStylesheets(
    htmlFiles,
    buildDir,
    sources,
    cssFiles,
  );
  for (const route of findSitemapRoutesWithoutHtml(buildDir, htmlFiles)) {
    warnings.push(`sitemap route has no HTML file: ${route}`);
  }

  return {
    buildDir,
    htmlFiles,
    cssFiles,
    jsFiles,
    stylesheetsByHtml,
    warnings,
    sources,
  };
}
