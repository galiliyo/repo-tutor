// packages/core/src/analysis/dependency-graph.ts

import type { DependencyGraph } from '../types';
import type { Import } from '../languages/plugin';
import * as path from 'path';

export interface FileImports {
  filePath: string;
  imports: Import[];
}

export function buildDependencyGraph(
  repoPath: string,
  fileImports: FileImports[]
): DependencyGraph {
  const nodes = fileImports.map(f => ({
    path: path.relative(repoPath, f.filePath),
    language: getLanguageFromPath(f.filePath),
  }));

  const nodeSet = new Set(nodes.map(n => n.path));
  const edges: DependencyGraph['edges'] = [];

  for (const { filePath, imports } of fileImports) {
    const fromPath = path.relative(repoPath, filePath);

    for (const imp of imports) {
      if (!imp.isRelative) continue;

      const resolvedPath = resolveImport(filePath, imp.source, repoPath, nodeSet);
      if (resolvedPath && nodeSet.has(resolvedPath)) {
        edges.push({
          from: fromPath,
          to: resolvedPath,
          weight: imp.specifiers.length,
        });
      }
    }
  }

  const layers = computeLayers(nodes.map(n => n.path), edges);

  return { nodes, edges, layers };
}

function getLanguageFromPath(filePath: string): string {
  const ext = path.extname(filePath);
  if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts'].includes(ext)) {
    return 'javascript';
  }
  if (ext === '.py') return 'python';
  return 'unknown';
}

function resolveImport(
  fromFile: string,
  importSource: string,
  repoPath: string,
  nodeSet: Set<string>
): string | null {
  const fromDir = path.dirname(fromFile);
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts', '/index.ts', '/index.tsx', '/index.js'];

  for (const ext of extensions) {
    const candidate = path.join(fromDir, importSource + ext);
    const relative = path.relative(repoPath, candidate);
    // Check if this resolved path exists in our node set
    if (!relative.startsWith('..') && nodeSet.has(relative)) {
      return relative;
    }
  }

  // Fallback: try with .ts extension even if not in nodeSet
  const fallback = path.relative(repoPath, path.join(fromDir, importSource + '.ts'));
  if (!fallback.startsWith('..')) {
    return fallback;
  }

  return null;
}

function computeLayers(nodes: string[], edges: DependencyGraph['edges']): string[][] {
  const inDegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();

  for (const node of nodes) {
    inDegree.set(node, 0);
    outgoing.set(node, []);
  }

  for (const edge of edges) {
    inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
    outgoing.get(edge.from)?.push(edge.to);
  }

  const layers: string[][] = [];
  const remaining = new Set(nodes);

  while (remaining.size > 0) {
    const layer = Array.from(remaining).filter(n => inDegree.get(n) === 0);
    if (layer.length === 0) {
      // Cycle detected, just add remaining
      layers.push(Array.from(remaining));
      break;
    }

    layers.push(layer);
    for (const node of layer) {
      remaining.delete(node);
      for (const target of outgoing.get(node) || []) {
        inDegree.set(target, (inDegree.get(target) || 0) - 1);
      }
    }
  }

  return layers;
}
