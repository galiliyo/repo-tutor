// packages/core/src/quiz/generator.ts

import Ajv from 'ajv';
import type { ChapterContent, Question, Logger } from '../types';
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

const moduleAjv = new Ajv();
const compiledValidateQuestions = moduleAjv.compile(questionsArraySchema);
const compiledValidateSingleQuestion = moduleAjv.compile(questionSchema);

export class QuizGenerator {
  private ajv = moduleAjv;
  private validateQuestions = compiledValidateQuestions;

  constructor(
    private llmClient: ILLMClient,
    private promptLoader: IPromptLoader,
    private log?: Logger,
  ) {}

  async generate(chapter: ChapterContent, existingQuestions?: Question[]): Promise<Question[]> {
    // Build summary from actual section content
    const chapterSummary = chapter.sections
      .map(s => `## ${s.heading}\n${s.content}`)
      .join('\n\n');

    // Extract code refs from all sections
    const keyCodeRefs = chapter.sections
      .flatMap(s => (s.codeReferences || []).map(ref => ({
        file: ref.file,
        line: ref.startLine || '',
        description: ref.file + (ref.startLine ? ':' + ref.startLine : ''),
      })));

    // Use section headings as learning objectives if not explicitly set
    const learningObjectives = chapter.keyTakeaways && chapter.keyTakeaways.length > 0
      ? chapter.keyTakeaways
      : chapter.sections.map(s => s.heading);

    const prompt = this.promptLoader.load('quiz-generator', {
      chapterId: chapter.chapterId,
      chapterTitle: chapter.title,
      chapterSummary,
      learningObjectives,
      keyCodeRefs,
      patternsReferenced: chapter.patternsReferenced || [],
      existingQuestions: existingQuestions?.map(q => q.question) || [],
    });

    this.log?.info(`[quiz] generating for "${chapter.title}"`);
    const response = await this.llmClient.complete(prompt, undefined, 'quiz');
    const parsed = this.parseJSON(response.content);

    // Handle both {questions: [...]} and direct array format
    const questions = Array.isArray(parsed)
      ? parsed
      : ((parsed as Record<string, unknown>).questions as unknown[] || []);

    // Validate questions against schema — avoid Ajv type guard narrowing to `never`
    const isValid = this.validateQuestions(questions) as boolean;
    if (!isValid) {
      this.log?.warn?.(`Quiz validation issues: ${JSON.stringify(this.validateQuestions.errors)}`);
      // Filter to only valid questions instead of returning all
      const valid = (questions as unknown[]).filter((q: unknown) => compiledValidateSingleQuestion(q));
      if (valid.length === 0) {
        throw new Error('LLM returned no valid quiz questions');
      }
      return valid as unknown as Question[];
    }

    return questions as Question[];
  }

  private parseJSON(content: string): unknown {
    let jsonStr = content.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```\s*$/, '');
    }
    try {
      return JSON.parse(jsonStr);
    } catch (err: any) {
      throw new Error(
        `Failed to parse LLM JSON (quiz-generator): ${err.message}\nResponse: ${jsonStr.slice(0, 300)}...`
      );
    }
  }
}
