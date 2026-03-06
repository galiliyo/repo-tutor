// packages/core/src/generation/__tests__/planner.test.ts

import { describe, it, expect, vi } from 'vitest';
import { Planner } from '../planner';
import type { ILLMClient, LLMResponse } from '../llm-client';
import type { IPromptLoader } from '../prompt-loader';
import type { AnalysisResult, UserContext } from '../../types';
import type { Track } from '../../types/track';

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

    expect(mockLLMClient.complete).toHaveBeenCalledWith('the rendered prompt', undefined, 'planner');
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

  it('should pass track context to prompt template', async () => {
    const mockLLMClient: ILLMClient = {
      complete: vi.fn().mockResolvedValue({
        content: '{"chapters": []}',
        tokensUsed: 50,
      } as LLMResponse),
    };

    const mockPromptLoader: IPromptLoader = {
      load: vi.fn().mockReturnValue('prompt'),
    };

    const track: Track = {
      id: 'backend',
      label: 'Backend',
      description: 'Server-side logic and API layer',
      focusTypes: ['http', 'data-flow', 'error-handling'],
      confidence: 0.9,
      suggestedOrder: 1,
    };

    const planner = new Planner(mockLLMClient, mockPromptLoader);
    const analysis = createMockAnalysis();
    const userContext = createMockUserContext();

    await planner.plan(analysis, userContext, track);

    expect(mockPromptLoader.load).toHaveBeenCalledWith('planner', expect.objectContaining({
      trackId: 'backend',
      trackLabel: 'Backend',
      trackDescription: 'Server-side logic and API layer',
      trackFocusTypes: 'http, data-flow, error-handling',
    }));
  });

  it('should work without track (backward compat)', async () => {
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
      trackId: undefined,
      trackLabel: undefined,
      trackDescription: undefined,
      trackFocusTypes: undefined,
    }));
  });

  it('should filter FE patterns from BE track', async () => {
    const analysis = createMockAnalysis();
    analysis.patterns = [
      { pattern: 'Express middleware stack', confidence: 'high' },
      { pattern: 'React component composition', confidence: 'high' },
      { pattern: 'Singleton', confidence: 'medium' },
    ];

    const backendTrack: Track = {
      id: 'backend',
      label: 'Backend',
      description: 'Server-side',
      focusTypes: ['http'],
      confidence: 0.8,
      suggestedOrder: 3,
    };

    // Capture the prompt sent to LLM
    const mockLLMClient: ILLMClient = {
      complete: vi.fn().mockResolvedValue({
        content: '{"chapters": []}',
        tokensUsed: 50,
      } as LLMResponse),
    };

    // Capture template vars sent to prompt loader
    let capturedVars: any;
    const mockPromptLoader: IPromptLoader = {
      load: vi.fn().mockImplementation((name: string, vars: any) => {
        capturedVars = vars;
        return 'mocked prompt';
      }),
    };

    const planner = new Planner(mockLLMClient, mockPromptLoader);
    await planner.plan(analysis, createMockUserContext(), backendTrack);

    // patterns should NOT include React-related pattern
    const patternNames = capturedVars.patterns.map((p: any) => p.pattern);
    expect(patternNames).toContain('Express middleware stack');
    expect(patternNames).toContain('Singleton'); // generic, not FE-specific
    expect(patternNames).not.toContain('React component composition');
  });

  it('should filter dependency graph nodes/edges/layers by track', async () => {
    const analysis = createMockAnalysis();
    analysis.dependencyGraph = {
      nodes: [
        { path: 'src/routes/api.ts', language: 'typescript', loc: 80 },
        { path: 'src/components/Button.tsx', language: 'typescript', loc: 40 },
        { path: 'src/utils/helpers.ts', language: 'typescript', loc: 20 },
      ],
      edges: [
        { from: 'src/routes/api.ts', to: 'src/utils/helpers.ts', weight: 1 },
        { from: 'src/components/Button.tsx', to: 'src/utils/helpers.ts', weight: 1 },
      ],
      layers: [['src/routes/api.ts', 'src/components/Button.tsx'], ['src/utils/helpers.ts']],
    };
    analysis.modules = [
      { name: 'routes', path: 'src/routes', fileCount: 3 },
    ];
    analysis.entryPoints = [{ path: 'src/routes/api.ts', reason: 'http' }];

    const backendTrack: Track = {
      id: 'backend',
      label: 'Backend',
      description: 'Server-side',
      focusTypes: ['http'],
      confidence: 0.8,
      suggestedOrder: 3,
    };

    let capturedVars: any;
    const mockLLMClient: ILLMClient = {
      complete: vi.fn().mockResolvedValue({
        content: '{"chapters": []}',
        tokensUsed: 50,
      } as LLMResponse),
    };
    const mockPromptLoader: IPromptLoader = {
      load: vi.fn().mockImplementation((_name: string, vars: any) => {
        capturedVars = vars;
        return 'mocked prompt';
      }),
    };

    const planner = new Planner(mockLLMClient, mockPromptLoader);
    await planner.plan(analysis, createMockUserContext(), backendTrack);

    // Frontend file (src/components/Button.tsx) should be excluded from layers
    const layers = capturedVars.dependencyLayers;
    expect(layers).toContain('src/routes/api.ts');
    expect(layers).toContain('src/utils/helpers.ts');
    expect(layers).not.toContain('src/components/Button.tsx');
  });

  it('should filter module files by track using fileTrackMap', async () => {
    const analysis = createMockAnalysis();
    // 'app' module contains mostly backend files, but also a frontend file
    analysis.modules = [
      { name: 'app', path: 'app', description: 'FastAPI app', fileCount: 4,
        files: ['app/main.py', 'app/models.py', 'app/routes.py', 'app/static/app.js'] },
      { name: 'static', path: 'static', description: 'Frontend assets', fileCount: 2,
        files: ['static/index.html', 'static/style.css'] },
    ];
    analysis.fileTrackMap = new Map([
      ['app/main.py', 'backend'],
      ['app/models.py', 'backend'],
      ['app/routes.py', 'backend'],
      ['app/static/app.js', 'frontend'],
      ['static/index.html', 'frontend'],
      ['static/style.css', 'frontend'],
    ]);

    const frontendTrack: Track = {
      id: 'frontend',
      label: 'Frontend',
      description: 'UI layer',
      focusTypes: ['state-management', 'pattern'],
      confidence: 0.7,
      suggestedOrder: 2,
    };

    let capturedVars: any;
    const mockLLMClient: ILLMClient = {
      complete: vi.fn().mockResolvedValue({
        content: '{"chapters": []}',
        tokensUsed: 50,
      } as LLMResponse),
    };
    const mockPromptLoader: IPromptLoader = {
      load: vi.fn().mockImplementation((_name: string, vars: any) => {
        capturedVars = vars;
        return 'mocked prompt';
      }),
    };

    const planner = new Planner(mockLLMClient, mockPromptLoader);
    await planner.plan(analysis, createMockUserContext(), frontendTrack);

    const moduleNames = capturedVars.modules.map((m: any) => m.name);
    // 'app' module still included but only with its frontend file
    expect(moduleNames).toContain('app');
    expect(moduleNames).toContain('static');
    const appModule = capturedVars.modules.find((m: any) => m.name === 'app');
    expect(appModule.files).toEqual(['app/static/app.js']);
    expect(appModule.fileCount).toBe(1);
  });

  it('should not filter patterns for architecture track', async () => {
    const analysis = createMockAnalysis();
    analysis.patterns = [
      { pattern: 'Express middleware stack', confidence: 'high' },
      { pattern: 'React component composition', confidence: 'high' },
    ];

    const archTrack: Track = {
      id: 'architecture',
      label: 'Architecture',
      description: 'Overall',
      focusTypes: ['structure'],
      confidence: 0.9,
      suggestedOrder: 1,
    };

    let capturedVars: any;
    const mockLLMClient: ILLMClient = {
      complete: vi.fn().mockResolvedValue({
        content: '{"chapters": []}',
        tokensUsed: 50,
      } as LLMResponse),
    };
    const mockPromptLoader: IPromptLoader = {
      load: vi.fn().mockImplementation((name: string, vars: any) => {
        capturedVars = vars;
        return 'mocked prompt';
      }),
    };

    const planner = new Planner(mockLLMClient, mockPromptLoader);
    await planner.plan(analysis, createMockUserContext(), archTrack);

    const patternNames = capturedVars.patterns.map((p: any) => p.pattern);
    expect(patternNames).toContain('Express middleware stack');
    expect(patternNames).toContain('React component composition');
  });
});
