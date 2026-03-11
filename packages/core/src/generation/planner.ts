// packages/core/src/generation/planner.ts

import type { AnalysisResult, Chapter, UserContext, Logger } from '../types';
import type { Track } from '../types/track';
import type { ILLMClient } from './llm-client';
import type { IPromptLoader } from './prompt-loader';
import { classifyFileTrack } from '../analysis/track-detector';

const TRACK_PATTERN_KEYWORDS: Record<string, string[]> = {
  frontend: ['react', 'component', 'css', 'style', 'dom', 'ui', 'vue', 'svelte', 'state management', 'redux', 'store'],
  backend: ['express', 'middleware', 'route', 'controller', 'database', 'auth', 'api', 'rest', 'graphql', 'orm', 'migration'],
  infra: ['docker', 'ci', 'deploy', 'kubernetes', 'terraform', 'pipeline'],
};

export class Planner {
  constructor(
    private llmClient: ILLMClient,
    private promptLoader: IPromptLoader,
    private log?: Logger,
  ) {}

  async plan(
    analysis: AnalysisResult,
    userContext: UserContext,
    track?: Track,
  ): Promise<Chapter[]> {
    // Filter analysis data by track to avoid sending irrelevant modules to the LLM
    let { modules, entryPoints, http, stateManagement, patterns } = analysis;
    if (track && track.id !== 'architecture') {
      const trackId = track.id;
      const matchesTrack = (p: string) => {
        const cls = classifyFileTrack(p, analysis.fileTrackMap);
        return cls === trackId || cls === 'shared';
      };
      modules = modules.filter(m => matchesTrack(m.path));
      entryPoints = entryPoints.filter(ep => matchesTrack(ep.path));

      if (trackId === 'backend') {
        stateManagement = undefined;
      } else if (trackId === 'frontend') {
        http = undefined;
      }

      // Filter patterns — remove patterns clearly belonging to other tracks
      const otherTrackKeywords = Object.entries(TRACK_PATTERN_KEYWORDS)
        .filter(([id]) => id !== trackId)
        .flatMap(([, kws]) => kws);
      patterns = patterns.filter(p =>
        !otherTrackKeywords.some(kw => p.pattern.toLowerCase().includes(kw))
      );
    }

    // Render planner prompt with analysis data
    const prompt = this.promptLoader.load('planner', {
      userPreferredLanguage: userContext.preferredLanguage,
      skillLevel: userContext.skillLevel,
      languages: analysis.languages,
      entryPoints,
      patterns,
      http: http || { framework: 'none' },
      stateManagement: stateManagement || { type: 'none' },
      modules,
      dependencyLayers: this.formatLayers(analysis.dependencyGraph.layers),
      trackId: track?.id,
      trackLabel: track?.label,
      trackDescription: track?.description,
      trackFocusTypes: track?.focusTypes.join(', '),
    });

    // Call LLM
    this.log?.info(`[planner] track=${track?.id ?? 'all'} modules=${modules.length} entryPoints=${entryPoints.length}`);
    const response = await this.llmClient.complete(prompt, undefined, 'planner');

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
