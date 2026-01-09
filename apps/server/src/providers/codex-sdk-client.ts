/**
 * Codex SDK client - Executes Codex queries via official @openai/codex-sdk
 *
 * Used for programmatic control of Codex from within the application.
 * Provides cleaner integration than spawning CLI processes.
 */

import { Codex } from '@openai/codex-sdk';
import { formatHistoryAsText, classifyError, getUserFriendlyErrorMessage } from '@automaker/utils';
import { supportsReasoningEffort } from '@automaker/types';
import type { ExecuteOptions, ProviderMessage } from './types.js';

const OPENAI_API_KEY_ENV = 'OPENAI_API_KEY';
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

function buildPromptText(options: ExecuteOptions, systemPrompt: string | null): string {
  const historyText =
    options.conversationHistory && options.conversationHistory.length > 0
      ? formatHistoryAsText(options.conversationHistory)
      : '';

  const promptBlocks = normalizePromptBlocks(options.prompt);
  const promptTexts: string[] = [];

  for (const block of promptBlocks) {
    if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
      promptTexts.push(block.text);
    }
  }

  const promptContent = promptTexts.join('\n\n');
  if (!promptContent.trim()) {
    throw new Error('Codex SDK prompt is empty.');
  }

  const parts: string[] = [];
  if (systemPrompt) {
    parts.push(`System: ${systemPrompt}`);
  }
  if (historyText) {
    parts.push(historyText);
  }
  parts.push(`${SDK_HISTORY_HEADER}${promptContent}`);

  return parts.join('\n\n');
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

/**
 * Execute a query using the official Codex SDK
 *
 * The SDK provides a cleaner interface than spawning CLI processes:
 * - Handles authentication automatically
 * - Provides TypeScript types
 * - Supports thread management and resumption
 * - Better error handling
 */
export async function* executeCodexSdkQuery(
  options: ExecuteOptions,
  systemPrompt: string | null
): AsyncGenerator<ProviderMessage> {
  try {
    const apiKey = resolveApiKey();
    const codex = new Codex({ apiKey });

    // Resume existing thread or start new one
    let thread;
    if (options.sdkSessionId) {
      try {
        thread = codex.resumeThread(options.sdkSessionId);
      } catch {
        // If resume fails, start a new thread
        thread = codex.startThread();
      }
    } else {
      thread = codex.startThread();
    }

    const promptText = buildPromptText(options, systemPrompt);

    // Build run options with reasoning effort if supported
    const runOptions: {
      signal?: AbortSignal;
      reasoning?: { effort: string };
    } = {
      signal: options.abortController?.signal,
    };

    // Add reasoning effort if model supports it and reasoningEffort is specified
    if (
      options.reasoningEffort &&
      supportsReasoningEffort(options.model) &&
      options.reasoningEffort !== 'none'
    ) {
      runOptions.reasoning = { effort: options.reasoningEffort };
    }

    // Run the query
    const result = await thread.run(promptText, runOptions);

    // Extract response text (from finalResponse property)
    const outputText = result.finalResponse ?? DEFAULT_RESPONSE_TEXT;

    // Get thread ID (may be null if not populated yet)
    const threadId = thread.id ?? undefined;

    // Yield assistant message
    yield {
      type: 'assistant',
      session_id: threadId,
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: outputText }],
      },
    };

    // Yield result
    yield {
      type: 'result',
      subtype: 'success',
      session_id: threadId,
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
