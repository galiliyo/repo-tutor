# Chapter Speed & Track Filtering Design

## Problems

1. **FE content leaks into BE track** (and vice versa) — at both planner and chapter-writer layers
2. **Chapter tabs are always clickable** — clicking uncached chapter triggers 2.5-3 min block with no way to cancel or prioritize
3. **Chapter generation takes 2.5-3 min** — 120K char evidence budget creates massive prompts

## Goals

1. Chapters only contain content relevant to their track
2. Users see chapter state (ready/loading/queued) and can influence priority
3. Useful content appears within ~15s of clicking a chapter

## Non-Goals

- Full streaming of chapter content (JSON output format constraint)
- Changing the chapter-writer output schema
- Caching chapters across sessions

---

## Section 1: Dynamic File-Track Map

### Problem Detail

`classifyFileTrack()` uses hardcoded `FE_DIRS`/`BE_DIRS` lists. Files not in recognized dirs return `'shared'` and leak into every track. Three leak sources:

1. **`classifyFileTrack` shared fallback** — `packages/web/app/layout.tsx` not under `src/components` → classified `'shared'` → included in BE planner context
2. **`analysis.patterns` unfiltered** — "React component composition" pattern sent to BE planner prompt
3. **`extractFrameworkStack` unfiltered** — FE frameworks (react, vue) included in BE chapter evidence

### Design

#### Per-file classification during `detectTracks`

Build a `fileTrackMap: Map<string, TrackId>` by classifying each source file individually. `detectTracks` already reads file contents into a `Map<string, string>` — zero extra I/O.

```typescript
function classifyFile(filePath: string, content?: string): TrackId | null {
  // Tier 1: Directory match (fast)
  if (FE_DIRS.some(d => fileMatchesDir(filePath, d))) return 'frontend';
  if (BE_DIRS.some(d => fileMatchesDir(filePath, d))) return 'backend';
  if (INFRA_DIRS.some(d => fileMatchesDir(filePath, d))) return 'infra';

  // Tier 2: Extension-based
  if (/\.(jsx|tsx)$/.test(filePath) || /\.module\.(css|scss)$/.test(filePath)) return 'frontend';

  // Tier 3: Content-based (import analysis)
  if (content) {
    if (FE_FRAMEWORK_IMPORTS.some(pkg => matchesImport(content, pkg))) return 'frontend';
    if (containsAny(content, FE_DOM_APIS)) return 'frontend';
    if (BE_FRAMEWORK_IMPORTS.some(pkg => matchesImport(content, pkg))) return 'backend';
    if (BE_DB_IMPORTS.some(pkg => matchesImport(content, pkg))) return 'backend';
    if (containsAny(content, BE_SERVER_PATTERNS)) return 'backend';
  }

  return null; // genuinely ambiguous → treated as 'shared'
}
```

Stored in `AnalysisResult.fileTrackMap`. `classifyFileTrack()` becomes a map lookup:
```typescript
export function classifyFileTrack(path: string, fileTrackMap?: Map<string, TrackId>): TrackId | 'shared' {
  return fileTrackMap?.get(path) ?? 'shared';
}
```

#### Filter `patterns` in planner

```typescript
const TRACK_PATTERN_KEYWORDS: Record<TrackId, string[]> = {
  frontend: ['react', 'component', 'css', 'style', 'dom', 'ui', 'vue', 'svelte', 'state management', 'redux', 'store'],
  backend: ['express', 'middleware', 'route', 'controller', 'database', 'auth', 'api', 'rest', 'graphql', 'orm', 'migration'],
  infra: ['docker', 'ci', 'deploy', 'kubernetes', 'terraform', 'pipeline'],
  architecture: [],
};
```

In `Planner.plan()`: exclude patterns whose keywords match a different track.

#### Filter `extractFrameworkStack` by track

Accept `trackId` param. Only search for frameworks relevant to that track (FE frameworks for frontend chapters, BE frameworks for backend chapters, all for architecture).

### Files Affected

- `packages/core/src/analysis/track-detector.ts` — `classifyFile()`, build `fileTrackMap` in `detectTracks()`
- `packages/core/src/types/` — add `fileTrackMap` to `AnalysisResult`
- `packages/core/src/generation/planner.ts` — filter `patterns` by track keywords
- `packages/core/src/generation/evidence-builder.ts` — pass `fileTrackMap` to `classifyFileTrack`
- `packages/core/src/generation/interface-artifact.ts` — `extractFrameworkStack` accepts `trackId`

---

## Section 2: Chapter State Indicators + Track Priority

### Problem Detail

All chapter sidebar items are clickable. No visual distinction between cached and uncached chapters. Track tab switching is webview-local — extension doesn't know, prefetch queue continues for old track.

### Design

#### Chapter states in webview

Each chapter has one of 3 states:
- **ready** — cached, instant load. Normal styling.
- **loading** — currently generating. Spinner icon.
- **queued** — in prefetch queue but not started. Dimmed (opacity: 0.5).

#### New message: `chapter:states`

```typescript
// Extension → Webview
| { type: 'chapter:states'; states: Record<string, 'ready'|'loading'|'queued'> }
```

Sent after `sendInit`, after each prefetch completion, and after queue reorder.

#### New message: `track:switched`

```typescript
// Webview → Extension
| { type: 'track:switched'; trackId: string }
```

When user clicks a track tab, webview sends this. Extension handler:
1. `_prefetchAbortController.abort()`
2. Update `_session.currentTrackId`
3. Rebuild `_prefetchQueue` for new track's chapters
4. Restart `_runPrefetchQueue()`
5. Send updated `chapter:states`

#### Priority bump on navigate

When user clicks a queued chapter:
1. Remove from queue, move to front
2. If something is currently inflight, can't cancel mid-LLM-call — queued chapter becomes next
3. Existing wait-for-inflight logic in `_loadChapter` handles this

#### Sidebar CSS

```css
.chapter-list li.queued { opacity: 0.5; }
.chapter-list li.loading .status-icon { /* spinner */ }
.chapter-list li.ready .status-icon { /* checkmark or none */ }
```

### Files Affected

- `packages/vscode-extension/src/views/LearningPanel.ts` — `chapter:states` send logic, `track:switched` handler, queue reorder
- `packages/vscode-extension/src/views/LearningPanel.ts` (webview HTML/JS) — state rendering, track switch message, CSS
- `spec/contracts/core-extension.md` — new message types

---

## Section 3: Evidence Budget Reduction + Two-Pass Generation

### Problem Detail

`DEFAULT_BUDGET.totalBudget = 120_000` chars (~30K tokens). Combined with the long chapter-writer-v2 prompt (pedagogical guidelines, repo map, anti-hallucination rules), the full prompt is enormous → 2.5-3 min LLM response.

### Design

#### Two budget tiers

```typescript
const BUDGET_FAST: BudgetConfig = {
  totalBudget: 40_000,   // ~10K tokens
  maxPerFile: 8_000,
  minPerFile: 200,
  headRatio: 0.7,
  tierWeights: { A: 0.5, B: 0.3, C: 0.15, D: 0.05 },
};

const BUDGET_FULL: BudgetConfig = {
  totalBudget: 80_000,   // ~20K tokens (down from 120K)
  maxPerFile: 12_000,
  minPerFile: 200,
  headRatio: 0.7,
  tierWeights: { A: 0.4, B: 0.3, C: 0.2, D: 0.1 },
};
```

#### Two-pass generation

**Pass 1 — Outline (~10-20s)**:
- Uses `BUDGET_FAST`
- Stripped-down prompt (`chapter-outline.md`): no pedagogical guidelines, no anti-hallucination rules
- Output: section headings + 2-3 sentence summaries + key takeaways
- Renders immediately — user has real content to read within ~15s

**Pass 2 — Detail (~60-90s)**:
- Uses `BUDGET_FULL`
- Full `chapter-writer-v2.md` prompt
- Output: complete chapter content with code refs, diagrams
- Replaces outline when done

#### New prompt: `chapter-outline.md`

Minimal version of chapter-writer. Output format:

```json
{
  "chapterId": "string",
  "title": "string",
  "sections": [
    { "heading": "string", "summary": "2-3 sentence overview" }
  ],
  "keyTakeaways": ["string"]
}
```

#### New message: `chapter:outline`

```typescript
// Extension → Webview
| { type: 'chapter:outline'; chapterId: string; outline: ChapterOutline }
```

Webview renders outline sections with "Loading detailed content..." indicator. When `chapter:loaded` arrives, full content replaces everything.

#### Loading flow

```
User clicks uncached chapter:
  1. Skeleton renders instantly (existing, from planner metadata)
  2. Pass 1 fires (BUDGET_FAST, outline prompt)
  3. ~15s: chapter:outline renders — headings, summaries, takeaways
  4. Pass 2 fires (BUDGET_FULL, full prompt)
  5. ~60-90s: chapter:loaded replaces with full content
```

#### Prefetch strategy

Background prefetch runs both passes sequentially per chapter. Fully prefetched chapters skip directly to `chapter:loaded`.

#### Core API addition

```typescript
generateChapterOutline(chapter: Chapter, analysis: AnalysisResult, userContext: UserContext): Promise<ChapterOutline>;
// Existing generateChapter uses BUDGET_FULL
```

`EvidenceBuilder.build()` accepts an optional `budget` parameter to override the default.

### Files Affected

- `packages/core/src/generation/evidence-builder.ts` — two budget configs, `build()` accepts budget param
- `packages/core/src/generation/chapter-writer.ts` — new `generateOutline()` method
- `spec/prompts/chapter-outline.md` — new prompt (stripped-down)
- `packages/core/src/core.ts` — expose `generateChapterOutline` in public API
- `packages/vscode-extension/src/views/LearningPanel.ts` — two-pass flow in `_loadChapter`, `_prefetchChapter`, new message
- `spec/contracts/core-extension.md` — new message type

---

## Implementation Order

1. **Section 1** — Dynamic file-track map (fixes correctness, independent of other sections)
2. **Section 3A** — Evidence budget reduction (immediate speed win, simple change)
3. **Section 2** — Chapter states + track priority (UX improvement, needs new messages)
4. **Section 3B** — Two-pass generation (biggest perceived speed win, most complex)

## Summary of New Message Types

```typescript
// Extension → Webview
| { type: 'chapter:states'; states: Record<string, 'ready'|'loading'|'queued'> }
| { type: 'chapter:outline'; chapterId: string; outline: ChapterOutline }

// Webview → Extension
| { type: 'track:switched'; trackId: string }
```

## New Types

```typescript
interface ChapterOutline {
  chapterId: string;
  title: string;
  sections: { heading: string; summary: string }[];
  keyTakeaways: string[];
}
```
