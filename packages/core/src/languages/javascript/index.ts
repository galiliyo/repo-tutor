// packages/core/src/languages/javascript/index.ts

import { Project, SourceFile, SyntaxKind, Node } from 'ts-morph';
import type { LanguagePlugin, ASTNode, Import, Export, CodeSymbol } from '../plugin';

export class JavaScriptPlugin implements LanguagePlugin {
  id = 'javascript';
  extensions = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.mts'];

  private project: Project;

  constructor() {
    this.project = new Project({
      compilerOptions: {
        allowJs: true,
        checkJs: false,
        noEmit: true,
        skipLibCheck: true,
      },
      skipAddingFilesFromTsConfig: true,
    });
  }

  async parseFile(filePath: string): Promise<ASTNode> {
    const sourceFile = this.project.addSourceFileAtPath(filePath);
    const astNode = this.convertToASTNode(sourceFile);
    // Store the filePath in the AST node for later lookup
    astNode.filePath = filePath;
    return astNode;
  }

  private convertToASTNode(node: Node): ASTNode {
    return {
      type: SyntaxKind[node.getKind()],
      children: node.getChildren().map(child => this.convertToASTNode(child)),
      text: node.getText(),
      startPosition: {
        row: node.getStartLineNumber() - 1,
        column: node.getStart() - node.getStartLinePos(),
      },
      endPosition: {
        row: node.getEndLineNumber() - 1,
        column: 0,
      },
    };
  }

  /**
   * Gets the source file for the given AST and removes it from the project
   * to prevent memory leaks.
   */
  private getAndRemoveSourceFile(ast: ASTNode): SourceFile | undefined {
    if (!ast.filePath) {
      return undefined;
    }
    const sourceFile = this.project.getSourceFile(ast.filePath);
    if (sourceFile) {
      // We'll remove the file after extraction in the calling method
      return sourceFile;
    }
    return undefined;
  }

  getImports(ast: ASTNode): Import[] {
    const sourceFile = this.getAndRemoveSourceFile(ast);
    if (!sourceFile) return [];

    const imports: Import[] = [];

    try {
      for (const importDecl of sourceFile.getImportDeclarations()) {
        const moduleSpecifier = importDecl.getModuleSpecifierValue();
        const specifiers: string[] = [];

        const defaultImport = importDecl.getDefaultImport();
        if (defaultImport) {
          specifiers.push(defaultImport.getText());
        }

        const namespaceImport = importDecl.getNamespaceImport();
        if (namespaceImport) {
          specifiers.push('*');
        }

        for (const named of importDecl.getNamedImports()) {
          specifiers.push(named.getName());
        }

        imports.push({
          source: moduleSpecifier,
          specifiers,
          isRelative: moduleSpecifier.startsWith('.'),
          line: importDecl.getStartLineNumber(),
        });
      }
    } finally {
      // Remove the source file to prevent memory leak
      this.project.removeSourceFile(sourceFile);
    }

    return imports;
  }

  getExports(ast: ASTNode): Export[] {
    const sourceFile = this.getAndRemoveSourceFile(ast);
    if (!sourceFile) return [];

    const exports: Export[] = [];

    try {
      for (const exportDecl of sourceFile.getExportDeclarations()) {
        for (const named of exportDecl.getNamedExports()) {
          exports.push({
            name: named.getName(),
            kind: 'reexport',
            line: exportDecl.getStartLineNumber(),
          });
        }
      }

      for (const stmt of sourceFile.getStatements()) {
        if (Node.isExportable(stmt) && stmt.hasExportKeyword()) {
          if (Node.isFunctionDeclaration(stmt)) {
            const name = stmt.getName();
            if (name) {
              exports.push({ name, kind: 'function', line: stmt.getStartLineNumber() });
            }
          } else if (Node.isClassDeclaration(stmt)) {
            const name = stmt.getName();
            if (name) {
              exports.push({ name, kind: 'class', line: stmt.getStartLineNumber() });
            }
          } else if (Node.isVariableStatement(stmt)) {
            for (const decl of stmt.getDeclarations()) {
              exports.push({ name: decl.getName(), kind: 'variable', line: stmt.getStartLineNumber() });
            }
          } else if (Node.isInterfaceDeclaration(stmt)) {
            exports.push({ name: stmt.getName(), kind: 'type', line: stmt.getStartLineNumber() });
          } else if (Node.isTypeAliasDeclaration(stmt)) {
            exports.push({ name: stmt.getName(), kind: 'type', line: stmt.getStartLineNumber() });
          }
        }
      }

      // Handle default exports
      const defaultExport = sourceFile.getDefaultExportSymbol();
      if (defaultExport) {
        const declarations = defaultExport.getDeclarations();
        if (declarations.length > 0) {
          const decl = declarations[0];
          exports.push({ name: 'default', kind: 'default', line: decl.getStartLineNumber() });
        }
      }
    } finally {
      // Remove the source file to prevent memory leak
      this.project.removeSourceFile(sourceFile);
    }

    return exports;
  }

  getSymbols(ast: ASTNode): CodeSymbol[] {
    const sourceFile = this.getAndRemoveSourceFile(ast);
    if (!sourceFile) return [];

    try {
      return this.extractSymbols(sourceFile);
    } finally {
      // Remove the source file to prevent memory leak
      this.project.removeSourceFile(sourceFile);
    }
  }

  private extractSymbols(sourceFile: SourceFile): CodeSymbol[] {
    const symbols: CodeSymbol[] = [];

    for (const func of sourceFile.getFunctions()) {
      const name = func.getName();
      if (name) {
        symbols.push({
          name,
          kind: 'function',
          line: func.getStartLineNumber(),
          column: func.getStart() - func.getStartLinePos(),
          signature: func.getSignature()?.getDeclaration().getText(),
        });
      }
    }

    for (const cls of sourceFile.getClasses()) {
      const name = cls.getName();
      if (name) {
        const children: CodeSymbol[] = [];

        for (const method of cls.getMethods()) {
          children.push({
            name: method.getName(),
            kind: 'method',
            line: method.getStartLineNumber(),
            column: method.getStart() - method.getStartLinePos(),
          });
        }

        symbols.push({
          name,
          kind: 'class',
          line: cls.getStartLineNumber(),
          column: cls.getStart() - cls.getStartLinePos(),
          children,
        });
      }
    }

    for (const iface of sourceFile.getInterfaces()) {
      symbols.push({
        name: iface.getName(),
        kind: 'interface',
        line: iface.getStartLineNumber(),
        column: iface.getStart() - iface.getStartLinePos(),
      });
    }

    // Add type alias extraction
    for (const typeAlias of sourceFile.getTypeAliases()) {
      symbols.push({
        name: typeAlias.getName(),
        kind: 'type',
        line: typeAlias.getStartLineNumber(),
        column: typeAlias.getStart() - typeAlias.getStartLinePos(),
      });
    }

    for (const varStmt of sourceFile.getVariableStatements()) {
      for (const decl of varStmt.getDeclarations()) {
        symbols.push({
          name: decl.getName(),
          kind: 'variable',
          line: varStmt.getStartLineNumber(),
          column: varStmt.getStart() - varStmt.getStartLinePos(),
        });
      }
    }

    return symbols;
  }
}
