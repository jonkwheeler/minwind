import { Buffer } from 'node:buffer'
import type { CssFileModel } from './css-model.js'
import { modelCssFile } from './css-model.js'
import { requireSource, type DiscoveredBuild } from './discover.js'
import type { ClassModel } from './exclusions.js'
import { isTokenReferencedInText } from './exclusions.js'
import type { ClassAttributeOccurrence } from './html-model.js'
import { modelHtmlFile } from './html-model.js'
import type { SourceSpan } from './util.js'
import { compareCodeUnits } from './util.js'

// Span editing (KTD2): every simulated transform is expressed as edits against
// the original source string, each carrying the content recorded at model time
// (`expected`). Documents are never reserialized. An edit whose recorded
// content no longer matches the original substring — or that overlaps an
// already-applied edit — routes its owning class (or consolidate list) to the
// unmodelable set: every edit of that owner is dropped so the class keeps its
// original bytes everywhere.
export interface SpanEdit {
  start: number
  end: number
  expected: string
  replacement: string
  owner: string
}

export interface SpanEditApplication {
  output: string
  rejectedOwners: Array<string>
}

export function applySpanEdits(
  source: string,
  edits: Array<SpanEdit>,
): SpanEditApplication {
  const ordered = edits
    .map(function (edit, index) {
      return { edit, index }
    })
    .sort(function (a, b) {
      if (a.edit.start !== b.edit.start) return b.edit.start - a.edit.start
      // Same-offset insertions apply last-in-array first so the final text
      // keeps array order.
      return b.index - a.index
    })
  let floorStart = Infinity
  const rejected = new Set<string>()
  const rejectedOwners: Array<string> = []
  const accepted: Array<SpanEdit> = []
  for (const { edit } of ordered) {
    if (rejected.has(edit.owner)) continue
    const overlaps = edit.end > floorStart
    if (overlaps || source.slice(edit.start, edit.end) !== edit.expected) {
      rejected.add(edit.owner)
      rejectedOwners.push(edit.owner)
      continue
    }
    accepted.push(edit)
    floorStart = edit.start
  }
  // Assemble once: accepted edits are non-overlapping in descending offset
  // order, so reversing walks the source front to back; same-offset
  // insertions end up in array order, matching sequential application.
  accepted.reverse()
  let output = ''
  let cursor = 0
  for (const edit of accepted) {
    output += source.slice(cursor, edit.start) + edit.replacement
    cursor = edit.end
  }
  output += source.slice(cursor)
  return { output, rejectedOwners }
}

// Re-runs application until every rejected owner's edits are dropped
// everywhere, so a mid-pass mismatch never leaves a class half-rewritten.
export function routeAndApplySpanEdits(
  source: string,
  edits: Array<SpanEdit>,
): SpanEditApplication {
  const dropped = new Set<string>()
  for (let attempt = 0; attempt <= edits.length; attempt += 1) {
    const active = edits.filter(function (edit) {
      return !dropped.has(edit.owner)
    })
    const result = applySpanEdits(source, active)
    const fresh = result.rejectedOwners.filter(function (owner) {
      return !dropped.has(owner)
    })
    if (fresh.length === 0) {
      return {
        output: result.output,
        rejectedOwners: Array.from(dropped).sort(compareCodeUnits),
      }
    }
    for (const owner of fresh) dropped.add(owner)
  }
  throw new Error('span edit routing did not converge')
}

export interface RawTokenSpan {
  token: string
  start: number
  end: number
}

// Splits the raw source inside a class-attribute value span exactly like
// splitClassAttributeValue, but keeps absolute offsets for span editing.
export function rawTokensWithinSpan(
  source: string,
  span: SourceSpan,
): Array<RawTokenSpan> {
  const tokens: Array<RawTokenSpan> = []
  const text = source.slice(span.start, span.end)
  for (const match of text.matchAll(/[^ \t\n\f\r]+/g)) {
    tokens.push({
      token: match[0],
      start: span.start + match.index,
      end: span.start + match.index + match[0].length,
    })
  }
  return tokens
}

// Generated class names (KTD7): identifier-safe (no leading digit),
// enumerated length-first then alphabet order; every comparison is by
// code unit, never locale-sensitive.
const NAME_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'

function* enumerateNames(): Generator<string, never, void> {
  for (let length = 1; ; length += 1) {
    const indices = new Array<number>(length).fill(0)
    for (;;) {
      let name = ''
      for (const index of indices) name += NAME_ALPHABET[index]
      yield name
      let position = length - 1
      while (position >= 0) {
        indices[position] += 1
        if (indices[position] < NAME_ALPHABET.length) break
        indices[position] = 0
        position -= 1
      }
      if (position < 0) break
    }
  }
}

// Allocates generated names, skipping any name the caller marks taken
// (already assigned, already present per KTD5, or an existing class token).
export function createNameAllocator(
  isTaken: (name: string) => boolean,
): () => string {
  const names = enumerateNames()
  return function allocate(): string {
    for (;;) {
      const name = names.next().value
      if (!isTaken(name)) return name
    }
  }
}

// Arm-level allocator over a simulation input (KTD5 collision semantics): a
// generated name is taken when it is already assigned within the arm, matches
// an existing class token — covers class selectors, which the boundary matcher
// cannot see through the leading dot — or is present anywhere in the corpus.
// Each arm calls this for itself, so arms allocate independently.
export function createArmNameAllocator(input: SimulationInput): () => string {
  const taken = new Set(
    input.model.entries.map(function (entry) {
      return entry.token
    }),
  )
  const corpus = input.corpusTexts
  const allocate = createNameAllocator(function (name) {
    if (taken.has(name)) return true
    return corpus.some(function (text) {
      return isTokenReferencedInText(name, text)
    })
  })
  return function (): string {
    const name = allocate()
    taken.add(name)
    return name
  }
}

// Shared arm input: the immutable class model plus the per-file sources and
// parsed models every arm needs. Arms are pure over this input and each
// returns its own simulated file map (path -> contents); nothing is written
// to the build directory (report-only, R6).
export interface SimulationInput {
  build: DiscoveredBuild
  model: ClassModel
  htmlSources: Map<string, string>
  htmlClassAttributes: Map<string, Array<ClassAttributeOccurrence>>
  cssSources: Map<string, string>
  cssModels: Map<string, CssFileModel>
  corpusTexts: Array<string>
}

export function buildSimulationInput(
  build: DiscoveredBuild,
  model: ClassModel,
): SimulationInput {
  const htmlSources = new Map<string, string>()
  const htmlClassAttributes = new Map<string, Array<ClassAttributeOccurrence>>()
  const corpusTexts: Array<string> = []
  for (const htmlFile of build.htmlFiles) {
    const source = requireSource(build.sources, htmlFile)
    htmlSources.set(htmlFile, source)
    // Files skipped by the model (e.g. duplicate class attribute) carry no
    // class model, so every arm keeps their original bytes.
    const result = modelHtmlFile(htmlFile, source)
    if (result.ok) {
      htmlClassAttributes.set(htmlFile, result.model.classAttributes)
      // The KTD5 HTML presence corpus is modeled content only — attribute
      // values and text nodes (inline script raw text included) — so tag
      // names, attribute names, and comments cannot block generated names.
      corpusTexts.push(...result.model.attributeValues)
      corpusTexts.push(...result.model.textNodes)
    } else {
      // An unmodeled file still ships its original bytes, so keep its raw
      // source in the corpus as a conservative superset of its content.
      corpusTexts.push(source)
    }
  }
  const cssSources = new Map<string, string>()
  const cssModels = new Map<string, CssFileModel>()
  for (const cssFile of build.cssFiles) {
    const source = requireSource(build.sources, cssFile)
    cssSources.set(cssFile, source)
    corpusTexts.push(source)
    cssModels.set(cssFile, modelCssFile(cssFile, source))
  }
  for (const jsFile of build.jsFiles) {
    corpusTexts.push(requireSource(build.sources, jsFile))
  }
  return {
    build,
    model,
    htmlSources,
    htmlClassAttributes,
    cssSources,
    cssModels,
    corpusTexts,
  }
}

export type ArmName = 'baseline' | 'rename' | 'consolidate'

export interface ArmSummary {
  arm: ArmName
  filesSimulated: number
  filesChanged: number
  classesRenamed: number
  listsConsolidated: number
  byteDelta: number
  unmodelableTokens: Array<string>
  unmodelableLists: Array<string>
}

export interface ArmResult {
  files: Map<string, string>
  summary: ArmSummary
}

export function buildArmResult(
  arm: ArmName,
  input: SimulationInput,
  files: Map<string, string>,
  counts: {
    classesRenamed?: number
    listsConsolidated?: number
    unmodelableTokens?: Array<string>
    unmodelableLists?: Array<string>
  },
): ArmResult {
  let filesChanged = 0
  let byteDelta = 0
  for (const [filePath, contents] of files) {
    const original =
      input.htmlSources.get(filePath) ?? input.cssSources.get(filePath)
    if (original === undefined) continue
    if (contents !== original) filesChanged += 1
    byteDelta +=
      Buffer.byteLength(contents, 'utf8') - Buffer.byteLength(original, 'utf8')
  }
  return {
    files,
    summary: {
      arm,
      filesSimulated: files.size,
      filesChanged,
      classesRenamed: counts.classesRenamed ?? 0,
      listsConsolidated: counts.listsConsolidated ?? 0,
      byteDelta,
      unmodelableTokens: counts.unmodelableTokens ?? [],
      unmodelableLists: counts.unmodelableLists ?? [],
    },
  }
}
