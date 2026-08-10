import assert from "node:assert";
import { describe, it } from "node:test";
import {
  applySpanEdits,
  createNameAllocator,
  rawTokensWithinSpan,
  routeAndApplySpanEdits,
} from "../../src/measure/span-edit.js";

describe("applySpanEdits", () => {
  it("applies replacements against the original string", () => {
    const result = applySpanEdits("aa bb cc", [
      { start: 0, end: 2, expected: "aa", replacement: "x", owner: "aa" },
      { start: 6, end: 8, expected: "cc", replacement: "zz", owner: "cc" },
    ]);
    assert.strictEqual(result.output, "x bb zz");
    assert.deepStrictEqual(result.rejectedOwners, []);
  });

  it("applies zero-length insertions in array order at one offset", () => {
    const result = applySpanEdits("ab", [
      { start: 1, end: 1, expected: "", replacement: "X", owner: "one" },
      { start: 1, end: 1, expected: "", replacement: "Y", owner: "two" },
    ]);
    assert.strictEqual(result.output, "aXYb");
    assert.deepStrictEqual(result.rejectedOwners, []);
  });

  it("rejects an edit whose expected content does not match the source", () => {
    const result = applySpanEdits("aa bb", [
      { start: 0, end: 2, expected: "ZZ", replacement: "x", owner: "bad" },
    ]);
    assert.strictEqual(result.output, "aa bb");
    assert.deepStrictEqual(result.rejectedOwners, ["bad"]);
  });

  it("rejects an edit that overlaps an already-applied edit", () => {
    const result = applySpanEdits("abcdef", [
      { start: 0, end: 4, expected: "abcd", replacement: "Y", owner: "early" },
      { start: 2, end: 6, expected: "cdef", replacement: "X", owner: "late" },
    ]);
    assert.strictEqual(result.output, "abX");
    assert.deepStrictEqual(result.rejectedOwners, ["early"]);
  });
});

describe("routeAndApplySpanEdits", () => {
  it("drops every edit of a mismatched owner, keeping original bytes", () => {
    const result = routeAndApplySpanEdits("keep1 dropA keep2 dropB", [
      { start: 0, end: 5, expected: "keep1", replacement: "x", owner: "good" },
      { start: 6, end: 11, expected: "dropA", replacement: "y", owner: "bad" },
      { start: 17, end: 22, expected: "WRONG", replacement: "z", owner: "bad" },
    ]);
    assert.strictEqual(result.output, "x dropA keep2 dropB");
    assert.deepStrictEqual(result.rejectedOwners, ["bad"]);
  });

  it("returns identity output when every owner is rejected", () => {
    const result = routeAndApplySpanEdits("abc", [
      { start: 0, end: 3, expected: "nope", replacement: "x", owner: "bad" },
    ]);
    assert.strictEqual(result.output, "abc");
    assert.deepStrictEqual(result.rejectedOwners, ["bad"]);
  });
});

describe("createNameAllocator", () => {
  it("enumerates identifier-safe names length-first in alphabet order", () => {
    const allocate = createNameAllocator(function () {
      return false;
    });
    const names: Array<string> = [];
    for (let i = 0; i < 54; i += 1) names.push(allocate());
    assert.deepStrictEqual(names.slice(0, 4), ["a", "b", "c", "d"]);
    assert.strictEqual(names[25], "z");
    assert.strictEqual(names[26], "A");
    assert.strictEqual(names[51], "Z");
    assert.strictEqual(names[52], "aa");
    assert.strictEqual(names[53], "ab");
  });

  it("skips taken names and never repeats an allocation", () => {
    const taken = new Set(["a", "c"]);
    const allocate = createNameAllocator(function (name) {
      return taken.has(name);
    });
    const first = allocate();
    taken.add(first);
    assert.strictEqual(first, "b");
    assert.strictEqual(allocate(), "d");
  });
});

describe("rawTokensWithinSpan", () => {
  it("splits raw span content on ascii whitespace with absolute offsets", () => {
    const source = '<p class="a  b\tc">x</p>';
    const tokens = rawTokensWithinSpan(source, { start: 10, end: 16 });
    assert.deepStrictEqual(tokens, [
      { token: "a", start: 10, end: 11 },
      { token: "b", start: 13, end: 14 },
      { token: "c", start: 15, end: 16 },
    ]);
  });
});
