// packages/vscode-extension/src/core-adapter.ts

import { RepoTutorCore, LLMConfig, SecurityConfig, UserContext } from '@repo-tutor/core';

let coreInstance: RepoTutorCore | null = null;

export function getCoreAdapter(): RepoTutorCore {
  if (!coreInstance) {
    coreInstance = new RepoTutorCore();
  }
  return coreInstance;
}

export function configureLLM(config: LLMConfig): void {
  getCoreAdapter().setLLMConfig(config);
}

export function resetCore(): void {
  coreInstance = null;
}

// Default security config for MVP
export function getDefaultSecurityConfig(): SecurityConfig {
  return {
    preset: 'standard',
    neverSend: ['.env', '.env.*', '*.pem', '*.key', 'credentials.json'],
    skipAnalysis: ['node_modules', '.git', 'dist', 'build', '__pycache__'],
    confirmBeforeSend: false,
    maxCodeContextChars: 25000,
    strictMode: false,
  };
}

// Default user context
export function getDefaultUserContext(): UserContext {
  return {
    preferredLanguage: 'TypeScript',
    skillLevel: 'intermediate',
  };
}
