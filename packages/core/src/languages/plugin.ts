// packages/core/src/languages/plugin.ts

export interface ASTNode {
  type: string;
  children: ASTNode[];
  text?: string;
  startPosition?: { row: number; column: number };
  endPosition?: { row: number; column: number };
  /** File path this AST was parsed from (used internally by plugins) */
  filePath?: string;
  /** Source text for reparsing (used internally by plugins) */
  _sourceText?: string;
}

export interface Import {
  source: string;
  specifiers: string[];
  isRelative: boolean;
  resolvedPath?: string;
  line: number;
}

export interface Export {
  name: string;
  kind: 'function' | 'class' | 'variable' | 'type' | 'default' | 'reexport';
  line: number;
}

export interface CodeSymbol {
  name: string;
  kind: 'function' | 'class' | 'method' | 'variable' | 'type' | 'interface';
  line: number;
  column: number;
  signature?: string;
  docstring?: string;
  children?: CodeSymbol[];
}

export interface LanguagePlugin {
  id: string;
  extensions: string[];

  parseFile(filePath: string): Promise<ASTNode>;
  getImports(ast: ASTNode): Import[];
  getExports(ast: ASTNode): Export[];
  getSymbols(ast: ASTNode): CodeSymbol[];
}
