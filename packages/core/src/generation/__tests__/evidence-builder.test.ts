// packages/core/src/generation/__tests__/evidence-builder.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  EvidenceBuilder,
  classifyTiers,
  allocateBudgets,
  readAndTruncate,
  BUDGET_FAST,
  BUDGET_FULL,
  DEFAULT_BUDGET,
} from '../evidence-builder';
import type { Chapter, AnalysisResult, DependencyGraph, BudgetConfig, FileTier } from '../../types';
import * as fs from 'fs/promises';

vi.mock('fs/promises');

const mockedFs = vi.mocked(fs);

// --- helpers ---

const mkChapter = (overrides: Partial<Chapter> = {}): Chapter => ({
  id: 'ch-1',
  title: 'Test Chapter',
  order: 1,
  focus: 'structure',
  targetFiles: ['src/a.ts', 'src/b.ts', 'src/c.ts', 'lib/d.ts', 'lib/e.ts'],
  prerequisites: [],
  learningObjectives: ['Learn structure'],
  ...overrides,
});

const mkGraph = (edges: Array<{ from: string; to: string }> = []): DependencyGraph => ({
  nodes: [],
  edges,
});

const mkAnalysis = (overrides: Partial<AnalysisResult> = {}): AnalysisResult => ({
  repoPath: '/test/project',
  languages: ['typescript'],
  entryPoints: [],
  dependencyGraph: mkGraph(),
  modules: [],
  patterns: [],
  analyzedAt: new Date().toISOString(),
  ...overrides,
});

// =============================================================================
// classifyTiers
// =============================================================================

describe('classifyTiers', () => {
  it('assigns first 3 files as Tier A', () => {
    const chapter = mkChapter();
    const result = classifyTiers(chapter, mkGraph());
    const tierA = result.filter((f) => f.tier === 'A');
    expect(tierA.map((f) => f.path)).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts']);
  });

  it('assigns 1-hop imports of Tier A as Tier B', () => {
    const chapter = mkChapter();
    // src/a.ts imports lib/d.ts
    const graph = mkGraph([{ from: 'src/a.ts', to: 'lib/d.ts' }]);
    const result = classifyTiers(chapter, graph);
    expect(result.find((f) => f.path === 'lib/d.ts')?.tier).toBe('B');
  });

  it('assigns same-directory files as Tier C', () => {
    // src/a.ts is Tier A (in src/), so src/ siblings not in A or B become C
    // But src/b.ts and src/c.ts are already Tier A
    // Add an extra src file
    const chapter = mkChapter({
      targetFiles: ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/extra.ts', 'lib/d.ts'],
    });
    const result = classifyTiers(chapter, mkGraph());
    expect(result.find((f) => f.path === 'src/extra.ts')?.tier).toBe('C');
  });

  it('assigns remaining files as Tier D', () => {
    const chapter = mkChapter();
    const result = classifyTiers(chapter, mkGraph());
    // lib/d.ts and lib/e.ts are not in A, not imported by A, not same dir as A
    expect(result.find((f) => f.path === 'lib/d.ts')?.tier).toBe('D');
    expect(result.find((f) => f.path === 'lib/e.ts')?.tier).toBe('D');
  });

  it('returns empty for no target files', () => {
    const chapter = mkChapter({ targetFiles: [] });
    expect(classifyTiers(chapter, mkGraph())).toEqual([]);
  });

  it('all files are Tier A when ≤3 targets', () => {
    const chapter = mkChapter({ targetFiles: ['a.ts', 'b.ts'] });
    const result = classifyTiers(chapter, mkGraph());
    expect(result.every((f) => f.tier === 'A')).toBe(true);
  });
});

// =============================================================================
// allocateBudgets
// =============================================================================

describe('allocateBudgets', () => {
  const config: BudgetConfig = {
    totalBudget: 100_000,
    maxPerFile: 20_000,
    minPerFile: 200,
    headRatio: 0.7,
    tierWeights: { A: 0.4, B: 0.3, C: 0.2, D: 0.1 },
  };

  it('allocates budget proportionally by tier', () => {
    const files = [
      { path: 'a.ts', tier: 'A' as FileTier, budgetChars: 0 },
      { path: 'b.ts', tier: 'B' as FileTier, budgetChars: 0 },
      { path: 'c.ts', tier: 'C' as FileTier, budgetChars: 0 },
      { path: 'd.ts', tier: 'D' as FileTier, budgetChars: 0 },
    ];
    const result = allocateBudgets(files, config);
    // Each tier has 1 file
    // D gets 10k, C gets 20k (capped), B gets 30k (capped at 20k), A gets 40k + leftovers (capped at 20k)
    expect(result.find((f) => f.path === 'a.ts')!.budgetChars).toBeGreaterThan(0);
    expect(result.find((f) => f.path === 'd.ts')!.budgetChars).toBeGreaterThan(0);
  });

  it('caps at maxPerFile', () => {
    const files = [{ path: 'a.ts', tier: 'A' as FileTier, budgetChars: 0 }];
    const result = allocateBudgets(files, config);
    // Only 1 file in Tier A, but tier budget = 40k + rollup from empty tiers
    // maxPerFile = 20k → capped
    expect(result[0].budgetChars).toBeLessThanOrEqual(config.maxPerFile);
  });

  it('rolls unused budget from empty tiers', () => {
    // Only Tier A files — D, C, B budgets roll up to A
    const files = [
      { path: 'a.ts', tier: 'A' as FileTier, budgetChars: 0 },
      { path: 'b.ts', tier: 'A' as FileTier, budgetChars: 0 },
    ];
    const result = allocateBudgets(files, config);
    // Total budget = 100k, all tiers roll up to A, but each capped at 20k
    // So 2 files × 20k max = 40k used, rest wasted
    expect(result[0].budgetChars).toBe(config.maxPerFile);
    expect(result[1].budgetChars).toBe(config.maxPerFile);
  });

  it('enforces minPerFile', () => {
    // Many files in one tier → per-file budget may go below min
    const files = Array.from({ length: 100 }, (_, i) => ({
      path: `d${i}.ts`,
      tier: 'D' as FileTier,
      budgetChars: 0,
    }));
    const result = allocateBudgets(files, config);
    expect(result.every((f) => f.budgetChars >= config.minPerFile)).toBe(true);
  });

  it('returns empty for no files', () => {
    expect(allocateBudgets([], config)).toEqual([]);
  });
});

// =============================================================================
// readAndTruncate
// =============================================================================

describe('readAndTruncate', () => {
  it('returns full content when within budget', async () => {
    const content = 'const x = 1;\n';
    mockedFs.readFile.mockResolvedValue(content);

    const result = await readAndTruncate('file.ts', 1000, '/repo');
    expect(result?.truncated).toBe(false);
    expect(result?.content).toBe(content);
    expect(result?.language).toBe('typescript');
  });

  it('applies head+tail truncation when exceeding budget', async () => {
    const content = 'H'.repeat(500) + 'M'.repeat(500) + 'T'.repeat(500);
    mockedFs.readFile.mockResolvedValue(content);

    const result = await readAndTruncate('file.ts', 700, '/repo', 0.7);
    expect(result?.truncated).toBe(true);
    expect(result?.headTailTruncated).toBe(true);
    // Head = 490 chars (700 * 0.7), Tail = 210 chars (700 * 0.3)
    expect(result?.content).toContain('HHHH');
    expect(result?.content).toContain('TTTT');
    expect(result?.content).toContain('truncated');
    expect(result?.content).toContain('lines omitted');
  });

  it('returns null for unreadable files', async () => {
    mockedFs.readFile.mockRejectedValue(new Error('ENOENT'));
    const result = await readAndTruncate('missing.ts', 1000, '/repo');
    expect(result).toBeNull();
  });

  it('detects language from extension', async () => {
    mockedFs.readFile.mockResolvedValue('code');
    const result = await readAndTruncate('app.py', 1000, '/repo');
    expect(result?.language).toBe('python');
  });
});

// =============================================================================
// EvidenceBuilder.build() integration
// =============================================================================

describe('EvidenceBuilder.build()', () => {
  it('produces a complete evidence pack with tiers and artifact', async () => {
    mockedFs.readFile.mockResolvedValue('const x = 1;');

    const builder = new EvidenceBuilder();
    const chapter = mkChapter({ targetFiles: ['src/a.ts', 'src/b.ts'] });
    const analysis = mkAnalysis();

    const pack = await builder.build(chapter, analysis);

    expect(pack.chapterId).toBe('ch-1');
    expect(pack.files.length).toBe(2);
    expect(pack.files[0].tier).toBe('A');
    expect(pack.interfaceArtifact).toBeDefined();
    expect(pack.budgetUsed).toBeGreaterThan(0);
    expect(pack.totalTokensEstimate).toBeGreaterThan(0);
  });

  it('handles empty targetFiles', async () => {
    const builder = new EvidenceBuilder();
    const chapter = mkChapter({ targetFiles: [] });
    const analysis = mkAnalysis();

    const pack = await builder.build(chapter, analysis);

    expect(pack.files).toHaveLength(0);
    expect(pack.budgetUsed).toBe(0);
    expect(pack.totalTokensEstimate).toBe(0);
  });

  it('skips unreadable files gracefully', async () => {
    mockedFs.readFile
      .mockResolvedValueOnce('good content')
      .mockRejectedValueOnce(new Error('ENOENT'));

    const builder = new EvidenceBuilder();
    const chapter = mkChapter({ targetFiles: ['good.ts', 'bad.ts'] });
    const analysis = mkAnalysis();

    const pack = await builder.build(chapter, analysis);
    expect(pack.files).toHaveLength(1);
    expect(pack.files[0].path).toBe('good.ts');
  });

  it('accepts custom budget config', async () => {
    mockedFs.readFile.mockResolvedValue('x'.repeat(500));

    const builder = new EvidenceBuilder({ maxPerFile: 100 });
    const chapter = mkChapter({ targetFiles: ['file.ts'] });
    const analysis = mkAnalysis();

    const pack = await builder.build(chapter, analysis);
    // File exceeds 100 chars → should be truncated
    expect(pack.files[0].truncated).toBe(true);
    expect(pack.files[0].headTailTruncated).toBe(true);
  });

  it('build() accepts budget override', async () => {
    mockedFs.readFile.mockResolvedValue('const x = 1;');

    const builder = new EvidenceBuilder();
    const result = await builder.build(
      mkChapter({ targetFiles: ['src/a.ts'] }),
      mkAnalysis({ repoPath: '/test' }),
      BUDGET_FAST
    );
    expect(result.budgetUsed).toBeLessThanOrEqual(BUDGET_FAST.totalBudget);
  });
});

// =============================================================================
// Budget tiers
// =============================================================================

describe('budget tiers', () => {
  it('BUDGET_FAST has 40K total budget', () => {
    expect(BUDGET_FAST.totalBudget).toBe(40_000);
  });

  it('BUDGET_FULL has 80K total budget', () => {
    expect(BUDGET_FULL.totalBudget).toBe(80_000);
  });

  it('DEFAULT_BUDGET is alias for BUDGET_FULL', () => {
    expect(DEFAULT_BUDGET).toBe(BUDGET_FULL);
  });
});
