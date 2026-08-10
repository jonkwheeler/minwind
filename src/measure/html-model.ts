import fs from 'node:fs'
import * as parse5 from 'parse5'
import type { DefaultTreeAdapterMap, ParserError } from 'parse5'
import type { SourceSpan } from './util.js'

export type { SourceSpan } from './util.js'

export interface ClassAttributeOccurrence {
  span: SourceSpan
  tokens: Array<string>
}

export interface HtmlFileModel {
  filePath: string
  classAttributes: Array<ClassAttributeOccurrence>
  // Every attribute value and text node in document order: the HTML side of
  // the KTD5 presence corpus. Tag names, attribute names, and comments are
  // deliberately absent so they cannot block generated names; inline script
  // raw text is present here as text nodes as well as under inlineScripts.
  attributeValues: Array<string>
  textNodes: Array<string>
  inlineScripts: Array<string>
}

export type HtmlFileResult =
  | { ok: true; model: HtmlFileModel }
  | { ok: false; filePath: string; reason: string }

type Node = DefaultTreeAdapterMap['node']
type Element = DefaultTreeAdapterMap['element']
type Template = DefaultTreeAdapterMap['template']
type TextNode = DefaultTreeAdapterMap['textNode']

function isAsciiWhitespace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\f' || ch === '\r'
}

function isNonEmpty(token: string): boolean {
  return token !== ''
}

export function splitClassAttributeValue(value: string): Array<string> {
  return value.split(/[ \t\n\f\r]+/).filter(isNonEmpty)
}

// parse5 reports a duplicate-attribute error positioned just after the
// duplicate attribute's name (at `=`, whitespace, or `>`), so the name is
// recovered by scanning backwards from the error offset.
const ATTRIBUTE_NAME_TERMINATORS = new Set([
  ' ',
  '\t',
  '\n',
  '\f',
  '\r',
  '/',
  '>',
  '=',
  '"',
  "'",
  '<',
])

function attributeNameBefore(source: string, offset: number): string {
  let i = offset
  while (
    i > 0 &&
    (source[i] === '=' || source[i] === '>' || isAsciiWhitespace(source[i]))
  ) {
    i -= 1
  }
  let name = ''
  while (i >= 0 && !ATTRIBUTE_NAME_TERMINATORS.has(source[i])) {
    name = source[i] + name
    i -= 1
  }
  return name
}

function isDuplicateClassAttribute(
  source: string,
  error: ParserError,
): boolean {
  if (error.code !== parse5.ErrorCodes.duplicateAttribute) return false
  return (
    attributeNameBefore(source, error.startOffset).toLowerCase() === 'class'
  )
}

// parse5 attribute locations span the whole `name="value"` attribute; the
// value span is recovered by scanning the raw source inside that span.
function attributeValueSpan(
  source: string,
  start: number,
  end: number,
): SourceSpan {
  let i = start
  while (i < end && source[i] !== '=') i += 1
  if (i >= end) return { start: end, end }
  i += 1
  while (i < end && isAsciiWhitespace(source[i])) i += 1
  if (i >= end) return { start: end, end }
  const quote = source[i]
  if (quote === '"' || quote === "'") {
    let close = source.indexOf(quote, i + 1)
    if (close === -1 || close > end) close = end
    return { start: i + 1, end: close }
  }
  return { start: i, end }
}

function isElement(node: Node): node is Element {
  return 'tagName' in node
}

function collectClassAttribute(
  element: Element,
  source: string,
  out: Array<ClassAttributeOccurrence>,
): void {
  const attr = element.attrs.find(function (candidate) {
    return candidate.name === 'class'
  })
  if (!attr) return
  const location = element.sourceCodeLocation?.attrs?.['class']
  if (!location) return
  out.push({
    span: attributeValueSpan(source, location.startOffset, location.endOffset),
    tokens: splitClassAttributeValue(attr.value),
  })
}

function isTextNode(node: Node): node is TextNode {
  return node.nodeName === '#text'
}

function collectInlineScript(element: Element, out: Array<string>): void {
  const hasSrc = element.attrs.some(function (attr) {
    return attr.name === 'src'
  })
  if (hasSrc) return
  for (const child of element.childNodes) {
    if (!isTextNode(child)) continue
    out.push(child.value)
  }
}

function collectFromNode(
  node: Node,
  source: string,
  classAttributes: Array<ClassAttributeOccurrence>,
  attributeValues: Array<string>,
  textNodes: Array<string>,
  inlineScripts: Array<string>,
): void {
  if (isElement(node)) {
    for (const attr of node.attrs) attributeValues.push(attr.value)
    collectClassAttribute(node, source, classAttributes)
    if (node.tagName === 'script') collectInlineScript(node, inlineScripts)
    if (node.tagName === 'template') {
      const content = (node as Template).content
      for (const child of content.childNodes) {
        collectFromNode(
          child,
          source,
          classAttributes,
          attributeValues,
          textNodes,
          inlineScripts,
        )
      }
    }
  }
  if (isTextNode(node)) textNodes.push(node.value)
  if ('childNodes' in node) {
    for (const child of node.childNodes) {
      collectFromNode(
        child,
        source,
        classAttributes,
        attributeValues,
        textNodes,
        inlineScripts,
      )
    }
  }
}

export function modelHtmlFile(
  filePath: string,
  contents?: string,
): HtmlFileResult {
  const source = contents ?? fs.readFileSync(filePath, 'utf8')
  const parseErrors: Array<ParserError> = []
  const document = parse5.parse(source, {
    sourceCodeLocationInfo: true,
    onParseError: function (error) {
      parseErrors.push(error)
    },
  })
  const duplicate = parseErrors.find(function (error) {
    return isDuplicateClassAttribute(source, error)
  })
  if (duplicate) {
    return {
      ok: false,
      filePath,
      reason: `duplicate class attribute at line ${duplicate.startLine}`,
    }
  }
  const classAttributes: Array<ClassAttributeOccurrence> = []
  const attributeValues: Array<string> = []
  const textNodes: Array<string> = []
  const inlineScripts: Array<string> = []
  collectFromNode(
    document,
    source,
    classAttributes,
    attributeValues,
    textNodes,
    inlineScripts,
  )
  return {
    ok: true,
    model: {
      filePath,
      classAttributes,
      attributeValues,
      textNodes,
      inlineScripts,
    },
  }
}
