// packages/core/src/types/config.ts

import type { ChapterContent } from './chapter';
import type { AnalysisResult } from './analysis';

export type SecurityPreset = 'standard' | 'cautious' | 'strict' | 'custom';
export type LLMProvider = 'openai' | 'anthropic' | 'ollama' | 'gemini' | 'openrouter' | 'groq';
export type SkillLevel = 'beginner' | 'intermediate' | 'advanced';

export interface SecurityConfig {
  preset: SecurityPreset;
  neverSend: string[];
  skipAnalysis: string[];
  confirmBeforeSend: boolean;
  maxCodeContextChars: number;
  strictMode: boolean;
}

export interface UserContext {
  preferredLanguage: string;
  skillLevel: SkillLevel;
}

export interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  model: string;
  baseUrl?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface QuestionContext {
  currentChapter: ChapterContent;
  currentSection?: string;
  previousChapters: string[];
  analysisResult: AnalysisResult;
}
