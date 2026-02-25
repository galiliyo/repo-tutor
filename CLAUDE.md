## Project Overview

VS Code extension that teaches developers unfamiliar codebases through chapter-based learning and quizzes. pnpm monorepo with two packages: `@repo-tutor/core` (pure TS, no VS Code deps) and `@repo-tutor/vscode` (extension, bundles core).

You are running on wsl.

## Commands

```bash
# Run a single package (use --filter to avoid running everything)
pnpm --filter @repo-tutor/core build
pnpm --filter @repo-tutor/core test
pnpm --filter @repo-tutor/core test:watch

# The VS Code extension is bundled with esbuild, not tsc
pnpm --filter @repo-tutor/vscode build
pnpm --filter @repo-tutor/vscode package
```

## Conventions

- **Privacy is non-negotiable.** Secret redaction is always active and cannot be disabled. EvidencePacks limit what code reaches the LLM.
- **`spec/` is the canonical source of truth** for schemas, prompts, and contracts. Types in `packages/core/src/types/` must stay consistent with `spec/schemas/` — do not invent types independently.
- See `@spec/contracts/core-extension.md` for the extension/webview message contract and public API boundary.
