import assert from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  collectModuleInventory,
  createModuleNameRegistry,
  hashModuleLocal,
} from "../../src/engines/css-modules.js";
import {
  MODULES_REMAP_MISSING_SURFACE_ERROR,
  remapModuleSources,
} from "../../src/engines/modules-remap.js";

function tempSite(files: Record<string, string>): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "minwind-remap-"));
  mkdirSync(path.join(dir, "src"), { recursive: true });
  for (const [relative, contents] of Object.entries(files)) {
    const full = path.join(dir, relative);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, contents);
  }
  return dir;
}

function contextFor(
  root: string,
  naming?: { strategy: "words"; vocabulary: Array<string> },
) {
  const inventory = collectModuleInventory(root);
  return {
    root,
    inventory,
    registry: createModuleNameRegistry(inventory, naming),
  };
}

describe("remapModuleSources", function () {
  it("remaps a proven export map and matching CSS selector; key stays root", function () {
    const root = tempSite({
      "src/Button.module.css": ".root { color: red }",
    });
    try {
      const context = contextFor(root);
      const button = path.join(root, "src", "Button.module.css");
      const expected = hashModuleLocal(root, button, "root");
      const bundler = "Button-module__abc__root";
      const result = remapModuleSources(
        {
          js: `const styles = { root: "${bundler}" };\n`,
          css: `.${bundler}{color:red}`,
        },
        context,
      );
      assert.ok(result.js.includes("root:"));
      assert.ok(result.js.includes(`"${expected}"`));
      assert.ok(!result.js.includes(bundler));
      assert.ok(result.css.includes(`.${expected}{color:red}`));
      assert.ok(!result.css.includes(bundler));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("leaves a hash-shaped string that is not an export value unchanged (AE4)", function () {
    const root = tempSite({
      "src/Button.module.css": ".root { color: red }",
    });
    try {
      const context = contextFor(root);
      const bundler = "Button-module__abc__root";
      const decoy = "NotAModule-module__zzz__nope";
      const result = remapModuleSources(
        {
          js: `const styles = { root: "${bundler}" }; const decoy = "${decoy}";\n`,
          css: `.${bundler}{color:red}`,
        },
        context,
      );
      assert.ok(result.js.includes(`"${decoy}"`));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("ignores a non-unique object when two files export the same local", function () {
    const root = tempSite({
      "src/A.module.css": ".root { color: red }",
      "src/B.module.css": ".root { color: blue }",
    });
    try {
      const context = contextFor(root);
      const bundler = "A-module__aaa__root";
      const js = `const styles = { root: "${bundler}" };\n`;
      const css = `.${bundler}{color:red}`;
      const result = remapModuleSources({ js, css }, context);
      assert.strictEqual(result.js, js);
      assert.strictEqual(result.css, css);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("proves an object whose keys uniquely match one of two files", function () {
    const root = tempSite({
      "src/A.module.css": ".root { color: red }\n.title { color: blue }",
      "src/B.module.css": ".root { color: green }",
    });
    try {
      const context = contextFor(root);
      const aFile = path.join(root, "src", "A.module.css");
      const expectedRoot = hashModuleLocal(root, aFile, "root");
      const expectedTitle = hashModuleLocal(root, aFile, "title");
      const result = remapModuleSources(
        {
          js: `const styles = { root: "A__root", title: "A__title" };\n`,
          css: `.A__root{color:red}.A__title{color:blue}`,
        },
        context,
      );
      assert.ok(result.js.includes(`"${expectedRoot}"`));
      assert.ok(result.js.includes(`"${expectedTitle}"`));
      assert.ok(result.css.includes(`.${expectedRoot}`));
      assert.ok(result.css.includes(`.${expectedTitle}`));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("takes the first whitespace token as the local name; later tokens resolve from other keys", function () {
    const root = tempSite({
      "src/Chip.module.css":
        ".base { color: red }\n.root { composes: base; font-weight: bold }",
    });
    try {
      const context = contextFor(root);
      const chip = path.join(root, "src", "Chip.module.css");
      const expectedRoot = hashModuleLocal(root, chip, "root");
      const expectedBase = hashModuleLocal(root, chip, "base");
      const result = remapModuleSources(
        {
          js: `const styles = { base: "Chip__base", root: "Chip__root Chip__base" };\n`,
          css: `.Chip__base{color:red}.Chip__root{font-weight:bold}`,
        },
        context,
      );
      assert.ok(result.js.includes(`root: "${expectedRoot} ${expectedBase}"`));
      assert.ok(result.js.includes(`base: "${expectedBase}"`));
      assert.ok(result.css.includes(`.${expectedRoot}`));
      assert.ok(result.css.includes(`.${expectedBase}`));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("remaps a proven name in HTML class attributes when HTML is present", function () {
    const root = tempSite({
      "src/Button.module.css": ".root { color: red }",
    });
    try {
      const context = contextFor(root);
      const button = path.join(root, "src", "Button.module.css");
      const expected = hashModuleLocal(root, button, "root");
      const bundler = "Button-module__abc__root";
      const result = remapModuleSources(
        {
          js: `const styles = { root: "${bundler}" };\n`,
          css: `.${bundler}{color:red}`,
          html: `<div class="${bundler}">x</div>`,
        },
        context,
      );
      assert.ok(result.html !== undefined);
      assert.ok(result.html.includes(`class="${expected}"`));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails when a proven name has no matching CSS class", function () {
    const root = tempSite({
      "src/Button.module.css": ".root { color: red }",
    });
    try {
      const context = contextFor(root);
      assert.throws(
        function () {
          remapModuleSources(
            {
              js: `const styles = { root: "Button-module__abc__root" };\n`,
              css: `.unrelated{color:red}`,
            },
            context,
          );
        },
        new RegExp(
          MODULES_REMAP_MISSING_SURFACE_ERROR.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&",
          ),
        ),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("leaves CSS without a JS export map original and does not fail", function () {
    const root = tempSite({
      "src/Button.module.css": ".root { color: red }",
    });
    try {
      const context = contextFor(root);
      const bundler = "Button-module__abc__root";
      const js = `console.log("no export map");\n`;
      const css = `.${bundler}{color:red}`;
      const result = remapModuleSources({ js, css }, context);
      assert.strictEqual(result.js, js);
      assert.strictEqual(result.css, css);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("ignores a unique-subset object whose values are not CSS class names", function () {
    const root = tempSite({
      "src/Button.module.css": ".root { color: red }\n.title { color: blue }",
    });
    try {
      const context = contextFor(root);
      const bundler = "Button-module__abc__root";
      const result = remapModuleSources(
        {
          js:
            `const page = { title: "404: This page could not be found." };\n` +
            `const styles = { root: "${bundler}", title: "Button-module__abc__title" };\n`,
          css: `.${bundler}{color:red}.Button-module__abc__title{color:blue}`,
        },
        context,
      );
      assert.ok(result.js.includes('"404: This page could not be found."'));
      assert.ok(!result.js.includes(bundler));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("ignores an export object whose keys are not inventory locals", function () {
    const root = tempSite({
      "src/Button.module.css": ".root { color: red }",
    });
    try {
      const context = contextFor(root);
      const js = `const other = { foo: "not-a-local" };\n`;
      const css = `.root{color:red}`;
      const result = remapModuleSources({ js, css }, context);
      assert.strictEqual(result.js, js);
      assert.strictEqual(result.css, css);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("remaps words apply to vocabulary names, not hashes", function () {
    const root = tempSite({
      "src/Button.module.css": ".root { color: red }",
    });
    try {
      const context = contextFor(root, {
        strategy: "words",
        vocabulary: ["quill", "willow"],
      });
      const button = path.join(root, "src", "Button.module.css");
      const hashed = hashModuleLocal(root, button, "root");
      const bundler = "Button-module__abc__root";
      const result = remapModuleSources(
        {
          js: `const styles = { root: "${bundler}" };\n`,
          css: `.${bundler}{color:red}`,
        },
        context,
      );
      assert.ok(
        result.js.includes('"quill"') || result.js.includes('"willow"'),
      );
      assert.ok(!result.js.includes(`"${hashed}"`));
      assert.ok(!result.js.includes(bundler));
      assert.ok(
        result.css.includes(".quill{color:red}") ||
          result.css.includes(".willow{color:red}"),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
