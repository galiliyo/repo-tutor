// packages/core/src/analysis/analyzer.ts

import * as path from 'path';
import { glob } from 'glob';
import type { AnalysisResult, SecurityConfig } from '../types';
import { LanguageRegistry, JavaScriptPlugin } from '../languages';
import { buildDependencyGraph, type FileImports } from './dependency-graph';
import { detectEntryPoints } from './entry-points';

export class Analyzer {
  private registry: LanguageRegistry;

  constructor() {
    this.registry = new LanguageRegistry();
    this.registry.register(new JavaScriptPlugin());
  }

  async analyze(repoPath: string, config: SecurityConfig): Promise<AnalysisResult> {
    const absolutePath = path.resolve(repoPath);

    // Find all source files
    const extensions = this.registry.getSupportedExtensions();
    const pattern = `**/*{${extensions.join(',')}}`;

    const skipPatterns = [
      'node_modules/**',
      ...config.skipAnalysis.map(p => p.endsWith('/') ? p + '**' : p),
    ];

    const files = await glob(pattern, {
      cwd: absolutePath,
      ignore: skipPatterns,
      nodir: true,
    });

    // Parse all files and collect imports
    const fileImports: FileImports[] = [];
    const languages = new Set<string>();

    for (const file of files) {
      const ext = path.extname(file);
      const plugin = this.registry.getByExtension(ext);

      if (!plugin) continue;

      languages.add(plugin.id);

      try {
        const fullPath = path.join(absolutePath, file);
        const ast = await plugin.parseFile(fullPath);
        const imports = plugin.getImports(ast);

        fileImports.push({ filePath: fullPath, imports });
      } catch (error) {
        console.warn(`Failed to parse ${file}:`, error);
      }
    }

    // Build dependency graph
    const dependencyGraph = buildDependencyGraph(absolutePath, fileImports);

    // Detect entry points
    const entryPoints = await detectEntryPoints(absolutePath);

    // Detect modules (simplified - group by top-level directory)
    const modules = this.detectModules(files);

    return {
      repoPath: absolutePath,
      languages: Array.from(languages),
      entryPoints,
      dependencyGraph,
      modules,
      patterns: [],
      analyzedAt: new Date().toISOString(),
    };
  }

  private detectModules(files: string[]) {
    const moduleDirs = new Map<string, number>();

    for (const file of files) {
      const parts = file.split(path.sep);
      if (parts.length > 1) {
        const dir = parts[0];
        moduleDirs.set(dir, (moduleDirs.get(dir) || 0) + 1);
      }
    }

    return Array.from(moduleDirs.entries())
      .filter(([, count]) => count >= 2)
      .map(([name, fileCount]) => ({
        name,
        path: name,
        fileCount,
      }));
  }
}
