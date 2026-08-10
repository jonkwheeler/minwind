import * as parse5 from "parse5";
import type { DefaultTreeAdapterMap } from "parse5";
import { compareCodeUnits } from "./util.js";

// Prominence manifests (words strategy). The default length-weighted deal
// is blind to where a class sits in the rendered DOM: the shortest words
// go to the most-rendered tokens, so the document shell — the elements a
// devtools inspector meets first — can end up wearing deep-cut vocabulary.
// A prominence manifest records, for each original class token, the
// document-order index of the first class-bearing element carrying it
// (minimum across pages), and resolveNaming deals the vocabulary in
// curation order to the tokens inside the window. Shell elements render
// once per page, so spending the longest, most iconic names there costs
// almost nothing; everything below the window keeps the byte-optimal deal.
//
// The manifest must be generated from a minwind-OFF build: its keys are
// original class tokens, and a renamed build's DOM carries generated names
// that match nothing at build time (the plugin warns on a zero-match
// manifest).

type TreeNode = DefaultTreeAdapterMap["node"];
type TreeElement = DefaultTreeAdapterMap["element"];

export interface ProminencePage {
  path: string;
  html: string;
}

export interface ProminenceManifest {
  window: number;
  pages: number;
  // Original class token -> first-seen element index, sorted by index.
  tokens: Record<string, number>;
}

function isElement(node: TreeNode): node is TreeElement {
  return "tagName" in node && "attrs" in node;
}

function hasChildren(
  node: TreeNode,
): node is TreeNode & { childNodes: Array<TreeNode> } {
  return "childNodes" in node;
}

// Depth-first pre-order is document order. Only elements carrying a class
// attribute advance the index, since those are the elements that show a
// classname in the inspector.
export function computeProminence(
  pages: ReadonlyArray<ProminencePage>,
  window: number,
): ProminenceManifest {
  const rank = new Map<string, number>();
  const sorted = Array.from(pages).sort(function (a, b) {
    return compareCodeUnits(a.path, b.path);
  });
  for (const page of sorted) {
    const document = parse5.parse(page.html);
    let index = 0;
    const stack: Array<TreeNode> = [];
    for (let i = document.childNodes.length - 1; i >= 0; i -= 1) {
      stack.push(document.childNodes[i]);
    }
    while (stack.length > 0) {
      const node = stack.pop();
      if (node === undefined) break;
      if (isElement(node)) {
        const classAttribute = node.attrs.find(function (attribute) {
          return attribute.name === "class";
        });
        if (classAttribute !== undefined) {
          for (const token of classAttribute.value.split(/\s+/)) {
            if (token === "") continue;
            const existing = rank.get(token);
            if (existing === undefined || index < existing) {
              rank.set(token, index);
            }
          }
          index += 1;
        }
      }
      if (hasChildren(node)) {
        for (let i = node.childNodes.length - 1; i >= 0; i -= 1) {
          stack.push(node.childNodes[i]);
        }
      }
    }
  }
  const kept = Array.from(rank.entries())
    .filter(function (entry) {
      return entry[1] < window;
    })
    .sort(function (a, b) {
      return a[1] - b[1] || compareCodeUnits(a[0], b[0]);
    });
  const tokens: Record<string, number> = {};
  for (const [token, index] of kept) {
    tokens[token] = index;
  }
  return { window, pages: sorted.length, tokens };
}
