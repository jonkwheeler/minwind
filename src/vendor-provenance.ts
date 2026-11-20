import path from "node:path";
import { decode, type SourceMapSegment } from "@jridgewell/sourcemap-codec";

// trustVendorModules (R10, KTD10, KTD11). A leak occurrence in an emitted
// client chunk stops counting only when the chunk's sourcemap attributes it
// to a trusted node_modules package. Attribution works on the final chunk,
// since module-level code is wrong both ways: the minifier mangles a
// module's local names, and a render hook or the minifier can add text that
// no module holds. Everything this module cannot attribute counts as
// before: a chunk without a record or a usable map, and an occurrence
// without a mapping or one that maps to project code.

// true trusts every node_modules package; an array trusts the named ones.
export type VendorTrust = true | ReadonlyArray<string>;

// The fields of a version 3 sourcemap that attribution reads.
export interface SourceMapLike {
  sources: ReadonlyArray<string | null>;
  sourcesContent?: ReadonlyArray<string | null>;
  mappings: string;
}

// A client chunk as the bundler wrote it.
export interface ChunkProvenance {
  // Absolute path of the emitted file.
  file: string;
  code: string;
  // null when the bundler produced no map for the chunk.
  map: SourceMapLike | null;
}

export interface VendorProvenance {
  trust: VendorTrust;
  chunks: ReadonlyArray<ChunkProvenance>;
}

// Whether the occurrence of token at a 1-based line and column of the
// chunk, as a leak warning locates it, came from trusted vendor code.
export type VendorOccurrenceTest = (
  line: number,
  column: number,
  token: string,
) => boolean;

const NODE_MODULES = "/node_modules/";
const QUOTES = "\"'`";

// Line breaks other than \n and \r\n. Parsers count them as line breaks and
// sourcemap generators may not, so with one present a line and column can
// name different text on either side.
const IRREGULAR_LINE_BREAK = /\r(?!\n)|[\u2028\u2029]/;

// KTD10: a source is vendor code when its path, without a \0 prefix or a
// query and with / separators, has a node_modules directory. With an array,
// the package after the last node_modules must be listed; a scoped name
// spans two segments. Everything else is project code, \0 helpers included.
function isTrustedSource(source: string, trust: VendorTrust): boolean {
  let clean = source.startsWith("\0") ? source.slice(1) : source;
  const query = clean.indexOf("?");
  if (query !== -1) clean = clean.slice(0, query);
  clean = `/${clean.replace(/\\/g, "/")}`;
  const at = clean.lastIndexOf(NODE_MODULES);
  if (at === -1) return false;
  if (trust === true) return true;
  const segments = clean.slice(at + NODE_MODULES.length).split("/");
  const name = segments[0].startsWith("@")
    ? `${segments[0]}/${segments[1] ?? ""}`
    : segments[0];
  return trust.includes(name);
}

function lineStartsOf(text: string): Array<number> {
  const starts = [0];
  for (
    let at = text.indexOf("\n");
    at !== -1;
    at = text.indexOf("\n", at + 1)
  ) {
    starts.push(at + 1);
  }
  return starts;
}

// The segment that covers a generated column: the last one starting at or
// before it.
function coveringSegment(
  segments: ReadonlyArray<SourceMapSegment>,
  column: number,
): SourceMapSegment | undefined {
  let low = 0;
  let high = segments.length - 1;
  let found: SourceMapSegment | undefined;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (segments[middle][0] <= column) {
      found = segments[middle];
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}

// Minifiers requote string literals (Rolldown writes backticks), so the
// first character may be any quote on either side.
function copiedVerbatim(generated: string, original: string): boolean {
  if (generated.length !== original.length || generated.length === 0) {
    return false;
  }
  if (generated.slice(1) !== original.slice(1)) return false;
  return (
    generated[0] === original[0] ||
    (QUOTES.includes(generated[0]) && QUOTES.includes(original[0]))
  );
}

interface TrustedSource {
  content: string;
  lineStarts: Array<number>;
}

// null when the record carries no usable attribution, so the chunk scans
// whole. An occurrence is trusted only when its mapping names a trusted
// source and the text from the mapping point through the occurrence is that
// source's own text there. The check bounds a mapping's reach: text a
// render hook appended after vendor code has no mapping of its own, and the
// vendor segment before it does not hold it.
function attributeChunk(
  record: ChunkProvenance,
  trust: VendorTrust,
): VendorOccurrenceTest | null {
  const map = record.map;
  if (map === null || IRREGULAR_LINE_BREAK.test(record.code)) return null;
  let lines: Array<Array<SourceMapSegment>>;
  try {
    lines = decode(map.mappings);
  } catch {
    return null;
  }
  if (lines.length === 0) return null;
  for (const segments of lines) {
    segments.sort(function (a, b) {
      return a[0] - b[0];
    });
  }
  const sources = map.sources.map(
    function (source, index): TrustedSource | null {
      const content = map.sourcesContent?.[index];
      if (
        source === null ||
        typeof content !== "string" ||
        IRREGULAR_LINE_BREAK.test(content) ||
        !isTrustedSource(source, trust)
      ) {
        return null;
      }
      return { content, lineStarts: lineStartsOf(content) };
    },
  );
  const code = record.code;
  const lineStarts = lineStartsOf(code);
  return function (line, column, token) {
    const segments = lines[line - 1];
    const lineStart = lineStarts[line - 1];
    if (segments === undefined || lineStart === undefined) return false;
    const start = lineStart + column - 1;
    const end = start + token.length;
    if (code.slice(start, end) !== token) return false;
    const segment = coveringSegment(segments, column - 1);
    if (segment === undefined || segment.length === 1) return false;
    const source = sources[segment[1]];
    if (source === null || source === undefined) return false;
    const sourceLineStart = source.lineStarts[segment[2]];
    if (sourceLineStart === undefined) return false;
    const sourceLineEnd =
      source.lineStarts[segment[2] + 1] ?? source.content.length + 1;
    if (sourceLineStart + segment[3] >= sourceLineEnd) return false;
    const generated = code.slice(lineStart + segment[0], end);
    const sourceStart = sourceLineStart + segment[3];
    return copiedVerbatim(
      generated,
      source.content.slice(sourceStart, sourceStart + generated.length),
    );
  };
}

// Per emitted file, the test for its occurrences, or null when the file has
// no record or its bytes differ from the recorded code (a later hook
// rewrote it, or the file is not the chunk), so it scans whole.
export function vendorAttribution(
  provenance: VendorProvenance | undefined,
): (file: string, code: string) => VendorOccurrenceTest | null {
  if (provenance === undefined) {
    return function () {
      return null;
    };
  }
  const records = new Map<string, ChunkProvenance>();
  for (const chunk of provenance.chunks) {
    records.set(path.resolve(chunk.file), chunk);
  }
  const tests = new Map<string, VendorOccurrenceTest | null>();
  return function (file, code) {
    const key = path.resolve(file);
    const record = records.get(key);
    if (record === undefined || record.code !== code) return null;
    if (!tests.has(key)) {
      tests.set(key, attributeChunk(record, provenance.trust));
    }
    return tests.get(key) ?? null;
  };
}

// Structural Vite and Rolldown types: Vite is the host's dependency.
export interface OutputChunkLike {
  type: "chunk";
  fileName: string;
  code: string;
  map?: SourceMapLike | null;
  sourcemapFileName?: string | null;
}

export interface OutputAssetLike {
  type: "asset";
  fileName: string;
}

export type OutputBundleLike = Record<
  string,
  OutputChunkLike | OutputAssetLike
>;

export interface VendorProvenancePlugin {
  name: string;
  applyToEnvironment(environment: { name: string }): boolean;
  configEnvironment(
    name: string,
    config: { build?: { sourcemap?: unknown } },
  ): { build: { sourcemap: "hidden" } } | undefined;
  generateBundle(
    options: { sourcemap?: unknown },
    bundle: OutputBundleLike,
  ): void;
  writeBundle(options: { dir?: string }, bundle: OutputBundleLike): void;
}

// The read-only recording plugin minwind/astro injects (KTD10). It runs in
// the client environment only, the way Astro scopes its own build plugins.
// Without maps from the site's own config it asks for hidden ones, which
// leave the chunks' bytes alone, and deletes them from the bundle before
// the write, so dist gains no .map file. writeBundle sees each chunk as
// written, after every generateBundle hook (Vite rewrites preload markers
// there, and Astro deletes the chunks it inlines into pages).
export function vendorProvenancePlugin(
  chunks: Array<ChunkProvenance>,
): VendorProvenancePlugin {
  // Astro resolves the client config in several rounds, and the later ones
  // see the "hidden" the first asked for. A site's own map setting shows
  // from the first round, so the plugin never asks then, and its maps stay.
  let ownsMaps = false;
  return {
    name: "minwind:vendor-provenance",
    applyToEnvironment: function (environment) {
      return environment.name === "client";
    },
    configEnvironment: function (name, config) {
      if (name !== "client" || Boolean(config.build?.sourcemap)) {
        return undefined;
      }
      ownsMaps = true;
      return { build: { sourcemap: "hidden" } };
    },
    // A later hook can still set a mode of its own, and its maps are the
    // site's: true also links each one from its chunk. So the maps go only
    // when the output's mode is still the "hidden" the plugin asked for.
    generateBundle: function (options, bundle) {
      if (!ownsMaps || options.sourcemap !== "hidden") return;
      for (const output of Object.values(bundle)) {
        if (output.type !== "chunk") continue;
        const mapFile = output.sourcemapFileName ?? `${output.fileName}.map`;
        if (bundle[mapFile]?.type === "asset") delete bundle[mapFile];
      }
    },
    writeBundle: function (options, bundle) {
      if (options.dir === undefined) return;
      for (const output of Object.values(bundle)) {
        if (output.type !== "chunk") continue;
        const map = output.map;
        chunks.push({
          file: path.resolve(options.dir, output.fileName),
          code: output.code,
          map:
            map === null ||
            map === undefined ||
            typeof map.mappings !== "string"
              ? null
              : {
                  sources: map.sources,
                  sourcesContent: map.sourcesContent,
                  mappings: map.mappings,
                },
        });
      }
    },
  };
}
