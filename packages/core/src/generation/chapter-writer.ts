// packages/core/src/generation/chapter-writer.ts

import type { EvidencePack, ChapterContent, UserContext } from '../types';
import type { ILLMClient } from './llm-client';
import type { IPromptLoader } from './prompt-loader';

export class ChapterWriter {
  constructor(
    private llmClient: ILLMClient,
    private promptLoader: IPromptLoader
  ) {}

  async generate(
    evidence: EvidencePack,
    chapterTitle: string,
    learningObjectives: string[],
    userContext: UserContext,
    completedChapters: string[] = []
  ): Promise<ChapterContent> {
    const prompt = this.promptLoader.load('chapter-writer', {
      chapterId: evidence.chapterId,
      chapterTitle,
      learningObjectives,
      skillLevel: userContext.skillLevel,
      userPreferredLanguage: userContext.preferredLanguage,
      evidencePack: evidence,
      completedChapters: completedChapters.join(', ') || 'None',
    });

    const response = await this.llmClient.complete(prompt);

    // Parse JSON from response (handle both fenced and raw JSON)
    const jsonMatch = response.content.match(/```json\n?([\s\S]*?)\n?```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : response.content;
    const parsed = JSON.parse(jsonStr);

    return {
      chapterId: evidence.chapterId,
      title: parsed.title || chapterTitle,
      sections: parsed.sections || [],
      keyTakeaways: parsed.keyTakeaways || [],
      bridgeToNext: parsed.bridgeToNext,
      patternsReferenced: parsed.patternsReferenced,
      generatedAt: new Date().toISOString(),
    };
  }
}
