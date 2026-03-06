// packages/core/src/__tests__/core.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RepoTutorCore } from '../core';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';

describe('RepoTutorCore', () => {
  it('should create an instance', () => {
    const core = new RepoTutorCore();
    expect(core).toBeInstanceOf(RepoTutorCore);
  });

  it('should report LLM as not configured initially', () => {
    const core = new RepoTutorCore();
    expect(core.isLLMConfigured).toBe(false);
  });

  it('should report LLM as configured after setLLMConfig', () => {
    const core = new RepoTutorCore();
    core.setLLMConfig({
      provider: 'openai',
      apiKey: 'test-key',
      model: 'gpt-4',
    });
    expect(core.isLLMConfigured).toBe(true);
  });

  it('should analyze a repository', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'repo-tutor-core-test-'));

    try {
      await fs.writeFile(path.join(tmpDir, 'index.ts'), `export const hello = 'world';`);
      await fs.writeFile(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'test', main: 'index.ts' })
      );

      const core = new RepoTutorCore();
      const result = await core.analyze(tmpDir, {
        preset: 'standard',
        neverSend: [],
        skipAnalysis: ['node_modules'],
        confirmBeforeSend: false,
        maxCodeContextChars: 25000,
        strictMode: false,
      });

      expect(result.repoPath).toBe(tmpDir);
      expect(result.languages).toContain('typescript');
      expect(result.entryPoints.length).toBeGreaterThan(0);
    } finally {
      await fs.rm(tmpDir, { recursive: true });
    }
  });

  it('should redact secrets in content', () => {
    const core = new RepoTutorCore();
    const { redacted, redactions } = core.redactContent(
      'const API_KEY = "sk-test123456789012345678901234567890";'
    );

    expect(redacted).toContain('[REDACTED');
    expect(redacted).not.toContain('sk-test');
    expect(redactions.length).toBeGreaterThan(0);
  });

  it('should detect secrets in content', () => {
    const core = new RepoTutorCore();
    expect(core.containsSecrets('const key = "sk-test123456789012345678901234567890";')).toBe(true);
    expect(core.containsSecrets('const x = 5;')).toBe(false);
  });

  it('should throw when planChapters called without LLM config', async () => {
    const core = new RepoTutorCore();
    const mockAnalysis = {
      repoPath: '/test',
      languages: ['typescript'],
      entryPoints: [],
      dependencyGraph: { nodes: [], edges: [] },
      modules: [],
      patterns: [],
      analyzedAt: new Date().toISOString(),
    };
    const mockUserContext = {
      preferredLanguage: 'en',
      skillLevel: 'beginner' as const,
    };

    await expect(core.planChapters(mockAnalysis, mockUserContext)).rejects.toThrow(
      'LLM not configured'
    );
  });

  it('should throw when generateChapter called without LLM config', async () => {
    const core = new RepoTutorCore();
    const mockChapter = {
      id: 'ch1',
      title: 'Test',
      order: 1,
      focus: 'structure' as const,
      targetFiles: [],
      prerequisites: [],
      learningObjectives: [],
    };
    const mockAnalysis = {
      repoPath: '/test',
      languages: ['typescript'],
      entryPoints: [],
      dependencyGraph: { nodes: [], edges: [] },
      modules: [],
      patterns: [],
      analyzedAt: new Date().toISOString(),
    };
    const mockUserContext = {
      preferredLanguage: 'en',
      skillLevel: 'beginner' as const,
    };

    await expect(
      core.generateChapter(mockChapter, mockAnalysis, mockUserContext)
    ).rejects.toThrow('LLM not configured');
  });

  it('should throw when generateQuiz called without LLM config', async () => {
    const core = new RepoTutorCore();
    const mockChapterContent = {
      chapterId: 'ch1',
      title: 'Test',
      sections: [],
      keyTakeaways: [],
    };

    await expect(core.generateQuiz(mockChapterContent)).rejects.toThrow('LLM not configured');
  });

  it('should throw when evaluateAnswer called without LLM config', async () => {
    const core = new RepoTutorCore();
    const mockQuestion = {
      id: 'q1',
      chapterId: 'ch1',
      type: 'multiple-choice' as const,
      bloomLevel: 'remembering' as const,
      difficulty: 'easy' as const,
      question: 'Test?',
      correctAnswer: 'A',
    };

    await expect(core.evaluateAnswer(mockQuestion, 'A')).rejects.toThrow('LLM not configured');
  });

  it('should return false for validateApiKey when LLM not configured', async () => {
    const core = new RepoTutorCore();
    const result = await core.validateApiKey();
    expect(result).toBe(false);
  });
});
