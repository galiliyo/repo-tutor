# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Repo Tutor is a VS Code extension that helps developers understand unfamiliar codebases through guided, chapter-based learning with quizzes. It uses local AST analysis + LLM orchestration to generate content, adapting explanations to the user's preferred programming language.

## Commands

```bash
# Install dependencies (pnpm monorepo)
pnpm install

# Build all packages
pnpm build

# Run all tests
pnpm test

# Build/test a single package
pnpm --filter @repo-tutor/core build
pnpm --filter @repo-tutor/core test
pnpm --filter @repo-tutor/core test:watch

# Build the VS Code extension (uses esbuild, not tsc)
pnpm --filter @repo-tutor/vscode build

# Package the extension for distribution
pnpm --filter @repo-tutor/vscode package
```

## Architecture

**Monorepo with two packages** (`packages/*` via pnpm workspaces):

- **`@repo-tutor/core`** — Pure TypeScript library, no VS Code dependencies. Contains all analysis, LLM orchestration, quiz logic. Testable standalone. Entry point: `packages/core/src/index.ts`.
- **`@repo-tutor/vscode`** — VS Code extension that imports and bundles core. Handles UI (sidebar tree view, webview panel), settings, secure API key storage. Bundled with esbuild.

This split enables future CLI/web consumers of the core library.

### Core Library Subsystems (planned, not yet implemented)

The `packages/core/src/` directory is organized into these subsystems:

- **`analysis/`** — Static analysis pipeline: AST parsing, dependency graph, call graph, entry point detection, structure analysis. Uses `ts-morph` for JS/TS and `web-tree-sitter` for Python.
- **`generation/`** — LLM orchestration: chapter planning, content writing, prompt loading via Handlebars templates.
- **`languages/`** — Plugin system for language-specific parsing. Each language plugin implements `LanguagePlugin` interface (parseFile, getImports, getExports, getSymbols).
- **`quiz/`** — Quiz generation and answer evaluation, aligned with Bloom's Taxonomy cognitive levels.
- **`privacy/`** — Secret scanning, automatic redaction, EvidencePack construction limiting what code is sent to LLMs.

### LLM Prompt Flow

Each LLM interaction has a corresponding prompt template in `spec/prompts/` and a JSON schema in `spec/schemas/`:

1. **Planning**: AnalysisResult summary → `planner.md` → Chapter[]
2. **Content**: EvidencePack → `chapter-writer.md` → ChapterContent
3. **Quiz**: ChapterContent → `quiz-generator.md` → Question[]
4. **Evaluation**: Question + Answer → `evaluator.md` → Evaluation
5. **Q&A**: Question + Context → `question-answerer.md` → Answer

All LLM outputs are validated against JSON schemas (`spec/schemas/`). Invalid responses trigger retry with error feedback (max 2 retries).

### Extension ↔ Webview Communication

The extension and webview panel communicate via typed messages defined in `spec/contracts/core-extension.md`. Extension sends `ExtensionToWebviewMessage`, webview sends `WebviewToExtensionMessage`.

## Key Files and Specs

- **`spec/contracts/core-extension.md`** — Defines the `RepoTutorCore` public API, all message types between extension/webview, session state shape, error types, and event types. This is the source of truth for the core-extension boundary.
- **`spec/schemas/`** — JSON Schema definitions for all LLM input/output types (AnalysisResult, Chapter, ChapterContent, EvidencePack, Question, Evaluation).
- **`spec/prompts/`** — LLM prompt templates (Handlebars). Each corresponds to a pipeline stage.
- **`spec/guidelines/pedagogy.md`** — Bloom's Taxonomy alignment rules for quiz generation and evaluation rubrics. Quiz generation must include varied difficulty levels.
- **`spec/guidelines/cs-concepts.md`** — Pattern detection reference and cross-language analogy tables for content generation.
- **`packages/core/src/types/`** — TypeScript type definitions derived from the JSON schemas. Types are split by domain: `analysis.ts`, `chapter.ts`, `quiz.ts`, `config.ts`.

## TypeScript Configuration

- Target: ES2022, Module: NodeNext
- Strict mode enabled
- Base config in `tsconfig.base.json`, packages extend it
- Core outputs to `packages/core/dist/`
- VS Code extension bundles with esbuild (not tsc output directly)

## Conventions

- LLM provider support: OpenAI and Anthropic (user provides their own API key)
- MVP language support: JavaScript/TypeScript (via ts-morph) and Python (via tree-sitter)
- Privacy is non-negotiable: secret redaction is always active and cannot be disabled. EvidencePacks limit what code reaches the LLM.
- The `spec/` directory is the canonical source for schemas, prompts, and contracts. Types in `packages/core/src/types/` must stay consistent with `spec/schemas/`.
