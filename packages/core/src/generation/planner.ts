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
    let { dependencyGraph } = analysis;
    if (track && track.id !== 'architecture') {
      const trackId = track.id;
      const matchesTrack = (p: string) => {
        const cls = classifyFileTrack(p, analysis.fileTrackMap);
        return cls === trackId || cls === 'shared';
      };
      modules = modules
        .map(m => {
          // Filter module's file list to only track-relevant files
          const filteredFiles = (m.files || []).filter(f => {
            const cls = classifyFileTrack(f, analysis.fileTrackMap);
            return cls === trackId || cls === 'shared';
          });
          if (filteredFiles.length === 0) return null;
          return { ...m, files: filteredFiles, fileCount: filteredFiles.length };
        })
        .filter((m): m is NonNullable<typeof m> => m !== null);
      entryPoints = entryPoints.filter(ep => matchesTrack(ep.path));

      // Filter dependency graph nodes/edges/layers by track
      const allowedNodes = new Set(
        dependencyGraph.nodes.filter(n => matchesTrack(n.path)).map(n => n.path),
      );
      dependencyGraph = {
        nodes: dependencyGraph.nodes.filter(n => allowedNodes.has(n.path)),
        edges: dependencyGraph.edges.filter(e => allowedNodes.has(e.from) && allowedNodes.has(e.to)),
        layers: dependencyGraph.layers?.map(layer => layer.filter(f => allowedNodes.has(f))).filter(layer => layer.length > 0),
      };

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
      dependencyLayers: this.formatLayers(dependencyGraph.layers),
      trackId: track?.id,
      trackLabel: track?.label,
      trackDescription: track?.description,
      trackFocusTypes: track?.focusTypes.join(', '),
    });

    // Call LLM
    this.log?.info(`[planner] track=${track?.id ?? 'all'} modules=${modules.length} entryPoints=${entryPoints.length}`);
    this.log?.info(`[planner]   modules: ${JSON.stringify(modules.map(m => m.name))}`);
    this.log?.info(`[planner]   entryPoints: ${JSON.stringify(entryPoints.map(e => e.path))}`);
    this.log?.info(`[planner]   depGraph nodes: ${dependencyGraph.nodes.length} edges: ${dependencyGraph.edges.length}`);
    this.log?.info(`[planner]   layers: ${this.formatLayers(dependencyGraph.layers) || '(none)'}`);
    this.log?.info(`[planner]   fileTrackMap size: ${analysis.fileTrackMap ? Object.keys(analysis.fileTrackMap).length : 0}`);
    const response = await this.llmClient.complete(prompt, undefined, 'planner');

    let jsonStr = response.content.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```\s*$/, '');
    }
    const parsed = JSON.parse(jsonStr);
    const chapters = parsed.chapters as Chapter[];

    this.log?.info(`[planner] LLM returned ${chapters.length} chapters for track=${track?.id ?? 'all'}`);
    for (const ch of chapters) {
      this.log?.info(`[planner]   "${ch.title}" targetFiles=${JSON.stringify(ch.targetFiles)}`);
    }

    // Post-filter: strip targetFiles that belong to a different track
    if (track && track.id !== 'architecture' && analysis.fileTrackMap) {
      for (const ch of chapters) {
        const before = ch.targetFiles.length;
        ch.targetFiles = ch.targetFiles.filter(f => {
          const cls = classifyFileTrack(f, analysis.fileTrackMap);
          return cls === track.id || cls === 'shared';
        });
        if (ch.targetFiles.length < before) {
          this.log?.info(`[planner]   post-filter "${ch.title}": ${before} → ${ch.targetFiles.length} files`);
        }
      }
    }

    return chapters;
  }

  private formatLayers(layers?: string[][]): string {
    if (!layers || layers.length === 0) return '';
    return layers.map((layer, i) => `Layer ${i + 1}: ${layer.join(', ')}`).join('\n');
  }
}
