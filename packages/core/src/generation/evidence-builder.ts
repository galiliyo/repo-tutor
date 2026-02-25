// packages/core/src/generation/evidence-builder.ts

import * as fs from 'fs/promises';
import * as path from 'path';
import type { Chapter, AnalysisResult, EvidencePack, EvidenceFile } from '../types';

export class EvidenceBuilder {
  constructor(private maxFileChars: number = 10000) {}

  async build(chapter: Chapter, analysis: AnalysisResult): Promise<EvidencePack> {
    const files: EvidenceFile[] = [];

    for (const targetPath of chapter.targetFiles) {
      const fullPath = path.join(analysis.repoPath, targetPath);
      try {
        let content = await fs.readFile(fullPath, 'utf-8');
        const truncated = content.length > this.maxFileChars;
        if (truncated) {
          content = content.slice(0, this.maxFileChars) + '\n... (truncated)';
        }
        files.push({
          path: targetPath,
          language: this.detectLanguage(targetPath),
          content,
          truncated,
        });
      } catch {
        // File not found or unreadable, skip silently
      }
    }

    return {
      chapterId: chapter.id,
      files,
      totalTokensEstimate: this.estimateTokens(files),
    };
  }

  private detectLanguage(filePath: string): string {
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

  private estimateTokens(files: EvidenceFile[]): number {
    // Rough estimate: ~4 characters per token for code
    const totalChars = files.reduce((sum, f) => sum + f.content.length, 0);
    return Math.ceil(totalChars / 4);
  }
}
