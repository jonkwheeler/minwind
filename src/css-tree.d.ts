// css-tree@3.2.1 ships no TypeScript declarations and @types/css-tree is not
// an allowed dependency, so declare the minimal API surface this tool uses
// (same approach as tools/minwind/src/css-tree.d.ts).
declare module "css-tree" {
  export interface CssLocation {
    source: string;
    start: { offset: number; line: number; column: number };
    end: { offset: number; line: number; column: number };
  }

  export interface CssNodeList {
    forEach(callback: (item: CssNode) => void): void;
    toArray(): Array<CssNode>;
  }

  export interface CssNode {
    type: string;
    loc?: CssLocation;
    name?: string;
    property?: string;
    value?: string;
    prelude?: CssNode | null;
    block?: CssNode | null;
    children?: CssNodeList;
  }

  export interface CssParseError extends Error {
    line: number;
    column: number;
    offset: number;
    formattedMessage?: string;
  }

  export interface ParseOptions {
    positions?: boolean;
    context?: string;
    onParseError?: (error: CssParseError) => void;
  }

  export function parse(css: string, options?: ParseOptions): CssNode;

  export function generate(node: CssNode): string;

  export const ident: {
    decode(identifier: string): string;
    encode(identifier: string): string;
  };
}
