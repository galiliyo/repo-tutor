# Repo Tutor MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a VS Code extension that teaches developers unfamiliar codebases through guided chapters, quizzes, and Q&A — powered by the user's own LLM API key.

**Architecture:** Monorepo with two packages: `@repo-tutor/core` (analysis, generation, quiz engine) and `@repo-tutor/vscode` (extension UI). Core handles all business logic with no VS Code dependencies. Extension imports core and provides sidebar + webview UI.

**Tech Stack:** TypeScript, pnpm workspaces, ts-morph (JS/TS parsing), tree-sitter (Python), Handlebars (prompt templating), ajv (JSON Schema validation), VS Code Extension API, esbuild (bundling).

---

## Phase 1: Project Setup

### Task 1: Initialize Monorepo

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `.prettierrc`
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/index.ts`
- Create: `packages/vscode-extension/package.json`
- Create: `packages/vscode-extension/tsconfig.json`

**Step 1: Create root package.json**

```json
{
  "name": "repo-tutor",
  "private": true,
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "lint": "pnpm -r lint",
    "clean": "pnpm -r clean"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "prettier": "^3.2.0",
    "@types/node": "^20.0.0"
  }
}
```

**Step 2: Create pnpm-workspace.yaml**

```yaml
packages:
  - 'packages/*'
```

**Step 3: Create tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

**Step 4: Create .gitignore**

```gitignore
node_modules/
dist/
*.vsix
.vscode-test/
.env
.env.*
*.log
```

**Step 5: Create packages/core/package.json**

```json
{
  "name": "@repo-tutor/core",
  "version": "0.1.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "ts-morph": "^22.0.0",
    "web-tree-sitter": "^0.22.0",
    "tree-sitter-python": "^0.21.0",
    "handlebars": "^4.7.0",
    "ajv": "^8.12.0",
    "openai": "^4.0.0",
    "@anthropic-ai/sdk": "^0.20.0"
  },
  "devDependencies": {
    "vitest": "^1.2.0",
    "@types/node": "^20.0.0",
    "typescript": "^5.3.0"
  }
}
```

**Step 6: Create packages/core/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

**Step 7: Create packages/core/src/index.ts**

```typescript
export const VERSION = '0.1.0';
```

**Step 8: Create packages/vscode-extension/package.json**

```json
{
  "name": "@repo-tutor/vscode",
  "displayName": "Repo Tutor",
  "description": "Learn unfamiliar codebases through guided chapters and quizzes",
  "version": "0.1.0",
  "publisher": "repo-tutor",
  "engines": {
    "vscode": "^1.85.0"
  },
  "categories": ["Education", "Other"],
  "activationEvents": ["onStartupFinished"],
  "main": "./dist/extension.js",
  "contributes": {
    "commands": [
      {
        "command": "repo-tutor.startLearning",
        "title": "Start Learning",
        "category": "Repo Tutor"
      }
    ],
    "viewsContainers": {
      "activitybar": [
        {
          "id": "repo-tutor",
          "title": "Repo Tutor",
          "icon": "$(book)"
        }
      ]
    },
    "views": {
      "repo-tutor": [
        {
          "id": "repo-tutor.chapters",
          "name": "Chapters"
        }
      ]
    }
  },
  "scripts": {
    "build": "esbuild src/extension.ts --bundle --outfile=dist/extension.js --external:vscode --format=cjs --platform=node",
    "watch": "pnpm build --watch",
    "package": "vsce package",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@repo-tutor/core": "workspace:*"
  },
  "devDependencies": {
    "@types/vscode": "^1.85.0",
    "esbuild": "^0.20.0",
    "typescript": "^5.3.0"
  }
}
```

**Step 9: Create packages/vscode-extension/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

**Step 10: Install dependencies**

Run: `pnpm install`
Expected: Dependencies installed successfully

**Step 11: Verify build**

Run: `pnpm build`
Expected: Both packages compile without errors

**Step 12: Commit**

```bash
git add -A
git commit -m "chore: initialize monorepo with core and vscode-extension packages"
```

---

## Phase 2: Core - Type Definitions

### Task 2: Generate TypeScript Types from JSON Schemas

**Files:**
- Create: `packages/core/src/types/index.ts`
- Create: `packages/core/src/types/analysis.ts`
- Create: `packages/core/src/types/chapter.ts`
- Create: `packages/core/src/types/quiz.ts`
- Create: `packages/core/src/types/config.ts`

**Step 1: Create analysis types**

```typescript
// packages/core/src/types/analysis.ts

export interface FileReference {
  path: string;
  reason?: string;
}

export interface DependencyGraph {
  nodes: Array<{
    path: string;
    language?: string;
    loc?: number;
  }>;
  edges: Array<{
    from: string;
    to: string;
    weight?: number;
  }>;
  layers?: string[][];
}

export interface Module {
  name: string;
  path: string;
  description?: string;
  fileCount?: number;
  importCount?: number;
  exportCount?: number;
}

export interface PatternDetection {
  pattern: string;
  confidence: 'high' | 'medium' | 'low';
  evidence?: {
    files?: string[];
    indicators?: string[];
  };
  explanation?: string;
  learnMoreUrl?: string;
}

export interface RouteInfo {
  method: string;
  path: string;
  handler?: string;
  file: string;
  line?: number;
}

export interface MiddlewareInfo {
  name: string;
  type?: string;
  scope?: string;
  file: string;
}

export interface HttpAnalysis {
  framework: 'express' | 'fastify' | 'hono' | 'koa' | 'nextjs' | 'fastapi' | 'flask' | 'django' | 'none' | 'unknown';
  routes: RouteInfo[];
  middleware: MiddlewareInfo[];
}

export interface StoreInfo {
  name: string;
  file: string;
}

export interface StateManagementAnalysis {
  type: 'redux' | 'zustand' | 'mobx' | 'context' | 'pinia' | 'vuex' | 'signals' | 'stores' | 'custom' | 'none';
  stores: StoreInfo[];
  actions: string[];
  selectors: string[];
}

export interface AnalysisResult {
  repoPath: string;
  languages: string[];
  entryPoints: FileReference[];
  dependencyGraph: DependencyGraph;
  modules: Module[];
  patterns: PatternDetection[];
  http?: HttpAnalysis;
  stateManagement?: StateManagementAnalysis;
  analyzedAt: string;
}
```

**Step 2: Create chapter types**

```typescript
// packages/core/src/types/chapter.ts

export type ChapterFocus =
  | 'structure'
  | 'entry-point'
  | 'data-flow'
  | 'module'
  | 'pattern'
  | 'bootstrap'
  | 'state-management'
  | 'http'
  | 'database'
  | 'auth'
  | 'error-handling';

export interface Chapter {
  id: string;
  title: string;
  order: number;
  focus: ChapterFocus;
  targetFiles: string[];
  prerequisites: string[];
  learningObjectives: string[];
  estimatedComplexity?: 'low' | 'medium' | 'high';
}

export interface CodeReference {
  file: string;
  startLine?: number;
  endLine?: number;
}

export interface PatternReference {
  name: string;
  description?: string;
  learnMoreUrl?: string;
}

export interface ChapterSection {
  heading: string;
  content: string;
  codeReferences?: CodeReference[];
  diagram?: string;
}

export interface ChapterContent {
  chapterId: string;
  title: string;
  sections: ChapterSection[];
  keyTakeaways: string[];
  bridgeToNext?: string;
  patternsReferenced?: PatternReference[];
  generatedAt?: string;
}

export interface EvidenceFile {
  path: string;
  language?: string;
  content: string;
  truncated?: boolean;
  relevantLines?: Array<{
    start: number;
    end: number;
    reason?: string;
  }>;
}

export interface EvidenceSymbol {
  name: string;
  kind: 'function' | 'class' | 'method' | 'variable' | 'type' | 'interface';
  file: string;
  line?: number;
  signature?: string;
}

export interface EvidenceDependency {
  from: string;
  to: string;
  reason?: string;
}

export interface EvidencePack {
  chapterId: string;
  files: EvidenceFile[];
  symbols?: EvidenceSymbol[];
  dependencies?: EvidenceDependency[];
  redactionsApplied?: string[];
  totalTokensEstimate?: number;
}
```

**Step 3: Create quiz types**

```typescript
// packages/core/src/types/quiz.ts

export type QuestionType = 'multiple-choice' | 'true-false' | 'free-text' | 'code-completion';
export type BloomLevel = 'remembering' | 'understanding' | 'applying' | 'analyzing' | 'evaluating';
export type Difficulty = 'easy' | 'medium' | 'hard';

export interface QuestionRubric {
  fullCredit: string;
  partialCredit: string;
  noCredit: string;
}

export interface Question {
  id: string;
  chapterId: string;
  type: QuestionType;
  bloomLevel: BloomLevel;
  difficulty: Difficulty;
  question: string;
  options?: string[];
  correctAnswer: string;
  keyPoints?: string[];
  rubric?: QuestionRubric;
  explanation?: string;
  relatedObjective?: string;
  relatedCode?: {
    file: string;
    lines?: number[];
  };
}

export interface Evaluation {
  questionId: string;
  userAnswer: string;
  isCorrect: boolean;
  score: number;
  keyPointsCovered?: string[];
  keyPointsMissing?: string[];
  misconceptions?: string[];
  feedback: string;
  explanation?: string;
  hints?: string[];
  encouragement?: string;
}

export interface Answer {
  answer: string;
  codeReferences?: Array<{
    file: string;
    startLine?: number;
    endLine?: number;
  }>;
  relatedChapter?: string;
  followUpSuggestion?: string;
}
```

**Step 4: Create config types**

```typescript
// packages/core/src/types/config.ts

export type SecurityPreset = 'standard' | 'cautious' | 'strict' | 'custom';
export type LLMProvider = 'openai' | 'anthropic';
export type SkillLevel = 'beginner' | 'intermediate' | 'advanced';

export interface SecurityConfig {
  preset: SecurityPreset;
  neverSend: string[];
  skipAnalysis: string[];
  confirmBeforeSend: boolean;
  maxCodeContextChars: number;
  strictMode: boolean;
}

export interface UserContext {
  preferredLanguage: string;
  skillLevel: SkillLevel;
}

export interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
}

export interface QuestionContext {
  currentChapter: import('./chapter').ChapterContent;
  currentSection?: string;
  previousChapters: string[];
  analysisResult: import('./analysis').AnalysisResult;
}
```

**Step 5: Create index export**

```typescript
// packages/core/src/types/index.ts

export * from './analysis';
export * from './chapter';
export * from './quiz';
export * from './config';
```

**Step 6: Update core index to export types**

```typescript
// packages/core/src/index.ts

export const VERSION = '0.1.0';
export * from './types';
```

**Step 7: Verify types compile**

Run: `cd packages/core && pnpm build`
Expected: Compiles without errors

**Step 8: Commit**

```bash
git add -A
git commit -m "feat(core): add TypeScript type definitions from schemas"
```

---

## Phase 3: Core - Language Plugin System

### Task 3: Create Language Plugin Interface

**Files:**
- Create: `packages/core/src/languages/plugin.ts`
- Create: `packages/core/src/languages/registry.ts`
- Create: `packages/core/src/languages/index.ts`
- Test: `packages/core/src/languages/__tests__/registry.test.ts`

**Step 1: Write failing test for registry**

```typescript
// packages/core/src/languages/__tests__/registry.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { LanguageRegistry } from '../registry';
import type { LanguagePlugin } from '../plugin';

describe('LanguageRegistry', () => {
  let registry: LanguageRegistry;

  beforeEach(() => {
    registry = new LanguageRegistry();
  });

  it('should register and retrieve a plugin by id', () => {
    const mockPlugin: LanguagePlugin = {
      id: 'test',
      extensions: ['.test'],
      parseFile: async () => ({ type: 'root', children: [] }),
      getImports: () => [],
      getExports: () => [],
      getSymbols: () => [],
    };

    registry.register(mockPlugin);
    expect(registry.get('test')).toBe(mockPlugin);
  });

  it('should find plugin by file extension', () => {
    const mockPlugin: LanguagePlugin = {
      id: 'test',
      extensions: ['.test', '.tst'],
      parseFile: async () => ({ type: 'root', children: [] }),
      getImports: () => [],
      getExports: () => [],
      getSymbols: () => [],
    };

    registry.register(mockPlugin);
    expect(registry.getByExtension('.test')).toBe(mockPlugin);
    expect(registry.getByExtension('.tst')).toBe(mockPlugin);
    expect(registry.getByExtension('.unknown')).toBeUndefined();
  });

  it('should list all registered plugins', () => {
    const plugin1: LanguagePlugin = {
      id: 'lang1',
      extensions: ['.l1'],
      parseFile: async () => ({ type: 'root', children: [] }),
      getImports: () => [],
      getExports: () => [],
      getSymbols: () => [],
    };

    const plugin2: LanguagePlugin = {
      id: 'lang2',
      extensions: ['.l2'],
      parseFile: async () => ({ type: 'root', children: [] }),
      getImports: () => [],
      getExports: () => [],
      getSymbols: () => [],
    };

    registry.register(plugin1);
    registry.register(plugin2);

    const all = registry.getAll();
    expect(all).toHaveLength(2);
    expect(all.map(p => p.id)).toContain('lang1');
    expect(all.map(p => p.id)).toContain('lang2');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm test`
Expected: FAIL - modules not found

**Step 3: Create plugin interface**

```typescript
// packages/core/src/languages/plugin.ts

export interface ASTNode {
  type: string;
  children: ASTNode[];
  text?: string;
  startPosition?: { row: number; column: number };
  endPosition?: { row: number; column: number };
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

export interface Symbol {
  name: string;
  kind: 'function' | 'class' | 'method' | 'variable' | 'type' | 'interface';
  line: number;
  column: number;
  signature?: string;
  docstring?: string;
  children?: Symbol[];
}

export interface LanguagePlugin {
  id: string;
  extensions: string[];

  parseFile(filePath: string): Promise<ASTNode>;
  getImports(ast: ASTNode): Import[];
  getExports(ast: ASTNode): Export[];
  getSymbols(ast: ASTNode): Symbol[];
}
```

**Step 4: Create registry implementation**

```typescript
// packages/core/src/languages/registry.ts

import type { LanguagePlugin } from './plugin';

export class LanguageRegistry {
  private plugins: Map<string, LanguagePlugin> = new Map();
  private extensionMap: Map<string, LanguagePlugin> = new Map();

  register(plugin: LanguagePlugin): void {
    this.plugins.set(plugin.id, plugin);
    for (const ext of plugin.extensions) {
      this.extensionMap.set(ext, plugin);
    }
  }

  get(id: string): LanguagePlugin | undefined {
    return this.plugins.get(id);
  }

  getByExtension(ext: string): LanguagePlugin | undefined {
    return this.extensionMap.get(ext);
  }

  getAll(): LanguagePlugin[] {
    return Array.from(this.plugins.values());
  }

  getSupportedExtensions(): string[] {
    return Array.from(this.extensionMap.keys());
  }
}
```

**Step 5: Create index export**

```typescript
// packages/core/src/languages/index.ts

export * from './plugin';
export * from './registry';
```

**Step 6: Run tests to verify they pass**

Run: `cd packages/core && pnpm test`
Expected: All tests pass

**Step 7: Commit**

```bash
git add -A
git commit -m "feat(core): add language plugin interface and registry"
```

---

### Task 4: Implement JavaScript/TypeScript Plugin

**Files:**
- Create: `packages/core/src/languages/javascript/index.ts`
- Create: `packages/core/src/languages/javascript/parser.ts`
- Create: `packages/core/src/languages/javascript/imports.ts`
- Create: `packages/core/src/languages/javascript/exports.ts`
- Create: `packages/core/src/languages/javascript/symbols.ts`
- Test: `packages/core/src/languages/javascript/__tests__/parser.test.ts`

**Step 1: Write failing test for JS parser**

```typescript
// packages/core/src/languages/javascript/__tests__/parser.test.ts

import { describe, it, expect } from 'vitest';
import { JavaScriptPlugin } from '../index';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('JavaScriptPlugin', () => {
  const plugin = new JavaScriptPlugin();

  it('should have correct id and extensions', () => {
    expect(plugin.id).toBe('javascript');
    expect(plugin.extensions).toContain('.js');
    expect(plugin.extensions).toContain('.ts');
    expect(plugin.extensions).toContain('.tsx');
  });

  it('should extract imports from a file', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'repo-tutor-test-'));
    const testFile = path.join(tmpDir, 'test.ts');

    await fs.writeFile(testFile, `
      import { foo } from './foo';
      import bar from 'bar';
      import * as baz from '../baz';
    `);

    const ast = await plugin.parseFile(testFile);
    const imports = plugin.getImports(ast);

    expect(imports).toHaveLength(3);
    expect(imports[0].source).toBe('./foo');
    expect(imports[0].specifiers).toContain('foo');
    expect(imports[0].isRelative).toBe(true);

    expect(imports[1].source).toBe('bar');
    expect(imports[1].isRelative).toBe(false);

    expect(imports[2].source).toBe('../baz');
    expect(imports[2].isRelative).toBe(true);

    await fs.rm(tmpDir, { recursive: true });
  });

  it('should extract symbols from a file', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'repo-tutor-test-'));
    const testFile = path.join(tmpDir, 'test.ts');

    await fs.writeFile(testFile, `
      function hello() {}

      class MyClass {
        method() {}
      }

      const myVar = 42;

      interface MyInterface {
        prop: string;
      }
    `);

    const ast = await plugin.parseFile(testFile);
    const symbols = plugin.getSymbols(ast);

    const names = symbols.map(s => s.name);
    expect(names).toContain('hello');
    expect(names).toContain('MyClass');
    expect(names).toContain('myVar');
    expect(names).toContain('MyInterface');

    await fs.rm(tmpDir, { recursive: true });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm test`
Expected: FAIL - JavaScriptPlugin not found

**Step 3: Implement JavaScript plugin**

```typescript
// packages/core/src/languages/javascript/index.ts

import { Project, SourceFile, SyntaxKind, Node } from 'ts-morph';
import type { LanguagePlugin, ASTNode, Import, Export, Symbol } from '../plugin';

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
    return this.convertToASTNode(sourceFile);
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

  getImports(ast: ASTNode): Import[] {
    // Re-parse from the source file stored in project
    const sourceFiles = this.project.getSourceFiles();
    if (sourceFiles.length === 0) return [];

    const sourceFile = sourceFiles[sourceFiles.length - 1];
    const imports: Import[] = [];

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

    return imports;
  }

  getExports(ast: ASTNode): Export[] {
    const sourceFiles = this.project.getSourceFiles();
    if (sourceFiles.length === 0) return [];

    const sourceFile = sourceFiles[sourceFiles.length - 1];
    const exports: Export[] = [];

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
      if (stmt.hasExportKeyword?.()) {
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
        }
      }
    }

    return exports;
  }

  getSymbols(ast: ASTNode): Symbol[] {
    const sourceFiles = this.project.getSourceFiles();
    if (sourceFiles.length === 0) return [];

    const sourceFile = sourceFiles[sourceFiles.length - 1];
    return this.extractSymbols(sourceFile);
  }

  private extractSymbols(sourceFile: SourceFile): Symbol[] {
    const symbols: Symbol[] = [];

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
        const children: Symbol[] = [];

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
```

**Step 4: Update languages index to export JS plugin**

```typescript
// packages/core/src/languages/index.ts

export * from './plugin';
export * from './registry';
export { JavaScriptPlugin } from './javascript';
```

**Step 5: Run tests to verify they pass**

Run: `cd packages/core && pnpm test`
Expected: All tests pass

**Step 6: Commit**

```bash
git add -A
git commit -m "feat(core): implement JavaScript/TypeScript language plugin"
```

---

## Phase 4: Core - Analysis Pipeline

### Task 5: Create Analyzer Core

**Files:**
- Create: `packages/core/src/analysis/analyzer.ts`
- Create: `packages/core/src/analysis/dependency-graph.ts`
- Create: `packages/core/src/analysis/entry-points.ts`
- Create: `packages/core/src/analysis/index.ts`
- Test: `packages/core/src/analysis/__tests__/analyzer.test.ts`

**Step 1: Write failing test for analyzer**

```typescript
// packages/core/src/analysis/__tests__/analyzer.test.ts

import { describe, it, expect } from 'vitest';
import { Analyzer } from '../analyzer';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('Analyzer', () => {
  it('should analyze a simple TypeScript project', async () => {
    // Create temp project
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'repo-tutor-test-'));

    await fs.writeFile(path.join(tmpDir, 'index.ts'), `
      import { helper } from './utils';
      export function main() {
        return helper();
      }
    `);

    await fs.writeFile(path.join(tmpDir, 'utils.ts'), `
      export function helper() {
        return 'hello';
      }
    `);

    await fs.writeFile(path.join(tmpDir, 'package.json'), JSON.stringify({
      name: 'test-project',
      main: 'index.ts'
    }));

    const analyzer = new Analyzer();
    const result = await analyzer.analyze(tmpDir, {
      preset: 'standard',
      neverSend: [],
      skipAnalysis: ['node_modules'],
      confirmBeforeSend: false,
      maxCodeContextChars: 25000,
      strictMode: false,
    });

    expect(result.repoPath).toBe(tmpDir);
    expect(result.languages).toContain('javascript');
    expect(result.entryPoints.length).toBeGreaterThan(0);
    expect(result.dependencyGraph.nodes.length).toBe(2);
    expect(result.dependencyGraph.edges.length).toBe(1);

    await fs.rm(tmpDir, { recursive: true });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm test`
Expected: FAIL - Analyzer not found

**Step 3: Implement dependency graph builder**

```typescript
// packages/core/src/analysis/dependency-graph.ts

import type { DependencyGraph } from '../types';
import type { Import } from '../languages/plugin';
import * as path from 'path';

export interface FileImports {
  filePath: string;
  imports: Import[];
}

export function buildDependencyGraph(
  repoPath: string,
  fileImports: FileImports[]
): DependencyGraph {
  const nodes = fileImports.map(f => ({
    path: path.relative(repoPath, f.filePath),
    language: getLanguageFromPath(f.filePath),
  }));

  const nodeSet = new Set(nodes.map(n => n.path));
  const edges: DependencyGraph['edges'] = [];

  for (const { filePath, imports } of fileImports) {
    const fromPath = path.relative(repoPath, filePath);

    for (const imp of imports) {
      if (!imp.isRelative) continue;

      const resolvedPath = resolveImport(filePath, imp.source, repoPath);
      if (resolvedPath && nodeSet.has(resolvedPath)) {
        edges.push({
          from: fromPath,
          to: resolvedPath,
          weight: imp.specifiers.length,
        });
      }
    }
  }

  const layers = computeLayers(nodes.map(n => n.path), edges);

  return { nodes, edges, layers };
}

function getLanguageFromPath(filePath: string): string {
  const ext = path.extname(filePath);
  if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts'].includes(ext)) {
    return 'javascript';
  }
  if (ext === '.py') return 'python';
  return 'unknown';
}

function resolveImport(fromFile: string, importSource: string, repoPath: string): string | null {
  const fromDir = path.dirname(fromFile);
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js'];

  for (const ext of extensions) {
    const candidate = path.join(fromDir, importSource + ext);
    const relative = path.relative(repoPath, candidate);
    // Simplified - in real impl would check file exists
    if (!relative.startsWith('..')) {
      return relative;
    }
  }

  return path.relative(repoPath, path.join(fromDir, importSource + '.ts'));
}

function computeLayers(nodes: string[], edges: DependencyGraph['edges']): string[][] {
  const inDegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();

  for (const node of nodes) {
    inDegree.set(node, 0);
    outgoing.set(node, []);
  }

  for (const edge of edges) {
    inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
    outgoing.get(edge.from)?.push(edge.to);
  }

  const layers: string[][] = [];
  const remaining = new Set(nodes);

  while (remaining.size > 0) {
    const layer = Array.from(remaining).filter(n => inDegree.get(n) === 0);
    if (layer.length === 0) {
      // Cycle detected, just add remaining
      layers.push(Array.from(remaining));
      break;
    }

    layers.push(layer);
    for (const node of layer) {
      remaining.delete(node);
      for (const target of outgoing.get(node) || []) {
        inDegree.set(target, (inDegree.get(target) || 0) - 1);
      }
    }
  }

  return layers;
}
```

**Step 4: Implement entry point detection**

```typescript
// packages/core/src/analysis/entry-points.ts

import type { FileReference } from '../types';
import * as fs from 'fs/promises';
import * as path from 'path';

export async function detectEntryPoints(repoPath: string): Promise<FileReference[]> {
  const entryPoints: FileReference[] = [];

  // Check package.json
  try {
    const pkgPath = path.join(repoPath, 'package.json');
    const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));

    if (pkg.main) {
      entryPoints.push({ path: pkg.main, reason: 'package.json main' });
    }
    if (pkg.module) {
      entryPoints.push({ path: pkg.module, reason: 'package.json module' });
    }
    if (typeof pkg.bin === 'string') {
      entryPoints.push({ path: pkg.bin, reason: 'package.json bin' });
    } else if (typeof pkg.bin === 'object') {
      for (const [name, binPath] of Object.entries(pkg.bin)) {
        entryPoints.push({ path: binPath as string, reason: `package.json bin.${name}` });
      }
    }
  } catch {
    // No package.json
  }

  // Check common entry file names
  const commonEntries = [
    'index.ts', 'index.js', 'main.ts', 'main.js',
    'app.ts', 'app.js', 'server.ts', 'server.js',
    'src/index.ts', 'src/index.js', 'src/main.ts', 'src/main.js',
  ];

  for (const entry of commonEntries) {
    try {
      await fs.access(path.join(repoPath, entry));
      if (!entryPoints.some(e => e.path === entry)) {
        entryPoints.push({ path: entry, reason: 'common entry filename' });
      }
    } catch {
      // File doesn't exist
    }
  }

  return entryPoints;
}
```

**Step 5: Implement main analyzer**

```typescript
// packages/core/src/analysis/analyzer.ts

import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import type { AnalysisResult, SecurityConfig } from '../types';
import { LanguageRegistry, JavaScriptPlugin } from '../languages';
import { buildDependencyGraph, type FileImports } from './dependency-graph';
import { detectEntryPoints } from './entry-points';

export class Analyzer {
  private registry: LanguageRegistry;

  constructor() {
    this.registry = new LanguageRegistry();
    this.registry.register(new JavaScriptPlugin());
  }

  async analyze(repoPath: string, config: SecurityConfig): Promise<AnalysisResult> {
    const absolutePath = path.resolve(repoPath);

    // Find all source files
    const extensions = this.registry.getSupportedExtensions();
    const pattern = `**/*{${extensions.join(',')}}`;

    const skipPatterns = [
      'node_modules/**',
      ...config.skipAnalysis.map(p => p.endsWith('/') ? p + '**' : p),
    ];

    const files = await glob(pattern, {
      cwd: absolutePath,
      ignore: skipPatterns,
      nodir: true,
    });

    // Parse all files and collect imports
    const fileImports: FileImports[] = [];
    const languages = new Set<string>();

    for (const file of files) {
      const ext = path.extname(file);
      const plugin = this.registry.getByExtension(ext);

      if (!plugin) continue;

      languages.add(plugin.id);

      try {
        const fullPath = path.join(absolutePath, file);
        const ast = await plugin.parseFile(fullPath);
        const imports = plugin.getImports(ast);

        fileImports.push({ filePath: fullPath, imports });
      } catch (error) {
        console.warn(`Failed to parse ${file}:`, error);
      }
    }

    // Build dependency graph
    const dependencyGraph = buildDependencyGraph(absolutePath, fileImports);

    // Detect entry points
    const entryPoints = await detectEntryPoints(absolutePath);

    // Detect modules (simplified - group by top-level directory)
    const modules = this.detectModules(files);

    return {
      repoPath: absolutePath,
      languages: Array.from(languages),
      entryPoints,
      dependencyGraph,
      modules,
      patterns: [],
      analyzedAt: new Date().toISOString(),
    };
  }

  private detectModules(files: string[]) {
    const moduleDirs = new Map<string, number>();

    for (const file of files) {
      const parts = file.split(path.sep);
      if (parts.length > 1) {
        const dir = parts[0];
        moduleDirs.set(dir, (moduleDirs.get(dir) || 0) + 1);
      }
    }

    return Array.from(moduleDirs.entries())
      .filter(([, count]) => count >= 2)
      .map(([name, fileCount]) => ({
        name,
        path: name,
        fileCount,
      }));
  }
}
```

**Step 6: Create analysis index**

```typescript
// packages/core/src/analysis/index.ts

export { Analyzer } from './analyzer';
export { buildDependencyGraph } from './dependency-graph';
export { detectEntryPoints } from './entry-points';
```

**Step 7: Add glob dependency**

Run: `cd packages/core && pnpm add glob`

**Step 8: Run tests to verify they pass**

Run: `cd packages/core && pnpm test`
Expected: All tests pass

**Step 9: Commit**

```bash
git add -A
git commit -m "feat(core): implement analysis pipeline with dependency graph"
```

---

## Phase 5: Core - LLM Integration

### Task 6: Create LLM Client

**Files:**
- Create: `packages/core/src/generation/llm-client.ts`
- Create: `packages/core/src/generation/prompt-loader.ts`
- Create: `packages/core/src/generation/index.ts`
- Test: `packages/core/src/generation/__tests__/prompt-loader.test.ts`

**Step 1: Write failing test for prompt loader**

```typescript
// packages/core/src/generation/__tests__/prompt-loader.test.ts

import { describe, it, expect } from 'vitest';
import { PromptLoader } from '../prompt-loader';
import * as path from 'path';

describe('PromptLoader', () => {
  const specsDir = path.resolve(__dirname, '../../../../../spec/prompts');

  it('should load and compile a prompt template', () => {
    const loader = new PromptLoader(specsDir);

    const prompt = loader.load('planner', {
      userPreferredLanguage: 'Python',
      skillLevel: 'intermediate',
      languages: ['javascript', 'typescript'],
      entryPoints: [{ path: 'src/index.ts', reason: 'main' }],
      patterns: [],
      http: { framework: 'express' },
      stateManagement: { type: 'none' },
      modules: [{ name: 'src', description: 'Source code', fileCount: 10, importCount: 5 }],
      dependencyLayers: 'Layer 1: index.ts\nLayer 2: utils.ts',
    });

    expect(prompt).toContain('Python');
    expect(prompt).toContain('intermediate');
    expect(prompt).toContain('express');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm test`
Expected: FAIL - PromptLoader not found

**Step 3: Implement prompt loader**

```typescript
// packages/core/src/generation/prompt-loader.ts

import Handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';

export class PromptLoader {
  private cache: Map<string, HandlebarsTemplateDelegate> = new Map();
  private promptsDir: string;

  constructor(promptsDir: string) {
    this.promptsDir = promptsDir;
    this.registerHelpers();
  }

  private registerHelpers(): void {
    Handlebars.registerHelper('json', (context) => {
      return JSON.stringify(context, null, 2);
    });
  }

  load(name: string, variables: Record<string, unknown>): string {
    let template = this.cache.get(name);

    if (!template) {
      const filePath = path.join(this.promptsDir, `${name}.md`);
      const content = fs.readFileSync(filePath, 'utf-8');
      template = Handlebars.compile(content);
      this.cache.set(name, template);
    }

    return template(variables);
  }

  clearCache(): void {
    this.cache.clear();
  }
}
```

**Step 4: Implement LLM client**

```typescript
// packages/core/src/generation/llm-client.ts

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import type { LLMConfig } from '../types';

export interface LLMResponse {
  content: string;
  tokensUsed: number;
}

export class LLMClient {
  private config: LLMConfig | null = null;
  private openai: OpenAI | null = null;
  private anthropic: Anthropic | null = null;

  setConfig(config: LLMConfig): void {
    this.config = config;

    if (config.provider === 'openai') {
      this.openai = new OpenAI({ apiKey: config.apiKey });
    } else if (config.provider === 'anthropic') {
      this.anthropic = new Anthropic({ apiKey: config.apiKey });
    }
  }

  async complete(prompt: string, systemPrompt?: string): Promise<LLMResponse> {
    if (!this.config) {
      throw new Error('LLM config not set');
    }

    if (this.config.provider === 'openai') {
      return this.completeOpenAI(prompt, systemPrompt);
    } else if (this.config.provider === 'anthropic') {
      return this.completeAnthropic(prompt, systemPrompt);
    }

    throw new Error(`Unknown provider: ${this.config.provider}`);
  }

  private async completeOpenAI(prompt: string, systemPrompt?: string): Promise<LLMResponse> {
    if (!this.openai || !this.config) throw new Error('OpenAI not configured');

    const messages: OpenAI.ChatCompletionMessageParam[] = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await this.openai.chat.completions.create({
      model: this.config.model,
      messages,
      max_tokens: this.config.maxTokens || 4096,
      temperature: this.config.temperature || 0.7,
    });

    return {
      content: response.choices[0]?.message?.content || '',
      tokensUsed: response.usage?.total_tokens || 0,
    };
  }

  private async completeAnthropic(prompt: string, systemPrompt?: string): Promise<LLMResponse> {
    if (!this.anthropic || !this.config) throw new Error('Anthropic not configured');

    const response = await this.anthropic.messages.create({
      model: this.config.model,
      max_tokens: this.config.maxTokens || 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
    });

    const textContent = response.content.find(c => c.type === 'text');

    return {
      content: textContent?.text || '',
      tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
    };
  }

  async validateApiKey(): Promise<boolean> {
    try {
      await this.complete('Say "ok"');
      return true;
    } catch {
      return false;
    }
  }
}
```

**Step 5: Create generation index**

```typescript
// packages/core/src/generation/index.ts

export { LLMClient, type LLMResponse } from './llm-client';
export { PromptLoader } from './prompt-loader';
```

**Step 6: Run tests to verify they pass**

Run: `cd packages/core && pnpm test`
Expected: All tests pass

**Step 7: Commit**

```bash
git add -A
git commit -m "feat(core): add LLM client and prompt loader"
```

---

## Phase 6: Core - Chapter Planning & Generation

### Task 7: Implement Chapter Planner

**Files:**
- Create: `packages/core/src/generation/planner.ts`
- Create: `packages/core/src/generation/chapter-writer.ts`
- Create: `packages/core/src/generation/evidence-builder.ts`
- Test: `packages/core/src/generation/__tests__/planner.test.ts`

*(Due to length, this task outlines the structure - full implementation follows the same TDD pattern)*

**Key components:**

1. **Planner**: Takes AnalysisResult → generates Chapter[] via LLM
2. **EvidenceBuilder**: Creates EvidencePack from Chapter + AnalysisResult
3. **ChapterWriter**: Takes EvidencePack → generates ChapterContent via LLM

**Step 1-8**: Follow same TDD pattern as previous tasks

**Commit message**: `feat(core): implement chapter planner and content generator`

---

## Phase 7: Core - Quiz Engine

### Task 8: Implement Quiz Generator and Evaluator

**Files:**
- Create: `packages/core/src/quiz/generator.ts`
- Create: `packages/core/src/quiz/evaluator.ts`
- Create: `packages/core/src/quiz/index.ts`
- Test: `packages/core/src/quiz/__tests__/evaluator.test.ts`

*(Structure outline - follows same TDD pattern)*

**Key components:**

1. **QuizGenerator**: Takes ChapterContent → generates Question[] via LLM
2. **Evaluator**: Takes Question + answer → generates Evaluation via LLM
3. **Schema validation** using ajv for all LLM responses

**Commit message**: `feat(core): implement quiz generator and evaluator`

---

## Phase 8: Core - Privacy Module

### Task 9: Implement Secret Redaction

**Files:**
- Create: `packages/core/src/privacy/redactor.ts`
- Create: `packages/core/src/privacy/scanner.ts`
- Create: `packages/core/src/privacy/index.ts`
- Test: `packages/core/src/privacy/__tests__/redactor.test.ts`

**Step 1: Write failing test**

```typescript
// packages/core/src/privacy/__tests__/redactor.test.ts

import { describe, it, expect } from 'vitest';
import { Redactor } from '../redactor';

describe('Redactor', () => {
  const redactor = new Redactor();

  it('should redact environment variable assignments', () => {
    const input = `const API_KEY = "sk-abc123xyz";`;
    const { redacted, redactions } = redactor.redact(input);

    expect(redacted).toContain('[REDACTED]');
    expect(redacted).not.toContain('sk-abc123xyz');
    expect(redactions.length).toBeGreaterThan(0);
  });

  it('should redact AWS access keys', () => {
    const input = `aws_key = "AKIAIOSFODNN7EXAMPLE"`;
    const { redacted } = redactor.redact(input);

    expect(redacted).toContain('[REDACTED_AWS_KEY]');
  });

  it('should redact connection strings', () => {
    const input = `DATABASE_URL=postgres://user:pass@localhost:5432/db`;
    const { redacted } = redactor.redact(input);

    expect(redacted).toContain('[REDACTED_CONNECTION_STRING]');
  });

  it('should not redact normal code', () => {
    const input = `function hello() { return "world"; }`;
    const { redacted, redactions } = redactor.redact(input);

    expect(redacted).toBe(input);
    expect(redactions).toHaveLength(0);
  });
});
```

**Step 2-6**: Implement Redactor class with regex patterns from design doc

**Commit message**: `feat(core): implement secret redaction and privacy scanning`

---

## Phase 9: Core - Public API

### Task 10: Create Core Public API

**Files:**
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/src/core.ts`
- Test: `packages/core/src/__tests__/core.test.ts`

**Step 1: Create main Core class**

```typescript
// packages/core/src/core.ts

import type {
  AnalysisResult, Chapter, ChapterContent, Question, Evaluation,
  Answer, SecurityConfig, UserContext, LLMConfig, QuestionContext
} from './types';
import { Analyzer } from './analysis';
import { LLMClient, PromptLoader } from './generation';
import { Planner } from './generation/planner';
import { ChapterWriter } from './generation/chapter-writer';
import { QuizGenerator } from './quiz/generator';
import { QuizEvaluator } from './quiz/evaluator';
import * as path from 'path';

export class RepoTutorCore {
  private analyzer: Analyzer;
  private llmClient: LLMClient;
  private promptLoader: PromptLoader;
  private planner: Planner;
  private chapterWriter: ChapterWriter;
  private quizGenerator: QuizGenerator;
  private quizEvaluator: QuizEvaluator;

  constructor() {
    const specsDir = path.resolve(__dirname, '../../spec/prompts');

    this.analyzer = new Analyzer();
    this.llmClient = new LLMClient();
    this.promptLoader = new PromptLoader(specsDir);
    this.planner = new Planner(this.llmClient, this.promptLoader);
    this.chapterWriter = new ChapterWriter(this.llmClient, this.promptLoader);
    this.quizGenerator = new QuizGenerator(this.llmClient, this.promptLoader);
    this.quizEvaluator = new QuizEvaluator(this.llmClient, this.promptLoader);
  }

  setLLMConfig(config: LLMConfig): void {
    this.llmClient.setConfig(config);
  }

  async validateApiKey(): Promise<boolean> {
    return this.llmClient.validateApiKey();
  }

  async analyze(repoPath: string, config: SecurityConfig): Promise<AnalysisResult> {
    return this.analyzer.analyze(repoPath, config);
  }

  async planChapters(analysis: AnalysisResult, userContext: UserContext): Promise<Chapter[]> {
    return this.planner.plan(analysis, userContext);
  }

  async generateChapter(chapter: Chapter, analysis: AnalysisResult, userContext: UserContext): Promise<ChapterContent> {
    return this.chapterWriter.generate(chapter, analysis, userContext);
  }

  async generateQuiz(chapter: ChapterContent): Promise<Question[]> {
    return this.quizGenerator.generate(chapter);
  }

  async evaluateAnswer(question: Question, userAnswer: string): Promise<Evaluation> {
    return this.quizEvaluator.evaluate(question, userAnswer);
  }

  async answerQuestion(question: string, context: QuestionContext): Promise<Answer> {
    // Implement question answering
    throw new Error('Not implemented');
  }
}
```

**Step 2: Update main index**

```typescript
// packages/core/src/index.ts

export const VERSION = '0.1.0';
export * from './types';
export { RepoTutorCore } from './core';
export { Analyzer } from './analysis';
export { LLMClient, PromptLoader } from './generation';
```

**Commit message**: `feat(core): expose public API`

---

## Phase 10: VS Code Extension

### Task 11: Create Extension Entry Point

**Files:**
- Create: `packages/vscode-extension/src/extension.ts`
- Create: `packages/vscode-extension/src/commands/startLearning.ts`

**Step 1: Create extension entry point**

```typescript
// packages/vscode-extension/src/extension.ts

import * as vscode from 'vscode';
import { startLearningCommand } from './commands/startLearning';

export function activate(context: vscode.ExtensionContext) {
  console.log('Repo Tutor is now active');

  const startLearning = vscode.commands.registerCommand(
    'repo-tutor.startLearning',
    () => startLearningCommand(context)
  );

  context.subscriptions.push(startLearning);
}

export function deactivate() {}
```

**Step 2: Create start learning command**

```typescript
// packages/vscode-extension/src/commands/startLearning.ts

import * as vscode from 'vscode';

export async function startLearningCommand(context: vscode.ExtensionContext) {
  const workspaceFolders = vscode.workspace.workspaceFolders;

  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showErrorMessage('Please open a folder to start learning');
    return;
  }

  const repoPath = workspaceFolders[0].uri.fsPath;

  vscode.window.showInformationMessage(`Starting Repo Tutor for: ${repoPath}`);

  // TODO: Show security config wizard
  // TODO: Run analysis
  // TODO: Open webview
}
```

**Step 3: Build and test extension**

Run: `cd packages/vscode-extension && pnpm build`
Expected: Builds successfully

**Commit message**: `feat(vscode): add extension entry point and start learning command`

---

### Task 12-15: Implement Remaining Extension Components

*(Outline - follows same pattern)*

- **Task 12**: Security Config Wizard (webview form)
- **Task 13**: Chapter Sidebar Tree View
- **Task 14**: Main Learning Webview Panel
- **Task 15**: Settings and API Key Storage

---

## Phase 11: Integration Testing

### Task 16: End-to-End Test

**Files:**
- Create: `packages/core/src/__tests__/e2e.test.ts`

Test the full flow: analyze → plan → generate → quiz → evaluate

---

## Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1 | 1 | Project setup (monorepo, packages) |
| 2 | 2 | Type definitions from schemas |
| 3 | 3-4 | Language plugin system + JS/TS plugin |
| 4 | 5 | Analysis pipeline |
| 5 | 6 | LLM client + prompt loader |
| 6 | 7 | Chapter planning & generation |
| 7 | 8 | Quiz engine |
| 8 | 9 | Privacy/redaction |
| 9 | 10 | Core public API |
| 10 | 11-15 | VS Code extension |
| 11 | 16 | Integration testing |

**Total estimated tasks**: 16 major tasks, ~80 individual steps
