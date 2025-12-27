/**
 * POST /verify-zai-auth endpoint - Verify Z.ai authentication by running a test query
 *
 * Response format:
 * - success: true if the endpoint executed without errors (HTTP 200)
 * - authenticated: true if the Z.ai API key is valid and has sufficient credits
 * - error: optional error message for display to the user
 *
 * Note: `success` indicates the HTTP request succeeded, while `authenticated`
 * indicates whether the API key is valid. A response may have success=true but
 * authenticated=false if the key is invalid or has billing issues.
 */

import type { Request, Response } from 'express';
import type { ProviderMessage, ContentBlock } from '../../../providers/types.js';
import { ProviderFactory } from '../../../providers/provider-factory.js';
import { createLogger } from '@automaker/utils';
import { getApiKey } from '../common.js';

const logger = createLogger('Setup');

const AUTH_ERROR_PATTERNS = ['unauthorized', 'invalid api key', 'invalid key', 'forbidden'];
const BILLING_ERROR_PATTERNS = ['insufficient balance', 'insufficient quota', 'credit'];
const RATE_LIMIT_PATTERNS = ['rate limit', 'limit reached', 'too many requests'];

function includesAny(text: string, patterns: string[]): boolean {
  const lower = text.toLowerCase();
  return patterns.some((pattern) => lower.includes(pattern.toLowerCase()));
}

/**
 * Detect Z.ai API errors from response text and return user-friendly message
 * @returns Error message or null if no error detected
 */
function detectZaiError(text: string): string | null {
  if (includesAny(text, BILLING_ERROR_PATTERNS)) {
    return 'Credit balance is too low. Please add credits to your Z.ai account.';
  }
  if (includesAny(text, RATE_LIMIT_PATTERNS)) {
    return 'Rate limit reached. Please try again later.';
  }
  if (includesAny(text, AUTH_ERROR_PATTERNS)) {
    return 'API key is invalid or has been revoked.';
  }
  return null;
}

export function createVerifyZaiAuthHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    const { apiKey: apiKeyFromBody } = req.body as { apiKey?: string };
    const apiKey = apiKeyFromBody || getApiKey('zai') || process.env.ZAI_API_KEY;

    if (!apiKey) {
      res.json({
        success: true,
        authenticated: false,
        error: 'No Z.ai API key configured. Please enter an API key first.',
      });
      return;
    }

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 30000);

    let receivedContent = false;
    let errorMessage = '';

    try {
      const provider = ProviderFactory.getProviderForModel('glm-4.7', { apiKey });
      const stream = provider.executeQuery({
        prompt: "Reply with only the word 'ok'",
        model: 'glm-4.7',
        cwd: process.cwd(),
        maxTurns: 1,
        allowedTools: [],
        abortController,
      });

      for await (const msg of stream) {
        // Check for error message
        if (msg.type === 'error' && msg.error) {
          errorMessage = msg.error;
          break;
        }

        // Process assistant message content
        if (msg.type === 'assistant' && msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === 'text' && block.text) {
              // Check for API errors in response text
              const error = detectZaiError(block.text);
              if (error) {
                errorMessage = error;
                break;
              }
              receivedContent = true;
            }
          }
          if (errorMessage) break;
        }

        // Result message indicates successful completion
        if (msg.type === 'result') {
          // Stream completed successfully
          break;
        }
      }

      // Determine final authentication state
      if (!errorMessage && !receivedContent) {
        errorMessage = 'No response received from Z.ai. Please check your API key.';
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('[Setup] Z.ai auth verification error:', message);

      // Detect error type from exception message
      const detectedError = detectZaiError(message);
      if (detectedError) {
        errorMessage = detectedError;
      } else if (message.toLowerCase().includes('abort')) {
        errorMessage = 'Verification timed out. Please try again.';
      } else {
        errorMessage = message || 'Authentication failed';
      }
    } finally {
      clearTimeout(timeoutId);
    }

    res.json({
      success: true,
      authenticated: !errorMessage && receivedContent,
      error: errorMessage || undefined,
    });
  };
}
