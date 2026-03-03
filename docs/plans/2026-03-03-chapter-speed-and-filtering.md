# Chapter Speed & Track Filtering Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix FE/BE content leak across tracks, add chapter state indicators with track-switch priority, and implement two-pass chapter generation to cut perceived wait from 3 min to ~15s.

**Architecture:** Dynamic file-track map built during analysis replaces hardcoded dir matching. Evidence budget split into FAST (40K) and FULL (80K) tiers. Two-pass generation: outline prompt (~15s) then full prompt (~60-90s). Webview tracks chapter states and messages extension on track switch.

**Tech Stack:** TypeScript, vitest, VS Code webview API

---

### Task 1: Add `fileTrackMap` to AnalysisResult type

**Files:**
- Modify: `packages/core/src/types/analysis.ts:76-87`
- Test: `packages/core/src/analysis/__tests__/track-detector.test.ts`

**Step 1: Add the field to AnalysisResult**

In `packages/core/src/types/analysis.ts`, add `fileTrackMap` to the `AnalysisResult` interface:

```typescript
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
  detectedTracks?: Track[];
  fileTrackMap?: Map<string, TrackId>;
}
```

Need to import `TrackId` — it's already re-exported from `packages/core/src/types/index.ts` via `track.ts`.

**Step 2: Run existing tests to confirm nothing breaks**

Run: `pnpm --filter @repo-tutor/core test`
Expected: All pass (new optional field doesn't break anything)

**Step 3: Commit**

```bash
git add packages/core/src/types/analysis.ts
git commit -m "feat: add fileTrackMap to AnalysisResult type"
```

---

### Task 2: Implement `classifyFile` and build map in `detectTracks`

**Files:**
- Modify: `packages/core/src/analysis/track-detector.ts`
- Test: `packages/core/src/analysis/__tests__/track-detector.test.ts`

**Step 1: Write tests for `classifyFile`**

Add to `packages/core/src/analysis/__tests__/track-detector.test.ts`:

```typescript
describe('classifyFile', () => {
  it('classifies by FE directory', () => {
    expect(classifyFile('src/components/Button.tsx')).toBe('frontend');
  });

  it('classifies by BE directory', () => {
    expect(classifyFile('src/routes/api.ts')).toBe('backend');
  });

  it('classifies .tsx as frontend', () => {
    expect(classifyFile('app/layout.tsx')).toBe('frontend');
  });

  it('classifies .module.css as frontend', () => {
    expect(classifyFile('styles/main.module.css')).toBe('frontend');
  });

  it('classifies by FE import content', () => {
    expect(classifyFile('app/page.ts', "import { useState } from 'react';")).toBe('frontend');
  });

  it('classifies by DOM API content', () => {
    expect(classifyFile('lib/dom.ts', "document.querySelector('#app')")).toBe('frontend');
  });

  it('classifies by BE import content', () => {
    expect(classifyFile('app/server.ts', "import express from 'express';")).toBe('backend');
  });

  it('classifies by DB import content', () => {
    expect(classifyFile('lib/db.ts', "import { Pool } from 'pg';")).toBe('backend');
  });

  it('returns null for ambiguous files', () => {
    expect(classifyFile('src/utils/logger.ts', "export function log(msg: string) {}")).toBeNull();
  });

  it('returns null when no content provided for unknown dir', () => {
    expect(classifyFile('lib/shared/helpers.ts')).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @repo-tutor/core test -- --grep "classifyFile"`
Expected: FAIL — `classifyFile` not exported

**Step 3: Implement `classifyFile` and export it**

In `packages/core/src/analysis/track-detector.ts`, add before `classifyFileTrack`:

```typescript
export function classifyFile(filePath: string, content?: string): TrackId | null {
  // Tier 1: Directory match
  if (FE_DIRS.some(d => fileMatchesDir(filePath, d))) return 'frontend';
  if (BE_DIRS.some(d => fileMatchesDir(filePath, d))) return 'backend';
  if (INFRA_DIRS.some(d => fileMatchesDir(filePath, d))) return 'infra';

  // Tier 2: Extension-based
  if (/\.(jsx|tsx)$/.test(filePath) || /\.module\.(css|scss)$/.test(filePath)) return 'frontend';

  // Tier 3: Content-based
  if (content) {
    if (FE_FRAMEWORK_IMPORTS.some(pkg => matchesImport(content, pkg))) return 'frontend';
    if (containsAny(content, FE_DOM_APIS)) return 'frontend';
    if (BE_FRAMEWORK_IMPORTS.some(pkg => matchesImport(content, pkg))) return 'backend';
    if (BE_DB_IMPORTS.some(pkg => matchesImport(content, pkg))) return 'backend';
    if (containsAny(content, BE_SERVER_PATTERNS)) return 'backend';
  }

  return null;
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm --filter @repo-tutor/core test -- --grep "classifyFile"`
Expected: All PASS

**Step 5: Write test for fileTrackMap in detectTracks**

```typescript
describe('detectTracks fileTrackMap', () => {
  it('populates fileTrackMap with per-file classifications', async () => {
    const files = ['src/components/App.tsx', 'src/routes/api.ts', 'src/utils/log.ts'];
    const contents = new Map([
      ['src/components/App.tsx', "import React from 'react';"],
      ['src/routes/api.ts', "import express from 'express';"],
      ['src/utils/log.ts', "export function log() {}"],
    ]);
    const tracks = await detectTracks('/fake', files, stubAnalysis(), contents);
    // detectTracks now returns { tracks, fileTrackMap }
    // or we need to check the analysis result — depends on how we wire it.
    // For now, just test classifyFile integration is consistent:
    expect(classifyFile('src/components/App.tsx', contents.get('src/components/App.tsx'))).toBe('frontend');
    expect(classifyFile('src/routes/api.ts', contents.get('src/routes/api.ts'))).toBe('backend');
    expect(classifyFile('src/utils/log.ts', contents.get('src/utils/log.ts'))).toBeNull();
  });
});
```

**Step 6: Build fileTrackMap inside `detectTracks`**

Modify `detectTracks` to build the map from files + contents and include it in the return. Since `detectTracks` currently returns `Track[]`, we need to change the return type or build the map at the call site.

**Recommended approach**: Build the map inside `detectTracks` and return it alongside tracks. Change signature:

```typescript
export async function detectTracks(
  repoPath: string,
  files: string[],
  analysis: AnalysisResult,
  fileContents?: Map<string, string>,
): Promise<{ tracks: Track[]; fileTrackMap: Map<string, TrackId> }> {
```

Add before the `return` statement:

```typescript
  const fileTrackMap = new Map<string, TrackId>();
  for (const file of files) {
    const track = classifyFile(file, contents.get(file));
    if (track) fileTrackMap.set(file, track);
  }

  return {
    tracks: TRACK_DEFS.map(def => ({ /* existing mapping */ })).sort(/* existing sort */),
    fileTrackMap,
  };
```

**Step 7: Fix all callers of `detectTracks`**

`detectTracks` is called in:
- `packages/core/src/analysis/analyzer.ts` — destructure result, store `fileTrackMap` on `AnalysisResult`
- `packages/core/src/analysis/__tests__/track-detector.test.ts` — update tests to destructure `{ tracks }`
- `packages/core/src/__tests__/tracks-integration.test.ts` — same

Find callers:

Run: search for `detectTracks(` across the codebase to find all call sites.

**Step 8: Run all tests**

Run: `pnpm --filter @repo-tutor/core test`
Expected: All PASS

**Step 9: Commit**

```bash
git add packages/core/src/analysis/track-detector.ts packages/core/src/analysis/__tests__/track-detector.test.ts
git commit -m "feat: add classifyFile and build fileTrackMap in detectTracks"
```

---

### Task 3: Wire fileTrackMap into analyzer and update `classifyFileTrack`

**Files:**
- Modify: `packages/core/src/analysis/analyzer.ts`
- Modify: `packages/core/src/analysis/track-detector.ts` (update `classifyFileTrack` signature)
- Test: existing tests

**Step 1: Update analyzer to store fileTrackMap on AnalysisResult**

Find where `detectTracks` is called in `analyzer.ts`. Destructure the result and assign `fileTrackMap` to the analysis result.

**Step 2: Update `classifyFileTrack` to accept fileTrackMap**

Replace the old implementation:

```typescript
export function classifyFileTrack(
  filePath: string,
  fileTrackMap?: Map<string, TrackId>,
): TrackId | 'shared' {
  if (fileTrackMap) {
    const track = fileTrackMap.get(filePath);
    if (track) return track;
  }
  // Fallback to directory-based for cases where map wasn't provided
  if (FE_DIRS.some(d => fileMatchesDir(filePath, d))) return 'frontend';
  if (BE_DIRS.some(d => fileMatchesDir(filePath, d))) return 'backend';
  if (INFRA_DIRS.some(d => fileMatchesDir(filePath, d))) return 'infra';
  if (ARCH_SHARED_DIRS.some(d => fileMatchesDir(filePath, d))) return 'shared';
  return 'shared';
}
```

**Step 3: Update callers of `classifyFileTrack`**

Two callers:
- `packages/core/src/generation/planner.ts:24` — pass `analysis.fileTrackMap`
- `packages/core/src/generation/evidence-builder.ts:243` — pass `analysis.fileTrackMap`

**Step 4: Run all tests**

Run: `pnpm --filter @repo-tutor/core test`
Expected: All PASS

**Step 5: Commit**

```bash
git add packages/core/src/analysis/analyzer.ts packages/core/src/analysis/track-detector.ts packages/core/src/generation/planner.ts packages/core/src/generation/evidence-builder.ts
git commit -m "feat: wire fileTrackMap into analyzer, planner, and evidence builder"
```

---

### Task 4: Filter patterns by track in planner

**Files:**
- Modify: `packages/core/src/generation/planner.ts:14-64`
- Test: `packages/core/src/generation/__tests__/planner.test.ts`

**Step 1: Write test**

```typescript
it('should filter patterns by track keywords for backend track', async () => {
  const analysis = createMockAnalysis();
  analysis.patterns = [
    { pattern: 'Express middleware pipeline', confidence: 'high' },
    { pattern: 'React component composition', confidence: 'high' },
    { pattern: 'Singleton', confidence: 'medium' },
  ];

  const backendTrack: Track = {
    id: 'backend', label: 'Backend', description: 'Server-side',
    focusTypes: ['http'], confidence: 0.8, suggestedOrder: 3,
  };

  // The prompt sent to LLM should NOT contain "React component"
  let capturedPrompt = '';
  const mockLLMClient: ILLMClient = {
    complete: vi.fn().mockImplementation(async (prompt: string) => {
      capturedPrompt = prompt;
      return {
        content: '{"chapters": []}',
        tokensUsed: 50,
      } as LLMResponse;
    }),
  };

  const planner = new Planner(mockLLMClient, mockPromptLoader);
  await planner.plan(analysis, createMockUserContext(), backendTrack);

  // mockPromptLoader captures the template vars — check patterns
  // The exact check depends on how promptLoader is mocked.
  // At minimum, verify LLM was called and patterns were filtered.
  expect(mockLLMClient.complete).toHaveBeenCalled();
});
```

Note: The exact assertion depends on how the prompt loader mock works. Check existing test patterns — the mock prompt loader likely captures template variables. Verify `patterns` passed to template excludes FE-specific patterns.

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @repo-tutor/core test -- --grep "filter patterns"`
Expected: FAIL

**Step 3: Implement pattern filtering in `Planner.plan()`**

Add after the existing track filtering block (after the `modules`/`entryPoints` filter):

```typescript
const TRACK_PATTERN_KEYWORDS: Record<string, string[]> = {
  frontend: ['react', 'component', 'css', 'style', 'dom', 'ui', 'vue', 'svelte', 'state management', 'redux', 'store'],
  backend: ['express', 'middleware', 'route', 'controller', 'database', 'auth', 'api', 'rest', 'graphql', 'orm', 'migration'],
  infra: ['docker', 'ci', 'deploy', 'kubernetes', 'terraform', 'pipeline'],
};

// Filter patterns — remove patterns clearly belonging to other tracks
let { patterns } = analysis;  // add patterns to existing destructuring
if (track && track.id !== 'architecture') {
  const otherTrackKeywords = Object.entries(TRACK_PATTERN_KEYWORDS)
    .filter(([id]) => id !== trackId)
    .flatMap(([, kws]) => kws);
  patterns = patterns.filter(p =>
    !otherTrackKeywords.some(kw => p.pattern.toLowerCase().includes(kw))
  );
}
```

And update the prompt template call to use the filtered `patterns` instead of `analysis.patterns`.

**Step 4: Run tests**

Run: `pnpm --filter @repo-tutor/core test`
Expected: All PASS

**Step 5: Commit**

```bash
git add packages/core/src/generation/planner.ts packages/core/src/generation/__tests__/planner.test.ts
git commit -m "feat: filter analysis patterns by track in planner"
```

---

### Task 5: Filter `extractFrameworkStack` by track

**Files:**
- Modify: `packages/core/src/generation/interface-artifact.ts:80-113`
- Test: `packages/core/src/generation/__tests__/interface-artifact.test.ts`

**Step 1: Write test**

```typescript
it('filters framework stack by backend track', () => {
  const analysis = mkAnalysis({
    http: { framework: 'express', routes: [], middleware: [] },
    dependencyGraph: {
      nodes: [
        { path: 'node_modules/react/index.js' },
        { path: 'node_modules/express/index.js' },
      ],
      edges: [],
    },
  });

  const artifact = buildInterfaceArtifact(analysis, 'backend');
  expect(artifact.frameworkStack).toContain('express');
  expect(artifact.frameworkStack).not.toContain('react');
});

it('includes all frameworks for architecture track', () => {
  const analysis = mkAnalysis({
    http: { framework: 'express', routes: [], middleware: [] },
    dependencyGraph: {
      nodes: [
        { path: 'node_modules/react/index.js' },
        { path: 'node_modules/express/index.js' },
      ],
      edges: [],
    },
  });

  const artifact = buildInterfaceArtifact(analysis, 'architecture');
  expect(artifact.frameworkStack).toContain('express');
  expect(artifact.frameworkStack).toContain('react');
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @repo-tutor/core test -- --grep "filters framework stack"`
Expected: FAIL — `buildInterfaceArtifact` doesn't accept trackId

**Step 3: Implement**

Update `buildInterfaceArtifact` signature:

```typescript
export function buildInterfaceArtifact(analysis: AnalysisResult, trackId?: TrackId): InterfaceArtifact {
  return {
    directoryTree: buildDirectoryTree(analysis),
    tracks: buildTrackSummaries(analysis),
    entryPoints: (analysis.entryPoints || []).map((e) => e.path),
    frameworkStack: extractFrameworkStack(analysis, trackId),
    moduleMap: buildModuleMap(analysis),
  };
}
```

Update `extractFrameworkStack`:

```typescript
function extractFrameworkStack(analysis: AnalysisResult, trackId?: TrackId): string[] {
  let knownFrameworks: string[];
  if (trackId === 'frontend') {
    knownFrameworks = [...FE_FRAMEWORK_IMPORTS];
  } else if (trackId === 'backend') {
    knownFrameworks = [...BE_FRAMEWORK_IMPORTS, ...BE_DB_IMPORTS];
  } else {
    knownFrameworks = [...FE_FRAMEWORK_IMPORTS, ...BE_FRAMEWORK_IMPORTS, ...BE_DB_IMPORTS];
  }
  // ... rest unchanged but use knownFrameworks instead of allKnown
```

**Step 4: Update caller in `EvidenceBuilder.build()`**

Pass `chapter.trackId` to `buildInterfaceArtifact`:

```typescript
const interfaceArtifact = buildInterfaceArtifact(filteredAnalysis, chapter.trackId as TrackId | undefined);
```

**Step 5: Run all tests**

Run: `pnpm --filter @repo-tutor/core test`
Expected: All PASS

**Step 6: Commit**

```bash
git add packages/core/src/generation/interface-artifact.ts packages/core/src/generation/evidence-builder.ts packages/core/src/generation/__tests__/interface-artifact.test.ts
git commit -m "feat: filter framework stack by track in interface artifact"
```

---

### Task 6: Reduce evidence budget (BUDGET_FAST + BUDGET_FULL)

**Files:**
- Modify: `packages/core/src/generation/evidence-builder.ts:17-23,214-216`
- Test: `packages/core/src/generation/__tests__/evidence-builder.test.ts`

**Step 1: Write test**

```typescript
describe('budget tiers', () => {
  it('BUDGET_FAST has 40K total budget', () => {
    expect(BUDGET_FAST.totalBudget).toBe(40_000);
  });

  it('BUDGET_FULL has 80K total budget', () => {
    expect(BUDGET_FULL.totalBudget).toBe(80_000);
  });

  it('EvidenceBuilder.build() accepts budget override', async () => {
    // Mock fs.readFile for target files
    mockedFs.readFile.mockResolvedValue('const x = 1;' as any);

    const builder = new EvidenceBuilder();
    const result = await builder.build(
      mkChapter({ targetFiles: ['src/a.ts'] }),
      mkAnalysis({ repoPath: '/test' }),
      BUDGET_FAST
    );
    expect(result.budgetUsed).toBeLessThanOrEqual(BUDGET_FAST.totalBudget);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @repo-tutor/core test -- --grep "budget tiers"`
Expected: FAIL — `BUDGET_FAST` not exported

**Step 3: Implement**

In `packages/core/src/generation/evidence-builder.ts`:

Replace `DEFAULT_BUDGET` with two exports:

```typescript
export const BUDGET_FAST: BudgetConfig = {
  totalBudget: 40_000,
  maxPerFile: 8_000,
  minPerFile: 200,
  headRatio: 0.7,
  tierWeights: { A: 0.5, B: 0.3, C: 0.15, D: 0.05 },
};

export const BUDGET_FULL: BudgetConfig = {
  totalBudget: 80_000,
  maxPerFile: 12_000,
  minPerFile: 200,
  headRatio: 0.7,
  tierWeights: { A: 0.4, B: 0.3, C: 0.2, D: 0.1 },
};

// Keep DEFAULT_BUDGET as alias for backward compat in tests
export const DEFAULT_BUDGET = BUDGET_FULL;
```

Update `EvidenceBuilder.build()` to accept optional budget:

```typescript
async build(chapter: Chapter, analysis: AnalysisResult, budget?: BudgetConfig): Promise<EvidencePack> {
  const config = budget ?? this.config;
  // Use config instead of this.config throughout the method
```

**Step 4: Run tests**

Run: `pnpm --filter @repo-tutor/core test`
Expected: All PASS

**Step 5: Commit**

```bash
git add packages/core/src/generation/evidence-builder.ts packages/core/src/generation/__tests__/evidence-builder.test.ts
git commit -m "feat: add BUDGET_FAST and BUDGET_FULL evidence tiers, reduce default to 80K"
```

---

### Task 7: Add `ChapterOutline` type and `chapter-outline.md` prompt

**Files:**
- Modify: `packages/core/src/types/chapter.ts`
- Create: `spec/prompts/chapter-outline.md`
- Test: `packages/core/src/generation/__tests__/chapter-writer.test.ts`

**Step 1: Add ChapterOutline type**

In `packages/core/src/types/chapter.ts`:

```typescript
export interface ChapterOutline {
  chapterId: string;
  title: string;
  sections: { heading: string; summary: string }[];
  keyTakeaways: string[];
}
```

**Step 2: Create `spec/prompts/chapter-outline.md`**

```markdown
# Role

You are a code tutor creating a quick chapter outline for a developer exploring a codebase.

# Context

Developer background: {{userPreferredLanguage}} ({{skillLevel}} level)
Chapter: {{chapterTitle}}

Learning objectives:
{{#each learningObjectives}}
- {{this}}
{{/each}}

# Code Evidence

{{#each evidencePack.files}}
## {{path}}
\```{{language}}
{{content}}
\```
{{/each}}

# Task

Create a concise chapter outline with section headings, brief summaries, and key takeaways.

# Output Format

Return valid JSON:

\```json
{
  "chapterId": "string",
  "title": "string",
  "sections": [
    { "heading": "string", "summary": "2-3 sentence overview of what this section covers" }
  ],
  "keyTakeaways": ["string"]
}
\```
```

Note: Remove the backslash before backtick fences — they're escaped here for markdown nesting.

**Step 3: Run build to verify prompt loads**

Run: `pnpm --filter @repo-tutor/core build`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/core/src/types/chapter.ts spec/prompts/chapter-outline.md
git commit -m "feat: add ChapterOutline type and chapter-outline prompt"
```

---

### Task 8: Add `generateOutline` to ChapterWriter

**Files:**
- Modify: `packages/core/src/generation/chapter-writer.ts`
- Test: `packages/core/src/generation/__tests__/chapter-writer.test.ts`

**Step 1: Write test**

```typescript
describe('generateOutline', () => {
  it('should return a ChapterOutline with sections and takeaways', async () => {
    const mockResponse: LLMResponse = {
      content: JSON.stringify({
        chapterId: 'ch-1',
        title: 'Overview',
        sections: [{ heading: 'Structure', summary: 'Project layout overview.' }],
        keyTakeaways: ['The project uses a monorepo'],
      }),
      tokensUsed: 50,
    };

    const mockLLMClient: ILLMClient = { complete: vi.fn().mockResolvedValue(mockResponse) };
    const writer = new ChapterWriter(mockLLMClient, mockPromptLoader);

    const result = await writer.generateOutline(
      mockEvidence,
      'Overview',
      ['Understand structure'],
      { preferredLanguage: 'TypeScript', skillLevel: 'intermediate' }
    );

    expect(result.chapterId).toBe('ch-1');
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].heading).toBe('Structure');
    expect(result.keyTakeaways).toContain('The project uses a monorepo');
  });
});
```

Adapt `mockEvidence` and `mockPromptLoader` from existing test patterns in that file.

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @repo-tutor/core test -- --grep "generateOutline"`
Expected: FAIL — method doesn't exist

**Step 3: Implement `generateOutline`**

Add to `ChapterWriter` class:

```typescript
async generateOutline(
  evidence: EvidencePack,
  chapterTitle: string,
  learningObjectives: string[],
  userContext: UserContext,
): Promise<ChapterOutline> {
  const prompt = this.promptLoader.load('chapter-outline', {
    chapterId: evidence.chapterId,
    chapterTitle,
    learningObjectives,
    skillLevel: userContext.skillLevel,
    userPreferredLanguage: userContext.preferredLanguage,
    evidencePack: evidence,
  });

  const response = await this.llmClient.complete(prompt);

  let jsonStr = response.content.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```\s*$/, '');
  }

  const parsed = JSON.parse(jsonStr);

  return {
    chapterId: evidence.chapterId,
    title: parsed.title || chapterTitle,
    sections: parsed.sections || [],
    keyTakeaways: parsed.keyTakeaways || [],
  };
}
```

Import `ChapterOutline` from types.

**Step 4: Run tests**

Run: `pnpm --filter @repo-tutor/core test`
Expected: All PASS

**Step 5: Commit**

```bash
git add packages/core/src/generation/chapter-writer.ts packages/core/src/generation/__tests__/chapter-writer.test.ts
git commit -m "feat: add generateOutline method to ChapterWriter"
```

---

### Task 9: Expose `generateChapterOutline` on RepoTutorCore

**Files:**
- Modify: `packages/core/src/core.ts:114-133`

**Step 1: Add method**

Add after `generateChapter`:

```typescript
async generateChapterOutline(
  chapter: Chapter,
  analysis: AnalysisResult,
  userContext: UserContext,
): Promise<ChapterOutline> {
  this.ensureLLMConfigured();

  const evidence = await this.evidenceBuilder.build(chapter, analysis, BUDGET_FAST);
  this.redactEvidencePack(evidence);

  return this.chapterWriter!.generateOutline(
    evidence,
    chapter.title,
    chapter.learningObjectives,
    userContext,
  );
}
```

Also update `generateChapter` to use `BUDGET_FULL` explicitly:

```typescript
const evidence = await this.evidenceBuilder.build(chapter, analysis, BUDGET_FULL);
```

Import `BUDGET_FAST`, `BUDGET_FULL` from evidence-builder. Import `ChapterOutline` from types.

**Step 2: Update core-adapter in extension**

In `packages/vscode-extension/src/core-adapter.ts`, the adapter wraps `RepoTutorCore`. Check if it directly delegates or has its own interface. If it delegates, the new method should be available. If it has a typed interface, add `generateChapterOutline`.

**Step 3: Run build**

Run: `pnpm --filter @repo-tutor/core build`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/core/src/core.ts packages/vscode-extension/src/core-adapter.ts
git commit -m "feat: expose generateChapterOutline on RepoTutorCore, use BUDGET_FULL for full chapters"
```

---

### Task 10: Update contract and add new message types

**Files:**
- Modify: `spec/contracts/core-extension.md`

**Step 1: Add new messages to contract**

In `ExtensionToWebviewMessage`:

```typescript
| { type: 'chapter:states'; states: Record<string, 'ready'|'loading'|'queued'> }
| { type: 'chapter:outline'; chapterId: string; outline: ChapterOutline }
```

In `WebviewToExtensionMessage`:

```typescript
| { type: 'track:switched'; trackId: string }
```

**Step 2: Update the TS type definitions in LearningPanel.ts**

The `ExtensionToWebviewMessage` and `WebviewToExtensionMessage` type aliases at the top of `LearningPanel.ts` need the new variants.

**Step 3: Commit**

```bash
git add spec/contracts/core-extension.md packages/vscode-extension/src/views/LearningPanel.ts
git commit -m "feat: add chapter:states, chapter:outline, track:switched message types"
```

---

### Task 11: Implement `chapter:states` and `track:switched` in LearningPanel

**Files:**
- Modify: `packages/vscode-extension/src/views/LearningPanel.ts`

**Step 1: Add `_buildChapterStates` helper**

```typescript
private _buildChapterStates(): Record<string, 'ready' | 'loading' | 'queued'> {
  const states: Record<string, 'ready' | 'loading' | 'queued'> = {};
  const trackChapters = this._session.chapters.filter(
    c => c.trackId === this._session.currentTrackId
  );
  for (const ch of trackChapters) {
    if (this._generatedContent.has(ch.id)) {
      states[ch.id] = 'ready';
    } else if (this._inflight.has(ch.id)) {
      states[ch.id] = 'loading';
    } else if (this._prefetchQueue.includes(ch.id)) {
      states[ch.id] = 'queued';
    } else {
      states[ch.id] = 'queued'; // not yet in queue but will be
    }
  }
  return states;
}

private _sendChapterStates(): void {
  this._postMessage({ type: 'chapter:states', states: this._buildChapterStates() });
}
```

**Step 2: Call `_sendChapterStates` at key points**

- After `sendInit()`
- After each chapter prefetch completes (in `_runPrefetchQueue`, after `_prefetchChapter`)
- After queue reorder

**Step 3: Add `track:switched` handler in `_handleMessage`**

```typescript
case 'track:switched':
  this._prefetchAbortController?.abort();
  this._prefetchAbortController = new AbortController();
  this._session.currentTrackId = message.trackId;
  // Rebuild queue for new track
  const newTrackChapters = this._session.chapters
    .filter(c => c.trackId === message.trackId)
    .sort((a, b) => a.order - b.order)
    .map(c => c.id)
    .filter(id => !this._generatedContent.has(id));
  this._prefetchQueue = newTrackChapters;
  this._prefetching = false;
  this._runPrefetchQueue();
  this._sendChapterStates();
  break;
```

**Step 4: Build extension to verify**

Run: `pnpm --filter repo-tutor build`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/vscode-extension/src/views/LearningPanel.ts
git commit -m "feat: add chapter:states emission and track:switched handler"
```

---

### Task 12: Update webview HTML/JS for chapter states and track messaging

**Files:**
- Modify: `packages/vscode-extension/src/views/LearningPanel.ts` (webview HTML inside `_getHtmlForWebview`)

**Step 1: Add CSS for chapter states**

Add to the `<style>` section:

```css
.chapter-list li.queued { opacity: 0.5; }
.chapter-list li.loading { opacity: 0.8; }
.status-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}
.status-icon.spinner {
  border: 2px solid var(--vscode-descriptionForeground);
  border-radius: 50%;
  border-top-color: transparent;
  animation: spin 1s linear infinite;
}
.status-icon.ready {
  color: var(--vscode-testing-iconPassed);
}
```

**Step 2: Add `chapterStates` to webview state**

```javascript
let state = {
  // ... existing fields
  chapterStates: {},  // Record<chapterId, 'ready'|'loading'|'queued'>
};
```

**Step 3: Update `renderChapterList` to use states**

Add a status icon to each `li` and apply the state class:

```javascript
function renderChapterList() {
  const filteredChapters = state.currentTrackId
    ? state.chapters.filter(ch => ch.trackId === state.currentTrackId)
    : state.chapters;

  const items = filteredChapters
    .sort((a, b) => a.order - b.order)
    .map(ch => {
      const li = document.createElement('li');
      const chState = state.chapterStates[ch.id] || 'queued';
      li.className = (ch.id === state.currentChapterId ? 'active' : '') +
        (chState !== 'ready' ? ' ' + chState : '');
      li.dataset.id = ch.id;

      // Status icon
      const icon = document.createElement('span');
      icon.className = 'status-icon';
      if (chState === 'loading') icon.classList.add('spinner');
      else if (chState === 'ready') { icon.classList.add('ready'); icon.textContent = '\u2713'; }
      li.appendChild(icon);

      const orderSpan = document.createElement('span');
      orderSpan.textContent = ch.order + '.';
      li.appendChild(orderSpan);

      const titleSpan = document.createElement('span');
      titleSpan.textContent = ch.title;
      li.appendChild(titleSpan);

      return li;
    });

  chapterListEl.replaceChildren(...items);

  chapterListEl.querySelectorAll('li').forEach(li => {
    li.addEventListener('click', () => {
      const chapterId = li.dataset.id;
      vscode.postMessage({ type: 'navigate', chapterId });
    });
  });
}
```

**Step 4: Handle `chapter:states` message**

```javascript
case 'chapter:states':
  state.chapterStates = message.states;
  renderChapterList();
  break;
```

**Step 5: Send `track:switched` on track tab click**

Update `renderTrackTabs`:

```javascript
tab.addEventListener('click', () => {
  state.currentTrackId = track.id;
  vscode.postMessage({ type: 'track:switched', trackId: track.id });
  renderTrackTabs();
  renderChapterList();
});
```

**Step 6: Build and manually verify**

Run: `pnpm --filter repo-tutor build`
Expected: PASS

**Step 7: Commit**

```bash
git add packages/vscode-extension/src/views/LearningPanel.ts
git commit -m "feat: chapter state indicators and track:switched messaging in webview"
```

---

### Task 13: Implement two-pass loading in `_loadChapter`

**Files:**
- Modify: `packages/vscode-extension/src/views/LearningPanel.ts` (`_loadChapter` method)

**Step 1: Update `_loadChapter` for two-pass flow**

Replace the body of `_loadChapter`:

```typescript
private async _loadChapter(chapterId: string) {
  // If fully cached, serve immediately
  const cached = this._generatedContent.get(chapterId);
  if (cached) {
    return this._renderAndSend(chapterId, cached);
  }

  this._postMessage({ type: 'chapter:loading', chapterId });

  // Send skeleton immediately (existing logic — keep as-is)
  const chapterMeta = this._session.chapters.find(c => c.id === chapterId);
  if (chapterMeta) {
    // ... existing skeleton code stays the same ...
  }

  try {
    const chapter = this._session.chapters.find((c) => c.id === chapterId);
    if (!chapter) throw new Error(`Chapter not found: ${chapterId}`);

    // Promote: remove from prefetch queue
    this._prefetchQueue = this._prefetchQueue.filter(id => id !== chapterId);

    let content: ChapterContent | undefined;

    // If already inflight from prefetch, wait for it
    if (this._inflight.has(chapterId)) {
      while (this._inflight.has(chapterId)) {
        await new Promise(r => setTimeout(r, 200));
      }
      content = this._generatedContent.get(chapterId);
    }

    if (!content) {
      const core = getCoreAdapter();
      const userContext = getDefaultUserContext();

      // Pass 1: Quick outline
      try {
        const outline = await core.generateChapterOutline(chapter, this._session.analysisResult, userContext);
        this._postMessage({ type: 'chapter:outline', chapterId, outline });
      } catch {
        // Outline failure is non-fatal, continue to full generation
      }

      // Pass 2: Full content
      content = await core.generateChapter(chapter, this._session.analysisResult, userContext);
      this._generatedContent.set(chapterId, content);
    }

    this._renderAndSend(chapterId, content);
    this._sendChapterStates();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    this._postMessage({ type: 'chapter:error', chapterId, error: errorMessage });
  }
}
```

**Step 2: Update `_prefetchChapter` to also do both passes**

```typescript
private async _prefetchChapter(chapterId: string): Promise<void> {
  if (this._generatedContent.has(chapterId) || this._inflight.has(chapterId)) return;
  this._inflight.add(chapterId);

  try {
    const chapter = this._session.chapters.find(c => c.id === chapterId);
    if (!chapter) return;

    const core = getCoreAdapter();
    const userContext = getDefaultUserContext();

    // Both passes during prefetch (outline result discarded, just warming cache)
    const content = await core.generateChapter(chapter, this._session.analysisResult, userContext);
    this._generatedContent.set(chapterId, content);
  } finally {
    this._inflight.delete(chapterId);
  }
}
```

Note: For prefetch, we skip the outline pass since the user isn't watching. Just do the full generation with the new reduced `BUDGET_FULL` (80K instead of 120K).

**Step 3: Build**

Run: `pnpm --filter repo-tutor build`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/vscode-extension/src/views/LearningPanel.ts
git commit -m "feat: two-pass chapter loading with outline-first flow"
```

---

### Task 14: Add outline rendering to webview

**Files:**
- Modify: `packages/vscode-extension/src/views/LearningPanel.ts` (webview HTML)

**Step 1: Add `renderOutline` function in webview JS**

```javascript
function renderOutline(outline) {
  mainContentEl.replaceChildren();

  var h1 = document.createElement('h1');
  h1.textContent = outline.title;
  mainContentEl.appendChild(h1);

  var meta = document.createElement('div');
  meta.className = 'chapter-meta';
  meta.textContent = 'Chapter outline — detailed content loading...';
  mainContentEl.appendChild(meta);

  outline.sections.forEach(function(section) {
    var sectionDiv = document.createElement('div');
    sectionDiv.className = 'section skeleton-section';

    var h2 = document.createElement('h2');
    h2.textContent = section.heading;
    sectionDiv.appendChild(h2);

    var p = document.createElement('p');
    p.textContent = section.summary;
    p.style.opacity = '0.8';
    sectionDiv.appendChild(p);

    // Loading indicator per section
    var loadingDiv = document.createElement('div');
    loadingDiv.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:8px;opacity:0.5;';
    var spinner = document.createElement('div');
    spinner.className = 'loading-spinner';
    spinner.style.cssText = 'width:14px;height:14px;border-width:2px;';
    loadingDiv.appendChild(spinner);
    var loadingText = document.createElement('span');
    loadingText.textContent = 'Loading detailed content...';
    loadingText.style.fontSize = '0.85em';
    loadingDiv.appendChild(loadingText);
    sectionDiv.appendChild(loadingDiv);

    mainContentEl.appendChild(sectionDiv);
  });

  if (outline.keyTakeaways && outline.keyTakeaways.length > 0) {
    var takeaways = document.createElement('div');
    takeaways.className = 'takeaways';
    var h3 = document.createElement('h3');
    h3.textContent = 'Key Takeaways';
    takeaways.appendChild(h3);
    var ul = document.createElement('ul');
    outline.keyTakeaways.forEach(function(t) {
      var li = document.createElement('li');
      li.textContent = t;
      ul.appendChild(li);
    });
    takeaways.appendChild(ul);
    mainContentEl.appendChild(takeaways);
  }
}
```

**Step 2: Handle `chapter:outline` message**

```javascript
case 'chapter:outline':
  state.currentChapterId = message.chapterId;
  renderChapterList();
  renderOutline(message.outline);
  break;
```

**Step 3: Build and verify**

Run: `pnpm --filter repo-tutor build`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/vscode-extension/src/views/LearningPanel.ts
git commit -m "feat: render chapter outline in webview with per-section loading indicators"
```

---

### Task 15: Final integration test and cleanup

**Files:**
- All modified files

**Step 1: Run full test suite**

Run: `pnpm --filter @repo-tutor/core test`
Expected: All PASS

**Step 2: Build extension**

Run: `pnpm --filter repo-tutor build`
Expected: PASS

**Step 3: Package extension (smoke test)**

Run: `pnpm --filter repo-tutor package`
Expected: PASS, produces .vsix

**Step 4: Final commit (if any remaining changes)**

```bash
git add -A
git commit -m "chore: integration cleanup for chapter speed and filtering"
```
