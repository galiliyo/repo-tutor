// packages/core/src/quiz/__tests__/generator.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QuizGenerator } from '../generator';
import type { ILLMClient, LLMResponse } from '../../generation/llm-client';
import type { IPromptLoader } from '../../generation/prompt-loader';
import type { ChapterContent, Question } from '../../types';

describe('QuizGenerator', () => {
  const createMockChapterContent = (): ChapterContent => ({
    chapterId: 'ch-1',
    title: 'Introduction to the Codebase',
    sections: [
      {
        heading: 'Overview',
        content: 'This chapter covers the overall structure of the project.',
        codeReferences: [{ file: 'src/index.ts', startLine: 1, endLine: 20 }],
      },
      {
        heading: 'Key Components',
        content: 'The main components include the parser, analyzer, and generator.',
      },
    ],
    keyTakeaways: [
      'The project uses a modular architecture',
      'Entry point is src/index.ts',
      'TypeScript is the primary language',
    ],
    bridgeToNext: 'Next, we will explore the parser module.',
    generatedAt: new Date().toISOString(),
  });

  const createMockQuestions = (): Question[] => [
    {
      id: 'q-1',
      chapterId: 'ch-1',
      type: 'multiple-choice',
      bloomLevel: 'remembering',
      difficulty: 'easy',
      question: 'What is the entry point of the project?',
      options: ['src/index.ts', 'src/main.ts', 'src/app.ts', 'index.js'],
      correctAnswer: 'src/index.ts',
      keyPoints: ['Entry point identification'],
      explanation: 'The entry point is src/index.ts as mentioned in the chapter.',
    },
    {
      id: 'q-2',
      chapterId: 'ch-1',
      type: 'true-false',
      bloomLevel: 'understanding',
      difficulty: 'easy',
      question: 'The project uses a modular architecture.',
      correctAnswer: 'true',
      keyPoints: ['Architecture understanding'],
    },
    {
      id: 'q-3',
      chapterId: 'ch-1',
      type: 'free-text',
      bloomLevel: 'applying',
      difficulty: 'medium',
      question: 'Explain the purpose of the analyzer component.',
      correctAnswer: 'The analyzer component processes the parsed code to extract meaningful information.',
      keyPoints: ['Analyzer purpose', 'Component responsibility'],
    },
    {
      id: 'q-4',
      chapterId: 'ch-1',
      type: 'code-completion',
      bloomLevel: 'analyzing',
      difficulty: 'hard',
      question: 'Complete the following code to import the parser module:',
      correctAnswer: "import { Parser } from './parser';",
      keyPoints: ['Module imports', 'TypeScript syntax'],
    },
  ];

  let mockLLMClient: ILLMClient;
  let mockPromptLoader: IPromptLoader;

  beforeEach(() => {
    mockLLMClient = {
      complete: vi.fn(),
    };
    mockPromptLoader = {
      load: vi.fn().mockReturnValue('rendered prompt'),
    };
  });

  it('should parse LLM response into Question[]', async () => {
    const questions = createMockQuestions();
    (mockLLMClient.complete as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: '```json\n' + JSON.stringify({ questions }) + '\n```',
      tokensUsed: 500,
    } as LLMResponse);

    const generator = new QuizGenerator(mockLLMClient, mockPromptLoader);
    const chapter = createMockChapterContent();

    const result = await generator.generate(chapter);

    expect(result).toHaveLength(4);
    expect(result[0].id).toBe('q-1');
    expect(result[0].type).toBe('multiple-choice');
    expect(result[0].bloomLevel).toBe('remembering');
    expect(result[0].difficulty).toBe('easy');
    expect(result[0].question).toBe('What is the entry point of the project?');
    expect(result[0].options).toEqual(['src/index.ts', 'src/main.ts', 'src/app.ts', 'index.js']);
    expect(result[0].correctAnswer).toBe('src/index.ts');
  });

  it('should call prompt loader with correct context', async () => {
    const questions = createMockQuestions();
    (mockLLMClient.complete as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: JSON.stringify({ questions }),
      tokensUsed: 500,
    } as LLMResponse);

    const generator = new QuizGenerator(mockLLMClient, mockPromptLoader);
    const chapter = createMockChapterContent();

    await generator.generate(chapter);

    expect(mockPromptLoader.load).toHaveBeenCalledWith(
      'quiz-generator',
      expect.objectContaining({
        chapterId: 'ch-1',
        chapterTitle: 'Introduction to the Codebase',
        chapterSummary: expect.any(String),
        learningObjectives: expect.any(Array),
      })
    );
  });

  it('should pass rendered prompt to LLM client', async () => {
    (mockLLMClient.complete as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: '{"questions": []}',
      tokensUsed: 50,
    } as LLMResponse);

    mockPromptLoader.load = vi.fn().mockReturnValue('the quiz prompt');

    const generator = new QuizGenerator(mockLLMClient, mockPromptLoader);
    const chapter = createMockChapterContent();

    await generator.generate(chapter);

    expect(mockLLMClient.complete).toHaveBeenCalledWith('the quiz prompt', undefined, 'quiz');
  });

  it('should handle JSON response without code fence', async () => {
    const questions = [createMockQuestions()[0]];
    (mockLLMClient.complete as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: JSON.stringify({ questions }),
      tokensUsed: 200,
    } as LLMResponse);

    const generator = new QuizGenerator(mockLLMClient, mockPromptLoader);
    const chapter = createMockChapterContent();

    const result = await generator.generate(chapter);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('q-1');
  });

  it('should handle direct array response (no questions wrapper)', async () => {
    const questions = createMockQuestions();
    (mockLLMClient.complete as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: '```json\n' + JSON.stringify(questions) + '\n```',
      tokensUsed: 500,
    } as LLMResponse);

    const generator = new QuizGenerator(mockLLMClient, mockPromptLoader);
    const chapter = createMockChapterContent();

    const result = await generator.generate(chapter);

    expect(result).toHaveLength(4);
  });

  it('should handle different question types', async () => {
    const questions = createMockQuestions();
    (mockLLMClient.complete as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: JSON.stringify({ questions }),
      tokensUsed: 500,
    } as LLMResponse);

    const generator = new QuizGenerator(mockLLMClient, mockPromptLoader);
    const chapter = createMockChapterContent();

    const result = await generator.generate(chapter);

    const types = result.map((q) => q.type);
    expect(types).toContain('multiple-choice');
    expect(types).toContain('true-false');
    expect(types).toContain('free-text');
    expect(types).toContain('code-completion');
  });

  it('should handle different bloom levels', async () => {
    const questions = createMockQuestions();
    (mockLLMClient.complete as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: JSON.stringify({ questions }),
      tokensUsed: 500,
    } as LLMResponse);

    const generator = new QuizGenerator(mockLLMClient, mockPromptLoader);
    const chapter = createMockChapterContent();

    const result = await generator.generate(chapter);

    const bloomLevels = result.map((q) => q.bloomLevel);
    expect(bloomLevels).toContain('remembering');
    expect(bloomLevels).toContain('understanding');
    expect(bloomLevels).toContain('applying');
    expect(bloomLevels).toContain('analyzing');
  });

  it('should handle different difficulty levels', async () => {
    const questions = [
      { ...createMockQuestions()[0], difficulty: 'easy' },
      { ...createMockQuestions()[1], difficulty: 'medium' },
      { ...createMockQuestions()[2], difficulty: 'hard' },
    ];
    (mockLLMClient.complete as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: JSON.stringify({ questions }),
      tokensUsed: 300,
    } as LLMResponse);

    const generator = new QuizGenerator(mockLLMClient, mockPromptLoader);
    const chapter = createMockChapterContent();

    const result = await generator.generate(chapter);

    const difficulties = result.map((q) => q.difficulty);
    expect(difficulties).toContain('easy');
    expect(difficulties).toContain('medium');
    expect(difficulties).toContain('hard');
  });

  it('should throw on invalid JSON response', async () => {
    (mockLLMClient.complete as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: 'Not valid JSON at all',
      tokensUsed: 25,
    } as LLMResponse);

    const generator = new QuizGenerator(mockLLMClient, mockPromptLoader);
    const chapter = createMockChapterContent();

    await expect(generator.generate(chapter)).rejects.toThrow();
  });

  it('should return empty array when no questions generated', async () => {
    (mockLLMClient.complete as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: '{"questions": []}',
      tokensUsed: 50,
    } as LLMResponse);

    const generator = new QuizGenerator(mockLLMClient, mockPromptLoader);
    const chapter = createMockChapterContent();

    const result = await generator.generate(chapter);

    expect(result).toEqual([]);
  });

  it('should include optional fields when present', async () => {
    const questions: Question[] = [
      {
        id: 'q-1',
        chapterId: 'ch-1',
        type: 'multiple-choice',
        bloomLevel: 'remembering',
        difficulty: 'easy',
        question: 'What is the entry point?',
        options: ['a', 'b', 'c'],
        correctAnswer: 'a',
        keyPoints: ['Entry point'],
        explanation: 'Because it is the main file',
        relatedObjective: 'Understand project structure',
        relatedCode: { file: 'src/index.ts', lines: [1, 2, 3] },
        rubric: {
          fullCredit: 'Correctly identifies entry point',
          partialCredit: 'Shows partial understanding',
          noCredit: 'Incorrect answer',
        },
      },
    ];
    (mockLLMClient.complete as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: JSON.stringify({ questions }),
      tokensUsed: 300,
    } as LLMResponse);

    const generator = new QuizGenerator(mockLLMClient, mockPromptLoader);
    const chapter = createMockChapterContent();

    const result = await generator.generate(chapter);

    expect(result[0].explanation).toBe('Because it is the main file');
    expect(result[0].relatedObjective).toBe('Understand project structure');
    expect(result[0].relatedCode).toEqual({ file: 'src/index.ts', lines: [1, 2, 3] });
    expect(result[0].rubric).toEqual({
      fullCredit: 'Correctly identifies entry point',
      partialCredit: 'Shows partial understanding',
      noCredit: 'Incorrect answer',
    });
  });
});
