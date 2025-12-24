/**
 * Claude CLI Client - Streaming interface compatible with Claude Agent SDK
 *
 * This module provides a streaming interface to the Claude CLI that matches
 * the Claude Agent SDK's message format, allowing transparent switching between
 * API key and CLI authentication modes.
 */

import { spawn } from 'child_process';
import { createLogger } from '@automaker/utils';
import type { ProviderMessage } from '../providers/types.js';

const logger = createLogger('CLIClient');

/**
 * Options for CLI query execution
 *
 * Note: Multi-turn conversations are not currently supported by the CLI client.
 * The maxTurns parameter is accepted for API compatibility but not implemented.
 */
export interface CLIQueryOptions {
  prompt: string;
  model?: string;
  cwd?: string;
  systemPrompt?: string;
  /** @deprecated Multi-turn not yet supported via CLI - parameter ignored */
  maxTurns?: number;
  abortController?: AbortController;
  timeout?: number;
}

/**
 * Parse CLI output into SDK-compatible messages
 *
 * The Claude CLI outputs text responses. We need to convert these
 * into the structured message format used by the Claude Agent SDK.
 */
function parseCliOutputToMessages(output: string, sessionId: string): ProviderMessage[] {
  const messages: ProviderMessage[] = [];

  if (!output || output.trim().length === 0) {
    return messages;
  }

  // For now, we'll create a simple assistant message with the text content
  // In the future, we could parse tool uses, thinking blocks, etc.
  const assistantMessage: ProviderMessage = {
    type: 'assistant',
    session_id: sessionId,
    message: {
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: output.trim(),
        },
      ],
    },
  };

  messages.push(assistantMessage);

  // Add a result message to indicate completion
  const resultMessage: ProviderMessage = {
    type: 'result',
    subtype: 'success',
    session_id: sessionId,
    result: output.trim(),
  };

  messages.push(resultMessage);

  return messages;
}

/**
 * Parse error output into SDK-compatible error message
 */
function parseCliError(error: string, sessionId: string): ProviderMessage {
  return {
    type: 'error',
    session_id: sessionId,
    error: error.trim(),
  };
}

/**
 * Execute a query using the Claude CLI and stream results
 *
 * This provides an async generator interface that yields ProviderMessage objects,
 * matching the Claude Agent SDK's streaming interface.
 */
export async function streamCliQuery(options: CLIQueryOptions): AsyncGenerator<ProviderMessage> {
  const {
    prompt,
    model = 'claude-sonnet-4-20250514',
    cwd = process.cwd(),
    systemPrompt,
    maxTurns = 1,
    abortController,
    timeout = 60000,
  } = options;

  const sessionId = `cli-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  logger.info(`[CLI] Starting streaming query (session: ${sessionId})`);

  // Build CLI arguments
  const args = ['chat', '--no-color'];

  // Note: The Claude CLI may not support all these options
  // We'll add them if/when they become available
  if (model && model !== 'claude-sonnet-4-20250514') {
    // Model selection if supported
    logger.info(`[CLI] Requested model: ${model}`);
  }

  return new Promise<AsyncGenerator<ProviderMessage>>((resolve, reject) => {
    const child = spawn('claude', args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        // Ensure we're not using API key - force CLI auth
        ANTHROPIC_API_KEY: undefined,
      },
    });

    let stdout = '';
    let stderr = '';
    let didYield = false;

    // Set up timeout
    const timeoutId = setTimeout(() => {
      logger.warn(`[CLI] Query timeout after ${timeout}ms`);
      child.kill();
      if (!didYield) {
        reject(new Error('Query timeout'));
      }
    }, timeout);

    // Handle abort signal
    const abortHandler = () => {
      logger.info('[CLI] Query aborted by controller');
      clearTimeout(timeoutId);
      child.kill();
      if (!didYield) {
        reject(new Error('Query aborted'));
      }
    };

    if (abortController) {
      abortController.signal.addEventListener('abort', abortHandler);
    }

    // Collect stdout
    child.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      stdout += text;
      logger.debug('[CLI] Received stdout:', text.substring(0, 100));
    });

    // Collect stderr
    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      stderr += text;
      logger.debug('[CLI] Received stderr:', text);
    });

    // Handle process exit
    child.on('close', async (code) => {
      clearTimeout(timeoutId);
      if (abortController) {
        abortController.signal.removeEventListener('abort', abortHandler);
      }

      logger.info(`[CLI] Process exited with code ${code}`);

      // Create async generator
      async function* generateMessages() {
        if (code === 0 && stdout) {
          // Success - parse and yield messages
          const messages = parseCliOutputToMessages(stdout, sessionId);
          for (const msg of messages) {
            yield msg;
          }
        } else if (stderr) {
          // Error - yield error message
          yield parseCliError(stderr, sessionId);
        } else {
          // Unknown error
          yield parseCliError(`CLI process exited with code ${code} and no output`, sessionId);
        }
      }

      didYield = true;
      resolve(generateMessages());
    });

    // Handle process error
    child.on('error', (err) => {
      clearTimeout(timeoutId);
      if (abortController) {
        abortController.signal.removeEventListener('abort', abortHandler);
      }

      logger.error('[CLI] Process error:', err);

      if (!didYield) {
        reject(err);
      }
    });

    // Send the prompt
    if (child.stdin) {
      try {
        // If we have a system prompt, send it first
        if (systemPrompt) {
          child.stdin.write(`System: ${systemPrompt}\n\n`);
        }

        // Send the user prompt
        child.stdin.write(prompt + '\n');
        child.stdin.end();

        logger.info('[CLI] Prompt sent to CLI process');
      } catch (err) {
        clearTimeout(timeoutId);
        if (abortController) {
          abortController.signal.removeEventListener('abort', abortHandler);
        }

        logger.error('[CLI] Error writing to stdin:', err);
        child.kill();
        reject(err);
      }
    } else {
      clearTimeout(timeoutId);
      if (abortController) {
        abortController.signal.removeEventListener('abort', abortHandler);
      }

      const error = new Error('Failed to open CLI stdin');
      logger.error('[CLI]', error);
      reject(error);
    }
  });
}

/**
 * Execute a simple non-streaming query using the CLI
 *
 * This is a convenience wrapper around streamCliQuery that collects
 * all the messages and returns the final result.
 */
export async function executeCliQuery(
  options: CLIQueryOptions
): Promise<{ success: boolean; response?: string; error?: string }> {
  try {
    const messages: ProviderMessage[] = [];

    for await (const msg of streamCliQuery(options)) {
      messages.push(msg);
    }

    // Find the result message
    const resultMsg = messages.find((m) => m.type === 'result');
    const errorMsg = messages.find((m) => m.type === 'error');

    if (errorMsg) {
      const errorText = 'error' in errorMsg ? errorMsg.error : 'Unknown error';
      return {
        success: false,
        error: errorText || 'Unknown error',
      };
    }

    if (resultMsg?.result) {
      return {
        success: true,
        response: resultMsg.result,
      };
    }

    // Extract text from assistant messages
    const assistantMsg = messages.find((m) => m.type === 'assistant');
    if (assistantMsg?.message?.content) {
      const textBlocks = assistantMsg.message.content.filter((c) => c.type === 'text');
      const text = textBlocks.map((b) => b.text).join('');

      return {
        success: true,
        response: text,
      };
    }

    return {
      success: false,
      error: 'No response from CLI',
    };
  } catch (error) {
    logger.error('[CLI] Query execution error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
