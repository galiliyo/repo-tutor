# Smart Evidence System

> Design doc — no code changes. Types, schemas, implementation deferred.

## Problem

`EvidenceBuilder` does naive flat file reads with dumb truncation:
- Reads every file in `chapter.targetFiles` in full
- Truncates at a flat 10k chars (head-only, loses exports/tail)
- No prioritization — a 200-line config file gets the same budget as the 1500-line core module
- No structural context — LLM gets code snippets with zero understanding of what the repo *is*
- No budget management — a chapter with 20 target files easily blows the context window

## Goals

1. **Tiered selection** — rank files by relevance, allocate budget accordingly
2. **Budget management** — hard cap on total evidence chars, per-file caps
3. **Head+tail truncation** — preserve imports *and* exports for truncated files
4. **Interface Artifact** — give the LLM a structural map grounding code in the repo's architecture
5. **Reuse track-detector signals** — avoid duplicating the scanning work already done there

---

## Design

### 1. Tiered File Selection

Files assigned to a chapter get classified into tiers that control how much budget they receive.

| Tier | Description | Budget share | Example |
|------|-------------|-------------|---------|
| **A — Primary** | Direct teaching targets. The files the chapter is *about*. | 40% of total | `src/auth/middleware.ts` in an auth chapter |
| **B — Supporting** | Files imported by Tier A, needed for comprehension. | 30% of total | `src/auth/types.ts`, `src/auth/jwt.ts` |
| **C — Context** | Sibling files, config, or related modules. Useful but not essential. | 20% of total | `src/auth/index.ts`, `package.json` |
| **D — Reference** | Distant files included for completeness. Heavily truncated or metadata-only. | 10% of total | `src/db/connection.ts` referenced once |

#### Tier assignment algorithm

```
For each file in chapter.targetFiles:
  if file is explicitly listed in chapter.learningObjectives or focus matches:
    → Tier A
  else if file is imported by any Tier A file (1 hop in dependencyGraph):
    → Tier B
  else if file shares a directory with a Tier A file:
    → Tier C
  else:
    → Tier D
```

The planner can also hint tiers via an optional `filePriority` field on `Chapter` (future enhancement, not in v1).

### 2. Budget Management

```
TOTAL_BUDGET    = 120_000 chars  (~30k tokens)
MAX_PER_FILE    =  16_000 chars  (~4k tokens)
MIN_PER_FILE    =     200 chars  (enough for path + signature summary)
```

Budget allocation per tier:

```
tierBudgets = {
  A: TOTAL_BUDGET * 0.40,   // 48k chars
  B: TOTAL_BUDGET * 0.30,   // 36k chars
  C: TOTAL_BUDGET * 0.20,   // 24k chars
  D: TOTAL_BUDGET * 0.10,   // 12k chars
}
```

Within a tier, budget is split evenly across files, capped at `MAX_PER_FILE`. Unused budget from a tier rolls up to the next tier (A gets D's leftovers last).

```
for tier in [D, C, B, A]:
  perFile = min(tierBudgets[tier] / filesInTier.length, MAX_PER_FILE)
  for file in filesInTier:
    allocate(file, perFile)
  leftover = tierBudgets[tier] - sum(actual allocations)
  tierBudgets[prevTier] += leftover   // roll up
```

### 3. Head+Tail Truncation

When a file exceeds its budget, instead of chopping after N chars (losing exports, class closures, etc.):

```
HEAD_RATIO = 0.7   // 70% of budget for top of file
TAIL_RATIO = 0.3   // 30% of budget for bottom of file

if content.length > fileBudget:
  headChars = floor(fileBudget * HEAD_RATIO)
  tailChars = floor(fileBudget * TAIL_RATIO)
  result = content.slice(0, headChars)
         + "\n\n/* ... truncated (" + skippedLines + " lines omitted) ... */\n\n"
         + content.slice(-tailChars)
  mark file as truncated
```

**Why 70/30?** Imports, type declarations, and module setup live at the top. Exports, default exports, and module.exports live at the bottom. The middle (function bodies) is least critical for structural understanding.

### 4. Interface Artifact

A structured summary of the repo's "shape" — injected into the prompt *before* code evidence so the LLM knows what it's looking at.

#### What it contains

```typescript
interface InterfaceArtifact {
  directoryTree: string;           // indented tree of relevant dirs/files
  tracks: TrackSummary[];          // from track-detector output
  entryPoints: string[];           // from AnalysisResult.entryPoints
  frameworkStack: string[];        // e.g. ["express", "prisma", "react"]
  moduleMap: ModuleMapEntry[];     // module name → file count, purpose hint
}

interface TrackSummary {
  id: string;
  label: string;
  confidence: number;
  keySignals: string[];            // e.g. ["express import", "route handlers"]
}

interface ModuleMapEntry {
  name: string;
  path: string;
  fileCount: number;
  purpose?: string;                // from directory name heuristics
}
```

#### Relationship to track-detector

**Key insight:** `track-detector.ts` already scans for:
- Framework imports (`BE_FRAMEWORK_IMPORTS`, `FE_FRAMEWORK_IMPORTS`)
- DB imports (`BE_DB_IMPORTS`)
- Auth imports (`BE_AUTH_IMPORTS`)
- Queue imports (`BE_QUEUE_IMPORTS`)
- Infra files (`INFRA_FILES`)
- Directory conventions (`FE_DIRS`, `BE_DIRS`, `INFRA_DIRS`)
- Monorepo tools (`ARCH_MONOREPO_TOOLS`)
- Server patterns (`BE_SERVER_PATTERNS`)

Building a separate `InterfaceDetector` would duplicate most of this.

**Chosen approach: (b) Build from track-detector output + AnalysisResult**

The `InterfaceArtifact` is assembled from data already available:

| Artifact field | Source |
|---------------|--------|
| `directoryTree` | `AnalysisResult.modules` + file list (new: tree formatter util) |
| `tracks` | `AnalysisResult.detectedTracks` (already populated by track-detector) |
| `entryPoints` | `AnalysisResult.entryPoints` |
| `frameworkStack` | Extract from track-detector's signal constants + `AnalysisResult.http?.framework` |
| `moduleMap` | `AnalysisResult.modules` |

**No new scanner needed.** A small `buildInterfaceArtifact(analysis: AnalysisResult)` function reads from existing fields.

To populate `frameworkStack` (the one field not directly available), we have two options:
1. **(Preferred)** Have `detectTracks()` return the matched signals alongside scores — a small refactor to emit `matchedSignals: string[]` per track
2. **(Simpler)** Re-scan `package.json` deps in the artifact builder — minor duplication but trivial

Recommendation: option (1), but defer to implementation PR.

### 5. Type Changes Needed

#### New types (in `packages/core/src/types/`)

```typescript
// types/evidence.ts (new file or extend chapter.ts)

interface InterfaceArtifact {
  directoryTree: string;
  tracks: TrackSummary[];
  entryPoints: string[];
  frameworkStack: string[];
  moduleMap: ModuleMapEntry[];
}

interface TrackSummary {
  id: string;
  label: string;
  confidence: number;
  keySignals: string[];
}

interface ModuleMapEntry {
  name: string;
  path: string;
  fileCount: number;
  purpose?: string;
}

type FileTier = 'A' | 'B' | 'C' | 'D';

interface TieredFile {
  path: string;
  tier: FileTier;
  budgetChars: number;
}

interface BudgetConfig {
  totalBudget: number;        // default 120_000
  maxPerFile: number;         // default 16_000
  minPerFile: number;         // default 200
  headRatio: number;          // default 0.7
  tierWeights: Record<FileTier, number>;  // default { A: 0.4, B: 0.3, C: 0.2, D: 0.1 }
}
```

#### Extensions to existing types

```typescript
// EvidencePack — add optional fields
interface EvidencePack {
  // ... existing fields ...
  interfaceArtifact?: InterfaceArtifact;
  budgetUsed?: number;           // actual chars consumed
  tierBreakdown?: Record<FileTier, number>;  // files per tier
}

// EvidenceFile — add tier info
interface EvidenceFile {
  // ... existing fields ...
  tier?: FileTier;
  headTailTruncated?: boolean;   // distinguishes from old flat truncation
}
```

#### Schema changes

`spec/schemas/EvidencePack.schema.json` needs matching updates — `interfaceArtifact`, `budgetUsed`, `tierBreakdown` as optional properties.

---

## Data Flow

```
┌─────────────┐
│  Analyzer    │──→ AnalysisResult
└──────┬──────┘       │
       │              │ .detectedTracks, .modules, .entryPoints,
       │              │ .dependencyGraph
       ▼              │
┌─────────────┐       │
│   Planner   │──→ Chapter[]  (with targetFiles, trackId)
└──────┬──────┘       │
       │              │
       ▼              ▼
┌──────────────────────────────┐
│     SmartEvidenceBuilder     │
│                              │
│  1. classifyTiers(chapter,   │
│     dependencyGraph)         │
│                              │
│  2. allocateBudgets(tiers,   │
│     budgetConfig)            │
│                              │
│  3. readAndTruncate(files,   │
│     budgets)  // head+tail   │
│                              │
│  4. buildInterfaceArtifact(  │
│     analysis)                │
│                              │
│  5. redact + assemble pack   │
└──────────────┬───────────────┘
               │
               ▼
         EvidencePack
         (with InterfaceArtifact)
               │
               ▼
┌─────────────────────┐
│    ChapterWriter    │ ← uses chapter-writer-v2 prompt
└─────────────────────┘
```

## File Impact

| File | Change |
|------|--------|
| `packages/core/src/types/chapter.ts` | Add `FileTier`, `TieredFile`, extend `EvidenceFile`, `EvidencePack` |
| `packages/core/src/types/evidence.ts` | **New** — `InterfaceArtifact`, `TrackSummary`, `ModuleMapEntry`, `BudgetConfig` |
| `packages/core/src/generation/evidence-builder.ts` | Replace `build()` with tiered + budget logic; add head+tail truncation |
| `packages/core/src/generation/interface-artifact.ts` | **New** — `buildInterfaceArtifact()` function |
| `packages/core/src/analysis/track-detector.ts` | Minor — optionally emit matched signals per track |
| `spec/schemas/EvidencePack.schema.json` | Add `interfaceArtifact`, `budgetUsed`, `tierBreakdown` |
| `spec/prompts/chapter-writer.md` | → superseded by `chapter-writer-v2.md` |
| Tests | New tests for tier classification, budget allocation, head+tail truncation |

## Privacy

No changes to privacy model. All content still passes through `Redactor` before inclusion in `EvidencePack`. The `InterfaceArtifact` contains only structural metadata (paths, module names, framework names) — no source code — so no additional redaction needed.

## Open Questions

1. **Should `filePriority` be a planner output?** The planner could tag files as A/B/C/D directly, removing the heuristic. Tradeoff: more LLM work in planning vs. better tier accuracy.
2. **Should budget constants be configurable?** Could expose via `BudgetConfig` in `SecurityConfig` or `LLMConfig`. Probably not needed for v1.
3. **Track-detector signal export** — option (1) vs (2) above. Minor implementation detail.
