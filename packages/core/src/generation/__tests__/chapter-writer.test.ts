// packages/core/src/generation/__tests__/chapter-writer.test.ts

import { describe, it, expect, vi } from 'vitest';
import { ChapterWriter } from '../chapter-writer';
import type { ILLMClient, LLMResponse } from '../llm-client';
import type { IPromptLoader } from '../prompt-loader';
import type { EvidencePack, UserContext } from '../../types';

describe('ChapterWriter', () => {
  const createMockEvidence = (): EvidencePack => ({
    chapterId: 'ch-1',
    files: [
      {
        path: 'src/index.ts',
        language: 'typescript',
        content: 'export const main = () => {};',
        truncated: false,
      },
    ],
    totalTokensEstimate: 100,
  });

  const createMockUserContext = (): UserContext => ({
    preferredLanguage: 'TypeScript',
    skillLevel: 'intermediate',
  });

  it('should generate chapter content from evidence', async () => {
    const responseJson = {
      chapterId: 'ch-1',
      title: 'Introduction',
      sections: [
        {
          heading: 'Overview',
          content: 'This chapter covers the basics.',
          codeReferences: [{ file: 'src/index.ts', startLine: 1, endLine: 5 }],
        },
      ],
      keyTakeaways: ['Takeaway 1', 'Takeaway 2'],
      bridgeToNext: 'Next we cover advanced topics.',
      patternsReferenced: [{ name: 'Singleton', description: 'A singleton pattern' }],
    };

    const mockLLMClient: ILLMClient = {
      complete: vi.fn().mockResolvedValue({
        content: '```json\n' + JSON.stringify(responseJson) + '\n```',
        tokensUsed: 500,
      } as LLMResponse),
    };

    const mockPromptLoader: IPromptLoader = {
      load: vi.fn().mockReturnValue('rendered prompt'),
    };

    const writer = new ChapterWriter(mockLLMClient, mockPromptLoader);
    const evidence = createMockEvidence();
    const userContext = createMockUserContext();

    const content = await writer.generate(
      evidence,
      'Introduction',
      ['Learn basics'],
      userContext
    );

    expect(content.chapterId).toBe('ch-1');
    expect(content.title).toBe('Introduction');
    expect(content.sections).toHaveLength(1);
    expect(content.sections[0].heading).toBe('Overview');
    expect(content.keyTakeaways).toEqual(['Takeaway 1', 'Takeaway 2']);
    expect(content.bridgeToNext).toBe('Next we cover advanced topics.');
    expect(content.patternsReferenced).toHaveLength(1);
    expect(content.generatedAt).toBeDefined();
  });

  it('should call prompt loader with correct context', async () => {
    const mockLLMClient: ILLMClient = {
      complete: vi.fn().mockResolvedValue({
        content: '{"title": "Test", "sections": [], "keyTakeaways": []}',
        tokensUsed: 100,
      } as LLMResponse),
    };

    const mockPromptLoader: IPromptLoader = {
      load: vi.fn().mockReturnValue('prompt'),
    };

    const writer = new ChapterWriter(mockLLMClient, mockPromptLoader);
    const evidence = createMockEvidence();
    const userContext = createMockUserContext();

    await writer.generate(
      evidence,
      'Chapter Title',
      ['Objective 1', 'Objective 2'],
      userContext,
      ['ch-0']
    );

    expect(mockPromptLoader.load).toHaveBeenCalledWith('chapter-writer-v2', expect.objectContaining({
      chapterId: 'ch-1',
      chapterTitle: 'Chapter Title',
      learningObjectives: ['Objective 1', 'Objective 2'],
      skillLevel: 'intermediate',
      userPreferredLanguage: 'TypeScript',
      evidencePack: evidence,
      completedChapters: 'ch-0',
    }));
  });

  it('should pass rendered prompt to LLM client', async () => {
    const mockLLMClient: ILLMClient = {
      complete: vi.fn().mockResolvedValue({
        content: '{"title": "Test", "sections": [], "keyTakeaways": []}',
        tokensUsed: 100,
      } as LLMResponse),
    };

    const mockPromptLoader: IPromptLoader = {
      load: vi.fn().mockReturnValue('the rendered prompt'),
    };

    const writer = new ChapterWriter(mockLLMClient, mockPromptLoader);
    const evidence = createMockEvidence();
    const userContext = createMockUserContext();

    await writer.generate(evidence, 'Title', [], userContext);

    expect(mockLLMClient.complete).toHaveBeenCalledWith('the rendered prompt');
  });

  it('should handle JSON response without code fence', async () => {
    const responseJson = {
      title: 'Test Title',
      sections: [{ heading: 'Section', content: 'Content' }],
      keyTakeaways: ['Key point'],
    };

    const mockLLMClient: ILLMClient = {
      complete: vi.fn().mockResolvedValue({
        content: JSON.stringify(responseJson),
        tokensUsed: 150,
      } as LLMResponse),
    };

    const mockPromptLoader: IPromptLoader = {
      load: vi.fn().mockReturnValue('prompt'),
    };

    const writer = new ChapterWriter(mockLLMClient, mockPromptLoader);
    const evidence = createMockEvidence();
    const userContext = createMockUserContext();

    const content = await writer.generate(evidence, 'Title', [], userContext);

    expect(content.title).toBe('Test Title');
    expect(content.sections).toHaveLength(1);
  });

  it('should use fallback values for missing fields', async () => {
    const mockLLMClient: ILLMClient = {
      complete: vi.fn().mockResolvedValue({
        content: '{}',
        tokensUsed: 50,
      } as LLMResponse),
    };

    const mockPromptLoader: IPromptLoader = {
      load: vi.fn().mockReturnValue('prompt'),
    };

    const writer = new ChapterWriter(mockLLMClient, mockPromptLoader);
    const evidence = createMockEvidence();
    const userContext = createMockUserContext();

    const content = await writer.generate(evidence, 'Fallback Title', [], userContext);

    expect(content.title).toBe('Fallback Title');
    expect(content.sections).toEqual([]);
    expect(content.keyTakeaways).toEqual([]);
  });

  it('should handle empty completed chapters', async () => {
    const mockLLMClient: ILLMClient = {
      complete: vi.fn().mockResolvedValue({
        content: '{"title": "Test", "sections": [], "keyTakeaways": []}',
        tokensUsed: 100,
      } as LLMResponse),
    };

    const mockPromptLoader: IPromptLoader = {
      load: vi.fn().mockReturnValue('prompt'),
    };

    const writer = new ChapterWriter(mockLLMClient, mockPromptLoader);
    const evidence = createMockEvidence();
    const userContext = createMockUserContext();

    await writer.generate(evidence, 'Title', [], userContext);

    expect(mockPromptLoader.load).toHaveBeenCalledWith('chapter-writer-v2', expect.objectContaining({
      completedChapters: 'None',
    }));
  });

  it('should throw on invalid JSON response', async () => {
    const mockLLMClient: ILLMClient = {
      complete: vi.fn().mockResolvedValue({
        content: 'Not valid JSON',
        tokensUsed: 25,
      } as LLMResponse),
    };

    const mockPromptLoader: IPromptLoader = {
      load: vi.fn().mockReturnValue('prompt'),
    };

    const writer = new ChapterWriter(mockLLMClient, mockPromptLoader);
    const evidence = createMockEvidence();
    const userContext = createMockUserContext();

    await expect(writer.generate(evidence, 'Title', [], userContext)).rejects.toThrow();
  });

  describe('generateOutline', () => {
    it('should return a ChapterOutline with sections and takeaways', async () => {
      const mockResponse: LLMResponse = {
        content: JSON.stringify({
          chapterId: 'ch-1',
          title: 'Overview',
          sections: [{ heading: 'Structure', summary: 'Project layout overview.' }],
          keyTakeaways: ['The project uses a monorepo'],
        }),
        tokensUsed: 50,
      };

      const mockLLMClient: ILLMClient = { complete: vi.fn().mockResolvedValue(mockResponse) };
      const mockPromptLoader: IPromptLoader = { load: vi.fn().mockReturnValue('prompt') };

      const writer = new ChapterWriter(mockLLMClient, mockPromptLoader);
      const evidence = createMockEvidence();

      const result = await writer.generateOutline(
        evidence,
        'Overview',
        ['Understand structure'],
        { preferredLanguage: 'TypeScript', skillLevel: 'intermediate' }
      );

      expect(result.chapterId).toBe('ch-1');
      expect(result.sections).toHaveLength(1);
      expect(result.sections[0].heading).toBe('Structure');
      expect(result.keyTakeaways).toContain('The project uses a monorepo');
    });

    it('should call prompt loader with chapter-outline template', async () => {
      const mockLLMClient: ILLMClient = {
        complete: vi.fn().mockResolvedValue({
          content: '{"title": "Test", "sections": [], "keyTakeaways": []}',
          tokensUsed: 100,
        } as LLMResponse),
      };
      const mockPromptLoader: IPromptLoader = { load: vi.fn().mockReturnValue('prompt') };
      const writer = new ChapterWriter(mockLLMClient, mockPromptLoader);

      await writer.generateOutline(
        createMockEvidence(),
        'Title',
        ['Obj'],
        { preferredLanguage: 'TypeScript', skillLevel: 'intermediate' }
      );

      expect(mockPromptLoader.load).toHaveBeenCalledWith('chapter-outline', expect.objectContaining({
        chapterTitle: 'Title',
        learningObjectives: ['Obj'],
      }));
    });

    it('should handle code-fenced JSON', async () => {
      const mockLLMClient: ILLMClient = {
        complete: vi.fn().mockResolvedValue({
          content: '```json\n{"title":"T","sections":[],"keyTakeaways":[]}\n```',
          tokensUsed: 50,
        } as LLMResponse),
      };
      const mockPromptLoader: IPromptLoader = { load: vi.fn().mockReturnValue('prompt') };
      const writer = new ChapterWriter(mockLLMClient, mockPromptLoader);

      const result = await writer.generateOutline(
        createMockEvidence(),
        'Fallback',
        [],
        { preferredLanguage: 'TypeScript', skillLevel: 'intermediate' }
      );

      expect(result.title).toBe('T');
    });
  });

  it('should include generatedAt timestamp', async () => {
    const mockLLMClient: ILLMClient = {
      complete: vi.fn().mockResolvedValue({
        content: '{"title": "Test", "sections": [], "keyTakeaways": []}',
        tokensUsed: 100,
      } as LLMResponse),
    };

    const mockPromptLoader: IPromptLoader = {
      load: vi.fn().mockReturnValue('prompt'),
    };

    const writer = new ChapterWriter(mockLLMClient, mockPromptLoader);
    const evidence = createMockEvidence();
    const userContext = createMockUserContext();

    const before = new Date().toISOString();
    const content = await writer.generate(evidence, 'Title', [], userContext);
    const after = new Date().toISOString();

    expect(content.generatedAt).toBeDefined();
    expect(content.generatedAt! >= before).toBe(true);
    expect(content.generatedAt! <= after).toBe(true);
  });
});
