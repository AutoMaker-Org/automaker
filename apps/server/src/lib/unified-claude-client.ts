/**
 * Unified Claude Client
 *
 * Provides a single interface that automatically switches between:
 * - Claude Agent SDK (when using API key)
 * - Claude CLI (when using subscription via CLI)
 *
 * This abstraction makes the authentication method transparent to the rest
 * of the application.
 */

import { query, type Options } from '@anthropic-ai/claude-agent-sdk';
import { createLogger } from '@automaker/utils';
import { getAuthStatus, getAuthConfig } from './claude-auth-manager.js';
import { streamCliQuery, type CLIQueryOptions } from './claude-cli-client.js';
import type { ProviderMessage } from '../providers/types.js';
import type { ClaudeAuthMethod } from '../types/auth-types.js';

const logger = createLogger('UnifiedClient');

/**
 * Options for unified query execution
 */
export interface UnifiedQueryOptions {
  prompt: string | AsyncIterable<any>;
  model?: string;
  cwd?: string;
  systemPrompt?: string;
  maxTurns?: number;
  allowedTools?: string[];
  mcpServers?: Record<string, unknown>;
  abortController?: AbortController;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: any }>;
  sdkSessionId?: string;
  forceAuthMethod?: ClaudeAuthMethod;
}

/**
 * Execute a query using the appropriate authentication method
 *
 * This function automatically determines whether to use the Claude SDK
 * or the CLI based on the current authentication configuration.
 */
export async function* executeUnifiedQuery(
  options: UnifiedQueryOptions
): AsyncGenerator<ProviderMessage> {
  const {
    prompt,
    model = 'claude-sonnet-4-20250514',
    cwd = process.cwd(),
    systemPrompt,
    maxTurns = 20,
    allowedTools = [],
    mcpServers,
    abortController,
    conversationHistory,
    sdkSessionId,
    forceAuthMethod,
  } = options;

  // Determine which authentication method to use
  let authMethod: ClaudeAuthMethod;

  if (forceAuthMethod) {
    authMethod = forceAuthMethod;
    logger.info(`[Unified] Using forced auth method: ${authMethod}`);
  } else {
    const authStatus = await getAuthStatus();
    authMethod = authStatus.method || 'api_key';
    logger.info(`[Unified] Using detected auth method: ${authMethod}`);
  }

  // Route to the appropriate client
  if (authMethod === 'cli') {
    // Use CLI client
    logger.info('[Unified] Routing to CLI client');

    // Convert prompt to string if it's an AsyncIterable
    let promptText: string;
    if (typeof prompt === 'string') {
      promptText = prompt;
    } else {
      // Extract text from AsyncIterable
      const messages = [];
      for await (const msg of prompt) {
        messages.push(msg);
      }

      // Try to extract text from the first message
      const firstMsg = messages[0];
      if (firstMsg?.message?.content) {
        const content = firstMsg.message.content;
        if (Array.isArray(content)) {
          const textBlocks = content.filter((c: any) => c.type === 'text');
          promptText = textBlocks.map((b: any) => b.text).join('');
        } else {
          promptText = String(content);
        }
      } else if (firstMsg) {
        promptText = String(firstMsg);
      } else {
        promptText = '';
        logger.warn('[Unified] Empty prompt received from AsyncIterable');
      }
    }

    const cliOptions: CLIQueryOptions = {
      prompt: promptText,
      model,
      cwd,
      systemPrompt,
      maxTurns,
      abortController,
    };

    yield* streamCliQuery(cliOptions);
  } else {
    // Use Claude Agent SDK
    logger.info('[Unified] Routing to Claude Agent SDK');

    // Ensure API key is set
    const authConfig = getAuthConfig();
    if (authConfig.apiKey) {
      process.env.ANTHROPIC_API_KEY = authConfig.apiKey;
    }

    const defaultTools = ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash', 'WebSearch', 'WebFetch'];
    const toolsToUse = allowedTools.length > 0 ? allowedTools : defaultTools;

    const sdkOptions: Options = {
      model,
      systemPrompt,
      maxTurns,
      cwd,
      allowedTools: toolsToUse,
      permissionMode: 'acceptEdits',
      sandbox: {
        enabled: true,
        autoAllowBashIfSandboxed: true,
      },
      abortController,
      ...(sdkSessionId && conversationHistory && conversationHistory.length > 0
        ? { resume: sdkSessionId }
        : {}),
    };

    try {
      const stream = query({ prompt, options: sdkOptions });

      for await (const msg of stream) {
        yield msg as ProviderMessage;
      }
    } catch (error) {
      logger.error('[Unified] SDK query error:', error);
      throw error;
    }
  }
}

/**
 * Check if the unified client is ready to execute queries
 */
export async function isClientReady(): Promise<{
  ready: boolean;
  method?: ClaudeAuthMethod;
  error?: string;
}> {
  const authStatus = await getAuthStatus();

  if (!authStatus.authenticated) {
    return {
      ready: false,
      error: authStatus.error || 'Not authenticated',
    };
  }

  return {
    ready: true,
    method: authStatus.method,
  };
}

/**
 * Get the active authentication method
 */
export async function getActiveAuthMethod(): Promise<ClaudeAuthMethod | null> {
  const authStatus = await getAuthStatus();
  return authStatus.method || null;
}
