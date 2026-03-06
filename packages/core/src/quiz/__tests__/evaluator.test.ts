// packages/core/src/quiz/__tests__/evaluator.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QuizEvaluator } from '../evaluator';
import type { ILLMClient, LLMResponse } from '../../generation/llm-client';
import type { IPromptLoader } from '../../generation/prompt-loader';
import type { Question } from '../../types';

describe('QuizEvaluator', () => {
  const createMockMultipleChoiceQuestion = (): Question => ({
    id: 'q-1',
    chapterId: 'ch-1',
    type: 'multiple-choice',
    bloomLevel: 'remembering',
    difficulty: 'easy',
    question: 'What is the entry point of the project?',
    options: ['src/index.ts', 'src/main.ts', 'src/app.ts', 'index.js'],
    correctAnswer: 'src/index.ts',
    keyPoints: ['Entry point identification', 'Project structure'],
    explanation: 'The entry point is src/index.ts as configured in package.json.',
  });

  const createMockTrueFalseQuestion = (): Question => ({
    id: 'q-2',
    chapterId: 'ch-1',
    type: 'true-false',
    bloomLevel: 'understanding',
    difficulty: 'easy',
    question: 'The project uses a modular architecture.',
    correctAnswer: 'true',
    keyPoints: ['Architecture understanding'],
  });

  const createMockFreeTextQuestion = (): Question => ({
    id: 'q-3',
    chapterId: 'ch-1',
    type: 'free-text',
    bloomLevel: 'applying',
    difficulty: 'medium',
    question: 'Explain the purpose of the analyzer component.',
    correctAnswer: 'The analyzer component processes the parsed code to extract meaningful information about the codebase structure.',
    keyPoints: ['Analyzer purpose', 'Code processing', 'Structure extraction'],
  });

  const createMockCodeCompletionQuestion = (): Question => ({
    id: 'q-4',
    chapterId: 'ch-1',
    type: 'code-completion',
    bloomLevel: 'analyzing',
    difficulty: 'hard',
    question: 'Complete the following code to import the parser module:',
    correctAnswer: "import { Parser } from './parser';",
    keyPoints: ['Module imports', 'TypeScript syntax', 'Named exports'],
  });

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

  it('should parse LLM response into Evaluation', async () => {
    const evaluation = {
      isCorrect: true,
      score: 100,
      keyPointsCovered: ['Entry point identification'],
      keyPointsMissing: [],
      misconceptions: [],
      feedback: 'Excellent! You correctly identified the entry point.',
      explanation: 'src/index.ts is the entry point as specified in package.json',
      hints: [],
      encouragement: 'Great job!',
    };

    (mockLLMClient.complete as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: '```json\n' + JSON.stringify(evaluation) + '\n```',
      tokensUsed: 200,
    } as LLMResponse);

    const evaluator = new QuizEvaluator(mockLLMClient, mockPromptLoader);
    const question = createMockMultipleChoiceQuestion();

    const result = await evaluator.evaluate(question, 'src/index.ts');

    expect(result.questionId).toBe('q-1');
    expect(result.userAnswer).toBe('src/index.ts');
    expect(result.isCorrect).toBe(true);
    expect(result.score).toBe(100);
    expect(result.feedback).toBe('Excellent! You correctly identified the entry point.');
  });

  it('should call prompt loader with correct context for multiple-choice', async () => {
    (mockLLMClient.complete as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: JSON.stringify({ isCorrect: true, score: 100, feedback: 'Correct!' }),
      tokensUsed: 100,
    } as LLMResponse);

    const evaluator = new QuizEvaluator(mockLLMClient, mockPromptLoader);
    const question = createMockMultipleChoiceQuestion();

    await evaluator.evaluate(question, 'src/index.ts');

    expect(mockPromptLoader.load).toHaveBeenCalledWith(
      'evaluator',
      expect.objectContaining({
        question: question.question,
        questionType: 'multiple-choice',
        correctAnswer: 'src/index.ts',
        keyPoints: ['Entry point identification', 'Project structure'],
        userAnswer: 'src/index.ts',
        options: ['src/index.ts', 'src/main.ts', 'src/app.ts', 'index.js'],
      })
    );
  });

  it('should pass rendered prompt to LLM client', async () => {
    (mockLLMClient.complete as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: '{"isCorrect": true, "score": 100, "feedback": "Good"}',
      tokensUsed: 50,
    } as LLMResponse);

    mockPromptLoader.load = vi.fn().mockReturnValue('the evaluator prompt');

    const evaluator = new QuizEvaluator(mockLLMClient, mockPromptLoader);
    const question = createMockMultipleChoiceQuestion();

    await evaluator.evaluate(question, 'src/index.ts');

    expect(mockLLMClient.complete).toHaveBeenCalledWith('the evaluator prompt', undefined, 'evaluator');
  });

  it('should handle JSON response without code fence', async () => {
    const evaluation = {
      isCorrect: false,
      score: 0,
      feedback: 'Incorrect answer.',
    };

    (mockLLMClient.complete as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: JSON.stringify(evaluation),
      tokensUsed: 100,
    } as LLMResponse);

    const evaluator = new QuizEvaluator(mockLLMClient, mockPromptLoader);
    const question = createMockMultipleChoiceQuestion();

    const result = await evaluator.evaluate(question, 'src/main.ts');

    expect(result.isCorrect).toBe(false);
    expect(result.score).toBe(0);
    expect(result.feedback).toBe('Incorrect answer.');
  });

  it('should evaluate correct multiple-choice answer', async () => {
    const evaluation = {
      isCorrect: true,
      score: 100,
      keyPointsCovered: ['Entry point identification', 'Project structure'],
      keyPointsMissing: [],
      feedback: 'Perfect! You correctly identified the entry point.',
      encouragement: 'Keep up the excellent work!',
    };

    (mockLLMClient.complete as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: JSON.stringify(evaluation),
      tokensUsed: 150,
    } as LLMResponse);

    const evaluator = new QuizEvaluator(mockLLMClient, mockPromptLoader);
    const question = createMockMultipleChoiceQuestion();

    const result = await evaluator.evaluate(question, 'src/index.ts');

    expect(result.isCorrect).toBe(true);
    expect(result.score).toBe(100);
    expect(result.keyPointsCovered).toEqual(['Entry point identification', 'Project structure']);
  });

  it('should evaluate incorrect multiple-choice answer', async () => {
    const evaluation = {
      isCorrect: false,
      score: 0,
      keyPointsCovered: [],
      keyPointsMissing: ['Entry point identification'],
      misconceptions: ['Confusing main.ts with index.ts'],
      feedback: 'Incorrect. The entry point is src/index.ts, not src/main.ts.',
      hints: ['Check the package.json "main" field', 'Look for the file that initializes the app'],
    };

    (mockLLMClient.complete as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: JSON.stringify(evaluation),
      tokensUsed: 180,
    } as LLMResponse);

    const evaluator = new QuizEvaluator(mockLLMClient, mockPromptLoader);
    const question = createMockMultipleChoiceQuestion();

    const result = await evaluator.evaluate(question, 'src/main.ts');

    expect(result.isCorrect).toBe(false);
    expect(result.score).toBe(0);
    expect(result.misconceptions).toContain('Confusing main.ts with index.ts');
    expect(result.hints).toHaveLength(2);
  });

  it('should evaluate true-false question correctly', async () => {
    const evaluation = {
      isCorrect: true,
      score: 100,
      keyPointsCovered: ['Architecture understanding'],
      feedback: 'Correct! The project does use a modular architecture.',
    };

    (mockLLMClient.complete as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: JSON.stringify(evaluation),
      tokensUsed: 100,
    } as LLMResponse);

    const evaluator = new QuizEvaluator(mockLLMClient, mockPromptLoader);
    const question = createMockTrueFalseQuestion();

    const result = await evaluator.evaluate(question, 'true');

    expect(result.isCorrect).toBe(true);
    expect(result.score).toBe(100);
  });

  it('should evaluate free-text question with partial credit', async () => {
    const evaluation = {
      isCorrect: false,
      score: 60,
      keyPointsCovered: ['Analyzer purpose'],
      keyPointsMissing: ['Code processing', 'Structure extraction'],
      feedback: 'Partially correct. You understood the purpose but missed some key details.',
      explanation: 'The analyzer also handles code processing and structure extraction.',
      hints: ['Consider what information the analyzer extracts from code'],
    };

    (mockLLMClient.complete as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: JSON.stringify(evaluation),
      tokensUsed: 200,
    } as LLMResponse);

    const evaluator = new QuizEvaluator(mockLLMClient, mockPromptLoader);
    const question = createMockFreeTextQuestion();

    const result = await evaluator.evaluate(question, 'The analyzer processes code.');

    expect(result.isCorrect).toBe(false);
    expect(result.score).toBe(60);
    expect(result.keyPointsCovered).toContain('Analyzer purpose');
    expect(result.keyPointsMissing).toContain('Code processing');
  });

  it('should evaluate code-completion question', async () => {
    const evaluation = {
      isCorrect: true,
      score: 100,
      keyPointsCovered: ['Module imports', 'TypeScript syntax', 'Named exports'],
      feedback: 'Perfect! Your import statement is correct.',
    };

    (mockLLMClient.complete as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: JSON.stringify(evaluation),
      tokensUsed: 120,
    } as LLMResponse);

    const evaluator = new QuizEvaluator(mockLLMClient, mockPromptLoader);
    const question = createMockCodeCompletionQuestion();

    const result = await evaluator.evaluate(question, "import { Parser } from './parser';");

    expect(result.isCorrect).toBe(true);
    expect(result.score).toBe(100);
  });

  it('should handle missing optional fields in LLM response', async () => {
    const evaluation = {
      isCorrect: true,
      score: 100,
      feedback: 'Correct!',
    };

    (mockLLMClient.complete as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: JSON.stringify(evaluation),
      tokensUsed: 50,
    } as LLMResponse);

    const evaluator = new QuizEvaluator(mockLLMClient, mockPromptLoader);
    const question = createMockMultipleChoiceQuestion();

    const result = await evaluator.evaluate(question, 'src/index.ts');

    expect(result.questionId).toBe('q-1');
    expect(result.userAnswer).toBe('src/index.ts');
    expect(result.isCorrect).toBe(true);
    expect(result.score).toBe(100);
    expect(result.feedback).toBe('Correct!');
    expect(result.keyPointsCovered).toBeUndefined();
    expect(result.hints).toBeUndefined();
  });

  it('should throw on invalid JSON response', async () => {
    (mockLLMClient.complete as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: 'This is not valid JSON',
      tokensUsed: 25,
    } as LLMResponse);

    const evaluator = new QuizEvaluator(mockLLMClient, mockPromptLoader);
    const question = createMockMultipleChoiceQuestion();

    await expect(evaluator.evaluate(question, 'src/index.ts')).rejects.toThrow();
  });

  it('should handle empty keyPoints in question', async () => {
    const question: Question = {
      id: 'q-5',
      chapterId: 'ch-1',
      type: 'true-false',
      bloomLevel: 'remembering',
      difficulty: 'easy',
      question: 'TypeScript is used in this project.',
      correctAnswer: 'true',
    };

    (mockLLMClient.complete as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: JSON.stringify({ isCorrect: true, score: 100, feedback: 'Correct!' }),
      tokensUsed: 50,
    } as LLMResponse);

    const evaluator = new QuizEvaluator(mockLLMClient, mockPromptLoader);

    await evaluator.evaluate(question, 'true');

    expect(mockPromptLoader.load).toHaveBeenCalledWith(
      'evaluator',
      expect.objectContaining({
        keyPoints: [],
      })
    );
  });

  it('should provide default values when LLM response is minimal', async () => {
    (mockLLMClient.complete as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: '{}',
      tokensUsed: 10,
    } as LLMResponse);

    const evaluator = new QuizEvaluator(mockLLMClient, mockPromptLoader);
    const question = createMockMultipleChoiceQuestion();

    const result = await evaluator.evaluate(question, 'src/index.ts');

    expect(result.questionId).toBe('q-1');
    expect(result.userAnswer).toBe('src/index.ts');
    expect(result.isCorrect).toBe(false);
    expect(result.score).toBe(0);
    expect(result.feedback).toBe('');
  });

  it('should include all evaluation fields when present', async () => {
    const fullEvaluation = {
      isCorrect: true,
      score: 85,
      keyPointsCovered: ['Point A', 'Point B'],
      keyPointsMissing: ['Point C'],
      misconceptions: ['Minor misunderstanding'],
      feedback: 'Good answer with minor issues.',
      explanation: 'Detailed explanation here.',
      hints: ['Hint 1', 'Hint 2'],
      encouragement: 'You are doing well!',
    };

    (mockLLMClient.complete as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: JSON.stringify(fullEvaluation),
      tokensUsed: 250,
    } as LLMResponse);

    const evaluator = new QuizEvaluator(mockLLMClient, mockPromptLoader);
    const question = createMockFreeTextQuestion();

    const result = await evaluator.evaluate(question, 'My detailed answer');

    expect(result.isCorrect).toBe(true);
    expect(result.score).toBe(85);
    expect(result.keyPointsCovered).toEqual(['Point A', 'Point B']);
    expect(result.keyPointsMissing).toEqual(['Point C']);
    expect(result.misconceptions).toEqual(['Minor misunderstanding']);
    expect(result.feedback).toBe('Good answer with minor issues.');
    expect(result.explanation).toBe('Detailed explanation here.');
    expect(result.hints).toEqual(['Hint 1', 'Hint 2']);
    expect(result.encouragement).toBe('You are doing well!');
  });
});
