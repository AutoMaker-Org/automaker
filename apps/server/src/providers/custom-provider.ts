/**
 * Custom Endpoint Provider - Executes queries using any Anthropic-compatible API endpoint
 *
 * Supports GLM-4.7 (Zhipu AI), Minimax-2.1, and any other Anthropic-compatible endpoints.
 * Makes HTTP requests directly following the Anthropic Messages API format.
 */

import { BaseProvider } from './base-provider.js';
import { classifyError, getUserFriendlyErrorMessage, createLogger } from '@automaker/utils';

const logger = createLogger('CustomProvider');
import type {
  ExecuteOptions,
  ProviderMessage,
  InstallationStatus,
  ModelDefinition,
  ProviderConfig,
} from './types.js';

/**
 * Custom endpoint configuration
 */
export interface CustomEndpointConfig {
  /** Provider preset or 'manual' for custom configuration */
  provider: 'zhipu' | 'minimax' | 'manual';
  /** Base URL for the API endpoint */
  baseUrl: string;
  /** API key for authentication */
  apiKey: string;
  /** Default model ID to use */
  model: string;
}

/**
 * Anthropic Messages API request format
 */
interface AnthropicMessageRequest {
  model: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string | Array<{ type: string; text?: string; source?: object }>;
  }>;
  system?: string;
  max_tokens?: number;
  stream?: boolean;
}

/**
 * Anthropic Messages API response format
 */
interface AnthropicMessageResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{ type: string; text?: string }>;
  model: string;
  stop_reason: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Streaming event format
 */
interface AnthropicStreamEvent {
  type: string;
  index?: number;
  delta?: { type?: string; text?: string };
  message?: {
    id: string;
    type: string;
    role: string;
    content: Array<{ type: string }>;
    model: string;
    stop_reason: string | null;
    usage: {
      input_tokens: number;
      output_tokens: number;
    };
  };
}

export class CustomProvider extends BaseProvider {
  private customConfig: CustomEndpointConfig | null = null;

  constructor(config: ProviderConfig & { customEndpoint?: CustomEndpointConfig }) {
    super(config);
    if (config.customEndpoint) {
      this.customConfig = config.customEndpoint;
    }
  }

  getName(): string {
    return 'custom';
  }

  /**
   * Execute a query using a custom Anthropic-compatible endpoint
   */
  async *executeQuery(options: ExecuteOptions): AsyncGenerator<ProviderMessage> {
    const { prompt, model, systemPrompt } = options;

    // Get custom endpoint config - prioritize options (runtime) over constructor config
    const customEndpoint = options.customEndpoint || this.customConfig;

    // Validate custom endpoint configuration
    if (!customEndpoint) {
      throw new Error(
        'Custom endpoint not configured. Please configure the endpoint in Settings > Providers > Custom.'
      );
    }

    const { baseUrl, apiKey } = customEndpoint;

    // Debug: Log what config we're using (mask the API key for security)
    console.log('[CustomProvider] Using config:', {
      baseUrl,
      apiKeyPresent: !!apiKey,
      apiKeyLength: apiKey?.length || 0,
      apiKeyPrefix: apiKey?.substring(0, 8) + '...',
      model: options.model,
    });

    if (!baseUrl || !apiKey) {
      throw new Error(
        'Custom endpoint configuration is incomplete. Please provide both Base URL and API Key.'
      );
    }

    // Build the messages array
    const messages: Array<{
      role: 'user' | 'assistant';
      content: string | Array<{ type: string; text?: string; source?: object }>;
    }> = [];

    // Push the prompt as a user message (works for both string and array content)
    messages.push({
      role: 'user',
      content: prompt,
    });

    // Strip the 'custom-' prefix from model name for the API request
    const apiModel = model.startsWith('custom-') ? model.slice(7) : model;
    logger.info(`Sending request to custom endpoint: model=${apiModel}, baseUrl=${baseUrl}`);

    // Build the request body
    const requestBody: AnthropicMessageRequest = {
      model: apiModel,
      messages,
      max_tokens: 4096,
      stream: true,
    };

    if (systemPrompt) {
      // Handle systemPrompt which can be a string or SystemPromptPreset object
      if (typeof systemPrompt === 'string') {
        requestBody.system = systemPrompt;
      }
      // If it's a SystemPromptPreset object, we'd need to resolve it
      // For now, skip custom provider support for preset-based system prompts
    }

    // Make the streaming request
    try {
      // Use /v1/messages path (standard Anthropic API format)
      const apiUrl = `${baseUrl}/v1/messages`;
      logger.info(`Making request to custom endpoint: ${apiUrl}`);
      console.log(
        '[CustomProvider] Request body:',
        JSON.stringify(requestBody, null, 2).substring(0, 500)
      );

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        logger.error(
          `Custom endpoint error: ${response.status} ${response.statusText} - ${errorText}`
        );

        // Classify the error
        let errorType = 'unknown';
        if (response.status === 401) errorType = 'authentication_failed';
        else if (response.status === 429) errorType = 'rate_limit';
        else if (response.status >= 500) errorType = 'server_error';
        else if (response.status >= 400) errorType = 'invalid_request';

        const error = new Error(`Custom endpoint error (${response.status}): ${errorText}`);
        (error as any).type = errorType;
        throw error;
      }

      // Check if the response is actually a stream
      const contentType = response.headers.get('content-type') || '';
      if (
        !contentType.includes('text/event-stream') &&
        !contentType.includes('application/octet-stream')
      ) {
        // API returned a non-streaming response - likely an error in JSON format
        const responseText = await response.text();
        logger.error(`Custom endpoint returned non-streaming response: ${responseText}`);

        // Try to parse as JSON error
        try {
          const jsonError = JSON.parse(responseText);
          throw new Error(
            `Custom endpoint returned non-streaming response: ${JSON.stringify(jsonError)}`
          );
        } catch {
          throw new Error(`Custom endpoint returned non-streaming response: ${responseText}`);
        }
      }

      // Stream the response
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body received from custom endpoint');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const event: AnthropicStreamEvent = JSON.parse(data);

              // Handle different event types
              if (event.type === 'content_block_delta' && event.delta?.text) {
                yield {
                  type: 'assistant',
                  message: {
                    role: 'assistant',
                    content: [
                      {
                        type: 'text',
                        text: event.delta.text,
                      },
                    ],
                  },
                };
              } else if (event.type === 'message_stop') {
                yield {
                  type: 'result',
                  subtype: 'success',
                  result: 'Query completed successfully',
                };
              }
            } catch (parseError) {
              logger.warn(`Failed to parse SSE data: ${data}`, parseError);
            }
          }
        }
      }
    } catch (error) {
      const errorInfo = classifyError(error);
      const userMessage = getUserFriendlyErrorMessage(error);

      logger.error('CustomProvider executeQuery error:', {
        type: errorInfo.type,
        message: errorInfo.message,
        stack: (error as Error).stack,
      });

      const enhancedError = new Error(userMessage);
      (enhancedError as any).originalError = error;
      (enhancedError as any).type = errorInfo.type;

      throw enhancedError;
    }
  }

  /**
   * Detect custom endpoint installation (checks for configuration)
   */
  async detectInstallation(): Promise<InstallationStatus> {
    const hasConfig = !!this.customConfig;
    const hasBaseUrl = hasConfig && !!this.customConfig!.baseUrl;
    const hasApiKey = hasConfig && !!this.customConfig!.apiKey;

    const status: InstallationStatus = {
      installed: hasBaseUrl && hasApiKey,
      hasApiKey,
      authenticated: hasApiKey,
    };

    if (hasBaseUrl) {
      status.path = this.customConfig!.baseUrl;
    }

    return status;
  }

  /**
   * Get available models (empty for custom provider - users enter model IDs manually)
   */
  getAvailableModels(): ModelDefinition[] {
    // Users enter model IDs manually for custom endpoints
    return [];
  }

  /**
   * Validate the custom endpoint configuration
   */
  validateConfig(): {
    valid: boolean;
    errors: string[];
    warnings?: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!this.customConfig) {
      errors.push('Custom endpoint is not configured');
      return { valid: false, errors, warnings };
    }

    if (!this.customConfig.baseUrl) {
      errors.push('Base URL is required');
    } else {
      try {
        new URL(this.customConfig.baseUrl);
      } catch {
        errors.push('Base URL is not a valid URL');
      }
    }

    if (!this.customConfig.apiKey) {
      errors.push('API Key is required');
    }

    if (!this.customConfig.model) {
      warnings.push('No default model specified');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Set the custom endpoint configuration
   */
  setCustomEndpoint(config: CustomEndpointConfig): void {
    this.customConfig = config;
  }

  /**
   * Get the current custom endpoint configuration
   */
  getCustomEndpoint(): CustomEndpointConfig | null {
    return this.customConfig;
  }

  /**
   * Check if the provider supports a specific feature
   */
  supportsFeature(feature: string): boolean {
    const supportedFeatures = ['tools', 'text'];
    // Note: Vision support depends on the specific endpoint
    return supportedFeatures.includes(feature);
  }
}
