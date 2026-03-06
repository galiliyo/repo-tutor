// packages/core/src/analysis/analyzer.ts

import * as path from 'path';
import { glob } from 'glob';
import type { AnalysisResult, SecurityConfig } from '../types';
import { LanguageRegistry, JavaScriptPlugin } from '../languages';
import { buildDependencyGraph, type FileImports } from './dependency-graph';
import { detectEntryPoints } from './entry-points';
import { detectTracks } from './track-detector';

const TEST_DIR_PATTERNS = new Set([
  'test', 'tests', '__tests__', 'spec', 'specs',
  'e2e', 'cypress', '__mocks__', 'fixtures',
]);

const EXT_TO_LANGUAGE: Record<string, string> = {
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.mts': 'javascript',
  '.ts': 'typescript', '.tsx': 'typescript',
  '.py': 'python',
  '.rb': 'ruby',
  '.go': 'go',
  '.java': 'java', '.kt': 'kotlin',
  '.swift': 'swift',
  '.cs': 'csharp',
  '.cpp': 'cpp', '.c': 'c', '.h': 'c', '.hpp': 'cpp',
  '.rs': 'rust',
  '.php': 'php',
};

export class Analyzer {
  private registry: LanguageRegistry;

  constructor() {
    this.registry = new LanguageRegistry();
    this.registry.register(new JavaScriptPlugin());
  }

  async analyze(repoPath: string, config: SecurityConfig): Promise<AnalysisResult> {
    const absolutePath = path.resolve(repoPath);

    // Find all source files (broad glob for all languages)
    const allSourceExts = [
      ...this.registry.getSupportedExtensions(),
      '.py', '.rb', '.go', '.java', '.kt', '.swift', '.cs',
      '.cpp', '.c', '.h', '.hpp', '.rs', '.php',
    ];
    const uniqueExts = [...new Set(allSourceExts)];
    const pattern = `**/*{${uniqueExts.join(',')}}`;

    const skipPatterns = [
      'node_modules/**',
      ...config.skipAnalysis.map(p => p.endsWith('/') ? p + '**' : p),
    ];

    const files = await glob(pattern, {
      cwd: absolutePath,
      ignore: skipPatterns,
      nodir: true,
    });

    // Parse files that have language plugins; detect languages from extensions
    const fileImports: FileImports[] = [];
    const languages = new Set<string>();

    for (const file of files) {
      const ext = path.extname(file);
      const lang = EXT_TO_LANGUAGE[ext];
      if (lang) languages.add(lang);

      const plugin = this.registry.getByExtension(ext);
      if (!plugin) continue;

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

    const result: AnalysisResult = {
      repoPath: absolutePath,
      languages: Array.from(languages),
      entryPoints,
      dependencyGraph,
      modules,
      patterns: [],
      analyzedAt: new Date().toISOString(),
    };

    const { tracks: detectedTracks, fileTrackMap } = await detectTracks(absolutePath, files, result);
    result.detectedTracks = detectedTracks;
    result.fileTrackMap = fileTrackMap;

    return result;
  }

  private detectModules(files: string[]) {
    const moduleDirs = new Map<string, string[]>();

    for (const file of files) {
      const normalized = file.replace(/\\/g, '/');
      const parts = normalized.split('/');
      if (parts.length > 1) {
        const dir = parts[0];
        const existing = moduleDirs.get(dir) || [];
        existing.push(normalized);
        moduleDirs.set(dir, existing);
      }
    }

    return Array.from(moduleDirs.entries())
      .filter(([, moduleFiles]) => moduleFiles.length >= 2)
      .map(([name, moduleFiles]) => ({
        name,
        path: name,
        fileCount: moduleFiles.length,
        files: moduleFiles,
        role: TEST_DIR_PATTERNS.has(name.toLowerCase()) ? 'test' as const : 'source' as const,
      }));
  }
}
