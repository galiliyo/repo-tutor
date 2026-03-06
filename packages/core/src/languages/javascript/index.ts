// packages/core/src/languages/javascript/index.ts

import * as fs from 'fs/promises';
import type { LanguagePlugin, ASTNode, Import, Export, CodeSymbol } from '../plugin';

const IMPORT_RE = /import\s+(?:(?:\*\s+as\s+(\w+))|(?:(\w+)(?:\s*,\s*\{([^}]*)\})?)|(?:\{([^}]*)\}))\s+from\s+['"]([^'"]+)['"]/g;
const BARE_IMPORT_RE = /import\s+['"]([^'"]+)['"]/g;
const EXPORT_NAMED_RE = /export\s+(?:function|class|const|let|var|interface|type)\s+(\w+)/g;
const EXPORT_DEFAULT_RE = /export\s+default\s+/g;
const REEXPORT_RE = /export\s+\{([^}]*)\}\s+from\s+['"]([^'"]+)['"]/g;

export class JavaScriptPlugin implements LanguagePlugin {
  id = 'javascript';
  extensions = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.mts'];

  async parseFile(filePath: string): Promise<ASTNode> {
    const text = await fs.readFile(filePath, 'utf-8');
    return {
      type: 'SourceFile',
      children: [],
      text,
      filePath,
      _sourceText: text,
    };
  }

  getImports(ast: ASTNode): Import[] {
    const text = ast._sourceText ?? '';
    const imports: Import[] = [];
    let match: RegExpExecArray | null;

    // Named / default / namespace imports
    const re = new RegExp(IMPORT_RE.source, 'g');
    while ((match = re.exec(text)) !== null) {
      const [full, namespace, defaultImport, namedWithDefault, named, source] = match;
      const specifiers: string[] = [];

      if (namespace) specifiers.push('*');
      if (defaultImport) specifiers.push(defaultImport);

      const namedStr = namedWithDefault || named;
      if (namedStr) {
        for (const s of namedStr.split(',')) {
          const trimmed = s.trim().split(/\s+as\s+/)[0].trim();
          if (trimmed) specifiers.push(trimmed);
        }
      }

      const line = text.substring(0, match.index).split('\n').length;
      imports.push({
        source,
        specifiers,
        isRelative: source.startsWith('.'),
        line,
      });
    }

    // Bare imports: import 'side-effect'
    const bareRe = new RegExp(BARE_IMPORT_RE.source, 'g');
    while ((match = bareRe.exec(text)) !== null) {
      const source = match[1];
      // Skip if already captured by the main regex
      if (imports.some(i => i.source === source)) continue;
      const line = text.substring(0, match.index).split('\n').length;
      imports.push({ source, specifiers: [], isRelative: source.startsWith('.'), line });
    }

    return imports;
  }

  getExports(ast: ASTNode): Export[] {
    const text = ast._sourceText ?? '';
    const exports: Export[] = [];
    let match: RegExpExecArray | null;

    // Re-exports
    const reexportRe = new RegExp(REEXPORT_RE.source, 'g');
    while ((match = reexportRe.exec(text)) !== null) {
      const line = text.substring(0, match.index).split('\n').length;
      for (const s of match[1].split(',')) {
        const name = s.trim().split(/\s+as\s+/).pop()!.trim();
        if (name) exports.push({ name, kind: 'reexport', line });
      }
    }

    // Named exports
    const namedRe = new RegExp(EXPORT_NAMED_RE.source, 'g');
    while ((match = namedRe.exec(text)) !== null) {
      const line = text.substring(0, match.index).split('\n').length;
      const full = match[0];
      let kind: Export['kind'] = 'variable';
      if (full.includes('function')) kind = 'function';
      else if (full.includes('class')) kind = 'class';
      else if (full.includes('interface') || full.includes('type')) kind = 'type';
      exports.push({ name: match[1], kind, line });
    }

    // Default export
    const defaultRe = new RegExp(EXPORT_DEFAULT_RE.source, 'g');
    while ((match = defaultRe.exec(text)) !== null) {
      const line = text.substring(0, match.index).split('\n').length;
      exports.push({ name: 'default', kind: 'default', line });
    }

    return exports;
  }

  getSymbols(ast: ASTNode): CodeSymbol[] {
    const text = ast._sourceText ?? '';
    const symbols: CodeSymbol[] = [];

    const SYMBOL_RE = /(?:export\s+)?(?:default\s+)?(?:async\s+)?(function|class|interface|type|const|let|var)\s+(\w+)/g;
    let match: RegExpExecArray | null;

    while ((match = SYMBOL_RE.exec(text)) !== null) {
      const [, keyword, name] = match;
      const line = text.substring(0, match.index).split('\n').length;
      const col = match.index - text.lastIndexOf('\n', match.index - 1) - 1;

      let kind: CodeSymbol['kind'];
      if (keyword === 'function') kind = 'function';
      else if (keyword === 'class') kind = 'class';
      else if (keyword === 'interface') kind = 'interface';
      else if (keyword === 'type') kind = 'type';
      else kind = 'variable';

      symbols.push({ name, kind, line, column: col });
    }

    return symbols;
  }
}
