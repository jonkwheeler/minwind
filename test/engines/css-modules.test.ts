import assert from "node:assert";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  createGenerateScopedName,
  createGetLocalIdent,
  hashModuleLocal,
  moduleLocalKey,
} from "../../src/engines/css-modules.js";
import { hashClassName } from "../../src/names.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "fixtures", "modules-site");
const BUTTON = path.join(ROOT, "src", "Button.module.css");

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
