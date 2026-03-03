// packages/core/src/types/chapter.ts

export type ChapterFocus =
  | 'structure'
  | 'entry-point'
  | 'data-flow'
  | 'module'
  | 'pattern'
  | 'bootstrap'
  | 'state-management'
  | 'http'
  | 'database'
  | 'auth'
  | 'error-handling';

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

export interface CodeReference {
  file: string;
  startLine?: number;
  endLine?: number;
}

export interface PatternReference {
  name: string;
  description?: string;
  learnMoreUrl?: string;
}

export interface ChapterSection {
  heading: string;
  content: string;
  codeReferences?: CodeReference[];
  diagram?: string;
}

export interface ChapterContent {
  chapterId: string;
  title: string;
  sections: ChapterSection[];
  keyTakeaways: string[];
  bridgeToNext?: string;
  patternsReferenced?: PatternReference[];
  generatedAt?: string;
}

export interface EvidenceFile {
  path: string;
  language?: string;
  content: string;
  truncated?: boolean;
  relevantLines?: Array<{
    start: number;
    end: number;
    reason?: string;
  }>;
}

export interface EvidenceSymbol {
  name: string;
  kind: 'function' | 'class' | 'method' | 'variable' | 'type' | 'interface';
  file: string;
  line?: number;
  signature?: string;
}

export interface EvidenceDependency {
  from: string;
  to: string;
  reason?: string;
}

export interface EvidencePack {
  chapterId: string;
  files: EvidenceFile[];
  symbols?: EvidenceSymbol[];
  dependencies?: EvidenceDependency[];
  redactionsApplied?: string[];
  totalTokensEstimate?: number;
}
