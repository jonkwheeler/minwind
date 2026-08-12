import assert from "node:assert";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const NAME_PATTERN = /^[a-z][a-z0-9]*$/;
const THEMES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../examples/themes",
);

// Common Tailwind / CSS words. A generated name that matches one of these
// is skipped when the site actually defines that class, so example packs
// should not spend iconic slots on them.
const COLLISION_PRONE = new Set([
  "flex",
  "grid",
  "block",
  "hidden",
  "container",
  "dark",
  "static",
  "relative",
  "absolute",
  "fixed",
  "sticky",
  "truncate",
  "group",
  "peer",
  "hover",
  "focus",
  "active",
  "sr",
]);

function wordsIn(source: string): Array<string> {
  return Array.from(source.matchAll(/"([a-z][a-z0-9]*)"/g), function (match) {
    return match[1];
  });
}

describe("example theme vocabularies", function () {
  const files = readdirSync(THEMES_DIR).filter(function (name) {
    return name.endsWith(".ts");
  });

  it("includes the requested franchise packs", function () {
    const expected = [
      "star-wars.ts",
      "star-trek.ts",
      "super-mario.ts",
      "zelda.ts",
      "witcher.ts",
      "zoolander.ts",
    ];
    for (const name of expected) {
      assert.ok(files.includes(name), `missing ${name}`);
    }
  });

  for (const file of files) {
    it(`${file} uses unique valid CSS idents`, function () {
      const source = readFileSync(join(THEMES_DIR, file), "utf8");
      const words = wordsIn(source);
      assert.ok(
        words.length >= 40,
        `${file} should have at least 40 words, got ${words.length}`,
      );
      const seen = new Set<string>();
      for (const word of words) {
        assert.ok(NAME_PATTERN.test(word), `${file}: invalid ident ${word}`);
        assert.ok(!seen.has(word), `${file}: duplicate ${word}`);
        assert.ok(
          !COLLISION_PRONE.has(word),
          `${file}: collision-prone word ${word}`,
        );
        seen.add(word);
      }
    });
  }
});
