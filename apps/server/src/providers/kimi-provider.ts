/**
 * Kimi Provider - Executes queries using Kimi models via OpenRouter
 *
 * Uses OpenAI-compatible API via OpenRouter to access Moonshot AI's Kimi models.
 * Supports streaming responses and tool/function calling.
 */

import OpenAI from 'openai';
import { BaseProvider } from './base-provider.js';
import { classifyError, getUserFriendlyErrorMessage, createLogger } from '@automaker/utils';
import { validateBareModelId, type Credentials } from '@automaker/types';

import type {
  ExecuteOptions,
  ProviderMessage,
  InstallationStatus,
  ModelDefinition,
  ContentBlock,
} from './types.js';

const logger = createLogger('KimiProvider');

/** OpenRouter base URL for API requests */
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/** OpenRouter headers for attribution */
const OPENROUTER_HEADERS = {
  'HTTP-Referer': 'https://automaker.app',
  'X-Title': 'Automaker',
};

/** Kimi model ID prefix for canonical format */
export const KIMI_MODEL_PREFIX = 'kimi-';

/** Map of Kimi model aliases to OpenRouter model IDs */
export const KIMI_MODEL_MAP: Record<string, string> = {
  'kimi-k2.5': 'moonshotai/kimi-k2.5',
  'kimi-k1.5': 'moonshotai/kimi-k1.5',
  'kimi-k1.5-long': 'moonshotai/kimi-k1.5-long',
};

/**
 * Get the OpenRouter model ID for a Kimi model
 * @param model - Model string (with or without kimi- prefix)
 * @returns OpenRouter model ID
 */
function getOpenRouterModelId(model: string): string {
  // Check direct mapping first
  if (model in KIMI_MODEL_MAP) {
    return KIMI_MODEL_MAP[model];
  }

  // Try with kimi- prefix
  const prefixedModel = model.startsWith(KIMI_MODEL_PREFIX)
    ? model
    : `${KIMI_MODEL_PREFIX}${model}`;
  if (prefixedModel in KIMI_MODEL_MAP) {
    return KIMI_MODEL_MAP[prefixedModel];
  }

  // If it looks like an OpenRouter model ID, use it directly
  if (model.includes('/')) {
    return model;
  }

  // Default to k2.5 if unknown
  logger.warn(`Unknown Kimi model "${model}", defaulting to kimi-k2.5`);
  return KIMI_MODEL_MAP['kimi-k2.5'];
}

/**
 * Get API key from credentials or environment
 */
function getApiKey(credentials?: Credentials): string | undefined {
  // First check credentials (UI settings)
  if (credentials?.apiKeys?.openrouter) {
    return credentials.apiKeys.openrouter;
  }

  // Fall back to environment variable
  return process.env.OPENROUTER_API_KEY;
}

/**
 * Convert OpenAI tool calls to Automaker ContentBlock format
 */
function convertToolCalls(
  toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[]
): ContentBlock[] {
  return toolCalls
    .filter((tc) => tc.type === 'function')
    .map((tc) => {
      // Type guard: only function tool calls have the function property
      const funcCall = tc as OpenAI.Chat.Completions.ChatCompletionMessageToolCall & {
        type: 'function';
        function: { name: string; arguments: string };
      };
      return {
        type: 'tool_use' as const,
        tool_use_id: funcCall.id,
        name: funcCall.function.name,
        input: JSON.parse(funcCall.function.arguments || '{}'),
      };
    });
}

/**
 * Convert allowed tools to OpenAI function format
 */
function convertToolsToFunctions(
  allowedTools?: string[]
): OpenAI.Chat.Completions.ChatCompletionTool[] | undefined {
  if (!allowedTools || allowedTools.length === 0) {
    return undefined;
  }

  // Basic tool definitions - in a real implementation, these would come from
  // the tool registry with full schemas
  return allowedTools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool,
      description: `Execute the ${tool} tool`,
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: true,
      },
    },
  }));
}

export class KimiProvider extends BaseProvider {
  getName(): string {
    return 'kimi';
  }

  /**
   * Execute a query using Kimi via OpenRouter
   */
  async *executeQuery(options: ExecuteOptions): AsyncGenerator<ProviderMessage> {
    // Validate that model doesn't have a provider prefix
    validateBareModelId(options.model, 'KimiProvider');

    const {
      prompt,
      model,
      systemPrompt,
      maxTurns = 1,
      allowedTools,
      abortController,
      conversationHistory,
      credentials,
    } = options;

    // Get API key
    const apiKey = getApiKey(credentials);
    if (!apiKey) {
      yield {
        type: 'error',
        error:
          'OpenRouter API key not configured. Please add your API key in Settings > Providers.',
      };
      return;
    }

    // Create OpenAI client configured for OpenRouter
    const client = new OpenAI({
      baseURL: OPENROUTER_BASE_URL,
      apiKey,
      defaultHeaders: OPENROUTER_HEADERS,
    });

    // Get OpenRouter model ID
    const openRouterModel = getOpenRouterModelId(model);

    // Build messages array
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

    // Add system prompt if provided
    if (systemPrompt && typeof systemPrompt === 'string') {
      messages.push({ role: 'system', content: systemPrompt });
    }

    // Add conversation history
    if (conversationHistory && conversationHistory.length > 0) {
      for (const msg of conversationHistory) {
        if (typeof msg.content === 'string') {
          messages.push({
            role: msg.role,
            content: msg.content,
          });
        } else if (Array.isArray(msg.content)) {
          // Handle content blocks
          const textContent = msg.content
            .filter((block) => block.type === 'text' && block.text)
            .map((block) => block.text)
            .join('\n');
          if (textContent) {
            messages.push({
              role: msg.role,
              content: textContent,
            });
          }
        }
      }
    }

    // Add current prompt
    if (typeof prompt === 'string') {
      messages.push({ role: 'user', content: prompt });
    } else if (Array.isArray(prompt)) {
      // Handle multi-part prompt (text blocks)
      const textContent = prompt
        .filter((block) => block.type === 'text' && block.text)
        .map((block) => block.text)
        .join('\n');
      messages.push({ role: 'user', content: textContent || '' });
    }

    // Convert tools to OpenAI format
    const tools = convertToolsToFunctions(allowedTools);

    logger.debug('[KimiProvider] SDK Configuration:', {
      model: openRouterModel,
      baseUrl: OPENROUTER_BASE_URL,
      hasApiKey: !!apiKey,
      messageCount: messages.length,
      hasTools: !!tools,
      maxTurns,
    });

    try {
      // Create streaming completion
      const stream = await client.chat.completions.create(
        {
          model: openRouterModel,
          messages,
          stream: true,
          ...(tools && { tools }),
        },
        {
          signal: abortController?.signal,
        }
      );

      // Accumulate the response
      let accumulatedContent = '';
      let accumulatedToolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] = [];
      let currentToolCall: Partial<OpenAI.Chat.Completions.ChatCompletionMessageToolCall> | null =
        null;

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;

        if (!delta) continue;

        // Handle text content
        if (delta.content) {
          accumulatedContent += delta.content;

          // Yield incremental text updates
          yield {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [{ type: 'text', text: accumulatedContent }],
            },
          };
        }

        // Handle tool calls
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (tc.index !== undefined) {
              // New tool call or continuation
              if (!currentToolCall || tc.id) {
                // Start new tool call
                if (currentToolCall && currentToolCall.id) {
                  accumulatedToolCalls.push(
                    currentToolCall as OpenAI.Chat.Completions.ChatCompletionMessageToolCall
                  );
                }
                currentToolCall = {
                  id: tc.id || `call_${Date.now()}_${tc.index}`,
                  type: 'function',
                  function: {
                    name: tc.function?.name || '',
                    arguments: tc.function?.arguments || '',
                  },
                };
              } else if (currentToolCall.function) {
                // Append to existing tool call
                if (tc.function?.name) {
                  currentToolCall.function.name += tc.function.name;
                }
                if (tc.function?.arguments) {
                  currentToolCall.function.arguments += tc.function.arguments;
                }
              }
            }
          }
        }
      }

      // Finalize any pending tool call
      if (currentToolCall && currentToolCall.id && currentToolCall.function) {
        accumulatedToolCalls.push(
          currentToolCall as OpenAI.Chat.Completions.ChatCompletionMessageToolCall
        );
      }

      // Build final content blocks
      const contentBlocks: ContentBlock[] = [];

      if (accumulatedContent) {
        contentBlocks.push({ type: 'text', text: accumulatedContent });
      }

      if (accumulatedToolCalls.length > 0) {
        contentBlocks.push(...convertToolCalls(accumulatedToolCalls));
      }

      // Yield final message
      if (contentBlocks.length > 0) {
        yield {
          type: 'assistant',
          message: {
            role: 'assistant',
            content: contentBlocks,
          },
        };
      }

      // Yield result message
      yield {
        type: 'result',
        subtype: 'success',
        result: accumulatedContent,
      };
    } catch (error) {
      // Handle abort
      if (abortController?.signal.aborted) {
        yield {
          type: 'error',
          error: 'Request was cancelled',
        };
        return;
      }

      // Enhance error with user-friendly message
      const errorInfo = classifyError(error);
      const userMessage = getUserFriendlyErrorMessage(error);

      logger.error('executeQuery() error during execution:', {
        type: errorInfo.type,
        message: errorInfo.message,
        isRateLimit: errorInfo.isRateLimit,
        retryAfter: errorInfo.retryAfter,
        stack: (error as Error).stack,
      });

      // Build enhanced error message
      const message = errorInfo.isRateLimit
        ? `${userMessage}\n\nTip: OpenRouter rate limits vary by model and plan. Consider waiting a moment before retrying.`
        : userMessage;

      yield {
        type: 'error',
        error: message,
      };
    }
  }

  /**
   * Detect Kimi/OpenRouter installation (checks for API key)
   */
  async detectInstallation(): Promise<InstallationStatus> {
    const apiKey = getApiKey();
    const hasApiKey = !!apiKey;

    return {
      installed: true, // Always "installed" since it's an API
      method: 'sdk',
      hasApiKey,
      authenticated: hasApiKey,
    };
  }

  /**
   * Get available Kimi models
   */
  getAvailableModels(): ModelDefinition[] {
    return [
      {
        id: 'kimi-k2.5',
        name: 'Kimi K2.5',
        modelString: 'kimi-k2.5',
        provider: 'kimi',
        description: 'Latest Kimi model - fast and capable',
        contextWindow: 131072,
        maxOutputTokens: 8192,
        supportsVision: false,
        supportsTools: true,
        tier: 'standard' as const,
        default: true,
      },
      {
        id: 'kimi-k1.5',
        name: 'Kimi K1.5',
        modelString: 'kimi-k1.5',
        provider: 'kimi',
        description: 'Kimi K1.5 - balanced performance',
        contextWindow: 131072,
        maxOutputTokens: 8192,
        supportsVision: false,
        supportsTools: true,
        tier: 'standard' as const,
      },
      {
        id: 'kimi-k1.5-long',
        name: 'Kimi K1.5 Long',
        modelString: 'kimi-k1.5-long',
        provider: 'kimi',
        description: 'Kimi K1.5 with extended context',
        contextWindow: 262144,
        maxOutputTokens: 8192,
        supportsVision: false,
        supportsTools: true,
        tier: 'standard' as const,
      },
    ];
  }

  /**
   * Check if the provider supports a specific feature
   */
  supportsFeature(feature: string): boolean {
    const supportedFeatures = ['tools', 'text'];
    return supportedFeatures.includes(feature);
  }
}
