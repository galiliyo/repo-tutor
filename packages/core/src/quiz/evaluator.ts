// packages/core/src/quiz/evaluator.ts

import type { Question, Evaluation } from '../types';
import type { ILLMClient } from '../generation/llm-client';
import type { IPromptLoader } from '../generation/prompt-loader';

interface LLMEvaluationResponse {
  isCorrect?: boolean;
  score?: number;
  keyPointsCovered?: string[];
  keyPointsMissing?: string[];
  misconceptions?: string[];
  feedback?: string;
  explanation?: string;
  hints?: string[];
  encouragement?: string;
}

export class QuizEvaluator {
  constructor(
    private llmClient: ILLMClient,
    private promptLoader: IPromptLoader
  ) {}

  async evaluate(question: Question, userAnswer: string): Promise<Evaluation> {
    const prompt = this.promptLoader.load('evaluator', {
      question: question.question,
      questionType: question.type,
      correctAnswer: question.correctAnswer,
      keyPoints: question.keyPoints || [],
      userAnswer,
      options: question.options,
    });

    const response = await this.llmClient.complete(prompt);
    const parsed = this.parseJSON(response.content);

    return {
      questionId: question.id,
      userAnswer,
      isCorrect: parsed.isCorrect ?? false,
      score: parsed.score ?? 0,
      keyPointsCovered: parsed.keyPointsCovered,
      keyPointsMissing: parsed.keyPointsMissing,
      misconceptions: parsed.misconceptions,
      feedback: parsed.feedback ?? '',
      explanation: parsed.explanation,
      hints: parsed.hints,
      encouragement: parsed.encouragement,
    };
  }

  private parseJSON(content: string): LLMEvaluationResponse {
    let jsonStr = content.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```\s*$/, '');
    }
    return JSON.parse(jsonStr) as LLMEvaluationResponse;
  }
}
