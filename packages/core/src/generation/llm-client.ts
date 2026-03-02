// packages/core/src/generation/llm-client.ts

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import type { LLMConfig, Logger } from '../types';

const noopLogger: Logger = { info() {}, warn() {}, error() {} };

export interface LLMResponse {
  content: string;
  tokensUsed: number;
}

/**
 * Interface for LLM completion - used for dependency injection and testing
 */
export interface ILLMClient {
  complete(prompt: string, systemPrompt?: string): Promise<LLMResponse>;
}

export class LLMClient implements ILLMClient {
  private config: LLMConfig | null = null;
  private openai: OpenAI | null = null;
  private anthropic: Anthropic | null = null;
  private log: Logger;

  constructor(logger?: Logger) {
    this.log = logger ?? noopLogger;
  }

  setConfig(config: LLMConfig): void {
    this.log.info(`Config: provider=${config.provider} model=${config.model} baseUrl=${config.baseUrl ?? '(default)'}`);

    this.config = config;

    if (config.provider === 'anthropic') {
      this.anthropic = new Anthropic({ apiKey: config.apiKey });
      this.openai = null;
    } else if (config.provider === 'openai') {
      this.openai = new OpenAI({ apiKey: config.apiKey });
      this.anthropic = null;
    } else {
      // All other providers (ollama, gemini, openrouter, groq) use OpenAI-compatible API
      this.openai = new OpenAI({
        apiKey: config.provider === 'ollama' ? 'ollama' : config.apiKey,
        baseURL: config.baseUrl,
      });
      this.anthropic = null;
    }
  }

  async complete(prompt: string, systemPrompt?: string): Promise<LLMResponse> {
    if (!this.config) {
      throw new Error('LLM config not set');
    }

    this.log.info(`► Request [${this.config.provider}/${this.config.model}]`);
    if (systemPrompt) this.log.info(`  system: ${systemPrompt.slice(0, 200)}...`);
    this.log.info(`  prompt: ${prompt.slice(0, 300)}...`);

    try {
      const result = this.config.provider === 'anthropic'
        ? await this.completeAnthropic(prompt, systemPrompt)
        : await this.completeOpenAI(prompt, systemPrompt);

      this.log.info(`◄ Response (${result.tokensUsed} tokens, ${result.content.length} chars)`);
      this.log.info(`  ${result.content.slice(0, 300)}...`);
      return result;
    } catch (err: any) {
      this.log.error(`✖ Error: ${err.message ?? err}`);
      throw err;
    }
  }

  private async completeOpenAI(prompt: string, systemPrompt?: string): Promise<LLMResponse> {
    if (!this.openai || !this.config) throw new Error('OpenAI not configured');

    const messages: OpenAI.ChatCompletionMessageParam[] = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await this.openai.chat.completions.create({
      model: this.config.model,
      messages,
      max_tokens: this.config.maxTokens || 8192,
      temperature: this.config.temperature || 0.7,
    });

    return {
      content: response.choices[0]?.message?.content || '',
      tokensUsed: response.usage?.total_tokens || 0,
    };
  }

  private async completeAnthropic(prompt: string, systemPrompt?: string): Promise<LLMResponse> {
    if (!this.anthropic || !this.config) throw new Error('Anthropic not configured');

    const response = await this.anthropic.messages.create({
      model: this.config.model,
      max_tokens: this.config.maxTokens || 8192,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
    });

    const textContent = response.content.find(c => c.type === 'text');

    return {
      content: textContent?.text || '',
      tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
    };
  }

  async validateApiKey(): Promise<boolean> {
    try {
      await this.complete('Say "ok"');
      return true;
    } catch {
      return false;
    }
  }
}
