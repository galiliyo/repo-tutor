// packages/core/src/generation/planner.ts

import type { AnalysisResult, Chapter, UserContext } from '../types';
import type { ILLMClient } from './llm-client';
import type { IPromptLoader } from './prompt-loader';

export class Planner {
  constructor(
    private llmClient: ILLMClient,
    private promptLoader: IPromptLoader
  ) {}

  async plan(analysis: AnalysisResult, userContext: UserContext): Promise<Chapter[]> {
    // Render planner prompt with analysis data
    const prompt = this.promptLoader.load('planner', {
      userPreferredLanguage: userContext.preferredLanguage,
      skillLevel: userContext.skillLevel,
      languages: analysis.languages,
      entryPoints: analysis.entryPoints,
      patterns: analysis.patterns,
      http: analysis.http || { framework: 'none' },
      stateManagement: analysis.stateManagement || { type: 'none' },
      modules: analysis.modules,
      dependencyLayers: this.formatLayers(analysis.dependencyGraph.layers),
    });

    // Call LLM
    const response = await this.llmClient.complete(prompt);

    let jsonStr = response.content.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```\s*$/, '');
    }
    const parsed = JSON.parse(jsonStr);

    return parsed.chapters as Chapter[];
  }

  private formatLayers(layers?: string[][]): string {
    if (!layers || layers.length === 0) return '';
    return layers.map((layer, i) => `Layer ${i + 1}: ${layer.join(', ')}`).join('\n');
  }
}
