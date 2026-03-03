# Speed Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce perceived and actual wait times through parallel planning, background prefetching, and rich chapter skeletons.

**Architecture:** Four independent improvements layered on the existing `startLearning` → `LearningPanel` → webview pipeline. Parallel track planning (Task 1) and prefetch infrastructure (Tasks 2-3) reduce real wait time. Rich chapter skeletons (Tasks 4-5) and analysis-phase progressive UI (Task 6) fill remaining waits with useful content.

**Tech Stack:** TypeScript, VS Code extension API, existing LLMClient, webview DOM rendering

---

### Task 1: Parallelize Track Planning

**Files:**
- Modify: `packages/vscode-extension/src/commands/startLearning.ts:140-175`

**Step 1: Replace sequential track loop with Promise.all**

In `startLearning.ts`, find the `for...of` loop inside `withProgress` (lines ~140-155) and replace with:

```typescript
progress.report({ message: 'Planning chapters...', increment: 50 });

const results = await Promise.all(
  selectedTracks.map(async (track) => {
    const chapters = await core.planChapters(analysisResult!, userContext, track);
    chapters.forEach(ch => { ch.trackId = track.id; });
    return chapters;
  })
);
const allChapters = results.flat();
```

**Step 2: Verify it builds**

Run: `pnpm --filter repo-tutor build`
Expected: Build succeeds

**Step 3: Manual smoke test**

Launch extension in dev mode, run "Start Learning", select multiple tracks. Planning should complete faster (parallel LLM calls).

**Step 4: Commit**

```bash
git add packages/vscode-extension/src/commands/startLearning.ts
git commit -m "perf: parallelize track planning with Promise.all"
```

---

### Task 2: Add Prefetch Infrastructure to LearningPanel

**Files:**
- Modify: `packages/vscode-extension/src/views/LearningPanel.ts:64-72` (properties)
- Modify: `packages/vscode-extension/src/views/LearningPanel.ts:169-208` (_loadChapter)

**Step 1: Add prefetch state properties**

Add after line 72 (after `_currentQuestions`):

```typescript
private _prefetchQueue: string[] = [];
private _prefetching = false;
private _prefetchAbortController: AbortController | null = null;
private _inflight: Set<string> = new Set();
```

**Step 2: Create `_prefetchChapter` method**

Add a new method to `LearningPanel` (after `_loadChapter`):

```typescript
private async _prefetchChapter(chapterId: string): Promise<void> {
  if (this._generatedContent.has(chapterId) || this._inflight.has(chapterId)) return;
  this._inflight.add(chapterId);

  try {
    const chapter = this._session.chapters.find(c => c.id === chapterId);
    if (!chapter) return;

    const core = getCoreAdapter();
    const content = await core.generateChapter(
      chapter, this._session.analysisResult, getDefaultUserContext()
    );
    this._generatedContent.set(chapterId, content);
  } finally {
    this._inflight.delete(chapterId);
  }
}
```

**Step 3: Create `_startPrefetchQueue` method**

```typescript
public startPrefetchQueue(chapterIds: string[]): void {
  // Cancel any existing prefetch run
  this._prefetchAbortController?.abort();
  this._prefetchAbortController = new AbortController();
  this._prefetchQueue = [...chapterIds];
  this._runPrefetchQueue();
}

private async _runPrefetchQueue(): Promise<void> {
  if (this._prefetching) return;
  this._prefetching = true;
  const signal = this._prefetchAbortController?.signal;

  try {
    while (this._prefetchQueue.length > 0) {
      if (signal?.aborted) break;
      const nextId = this._prefetchQueue.shift()!;
      if (this._generatedContent.has(nextId)) continue;
      await this._prefetchChapter(nextId);
      // Notify webview of progress
      const total = this._session.chapters.filter(
        c => c.trackId === this._session.currentTrackId
      ).length;
      const cached = [...this._generatedContent.keys()].filter(id =>
        this._session.chapters.find(c => c.id === id && c.trackId === this._session.currentTrackId)
      ).length;
      this._postMessage({
        type: 'prefetch:progress', done: cached, total
      } as any);
    }
  } finally {
    this._prefetching = false;
  }
}
```

**Step 4: Update `_loadChapter` to prioritize user requests**

Modify `_loadChapter` so that if the requested chapter is currently being prefetched, we wait on the inflight promise. If it's in the queue, we promote it.

Replace the `if (!content)` block in `_loadChapter` (lines ~177-188):

```typescript
if (!content) {
  const chapter = this._session.chapters.find((c) => c.id === chapterId);
  if (!chapter) {
    throw new Error(`Chapter not found: ${chapterId}`);
  }

  // Promote: remove from prefetch queue if queued
  this._prefetchQueue = this._prefetchQueue.filter(id => id !== chapterId);

  // If already inflight from prefetch, wait for it
  if (this._inflight.has(chapterId)) {
    while (this._inflight.has(chapterId)) {
      await new Promise(r => setTimeout(r, 200));
    }
    content = this._generatedContent.get(chapterId);
  }

  if (!content) {
    const core = getCoreAdapter();
    content = await core.generateChapter(chapter, this._session.analysisResult, getDefaultUserContext());
    this._generatedContent.set(chapterId, content);
  }
}
```

**Step 5: Verify it builds**

Run: `pnpm --filter repo-tutor build`

**Step 6: Commit**

```bash
git add packages/vscode-extension/src/views/LearningPanel.ts
git commit -m "feat: add background prefetch queue to LearningPanel"
```

---

### Task 3: Wire Prefetch into startLearning Flow

**Files:**
- Modify: `packages/vscode-extension/src/commands/startLearning.ts:163-175` (after session creation)

**Step 1: Start prefetch after panel opens**

After `panel.loadChapter(allChapters[0].id)` (end of startLearning), add:

```typescript
// Start background prefetching for current track's chapters
const currentTrackChapters = allChapters
  .filter(c => c.trackId === selectedTracks[0].id)
  .sort((a, b) => a.order - b.order)
  .map(c => c.id);
panel.startPrefetchQueue(currentTrackChapters);
```

**Step 2: Verify it builds**

Run: `pnpm --filter repo-tutor build`

**Step 3: Commit**

```bash
git add packages/vscode-extension/src/commands/startLearning.ts
git commit -m "feat: start background chapter prefetching after session init"
```

---

### Task 4: Add Chapter Skeleton Message Type

**Files:**
- Modify: `packages/vscode-extension/src/views/LearningPanel.ts:40-51` (ExtensionToWebviewMessage type)
- Modify: `spec/contracts/core-extension.md:102-114` (contract)

**Step 1: Add skeleton type to message union**

Add to `ExtensionToWebviewMessage` in `LearningPanel.ts`:

```typescript
| { type: 'chapter:skeleton'; chapterId: string; skeleton: ChapterSkeleton }
| { type: 'prefetch:progress'; done: number; total: number }
```

Add `ChapterSkeleton` interface above the message type:

```typescript
interface ChapterSkeleton {
  title: string;
  order: number;
  trackLabel?: string;
  complexity?: 'low' | 'medium' | 'high';
  focus: string;
  learningObjectives: string[];
  targetFiles: Array<{ path: string; language?: string }>;
  dependencies: Array<{ from: string; to: string }>;
  moduleName?: string;
}
```

**Step 2: Update contract**

Add to `spec/contracts/core-extension.md` Extension → Webview section:

```typescript
| { type: 'chapter:skeleton'; chapterId: string; skeleton: ChapterSkeleton }
| { type: 'prefetch:progress'; done: number; total: number }
```

**Step 3: Commit**

```bash
git add packages/vscode-extension/src/views/LearningPanel.ts spec/contracts/core-extension.md
git commit -m "feat: add chapter:skeleton and prefetch:progress message types"
```

---

### Task 5: Send Skeleton + Render in Webview

**Files:**
- Modify: `packages/vscode-extension/src/views/LearningPanel.ts:169-175` (_loadChapter, send skeleton before loading)
- Modify: `packages/vscode-extension/src/views/LearningPanel.ts:1212-1221` (webview message handler)
- Modify: `packages/vscode-extension/src/views/LearningPanel.ts:821-837` (add renderSkeleton function near renderLoading)

**Step 1: Send skeleton in `_loadChapter` before LLM call**

At the start of `_loadChapter`, after `this._postMessage({ type: 'chapter:loading', chapterId })`, add:

```typescript
// Send skeleton immediately from planner data + analysis
const chapter = this._session.chapters.find(c => c.id === chapterId);
if (chapter) {
  const graph = this._session.analysisResult.dependencyGraph;
  const targetFileSet = new Set(chapter.targetFiles);
  const relevantEdges = (graph?.edges ?? []).filter(
    e => targetFileSet.has(e.from) && targetFileSet.has(e.to)
  );
  const nodes = graph?.nodes ?? [];
  const trackLabel = this._session.detectedTracks?.find(
    t => t.id === chapter.trackId
  )?.label;
  const mod = this._session.analysisResult.modules?.find(
    m => chapter.targetFiles.some(f => f.startsWith(m.path))
  );

  this._postMessage({
    type: 'chapter:skeleton',
    chapterId,
    skeleton: {
      title: chapter.title,
      order: chapter.order,
      trackLabel,
      complexity: chapter.estimatedComplexity,
      focus: chapter.focus,
      learningObjectives: chapter.learningObjectives,
      targetFiles: chapter.targetFiles.map(path => ({
        path,
        language: nodes.find(n => n.path === path)?.language,
      })),
      dependencies: relevantEdges.map(e => ({ from: e.from, to: e.to })),
      moduleName: mod?.name,
    },
  });
}
```

**Step 2: Add `renderSkeleton` function in webview JS**

Add near `renderLoading` (around line 837):

```javascript
function renderSkeleton(skeleton) {
  mainContentEl.replaceChildren();

  // Header
  const h1 = document.createElement('h1');
  h1.textContent = skeleton.title;
  mainContentEl.appendChild(h1);

  const meta = document.createElement('div');
  meta.className = 'chapter-meta';
  const parts = ['Chapter ' + skeleton.order];
  if (skeleton.trackLabel) parts.push(skeleton.trackLabel);
  if (skeleton.complexity) parts.push(skeleton.complexity + ' complexity');
  meta.textContent = parts.join(' · ');
  mainContentEl.appendChild(meta);

  // Learning objectives
  if (skeleton.learningObjectives.length > 0) {
    const objSection = document.createElement('div');
    objSection.className = 'section skeleton-section';
    const objH2 = document.createElement('h2');
    objH2.textContent = 'What you\\'ll learn';
    objSection.appendChild(objH2);
    const ul = document.createElement('ul');
    ul.className = 'objectives-list';
    skeleton.learningObjectives.forEach(function(obj) {
      const li = document.createElement('li');
      li.textContent = obj;
      ul.appendChild(li);
    });
    objSection.appendChild(ul);
    mainContentEl.appendChild(objSection);
  }

  // Files in focus
  if (skeleton.targetFiles.length > 0) {
    const filesSection = document.createElement('div');
    filesSection.className = 'section skeleton-section';
    const filesH2 = document.createElement('h2');
    filesH2.textContent = 'Files in focus';
    filesSection.appendChild(filesH2);

    skeleton.targetFiles.forEach(function(f) {
      const link = document.createElement('a');
      link.className = 'code-ref';
      link.dataset.file = f.path;
      link.textContent = f.path + (f.language ? ' (' + f.language + ')' : '');
      filesSection.appendChild(link);
      filesSection.appendChild(document.createTextNode(' '));
    });

    // Dependency chain
    if (skeleton.dependencies.length > 0) {
      const depDiv = document.createElement('div');
      depDiv.className = 'dependency-chain';
      depDiv.style.marginTop = '12px';
      depDiv.style.fontFamily = 'var(--vscode-editor-font-family)';
      depDiv.style.fontSize = '13px';
      depDiv.style.opacity = '0.8';
      const chain = skeleton.dependencies.map(function(d) {
        return d.from.split('/').pop() + ' → ' + d.to.split('/').pop();
      }).join(', ');
      depDiv.textContent = 'Dependencies: ' + chain;
      filesSection.appendChild(depDiv);
    }

    mainContentEl.appendChild(filesSection);
  }

  // Module context
  if (skeleton.moduleName) {
    const modDiv = document.createElement('div');
    modDiv.className = 'section skeleton-section';
    modDiv.style.opacity = '0.7';
    modDiv.textContent = 'Module: ' + skeleton.moduleName;
    mainContentEl.appendChild(modDiv);
  }

  // Generating indicator
  const genDiv = document.createElement('div');
  genDiv.className = 'loading';
  genDiv.id = 'skeletonLoadingIndicator';
  const spinner = document.createElement('div');
  spinner.className = 'loading-spinner';
  genDiv.appendChild(spinner);
  const genP = document.createElement('p');
  genP.textContent = 'Generating detailed content...';
  genDiv.appendChild(genP);
  mainContentEl.appendChild(genDiv);
}
```

**Step 3: Handle `chapter:skeleton` and `prefetch:progress` in webview message switch**

Add cases in the webview `window.addEventListener('message', ...)` switch:

```javascript
case 'chapter:skeleton':
  state.currentChapterId = message.chapterId;
  renderChapterList();
  renderSkeleton(message.skeleton);
  break;

case 'prefetch:progress':
  // Update subtle progress indicator if present
  var indicator = document.getElementById('prefetchIndicator');
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = 'prefetchIndicator';
    indicator.style.cssText = 'position:fixed;bottom:8px;right:16px;font-size:12px;opacity:0.6;';
    document.body.appendChild(indicator);
  }
  if (message.done >= message.total) {
    indicator.remove();
  } else {
    indicator.textContent = 'Preparing chapters... ' + message.done + '/' + message.total;
  }
  break;
```

**Step 4: Adjust `chapter:loading` handler**

Change the `chapter:loading` handler so it doesn't wipe the skeleton. Replace:

```javascript
case 'chapter:loading':
  state.currentChapterId = message.chapterId;
  renderChapterList();
  renderLoading('Generating chapter content...');
  break;
```

With:

```javascript
case 'chapter:loading':
  state.currentChapterId = message.chapterId;
  renderChapterList();
  // Don't call renderLoading — skeleton is already showing with its own spinner
  break;
```

**Step 5: Add skeleton CSS**

Add in the `<style>` block of `_getHtmlForWebview`:

```css
.skeleton-section {
  animation: fadeIn 0.3s ease-in;
}
.objectives-list {
  list-style: none;
  padding: 0;
}
.objectives-list li {
  padding: 4px 0;
  padding-left: 20px;
  position: relative;
}
.objectives-list li::before {
  content: '○';
  position: absolute;
  left: 0;
  opacity: 0.5;
}
.dependency-chain {
  color: var(--vscode-descriptionForeground);
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
```

**Step 6: Verify it builds**

Run: `pnpm --filter repo-tutor build`

**Step 7: Commit**

```bash
git add packages/vscode-extension/src/views/LearningPanel.ts spec/contracts/core-extension.md
git commit -m "feat: rich chapter skeleton with objectives, files, and dependencies"
```

---

### Task 6: Progressive Analysis-Phase UI

**Files:**
- Modify: `packages/vscode-extension/src/commands/startLearning.ts:90-110` (analysis phase)
- Modify: `packages/vscode-extension/src/views/LearningPanel.ts:40-51` (add init:analysis message)
- Modify: `packages/vscode-extension/src/views/LearningPanel.ts` (webview handler + render)

**Step 1: Add analysis-phase message type**

Add to `ExtensionToWebviewMessage`:

```typescript
| { type: 'init:analyzing'; repoPath: string }
| { type: 'init:planning'; trackCount: number }
```

And to contract.

**Step 2: Open panel early in startLearning**

After track selection and before planning, open the panel in "analyzing" state. Restructure the `withProgress` in `startLearning.ts`:

After the security config and before the analysis `withProgress`, open the learning panel early:

```typescript
// Open panel early with "analyzing" state
const earlySession: SessionState = {
  repoPath,
  analysisResult: { repoPath, languages: [], entryPoints: [], dependencyGraph: { nodes: [], edges: [] }, modules: [], patterns: [], analyzedAt: '' },
  chapters: [],
  securityConfig: securityResult.config!,
  userContext,
  currentChapterId: null,
  currentTrackId: null,
  progress: {},
  startedAt: new Date().toISOString(),
  detectedTracks: [],
  selectedTrackIds: [],
};

const treeProvider = getChaptersTreeProvider();
treeProvider.setSession(earlySession);
const panel = LearningPanel.show(context.extensionUri, earlySession);
panel.postAnalyzing(repoPath);
```

Then update the session in-place as analysis and planning complete.

**Step 3: Add `postAnalyzing` and `updateSession` methods to LearningPanel**

```typescript
public postAnalyzing(repoPath: string): void {
  this._postMessage({ type: 'init:analyzing', repoPath } as any);
}

public updateSession(session: SessionState): void {
  this._session = session;
}
```

**Step 4: Add webview handlers for analysis phase messages**

```javascript
case 'init:analyzing':
  mainContentEl.replaceChildren();
  var analyzeDiv = document.createElement('div');
  analyzeDiv.className = 'loading';
  analyzeDiv.id = 'analyzePhase';
  var analyzeSpinner = document.createElement('div');
  analyzeSpinner.className = 'loading-spinner';
  analyzeDiv.appendChild(analyzeSpinner);
  var analyzeH2 = document.createElement('h2');
  analyzeH2.textContent = 'Scanning repository...';
  analyzeH2.style.margin = '16px 0 8px';
  analyzeDiv.appendChild(analyzeH2);
  var analyzeP = document.createElement('p');
  analyzeP.textContent = message.repoPath;
  analyzeP.style.opacity = '0.7';
  analyzeDiv.appendChild(analyzeP);
  mainContentEl.appendChild(analyzeDiv);
  break;

case 'init:planning':
  var phaseEl = document.getElementById('analyzePhase');
  if (phaseEl) {
    var h2 = phaseEl.querySelector('h2');
    if (h2) h2.textContent = 'Planning ' + message.trackCount + ' track(s)...';
  }
  break;
```

**Step 5: Restructure startLearning to update panel progressively**

This is the most involved change. The pattern is:
1. Open panel + show "analyzing"
2. Run analysis → update session with results
3. Show track selection (this still uses VS Code QuickPick, so panel stays open behind it)
4. Post "planning" message → run parallel planning
5. Update session with chapters → send `init` message → start prefetch

The key is that the panel is visible throughout, giving continuous feedback.

**Step 6: Verify it builds**

Run: `pnpm --filter repo-tutor build`

**Step 7: Manual smoke test**

Open extension → Start Learning. Panel should appear immediately showing "Scanning repository...", then "Planning N track(s)...", then chapters + skeleton.

**Step 8: Commit**

```bash
git add packages/vscode-extension/src/commands/startLearning.ts packages/vscode-extension/src/views/LearningPanel.ts spec/contracts/core-extension.md
git commit -m "feat: progressive analysis-phase UI with early panel opening"
```
