import assert from "node:assert";
import { describe, it } from "node:test";
import { computeProminence } from "../src/prominence.js";

describe("computeProminence", function () {
  it("ranks tokens by the first class-bearing element in document order", function () {
    const manifest = computeProminence(
      [
        {
          path: "index.html",
          html:
            '<html><body class="bg-white text-black">' +
            '<main class="bg-white p-4"><p class="text-lg">hi</p>' +
            "</main></body></html>",
        },
      ],
      32,
    );
    assert.deepStrictEqual(manifest.tokens, {
      "bg-white": 0,
      "text-black": 0,
      "p-4": 1,
      "text-lg": 2,
    });
    assert.strictEqual(manifest.pages, 1);
  });

  it("does not count class-less elements", function () {
    const manifest = computeProminence(
      [
        {
          path: "index.html",
          html: '<div><span><a class="flex">x</a></span></div>',
        },
      ],
      32,
    );
    assert.deepStrictEqual(manifest.tokens, { flex: 0 });
  });

  it("keeps the minimum rank across pages", function () {
    const manifest = computeProminence(
      [
        { path: "b.html", html: '<div class="x"><div class="shared">' },
        { path: "a.html", html: '<div class="shared deep">' },
      ],
      32,
    );
    assert.strictEqual(manifest.tokens["shared"], 0);
    assert.strictEqual(manifest.tokens["deep"], 0);
    assert.strictEqual(manifest.tokens["x"], 0);
    assert.strictEqual(manifest.pages, 2);
  });

  it("drops tokens first-seen outside the window", function () {
    const manifest = computeProminence(
      [
        {
          path: "index.html",
          html:
            '<div class="a"><div class="b"><div class="c">' +
            '<div class="d"></div></div></div></div>',
        },
      ],
      2,
    );
    assert.deepStrictEqual(manifest.tokens, { a: 0, b: 1 });
    assert.strictEqual(manifest.window, 2);
  });

  it("reads single-quoted and unquoted class attributes", function () {
    const manifest = computeProminence(
      [{ path: "index.html", html: "<div class='a b'><span class=c>" }],
      32,
    );
    assert.deepStrictEqual(manifest.tokens, { a: 0, b: 0, c: 1 });
  });

  it("is deterministic regardless of page input order", function () {
    const pages = [
      { path: "b.html", html: '<div class="beta">' },
      { path: "a.html", html: '<div class="alpha">' },
    ];
    const first = computeProminence(pages, 32);
    const second = computeProminence(Array.from(pages).reverse(), 32);
    assert.deepStrictEqual(first, second);
  });
});
