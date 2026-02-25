// packages/core/src/types/analysis.ts

export interface FileReference {
  path: string;
  reason?: string;
}

export interface DependencyGraph {
  nodes: Array<{
    path: string;
    language?: string;
    loc?: number;
  }>;
  edges: Array<{
    from: string;
    to: string;
    weight?: number;
  }>;
  layers?: string[][];
}

export interface Module {
  name: string;
  path: string;
  description?: string;
  fileCount?: number;
  importCount?: number;
  exportCount?: number;
}

export interface PatternDetection {
  pattern: string;
  confidence: 'high' | 'medium' | 'low';
  evidence?: {
    files?: string[];
    indicators?: string[];
  };
  explanation?: string;
  learnMoreUrl?: string;
}

export interface RouteInfo {
  method: string;
  path: string;
  handler?: string;
  file: string;
  line?: number;
}

export interface MiddlewareInfo {
  name: string;
  type?: string;
  scope?: string;
  file: string;
}

export interface HttpAnalysis {
  framework: 'express' | 'fastify' | 'hono' | 'koa' | 'nextjs' | 'fastapi' | 'flask' | 'django' | 'none' | 'unknown';
  routes: RouteInfo[];
  middleware: MiddlewareInfo[];
}

export interface StoreInfo {
  name: string;
  file: string;
}

export interface StateManagementAnalysis {
  type: 'redux' | 'zustand' | 'mobx' | 'context' | 'pinia' | 'vuex' | 'signals' | 'stores' | 'custom' | 'none';
  stores: StoreInfo[];
  actions: string[];
  selectors: string[];
}

export interface AnalysisResult {
  repoPath: string;
  languages: string[];
  entryPoints: FileReference[];
  dependencyGraph: DependencyGraph;
  modules: Module[];
  patterns: PatternDetection[];
  http?: HttpAnalysis;
  stateManagement?: StateManagementAnalysis;
  analyzedAt: string;
}
