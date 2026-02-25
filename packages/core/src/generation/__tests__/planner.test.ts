// packages/core/src/generation/__tests__/planner.test.ts

import { describe, it, expect, vi } from 'vitest';
import { Planner } from '../planner';
import type { ILLMClient, LLMResponse } from '../llm-client';
import type { IPromptLoader } from '../prompt-loader';
import type { AnalysisResult, UserContext } from '../../types';

describe('Planner', () => {
  const createMockAnalysis = (): AnalysisResult => ({
    repoPath: '/test/project',
    languages: ['typescript', 'javascript'],
    entryPoints: [
      { path: 'src/index.ts', reason: 'main' },
      { path: 'src/server.ts', reason: 'http' },
    ],
    dependencyGraph: {
      nodes: [
        { path: 'src/index.ts', language: 'typescript', loc: 50 },
        { path: 'src/server.ts', language: 'typescript', loc: 100 },
      ],
      edges: [{ from: 'src/index.ts', to: 'src/server.ts', weight: 1 }],
      layers: [['src/index.ts'], ['src/server.ts']],
    },
    modules: [
      { name: 'core', path: 'src/core', description: 'Core module', fileCount: 5 },
      { name: 'api', path: 'src/api', description: 'API module', fileCount: 3 },
    ],
    patterns: [
      { pattern: 'Singleton', confidence: 'high' },
      { pattern: 'Repository', confidence: 'medium' },
    ],
    http: { framework: 'express', routes: [], middleware: [] },
    stateManagement: { type: 'redux', stores: [], actions: [], selectors: [] },
    analyzedAt: new Date().toISOString(),
  });

  const createMockUserContext = (): UserContext => ({
    preferredLanguage: 'TypeScript',
    skillLevel: 'intermediate',
  });

  it('should parse LLM response into chapters', async () => {
    const mockLLMClient: ILLMClient = {
      complete: vi.fn().mockResolvedValue({
        content: '```json\n{"chapters": [{"id": "ch-1", "title": "Overview", "order": 1, "focus": "structure", "targetFiles": ["src/index.ts"], "prerequisites": [], "learningObjectives": ["Understand structure"]}]}\n```',
        tokensUsed: 100,
      } as LLMResponse),
    };

    const mockPromptLoader: IPromptLoader = {
      load: vi.fn().mockReturnValue('rendered prompt'),
    };

    const planner = new Planner(mockLLMClient, mockPromptLoader);
    const analysis = createMockAnalysis();
    const userContext = createMockUserContext();

    const chapters = await planner.plan(analysis, userContext);

    expect(chapters).toHaveLength(1);
    expect(chapters[0].id).toBe('ch-1');
    expect(chapters[0].title).toBe('Overview');
    expect(chapters[0].order).toBe(1);
    expect(chapters[0].focus).toBe('structure');
    expect(chapters[0].targetFiles).toEqual(['src/index.ts']);
    expect(chapters[0].learningObjectives).toEqual(['Understand structure']);
  });

  it('should call prompt loader with correct context', async () => {
    const mockLLMClient: ILLMClient = {
      complete: vi.fn().mockResolvedValue({
        content: '{"chapters": []}',
        tokensUsed: 50,
      } as LLMResponse),
    };

    const mockPromptLoader: IPromptLoader = {
      load: vi.fn().mockReturnValue('prompt'),
    };

    const planner = new Planner(mockLLMClient, mockPromptLoader);
    const analysis = createMockAnalysis();
    const userContext = createMockUserContext();

    await planner.plan(analysis, userContext);

    expect(mockPromptLoader.load).toHaveBeenCalledWith('planner', expect.objectContaining({
      userPreferredLanguage: 'TypeScript',
      skillLevel: 'intermediate',
      languages: ['typescript', 'javascript'],
      entryPoints: expect.arrayContaining([
        expect.objectContaining({ path: 'src/index.ts' }),
      ]),
      patterns: expect.arrayContaining([
        expect.objectContaining({ pattern: 'Singleton' }),
      ]),
    }));
  });

  it('should pass rendered prompt to LLM client', async () => {
    const mockLLMClient: ILLMClient = {
      complete: vi.fn().mockResolvedValue({
        content: '{"chapters": []}',
        tokensUsed: 50,
      } as LLMResponse),
    };

    const mockPromptLoader: IPromptLoader = {
      load: vi.fn().mockReturnValue('the rendered prompt'),
    };

    const planner = new Planner(mockLLMClient, mockPromptLoader);
    const analysis = createMockAnalysis();
    const userContext = createMockUserContext();

    await planner.plan(analysis, userContext);

    expect(mockLLMClient.complete).toHaveBeenCalledWith('the rendered prompt');
  });

  it('should handle JSON response without code fence', async () => {
    const mockLLMClient: ILLMClient = {
      complete: vi.fn().mockResolvedValue({
        content: '{"chapters": [{"id": "ch-2", "title": "Entry", "order": 1, "focus": "entry-point", "targetFiles": [], "prerequisites": [], "learningObjectives": []}]}',
        tokensUsed: 75,
      } as LLMResponse),
    };

    const mockPromptLoader: IPromptLoader = {
      load: vi.fn().mockReturnValue('prompt'),
    };

    const planner = new Planner(mockLLMClient, mockPromptLoader);
    const analysis = createMockAnalysis();
    const userContext = createMockUserContext();

    const chapters = await planner.plan(analysis, userContext);

    expect(chapters).toHaveLength(1);
    expect(chapters[0].id).toBe('ch-2');
  });

  it('should format dependency layers correctly', async () => {
    const mockLLMClient: ILLMClient = {
      complete: vi.fn().mockResolvedValue({
        content: '{"chapters": []}',
        tokensUsed: 50,
      } as LLMResponse),
    };

    const mockPromptLoader: IPromptLoader = {
      load: vi.fn().mockReturnValue('prompt'),
    };

    const planner = new Planner(mockLLMClient, mockPromptLoader);
    const analysis = createMockAnalysis();
    const userContext = createMockUserContext();

    await planner.plan(analysis, userContext);

    expect(mockPromptLoader.load).toHaveBeenCalledWith('planner', expect.objectContaining({
      dependencyLayers: 'Layer 1: src/index.ts\nLayer 2: src/server.ts',
    }));
  });

  it('should handle missing optional analysis fields', async () => {
    const mockLLMClient: ILLMClient = {
      complete: vi.fn().mockResolvedValue({
        content: '{"chapters": []}',
        tokensUsed: 50,
      } as LLMResponse),
    };

    const mockPromptLoader: IPromptLoader = {
      load: vi.fn().mockReturnValue('prompt'),
    };

    const planner = new Planner(mockLLMClient, mockPromptLoader);
    const analysis: AnalysisResult = {
      repoPath: '/test',
      languages: ['python'],
      entryPoints: [],
      dependencyGraph: { nodes: [], edges: [] },
      modules: [],
      patterns: [],
      analyzedAt: new Date().toISOString(),
    };
    const userContext = createMockUserContext();

    await planner.plan(analysis, userContext);

    expect(mockPromptLoader.load).toHaveBeenCalledWith('planner', expect.objectContaining({
      http: { framework: 'none' },
      stateManagement: { type: 'none' },
      dependencyLayers: '',
    }));
  });

  it('should throw on invalid JSON response', async () => {
    const mockLLMClient: ILLMClient = {
      complete: vi.fn().mockResolvedValue({
        content: 'Not valid JSON at all',
        tokensUsed: 25,
      } as LLMResponse),
    };

    const mockPromptLoader: IPromptLoader = {
      load: vi.fn().mockReturnValue('prompt'),
    };

    const planner = new Planner(mockLLMClient, mockPromptLoader);
    const analysis = createMockAnalysis();
    const userContext = createMockUserContext();

    await expect(planner.plan(analysis, userContext)).rejects.toThrow();
  });

  it('should return multiple chapters in order', async () => {
    const chaptersJson = {
      chapters: [
        { id: 'ch-1', title: 'Structure', order: 1, focus: 'structure', targetFiles: ['src/index.ts'], prerequisites: [], learningObjectives: ['Learn structure'] },
        { id: 'ch-2', title: 'Entry Point', order: 2, focus: 'entry-point', targetFiles: ['src/main.ts'], prerequisites: ['ch-1'], learningObjectives: ['Understand entry'] },
        { id: 'ch-3', title: 'HTTP Layer', order: 3, focus: 'http', targetFiles: ['src/routes.ts'], prerequisites: ['ch-2'], learningObjectives: ['Learn routes'] },
      ],
    };

    const mockLLMClient: ILLMClient = {
      complete: vi.fn().mockResolvedValue({
        content: '```json\n' + JSON.stringify(chaptersJson) + '\n```',
        tokensUsed: 200,
      } as LLMResponse),
    };

    const mockPromptLoader: IPromptLoader = {
      load: vi.fn().mockReturnValue('prompt'),
    };

    const planner = new Planner(mockLLMClient, mockPromptLoader);
    const analysis = createMockAnalysis();
    const userContext = createMockUserContext();

    const chapters = await planner.plan(analysis, userContext);

    expect(chapters).toHaveLength(3);
    expect(chapters[0].title).toBe('Structure');
    expect(chapters[1].title).toBe('Entry Point');
    expect(chapters[2].title).toBe('HTTP Layer');
    expect(chapters[1].prerequisites).toEqual(['ch-1']);
  });
});
