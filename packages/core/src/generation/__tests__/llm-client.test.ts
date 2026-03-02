import { describe, it, expect, vi } from 'vitest';
import { LLMClient } from '../llm-client';

describe('LLMClient', () => {
  describe('setConfig', () => {
    it('should configure OpenAI-compatible providers with custom baseURL', () => {
      const client = new LLMClient();

      client.setConfig({
        provider: 'groq',
        apiKey: 'test-key',
        model: 'llama-3.3-70b-versatile',
        baseUrl: 'https://api.groq.com/openai/v1',
      });

      expect(() =>
        client.setConfig({
          provider: 'gemini',
          apiKey: 'test-key',
          model: 'gemini-2.0-flash',
          baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        })
      ).not.toThrow();

      expect(() =>
        client.setConfig({
          provider: 'openrouter',
          apiKey: 'test-key',
          model: 'anthropic/claude-sonnet-4-5-20250929',
          baseUrl: 'https://openrouter.ai/api/v1',
        })
      ).not.toThrow();
    });
  });
});
