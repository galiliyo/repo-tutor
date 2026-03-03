// packages/core/src/analysis/__tests__/track-detector.test.ts

import { describe, it, expect } from 'vitest';
import { detectTracks } from '../track-detector';
import type { AnalysisResult } from '../../types';

function stubAnalysis(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    repoPath: '/fake',
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
  it('always detects architecture track with confidence > 0', async () => {
    const tracks = await detectTracks('/fake', ['src/index.ts'], stubAnalysis(), new Map());
    const arch = tracks.find(t => t.id === 'architecture');
    expect(arch).toBeDefined();
    expect(arch!.confidence).toBeGreaterThan(0);
  });

  it('detects frontend from React imports', async () => {
    const files = ['src/App.tsx'];
    const contents = new Map([
      ['src/App.tsx', "import React from 'react';\nexport default function App() { return <div/>; }"],
    ]);
    const tracks = await detectTracks('/fake', files, stubAnalysis(), contents);
    const fe = tracks.find(t => t.id === 'frontend');
    expect(fe).toBeDefined();
    expect(fe!.confidence).toBeGreaterThanOrEqual(0.3);
  });

  it('detects frontend from DOM usage', async () => {
    const files = ['src/main.tsx'];
    const contents = new Map([
      ['src/main.tsx', "const el = document.querySelector('#app');\nel.textContent = 'hi';"],
    ]);
    const tracks = await detectTracks('/fake', files, stubAnalysis(), contents);
    const fe = tracks.find(t => t.id === 'frontend');
    expect(fe).toBeDefined();
    // DOM APIs (+0.2) + .tsx file (+0.1) = 0.3
    expect(fe!.confidence).toBeGreaterThanOrEqual(0.3);
  });

  it('detects frontend from directory conventions', async () => {
    const files = ['src/components/Button.tsx', 'src/hooks/useAuth.ts', 'src/pages/Home.tsx'];
    const contents = new Map<string, string>();
    const tracks = await detectTracks('/fake', files, stubAnalysis(), contents);
    const fe = tracks.find(t => t.id === 'frontend');
    expect(fe).toBeDefined();
    expect(fe!.confidence).toBeGreaterThanOrEqual(0.2);
  });

  it('detects backend from Express imports', async () => {
    const files = ['src/server.ts'];
    const contents = new Map([
      ['src/server.ts', "import express from 'express';\nconst app = express();\napp.listen(3000);"],
    ]);
    const tracks = await detectTracks('/fake', files, stubAnalysis(), contents);
    const be = tracks.find(t => t.id === 'backend');
    expect(be).toBeDefined();
    expect(be!.confidence).toBeGreaterThanOrEqual(0.3);
  });

  it('detects backend from directory conventions', async () => {
    const files = ['src/routes/users.ts', 'src/controllers/auth.ts', 'src/middleware/logger.ts'];
    // Add http analysis to push over 0.3 threshold (dirs +0.2, http +0.2)
    const analysis = stubAnalysis({ http: { framework: 'express', routes: [], middleware: [] } });
    const contents = new Map<string, string>();
    const tracks = await detectTracks('/fake', files, analysis, contents);
    const be = tracks.find(t => t.id === 'backend');
    expect(be).toBeDefined();
    expect(be!.confidence).toBeGreaterThanOrEqual(0.3);
  });

  it('detects infra from Dockerfile', async () => {
    const files = ['Dockerfile', 'src/index.ts'];
    const contents = new Map<string, string>();
    const tracks = await detectTracks('/fake', files, stubAnalysis(), contents);
    const infra = tracks.find(t => t.id === 'infra');
    expect(infra).toBeDefined();
    expect(infra!.confidence).toBeGreaterThanOrEqual(0.3);
  });

  it('returns all 4 tracks even when confidence is low', async () => {
    const tracks = await detectTracks('/fake', [], stubAnalysis(), new Map());
    expect(tracks).toHaveLength(4);
    // FE/BE/infra should have 0 confidence with no signals
    const fe = tracks.find(t => t.id === 'frontend')!;
    const be = tracks.find(t => t.id === 'backend')!;
    const infra = tracks.find(t => t.id === 'infra')!;
    expect(fe.confidence).toBe(0);
    expect(be.confidence).toBe(0);
    expect(infra.confidence).toBe(0);
  });

  it('architecture confidence scales with module count', async () => {
    const fewModules = stubAnalysis({
      modules: [
        { name: 'src', path: 'src', fileCount: 5 },
      ],
    });
    const manyModules = stubAnalysis({
      modules: [
        { name: 'auth', path: 'auth', fileCount: 5 },
        { name: 'api', path: 'api', fileCount: 5 },
        { name: 'db', path: 'db', fileCount: 5 },
        { name: 'utils', path: 'utils', fileCount: 5 },
        { name: 'core', path: 'core', fileCount: 5 },
      ],
    });

    const tracksFew = await detectTracks('/fake', ['src/a.ts'], fewModules, new Map());
    const tracksMany = await detectTracks('/fake', ['a.ts'], manyModules, new Map());

    const archFew = tracksFew.find(t => t.id === 'architecture')!;
    const archMany = tracksMany.find(t => t.id === 'architecture')!;

    expect(archMany.confidence).toBeGreaterThan(archFew.confidence);
  });
});
