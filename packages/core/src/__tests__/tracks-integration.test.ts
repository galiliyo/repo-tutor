import { describe, it, expect } from 'vitest';
import { detectTracks } from '../analysis/track-detector';
import type { AnalysisResult } from '../types';

describe('Track detection integration', () => {
  it('should detect frontend + backend + architecture + infra for a full-stack file list', async () => {
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

    // All 4 tracks should be detected (>= 0.3 threshold)
    expect(fe).toBeDefined();
    expect(be).toBeDefined();
    expect(arch).toBeDefined();
    expect(infra).toBeDefined();

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

    expect(tracks).toHaveLength(4); // all tracks always returned

    const fe = tracks.find(t => t.id === 'frontend')!;
    const be = tracks.find(t => t.id === 'backend')!;
    const infra = tracks.find(t => t.id === 'infra')!;

    expect(fe.confidence).toBeLessThan(0.3);
    expect(be.confidence).toBeLessThan(0.3);
    expect(infra.confidence).toBeLessThan(0.3);
  });

  it('should detect only frontend for a React-only app', async () => {
    const files = [
      'src/App.tsx',
      'src/components/Button.tsx',
      'src/hooks/useTheme.ts',
      'src/pages/Home.tsx',
    ];

    const fileContents = new Map([
      ['src/App.tsx', "import React from 'react';\nimport { BrowserRouter } from 'react-router-dom';"],
      ['src/components/Button.tsx', "import React from 'react';"],
    ]);

    const analysis: AnalysisResult = {
      repoPath: '/tmp/react-app',
      languages: ['typescript'],
      entryPoints: [{ path: 'src/App.tsx', reason: 'common entry' }],
      dependencyGraph: { nodes: [], edges: [] },
      modules: [{ name: 'src', path: 'src', fileCount: 4 }],
      patterns: [],
      analyzedAt: new Date().toISOString(),
    };

    const tracks = await detectTracks('/tmp/react-app', files, analysis, fileContents);

    const fe = tracks.find(t => t.id === 'frontend')!;
    const be = tracks.find(t => t.id === 'backend')!;

    expect(fe.confidence).toBeGreaterThanOrEqual(0.3);
    expect(be.confidence).toBeLessThan(0.3);
  });
});
