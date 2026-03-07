// packages/core/src/quiz/evaluator.ts

import type { Question, Evaluation, Logger } from '../types';
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
    private promptLoader: IPromptLoader,
    private log?: Logger,
  ) {}

  async evaluate(question: Question, userAnswer: string): Promise<Evaluation> {
    this.log?.info(`[evaluator] q=${question.id} type=${question.type}`);
    const prompt = this.promptLoader.load('evaluator', {
      question: question.question,
      questionType: question.type,
      correctAnswer: question.correctAnswer,
      keyPoints: question.keyPoints || [],
      userAnswer,
      options: question.options,
    });

    const response = await this.llmClient.complete(prompt, undefined, 'evaluator');
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

  async *streamExplanation(
    question: Question,
    userAnswer: string,
    evaluation: Evaluation
  ): AsyncIterable<string> {
    if (!this.llmClient.stream) return;

    this.log?.info(`[evaluator] streaming explanation for q=${question.id}`);
    const prompt = [
      `The student answered a quiz question. Provide a detailed pedagogical walkthrough.`,
      ``,
      `Question: ${question.question}`,
      `Student's answer: ${userAnswer}`,
      `Correct answer: ${question.correctAnswer}`,
      `Result: ${evaluation.isCorrect ? 'Correct' : 'Incorrect'} (score: ${evaluation.score}/100)`,
      evaluation.feedback ? `Feedback: ${evaluation.feedback}` : '',
      ``,
      `In 2-3 sentences, explain why the answer is ${evaluation.isCorrect ? 'correct' : 'incorrect'}.`,
      `Reference the relevant code. Be brief — no preamble, no filler.`,
    ].filter(Boolean).join('\n');

    yield* this.llmClient.stream(prompt, undefined, 'evaluator');
  }

  private parseJSON(content: string): LLMEvaluationResponse {
    let jsonStr = content.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```\s*$/, '');
    }
    try {
      return JSON.parse(jsonStr) as LLMEvaluationResponse;
    } catch (err: any) {
      throw new Error(
        `Failed to parse LLM JSON (evaluator): ${err.message}\nResponse: ${jsonStr.slice(0, 300)}...`
      );
    }
  }
}
