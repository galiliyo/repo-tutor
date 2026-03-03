// packages/core/src/generation/__tests__/interface-artifact.test.ts

import { describe, it, expect } from 'vitest';
import { buildInterfaceArtifact } from '../interface-artifact';
import type { AnalysisResult } from '../../types';

const mkAnalysis = (overrides: Partial<AnalysisResult> = {}): AnalysisResult => ({
  repoPath: '/test/project',
  languages: ['typescript'],
  entryPoints: [{ path: 'src/index.ts' }],
  dependencyGraph: {
    nodes: [
      { path: 'src/index.ts' },
      { path: 'src/utils/helpers.ts' },
      { path: 'src/routes/api.ts' },
    ],
    edges: [],
  },
  modules: [
    { name: 'utils', path: 'src/utils', fileCount: 5, description: 'Utility functions' },
    { name: 'routes', path: 'src/routes', fileCount: 3 },
  ],
  patterns: [],
  analyzedAt: new Date().toISOString(),
  ...overrides,
});

describe('buildInterfaceArtifact', () => {
  it('builds a complete artifact from analysis', () => {
    const artifact = buildInterfaceArtifact(mkAnalysis());

    expect(artifact.directoryTree).toContain('src');
    expect(artifact.entryPoints).toEqual(['src/index.ts']);
    expect(artifact.moduleMap).toHaveLength(2);
    expect(artifact.moduleMap[0].name).toBe('utils');
    expect(artifact.moduleMap[0].purpose).toBe('Utility functions');
  });

  it('formats directory tree as indented string', () => {
    const artifact = buildInterfaceArtifact(mkAnalysis());
    const lines = artifact.directoryTree.split('\n');
    // Should contain src/ with nested dirs
    expect(lines.some((l) => l.includes('index.ts'))).toBe(true);
    expect(lines.some((l) => l.includes('utils'))).toBe(true);
  });

  it('maps detected tracks to summaries with keySignals', () => {
    const artifact = buildInterfaceArtifact(
      mkAnalysis({
        detectedTracks: [
          {
            id: 'backend',
            label: 'Backend',
            description: 'Server-side code',
            confidence: 0.9,
            focusTypes: ['http', 'database'],
            suggestedOrder: 1,
          },
        ],
      }),
    );

    expect(artifact.tracks).toHaveLength(1);
    expect(artifact.tracks[0].id).toBe('backend');
    expect(artifact.tracks[0].confidence).toBe(0.9);
    expect(artifact.tracks[0].keySignals.length).toBeGreaterThan(0);
  });

  it('includes http framework in frameworkStack', () => {
    const artifact = buildInterfaceArtifact(
      mkAnalysis({
        http: {
          framework: 'express',
          routes: [],
          middleware: [],
        },
      }),
    );
    expect(artifact.frameworkStack).toContain('express');
  });

  it('handles missing optional fields gracefully', () => {
    const minimal: AnalysisResult = {
      repoPath: '/test',
      languages: [],
      entryPoints: [],
      dependencyGraph: { nodes: [], edges: [] },
      modules: [],
      patterns: [],
      analyzedAt: new Date().toISOString(),
    };

    const artifact = buildInterfaceArtifact(minimal);

    expect(artifact.directoryTree).toBe('(empty)');
    expect(artifact.tracks).toEqual([]);
    expect(artifact.entryPoints).toEqual([]);
    expect(artifact.frameworkStack).toEqual([]);
    expect(artifact.moduleMap).toEqual([]);
  });

  it('handles no tracks', () => {
    const artifact = buildInterfaceArtifact(mkAnalysis({ detectedTracks: undefined }));
    expect(artifact.tracks).toEqual([]);
  });

  it('filters framework stack for backend track', () => {
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

  it('filters framework stack for frontend track', () => {
    const analysis = mkAnalysis({
      modules: [{ name: 'react-app', path: 'src', fileCount: 5 }],
      dependencyGraph: {
        nodes: [
          { path: 'node_modules/react/index.js' },
          { path: 'node_modules/express/index.js' },
        ],
        edges: [],
      },
    });

    const artifact = buildInterfaceArtifact(analysis, 'frontend');
    expect(artifact.frameworkStack).toContain('react');
    expect(artifact.frameworkStack).not.toContain('express');
  });

  it('includes all frameworks for architecture track', () => {
    const analysis = mkAnalysis({
      http: { framework: 'express', routes: [], middleware: [] },
      modules: [{ name: 'react-app', path: 'src', fileCount: 5 }],
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

  it('includes all frameworks when no trackId', () => {
    const analysis = mkAnalysis({
      http: { framework: 'express', routes: [], middleware: [] },
      modules: [{ name: 'react-app', path: 'src', fileCount: 5 }],
    });

    const artifact = buildInterfaceArtifact(analysis);
    // Should include express (from http.framework) at minimum
    expect(artifact.frameworkStack).toContain('express');
  });
});
