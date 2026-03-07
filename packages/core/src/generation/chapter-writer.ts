// packages/core/src/generation/chapter-writer.ts

import type { EvidencePack, ChapterContent, ChapterOutline, UserContext, Logger } from '../types';
import type { ILLMClient } from './llm-client';
import type { IPromptLoader } from './prompt-loader';

export class ChapterWriter {
  constructor(
    private llmClient: ILLMClient,
    private promptLoader: IPromptLoader,
    private log?: Logger,
  ) {}

  async generate(
    evidence: EvidencePack,
    chapterTitle: string,
    learningObjectives: string[],
    userContext: UserContext,
    completedChapters: string[] = []
  ): Promise<ChapterContent> {
    const prompt = this.promptLoader.load('chapter-writer-v2', {
      chapterId: evidence.chapterId,
      chapterTitle,
      learningObjectives,
      skillLevel: userContext.skillLevel,
      userPreferredLanguage: userContext.preferredLanguage,
      evidencePack: evidence,
      interfaceArtifact: evidence.interfaceArtifact,
      completedChapters: completedChapters.join(', ') || 'None',
    });

    this.log?.info(`[chapter] "${chapterTitle}" evidence=${evidence.files.length} files`);
    const response = await this.llmClient.complete(prompt, undefined, 'chapter');

    // Strip outer ```json fence if present — use greedy match to handle nested fences
    let jsonStr = response.content.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```\s*$/, '');
    }

    let parsed: any;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (err: any) {
      const preview = jsonStr.slice(0, 500);
      const tail = jsonStr.slice(-200);
      throw new Error(
        `Failed to parse chapter JSON: ${err.message}\n` +
        `Response length: ${jsonStr.length} chars | Tokens used: ${response.tokensUsed}\n` +
        `Start: ${preview}...\nEnd: ...${tail}`
      );
    }

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

  async generateOutline(
    evidence: EvidencePack,
    chapterTitle: string,
    learningObjectives: string[],
    userContext: UserContext,
  ): Promise<ChapterOutline> {
    const prompt = this.promptLoader.load('chapter-outline', {
      chapterId: evidence.chapterId,
      chapterTitle,
      learningObjectives,
      skillLevel: userContext.skillLevel,
      userPreferredLanguage: userContext.preferredLanguage,
      evidencePack: evidence,
    });

    this.log?.info(`[chapter] outline "${chapterTitle}"`);
    const response = await this.llmClient.complete(prompt, undefined, 'chapter');

    let jsonStr = response.content.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```\s*$/, '');
    }

    let parsed: any;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (err: any) {
      throw new Error(
        `Failed to parse LLM JSON (chapter-outline): ${err.message}\nResponse: ${jsonStr.slice(0, 300)}...`
      );
    }

    return {
      chapterId: evidence.chapterId,
      title: parsed.title || chapterTitle,
      sections: parsed.sections || [],
      keyTakeaways: parsed.keyTakeaways || [],
    };
  }
}
