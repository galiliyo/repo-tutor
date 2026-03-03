# Multi-Track Learning Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add learning tracks (FE, BE, Architecture, Infra) so users learn both sides of a full-stack repo, not just frontend.

**Architecture:** Analyzer detects tracks via file-presence heuristics. Planner runs once per selected track, scoped to that domain. UI shows track selection after analysis, then tabbed chapter sidebar.

**Tech Stack:** TypeScript, Vitest, VS Code Webview API, Handlebars prompts

**Design doc:** `docs/plans/2026-03-03-multi-track-learning-design.md`

---

### Task 1: Add Track type and update Chapter type

**Files:**
- Create: `packages/core/src/types/track.ts`
- Modify: `packages/core/src/types/chapter.ts:16-25` (add trackId to Chapter)
- Modify: `packages/core/src/types/analysis.ts:75-85` (add detectedTracks to AnalysisResult)
- Modify: `packages/core/src/types/index.ts` (re-export track types)
- Create: `spec/schemas/Track.schema.json`

**Step 1: Write the failing test**

Create `packages/core/src/types/__tests__/track.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { Track, TrackId } from '../track';

describe('Track type', () => {
  it('should allow valid track objects', () => {
    const track: Track = {
      id: 'frontend',
      label: 'Frontend',
      description: 'UI components, state management, routing',
      focusTypes: ['state-management', 'pattern'],
      confidence: 0.8,
      suggestedOrder: 1,
    };
    expect(track.id).toBe('frontend');
    expect(track.confidence).toBeGreaterThanOrEqual(0);
    expect(track.confidence).toBeLessThanOrEqual(1);
  });

  it('should enforce TrackId literals', () => {
    const id: TrackId = 'backend';
    expect(['frontend', 'backend', 'architecture', 'infra']).toContain(id);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @repo-tutor/core test -- src/types/__tests__/track.test.ts`
Expected: FAIL — module `../track` not found

**Step 3: Write Track type**

Create `packages/core/src/types/track.ts`:

```typescript
// packages/core/src/types/track.ts

import type { ChapterFocus } from './chapter';

export type TrackId = 'frontend' | 'backend' | 'architecture' | 'infra';

export interface Track {
  id: TrackId;
  label: string;
  description: string;
  focusTypes: ChapterFocus[];
  confidence: number;       // 0-1
  suggestedOrder: number;   // recommended learning order
}
```

**Step 4: Add trackId to Chapter**

In `packages/core/src/types/chapter.ts`, add `trackId?: string;` to the Chapter interface after `estimatedComplexity`:

```typescript
export interface Chapter {
  id: string;
  title: string;
  order: number;
  focus: ChapterFocus;
  targetFiles: string[];
  prerequisites: string[];
  learningObjectives: string[];
  estimatedComplexity?: 'low' | 'medium' | 'high';
  trackId?: string;
}
```

**Step 5: Add detectedTracks to AnalysisResult**

In `packages/core/src/types/analysis.ts`, add to AnalysisResult after `analyzedAt`:

```typescript
import type { Track } from './track';

export interface AnalysisResult {
  // ... existing fields ...
  analyzedAt: string;
  detectedTracks?: Track[];
}
```

**Step 6: Re-export from index**

In `packages/core/src/types/index.ts`, add:

```typescript
export * from './track';
```

**Step 7: Run test to verify it passes**

Run: `pnpm --filter @repo-tutor/core test -- src/types/__tests__/track.test.ts`
Expected: PASS

**Step 8: Create JSON schema**

Create `spec/schemas/Track.schema.json`:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Track",
  "type": "object",
  "required": ["id", "label", "description", "focusTypes", "confidence", "suggestedOrder"],
  "properties": {
    "id": {
      "type": "string",
      "enum": ["frontend", "backend", "architecture", "infra"]
    },
    "label": { "type": "string" },
    "description": { "type": "string" },
    "focusTypes": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": ["structure", "entry-point", "data-flow", "module", "pattern", "bootstrap", "state-management", "http", "database", "auth", "error-handling"]
      }
    },
    "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
    "suggestedOrder": { "type": "integer", "minimum": 1 }
  }
}
```

**Step 9: Commit**

```bash
git add packages/core/src/types/track.ts packages/core/src/types/__tests__/track.test.ts \
  packages/core/src/types/chapter.ts packages/core/src/types/analysis.ts \
  packages/core/src/types/index.ts spec/schemas/Track.schema.json
git commit -m "feat: add Track type, trackId to Chapter, detectedTracks to AnalysisResult"
```

---

### Task 2: Implement track detection in Analyzer

**Files:**
- Create: `packages/core/src/analysis/track-detector.ts`
- Create: `packages/core/src/analysis/__tests__/track-detector.test.ts`
- Modify: `packages/core/src/analysis/analyzer.ts:18-77` (call track detector, add to result)

**Step 1: Write the failing test**

Create `packages/core/src/analysis/__tests__/track-detector.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { detectTracks } from '../track-detector';
import type { AnalysisResult } from '../../types';

function makeAnalysis(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    repoPath: '/tmp/test-repo',
    languages: ['javascript'],
    entryPoints: [],
    dependencyGraph: { nodes: [], edges: [] },
    modules: [],
    patterns: [],
    analyzedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('detectTracks', () => {
  it('should always detect architecture track', async () => {
    const tracks = await detectTracks('/tmp/test-repo', [], makeAnalysis());
    const arch = tracks.find(t => t.id === 'architecture');
    expect(arch).toBeDefined();
    expect(arch!.confidence).toBeGreaterThan(0);
  });

  it('should detect frontend from React imports', async () => {
    const files = ['src/App.tsx', 'src/components/Header.tsx'];
    const fileContents = new Map([
      ['src/App.tsx', "import React from 'react';\nimport { useState } from 'react';"],
      ['src/components/Header.tsx', "import React from 'react';"],
    ]);
    const tracks = await detectTracks('/tmp/test-repo', files, makeAnalysis(), fileContents);
    const fe = tracks.find(t => t.id === 'frontend');
    expect(fe).toBeDefined();
    expect(fe!.confidence).toBeGreaterThanOrEqual(0.3);
  });

  it('should detect backend from Express imports', async () => {
    const files = ['src/server.ts', 'src/routes/api.ts'];
    const fileContents = new Map([
      ['src/server.ts', "import express from 'express';\napp.listen(3000);"],
      ['src/routes/api.ts', "router.get('/api/users', handler);"],
    ]);
    const tracks = await detectTracks('/tmp/test-repo', files, makeAnalysis(), fileContents);
    const be = tracks.find(t => t.id === 'backend');
    expect(be).toBeDefined();
    expect(be!.confidence).toBeGreaterThanOrEqual(0.3);
  });

  it('should detect infra from Dockerfile', async () => {
    const files = ['Dockerfile', 'docker-compose.yml'];
    const tracks = await detectTracks('/tmp/test-repo', files, makeAnalysis());
    const infra = tracks.find(t => t.id === 'infra');
    expect(infra).toBeDefined();
    expect(infra!.confidence).toBeGreaterThanOrEqual(0.3);
  });

  it('should not suggest tracks below 0.3 confidence', async () => {
    const tracks = await detectTracks('/tmp/test-repo', ['README.md'], makeAnalysis());
    const suggested = tracks.filter(t => t.confidence >= 0.3);
    // Only architecture should be suggested (always present)
    expect(suggested.every(t => t.id === 'architecture')).toBe(true);
  });

  it('should detect frontend from DOM usage', async () => {
    const files = ['src/app.js'];
    const fileContents = new Map([
      ['src/app.js', "document.querySelector('.btn').addEventListener('click', handler);"],
    ]);
    const tracks = await detectTracks('/tmp/test-repo', files, makeAnalysis(), fileContents);
    const fe = tracks.find(t => t.id === 'frontend');
    expect(fe).toBeDefined();
    expect(fe!.confidence).toBeGreaterThan(0);
  });

  it('should detect frontend from directory conventions', async () => {
    const files = [
      'src/components/Button.tsx',
      'src/components/Modal.tsx',
      'src/hooks/useAuth.ts',
      'src/pages/Home.tsx',
    ];
    const tracks = await detectTracks('/tmp/test-repo', files, makeAnalysis());
    const fe = tracks.find(t => t.id === 'frontend');
    expect(fe).toBeDefined();
    expect(fe!.confidence).toBeGreaterThanOrEqual(0.3);
  });

  it('should detect backend from directory conventions', async () => {
    const files = [
      'src/routes/users.ts',
      'src/controllers/auth.ts',
      'src/middleware/cors.ts',
      'src/models/User.ts',
    ];
    const tracks = await detectTracks('/tmp/test-repo', files, makeAnalysis());
    const be = tracks.find(t => t.id === 'backend');
    expect(be).toBeDefined();
    expect(be!.confidence).toBeGreaterThanOrEqual(0.3);
  });

  it('should scale architecture confidence with module count', async () => {
    const fewModules = makeAnalysis({ modules: [{ name: 'src', path: 'src', fileCount: 5 }] });
    const manyModules = makeAnalysis({
      modules: [
        { name: 'api', path: 'api', fileCount: 10 },
        { name: 'lib', path: 'lib', fileCount: 8 },
        { name: 'shared', path: 'shared', fileCount: 6 },
        { name: 'utils', path: 'utils', fileCount: 4 },
        { name: 'config', path: 'config', fileCount: 3 },
      ],
    });

    const tracksFew = await detectTracks('/tmp/test-repo', [], fewModules);
    const tracksMany = await detectTracks('/tmp/test-repo', [], manyModules);

    const archFew = tracksFew.find(t => t.id === 'architecture')!;
    const archMany = tracksMany.find(t => t.id === 'architecture')!;

    expect(archMany.confidence).toBeGreaterThan(archFew.confidence);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @repo-tutor/core test -- src/analysis/__tests__/track-detector.test.ts`
Expected: FAIL — module `../track-detector` not found

**Step 3: Implement track detector**

Create `packages/core/src/analysis/track-detector.ts`:

```typescript
// packages/core/src/analysis/track-detector.ts

import * as fs from 'fs/promises';
import * as path from 'path';
import type { Track, TrackId } from '../types/track';
import type { ChapterFocus } from '../types/chapter';
import type { AnalysisResult } from '../types/analysis';

const TRACK_FOCUS_MAP: Record<TrackId, ChapterFocus[]> = {
  frontend: ['state-management', 'pattern', 'entry-point'],
  backend: ['http', 'database', 'auth', 'error-handling', 'entry-point'],
  architecture: ['structure', 'data-flow', 'bootstrap', 'module'],
  infra: [],  // no existing focus types yet
};

const TRACK_LABELS: Record<TrackId, { label: string; description: string; order: number }> = {
  architecture: {
    label: 'Architecture',
    description: 'Repository structure, data flow, module organization, and bootstrap sequence',
    order: 1,
  },
  frontend: {
    label: 'Frontend',
    description: 'UI components, state management, routing, and client-side patterns',
    order: 2,
  },
  backend: {
    label: 'Backend',
    description: 'API routes, middleware, database access, authentication, and error handling',
    order: 3,
  },
  infra: {
    label: 'Infrastructure',
    description: 'CI/CD pipelines, containers, deployment, and infrastructure-as-code',
    order: 4,
  },
};

// --- Signal definitions ---

const FE_FRAMEWORK_IMPORTS = [
  'react', 'vue', 'angular', 'svelte', 'solid-js', 'preact', 'lit', '@stencil/core',
  'next', 'nuxt', 'remix', '@remix-run',
];

const FE_DIR_PATTERNS = [
  'src/components', 'src/pages', 'src/views', 'src/hooks',
  'src/stores', 'public/', 'static/', 'app/components', 'app/routes',
];

const FE_DOM_PATTERNS = [
  /document\.querySelector/,
  /document\.getElementById/,
  /addEventListener\(/,
  /\.innerHTML/,
  /document\.createElement/,
  /window\./,
  /localStorage\./,
  /sessionStorage\./,
];

const FE_FILE_PATTERNS = [/\.jsx$/, /\.tsx$/];

const FE_BUILD_TOOLS = [
  'webpack', 'vite', 'parcel', 'next', 'nuxt', 'remix',
  '@vitejs/plugin-react', '@sveltejs/kit',
];

const BE_FRAMEWORK_IMPORTS = [
  'express', 'fastify', 'koa', '@nestjs/core', 'hapi', 'hono', 'elysia',
  '@hono/hono',
];

const BE_DIR_PATTERNS = [
  'src/routes', 'src/controllers', 'src/middleware', 'src/models',
  'src/services', 'src/api', 'src/handlers',
];

const BE_SERVER_PATTERNS = [
  /app\.listen\(/,
  /createServer\(/,
  /router\.(get|post|put|delete|patch)\(/,
];

const BE_DB_IMPORTS = [
  'pg', 'mysql2', 'mongoose', 'prisma', '@prisma/client', 'sequelize',
  'typeorm', 'drizzle-orm', 'knex', 'better-sqlite3',
];

const BE_AUTH_IMPORTS = [
  'passport', 'bcrypt', 'bcryptjs', 'jsonwebtoken', 'jose',
  'next-auth', '@auth/core',
];

const BE_QUEUE_IMPORTS = [
  'bull', 'bullmq', 'amqplib', 'kafkajs', 'ioredis',
];

const INFRA_FILES = [
  'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml', '.dockerignore',
  'Jenkinsfile', 'Procfile',
  'vercel.json', 'netlify.toml', 'fly.toml', 'render.yaml',
];

const INFRA_DIR_PATTERNS = [
  '.github/workflows', '.gitlab-ci', '.circleci',
  'terraform', 'k8s', 'helm', '.changeset',
];

const INFRA_FILE_PATTERNS = [/\.tf$/, /bitbucket-pipelines\.yml$/];

const ARCH_DIR_PATTERNS = [
  'src/shared', 'src/common', 'src/lib', 'src/utils', 'packages/',
  'src/types', 'libs/',
];

const ARCH_TOOLS = ['lerna', 'nx', 'turbo', '@nx/workspace'];

/**
 * Detect which learning tracks are relevant for this repo.
 * Uses file-presence heuristics — no LLM calls.
 *
 * @param repoPath absolute path to repo
 * @param files list of relative file paths found by analyzer
 * @param analysis the AnalysisResult (for modules, patterns, etc.)
 * @param fileContents optional map of file path → contents (for import/pattern scanning).
 *   If not provided, files will be read from disk.
 */
export async function detectTracks(
  repoPath: string,
  files: string[],
  analysis: AnalysisResult,
  fileContents?: Map<string, string>,
): Promise<Track[]> {
  const scores: Record<TrackId, number> = {
    frontend: 0,
    backend: 0,
    architecture: 0,
    infra: 0,
  };

  // Read file contents for import scanning (sample first 50 source files)
  const sourceFiles = files.filter(f => /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(f));
  const filesToScan = sourceFiles.slice(0, 50);
  const contents: Map<string, string> = fileContents ?? new Map();

  if (!fileContents) {
    for (const f of filesToScan) {
      try {
        const content = await fs.readFile(path.join(repoPath, f), 'utf-8');
        contents.set(f, content);
      } catch {
        // skip unreadable files
      }
    }
  }

  // --- Frontend signals ---

  // Framework imports (+0.3 each, max 0.3)
  for (const [, content] of contents) {
    if (FE_FRAMEWORK_IMPORTS.some(fw => content.includes(`'${fw}'`) || content.includes(`"${fw}"`))) {
      scores.frontend = Math.min(scores.frontend + 0.3, 1);
      break;
    }
  }

  // Directory conventions (+0.2 each)
  for (const dir of FE_DIR_PATTERNS) {
    if (files.some(f => f.startsWith(dir) || f.includes('/' + dir))) {
      scores.frontend = Math.min(scores.frontend + 0.2, 1);
      break;
    }
  }

  // .jsx/.tsx files (+0.1)
  if (files.some(f => FE_FILE_PATTERNS.some(p => p.test(f)))) {
    scores.frontend = Math.min(scores.frontend + 0.1, 1);
  }

  // DOM usage (+0.2)
  for (const [, content] of contents) {
    if (FE_DOM_PATTERNS.some(p => p.test(content))) {
      scores.frontend = Math.min(scores.frontend + 0.2, 1);
      break;
    }
  }

  // Build tools in package.json (+0.1)
  try {
    const pkgJson = await fs.readFile(path.join(repoPath, 'package.json'), 'utf-8');
    if (FE_BUILD_TOOLS.some(tool => pkgJson.includes(`"${tool}"`))) {
      scores.frontend = Math.min(scores.frontend + 0.1, 1);
    }
  } catch {
    // no package.json
  }

  // CSS modules (+0.1)
  if (files.some(f => f.endsWith('.module.css') || f.endsWith('.module.scss'))) {
    scores.frontend = Math.min(scores.frontend + 0.1, 1);
  }

  // --- Backend signals ---

  // Framework imports (+0.3)
  for (const [, content] of contents) {
    if (BE_FRAMEWORK_IMPORTS.some(fw => content.includes(`'${fw}'`) || content.includes(`"${fw}"`))) {
      scores.backend = Math.min(scores.backend + 0.3, 1);
      break;
    }
  }

  // Directory conventions (+0.2)
  for (const dir of BE_DIR_PATTERNS) {
    if (files.some(f => f.startsWith(dir) || f.includes('/' + dir))) {
      scores.backend = Math.min(scores.backend + 0.2, 1);
      break;
    }
  }

  // Server patterns (+0.2)
  for (const [, content] of contents) {
    if (BE_SERVER_PATTERNS.some(p => p.test(content))) {
      scores.backend = Math.min(scores.backend + 0.2, 1);
      break;
    }
  }

  // DB imports (+0.2)
  for (const [, content] of contents) {
    if (BE_DB_IMPORTS.some(pkg => content.includes(`'${pkg}'`) || content.includes(`"${pkg}"`))) {
      scores.backend = Math.min(scores.backend + 0.2, 1);
      break;
    }
  }

  // Auth imports (+0.1)
  for (const [, content] of contents) {
    if (BE_AUTH_IMPORTS.some(pkg => content.includes(`'${pkg}'`) || content.includes(`"${pkg}"`))) {
      scores.backend = Math.min(scores.backend + 0.1, 1);
      break;
    }
  }

  // Queue/worker imports (+0.1)
  for (const [, content] of contents) {
    if (BE_QUEUE_IMPORTS.some(pkg => content.includes(`'${pkg}'`) || content.includes(`"${pkg}"`))) {
      scores.backend = Math.min(scores.backend + 0.1, 1);
      break;
    }
  }

  // AnalysisResult http field (+0.2)
  if (analysis.http && analysis.http.framework !== 'none' && analysis.http.framework !== 'unknown') {
    scores.backend = Math.min(scores.backend + 0.2, 1);
  }

  // --- Infrastructure signals ---

  // Known infra files (+0.3 each, max 0.3)
  if (files.some(f => INFRA_FILES.includes(path.basename(f)))) {
    scores.infra = Math.min(scores.infra + 0.3, 1);
  }

  // Infra directories (+0.2)
  for (const dir of INFRA_DIR_PATTERNS) {
    if (files.some(f => f.startsWith(dir) || f.includes('/' + dir))) {
      scores.infra = Math.min(scores.infra + 0.2, 1);
      break;
    }
  }

  // Infra file extensions (+0.1)
  if (files.some(f => INFRA_FILE_PATTERNS.some(p => p.test(f)))) {
    scores.infra = Math.min(scores.infra + 0.1, 1);
  }

  // --- Architecture signals (always present, scales with complexity) ---

  // Base score (every repo has some architecture)
  scores.architecture = 0.3;

  // Module count scaling (+0.1 per module beyond 1, max +0.4)
  const moduleBonus = Math.min((analysis.modules.length - 1) * 0.1, 0.4);
  scores.architecture = Math.min(scores.architecture + Math.max(0, moduleBonus), 1);

  // Shared/common dirs (+0.1)
  for (const dir of ARCH_DIR_PATTERNS) {
    if (files.some(f => f.startsWith(dir) || f.includes('/' + dir))) {
      scores.architecture = Math.min(scores.architecture + 0.1, 1);
      break;
    }
  }

  // Monorepo tools (+0.1)
  try {
    const pkgJson = await fs.readFile(path.join(repoPath, 'package.json'), 'utf-8');
    if (ARCH_TOOLS.some(tool => pkgJson.includes(`"${tool}"`)) || pkgJson.includes('"workspaces"')) {
      scores.architecture = Math.min(scores.architecture + 0.1, 1);
    }
  } catch {
    // no package.json
  }

  // Dependency graph depth (+0.1 if layers > 3)
  if (analysis.dependencyGraph.layers && analysis.dependencyGraph.layers.length > 3) {
    scores.architecture = Math.min(scores.architecture + 0.1, 1);
  }

  // --- Build track list ---

  const trackIds: TrackId[] = ['frontend', 'backend', 'architecture', 'infra'];
  return trackIds.map(id => ({
    id,
    ...TRACK_LABELS[id],
    focusTypes: TRACK_FOCUS_MAP[id],
    confidence: Math.round(scores[id] * 100) / 100,  // round to 2 decimals
  }));
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @repo-tutor/core test -- src/analysis/__tests__/track-detector.test.ts`
Expected: PASS

**Step 5: Wire into Analyzer**

In `packages/core/src/analysis/analyzer.ts`, import and call `detectTracks`:

Add import at top:
```typescript
import { detectTracks } from './track-detector';
```

In `analyze()` method, before the return statement, add:
```typescript
    const detectedTracks = await detectTracks(absolutePath, files, result);
```

Where `result` is the AnalysisResult being built. Restructure to build result first, then add tracks:

```typescript
    const result: AnalysisResult = {
      repoPath: absolutePath,
      languages: Array.from(languages),
      entryPoints,
      dependencyGraph,
      modules,
      patterns: [],
      analyzedAt: new Date().toISOString(),
    };

    result.detectedTracks = await detectTracks(absolutePath, files, result);

    return result;
```

**Step 6: Run all analyzer tests**

Run: `pnpm --filter @repo-tutor/core test -- src/analysis/`
Expected: PASS

**Step 7: Commit**

```bash
git add packages/core/src/analysis/track-detector.ts \
  packages/core/src/analysis/__tests__/track-detector.test.ts \
  packages/core/src/analysis/analyzer.ts
git commit -m "feat: add track detection heuristics to analyzer"
```

---

### Task 3: Update Planner to accept Track parameter

**Files:**
- Modify: `packages/core/src/generation/planner.ts:1-42` (add track param)
- Modify: `spec/prompts/planner.md` (add track context section)
- Modify: `packages/core/src/core.ts:101-104` (update planChapters signature)
- Test: `packages/core/src/generation/__tests__/planner.test.ts`

**Step 1: Write the failing test**

In `packages/core/src/generation/__tests__/planner.test.ts`, add a new test (or create the file if it doesn't exist):

```typescript
import { describe, it, expect, vi } from 'vitest';
import { Planner } from '../planner';
import type { Track } from '../../types/track';
import type { AnalysisResult, UserContext } from '../../types';

describe('Planner with track', () => {
  it('should pass track context to prompt template', async () => {
    const mockLoad = vi.fn().mockReturnValue('rendered prompt');
    const mockComplete = vi.fn().mockResolvedValue({
      content: '{"chapters": []}',
      tokensUsed: 100,
    });

    const planner = new Planner(
      { complete: mockComplete } as any,
      { load: mockLoad } as any,
    );

    const track: Track = {
      id: 'backend',
      label: 'Backend',
      description: 'API routes and server logic',
      focusTypes: ['http', 'database', 'auth', 'error-handling', 'entry-point'],
      confidence: 0.9,
      suggestedOrder: 2,
    };

    const analysis: AnalysisResult = {
      repoPath: '/test',
      languages: ['typescript'],
      entryPoints: [],
      dependencyGraph: { nodes: [], edges: [] },
      modules: [],
      patterns: [],
      analyzedAt: new Date().toISOString(),
    };

    const userContext: UserContext = {
      preferredLanguage: 'typescript',
      skillLevel: 'intermediate',
    };

    await planner.plan(analysis, userContext, track);

    // Verify track was passed to template
    const templateVars = mockLoad.mock.calls[0][1];
    expect(templateVars.trackId).toBe('backend');
    expect(templateVars.trackLabel).toBe('Backend');
    expect(templateVars.trackDescription).toBe('API routes and server logic');
    expect(templateVars.trackFocusTypes).toContain('http');
  });

  it('should work without track (backward compat)', async () => {
    const mockLoad = vi.fn().mockReturnValue('rendered prompt');
    const mockComplete = vi.fn().mockResolvedValue({
      content: '{"chapters": []}',
      tokensUsed: 100,
    });

    const planner = new Planner(
      { complete: mockComplete } as any,
      { load: mockLoad } as any,
    );

    await planner.plan(
      {
        repoPath: '/test', languages: [], entryPoints: [],
        dependencyGraph: { nodes: [], edges: [] }, modules: [],
        patterns: [], analyzedAt: '',
      },
      { preferredLanguage: 'typescript', skillLevel: 'beginner' },
    );

    const templateVars = mockLoad.mock.calls[0][1];
    expect(templateVars.trackId).toBeUndefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @repo-tutor/core test -- src/generation/__tests__/planner.test.ts`
Expected: FAIL — `plan()` doesn't accept track param yet

**Step 3: Update Planner.plan() signature**

In `packages/core/src/generation/planner.ts`, update the `plan` method to accept an optional `Track`:

```typescript
import type { Track } from '../types/track';

// In the plan method:
async plan(
  analysis: AnalysisResult,
  userContext: UserContext,
  track?: Track,
): Promise<Chapter[]> {
  const variables: Record<string, unknown> = {
    userPreferredLanguage: userContext.preferredLanguage,
    skillLevel: userContext.skillLevel,
    languages: analysis.languages.join(', '),
    entryPoints: analysis.entryPoints,
    patterns: analysis.patterns,
    http: analysis.http || { framework: 'none', routes: [], middleware: [] },
    stateManagement: analysis.stateManagement || { type: 'none', stores: [], actions: [], selectors: [] },
    modules: analysis.modules,
    dependencyLayers: (analysis.dependencyGraph.layers || [])
      .map((layer, i) => `Layer ${i + 1}: ${layer.join(', ')}`)
      .join('\n'),
  };

  // Add track context if provided
  if (track) {
    variables.trackId = track.id;
    variables.trackLabel = track.label;
    variables.trackDescription = track.description;
    variables.trackFocusTypes = track.focusTypes.join(', ');
  }

  const prompt = this.promptLoader.load('planner', variables);
  // ... rest of method unchanged
```

**Step 4: Update planner prompt template**

In `spec/prompts/planner.md`, add a track section after the Context block. Use Handlebars conditionals:

```markdown
{{#if trackId}}
# Track Focus

You are creating chapters for the **{{trackLabel}}** track only.
Track description: {{trackDescription}}

Use ONLY these focus types: {{trackFocusTypes}}
Scope all chapters to this domain. If a concept spans multiple domains, teach it from the {{trackLabel}} perspective — focus on the files and patterns within this domain.
{{/if}}
```

**Step 5: Update RepoTutorCore**

In `packages/core/src/core.ts`, update `planChapters`:

```typescript
import type { Track } from './types/track';

async planChapters(
  analysis: AnalysisResult,
  userContext: UserContext,
  track?: Track,
): Promise<Chapter[]> {
  this.ensureLLMConfigured();
  return this.planner!.plan(analysis, userContext, track);
}
```

**Step 6: Run tests**

Run: `pnpm --filter @repo-tutor/core test`
Expected: PASS (new test + existing tests still pass due to backward compat)

**Step 7: Commit**

```bash
git add packages/core/src/generation/planner.ts packages/core/src/core.ts \
  spec/prompts/planner.md packages/core/src/generation/__tests__/planner.test.ts
git commit -m "feat: planner accepts optional Track to scope chapter generation"
```

---

### Task 4: Update SessionState and extension contract

**Files:**
- Modify: `packages/vscode-extension/src/views/ChaptersTreeProvider.ts:1-20` (update SessionState)
- Modify: `spec/contracts/core-extension.md` (add track messages)

**Step 1: Update SessionState type**

In `packages/vscode-extension/src/views/ChaptersTreeProvider.ts`, add to SessionState:

```typescript
import type { Track } from '@repo-tutor/core';

export interface SessionState {
  // ... existing fields ...
  detectedTracks: Track[];
  selectedTrackIds: string[];
  currentTrackId: string | null;
}
```

**Step 2: Update contract**

In `spec/contracts/core-extension.md`, add to Extension → Webview messages:

```markdown
| `tracks:detected` | `{ tracks: Track[] }` | After analysis, before chapter planning |
```

Add to Webview → Extension messages:

```markdown
| `tracks:selected` | `{ trackIds: string[] }` | User picks which tracks to learn |
```

Update `init` message to include `tracks: Track[]`.

**Step 3: Commit**

```bash
git add packages/vscode-extension/src/views/ChaptersTreeProvider.ts \
  spec/contracts/core-extension.md
git commit -m "feat: update SessionState and contract for track support"
```

---

### Task 5: Update startLearning command flow

**Files:**
- Modify: `packages/vscode-extension/src/commands/startLearning.ts` (add track selection step)

**Step 1: Add track selection QuickPick**

Between analysis and planning in `startLearning.ts`, add a track selection step:

```typescript
// After analysis, before planning:
const detectedTracks = analysisResult.detectedTracks || [];
const suggestedTracks = detectedTracks.filter(t => t.confidence >= 0.3);

// Let user pick tracks via QuickPick
const trackItems = detectedTracks
  .sort((a, b) => a.suggestedOrder - b.suggestedOrder)
  .map(t => ({
    label: t.label,
    description: `${Math.round(t.confidence * 100)}% confidence`,
    detail: t.description,
    picked: t.confidence >= 0.3,  // pre-select suggested tracks
    track: t,
  }));

const selectedItems = await vscode.window.showQuickPick(trackItems, {
  title: 'Select Learning Tracks',
  placeHolder: 'Choose which parts of the codebase to learn',
  canPickMany: true,
});

if (!selectedItems || selectedItems.length === 0) {
  vscode.window.showInformationMessage('No tracks selected, session cancelled');
  return;
}

const selectedTracks = selectedItems.map(item => item.track);

// Plan chapters for each selected track
progress.report({ message: 'Planning chapters...', increment: 50 });

const allChapters: Chapter[] = [];
for (const track of selectedTracks) {
  const trackChapters = await core.planChapters(analysisResult, userContext, track);
  // Stamp trackId on each chapter
  trackChapters.forEach(ch => { ch.trackId = track.id; });
  allChapters.push(...trackChapters);
}
```

Update session creation to include track fields:

```typescript
const session = {
  repoPath,
  analysisResult,
  chapters: allChapters,
  securityConfig: securityResult.config,
  userContext,
  currentChapterId: allChapters.length > 0 ? allChapters[0].id : null,
  currentTrackId: selectedTracks.length > 0 ? selectedTracks[0].id : null,
  progress: {},
  startedAt: new Date().toISOString(),
  detectedTracks,
  selectedTrackIds: selectedTracks.map(t => t.id),
};
```

**Step 2: Build and verify**

Run: `pnpm --filter repo-tutor build`
Expected: builds without errors

**Step 3: Commit**

```bash
git add packages/vscode-extension/src/commands/startLearning.ts
git commit -m "feat: add track selection step to startLearning command"
```

---

### Task 6: Add track tabs to webview sidebar

**Files:**
- Modify: `packages/vscode-extension/src/views/LearningPanel.ts` (webview HTML/JS)

**Step 1: Update init message handler**

In the webview JS `init` case, store tracks in state:

```javascript
case 'init':
  state.chapters = message.chapters;
  state.currentChapterId = message.currentChapterId;
  state.tracks = message.tracks || [];
  state.currentTrackId = message.currentTrackId || (state.tracks[0] && state.tracks[0].id) || null;
  renderTrackTabs();
  renderChapterList();
  // ...
```

**Step 2: Add track tabs HTML/CSS**

Add CSS for track tabs:

```css
.track-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.track-tab {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.8em;
  cursor: pointer;
  background: var(--vscode-input-background);
  border: 1px solid var(--vscode-input-border);
}
.track-tab.active {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border-color: var(--vscode-button-background);
}
```

Add track tabs container in sidebar HTML, before the chapter list:

```html
<div id="trackTabs" class="track-tabs"></div>
```

**Step 3: Add renderTrackTabs function**

```javascript
function renderTrackTabs() {
  const tabsEl = document.getElementById('trackTabs');
  if (!tabsEl || !state.tracks || state.tracks.length <= 1) return;

  tabsEl.replaceChildren();
  state.tracks.forEach(track => {
    const tab = document.createElement('div');
    tab.className = 'track-tab' + (track.id === state.currentTrackId ? ' active' : '');
    tab.textContent = track.label;
    tab.addEventListener('click', () => {
      state.currentTrackId = track.id;
      renderTrackTabs();
      renderChapterList();
    });
    tabsEl.appendChild(tab);
  });
}
```

**Step 4: Filter chapter list by current track**

In `renderChapterList()`, filter chapters by track:

```javascript
function renderChapterList() {
  const filteredChapters = state.currentTrackId
    ? state.chapters.filter(ch => ch.trackId === state.currentTrackId)
    : state.chapters;

  const items = filteredChapters
    .sort((a, b) => a.order - b.order)
    .map(ch => {
      // ... existing li creation code ...
    });
  // ...
}
```

**Step 5: Update _postMessage init to include tracks**

In the extension TypeScript, update the `init` message in `_handleMessage`:

```typescript
case 'ready':
  this._postMessage({
    type: 'init',
    chapters: this._session.chapters,
    currentChapterId: this._session.currentChapterId,
    tracks: this._session.selectedTrackIds
      ? (this._session.detectedTracks || []).filter(t =>
          this._session.selectedTrackIds.includes(t.id))
      : [],
    currentTrackId: this._session.currentTrackId || null,
  });
  break;
```

Update `ExtensionToWebviewMessage` type to include tracks:

```typescript
| { type: 'init'; chapters: Chapter[]; currentChapterId: string | null; tracks?: Track[]; currentTrackId?: string | null }
```

**Step 6: Build and verify**

Run: `pnpm --filter repo-tutor build`
Expected: PASS

**Step 7: Commit**

```bash
git add packages/vscode-extension/src/views/LearningPanel.ts
git commit -m "feat: add track tabs to webview sidebar, filter chapters by track"
```

---

### Task 7: Update ChaptersTreeProvider for tracks

**Files:**
- Modify: `packages/vscode-extension/src/views/ChaptersTreeProvider.ts`

**Step 1: Group chapters by track in tree view**

Update `getChildren()` to group chapters under track headers when multiple tracks are selected:

```typescript
getChildren(element?: ChapterTreeItem): Thenable<ChapterTreeItem[]> {
  if (!this.session) return Promise.resolve([]);

  // If multiple tracks, show track groups at top level
  if (!element && this.session.selectedTrackIds?.length > 1) {
    const trackItems = (this.session.detectedTracks || [])
      .filter(t => this.session!.selectedTrackIds.includes(t.id))
      .sort((a, b) => a.suggestedOrder - b.suggestedOrder)
      .map(t => new TrackTreeItem(t));
    return Promise.resolve(trackItems);
  }

  // Get chapters for the track (or all if single track / no element)
  const trackId = element instanceof TrackTreeItem ? element.track.id : null;
  const chapters = this.session.chapters
    .filter(ch => !trackId || ch.trackId === trackId)
    .sort((a, b) => a.order - b.order);

  return Promise.resolve(
    chapters.map(ch => new ChapterTreeItem(ch, this.getChapterStatus(ch)))
  );
}
```

Add `TrackTreeItem` class:

```typescript
class TrackTreeItem extends vscode.TreeItem {
  constructor(public readonly track: Track) {
    super(track.label, vscode.TreeItemCollapsibleState.Expanded);
    this.description = track.description;
    this.contextValue = 'track';
  }
}
```

**Step 2: Build and verify**

Run: `pnpm --filter repo-tutor build`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/vscode-extension/src/views/ChaptersTreeProvider.ts
git commit -m "feat: group chapters by track in tree view sidebar"
```

---

### Task 8: End-to-end integration test

**Files:**
- Create: `packages/core/src/__tests__/tracks-integration.test.ts`

**Step 1: Write integration test**

```typescript
import { describe, it, expect } from 'vitest';
import { detectTracks } from '../analysis/track-detector';
import type { AnalysisResult } from '../types';

describe('Track detection integration', () => {
  it('should detect frontend + backend + architecture for a full-stack file list', async () => {
    const files = [
      // Frontend
      'src/components/App.tsx',
      'src/components/Header.tsx',
      'src/hooks/useAuth.ts',
      'src/pages/Home.tsx',
      'src/stores/userStore.ts',
      // Backend
      'server/routes/api.ts',
      'server/controllers/users.ts',
      'server/middleware/auth.ts',
      'server/models/User.ts',
      // Infra
      'Dockerfile',
      '.github/workflows/ci.yml',
      // Shared
      'src/shared/types.ts',
      'src/utils/format.ts',
    ];

    const fileContents = new Map([
      ['src/components/App.tsx', "import React from 'react';"],
      ['server/routes/api.ts', "import express from 'express';\nrouter.get('/api', handler);"],
      ['server/controllers/users.ts', "import { Request } from 'express';"],
      ['server/middleware/auth.ts', "import jwt from 'jsonwebtoken';"],
    ]);

    const analysis: AnalysisResult = {
      repoPath: '/tmp/fullstack-app',
      languages: ['typescript'],
      entryPoints: [],
      dependencyGraph: { nodes: [], edges: [], layers: [['server/routes/api.ts'], ['src/components/App.tsx']] },
      modules: [
        { name: 'src', path: 'src', fileCount: 6 },
        { name: 'server', path: 'server', fileCount: 4 },
      ],
      patterns: [],
      analyzedAt: new Date().toISOString(),
    };

    const tracks = await detectTracks('/tmp/fullstack-app', files, analysis, fileContents);

    const fe = tracks.find(t => t.id === 'frontend')!;
    const be = tracks.find(t => t.id === 'backend')!;
    const arch = tracks.find(t => t.id === 'architecture')!;
    const infra = tracks.find(t => t.id === 'infra')!;

    expect(fe.confidence).toBeGreaterThanOrEqual(0.3);
    expect(be.confidence).toBeGreaterThanOrEqual(0.3);
    expect(arch.confidence).toBeGreaterThanOrEqual(0.3);
    expect(infra.confidence).toBeGreaterThanOrEqual(0.3);
  });

  it('should return low confidence for tracks with no signals', async () => {
    const files = ['README.md', 'LICENSE'];
    const analysis: AnalysisResult = {
      repoPath: '/tmp/empty-repo',
      languages: [],
      entryPoints: [],
      dependencyGraph: { nodes: [], edges: [] },
      modules: [],
      patterns: [],
      analyzedAt: new Date().toISOString(),
    };

    const tracks = await detectTracks('/tmp/empty-repo', files, analysis);

    const fe = tracks.find(t => t.id === 'frontend')!;
    const be = tracks.find(t => t.id === 'backend')!;
    const infra = tracks.find(t => t.id === 'infra')!;

    expect(fe.confidence).toBeLessThan(0.3);
    expect(be.confidence).toBeLessThan(0.3);
    expect(infra.confidence).toBeLessThan(0.3);
  });
});
```

**Step 2: Run integration test**

Run: `pnpm --filter @repo-tutor/core test -- src/__tests__/tracks-integration.test.ts`
Expected: PASS

**Step 3: Run full test suite**

Run: `pnpm --filter @repo-tutor/core test`
Expected: PASS

**Step 4: Build extension**

Run: `pnpm --filter repo-tutor build`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/core/src/__tests__/tracks-integration.test.ts
git commit -m "test: add track detection integration tests"
```
