import * as ts from "typescript";
import { cnBindingNames, isClassListDirective } from "./class-contexts.js";

export interface ContentRegion {
  contentStart: number;
  contentEnd: number;
  lang: string;
  frontmatter: boolean;
}

// KTD5: a frontmatter const that may hold a class string, with what the
// reference count has found so far.
export interface ClassConstant {
  declaration: ts.Identifier;
  literal: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral;
  classPositions: number;
  otherReference: boolean;
}

// Eligible: a top-level, non-exported const declared inside the
// frontmatter, initialized with a string literal or a template literal
// without substitutions. A later declaration of the same name is not the
// declaration, so the count reads it as an other reference.
export function frontmatterConstants(
  sourceFile: ts.SourceFile,
  frontmatter: ContentRegion,
): Map<string, ClassConstant> {
  const constants = new Map<string, ClassConstant>();
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    const at = statement.getStart(sourceFile);
    if (at < frontmatter.contentStart || at >= frontmatter.contentEnd) {
      continue;
    }
    if ((statement.modifiers?.length ?? 0) > 0) continue;
    const list = statement.declarationList;
    if ((list.flags & ts.NodeFlags.BlockScoped) !== ts.NodeFlags.Const) {
      continue;
    }
    for (const declaration of list.declarations) {
      const name = declaration.name;
      const literal = declaration.initializer;
      if (!ts.isIdentifier(name) || constants.has(name.text)) continue;
      if (
        literal === undefined ||
        !(
          ts.isStringLiteral(literal) ||
          ts.isNoSubstitutionTemplateLiteral(literal)
        )
      ) {
        continue;
      }
      constants.set(name.text, {
        declaration: name,
        literal,
        classPositions: 0,
        otherReference: false,
      });
    }
  }
  return constants;
}

// How a brace run sits in the template: the whole value of a class or a
// class:list attribute.
export type RunRole = "class" | "class-list";

// KTD5's reference count over one parse. A reference is the name as a whole
// identifier, not after `.`, other than the declaration. It is a class
// position when it is the whole value of class={X}, the whole class:list
// expression or an array element at any depth inside it, or a direct cn()
// argument. role says the parse itself is the value of a class or class:list
// attribute.
export function countConstantReferences(
  sourceFile: ts.SourceFile,
  constants: ReadonlyMap<string, ClassConstant>,
  role: RunRole | undefined,
): void {
  const cnNames = cnBindingNames(sourceFile);
  cnNames.add("cn");
  const classPositions = new Set<ts.Node>();
  function addClassList(expression: ts.Expression): void {
    if (ts.isIdentifier(expression)) {
      classPositions.add(expression);
    } else if (ts.isArrayLiteralExpression(expression)) {
      for (const element of expression.elements) addClassList(element);
    }
  }
  const first = sourceFile.statements[0];
  if (
    role !== undefined &&
    first !== undefined &&
    ts.isExpressionStatement(first) &&
    ts.isParenthesizedExpression(first.expression)
  ) {
    const value = first.expression.expression;
    if (role === "class-list") addClassList(value);
    else if (ts.isIdentifier(value)) classPositions.add(value);
  }
  function visit(node: ts.Node): void {
    if (ts.isIdentifier(node)) {
      const constant = constants.get(node.text);
      if (constant === undefined || node === constant.declaration) return;
      const parent = node.parent;
      if (
        (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
        (ts.isQualifiedName(parent) && parent.right === node)
      ) {
        return;
      }
      if (classPositions.has(node)) constant.classPositions += 1;
      else constant.otherReference = true;
      return;
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      cnNames.has(node.expression.text)
    ) {
      for (const argument of node.arguments) {
        if (ts.isIdentifier(argument)) classPositions.add(argument);
      }
    } else if (
      ts.isJsxAttribute(node) &&
      node.initializer !== undefined &&
      ts.isJsxExpression(node.initializer) &&
      node.initializer.expression !== undefined
    ) {
      const value = node.initializer.expression;
      if (isClassListDirective(node.name)) {
        addClassList(value);
      } else if (
        ts.isIdentifier(node.name) &&
        node.name.text === "class" &&
        ts.isIdentifier(value)
      ) {
        classPositions.add(value);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
}

// The names as whole words in a run's text, which picks the runs worth
// parsing and stands in for a parse TSX rejects. A `.` before a name does
// not exclude it here: the spread in [...card] is a reference, and only the
// parse tells it from member access.
export function constantNamePattern(names: Iterable<string>): RegExp {
  const alternatives = Array.from(names, function (name) {
    return name.replace(/\$/g, "\\$");
  });
  return new RegExp(
    `(?<![\\w$\\u0080-\\uffff])(?:${alternatives.join("|")})(?![\\w$\\u0080-\\uffff])`,
    "g",
  );
}
