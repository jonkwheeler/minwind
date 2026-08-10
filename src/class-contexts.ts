import * as ts from "typescript";

// Shared KTD4 class-context detection. One AST walk classifies every
// class-position node so the U2 pre-pass scan (which tokens exist) and the U3
// source transform (which spans to edit) can never drift apart: rename
// contexts are exactly `class="..."` attributes, `classList={{...}}` keys,
// and `cn(...)` arguments; literals in `classList.add/remove/toggle` calls
// and `className` assignments are detection-only; a template literal with
// expressions in any class position is unprovable. Any other expression in
// class/classList position (a conditional, a non-cn call like clsx(...), a
// member expression) is unprovable too: its nested string literals are real
// class tokens the transform never renames, so they poison the token
// everywhere through the runtime channel (KTD4).

export type RenameContextKind =
  "class-attribute" | "classList-key" | "cn-argument";

// Detection-only contexts, plus the unprovable class-position expressions:
// 'class-expression' / 'classList-expression' mark the nested string
// literals of an expression the walker cannot prove (a conditional, a
// non-cn call, an identifier or member expression) in class / classList
// position. Those literals poison the token everywhere (KTD4); identifiers
// and member expressions themselves contribute no tokens.
export type RuntimeContextKind =
  | "classList-method"
  | "className-assignment"
  | "class-expression"
  | "classList-expression";

export type ClassContextKind = RenameContextKind | RuntimeContextKind;

// A literal found in a class position. start/end are absolute offsets of the
// literal's content (inside the quotes/backticks; the whole span for
// identifier keys). text is the AST's cooked text — consumers editing spans
// must verify it matches the raw bytes. shorthand marks a classList key like
// `{ flex }`, where the identifier is both the class name and the value
// binding. quoted is false exactly for those identifier keys, whose span
// carries no surrounding quote bytes.
export interface LiteralOccurrence {
  text: string;
  start: number;
  end: number;
  shorthand: boolean;
  quoted: boolean;
}

// Rename groups bracket the literals that form one logical class list: one
// class attribute literal, one cn(...) call (across all arguments), or one
// classList object (across all keys). fullyLiteral is false when any member
// of the group is unprovable (a dynamic cn() argument, a computed classList
// key), which the pre-pass uses to exclude runtime-composed lists from
// consolidation (R3). staticList is stronger: the group provably renders
// exactly its literal tokens — for classList objects that additionally
// requires every value to be the literal `true`, since conditional values
// render a runtime-chosen subset.
export interface ClassContextVisitor {
  enterRenameGroup?: (kind: RenameContextKind) => void;
  renameLiteral?: (literal: LiteralOccurrence, kind: RenameContextKind) => void;
  exitRenameGroup?: (
    kind: RenameContextKind,
    fullyLiteral: boolean,
    staticList: boolean,
  ) => void;
  unprovableTemplate?: (
    node: ts.TemplateExpression,
    kind: ClassContextKind,
  ) => void;
  runtimeLiteral?: (
    literal: LiteralOccurrence,
    kind: RuntimeContextKind,
  ) => void;
}

// HTML5 ASCII whitespace only — exactly the set the DOM classList splits on
// and the transform-side token regex consumes. Non-ASCII whitespace (NBSP
// and friends) is NOT a class separator: an NBSP-joined attribute value is a
// single DOM token, and tokenizing it as several would rename or collapse
// classes the element never had.
export function tokenize(text: string): Array<string> {
  return text.split(/[ \t\n\f\r]+/).filter(function (token) {
    return token !== "";
  });
}

// Every module extension the TS compiler API can walk for class contexts:
// TypeScript and JavaScript families, including the ESM/CJS variants. SFC
// formats (.vue/.svelte/.astro) are NOT here — their script blocks are
// carved out and parsed per-block with these same kinds.
export const SOURCE_MODULE_PATTERN = /\.(?:[cm]?[jt]s|[jt]sx)$/;

// Declaration files carry no runtime class contexts; the module filter and
// the scans skip them so they never feed the parser.
export const DECLARATION_PATTERN = /\.d\.[cm]?ts$/;

export function scriptKindFor(filePath: string): ts.ScriptKind {
  // Strip Vite query suffixes (?pick=default&pick=$css) before choosing the
  // script kind: a queried id never ends with .tsx, and parsing picked JSX as
  // plain TS silently yields no rename contexts instead of a parse error.
  const clean = filePath.split("?")[0];
  if (clean.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (/\.[cm]?ts$/.test(clean)) return ts.ScriptKind.TS;
  // The JS family parses as JSX: JSX mode is a parse superset of plain JS
  // for every construct valid in a .js file (angle-bracket assertions are
  // TS-only), and React-flavored projects legitimately put JSX in .js files
  // (@vitejs/plugin-react compiles it). Parsing .js as plain JS instead
  // would silently miss class attributes there.
  return ts.ScriptKind.JSX;
}

export function parseSourceModule(
  filePath: string,
  text: string,
): ts.SourceFile {
  return ts.createSourceFile(
    filePath,
    text,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(filePath),
  );
}

export function walkClassContexts(
  sourceFile: ts.SourceFile,
  visitor: ClassContextVisitor,
): void {
  // Identify cn by its import-traced binding; fall back to a bare-name match
  // so an unimported global-style helper still counts (KTD4).
  const cnNames = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const namedBindings = statement.importClause?.namedBindings;
    if (namedBindings === undefined || !ts.isNamedImports(namedBindings)) {
      continue;
    }
    for (const element of namedBindings.elements) {
      const imported = element.propertyName?.text ?? element.name.text;
      if (imported === "cn") cnNames.add(element.name.text);
    }
  }

  function isCnCall(node: ts.CallExpression): boolean {
    return (
      ts.isIdentifier(node.expression) &&
      (cnNames.has(node.expression.text) || node.expression.text === "cn")
    );
  }

  function occurrence(
    node: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral | ts.Identifier,
    shorthand: boolean,
  ): LiteralOccurrence {
    if (ts.isIdentifier(node)) {
      return {
        text: node.text,
        start: node.getStart(sourceFile),
        end: node.getEnd(),
        shorthand,
        quoted: false,
      };
    }
    return {
      text: node.text,
      start: node.getStart(sourceFile) + 1,
      end: node.getEnd() - 1,
      shorthand,
      quoted: true,
    };
  }

  function emitLiteralList(
    node: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral,
    kind: RenameContextKind,
  ): void {
    visitor.enterRenameGroup?.(kind);
    visitor.renameLiteral?.(occurrence(node, false), kind);
    visitor.exitRenameGroup?.(kind, true, true);
  }

  // Inside a provable class context, nested string literals are still class
  // tokens (e.g. cn(flag ? 'a' : 'b')); nested templates with expressions are
  // unprovable.
  function collectNested(node: ts.Node, kind: RenameContextKind): void {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      visitor.renameLiteral?.(occurrence(node, false), kind);
      return;
    }
    if (ts.isTemplateExpression(node)) {
      visitor.unprovableTemplate?.(node, kind);
      return;
    }
    ts.forEachChild(node, function (child) {
      collectNested(child, kind);
    });
  }

  function handleCnCall(node: ts.CallExpression): void {
    visitor.enterRenameGroup?.("cn-argument");
    let fullyLiteral = node.arguments.length > 0;
    for (const argument of node.arguments) {
      if (
        ts.isStringLiteral(argument) ||
        ts.isNoSubstitutionTemplateLiteral(argument)
      ) {
        visitor.renameLiteral?.(occurrence(argument, false), "cn-argument");
      } else {
        fullyLiteral = false;
        collectNested(argument, "cn-argument");
      }
    }
    visitor.exitRenameGroup?.("cn-argument", fullyLiteral, fullyLiteral);
  }

  function isClassListMethod(name: string): boolean {
    return name === "add" || name === "remove" || name === "toggle";
  }

  function isClassListMethodCall(node: ts.CallExpression): boolean {
    const callee = node.expression;
    return (
      ts.isPropertyAccessExpression(callee) &&
      isClassListMethod(callee.name.text) &&
      ts.isPropertyAccessExpression(callee.expression) &&
      callee.expression.name.text === "classList"
    );
  }

  // Detection-only (KTD4): el.classList.add/remove/toggle('...') literals
  // are never renamed.
  function reportClassListMethodArguments(node: ts.CallExpression): void {
    for (const argument of node.arguments) {
      if (
        ts.isStringLiteral(argument) ||
        ts.isNoSubstitutionTemplateLiteral(argument)
      ) {
        visitor.runtimeLiteral?.(
          occurrence(argument, false),
          "classList-method",
        );
      } else if (ts.isTemplateExpression(argument)) {
        visitor.unprovableTemplate?.(argument, "classList-method");
      }
    }
  }

  function handleCall(node: ts.CallExpression): void {
    if (isCnCall(node)) {
      handleCnCall(node);
      return;
    }
    if (isClassListMethodCall(node)) reportClassListMethodArguments(node);
  }

  // An unprovable class-position expression (a conditional, a non-cn call
  // like clsx(...), an identifier or member expression) still holds real
  // class tokens when it nests string literals; those tokens poison the
  // registry through the runtime channel (KTD4). The walk is conservative:
  // only string literals contribute tokens — identifiers and member
  // expressions contribute nothing — and a nested template with expressions
  // keeps its existing unprovableTemplate path so its static fragments
  // poison too.
  function collectUnprovable(
    node: ts.Node,
    kind: "class-expression" | "classList-expression",
  ): void {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      visitor.runtimeLiteral?.(occurrence(node, false), kind);
      return;
    }
    if (ts.isTemplateExpression(node)) {
      visitor.unprovableTemplate?.(node, kind);
      return;
    }
    ts.forEachChild(node, function (child) {
      collectUnprovable(child, kind);
    });
  }

  function handleClassExpression(expression: ts.Expression): void {
    if (
      ts.isStringLiteral(expression) ||
      ts.isNoSubstitutionTemplateLiteral(expression)
    ) {
      emitLiteralList(expression, "class-attribute");
      return;
    }
    if (ts.isTemplateExpression(expression)) {
      visitor.unprovableTemplate?.(expression, "class-attribute");
      return;
    }
    if (ts.isCallExpression(expression)) {
      if (isCnCall(expression)) {
        handleCnCall(expression);
        return;
      }
      if (isClassListMethodCall(expression)) {
        reportClassListMethodArguments(expression);
        return;
      }
      collectUnprovable(expression, "class-expression");
      return;
    }
    collectUnprovable(expression, "class-expression");
  }

  function handleClassListExpression(expression: ts.Expression): void {
    if (!ts.isObjectLiteralExpression(expression)) {
      // A non-object classList expression (an identifier, conditional, or
      // call) is unprovable; poison any nested string literals (KTD4).
      collectUnprovable(expression, "classList-expression");
      return;
    }
    visitor.enterRenameGroup?.("classList-key");
    let fullyStatic = true;
    // classList values are per-key conditions: only an all-`true` object
    // provably renders exactly its keys (R3 consolidation eligibility).
    let allValuesTrue = true;
    for (const property of expression.properties) {
      if (
        ts.isPropertyAssignment(property) ||
        ts.isShorthandPropertyAssignment(property)
      ) {
        const name = property.name;
        if (
          ts.isStringLiteral(name) ||
          ts.isIdentifier(name) ||
          ts.isNoSubstitutionTemplateLiteral(name)
        ) {
          visitor.renameLiteral?.(
            occurrence(name, ts.isShorthandPropertyAssignment(property)),
            "classList-key",
          );
        } else {
          fullyStatic = false;
        }
        if (
          ts.isShorthandPropertyAssignment(property) ||
          property.initializer.kind !== ts.SyntaxKind.TrueKeyword
        ) {
          allValuesTrue = false;
        }
      } else {
        fullyStatic = false;
        allValuesTrue = false;
      }
    }
    visitor.exitRenameGroup?.(
      "classList-key",
      fullyStatic,
      fullyStatic && allValuesTrue,
    );
  }

  function visit(node: ts.Node): void {
    if (ts.isJsxAttribute(node)) {
      // Namespaced attribute names (a:b) are never class contexts.
      const attribute = ts.isIdentifier(node.name) ? node.name.text : "";
      const initializer = node.initializer;
      if (attribute === "class" && initializer !== undefined) {
        if (ts.isStringLiteral(initializer)) {
          emitLiteralList(initializer, "class-attribute");
        } else if (
          ts.isJsxExpression(initializer) &&
          initializer.expression !== undefined
        ) {
          handleClassExpression(initializer.expression);
        }
      } else if (
        attribute === "classList" &&
        initializer !== undefined &&
        ts.isJsxExpression(initializer) &&
        initializer.expression !== undefined
      ) {
        handleClassListExpression(initializer.expression);
      }
      return;
    }
    if (ts.isCallExpression(node)) {
      handleCall(node);
      // Descend: arguments of a non-cn call may themselves contain cn calls.
      ts.forEachChild(node, visit);
      return;
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(node.left) &&
      node.left.name.text === "className"
    ) {
      // Detection-only (KTD4): el.className = '...' assignments.
      const right = node.right;
      if (
        ts.isStringLiteral(right) ||
        ts.isNoSubstitutionTemplateLiteral(right)
      ) {
        visitor.runtimeLiteral?.(
          occurrence(right, false),
          "className-assignment",
        );
      } else if (ts.isTemplateExpression(right)) {
        visitor.unprovableTemplate?.(right, "className-assignment");
      }
      return;
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}
