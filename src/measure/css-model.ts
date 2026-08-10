import fs from 'node:fs'
import * as csstree from 'css-tree'
import type { SourceSpan } from './util.js'

export type { SourceSpan } from './util.js'

export interface AtRuleContext {
  name: string
  prelude: string
}

export interface SelectorArmModel {
  span: SourceSpan
  // Absolute source offsets of the candidate's escaped identifier (without
  // the leading dot), recorded while the original ClassSelector node and its
  // location are in hand, so arms never re-parse the selector. Null when the
  // arm has no class selector or the node carries no location.
  candidateSpan: SourceSpan | null
  candidates: Array<string>
  references: Array<string>
}

export interface CssRuleModel {
  arms: Array<SelectorArmModel>
  inUtilitiesLayer: boolean
}

export interface CssFileModel {
  filePath: string
  rules: Array<CssRuleModel>
  parseWarnings: Array<string>
}

// Inverse of CSS identifier serialization, per CSS Syntax "consume an escaped
// code point" — delegated to css-tree's spec-compliant decoder.
export function unescapeCssIdentifier(raw: string): string {
  return csstree.ident.decode(raw)
}

function preludeText(atrule: csstree.CssNode, source: string): string {
  const location = atrule.prelude?.loc
  if (!location) return ''
  return source.slice(location.start.offset, location.end.offset)
}

function isUtilitiesLayer(context: AtRuleContext): boolean {
  return context.name === 'layer' && context.prelude.trim() === 'utilities'
}

// A ClassSelector location starts at the dot and ends after the identifier.
function identifierSpanOf(classNode: csstree.CssNode): SourceSpan | null {
  if (!classNode.loc) return null
  return {
    start: classNode.loc.start.offset + 1,
    end: classNode.loc.end.offset,
  }
}

interface NestedClass {
  node: csstree.CssNode
  name: string
}

function collectNestedClasses(
  node: csstree.CssNode,
  out: Array<NestedClass>,
): void {
  if (node.type === 'ClassSelector') {
    out.push({ node, name: unescapeCssIdentifier(node.name ?? '') })
  }
  if (node.children) {
    node.children.forEach(function (child) {
      collectNestedClasses(child, out)
    })
  }
}

// The candidate a rule styles is the last top-level class selector in the
// arm: Tailwind substitutes the candidate for `&` in the variant template, so
// it may sit in any compound (`.[\&_pre]\:x pre`) or carry pseudo state
// (`.hover\:x:hover`). Every other class selector — earlier compounds
// (`.group:hover .group-hover\:x`) or nested inside pseudo-class arguments
// (`:is(:where(.group):hover *)`) — is a marker reference. When the whole arm
// is wrapped in a specificity-erasing pseudo (`:where(.space-y-3>:not(:last-
// child))`), there is no top-level class selector and the last class selector
// in document order is the candidate.
function modelSelectorArm(selector: csstree.CssNode): SelectorArmModel {
  const parts = selector.children ? selector.children.toArray() : []
  let lastClassIndex = -1
  for (let i = 0; i < parts.length; i += 1) {
    if (parts[i].type === 'ClassSelector') lastClassIndex = i
  }
  const candidates: Array<string> = []
  const references: Array<string> = []
  let candidateNode: csstree.CssNode | null = null
  if (lastClassIndex === -1) {
    const nested: Array<NestedClass> = []
    for (const part of parts) collectNestedClasses(part, nested)
    for (let i = 0; i < nested.length; i += 1) {
      if (i === nested.length - 1) candidates.push(nested[i].name)
      else references.push(nested[i].name)
    }
    candidateNode = nested.length > 0 ? nested[nested.length - 1].node : null
  } else {
    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i]
      if (part.type === 'ClassSelector' && i === lastClassIndex) {
        candidates.push(unescapeCssIdentifier(part.name ?? ''))
        candidateNode = part
      } else {
        const nested: Array<NestedClass> = []
        collectNestedClasses(part, nested)
        for (const entry of nested) references.push(entry.name)
      }
    }
  }
  return {
    span: {
      start: selector.loc?.start.offset ?? 0,
      end: selector.loc?.end.offset ?? 0,
    },
    candidateSpan:
      candidateNode === null ? null : identifierSpanOf(candidateNode),
    candidates,
    references,
  }
}

function modelRule(
  rule: csstree.CssNode,
  stack: Array<AtRuleContext>,
): CssRuleModel {
  const arms: Array<SelectorArmModel> = []
  const prelude = rule.prelude
  if (prelude && prelude.type === 'SelectorList' && prelude.children) {
    prelude.children.forEach(function (selector) {
      arms.push(modelSelectorArm(selector))
    })
  }
  return {
    arms,
    inUtilitiesLayer: stack.some(isUtilitiesLayer),
  }
}

function visitNode(
  node: csstree.CssNode,
  stack: Array<AtRuleContext>,
  source: string,
  rules: Array<CssRuleModel>,
): void {
  if (node.type === 'Atrule') {
    const context = stack.concat([
      { name: node.name ?? '', prelude: preludeText(node, source) },
    ])
    if (node.block) visitChildren(node.block, context, source, rules)
    return
  }
  if (node.type === 'Rule') {
    rules.push(modelRule(node, stack))
    return
  }
  visitChildren(node, stack, source, rules)
}

function visitChildren(
  node: csstree.CssNode,
  stack: Array<AtRuleContext>,
  source: string,
  rules: Array<CssRuleModel>,
): void {
  if (!node.children) return
  node.children.forEach(function (child) {
    visitNode(child, stack, source, rules)
  })
}

// css-tree recovers from parse errors it cannot grammar-fit (commonly
// vendor-prefixed @supports conditions, which fall back to raw preludes), so
// errors are surfaced as warnings while the partial model stays usable. Rules
// lost to recovery only ever shrink the rule index, which pushes tokens toward
// exclusion — the safe direction.
export function modelCssFile(
  filePath: string,
  contents?: string,
): CssFileModel {
  const source = contents ?? fs.readFileSync(filePath, 'utf8')
  const parseWarnings: Array<string> = []
  const ast = csstree.parse(source, {
    positions: true,
    onParseError: function (error) {
      parseWarnings.push(
        `CSS parse error at line ${error.line}: ${error.message}`,
      )
    },
  })
  const rules: Array<CssRuleModel> = []
  visitChildren(ast, [], source, rules)
  return { filePath, rules, parseWarnings }
}
