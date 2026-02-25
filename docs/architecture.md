# Repo Tutor — Architecture

## Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    VS Code Extension                         │
│  ┌─────────────┐  ┌─────────────────────────────────────┐   │
│  │  Sidebar    │  │           Webview Panel             │   │
│  │  (chapters) │  │  (content, diagrams, quizzes, Q&A)  │   │
│  └─────────────┘  └─────────────────────────────────────┘   │
│                              │                               │
│                    imports   │                               │
│                              ▼                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                 @repo-tutor/core                       │  │
│  │                                                        │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │  │
│  │  │ Analysis │ │Generation│ │ Languages│ │   Quiz   │  │  │
│  │  │ Pipeline │ │ (LLM)    │ │ (plugins)│ │ Engine   │  │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                   User's LLM Provider
                   (OpenAI / Anthropic)
```

## Design Decision: Extension + Core Library

We chose a monorepo with two packages:

1. **@repo-tutor/core** — Pure TypeScript library
   - Analysis pipeline (AST parsing, dependency graph)
   - LLM orchestration (prompts, validation)
   - Language plugins (JS/TS, Python)
   - Quiz generation and evaluation
   - No VS Code dependencies

2. **@repo-tutor/vscode** — VS Code Extension
   - UI components (sidebar, webview)
   - VS Code API integration
   - Settings and secure storage
   - Imports and bundles core

**Why this approach:**
- Core is testable without VS Code runtime
- Core can be reused for future CLI or web versions
- Clear separation of concerns
- Spec files (schemas, prompts) live alongside core

## Project Structure

```
repo-tutor/
├── docs/
│   ├── prd.md                    # Product requirements
│   ├── architecture.md           # This file
│   └── privacy.md                # Privacy documentation
│
├── packages/
│   ├── core/                     # @repo-tutor/core
│   │   ├── src/
│   │   │   ├── analysis/         # Static analysis pipeline
│   │   │   │   ├── analyzer.ts
│   │   │   │   ├── dependency-graph.ts
│   │   │   │   ├── call-graph.ts
│   │   │   │   ├── entry-points.ts
│   │   │   │   └── structure.ts
│   │   │   ├── generation/       # LLM orchestration
│   │   │   │   ├── planner.ts
│   │   │   │   ├── chapter-writer.ts
│   │   │   │   ├── llm-client.ts
│   │   │   │   └── prompt-loader.ts
│   │   │   ├── languages/        # Language plugin system
│   │   │   │   ├── plugin.ts
│   │   │   │   ├── registry.ts
│   │   │   │   ├── javascript/
│   │   │   │   └── python/
│   │   │   ├── quiz/             # Quiz engine
│   │   │   │   ├── generator.ts
│   │   │   │   └── evaluator.ts
│   │   │   ├── privacy/          # Privacy/redaction
│   │   │   │   ├── scanner.ts
│   │   │   │   ├── redactor.ts
│   │   │   │   └── evidence-builder.ts
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── vscode-extension/         # @repo-tutor/vscode
│       ├── src/
│       │   ├── extension.ts
│       │   ├── commands/
│       │   ├── sidebar/
│       │   ├── webview/
│       │   └── settings/
│       ├── package.json
│       └── tsconfig.json
│
├── spec/
│   ├── schemas/                  # JSON Schema definitions
│   ├── prompts/                  # LLM prompt templates
│   ├── contracts/                # Interface contracts
│   └── guidelines/               # Pedagogical guidelines
│
├── package.json                  # Workspace root
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## Core Library Architecture

### Analysis Pipeline

```
                          ┌─────────────────────────────────┐
                          │         analyzeRepository()      │
                          └───────────────┬─────────────────┘
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    ▼                     ▼                     ▼
            ┌───────────────┐     ┌───────────────┐     ┌───────────────┐
            │  Detect Files │     │  Detect Files │     │    (other)    │
            │   *.js/*.ts   │     │     *.py      │     │   languages   │
            └───────┬───────┘     └───────┬───────┘     └───────────────┘
                    │                     │
                    ▼                     ▼
            ┌───────────────┐     ┌───────────────┐
            │   ts-morph    │     │  tree-sitter  │
            │  parse files  │     │  parse files  │
            └───────┬───────┘     └───────┬───────┘
                    │                     │
                    └──────────┬──────────┘
                               ▼
                    ┌─────────────────────┐
                    │   Merge Results     │
                    │  (AnalysisResult)   │
                    └───────────┬─────────┘
                                │
          ┌─────────────────────┼─────────────────────┐
          ▼                     ▼                     ▼
   ┌─────────────┐      ┌─────────────┐      ┌─────────────┐
   │   Build     │      │   Detect    │      │   Detect    │
   │ Dependency  │      │   Entry     │      │   Patterns  │
   │   Graph     │      │   Points    │      │  (MVC, etc) │
   └─────────────┘      └─────────────┘      └─────────────┘
```

### Key Interfaces

```typescript
// Language Plugin Interface
interface LanguagePlugin {
  id: string;                          // "javascript" | "python"
  extensions: string[];                // [".js", ".ts", ".tsx", ...]

  parseFile(path: string): Promise<AST>;
  getImports(ast: AST): Import[];
  getExports(ast: AST): Export[];
  getSymbols(ast: AST): Symbol[];
}

// Core Public API
interface RepoTutorCore {
  analyze(repoPath: string, config: SecurityConfig): Promise<AnalysisResult>;
  planChapters(analysis: AnalysisResult, userContext: UserContext): Promise<Chapter[]>;
  generateChapter(chapter: Chapter, evidence: EvidencePack): Promise<ChapterContent>;
  generateQuiz(chapter: ChapterContent): Promise<Question[]>;
  evaluateAnswer(question: Question, answer: string): Promise<Evaluation>;
  answerQuestion(question: string, context: ChapterContext): Promise<Answer>;
}
```

### Data Extraction

Per-file analysis extracts:

```typescript
interface FileAnalysis {
  path: string;
  language: string;

  // Structure
  symbols: Symbol[];           // functions, classes, variables, types
  imports: Import[];           // what this file depends on
  exports: Export[];           // what this file exposes

  // Relationships
  calls: CallSite[];           // function/method invocations
  references: Reference[];     // variable/type usages

  // Metadata
  loc: number;                 // lines of code
  complexity: number;          // cyclomatic complexity estimate
}
```

### Pattern Detection

Detects common patterns:

- **HTTP Frameworks**: Express, Fastify, Hono, Next.js, FastAPI, Flask, Django
- **State Management**: Redux, Zustand, MobX, Context, Pinia, Vuex, Signals
- **Architectural Patterns**: MVC, Layered, Microservices, Event-Driven
- **Design Patterns**: Repository, Factory, Singleton, Observer, Middleware

## VS Code Extension Architecture

### Components

```
vscode-extension/src/
├── extension.ts              # activate(), deactivate()
├── commands/                 # Command handlers
├── sidebar/                  # Chapter tree view
│   ├── ChapterTreeProvider.ts
│   └── ProgressTracker.ts
├── webview/                  # Main learning panel
│   ├── WebviewProvider.ts
│   ├── MessageHandler.ts
│   └── panel/                # Webview frontend
├── settings/                 # Configuration
│   ├── configuration.ts
│   └── ApiKeyManager.ts
└── state/                    # Session management
    ├── SessionState.ts
    └── StorageManager.ts
```

### Extension ↔ Webview Communication

```typescript
// Extension → Webview
type ExtensionMessage =
  | { type: 'chapter:loaded'; chapter: ChapterContent }
  | { type: 'quiz:loaded'; questions: Question[] }
  | { type: 'answer:evaluated'; evaluation: Evaluation }
  | { type: 'question:answered'; response: Answer }

// Webview → Extension
type WebviewMessage =
  | { type: 'chapter:request'; chapterId: string }
  | { type: 'quiz:submit'; questionId: string; answer: string }
  | { type: 'question:ask'; question: string }
  | { type: 'navigate'; chapterId: string }
```

## LLM Integration

### Prompt Flow

1. **Planning**: Analysis summary → `planner.md` → Chapter[]
2. **Content**: EvidencePack → `chapter-writer.md` → ChapterContent
3. **Quiz**: ChapterContent → `quiz-generator.md` → Question[]
4. **Evaluation**: Question + Answer → `evaluator.md` → Evaluation
5. **Q&A**: Question + Context → `question-answerer.md` → Answer

### Context Management

- **Planner**: ~2-5KB (analysis summary only, no code)
- **Chapter**: ~15-25KB (curated EvidencePack)
- **Quiz/Eval**: Chapter context + user input

### Validation

All LLM outputs are validated against JSON schemas before use. Invalid responses trigger retry with error feedback (max 2 retries).

## Data Flow

See the full data flow diagrams in the design document. Key phases:

1. **Start Learning**: Security config → Analysis → Plan chapters
2. **Read Chapter**: Build EvidencePack → Generate content → Render
3. **Take Quiz**: Generate questions → Evaluate answers → Show results
4. **Ask Question**: Build context → Generate answer → Display inline

## Security Architecture

See `docs/privacy.md` for full details. Key points:

- Upfront security configuration wizard
- Automatic secret redaction (cannot be disabled)
- EvidencePack limits what code is sent
- Transparency logging
- Optional confirmation mode
