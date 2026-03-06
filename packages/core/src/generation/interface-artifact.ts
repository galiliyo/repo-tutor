// packages/core/src/generation/interface-artifact.ts

import type { AnalysisResult, InterfaceArtifact, TrackSummary, ModuleMapEntry, TrackId } from '../types';
import {
  FE_FRAMEWORK_IMPORTS,
  BE_FRAMEWORK_IMPORTS,
  BE_DB_IMPORTS,
} from '../analysis/track-detector';

/**
 * Build an InterfaceArtifact from an AnalysisResult.
 * No I/O — purely derives structural metadata from already-analyzed data.
 */
export function buildInterfaceArtifact(analysis: AnalysisResult, trackId?: TrackId): InterfaceArtifact {
  return {
    directoryTree: buildDirectoryTree(analysis),
    tracks: buildTrackSummaries(analysis),
    entryPoints: (analysis.entryPoints || []).map((e) => e.path),
    frameworkStack: extractFrameworkStack(analysis, trackId),
    moduleMap: buildModuleMap(analysis),
  };
}

function buildDirectoryTree(analysis: AnalysisResult): string {
  // Collect all known paths from modules and dependency graph nodes
  const paths = new Set<string>();
  for (const m of analysis.modules || []) {
    paths.add(m.path);
  }
  for (const node of analysis.dependencyGraph?.nodes || []) {
    paths.add(node.path);
  }

  if (paths.size === 0) return '(empty)';

  // Build a tree structure
  const tree: Record<string, any> = {};
  for (const p of paths) {
    const parts = p.split('/');
    let current = tree;
    for (const part of parts) {
      if (!current[part]) current[part] = {};
      current = current[part];
    }
  }

  // Render indented tree string
  const lines: string[] = [];
  function render(node: Record<string, any>, prefix: string, indent: number) {
    const keys = Object.keys(node).sort();
    for (const key of keys) {
      lines.push(`${'  '.repeat(indent)}${key}`);
      if (Object.keys(node[key]).length > 0) {
        render(node[key], prefix, indent + 1);
      }
    }
  }
  render(tree, '', 0);
  return lines.join('\n');
}

function buildTrackSummaries(analysis: AnalysisResult): TrackSummary[] {
  if (!analysis.detectedTracks) return [];

  // Known signal mappings per track id
  const signalMap: Record<string, string[]> = {
    frontend: FE_FRAMEWORK_IMPORTS.slice(0, 5),
    backend: [...BE_FRAMEWORK_IMPORTS.slice(0, 3), ...BE_DB_IMPORTS.slice(0, 2)],
    infrastructure: ['docker', 'ci/cd', 'terraform'],
    architecture: ['monorepo', 'module boundaries'],
  };

  return analysis.detectedTracks.map((track) => ({
    id: track.id,
    label: track.label,
    confidence: track.confidence,
    keySignals: signalMap[track.id] || [],
  }));
}

function extractFrameworkStack(analysis: AnalysisResult, trackId?: TrackId): string[] {
  const stack: string[] = [];
  let knownFrameworks: string[];
  if (trackId === 'frontend') {
    knownFrameworks = [...FE_FRAMEWORK_IMPORTS];
  } else if (trackId === 'backend') {
    knownFrameworks = [...BE_FRAMEWORK_IMPORTS, ...BE_DB_IMPORTS];
  } else {
    // architecture, infra, or no track — include all
    knownFrameworks = [...FE_FRAMEWORK_IMPORTS, ...BE_FRAMEWORK_IMPORTS, ...BE_DB_IMPORTS];
  }

  // Check dependency graph nodes for framework-related paths
  const allPaths = (analysis.dependencyGraph?.nodes || []).map((n) => n.path);

  // Check modules for framework-sounding names
  for (const mod of analysis.modules || []) {
    const modName = mod.name.toLowerCase();
    for (const fw of knownFrameworks) {
      if (modName.includes(fw) && !stack.includes(fw)) {
        stack.push(fw);
      }
    }
  }

  // Add HTTP framework if detected
  if (analysis.http?.framework && !stack.includes(analysis.http.framework)) {
    stack.push(analysis.http.framework);
  }

  // Scan file paths for common framework patterns
  for (const p of allPaths) {
    const lower = p.toLowerCase();
    for (const fw of knownFrameworks) {
      if (lower.includes(`node_modules/${fw}`) || lower.includes(`${fw}.config`)) {
        if (!stack.includes(fw)) stack.push(fw);
      }
    }
  }

  return stack;
}

function buildModuleMap(analysis: AnalysisResult): ModuleMapEntry[] {
  return (analysis.modules || []).map((m) => ({
    name: m.name,
    path: m.path,
    fileCount: m.fileCount ?? 0,
    purpose: m.description,
    role: m.role,
  }));
}
