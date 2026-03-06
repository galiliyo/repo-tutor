// packages/core/src/generation/llm-client.ts

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import type { LLMConfig, Logger } from '../types';

const noopLogger: Logger = { info() {}, warn() {}, error() {}, debug() {} };

export interface LLMResponse {
  content: string;
  tokensUsed: number;
}

/**
 * Interface for LLM completion - used for dependency injection and testing
 */
export interface ILLMClient {
  complete(prompt: string, systemPrompt?: string, tag?: string): Promise<LLMResponse>;
  stream?(prompt: string, systemPrompt?: string, tag?: string): AsyncIterable<string>;
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

  async complete(prompt: string, systemPrompt?: string, tag?: string): Promise<LLMResponse> {
    if (!this.config) {
      throw new Error('LLM config not set');
    }

    const label = tag ? `${tag} ` : '';
    this.log.info(`► ${label}[${this.config.provider}/${this.config.model}]`);
    this.log.debug(`  system: ${systemPrompt?.slice(0, 500) ?? '(none)'}`);
    this.log.debug(`  prompt: ${prompt.slice(0, 500)}`);

    const start = Date.now();
    try {
      const result = this.config.provider === 'anthropic'
        ? await this.completeAnthropic(prompt, systemPrompt)
        : await this.completeOpenAI(prompt, systemPrompt);

      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      this.log.info(`◄ ${label}${result.tokensUsed} tokens ${elapsed}s`);
      this.log.debug(`  response: ${result.content.slice(0, 500)}`);
      return result;
    } catch (err: any) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      this.log.error(`✖ ${label}Error after ${elapsed}s: ${err.message ?? err}`);
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

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    this.log.debug(`  anthropic tokens: (${inputTokens}in + ${outputTokens}out)`);

    return {
      content: textContent?.text || '',
      tokensUsed: inputTokens + outputTokens,
    };
  }

  async *stream(prompt: string, systemPrompt?: string, tag?: string): AsyncIterable<string> {
    if (!this.config) {
      throw new Error('LLM config not set');
    }

    const label = tag ? `${tag} ` : '';
    this.log.info(`► ${label}stream [${this.config.provider}/${this.config.model}]`);
    this.log.debug(`  prompt: ${prompt.slice(0, 500)}`);

    const start = Date.now();
    let chars = 0;
    try {
      const iterable = this.config.provider === 'anthropic'
        ? this.streamAnthropic(prompt, systemPrompt)
        : this.streamOpenAI(prompt, systemPrompt);

      for await (const chunk of iterable) {
        chars += chunk.length;
        yield chunk;
      }

      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      this.log.info(`◄ ${label}stream done ${chars} chars ${elapsed}s`);
    } catch (err: any) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      this.log.error(`✖ ${label}Stream error after ${elapsed}s: ${err.message ?? err}`);
      throw err;
    }
  }

  private async *streamOpenAI(prompt: string, systemPrompt?: string): AsyncIterable<string> {
    if (!this.openai || !this.config) throw new Error('OpenAI not configured');

    const messages: OpenAI.ChatCompletionMessageParam[] = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const stream = await this.openai.chat.completions.create({
      model: this.config.model,
      messages,
      max_tokens: this.config.maxTokens || 8192,
      temperature: this.config.temperature || 0.7,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
    }
  }

  private async *streamAnthropic(prompt: string, systemPrompt?: string): AsyncIterable<string> {
    if (!this.anthropic || !this.config) throw new Error('Anthropic not configured');

    const stream = this.anthropic.messages.stream({
      model: this.config.model,
      max_tokens: this.config.maxTokens || 8192,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield event.delta.text;
      }
    }
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
