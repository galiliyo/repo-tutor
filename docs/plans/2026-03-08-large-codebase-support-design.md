# Large Codebase Support — Design

**Date:** 2026-03-08
**Status:** Brainstorm / Draft

## Problem

Repo-tutor's current pipeline assumes a codebase small enough to analyze in one pass and teach in 5-8 chapters. This breaks down for large, complex codebases — e.g., a 500-file Angular 21 / Nx monorepo with dozens of services, deep inheritance (3-4 levels), and cross-cutting shared libs.

### Specific Pain Points

1. **Inheritance is the curriculum** — class chains like `BaseHttpService → CrudService<T> → UserService → AdminUserService` are what developers *need* to understand, but the current pipeline doesn't trace or teach them explicitly.
2. **Evidence budget blowout** — understanding a child class requires seeing its parent, grandparent, etc. A 4-level chain eats 4x the per-file budget for a single concept.
3. **Track detection mismatch** — FE/BE/infra tracks don't help when the app is a single Angular frontend. Need domain-level slicing (auth, billing, shared core, Nx workspace infra).
4. **Can't swallow the whole app** — 5-8 chapters can't cover 500 files. Need a scoping/chunking strategy.

## Design Decisions

### Inheritance Teaching Strategy

LLM decides presentation based on chain depth:
- **Shallow chains (2 levels):** top-down — show base contract, then extension
- **Deep chains (3+):** bottom-up or diff-style — start from the concrete class, peel back layers, or show a flattened annotated view

### Zoom Levels (Conceptual Model)

The system supports four zoom levels that compose naturally:

```
Level 0: Orientation     → "here's the whole Nx workspace, 30 libs, 4 apps"
Level 1: Project scope   → "let's focus on libs/auth"
Level 2: Domain trace    → "trace auth flow across libs/auth, libs/api-client, apps/admin"
Level 3: Guided deep-dive → "these 5 classes are the inheritance spine of auth"
```

### Entry Interaction

Pinned for future design — options include: user picks from detected zones, auto-scoped zones, question-driven ("how does auth work?"), or always-start-with-orientation.

## Approach: Scope & Trace

**Recommended.** Minimal disruption to existing pipeline. Two additions:

### 1. Scoping Phase (pre-filter before planner)

Inserted between `Analyzer` and `Planner`:

- Analyze full workspace → build dependency graph as today
- **Detect focus zones** — clusters of related files by import density + directory grouping. Works with or without Nx (doesn't depend on `project.json`).
- Auto-generate an **orientation chapter** covering workspace structure, conventions, and key patterns (borrowed from "Fractal Courses" approach)
- Scope the planner to a single focus zone + inherited ancestors

### 2. Class Chain Resolver (evidence-builder addition)

When a file is selected for evidence:

- Walk the dependency graph + parsed AST to find `extends` / `implements` relationships
- Auto-include ancestor classes in the evidence pack
- Budget allocation: ancestors share the Tier B budget (they're "context for understanding the target")
- Pass chain metadata to the LLM so it can choose top-down vs bottom-up presentation

### What Changes

| Component | Change |
|---|---|
| `analyzer.ts` | Detect inheritance relationships (extends/implements) alongside imports |
| `track-detector.ts` | Add domain-level signals beyond FE/BE/infra (Nx libs, Angular modules, feature directories) |
| `evidence-builder.ts` | Class chain resolver — auto-include ancestors, share Tier B budget |
| `planner.ts` | Accept scoped file list + orientation flag; generate orientation chapter when scope is workspace-wide |
| `planner.md` prompt | New instructions for inheritance-aware chapter planning |
| `chapter-writer-v2.md` prompt | Instructions for adaptive inheritance presentation (top-down vs bottom-up vs diff-style) |
| New: `scoper.ts` | Focus zone detection via import clustering |

### What Stays the Same

- EvidencePack schema (zones are just pre-filters, packs stay identical)
- Privacy/redaction pipeline
- Budget math (per-file caps, tier weights, rollup logic)
- Chapter schema (add optional `resolution` field later if needed)

## Trade-offs

**Pros:**
- Scoping is a pure pre-filter — easy to test, easy to bypass for small repos
- Class chain resolution is a focused, testable addition
- No new navigation UX required in the extension
- Works with or without Nx (import-based clustering)
- Can evolve toward fractal courses or adaptive depth later without rework

**Cons:**
- Focus zone detection is heuristic — may split things a user considers one domain
- Still limited to 5-8 chapters per zone (might feel shallow for very large zones)
- Inheritance detection needs AST-level parsing (current JS plugin only does imports, not `extends`)

## Future Evolution

- **Fractal courses:** zones become linkable mini-courses with cross-references
- **Adaptive depth:** chapters gain resolution levels (overview / standard / deep-dive)
- **Question-driven scoping:** "how does auth work?" traces an answer across zones
- **Class flattener:** synthetic merged view with "inherited from X" annotations
