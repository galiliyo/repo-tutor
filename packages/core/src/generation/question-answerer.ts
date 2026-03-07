// packages/core/src/generation/question-answerer.ts

import type { ILLMClient } from './llm-client';
import type { IPromptLoader } from './prompt-loader';
import type { Answer } from '../types/quiz';
import type { QuestionContext, Logger } from '../types/config';
import { detectLanguage } from './evidence-builder';

/**
 * LLM response shape before mapping to our Answer type.
 * Mirrors the JSON schema in spec/prompts/question-answerer.md.
 */
interface LLMAnswerResponse {
  answer: string;
  codeReferences?: Array<{
    file: string;
    startLine?: number;
    endLine?: number;
  }>;
  relatedChapter?: string | null;
  followUpSuggestion?: string | null;
}

export class QuestionAnswerer {
  constructor(
    private llmClient: ILLMClient,
    private promptLoader: IPromptLoader,
    private log?: Logger,
  ) {}

  async answer(question: string, context: QuestionContext): Promise<Answer> {
    this.log?.info(`[qa] "${question.slice(0, 60)}"`);
    const vars = this.buildTemplateVars(question, context);
    const prompt = this.promptLoader.load('question-answerer', vars);
    const response = await this.llmClient.complete(prompt, undefined, 'qa');
    const parsed = this.parseJSON(response.content);

    return {
      answer: parsed.answer ?? '',
      codeReferences: parsed.codeReferences ?? [],
      relatedChapter: parsed.relatedChapter ?? undefined,
      followUpSuggestion: parsed.followUpSuggestion ?? undefined,
    };
  }

  /**
   * Extracts prompt template variables from the domain types.
   * Maps ChapterContent + AnalysisResult → flat Handlebars variables.
   */
  private buildTemplateVars(
    question: string,
    context: QuestionContext
  ): Record<string, unknown> {
    const { currentChapter, currentSection, analysisResult } = context;

    // Gather code references from chapter sections as "relevant code"
    const relevantCode = currentChapter.sections
      .filter((s) => s.codeReferences && s.codeReferences.length > 0)
      .flatMap((s) =>
        (s.codeReferences ?? []).map((ref) => ({
          file: ref.file,
          language: detectLanguage(ref.file),
          content: `Lines ${ref.startLine ?? '?'}–${ref.endLine ?? '?'}`,
        }))
      );

    // Derive architecture pattern from detected patterns
    const architecturePattern =
      analysisResult.patterns.map((p) => p.pattern).join(', ') ||
      'Not detected';

    // Related modules from analysis
    const relatedModules =
      analysisResult.modules.map((m) => m.name).join(', ') || 'None identified';

    return {
      userQuestion: question,
      chapterTitle: currentChapter.title,
      sectionHeading: currentSection ?? currentChapter.sections[0]?.heading ?? '',
      userPreferredLanguage: analysisResult.languages[0] ?? 'unknown',
      skillLevel: 'intermediate',
      relevantCode,
      architecturePattern,
      relatedModules,
    };
  }

  private parseJSON(content: string): LLMAnswerResponse {
    let jsonStr = content.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```\s*$/, '');
    }
    try {
      return JSON.parse(jsonStr) as LLMAnswerResponse;
    } catch (err: any) {
      throw new Error(
        `Failed to parse LLM JSON (question-answerer): ${err.message}\nResponse: ${jsonStr.slice(0, 300)}...`
      );
    }
  }
}
