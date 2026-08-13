---
name: minwind-vocabulary
description: >-
  Generate a minwind words vocabulary or quotes list that is valid CSS
  identifiers, ordered for the document shell, and funny enough to screenshot.
  Use when creating a custom naming.vocabulary, naming.quotes, a theme pack,
  or when a user wants branded, sports, political, fandom, or NSFW class names.
---

# minwind vocabulary

Produce a list an agent or developer can paste into `naming.vocabulary` or
`naming.quotes`. The list becomes production class names. Inspect-element is
the product.

## Output

Default: a TypeScript file.

```ts
export const VOCABULARY: ReadonlyArray<string> = ["firstword", "secondword"];
```

Also emit the config snippet:

```ts
minwind({
  naming: {
    strategy: "words",
    vocabulary: VOCABULARY,
    prominence: loadProminence(),
  },
});
```

For speeches, slogans, or lines that should read in order on the document
shell, use `quotes` instead of pre-splitting:

```ts
minwind({
  naming: {
    strategy: "quotes",
    quotes: ["Ask not what your country can do for you"],
    prominence: loadProminence(),
  },
});
```

JSON is fine when the user asked for `--vocabulary` / `--quotes` files.

## Ident rules

Every words entry is lowercased and stripped of punctuation, then must
match `/^(?:[a-z][a-z0-9]*|_[a-z0-9]+)$/`. `you're` becomes `youre`.
`r2d2` is fine. A digit-leading word gets a leading underscore: `2b`
becomes `_2b`. You can write `2b` or `_2b`; both land as `_2b`.

Do not include these; they collide with Tailwind/CSS and get skipped or fail
the build:

`flex`, `grid`, `block`, `hidden`, `container`, `dark`, `static`, `relative`,
`absolute`, `fixed`, `sticky`, `truncate`, `group`, `peer`, `hover`, `focus`,
`active`, `sr`

Aim for at least 40 unique idents. More is better; leftovers fall back to
hash names. No duplicates. No arrow functions in any TypeScript you write.

Order is prominence. Index 0 lands on the first class-bearing shell element
when the site passes a prominence manifest. Put the screenshot words first.

## What belongs on the list

Standalone names a stranger would recognize in any class attribute: people,
places, tools, slang, catchphrases crushed into one ident
(`hakunamatata`, `whyistherumgone`).

Skip sentence fragments that only work next to a specific neighbor. One
original token maps to one generated name everywhere, so `ask` beside
`not` on `<html>` will also appear next to unrelated words on a button.

## Quotes

`strategy: "quotes"` splits sentences on non-alphanumerics and deals the
words in order. Duplicate words keep the first occurrence (`you` in a
speech is used once). Use prominence so the shell reads the start of the
line. Quotes are allowed to be longer than hash names; that is the point.

## Organizations and sports

Build the list from the institution's own language.

- A golf major: players, courses, scores, calls. `augusta`, `amen`,
  `albatross`, `fore`, `pinseeker`.
- Any sport: roster, venues, official slang, broadcast calls.
- A government site: office names as words, or `quotes` for a line people
  already know.
- A brand: product names, in-jokes, campaign lines. If legal would sweat
  and engineering would laugh, you are close.

## Make it viral

The test: would someone send a screenshot of the inspector to a group chat
with "I can't believe this is in the DOM"?

Safe-for-work is optional. Profanity is optional. Polite generic English
(`button`, `card`, `hero`, `primary`) is a miss. Innuendo, cursed fandom,
locker-room vernacular, a bit only that team would ship: those belong.

If the first three words would also work as a grocery list, start over.

## Workflow

1. Ask what world the names come from if it is not obvious.
2. Draft at least 40 idents. Iconic first.
3. Drop anything that fails the ident pattern or the collision list.
4. Deduplicate.
5. Read the first eight words out loud as if they were `class="..."`. If
   that string is not the joke, reorder or rewrite.
6. Hand back the array and the `minwind({ naming })` snippet.
