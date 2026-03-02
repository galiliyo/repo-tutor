// packages/core/src/quiz/generator.ts

import Ajv from 'ajv';
import type { ChapterContent, Question } from '../types';
import type { ILLMClient } from '../generation/llm-client';
import type { IPromptLoader } from '../generation/prompt-loader';

const questionSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    chapterId: { type: 'string' },
    type: { enum: ['multiple-choice', 'true-false', 'free-text', 'code-completion'] },
    bloomLevel: { enum: ['remembering', 'understanding', 'applying', 'analyzing', 'evaluating'] },
    difficulty: { enum: ['easy', 'medium', 'hard'] },
    question: { type: 'string' },
    options: { type: 'array', items: { type: 'string' } },
    correctAnswer: { type: 'string' },
    keyPoints: { type: 'array', items: { type: 'string' } },
    explanation: { type: 'string' },
    relatedObjective: { type: 'string' },
    relatedCode: {
      type: 'object',
      properties: {
        file: { type: 'string' },
        lines: { type: 'array', items: { type: 'number' } },
      },
      required: ['file'],
    },
    rubric: {
      type: 'object',
      properties: {
        fullCredit: { type: 'string' },
        partialCredit: { type: 'string' },
        noCredit: { type: 'string' },
      },
      required: ['fullCredit', 'partialCredit', 'noCredit'],
    },
  },
  required: ['id', 'chapterId', 'type', 'bloomLevel', 'difficulty', 'question', 'correctAnswer'],
  additionalProperties: true,
};

const questionsArraySchema = {
  type: 'array',
  items: questionSchema,
};

export class QuizGenerator {
  private ajv = new Ajv();
  private validateQuestions: ReturnType<Ajv['compile']>;

  constructor(
    private llmClient: ILLMClient,
    private promptLoader: IPromptLoader
  ) {
    this.validateQuestions = this.ajv.compile(questionsArraySchema);
  }

  async generate(chapter: ChapterContent): Promise<Question[]> {
    const prompt = this.promptLoader.load('quiz-generator', {
      chapterId: chapter.chapterId,
      chapterTitle: chapter.title,
      sections: chapter.sections,
      keyTakeaways: chapter.keyTakeaways,
    });

    const response = await this.llmClient.complete(prompt);
    const parsed = this.parseJSON(response.content);

    // Handle both {questions: [...]} and direct array format
    const questions = Array.isArray(parsed)
      ? parsed
      : ((parsed as Record<string, unknown>).questions as unknown[] || []);

    // Validate questions against schema
    if (!this.validateQuestions(questions)) {
      console.warn('Some questions failed validation:', this.validateQuestions.errors);
    }

    return questions as Question[];
  }

  private parseJSON(content: string): unknown {
    let jsonStr = content.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```\s*$/, '');
    }
    return JSON.parse(jsonStr);
  }
}
