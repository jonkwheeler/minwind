import type { CssNode } from 'css-tree'

// Shared css-tree helpers and the span-edit applicator used by both the U4
// stylesheet transform and the U5 consolidation kernel.

export interface SpanEdit {
  start: number
  end: number
  expected: string
  replacement: string
}

export function childArray(node: CssNode | null | undefined): Array<CssNode> {
  if (node == null || node.children == null) {
    return []
  }
  return node.children.toArray()
}

// Applies verified, non-overlapping span edits against the original bytes.
// Any bounds, overlap, or content mismatch is an internal error (R10); the
// throw happens before a result is returned, so partial output never ships.
export function applySpanEdits(
  css: string,
  edits: ReadonlyArray<SpanEdit>,
  fileName: string,
): string {
  const ordered = [...edits].sort(function (a, b) {
    if (a.start !== b.start) return a.start - b.start
    return a.end - b.end
  })
  let previousEnd = 0
  for (const edit of ordered) {
    if (edit.start < 0 || edit.end > css.length || edit.start > edit.end) {
      throw new Error(
        `minwind: ${fileName}: span edit out of bounds` +
          ` ${edit.start}..${edit.end}`,
      )
    }
    if (edit.start < previousEnd) {
      throw new Error(
        `minwind: ${fileName}: overlapping span edits at` +
          ` ${edit.start}..${edit.end}`,
      )
    }
    const actual = css.slice(edit.start, edit.end)
    if (actual !== edit.expected) {
      throw new Error(
        `minwind: ${fileName}: span mismatch at` +
          ` ${edit.start}..${edit.end}: expected "${edit.expected}", found` +
          ` "${actual}"`,
      )
    }
    previousEnd = edit.end
  }
  let output = ''
  let cursor = 0
  for (const edit of ordered) {
    output += css.slice(cursor, edit.start) + edit.replacement
    cursor = edit.end
  }
  return output + css.slice(cursor)
}
