# Speed Improvements Design

## Problem
Both initial setup (analyze → plan) and chapter generation (click → wait → render) feel slow. User stares at progress spinners with no useful content.

## Goals
1. Reduce perceived wait time by showing useful info immediately
2. Reduce actual wait time via parallelism and prefetching
3. Chapter 1 feels instant after planning completes

## Non-Goals
- Streaming LLM output (JSON output format makes this complex; revisit later)
- Changing chapter-writer prompt output format

---

## Section 1: Rich Chapter Skeleton

When a chapter starts loading, render instantly from planner metadata + analysis data (zero LLM calls):

**Header block:**
- Title, complexity badge, track name

**"What you'll learn" block:**
- Learning objectives as checklist items

**"Files in focus" block:**
- Target files as clickable links with file type indicators
- Import/dependency relationships between target files (from `dependencyGraph.edges`)
- Mini dependency chain visualization: `auth.ts → middleware.ts → router.ts`

**"Context" block:**
- Which modules these files belong to (from `analysisResult.modules`)
- Layer info from `dependencyGraph.layers` — where files sit in the architecture

### Message Protocol Change
New message type: `chapter:skeleton`
```typescript
| { type: 'chapter:skeleton'; chapterId: string; skeleton: ChapterSkeleton }
```

Where `ChapterSkeleton`:
```typescript
interface ChapterSkeleton {
  title: string;
  trackLabel?: string;
  complexity?: 'low' | 'medium' | 'high';
  learningObjectives: string[];
  targetFiles: SkeletonFile[];
  dependencies: { from: string; to: string }[];
  moduleName?: string;
  layerIndex?: number;
}

interface SkeletonFile {
  path: string;
  language: string;
}
```

### Rendering Flow
1. User clicks chapter → extension sends `chapter:skeleton` immediately
2. Webview renders skeleton with all available metadata
3. Extension sends `chapter:loading` (shows generating indicator on content area only)
4. Extension sends `chapter:loaded` → smooth swap: skeleton stays, content fills in below

---

## Section 2: Aggressive Track Prefetching

After session init, generate ALL chapters in the current track in the background.

### Mechanism
- `_prefetchQueue: string[]` — ordered chapter IDs to generate
- `_prefetching: boolean` — prefetch in flight flag
- `_prefetchAbort: AbortController` — cancel on track switch
- `_runPrefetchQueue()` — sequential: pop → generate → cache → repeat

### Priority Rules
1. User-requested chapter load always takes priority (cancel current prefetch, serve request, resume queue)
2. Track switch → clear queue, rebuild for new track
3. Already-cached chapters are skipped

### Cache
Uses existing `_generatedContent: Map<string, ChapterContent>`.

### Progress Indicator
Subtle non-blocking indicator: "Preparing chapters... (3/7)" in sidebar or panel header.

---

## Section 3: Parallel Track Planning

### Current (Sequential)
```typescript
for (const track of selectedTracks) {
  const trackChapters = await core.planChapters(analysisResult, userContext, track);
  // ...
}
```

### Proposed (Parallel)
```typescript
const results = await Promise.all(
  selectedTracks.map(async (track) => {
    const chapters = await core.planChapters(analysisResult, userContext, track);
    chapters.forEach(ch => { ch.trackId = track.id; });
    return chapters;
  })
);
const allChapters = results.flat();
```

### Bonus: Pipeline Overlap
Don't wait for all tracks to finish planning before opening panel. After first track resolves:
1. Open panel with available chapters
2. Start prefetching chapter 1
3. Remaining track plans arrive → add to sidebar dynamically

---

## Section 4: Analysis-Phase Progressive UI

Instead of showing only a notification progress bar during `analyze()`:

### Phase 1: Open Panel Early
Open the learning panel immediately after track selection (or even during analysis) with a "scanning" state.

### Phase 2: Show Analysis Stats
As analysis completes, display:
- File count, languages detected
- Entry points found
- Module breakdown
- Dependency graph stats

### Phase 3: Transition to Planning
After analysis → show track selection → after selection → show sidebar with chapter skeletons from planner output → start prefetch pipeline.

The panel is visible and informative throughout, not hidden behind a blocking notification.

---

## Implementation Order
1. **Section 3** — Parallel track planning (smallest change, immediate speedup)
2. **Section 2** — Background prefetching (biggest perceived speed win)
3. **Section 1** — Rich chapter skeleton (enhanced UX during any remaining waits)
4. **Section 4** — Analysis-phase UI (polish, requires more webview changes)

## Files Affected
- `packages/vscode-extension/src/commands/startLearning.ts` — parallel planning, pipeline
- `packages/vscode-extension/src/views/LearningPanel.ts` — prefetch queue, skeleton messages, progressive UI
- `packages/vscode-extension/src/views/LearningPanel.ts` (webview HTML) — skeleton rendering, progress indicators
- `spec/contracts/core-extension.md` — new message types
