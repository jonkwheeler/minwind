import * as csstree from 'css-tree'
import { unescapeCssIdentifier } from '../css-model.js'
import type { SourceSpan } from '../html-model.js'
import type { ArmResult, SimulationInput, SpanEdit } from '../span-edit.js'
import {
  buildArmResult,
  createArmNameAllocator,
  routeAndApplySpanEdits,
} from '../span-edit.js'
import { compareCodeUnits } from '../util.js'

interface UtilitiesBlockView {
  innerEnd: number
}

interface BareUtilityRule {
  tokens: Array<string>
  ruleStart: number
  declarations: string
  blockIndex: number
}

interface UtilitiesLayerView {
  bareOnly: boolean
  blocks: Array<UtilitiesBlockView>
  bareRules: Array<BareUtilityRule>
}

// KTD8 layer view: every top-level `@layer utilities` block's inner span, the
// bare-class rules directly inside each block, and whether the layer holds
// only bare-class rules. A non-bare or nested rule fails the whole layer,
// because an appended shared rule could otherwise reorder the cascade.
// Rules lost to css-tree parse recovery simply never appear here, which only
// ever shrinks consolidation — the safe direction.
function buildUtilitiesLayerView(source: string): UtilitiesLayerView {
  const view: UtilitiesLayerView = { bareOnly: true, blocks: [], bareRules: [] }
  let ast: csstree.CssNode
  try {
    ast = csstree.parse(source, { positions: true })
  } catch {
    view.bareOnly = false
    return view
  }
  if (!ast.children) return view
  ast.children.forEach(function (node) {
    if (node.type !== 'Atrule' || node.name !== 'layer') return
    const preludeLoc = node.prelude?.loc
    const block = node.block
    const blockLoc = block?.loc
    if (!preludeLoc || !block || !blockLoc) return
    const prelude = source
      .slice(preludeLoc.start.offset, preludeLoc.end.offset)
      .trim()
    if (prelude !== 'utilities') return
    const blockIndex = view.blocks.length
    view.blocks.push({
      innerEnd: blockLoc.end.offset - 1,
    })
    block.children?.forEach(function (child) {
      const ruleLoc = child.loc
      const ruleBlockLoc = child.block?.loc
      if (child.type !== 'Rule' || !ruleLoc || !ruleBlockLoc) {
        view.bareOnly = false
        return
      }
      const tokens: Array<string> = []
      let bare = true
      const preludeNode = child.prelude
      if (
        preludeNode &&
        preludeNode.type === 'SelectorList' &&
        preludeNode.children
      ) {
        preludeNode.children.forEach(function (selector) {
          // The KTD8 "bare class" shape: the whole selector arm is exactly
          // one class selector.
          const parts = selector.children ? selector.children.toArray() : []
          const only = parts.length === 1 ? parts[0] : null
          if (only === null || only.type !== 'ClassSelector') {
            bare = false
            return
          }
          tokens.push(unescapeCssIdentifier(only.name ?? ''))
        })
      } else {
        bare = false
      }
      if (!bare || tokens.length === 0) {
        view.bareOnly = false
        return
      }
      view.bareRules.push({
        tokens,
        ruleStart: ruleLoc.start.offset,
        declarations: source.slice(
          ruleBlockLoc.start.offset + 1,
          ruleBlockLoc.end.offset - 1,
        ),
        blockIndex,
      })
    })
  })
  return view
}

interface ListOccurrence {
  filePath: string
  span: SourceSpan
}

interface QualifiedGroup {
  key: string
  occurrences: Array<ListOccurrence>
  cssFile: string
  insertionOffset: number
  declarations: Array<string>
  name: string
}

function sharedRuleText(name: string, declarations: Array<string>): string {
  const body = declarations
    .map(function (text) {
      return text.trim()
    })
    .join('\n    ')
  return `\n  .${name} {\n    ${body}\n  }\n`
}

export function simulateConsolidate(input: SimulationInput): ArmResult {
  const viewByFile = new Map<string, UtilitiesLayerView>()
  for (const [filePath, source] of input.cssSources) {
    viewByFile.set(filePath, buildUtilitiesLayerView(source))
  }

  // Token -> bare rules index, built once; lookup order follows stylesheet
  // and rule order, matching a nested scan exactly.
  const rulesByToken = new Map<
    string,
    Array<{ filePath: string; rule: BareUtilityRule }>
  >()
  for (const [candidateFile, view] of viewByFile) {
    for (const rule of view.bareRules) {
      for (const token of new Set(rule.tokens)) {
        let locations = rulesByToken.get(token)
        if (!locations) {
          locations = []
          rulesByToken.set(token, locations)
        }
        locations.push({ filePath: candidateFile, rule })
      }
    }
  }

  // Groups are byte-identical full token lists; each class-attribute
  // occurrence is one element's complete list, so groups partition elements.
  const occurrencesByKey = new Map<string, Array<ListOccurrence>>()
  for (const [filePath, attributes] of input.htmlClassAttributes) {
    for (const occurrence of attributes) {
      if (occurrence.tokens.length === 0) continue
      const key = occurrence.tokens.join(' ')
      let list = occurrencesByKey.get(key)
      if (!list) {
        list = []
        occurrencesByKey.set(key, list)
      }
      list.push({ filePath, span: occurrence.span })
    }
  }

  const entryByToken = new Map(
    input.model.entries.map(function (entry) {
      return [entry.token, entry] as const
    }),
  )

  const allocate = createArmNameAllocator(input)
  const qualified: Array<QualifiedGroup> = []
  const failedKeys: Array<string> = []
  const groups = Array.from(occurrencesByKey.entries()).sort(function (a, b) {
    return compareCodeUnits(a[0], b[0])
  })

  for (const [key, occurrences] of groups) {
    if (occurrences.length < 2) continue
    const tokens = key.split(' ')
    let ok = true
    let cssFile: string | null = null
    let blockIndex = -1
    const memberRules: Array<BareUtilityRule> = []
    for (const token of tokens) {
      const entry = entryByToken.get(token)
      if (
        !entry ||
        entry.category !== 'utility' ||
        entry.excluded ||
        entry.ruleCount !== 1 ||
        entry.utilityRuleCount !== 1 ||
        entry.variantReferences !== 0
      ) {
        ok = false
        break
      }
      const found = rulesByToken.get(token) ?? []
      if (found.length !== 1) {
        ok = false
        break
      }
      const { filePath: ruleFile, rule } = found[0]
      if (cssFile === null) {
        cssFile = ruleFile
        blockIndex = rule.blockIndex
      } else if (ruleFile !== cssFile || rule.blockIndex !== blockIndex) {
        // Members spread across stylesheets or layer blocks would make the
        // appended rule's cascade position ambiguous.
        ok = false
        break
      }
      memberRules.push(rule)
    }
    if (!ok || cssFile === null) {
      failedKeys.push(key)
      continue
    }
    const view = viewByFile.get(cssFile)
    if (!view || !view.bareOnly) {
      failedKeys.push(key)
      continue
    }
    // One copy of each distinct member rule's declarations, in the members'
    // original relative (stylesheet) order.
    const uniqueRules = Array.from(
      new Map(
        memberRules.map(function (rule) {
          return [rule.ruleStart, rule] as const
        }),
      ).values(),
    ).sort(function (a, b) {
      return a.ruleStart - b.ruleStart
    })
    qualified.push({
      key,
      occurrences,
      cssFile,
      insertionOffset: view.blocks[blockIndex].innerEnd,
      declarations: uniqueRules.map(function (rule) {
        return rule.declarations
      }),
      name: allocate(),
    })
  }

  // Routing is global: a group whose edit is rejected anywhere keeps its
  // original bytes in every file, so application loops until a fixpoint.
  const dropped = new Set<string>()
  let files: Map<string, string> | null = null
  for (let attempt = 0; attempt <= qualified.length; attempt += 1) {
    const editsByFile = new Map<string, Array<SpanEdit>>()
    for (const group of qualified) {
      if (dropped.has(group.key)) continue
      for (const occurrence of group.occurrences) {
        const source = input.htmlSources.get(occurrence.filePath)
        if (source === undefined) continue
        let edits = editsByFile.get(occurrence.filePath)
        if (!edits) {
          edits = []
          editsByFile.set(occurrence.filePath, edits)
        }
        edits.push({
          start: occurrence.span.start,
          end: occurrence.span.end,
          expected: source.slice(occurrence.span.start, occurrence.span.end),
          replacement: group.name,
          owner: group.key,
        })
      }
      let cssEdits = editsByFile.get(group.cssFile)
      if (!cssEdits) {
        cssEdits = []
        editsByFile.set(group.cssFile, cssEdits)
      }
      cssEdits.push({
        start: group.insertionOffset,
        end: group.insertionOffset,
        expected: '',
        replacement: sharedRuleText(group.name, group.declarations),
        owner: group.key,
      })
    }
    const nextFiles = new Map<string, string>()
    const rejected: Array<string> = []
    const sources = new Map<string, string>([
      ...input.htmlSources,
      ...input.cssSources,
    ])
    for (const [filePath, source] of sources) {
      const result = routeAndApplySpanEdits(
        source,
        editsByFile.get(filePath) ?? [],
      )
      nextFiles.set(filePath, result.output)
      rejected.push(...result.rejectedOwners)
    }
    const fresh = rejected.filter(function (key) {
      return !dropped.has(key)
    })
    if (fresh.length > 0) {
      for (const key of fresh) dropped.add(key)
      continue
    }
    files = nextFiles
    break
  }
  if (files === null) {
    throw new Error('consolidate edit routing did not converge')
  }

  const unmodelableLists = Array.from(
    new Set([...failedKeys, ...dropped]),
  ).sort(compareCodeUnits)

  return buildArmResult('consolidate', input, files, {
    listsConsolidated: qualified.length - dropped.size,
    unmodelableLists,
  })
}
