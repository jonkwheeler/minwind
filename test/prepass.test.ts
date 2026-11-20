import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { runPrepass } from "../src/prepass.js";
import { hashClassName } from "../src/names.js";
import { assertPresence, transformStylesheet } from "../src/transform-css.js";
import { transformSource } from "../src/transform-source.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.join(HERE, "fixtures", "prepass-site");

function siteRoot(): string {
  return SITE;
}

function cssEntry(): string {
  return path.join(SITE, "src", "app.css");
}

async function prepassSite() {
  return runPrepass({
    root: siteRoot(),
    cssEntry: cssEntry(),
    // The fixture site's b.tsx adds dissolve-reduced at runtime; the
    // exclusion contract is a site-owned config, passed explicitly.
    exclusions: { names: [], prefixes: ["dissolve-"] },
  });
}

function exclusionReasons(result: Awaited<ReturnType<typeof prepassSite>>) {
  return new Map(
    result.registry.exclusions().map(function (entry) {
      return [entry.token, entry.reason];
    }),
  );
}

function renamedTokens(result: Awaited<ReturnType<typeof prepassSite>>) {
  return result.registry.entries().map(function (entry) {
    return entry.token;
  });
}

function verdictFor(
  result: Awaited<ReturnType<typeof prepassSite>>,
  tokens: Array<string>,
) {
  const key = [...tokens].sort().join(" ");
  return result.consolidationVerdicts.find(function (verdict) {
    return verdict.tokens.join(" ") === key;
  });
}

describe("runPrepass registry (R1, R5, KTD3, KTD4)", function () {
  it("renames a utility, a custom @utility, and a hand-written class", async function () {
    const result = await prepassSite();
    for (const token of [
      "flex",
      "items-center",
      "p-4",
      "fade-in",
      "site-card",
    ]) {
      assert.strictEqual(
        result.registry.nameFor(token),
        hashClassName(token),
        `${token} must be renamed`,
      );
    }
  });

  it("collects tokens from all three KTD4 rename contexts", async function () {
    const result = await prepassSite();
    // class="..." attribute (a.tsx, b.tsx, c.tsx)
    assert.ok(result.renameTokens.has("flex"));
    // cn(...) arguments in a.tsx — site-card appears in no other context
    assert.ok(result.renameTokens.has("site-card"));
    // classList={{...}} key in a.tsx — mb-4 appears in no other rename
    // context
    assert.ok(result.renameTokens.has("mb-4"));
    assert.ok(result.sourceTokens.has("focus:underline"));
  });

  it("excludes a detection-only prefix token with excluded-prefix", async function () {
    const result = await prepassSite();
    assert.strictEqual(result.registry.nameFor("dissolve-reduced"), undefined);
    assert.strictEqual(
      exclusionReasons(result).get("dissolve-reduced"),
      "excluded-prefix",
    );
  });

  it("excludes a rename-context token with no stylesheet rule as not-in-universe", async function () {
    const result = await prepassSite();
    assert.strictEqual(result.registry.nameFor("ghost-token"), undefined);
    assert.strictEqual(
      exclusionReasons(result).get("ghost-token"),
      "not-in-universe",
    );
  });

  it("keeps a stylesheet class never used in source out as css-only", async function () {
    const result = await prepassSite();
    assert.strictEqual(result.registry.nameFor("css-only-class"), undefined);
    assert.strictEqual(
      exclusionReasons(result).get("css-only-class"),
      "css-only",
    );
  });

  it("records detection-only className-assignment tokens as runtime-context", async function () {
    const result = await prepassSite();
    assert.strictEqual(result.registry.nameFor("js-assigned"), undefined);
    assert.strictEqual(
      exclusionReasons(result).get("js-assigned"),
      "runtime-context",
    );
  });

  it("poisons a token used in a template literal with expressions", async function () {
    const result = await prepassSite();
    // mb-4 is provable in a.tsx (classList key) but poisoned in c.tsx; one
    // unprovable usage excludes the token entirely (KTD4).
    assert.strictEqual(result.registry.nameFor("mb-4"), undefined);
    assert.strictEqual(exclusionReasons(result).get("mb-4"), "runtime-context");
  });

  it("asserts the registry bijection", async function () {
    const result = await prepassSite();
    assert.doesNotThrow(function () {
      result.registry.assertBijection();
    });
  });

  it("matches the exact expected rename set", async function () {
    const result = await prepassSite();
    assert.deepStrictEqual(renamedTokens(result), [
      "fade-in",
      "flex",
      "flex-col",
      "focus:underline",
      "items-center",
      "mb-2",
      "p-4",
      "site-card",
      "space-y-4",
    ]);
  });
});

describe("runPrepass owned custom properties", function () {
  it("creates a custom-property registry for explicitly owned names", async function () {
    const result = await runPrepass({
      root: siteRoot(),
      cssEntry: cssEntry(),
      customProperties: { owned: ["--application-accent"] },
    });
    assert.match(
      result.customProperties?.nameFor("--application-accent") ?? "",
      /^--[a-z][a-z0-9]{3}$/,
    );
  });

  it("does not assign a generated name already used by public CSS", async function () {
    const result = await runPrepass({
      root: siteRoot(),
      cssEntry: cssEntry(),
      customProperties: { owned: ["--accent"] },
    });
    assert.notStrictEqual(
      result.customProperties?.nameFor("--accent"),
      "--b8xg",
    );
  });

  it("keeps an owned property unchanged when source uses it outside a provable CSSOM call", async function () {
    const result = await runPrepass({
      root: siteRoot(),
      cssEntry: cssEntry(),
      // This literal appears in the fixture as article/demo content rather
      // than a CSSOM property-name argument.
      customProperties: { owned: ["--fixture-unprovable"] },
    });
    assert.strictEqual(
      result.customProperties?.nameFor("--fixture-unprovable"),
      undefined,
    );
    assert.deepStrictEqual(result.customProperties?.excluded(), [
      "--fixture-unprovable",
    ]);
  });
});

describe("runPrepass list frequencies (R3, KTD3)", function () {
  it("counts a repeated list across modules, order-insensitively", async function () {
    const result = await prepassSite();
    const list = result.listFrequencies.find(function (entry) {
      return entry.tokens.join(" ") === "flex items-center p-4";
    });
    assert.ok(list, "expected the flex/items-center/p-4 list");
    assert.strictEqual(list.count, 2, "a.tsx and b.tsx each use it once");
  });

  it("counts single-occurrence lists too", async function () {
    const result = await prepassSite();
    const ghost = result.listFrequencies.find(function (entry) {
      return entry.tokens.join(" ") === "ghost-token";
    });
    assert.ok(ghost);
    assert.strictEqual(ghost.count, 1);
  });
});

describe("runPrepass consolidation verdicts (R3, KTD6)", function () {
  it("marks a repeated variant-free list safe", async function () {
    const result = await prepassSite();
    const verdict = verdictFor(result, ["flex", "items-center", "p-4"]);
    assert.ok(verdict, "expected a verdict for the repeated list");
    assert.strictEqual(verdict.safe, true, verdict.reason);
  });

  it("rejects a repeated list with a complex-subject member", async function () {
    const result = await prepassSite();
    const verdict = verdictFor(result, ["flex-col", "space-y-4"]);
    assert.ok(verdict, "expected a verdict for the space-y-4 list");
    assert.strictEqual(verdict.safe, false);
  });

  it("rejects a repeated list with a variant-carrying member", async function () {
    const result = await prepassSite();
    const verdict = verdictFor(result, ["focus:underline", "mb-2"]);
    assert.ok(verdict, "expected a verdict for the focus:underline list");
    assert.strictEqual(verdict.safe, false);
  });

  it("only issues verdicts for lists seen more than once", async function () {
    const result = await prepassSite();
    for (const verdict of result.consolidationVerdicts) {
      const list = result.listFrequencies.find(function (entry) {
        return entry.tokens.join(" ") === verdict.tokens.join(" ");
      });
      assert.ok(list);
      assert.ok(list.count > 1, `${list.tokens.join(" ")} seen ${list.count}x`);
    }
  });
});

describe("runPrepass error path (R10)", function () {
  it("throws loudly when the CSS entry fails to compile", async function () {
    const broken = path.join(
      HERE,
      "fixtures",
      "prepass-site",
      "src",
      "broken.css",
    );
    await assert.rejects(async function () {
      await runPrepass({ root: siteRoot(), cssEntry: broken });
    });
  });
});

describe("runPrepass sourceDir (R13, KTD13)", function () {
  // scroll-smooth is used only under src/, min-h-screen only under app/.
  function makeTwoDirSite(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "minwind-source-dir-"));
    fs.mkdirSync(path.join(root, "src"));
    fs.mkdirSync(path.join(root, "app"));
    fs.writeFileSync(
      path.join(root, "app.css"),
      `.scroll-smooth { scroll-behavior: smooth; }
.min-h-screen { min-height: 100vh; }
`,
    );
    fs.writeFileSync(
      path.join(root, "src", "index.astro"),
      '<div class="scroll-smooth"></div>\n',
    );
    fs.writeFileSync(
      path.join(root, "app", "index.astro"),
      '<div class="min-h-screen"></div>\n',
    );
    return root;
  }

  it("scans only the given sourceDir", async function () {
    const root = makeTwoDirSite();
    try {
      const result = await runPrepass({
        root,
        cssEntry: path.join(root, "app.css"),
        sourceDir: path.join(root, "app"),
      });
      assert.deepStrictEqual(renamedTokens(result), ["min-h-screen"]);
      assert.ok(!result.sourceTokens.has("scroll-smooth"));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("scans <root>/src without one", async function () {
    const root = makeTwoDirSite();
    try {
      const result = await runPrepass({
        root,
        cssEntry: path.join(root, "app.css"),
      });
      assert.deepStrictEqual(renamedTokens(result), ["scroll-smooth"]);
      assert.ok(!result.sourceTokens.has("min-h-screen"));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("runPrepass Astro layouts (R8)", function () {
  it("renames html and body classes in a layout with frontmatter", async function () {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "minwind-astro-"));
    try {
      fs.mkdirSync(path.join(root, "src", "layouts"), { recursive: true });
      const css = path.join(root, "src", "app.css");
      fs.writeFileSync(
        css,
        `.scroll-smooth { scroll-behavior: smooth; }
.min-h-screen { min-height: 100vh; }
`,
      );
      fs.writeFileSync(
        path.join(root, "src", "layouts", "Layout.astro"),
        `---
import BaseHead from "../components/BaseHead.astro";
---
<!doctype html>
<html lang="en" class="scroll-smooth">
  <head>
    <BaseHead />
  </head>
  <body class="min-h-screen">
    <slot />
  </body>
</html>
`,
      );
      const result = await runPrepass({ root, cssEntry: css });
      const reasons = exclusionReasons(result);
      for (const token of ["scroll-smooth", "min-h-screen"]) {
        assert.ok(
          result.renameTokens.has(token),
          `${token} must be a rename token`,
        );
        assert.strictEqual(reasons.get(token), undefined);
        assert.strictEqual(
          result.registry.nameFor(token),
          hashClassName(token),
        );
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("runPrepass table-fragment and noscript markup (R4, R5)", function () {
  it("renames a table row component's root classes and <noscript> classes (AE4, AE5)", async function () {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "minwind-astro-"));
    try {
      fs.mkdirSync(path.join(root, "src", "components"), { recursive: true });
      fs.mkdirSync(path.join(root, "src", "pages"), { recursive: true });
      const css = path.join(root, "src", "app.css");
      fs.writeFileSync(
        css,
        `.border-b { border-bottom-width: 1px; }
.px-4 { padding-inline: 1rem; }
.text-sm { font-size: 0.875rem; }
`,
      );
      fs.writeFileSync(
        path.join(root, "src", "components", "Row.astro"),
        `---
const { label } = Astro.props;
---
<tr class="border-b"><td class="px-4">{label}</td></tr>
`,
      );
      fs.writeFileSync(
        path.join(root, "src", "pages", "index.astro"),
        `---
import Row from "../components/Row.astro";
---
<table><tbody><Row label="One" /></tbody></table>
<noscript><p class="text-sm">Enable JavaScript</p></noscript>
`,
      );
      const result = await runPrepass({ root, cssEntry: css });
      const reasons = exclusionReasons(result);
      for (const token of ["border-b", "px-4", "text-sm"]) {
        assert.ok(
          result.renameTokens.has(token),
          `${token} must be a rename token`,
        );
        assert.strictEqual(reasons.get(token), undefined);
        assert.strictEqual(
          result.registry.nameFor(token),
          hashClassName(token),
        );
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

// KTD7 in the pre-pass: a marker class kept original by an exclusion,
// runtime poison, or css-only takes every utility whose selector arms all
// compound it, so the registry never asks the CSS transform to rename a
// selector it must skip. The site lives under test/fixtures so the CSS
// entry resolves the real tailwindcss package and the arms are Tailwind's.
const DEPENDENTS_NAV = `export function Nav() {
  return (
    <nav>
      <a class="group" aria-current="page">
        <span class="group-aria-[current=page]:underline">Inbox</span>
      </a>
      <ul>
        <li class="group/item">
          <span class="group-hover/item:underline">Item</span>
        </li>
      </ul>
      <input class="peer" type="checkbox" />
      <label class="peer-checked:underline">On</label>
      <main class="dark:bg-black">Body</main>
    </nav>
  );
}
`;

async function withDependentsSite<T>(
  fn: (root: string, css: string) => Promise<T>,
): Promise<T> {
  const root = path.join(HERE, "fixtures", `dependents-site-${process.pid}`);
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  const css = path.join(root, "src", "app.css");
  fs.writeFileSync(
    css,
    '@import "tailwindcss";\n' +
      "@custom-variant dark (&:where(.dark, .dark *));\n",
  );
  fs.writeFileSync(path.join(root, "src", "nav.tsx"), DEPENDENTS_NAV);
  fs.writeFileSync(
    path.join(root, "src", "theme.ts"),
    "export function toggleTheme(root: HTMLElement): void {\n" +
      '  root.classList.toggle("dark");\n' +
      "}\n",
  );
  try {
    return await fn(root, css);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// The stylesheet transform and the cross-asset presence check the build
// runs on the pre-pass's own stylesheet.
function assertStylesheetRenames(
  result: Awaited<ReturnType<typeof runPrepass>>,
): void {
  const renamed = transformStylesheet({
    css: result.stylesheet,
    registry: result.registry,
    fileName: "app.css",
  });
  assertPresence(result.registry, [renamed.css]);
}

describe("runPrepass dependent variants (R7, KTD7)", function () {
  it("keeps an excluded group marker's variant original as runtime-context (AE7)", async function () {
    await withDependentsSite(async function (root, cssEntry) {
      const result = await runPrepass({
        root,
        cssEntry,
        exclusions: { names: ["group"], prefixes: [] },
      });
      const reasons = exclusionReasons(result);
      assert.strictEqual(reasons.get("group"), "excluded-prefix");
      assert.strictEqual(
        reasons.get("group-aria-[current=page]:underline"),
        "runtime-context",
      );
      assert.strictEqual(
        result.registry.nameFor("group-aria-[current=page]:underline"),
        undefined,
      );
      // The named group and the peer pair do not compound .group.
      assert.ok(result.registry.nameFor("group-hover/item:underline"));
      assert.ok(result.registry.nameFor("peer-checked:underline"));
      assertStylesheetRenames(result);
    });
  });

  it("keeps named-group and peer variants with their excluded markers", async function () {
    await withDependentsSite(async function (root, cssEntry) {
      const result = await runPrepass({
        root,
        cssEntry,
        exclusions: { names: ["group/item", "peer"], prefixes: [] },
      });
      const reasons = exclusionReasons(result);
      // group-hover/item's arm sits inside @media (hover: hover).
      assert.strictEqual(
        reasons.get("group-hover/item:underline"),
        "runtime-context",
      );
      assert.strictEqual(
        reasons.get("peer-checked:underline"),
        "runtime-context",
      );
      assert.ok(result.registry.nameFor("group"));
      assert.ok(result.registry.nameFor("group-aria-[current=page]:underline"));
      assertStylesheetRenames(result);
    });
  });

  it("keeps a class-strategy dark variant original when classList.toggle adds dark", async function () {
    await withDependentsSite(async function (root, cssEntry) {
      const result = await runPrepass({ root, cssEntry });
      const reasons = exclusionReasons(result);
      assert.strictEqual(reasons.get("dark"), "runtime-context");
      assert.strictEqual(reasons.get("dark:bg-black"), "runtime-context");
      assert.ok(result.registry.nameFor("group-aria-[current=page]:underline"));
      assertStylesheetRenames(result);
    });
  });
});

describe("runPrepass Astro expression markup (R1)", function () {
  it("renames the classes of expression markup, matching the transform (AE1)", async function () {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "minwind-astro-"));
    try {
      fs.mkdirSync(path.join(root, "src", "components"), { recursive: true });
      const css = path.join(root, "src", "app.css");
      fs.writeFileSync(
        css,
        `.px-4 { padding-inline: 1rem; }
.py-2 { padding-block: 0.5rem; }
.mt-3 { margin-top: 0.75rem; }
.size-8 { width: 2rem; height: 2rem; }
`,
      );
      const file = path.join(root, "src", "components", "ReplyList.astro");
      function replyList(names: Record<string, string>): string {
        return `---
const { replies, avatar } = Astro.props;
---
<ul>
  {replies.map((reply) => <li class="${names["px-4"]} ${names["py-2"]}">{reply}</li>)}
</ul>
{replies.length > 2 && <p class="${names["mt-3"]}">Don't wait.</p>}
{avatar && <img class="${names["size-8"]}" src={avatar} alt="">}
`;
      }
      const tokens = ["px-4", "py-2", "mt-3", "size-8"];
      const source = replyList(
        Object.fromEntries(
          tokens.map(function (token) {
            return [token, token];
          }),
        ),
      );
      fs.writeFileSync(file, source);
      const result = await runPrepass({ root, cssEntry: css });
      const reasons = exclusionReasons(result);
      for (const token of tokens) {
        assert.ok(
          result.renameTokens.has(token),
          `${token} must be a rename token`,
        );
        assert.strictEqual(reasons.get(token), undefined);
        assert.strictEqual(
          result.registry.nameFor(token),
          hashClassName(token),
        );
      }
      const transformed = transformSource({
        code: source,
        id: file,
        registry: result.registry,
        consolidationVerdicts: result.consolidationVerdicts,
      });
      assert.ok(transformed !== null);
      assert.strictEqual(
        transformed.code,
        replyList(
          Object.fromEntries(
            tokens.map(function (token) {
              return [token, hashClassName(token)];
            }),
          ),
        ),
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("runPrepass Astro frontmatter class constants (R3)", function () {
  // Panel.astro's class constants, as the fixture writes them.
  const PANEL_CONSTANTS = [
    "rounded-xl border-dashed p-6",
    "text-lg tracking-wide",
    "italic leading-snug",
    "ring-1 ring-sky-300",
  ];

  it("records the tokens the transform renames in the fixture's Panel.astro (AE3)", async function () {
    const panel = fs.readFileSync(
      path.join(
        HERE,
        "fixtures",
        "astro-site",
        "src",
        "components",
        "Panel.astro",
      ),
      "utf8",
    );
    const tokens = PANEL_CONSTANTS.flatMap(function (literal) {
      return literal.split(" ");
    });
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "minwind-astro-"));
    try {
      fs.mkdirSync(path.join(root, "src", "components"), { recursive: true });
      const css = path.join(root, "src", "app.css");
      fs.writeFileSync(
        css,
        tokens
          .map(function (token) {
            return `.${token} { color: red; }\n`;
          })
          .join(""),
      );
      const file = path.join(root, "src", "components", "Panel.astro");
      fs.writeFileSync(file, panel);
      const result = await runPrepass({ root, cssEntry: css });
      const reasons = exclusionReasons(result);
      for (const token of tokens) {
        assert.ok(
          result.renameTokens.has(token),
          `${token} must be a rename token`,
        );
        assert.strictEqual(reasons.get(token), undefined);
        assert.strictEqual(
          result.registry.nameFor(token),
          hashClassName(token),
        );
      }
      const transformed = transformSource({
        code: panel,
        id: file,
        registry: result.registry,
        consolidationVerdicts: result.consolidationVerdicts,
      });
      assert.ok(transformed !== null);
      let expected = panel;
      for (const literal of PANEL_CONSTANTS) {
        const quoted = `"${literal}"`;
        assert.strictEqual(expected.split(quoted).length, 2, literal);
        const names = literal.split(" ").map(function (token) {
          return hashClassName(token);
        });
        expected = expected.replace(quoted, `"${names.join(" ")}"`);
      }
      assert.strictEqual(transformed.code, expected);
      assert.deepStrictEqual(transformed.warnings, []);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

// R16 (KTD15): a key in a class composition renames with its class, and
// every other identifier object key in a module keeps its token original,
// wherever the walker descends. React className objects are the common
// case: the source walker never reads className.
describe("runPrepass class-composition object keys (R16, KTD15)", function () {
  const KEY_TOKENS = [
    "hidden",
    "block",
    "flex",
    "grid",
    "p-4",
    "ring",
    "border",
    "italic",
  ];

  async function withKeySite<T>(
    files: Record<string, string>,
    run: (root: string) => Promise<T>,
  ): Promise<T> {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "minwind-keys-"));
    try {
      fs.mkdirSync(path.join(root, "src"), { recursive: true });
      fs.writeFileSync(
        path.join(root, "src", "app.css"),
        KEY_TOKENS.map(function (token) {
          return `.${token} { color: red; }\n`;
        }).join(""),
      );
      for (const [name, text] of Object.entries(files)) {
        fs.writeFileSync(path.join(root, "src", name), text);
      }
      return await run(root);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }

  const TOGGLE = `import { cn } from "./cn";
export function Toggle(props) {
  return <div class={cn("p-4", { hidden: props.open })}>x</div>;
}
export const Static = <p class="hidden p-4">y</p>;
`;

  const REACT = `export function Menu(props) {
  const c = clsx({ flex: props.open });
  return (
    <>
      <div className={clsx({ block: props.open })} />
      <span className={c} />
      <b class="block flex">z</b>
    </>
  );
}
`;

  const SHAPES = `type P = { grid: boolean };
export function Shape(props: P) {
  const { grid } = props;
  return <input grid={grid} class="grid" />;
}
export class Model {
  grid = false;
}
`;

  it("records a cn() key as a rename token and never lists its group (AE11)", async function () {
    const only = `import { cn } from "./cn";
export function Toggle(props) {
  return <div class={cn("p-4", { hidden: props.open })}>x</div>;
}
`;
    await withKeySite({ "Toggle.tsx": only }, async function (root) {
      const result = await runPrepass({
        root,
        cssEntry: path.join(root, "src", "app.css"),
      });
      assert.ok(result.renameTokens.has("hidden"));
      assert.strictEqual(
        result.registry.nameFor("hidden"),
        hashClassName("hidden"),
      );
      assert.deepStrictEqual(result.listFrequencies, []);
    });
  });

  it("keeps React className object keys original, through clsx() and a variable (AE11)", async function () {
    await withKeySite({ "Menu.tsx": REACT }, async function (root) {
      const result = await runPrepass({
        root,
        cssEntry: path.join(root, "src", "app.css"),
      });
      const reasons = exclusionReasons(result);
      assert.strictEqual(reasons.get("block"), "runtime-context");
      assert.strictEqual(reasons.get("flex"), "runtime-context");
      assert.strictEqual(result.registry.nameFor("block"), undefined);
      assert.strictEqual(result.registry.nameFor("flex"), undefined);
    });
  });

  it("never counts a type literal, a binding pattern, a class field, or a JSX attribute", async function () {
    await withKeySite({ "Shape.tsx": SHAPES }, async function (root) {
      const result = await runPrepass({
        root,
        cssEntry: path.join(root, "src", "app.css"),
      });
      assert.strictEqual(exclusionReasons(result).get("grid"), undefined);
      assert.strictEqual(
        result.registry.nameFor("grid"),
        hashClassName("grid"),
      );
    });
  });

  it("reports a clsx() key in class position as runtime-context on every route (AE11)", async function () {
    const solid = `export const Item = (props) => (
  <div class={clsx({ italic: props.on })}><b class="italic">x</b></div>
);
`;
    await withKeySite({ "Item.tsx": solid }, async function (root) {
      for (const scansBuiltOutput of [false, true]) {
        const result = await runPrepass({
          root,
          cssEntry: path.join(root, "src", "app.css"),
          scansBuiltOutput,
        });
        assert.strictEqual(
          exclusionReasons(result).get("italic"),
          "runtime-context",
          String(scansBuiltOutput),
        );
      }
    });
  });

  it("keeps keys of Vue and Svelte template objects outside a composition original", async function () {
    await withKeySite(
      {
        "Card.vue": `<template>
  <Child :item-class="{ ring: on }" @click="pick({ italic: true })" />
  <div :class="{ border: on }" class="ring italic">x</div>
</template>
`,
        "Row.svelte": `<Child opts={{ border: on }} />
<div class:border={on} class="border">y</div>
`,
      },
      async function (root) {
        const result = await runPrepass({
          root,
          cssEntry: path.join(root, "src", "app.css"),
        });
        const reasons = exclusionReasons(result);
        assert.strictEqual(reasons.get("ring"), "runtime-context");
        assert.strictEqual(reasons.get("italic"), "runtime-context");
        assert.strictEqual(reasons.get("border"), "runtime-context");
      },
    );
  });

  it("agrees with the transform: renamed keys rename, kept keys stay, nothing warns", async function () {
    await withKeySite(
      { "Toggle.tsx": TOGGLE, "Menu.tsx": REACT, "Shape.tsx": SHAPES },
      async function (root) {
        const result = await runPrepass({
          root,
          cssEntry: path.join(root, "src", "app.css"),
        });
        const toggle = transformSource({
          code: TOGGLE,
          id: path.join(root, "src", "Toggle.tsx"),
          registry: result.registry,
        });
        assert.ok(toggle !== null);
        const hidden = hashClassName("hidden");
        const p4 = hashClassName("p-4");
        assert.ok(
          toggle.code.includes(`cn("${p4}", { ${hidden}: props.open })`),
        );
        assert.ok(toggle.code.includes(`<p class="${hidden} ${p4}">`));
        assert.deepStrictEqual(toggle.warnings, []);
        const menu = transformSource({
          code: REACT,
          id: path.join(root, "src", "Menu.tsx"),
          registry: result.registry,
        });
        assert.strictEqual(menu, null);
      },
    );
  });
});

// R17 (KTD16): a class a script selects with a `.token` string keeps its
// original name, wherever the string sits in the module. Property access,
// comments, and regular expressions never count.
describe("runPrepass selector strings (R17, KTD16)", function () {
  const SELECTOR_TOKENS = [
    "hidden",
    "block",
    "flex",
    "grid",
    "ring",
    "border",
    "italic",
    "md:flex",
  ];

  async function withSelectorSite<T>(
    files: Record<string, string>,
    run: (root: string) => Promise<T>,
  ): Promise<T> {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "minwind-selectors-"));
    try {
      fs.mkdirSync(path.join(root, "src"), { recursive: true });
      fs.writeFileSync(
        path.join(root, "src", "app.css"),
        SELECTOR_TOKENS.map(function (token) {
          return `.${token.replace(":", "\\:")} { color: red; }\n`;
        }).join(""),
      );
      for (const [name, text] of Object.entries(files)) {
        fs.writeFileSync(path.join(root, "src", name), text);
      }
      return await run(root);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }

  const DISCLOSURE = `export function Disclosure() {
  return <div class="hidden block flex grid md:flex">x</div>;
}
export function reveal(root) {
  const panel = root.querySelector("div > .hidden:not(.md\\\\:flex)");
  // .grid
  panel.flex = /\\.grid/.test(panel.id);
}
`;

  it("keeps a selected class original, escapes decoded, and renames classes only property access, comments, and regular expressions name (AE12)", async function () {
    await withSelectorSite(
      { "Disclosure.tsx": DISCLOSURE },
      async function (root) {
        const result = await runPrepass({
          root,
          cssEntry: path.join(root, "src", "app.css"),
        });
        const reasons = exclusionReasons(result);
        assert.strictEqual(reasons.get("hidden"), "runtime-context");
        assert.strictEqual(reasons.get("md:flex"), "runtime-context");
        for (const token of ["block", "flex", "grid"]) {
          assert.strictEqual(
            result.registry.nameFor(token),
            hashClassName(token),
            token,
          );
        }
      },
    );
  });

  it("counts selector strings in Vue and Svelte scripts and template expressions", async function () {
    await withSelectorSite(
      {
        "Card.vue": `<template>
  <button @click="$el.querySelector('.ring').focus()">x</button>
  <div class="ring italic border">y</div>
</template>
<script setup>
const first = () => document.querySelector(".italic");
</script>
`,
        "Row.svelte": `<script>
  let open = false;
</script>
<button on:click={() => document.querySelector(".border").remove()}>z</button>
<div class="border">w</div>
`,
      },
      async function (root) {
        const result = await runPrepass({
          root,
          cssEntry: path.join(root, "src", "app.css"),
        });
        const reasons = exclusionReasons(result);
        for (const token of ["ring", "italic", "border"]) {
          assert.strictEqual(reasons.get(token), "runtime-context", token);
        }
      },
    );
  });

  it("leaves selector strings to the output scan on the apply and Astro routes", async function () {
    await withSelectorSite(
      { "Disclosure.tsx": DISCLOSURE },
      async function (root) {
        const result = await runPrepass({
          root,
          cssEntry: path.join(root, "src", "app.css"),
          scansBuiltOutput: true,
        });
        assert.strictEqual(
          result.registry.nameFor("hidden"),
          hashClassName("hidden"),
        );
      },
    );
  });

  it("agrees with the transform: the selected class stays and nothing warns", async function () {
    await withSelectorSite(
      { "Disclosure.tsx": DISCLOSURE },
      async function (root) {
        const result = await runPrepass({
          root,
          cssEntry: path.join(root, "src", "app.css"),
        });
        const transformed = transformSource({
          code: DISCLOSURE,
          id: path.join(root, "src", "Disclosure.tsx"),
          registry: result.registry,
        });
        assert.ok(transformed !== null);
        const names = ["block", "flex", "grid"]
          .map(function (token) {
            return hashClassName(token);
          })
          .join(" ");
        assert.ok(
          transformed.code.includes(`class="hidden ${names} md:flex"`),
          transformed.code,
        );
        assert.deepStrictEqual(transformed.warnings, []);
      },
    );
  });
});

// R17 (KTD16): on the source routes, a String.raw selector keeps
// its CSS escape, so String.raw`.md\:flex` keeps md:flex original, and the
// transform agrees.
describe("runPrepass tagged-template selector strings (R17, KTD16)", function () {
  const MENU = `export function Menu() {
  return <div class="md:flex hidden">x</div>;
}
export function open(root) {
  root.querySelector(String.raw\`nav > .md\\:flex\`).hidden = false;
}
`;

  it("keeps a String.raw-selected class original, and nothing warns", async function () {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "minwind-raw-"));
    try {
      fs.mkdirSync(path.join(root, "src"), { recursive: true });
      fs.writeFileSync(
        path.join(root, "src", "app.css"),
        ".md\\:flex { display: flex; }\n.hidden { display: none; }\n",
      );
      fs.writeFileSync(path.join(root, "src", "Menu.tsx"), MENU);
      const result = await runPrepass({
        root,
        cssEntry: path.join(root, "src", "app.css"),
      });
      assert.strictEqual(
        exclusionReasons(result).get("md:flex"),
        "runtime-context",
      );
      assert.strictEqual(
        result.registry.nameFor("hidden"),
        hashClassName("hidden"),
      );
      const transformed = transformSource({
        code: MENU,
        id: path.join(root, "src", "Menu.tsx"),
        registry: result.registry,
      });
      assert.ok(transformed !== null);
      assert.ok(
        transformed.code.includes(`class="md:flex ${hashClassName("hidden")}"`),
        transformed.code,
      );
      assert.deepStrictEqual(transformed.warnings, []);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
