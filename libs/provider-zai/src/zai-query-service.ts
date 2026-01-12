/**
 * ZaiQueryService
 *
 * QueryService implementation for Z.AI GLM models.
 * Uses the OpenAI SDK with Z.AI's native API endpoint.
 */

import OpenAI from 'openai';
import type { QueryService, QueryOptions, QueryResult } from '@automaker/providers-core';

// Z.AI API configuration
const ZAI_API_URL = 'https://api.z.ai/api/coding/paas/v4';

// Available Z.AI models
export const ZAI_MODELS = {
  'glm-4-plus': 'Latest flagship - best reasoning & coding',
  'glm-4.7': 'Reasoning model (chain-of-thought)',
  'glm-4.6': 'Previous flagship - 200K context',
  'glm-4.6v': 'Multimodal model with vision',
  'glm-4.5': 'Stable model - good all-around',
  'glm-4.5-air': 'Lightweight fast model',
  'glm-4.5-flash': 'Flash model - quick responses',
} as const;

export type ZaiModel = keyof typeof ZAI_MODELS;

export class ZaiQueryService implements QueryService {
  private client: OpenAI;
  private defaultModel: ZaiModel;

  constructor(apiKey?: string, model?: ZaiModel) {
    const key = apiKey || process.env.ZAI_API_KEY;

    if (!key) {
      throw new Error(
        'Z.AI API key not provided. Set ZAI_API_KEY environment variable ' +
          'or pass apiKey to constructor.'
      );
    }

    this.client = new OpenAI({
      apiKey: key,
      baseURL: ZAI_API_URL,
    });

    // Default to 4.7 since 4-plus might be restricted
    this.defaultModel = model || 'glm-4.7';
  }

  getName(): string {
    return 'zai';
  }
  // ...

  /**
   * Simple one-shot query returning text
   */
  async simpleQuery(prompt: string, options?: QueryOptions): Promise<string> {
    try {
      const messages: OpenAI.ChatCompletionMessageParam[] = [];

      // Add system prompt if provided
      if (options?.systemPrompt) {
        messages.push({
          role: 'system',
          content: options.systemPrompt,
        });
      }

      // Add user prompt
      messages.push({
        role: 'user',
        content: prompt,
      });

      const response = await this.client.chat.completions.create({
        model: this.resolveModel(options?.model),
        messages,
        max_tokens: options?.maxTokens || 8192,
        temperature: options?.temperature,
      });

      const content = response.choices[0]?.message?.content;
      return content || '';
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Z.AI query failed: ${message}`);
    }
  }

  /**
   * Streaming query
   */
  async *streamQuery(prompt: string, options?: QueryOptions): AsyncGenerator<string> {
    try {
      const messages: OpenAI.ChatCompletionMessageParam[] = [];

      if (options?.systemPrompt) {
        messages.push({
          role: 'system',
          content: options.systemPrompt,
        });
      }

      messages.push({
        role: 'user',
        content: prompt,
      });

      const stream = await this.client.chat.completions.create({
        model: this.resolveModel(options?.model),
        messages,
        max_tokens: options?.maxTokens || 8192,
        temperature: options?.temperature,
        stream: true,
      });

      let buffer = '';
      let lastYieldTime = Date.now();
      const BUFFER_SIZE = 20; // Accumulate ~20 chars
      const BUFFER_TIME = 50; // Or every 50ms (20fps)

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          buffer += content;
          const now = Date.now();

          // Yield if buffer is large enough or enough time passed
          if (buffer.length >= BUFFER_SIZE || now - lastYieldTime >= BUFFER_TIME) {
            yield buffer;
            buffer = '';
            lastYieldTime = now;
          }
        }
      }

      // Flush remaining buffer
      if (buffer.length > 0) {
        yield buffer;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Z.AI stream query failed: ${message}`);
    }
  }

  /**
   * Full query with metadata
   */
  async query(prompt: string, options?: QueryOptions): Promise<QueryResult> {
    try {
      const messages: OpenAI.ChatCompletionMessageParam[] = [];

      if (options?.systemPrompt) {
        messages.push({
          role: 'system',
          content: options.systemPrompt,
        });
      }

      messages.push({
        role: 'user',
        content: prompt,
      });

      const response = await this.client.chat.completions.create({
        model: this.resolveModel(options?.model),
        messages,
        max_tokens: options?.maxTokens || 8192,
        temperature: options?.temperature,
      });

      const content = response.choices[0]?.message?.content || '';
      const usage = response.usage;

      return {
        text: content,
        model: response.model,
        usage: usage
          ? {
              inputTokens: usage.prompt_tokens,
              outputTokens: usage.completion_tokens,
            }
          : undefined,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Z.AI query failed: ${message}`);
    }
  }

  /**
   * Check if Z.AI is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      // Quick check by listing models
      await this.client.models.list();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Resolve model name - map claude names to Z.AI equivalents
   */
  private resolveModel(model?: string): string {
    if (!model) {
      return this.defaultModel;
    }

    // If it's already a Z.AI model, use it
    if (model in ZAI_MODELS) {
      return model;
    }

    // Removed legacy mapping (sonnet -> plus) to respect Provider separation.
    // The backend/UI should send the correct Z.AI model ID (e.g. glm-4.7)
    // or rely on env defaults.

    // Default to defaultModel
    return this.defaultModel;
  }
}
