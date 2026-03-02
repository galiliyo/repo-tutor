import type { LLMProvider } from '@repo-tutor/core';

export interface ProviderDefinition {
  id: LLMProvider;
  label: string;
  requiresApiKey: boolean;
  defaultModel: string;
  models: string[];
  apiCompatibility: 'openai' | 'anthropic';
  baseUrl?: string;
  baseUrlConfigurable: boolean;
}

export const PROVIDER_REGISTRY: ProviderDefinition[] = [
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    requiresApiKey: true,
    defaultModel: 'claude-sonnet-4-5-20250929',
    models: ['claude-sonnet-4-5-20250929', 'claude-haiku-4-5-20251001', 'claude-3-5-haiku-20241022'],
    apiCompatibility: 'anthropic',
    baseUrlConfigurable: false,
  },
  {
    id: 'openai',
    label: 'OpenAI',
    requiresApiKey: true,
    defaultModel: 'gpt-4o',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
    apiCompatibility: 'openai',
    baseUrlConfigurable: false,
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    requiresApiKey: true,
    defaultModel: 'gemini-2.0-flash',
    models: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-pro'],
    apiCompatibility: 'openai',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    baseUrlConfigurable: false,
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    requiresApiKey: true,
    defaultModel: 'anthropic/claude-sonnet-4-5-20250929',
    models: [
      'anthropic/claude-sonnet-4-5-20250929',
      'google/gemini-2.0-flash-001',
      'deepseek/deepseek-chat-v3-0324',
      'meta-llama/llama-3.3-70b-instruct',
    ],
    apiCompatibility: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    baseUrlConfigurable: false,
  },
  {
    id: 'groq',
    label: 'Groq',
    requiresApiKey: true,
    defaultModel: 'llama-3.3-70b-versatile',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
    apiCompatibility: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    baseUrlConfigurable: false,
  },
  {
    id: 'ollama',
    label: 'Ollama (Local)',
    requiresApiKey: false,
    defaultModel: 'llama3',
    models: [], // auto-detected at runtime
    apiCompatibility: 'openai',
    baseUrl: 'http://localhost:11434/v1',
    baseUrlConfigurable: true,
  },
];

/** Curated models for OpenRouter dropdown — cross-referenced at runtime with live API. */
export const RECOMMENDED_OPENROUTER_FREE: string[] = [
  'nvidia/nemotron-3-nano-30b-a3b:free',
  'arcee-ai/trinity-large-preview:free',
  'upstage/solar-pro-3:free',
  'stepfun/step-3.5-flash:free',
  'liquid/lfm-2.5-1.2b-instruct:free',
];

export const RECOMMENDED_OPENROUTER_PAID: string[] = [
  'anthropic/claude-sonnet-4.6',
  'openai/gpt-5.2-codex',
  'google/gemini-3-flash-preview',
  'deepseek/deepseek-v3.2',
  'qwen/qwen3-coder-next',
  'mistralai/devstral-2512',
  'anthropic/claude-opus-4.6',
  'qwen/qwen3.5-flash-02-23',
];

export function getProvider(id: LLMProvider): ProviderDefinition | undefined {
  return PROVIDER_REGISTRY.find((p) => p.id === id);
}

export function getSecretKey(providerId: LLMProvider): string {
  return `repo-tutor.${providerId}.apiKey`;
}
