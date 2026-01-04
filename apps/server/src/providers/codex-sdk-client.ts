/**
 * Codex SDK client - Executes Codex queries via OpenAI SDK (no-tool mode)
 *
 * Used for requests that don't require local tool execution.
 */

import OpenAI from 'openai';
import { formatHistoryAsText, classifyError, getUserFriendlyErrorMessage } from '@automaker/utils';
import type { ExecuteOptions, ProviderMessage } from './types.js';
import type {
  ResponseCreateParamsNonStreaming,
  ResponseFormatTextJSONSchemaConfig,
  ResponseInputMessageContentList,
  ResponseInputItem,
} from 'openai/resources/responses/responses';

const OPENAI_API_KEY_ENV = 'OPENAI_API_KEY';
const SDK_INPUT_TEXT_TYPE = 'input_text';
const SDK_INPUT_IMAGE_TYPE = 'input_image';
const SDK_MESSAGE_ROLE_USER = 'user';
const SDK_MESSAGE_TYPE = 'message';
const SDK_TOOL_CHOICE_NONE = 'none';
const SDK_IMAGE_DETAIL_AUTO = 'auto';
const SDK_OUTPUT_SCHEMA_NAME = 'codex_output';
const SDK_OUTPUT_SCHEMA_STRICT = true;
const SDK_HISTORY_HEADER = 'Current request:\n';
const DEFAULT_RESPONSE_TEXT = '';
const SDK_ERROR_DETAILS_LABEL = 'Details:';

type PromptBlock = {
  type: string;
  text?: string;
  source?: {
    type?: string;
    media_type?: string;
    data?: string;
  };
};

function resolveApiKey(): string {
  const apiKey = process.env[OPENAI_API_KEY_ENV];
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set.');
  }
  return apiKey;
}

function normalizePromptBlocks(prompt: ExecuteOptions['prompt']): PromptBlock[] {
  if (Array.isArray(prompt)) {
    return prompt as PromptBlock[];
  }
  return [{ type: 'text', text: prompt }];
}

function buildOutputFormat(
  outputFormat?: ExecuteOptions['outputFormat']
): ResponseFormatTextJSONSchemaConfig | null {
  if (!outputFormat || outputFormat.type !== 'json_schema') {
    return null;
  }
  if (!outputFormat.schema || typeof outputFormat.schema !== 'object') {
    throw new Error('Codex output schema must be a JSON object.');
  }

  return {
    type: 'json_schema',
    name: SDK_OUTPUT_SCHEMA_NAME,
    schema: outputFormat.schema,
    strict: SDK_OUTPUT_SCHEMA_STRICT,
  };
}

function buildSdkContentBlocks(options: ExecuteOptions): ResponseInputMessageContentList {
  const content: ResponseInputMessageContentList = [];
  const historyText =
    options.conversationHistory && options.conversationHistory.length > 0
      ? formatHistoryAsText(options.conversationHistory)
      : '';
  const prefixText = `${historyText}${SDK_HISTORY_HEADER}`;
  content.push({ type: SDK_INPUT_TEXT_TYPE, text: prefixText });

  const promptBlocks = normalizePromptBlocks(options.prompt);
  let hasPromptContent = false;

  for (const block of promptBlocks) {
    if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
      content.push({ type: SDK_INPUT_TEXT_TYPE, text: block.text });
      hasPromptContent = true;
      continue;
    }

    if (block.type === 'image' && block.source?.data && block.source?.media_type) {
      const imageUrl = `data:${block.source.media_type};base64,${block.source.data}`;
      content.push({
        type: SDK_INPUT_IMAGE_TYPE,
        image_url: imageUrl,
        detail: SDK_IMAGE_DETAIL_AUTO,
      });
      hasPromptContent = true;
    }
  }

  if (!hasPromptContent) {
    throw new Error('Codex SDK prompt is empty.');
  }

  return content;
}

function buildSdkRequest(
  options: ExecuteOptions,
  systemPrompt: string | null
): ResponseCreateParamsNonStreaming {
  const content = buildSdkContentBlocks(options);
  const input: ResponseInputItem[] = [
    {
      type: SDK_MESSAGE_TYPE,
      role: SDK_MESSAGE_ROLE_USER,
      content,
    },
  ];

  const request: ResponseCreateParamsNonStreaming = {
    model: options.model,
    input,
    tool_choice: SDK_TOOL_CHOICE_NONE,
  };

  if (systemPrompt) {
    request.instructions = systemPrompt;
  }

  const outputFormat = buildOutputFormat(options.outputFormat);
  if (outputFormat) {
    request.text = { format: outputFormat };
  }

  if (
    options.sdkSessionId &&
    (!options.conversationHistory || options.conversationHistory.length === 0)
  ) {
    request.previous_response_id = options.sdkSessionId;
  }

  return request;
}

function buildOpenAIClient(apiKey: string): OpenAI {
  return new OpenAI({ apiKey });
}

function buildSdkErrorMessage(rawMessage: string, userMessage: string): string {
  if (!rawMessage) {
    return userMessage;
  }
  if (!userMessage || rawMessage === userMessage) {
    return rawMessage;
  }
  return `${userMessage}\n\n${SDK_ERROR_DETAILS_LABEL} ${rawMessage}`;
}

export async function* executeCodexSdkQuery(
  options: ExecuteOptions,
  systemPrompt: string | null
): AsyncGenerator<ProviderMessage> {
  const apiKey = resolveApiKey();
  const client = buildOpenAIClient(apiKey);
  const request = buildSdkRequest(options, systemPrompt);
  const signal = options.abortController?.signal;

  try {
    const response = await client.responses.create(request, signal ? { signal } : undefined);
    if (response.error) {
      const errorMessage = response.error.message || 'OpenAI response error';
      yield { type: 'error', error: errorMessage };
      return;
    }

    const outputText = response.output_text ?? DEFAULT_RESPONSE_TEXT;
    yield {
      type: 'assistant',
      session_id: response.id,
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: outputText }],
      },
    };
    yield {
      type: 'result',
      subtype: 'success',
      session_id: response.id,
      result: outputText,
    };
  } catch (error) {
    const errorInfo = classifyError(error);
    const userMessage = getUserFriendlyErrorMessage(error);
    const combinedMessage = buildSdkErrorMessage(errorInfo.message, userMessage);
    console.error('[CodexSDK] executeQuery() error during execution:', {
      type: errorInfo.type,
      message: errorInfo.message,
      isRateLimit: errorInfo.isRateLimit,
      retryAfter: errorInfo.retryAfter,
      stack: error instanceof Error ? error.stack : undefined,
    });
    yield { type: 'error', error: combinedMessage };
  }
}
