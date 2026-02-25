// packages/core/src/generation/__tests__/evidence-builder.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EvidenceBuilder } from '../evidence-builder';
import type { Chapter, AnalysisResult } from '../../types';
import * as fs from 'fs/promises';

// Mock the fs module
vi.mock('fs/promises');

describe('EvidenceBuilder', () => {
  const mockedFs = vi.mocked(fs);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createMockChapter = (): Chapter => ({
    id: 'ch-1',
    title: 'Test Chapter',
    order: 1,
    focus: 'structure',
    targetFiles: ['src/index.ts', 'src/utils.ts'],
    prerequisites: [],
    learningObjectives: ['Learn structure'],
  });

  const createMockAnalysis = (): AnalysisResult => ({
    repoPath: '/test/project',
    languages: ['typescript'],
    entryPoints: [],
    dependencyGraph: { nodes: [], edges: [] },
    modules: [],
    patterns: [],
    analyzedAt: new Date().toISOString(),
  });

  it('should build evidence pack from chapter files', async () => {
    const mockIndexContent = 'export const main = () => {};';
    const mockUtilsContent = 'export function helper() {}';

    mockedFs.readFile
      .mockResolvedValueOnce(mockIndexContent)
      .mockResolvedValueOnce(mockUtilsContent);

    const builder = new EvidenceBuilder();
    const chapter = createMockChapter();
    const analysis = createMockAnalysis();

    const evidence = await builder.build(chapter, analysis);

    expect(evidence.chapterId).toBe('ch-1');
    expect(evidence.files).toHaveLength(2);
    expect(evidence.files[0].path).toBe('src/index.ts');
    expect(evidence.files[0].content).toBe(mockIndexContent);
    expect(evidence.files[0].language).toBe('typescript');
    expect(evidence.files[0].truncated).toBe(false);
  });

  it('should detect language from file extension', async () => {
    mockedFs.readFile.mockResolvedValue('content');

    const builder = new EvidenceBuilder();
    const chapter: Chapter = {
      id: 'ch-1',
      title: 'Test',
      order: 1,
      focus: 'structure',
      targetFiles: [
        'file.ts',
        'file.js',
        'file.py',
        'file.go',
        'file.json',
        'file.md',
        'file.unknown',
      ],
      prerequisites: [],
      learningObjectives: [],
    };
    const analysis = createMockAnalysis();

    const evidence = await builder.build(chapter, analysis);

    expect(evidence.files[0].language).toBe('typescript');
    expect(evidence.files[1].language).toBe('javascript');
    expect(evidence.files[2].language).toBe('python');
    expect(evidence.files[3].language).toBe('go');
    expect(evidence.files[4].language).toBe('json');
    expect(evidence.files[5].language).toBe('markdown');
    expect(evidence.files[6].language).toBe('text');
  });

  it('should truncate large files', async () => {
    const largeContent = 'x'.repeat(15000);
    mockedFs.readFile.mockResolvedValue(largeContent);

    const builder = new EvidenceBuilder(10000);
    const chapter: Chapter = {
      id: 'ch-1',
      title: 'Test',
      order: 1,
      focus: 'structure',
      targetFiles: ['large-file.ts'],
      prerequisites: [],
      learningObjectives: [],
    };
    const analysis = createMockAnalysis();

    const evidence = await builder.build(chapter, analysis);

    expect(evidence.files[0].truncated).toBe(true);
    expect(evidence.files[0].content.length).toBeLessThan(15000);
    expect(evidence.files[0].content).toContain('... (truncated)');
  });

  it('should skip files that cannot be read', async () => {
    mockedFs.readFile
      .mockResolvedValueOnce('content')
      .mockRejectedValueOnce(new Error('ENOENT'));

    const builder = new EvidenceBuilder();
    const chapter = createMockChapter();
    const analysis = createMockAnalysis();

    const evidence = await builder.build(chapter, analysis);

    expect(evidence.files).toHaveLength(1);
    expect(evidence.files[0].path).toBe('src/index.ts');
  });

  it('should estimate token count', async () => {
    const content = 'x'.repeat(400); // ~100 tokens at 4 chars/token
    mockedFs.readFile.mockResolvedValue(content);

    const builder = new EvidenceBuilder();
    const chapter: Chapter = {
      id: 'ch-1',
      title: 'Test',
      order: 1,
      focus: 'structure',
      targetFiles: ['file.ts'],
      prerequisites: [],
      learningObjectives: [],
    };
    const analysis = createMockAnalysis();

    const evidence = await builder.build(chapter, analysis);

    expect(evidence.totalTokensEstimate).toBe(100);
  });

  it('should handle empty target files', async () => {
    const builder = new EvidenceBuilder();
    const chapter: Chapter = {
      id: 'ch-1',
      title: 'Test',
      order: 1,
      focus: 'structure',
      targetFiles: [],
      prerequisites: [],
      learningObjectives: [],
    };
    const analysis = createMockAnalysis();

    const evidence = await builder.build(chapter, analysis);

    expect(evidence.files).toHaveLength(0);
    expect(evidence.totalTokensEstimate).toBe(0);
  });

  it('should use custom max file chars', async () => {
    const content = 'x'.repeat(500);
    mockedFs.readFile.mockResolvedValue(content);

    const builder = new EvidenceBuilder(100);
    const chapter: Chapter = {
      id: 'ch-1',
      title: 'Test',
      order: 1,
      focus: 'structure',
      targetFiles: ['file.ts'],
      prerequisites: [],
      learningObjectives: [],
    };
    const analysis = createMockAnalysis();

    const evidence = await builder.build(chapter, analysis);

    expect(evidence.files[0].truncated).toBe(true);
    expect(evidence.files[0].content.length).toBeLessThan(500);
  });
});
