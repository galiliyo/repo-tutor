// packages/core/src/generation/evidence-builder.ts

import * as fs from 'fs/promises';
import * as path from 'path';
import type {
  Chapter,
  AnalysisResult,
  EvidencePack,
  EvidenceFile,
  DependencyGraph,
  FileTier,
  TieredFile,
  BudgetConfig,
  TrackId,
} from '../types';
import { buildInterfaceArtifact } from './interface-artifact';
import { classifyFileTrack } from '../analysis/track-detector';

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

// Keep DEFAULT_BUDGET as alias for backward compat
export const DEFAULT_BUDGET = BUDGET_FULL;

/**
 * Classify chapter target files into tiers based on relevance.
 *
 * - A: first 3 targetFiles (primary teaching targets)
 * - B: files imported by Tier A (1-hop in dependencyGraph)
 * - C: files sharing a directory with Tier A
 * - D: remaining targetFiles
 */
export function classifyTiers(
  chapter: Chapter,
  dependencyGraph: DependencyGraph,
): TieredFile[] {
  const targets = chapter.targetFiles;
  if (targets.length === 0) return [];

  // Tier A: first 3 target files (or all if ≤3)
  const tierASet = new Set(targets.slice(0, 3));

  // Tier B: 1-hop imports from Tier A files
  const tierBSet = new Set<string>();
  for (const edge of dependencyGraph.edges) {
    if (tierASet.has(edge.from) && targets.includes(edge.to) && !tierASet.has(edge.to)) {
      tierBSet.add(edge.to);
    }
  }

  // Tier C: files sharing a directory with any Tier A file
  const tierADirs = new Set([...tierASet].map((f) => path.dirname(f)));
  const tierCSet = new Set<string>();
  for (const t of targets) {
    if (!tierASet.has(t) && !tierBSet.has(t) && tierADirs.has(path.dirname(t))) {
      tierCSet.add(t);
    }
  }

  const result: TieredFile[] = [];
  for (const t of targets) {
    let tier: FileTier;
    if (tierASet.has(t)) tier = 'A';
    else if (tierBSet.has(t)) tier = 'B';
    else if (tierCSet.has(t)) tier = 'C';
    else tier = 'D';
    result.push({ path: t, tier, budgetChars: 0 });
  }
  return result;
}

/**
 * Allocate char budgets across tiered files.
 * Unused budget rolls from D → C → B → A.
 */
export function allocateBudgets(
  tieredFiles: TieredFile[],
  config: BudgetConfig = DEFAULT_BUDGET,
): TieredFile[] {
  if (tieredFiles.length === 0) return [];

  const tiers: FileTier[] = ['D', 'C', 'B', 'A'];
  const tierBudgets: Record<FileTier, number> = {
    A: config.totalBudget * config.tierWeights.A,
    B: config.totalBudget * config.tierWeights.B,
    C: config.totalBudget * config.tierWeights.C,
    D: config.totalBudget * config.tierWeights.D,
  };

  // Group files by tier
  const byTier: Record<FileTier, TieredFile[]> = { A: [], B: [], C: [], D: [] };
  for (const f of tieredFiles) {
    byTier[f.tier].push(f);
  }

  // Allocate from D up, rolling leftover to the next tier
  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i];
    const files = byTier[tier];
    if (files.length === 0) {
      // Roll entire budget to next tier
      if (i + 1 < tiers.length) {
        tierBudgets[tiers[i + 1]] += tierBudgets[tier];
      }
      continue;
    }

    const perFile = Math.min(
      Math.floor(tierBudgets[tier] / files.length),
      config.maxPerFile,
    );
    let spent = 0;
    for (const f of files) {
      f.budgetChars = Math.max(perFile, config.minPerFile);
      spent += f.budgetChars;
    }

    const leftover = tierBudgets[tier] - spent;
    if (leftover > 0 && i + 1 < tiers.length) {
      tierBudgets[tiers[i + 1]] += leftover;
    }
  }

  return tieredFiles;
}

/**
 * Read a file and apply head+tail truncation if it exceeds budget.
 */
export async function readAndTruncate(
  filePath: string,
  budget: number,
  repoPath: string,
  headRatio: number = 0.7,
): Promise<EvidenceFile | null> {
  const fullPath = path.join(repoPath, filePath);
  let content: string;
  try {
    content = await fs.readFile(fullPath, 'utf-8');
  } catch {
    return null;
  }

  const language = detectLanguage(filePath);

  if (content.length <= budget) {
    return { path: filePath, language, content, truncated: false };
  }

  // Head+tail truncation
  const headChars = Math.floor(budget * headRatio);
  const tailChars = Math.floor(budget * (1 - headRatio));
  const skippedChars = content.length - headChars - tailChars;
  const skippedLines = content.slice(headChars, content.length - tailChars).split('\n').length;

  const truncatedContent =
    content.slice(0, headChars) +
    `\n\n/* ... truncated (${skippedLines} lines omitted) ... */\n\n` +
    content.slice(-tailChars);

  return {
    path: filePath,
    language,
    content: truncatedContent,
    truncated: true,
    headTailTruncated: true,
  };
}

export function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const langMap: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.mjs': 'javascript',
    '.cjs': 'javascript',
    '.py': 'python',
    '.rb': 'ruby',
    '.go': 'go',
    '.rs': 'rust',
    '.java': 'java',
    '.kt': 'kotlin',
    '.swift': 'swift',
    '.cs': 'csharp',
    '.cpp': 'cpp',
    '.c': 'c',
    '.h': 'c',
    '.hpp': 'cpp',
    '.json': 'json',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.md': 'markdown',
    '.html': 'html',
    '.css': 'css',
    '.scss': 'scss',
    '.sql': 'sql',
    '.sh': 'bash',
    '.bash': 'bash',
    '.zsh': 'zsh',
  };
  return langMap[ext] || 'text';
}

function estimateTokens(files: EvidenceFile[]): number {
  const totalChars = files.reduce((sum, f) => sum + f.content.length, 0);
  return Math.ceil(totalChars / 4);
}

export class EvidenceBuilder {
  private config: BudgetConfig;

  constructor(config?: Partial<BudgetConfig>) {
    this.config = { ...DEFAULT_BUDGET, ...config };
  }

  async build(chapter: Chapter, analysis: AnalysisResult, budget?: BudgetConfig): Promise<EvidencePack> {
    const config = budget ?? this.config;

    // Filter targetFiles by track — drop files belonging to a different track
    let filteredChapter = chapter;
    const trackId = chapter.trackId;
    if (trackId && trackId !== 'architecture') {
      const filtered = chapter.targetFiles.filter(f => {
        const cls = classifyFileTrack(f, analysis.fileTrackMap);
        return cls === trackId || cls === 'shared';
      });
      filteredChapter = { ...chapter, targetFiles: filtered };
    }

    const tiered = classifyTiers(filteredChapter, analysis.dependencyGraph);
    const budgeted = allocateBudgets(tiered, config);

    const fileResults = await Promise.all(
      budgeted.map((f) =>
        readAndTruncate(f.path, f.budgetChars, analysis.repoPath, config.headRatio),
      ),
    );

    const files: EvidenceFile[] = [];
    for (let i = 0; i < fileResults.length; i++) {
      const result = fileResults[i];
      if (result) {
        result.tier = budgeted[i].tier;
        files.push(result);
      }
    }

    const budgetUsed = files.reduce((sum, f) => sum + f.content.length, 0);

    // Filter analysis by track so the LLM only sees relevant modules/frameworks
    let filteredAnalysis = analysis;
    if (trackId && trackId !== 'architecture') {
      const matchesTrack = (p: string) => {
        const cls = classifyFileTrack(p, analysis.fileTrackMap);
        return cls === trackId || cls === 'shared';
      };
      const graph = analysis.dependencyGraph;
      const allowedNodes = new Set(
        (graph?.nodes || []).filter(n => matchesTrack(n.path)).map(n => n.path),
      );
      filteredAnalysis = {
        ...analysis,
        modules: (analysis.modules || []).filter(m => matchesTrack(m.path)),
        entryPoints: (analysis.entryPoints || []).filter(ep => matchesTrack(ep.path)),
        detectedTracks: (analysis.detectedTracks || []).filter(t => t.id === trackId),
        dependencyGraph: {
          nodes: (graph?.nodes || []).filter(n => allowedNodes.has(n.path)),
          edges: (graph?.edges || []).filter(e => allowedNodes.has(e.from) && allowedNodes.has(e.to)),
          layers: graph?.layers?.map(l => l.filter(f => allowedNodes.has(f))).filter(l => l.length > 0),
        },
        http: trackId === 'frontend' ? undefined : analysis.http,
        stateManagement: trackId === 'backend' ? undefined : analysis.stateManagement,
      };
    }
    const interfaceArtifact = buildInterfaceArtifact(filteredAnalysis, chapter.trackId as TrackId | undefined);

    return {
      chapterId: chapter.id,
      files,
      interfaceArtifact,
      budgetUsed,
      totalTokensEstimate: estimateTokens(files),
    };
  }
}
