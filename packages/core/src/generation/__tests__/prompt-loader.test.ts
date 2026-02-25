// packages/core/src/generation/__tests__/prompt-loader.test.ts

import { describe, it, expect } from 'vitest';
import { PromptLoader } from '../prompt-loader';
import * as path from 'path';

describe('PromptLoader', () => {
  const specsDir = path.resolve(__dirname, '../../../../../spec/prompts');

  it('should load and compile a prompt template', () => {
    const loader = new PromptLoader(specsDir);

    const prompt = loader.load('planner', {
      userPreferredLanguage: 'Python',
      skillLevel: 'intermediate',
      languages: ['javascript', 'typescript'],
      entryPoints: [{ path: 'src/index.ts', reason: 'main' }],
      patterns: [],
      http: { framework: 'express' },
      stateManagement: { type: 'none' },
      modules: [{ name: 'src', description: 'Source code', fileCount: 10, importCount: 5 }],
      dependencyLayers: 'Layer 1: index.ts\nLayer 2: utils.ts',
    });

    expect(prompt).toContain('Python');
    expect(prompt).toContain('intermediate');
    expect(prompt).toContain('express');
  });

  it('should cache templates for repeated loads', () => {
    const loader = new PromptLoader(specsDir);

    const prompt1 = loader.load('planner', { userPreferredLanguage: 'TypeScript', skillLevel: 'beginner', languages: [], entryPoints: [], patterns: [], http: {}, stateManagement: {}, modules: [], dependencyLayers: '' });
    const prompt2 = loader.load('planner', { userPreferredLanguage: 'Python', skillLevel: 'advanced', languages: [], entryPoints: [], patterns: [], http: {}, stateManagement: {}, modules: [], dependencyLayers: '' });

    expect(prompt1).toContain('TypeScript');
    expect(prompt2).toContain('Python');
  });

  it('should clear cache when requested', () => {
    const loader = new PromptLoader(specsDir);

    loader.load('planner', { userPreferredLanguage: 'Go', skillLevel: 'intermediate', languages: [], entryPoints: [], patterns: [], http: {}, stateManagement: {}, modules: [], dependencyLayers: '' });
    loader.clearCache();

    // After clearing, should still work (reloads from disk)
    const prompt = loader.load('planner', { userPreferredLanguage: 'Rust', skillLevel: 'advanced', languages: [], entryPoints: [], patterns: [], http: {}, stateManagement: {}, modules: [], dependencyLayers: '' });
    expect(prompt).toContain('Rust');
  });

  it('should handle json helper for complex objects', () => {
    const loader = new PromptLoader(specsDir);

    const prompt = loader.load('planner', {
      userPreferredLanguage: 'JavaScript',
      skillLevel: 'intermediate',
      languages: ['typescript', 'javascript'],
      entryPoints: [{ path: 'main.ts', reason: 'entry' }],
      patterns: [{ pattern: 'MVC', confidence: 'high' }],
      http: { framework: 'fastify' },
      stateManagement: { type: 'redux' },
      modules: [{ name: 'api', description: 'API layer', fileCount: 5, importCount: 3 }],
      dependencyLayers: 'main -> utils -> helpers',
    });

    expect(prompt).toContain('fastify');
    expect(prompt).toContain('redux');
    expect(prompt).toContain('MVC');
  });

  it('should throw error for non-existent template', () => {
    const loader = new PromptLoader(specsDir);

    expect(() => loader.load('non-existent-template', {})).toThrow();
  });
});
