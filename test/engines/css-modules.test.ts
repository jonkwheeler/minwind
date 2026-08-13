import assert from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  assertWordsInventory,
  collectModuleInventory,
  createGenerateScopedName,
  createGetLocalIdent,
  createModuleNameRegistry,
  formatModuleKey,
  hashModuleLocal,
  moduleLocalKey,
  MODULES_COMPOSE_ERROR,
  NameCollisionSpace,
  SCSS_SASS_ERROR,
} from "../../src/engines/css-modules.js";
import { hashClassName, createNameRegistry } from "../../src/names.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "fixtures", "modules-site");
const BUTTON = path.join(ROOT, "src", "Button.module.css");

function tempSite(files: Record<string, string>): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "minwind-modules-"));
  mkdirSync(path.join(dir, "src"), { recursive: true });
  for (const [relative, contents] of Object.entries(files)) {
    const full = path.join(dir, relative);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, contents);
  }
  return dir;
}

describe("CSS Modules identity", function () {
  it("keys locals by repo-relative path, not bare spelling", function () {
    const other = path.join(ROOT, "src", "other.module.css");
    assert.notStrictEqual(
      moduleLocalKey(ROOT, BUTTON, "root"),
      moduleLocalKey(ROOT, other, "root"),
    );
    assert.strictEqual(
      hashModuleLocal(ROOT, BUTTON, "root"),
      hashClassName(moduleLocalKey(ROOT, BUTTON, "root")),
    );
    assert.strictEqual(
      formatModuleKey(moduleLocalKey(ROOT, BUTTON, "root")),
      "src/Button.module.css:root",
    );
  });

  it("Vite generateScopedName and webpack getLocalIdent agree", function () {
    const scoped = createGenerateScopedName(ROOT);
    const ident = createGetLocalIdent(ROOT);
    const fromVite = scoped("root", BUTTON, ".root{color:red}");
    const fromWebpack = ident(
      { resourcePath: BUTTON },
      "[hash:base64:5]",
      "root",
    );
    assert.strictEqual(fromVite, fromWebpack);
    assert.strictEqual(fromVite, hashModuleLocal(ROOT, BUTTON, "root"));
  });
});

describe("CSS Modules inventory", function () {
  it("discovers file-qualified locals from the modules-site fixture", function () {
    const inventory = collectModuleInventory(ROOT);
    const keys = inventory.locals.map(function (entry) {
      return entry.file + ":" + entry.local;
    });
    assert.ok(keys.includes("src/Button.module.css:root"));
    assert.ok(keys.includes("src/other.module.css:base"));
    assert.ok(keys.includes("src/composed.module.css:button"));
  });

  it("gives two files exporting local button distinct generated names", function () {
    const dir = tempSite({
      "src/a.module.css": ".button { color: red }",
      "src/b.module.css": ".button { color: blue }",
    });
    try {
      const inventory = collectModuleInventory(dir);
      const registry = createModuleNameRegistry(inventory);
      const names = registry.entries().map(function (entry) {
        return entry.name;
      });
      assert.strictEqual(names.length, 2);
      assert.notStrictEqual(names[0], names[1]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not put :global(.x) in the rename set", function () {
    const dir = tempSite({
      "src/wrap.module.css":
        ".root :global(.external) { color: blue }\n" +
        ":global(.plain) { display: block }\n",
    });
    try {
      const inventory = collectModuleInventory(dir);
      const locals = inventory.locals.map(function (entry) {
        return entry.local;
      });
      const globals = inventory.globals.map(function (entry) {
        return entry.local;
      });
      assert.deepStrictEqual(locals, ["root"]);
      assert.ok(globals.includes("external"));
      assert.ok(globals.includes("plain"));
      const registry = createModuleNameRegistry(inventory);
      assert.strictEqual(registry.entries().length, 1);
      assert.ok(
        registry.nameFor(
          moduleLocalKey(dir, path.join(dir, "src/wrap.module.css"), "root"),
        ) !== undefined,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("words strategy assigns vocabulary without colliding with an excluded name", function () {
    const dir = tempSite({
      "src/a.module.css": ".hero { color: red }\n.caption { color: blue }\n",
    });
    try {
      const inventory = collectModuleInventory(dir);
      const registry = createModuleNameRegistry(
        inventory,
        {
          strategy: "words",
          vocabulary: ["flex", "quill", "willow"],
        },
        undefined,
        { names: ["flex"], prefixes: [] },
      );
      const names = registry.entries().map(function (entry) {
        return entry.name;
      });
      assert.ok(!names.includes("flex"));
      assert.ok(names.includes("quill"));
      assert.ok(names.includes("willow"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("empty module file yields no renames and no crash", function () {
    const dir = tempSite({
      "src/empty.module.css": "",
    });
    try {
      const inventory = collectModuleInventory(dir);
      assert.deepStrictEqual(inventory.locals, []);
      const registry = createModuleNameRegistry(inventory);
      assert.deepStrictEqual(registry.entries(), []);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails words inventory when SCSS modules exist without sass", function () {
    const dir = tempSite({
      "src/button.module.scss": ".root { color: red }",
    });
    const previous = process.env.MINWIND_FORCE_NO_SASS;
    process.env.MINWIND_FORCE_NO_SASS = "1";
    try {
      const inventory = collectModuleInventory(dir);
      assert.ok(inventory.scssFiles.length > 0);
      assert.strictEqual(inventory.sassAvailable, false);
      assert.throws(
        function () {
          assertWordsInventory(inventory);
        },
        new RegExp(SCSS_SASS_ERROR.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      );
    } finally {
      if (previous === undefined) {
        delete process.env.MINWIND_FORCE_NO_SASS;
      } else {
        process.env.MINWIND_FORCE_NO_SASS = previous;
      }
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails on unresolved same-file composes", function () {
    const dir = tempSite({
      "src/broken.module.css": ".a { composes: missing; color: red }",
    });
    try {
      assert.throws(
        function () {
          collectModuleInventory(dir);
        },
        new RegExp(
          MODULES_COMPOSE_ERROR.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        ),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("records composes from global as globals, not locals", function () {
    const dir = tempSite({
      "src/chip.module.css":
        ".chip { composes: external from global; color: red }",
    });
    try {
      const inventory = collectModuleInventory(dir);
      const locals = inventory.locals.map(function (entry) {
        return entry.local;
      });
      const globals = inventory.globals.map(function (entry) {
        return entry.local;
      });
      assert.deepStrictEqual(locals, ["chip"]);
      assert.ok(globals.includes("external"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("NameCollisionSpace", function () {
  it("throws when two tokens claim the same generated name", function () {
    const space = new NameCollisionSpace();
    space.claim("src/a.module.css\0flex", "abcd");
    assert.throws(function () {
      space.claim("flex", "abcd");
    }, /name collision/);
  });
});

describe("shared collision space", function () {
  it("throws when a Module name matches a seeded Tailwind name", function () {
    const space = new NameCollisionSpace();
    const registry = createNameRegistry({
      universe: new Set(["flex"]),
      sourceTokens: new Set(["flex"]),
    });
    space.seed(registry);
    const twName = registry.nameFor("flex");
    assert.ok(twName !== undefined);
    assert.throws(function () {
      space.claim("src/Card.module.css\0flex", twName);
    }, /name collision/);
  });
});
