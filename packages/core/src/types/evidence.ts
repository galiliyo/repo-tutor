// packages/core/src/types/evidence.ts

export type FileTier = 'A' | 'B' | 'C' | 'D';

export interface TieredFile {
  path: string;
  tier: FileTier;
  budgetChars: number;
}

export interface BudgetConfig {
  totalBudget: number;       // 120_000
  maxPerFile: number;        // 16_000
  minPerFile: number;        // 200
  headRatio: number;         // 0.7
  tierWeights: Record<FileTier, number>;
}

export interface InterfaceArtifact {
  directoryTree: string;
  tracks: TrackSummary[];
  entryPoints: string[];
  frameworkStack: string[];
  moduleMap: ModuleMapEntry[];
}

export interface TrackSummary {
  id: string;
  label: string;
  confidence: number;
  keySignals: string[];
}

export interface ModuleMapEntry {
  name: string;
  path: string;
  fileCount: number;
  purpose?: string;
}
