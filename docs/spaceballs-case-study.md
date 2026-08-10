# Case study: Spaceballs classnames

The `words` naming strategy was built for
[jonkwheeler.com](https://jonkwheeler.com), whose production DOM uses names
drawn from _Spaceballs_. The experiment showed where themed names add
personality, where they cost bytes, and why isolated words work better than
quote fragments in a real component tree.

## Curate a vocabulary

Every entry must work as a standalone CSS classname. Prefer characters, places,
ships, props, and recognizable single words; avoid phrases or words that sound
like sentence fragments when placed beside arbitrary neighbors.

Order the vocabulary from most to least iconic. That order becomes the priority
for prominence-aware assignment.

```ts
export const SPACEBALLS_VOCABULARY: ReadonlyArray<string> = [
  "schwartz",
  "lonestar",
  "darkhelmet",
  "vespa",
  "barf",
  "dotmatrix",
  "yogurt",
  "megamaid",
  "winnebago",
  "ludicrous",
  // ...roughly 150 words total
];
```

## Generate prominence data

Build once without minwind, scan the original above-the-fold DOM, then build
normally:

```bash
MINWIND=off pnpm build
npx minwind prominence .output/public --window 8
pnpm build
```

Read the generated manifest leniently so a missing first-run artifact means “no
prominence deal” instead of a configuration failure:

```ts
import { readFileSync } from "node:fs";

function loadProminence(): Record<string, number> | undefined {
  try {
    return JSON.parse(readFileSync("minwind.prominence.json", "utf8")).tokens;
  } catch {
    return undefined;
  }
}

minwind({
  naming: {
    strategy: "words",
    vocabulary: SPACEBALLS_VOCABULARY,
    prominence: loadProminence(),
  },
});
```

The first class-bearing shell elements receive the iconic names in curation
order. Frequently rendered elements outside that window keep the shorter
remaining words, preserving most of the byte win.

```html
<div class="darkhelmet lonestar schwartz">
  <header class="dotmatrix barf vespa">
    <nav class="eagle5 sandurz"></nav>
  </header>
</div>
```

## Results

With an eight-element prominence window, the site retained its compression
target while making the document shell recognizable in DevTools:

- median class attribute: 77 to 36 characters (-53%);
- whole-site raw HTML and CSS: -21.9%;
- whole-site Brotli: -3.6%;
- pixel-identical rendering in the comparison harness.

## What the experiment taught

### The prominence window is a budget

A 32-element window assigned too many short words to shell elements that render
only once, pushing the median class-length reduction below the site’s 50% gate.
Eight elements covered the root, header, and navigation with no measurable cost.

### Long names are cheap on cold elements

`megamaid` on a shell element rendered once per page costs less than `jam` on a
card rendered fifty times. Prominence and byte optimality conflict only when an
element is both early and frequently repeated.

### Quotes did not survive a real DOM

The quote strategy assigns one global word to each utility token. A fragment may
assemble correctly in one class list, but that token appears beside unrelated
neighbors everywhere else. Single-token lists cannot read as quotes at all.
Curated words stayed recognizable in arbitrary combinations; quote fragments
usually read like residue.

Use `quotes` for sites with long, distinctive class lists and a corpus where
partial fragments remain enjoyable. Use `words` when individual names should
make sense anywhere in the DOM.
