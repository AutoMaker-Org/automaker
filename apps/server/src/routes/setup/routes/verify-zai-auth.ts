/**
 * POST /verify-zai-auth endpoint - Verify Z.AI authentication by running a test query
 * Tests the Z.AI API key by making a minimal query with the custom endpoint
 */

import type { Request, Response } from 'express';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { createLogger } from '@automaker/utils';
import { getApiKey } from '../common.js';

const logger = createLogger('Setup');

// Known error patterns that indicate auth failure
const AUTH_ERROR_PATTERNS = [
  'invalid_api_key',
  'authentication_error',
  'unauthorized',
  'not authenticated',
  'authentication failed',
  'invalid api key',
  'api key is invalid',
  '401',
];

// Patterns that indicate billing/credit issues - should FAIL verification
const BILLING_ERROR_PATTERNS = [
  'credit balance is too low',
  'credit balance too low',
  'insufficient credits',
  'insufficient balance',
  'no credits',
  'out of credits',
  'billing',
  'payment required',
  'add credits',
];

// Patterns that indicate rate/usage limits - should FAIL verification
const RATE_LIMIT_PATTERNS = [
  'limit reached',
  'rate limit',
  'rate_limit',
  'resets', // Only valid if it's a temporary reset, not a billing issue
  '/upgrade',
  'extra-usage',
];

function isRateLimitError(text: string): boolean {
  const lowerText = text.toLowerCase();
  // First check if it's a billing error - billing errors are NOT rate limits
  if (isBillingError(text)) {
    return false;
  }
  return RATE_LIMIT_PATTERNS.some((pattern) => lowerText.includes(pattern.toLowerCase()));
}

function isBillingError(text: string): boolean {
  const lowerText = text.toLowerCase();
  return BILLING_ERROR_PATTERNS.some((pattern) => lowerText.includes(pattern.toLowerCase()));
}

function containsAuthError(text: string): boolean {
  const lowerText = text.toLowerCase();
  return AUTH_ERROR_PATTERNS.some((pattern) => lowerText.includes(pattern.toLowerCase()));
}

export function createVerifyZaiAuthHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      logger.info('[Setup] Verifying Z.AI authentication');

      // Create an AbortController with a 2-minute timeout
      // Note: On Windows, the Claude CLI initialization can take 60-90+ seconds
      // due to slow `tasklist | findstr` process enumeration for IDE detection
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), 120000);

      let authenticated = false;
      let errorMessage = '';
      let receivedAnyContent = false;

      // Save original env values
      const originalBaseUrl = process.env.ANTHROPIC_BASE_URL;
      const originalApiKey = process.env.ANTHROPIC_API_KEY;
      const originalAuthToken = process.env.ANTHROPIC_AUTH_TOKEN;

      try {
        // Get the Z.AI API key - prefer the one passed in request body for testing unsaved keys
        const { apiKey: requestApiKey } = req.body as { apiKey?: string };
        const zaiApiKey = requestApiKey || getApiKey('zai');
        if (!zaiApiKey) {
          res.json({
            success: true,
            authenticated: false,
            error: 'No Z.AI API key configured. Please enter an API key first.',
          });
          return;
        }

        logger.info('[Setup] Using Z.AI API key for verification');

        // Configure environment for Z.AI
        // Based on Z.AI docs: https://docs.z.ai/devpack/tool/claude
        process.env.ANTHROPIC_BASE_URL = 'https://api.z.ai/api/anthropic';
        process.env.ANTHROPIC_AUTH_TOKEN = zaiApiKey;
        // Clear the regular API key to avoid conflicts
        delete process.env.ANTHROPIC_API_KEY;

        // Run a minimal query to verify authentication
        const stream = query({
          prompt: "Reply with only the word 'ok'",
          options: {
            model: 'GLM-4.7',
            maxTurns: 1,
            allowedTools: [],
            abortController,
          },
        });

        // Collect all messages and check for errors
        const allMessages: string[] = [];

        for await (const msg of stream) {
          const msgStr = JSON.stringify(msg);
          allMessages.push(msgStr);
          logger.info('[Setup] Stream message:', msgStr.substring(0, 500));

          // Check for billing errors FIRST - these should fail verification
          if (isBillingError(msgStr)) {
            logger.error('[Setup] Found billing error in message');
            errorMessage =
              'Credit balance is too low. Please add credits to your Z.AI account at docs.z.ai';
            authenticated = false;
            break;
          }

          // Check if any part of the message contains auth errors
          if (containsAuthError(msgStr)) {
            logger.error('[Setup] Found auth error in message');
            errorMessage = 'Z.AI API key is invalid or has been revoked.';
            break;
          }

          // Check specifically for assistant messages with text content
          if (msg.type === 'assistant' && (msg as any).message?.content) {
            const content = (msg as any).message.content;
            if (Array.isArray(content)) {
              for (const block of content) {
                if (block.type === 'text' && block.text) {
                  const text = block.text;
                  logger.info('[Setup] Assistant text:', text);

                  if (containsAuthError(text)) {
                    errorMessage = 'Z.AI API key is invalid or has been revoked.';
                    break;
                  }

                  // Valid text response that's not an error
                  if (text.toLowerCase().includes('ok') || text.length > 0) {
                    receivedAnyContent = true;
                  }
                }
              }
            }
          }

          // Check for result messages
          if (msg.type === 'result') {
            const resultStr = JSON.stringify(msg);

            // First check for billing errors - these should FAIL verification
            if (isBillingError(resultStr)) {
              logger.error('[Setup] Billing error detected - insufficient credits');
              errorMessage =
                'Credit balance is too low. Please add credits to your Z.AI account at docs.z.ai';
              authenticated = false;
              break;
            }
            // Check if it's a rate limit error - should FAIL verification
            else if (isRateLimitError(resultStr)) {
              logger.warn('[Setup] Rate limit detected - treating as unverified');
              errorMessage =
                'Rate limit reached. Please wait a while before trying again or upgrade your plan.';
              authenticated = false;
              break;
            } else if (containsAuthError(resultStr)) {
              errorMessage = 'Z.AI API key is invalid or has been revoked.';
            } else {
              // Got a result without errors
              receivedAnyContent = true;
            }
          }
        }

        // Determine authentication status
        if (errorMessage) {
          authenticated = false;
        } else if (receivedAnyContent) {
          authenticated = true;
        } else {
          // No content received - might be an issue
          logger.warn('[Setup] No content received from stream');
          logger.warn('[Setup] All messages:', allMessages.join('\n'));
          errorMessage = 'No response received from Z.AI. Please check your authentication.';
        }
      } catch (error: unknown) {
        const errMessage = error instanceof Error ? error.message : String(error);

        logger.error('[Setup] Z.AI auth verification exception:', errMessage);

        // Check for billing errors FIRST - these always fail
        if (isBillingError(errMessage)) {
          authenticated = false;
          errorMessage =
            'Credit balance is too low. Please add credits to your Z.AI account at docs.z.ai';
        }
        // Check for rate limit in exception - should FAIL verification
        else if (isRateLimitError(errMessage)) {
          authenticated = false;
          errorMessage =
            'Rate limit reached. Please wait a while before trying again or upgrade your plan.';
          logger.warn('[Setup] Rate limit in exception - treating as unverified');
        }
        // If we already determined auth was successful, keep it
        else if (authenticated) {
          logger.info('[Setup] Auth already confirmed, ignoring exception');
        }
        // Check for auth-related errors in exception
        else if (containsAuthError(errMessage)) {
          errorMessage = 'Z.AI API key is invalid or has been revoked.';
        } else if (errMessage.includes('abort') || errMessage.includes('timeout')) {
          errorMessage = 'Verification timed out. Please try again.';
        } else if (errMessage.includes('exit') && errMessage.includes('code 1')) {
          // Process exited with code 1 but we might have gotten rate limit info in the stream
          // Check if we received any content that indicated auth worked
          if (receivedAnyContent && !errorMessage) {
            authenticated = true;
            logger.info('[Setup] Process exit 1 but content received - auth valid');
          } else if (!errorMessage) {
            errorMessage = errMessage;
          }
        } else if (!errorMessage) {
          errorMessage = errMessage;
        }
      } finally {
        clearTimeout(timeoutId);
        // Restore original environment
        if (originalBaseUrl !== undefined) {
          process.env.ANTHROPIC_BASE_URL = originalBaseUrl;
        } else {
          delete process.env.ANTHROPIC_BASE_URL;
        }
        if (originalApiKey !== undefined) {
          process.env.ANTHROPIC_API_KEY = originalApiKey;
        } else {
          delete process.env.ANTHROPIC_API_KEY;
        }
        if (originalAuthToken !== undefined) {
          process.env.ANTHROPIC_AUTH_TOKEN = originalAuthToken;
        } else {
          delete process.env.ANTHROPIC_AUTH_TOKEN;
        }
      }

      logger.info('[Setup] Z.AI verification result:', {
        authenticated,
        errorMessage,
      });

      res.json({
        success: true,
        authenticated,
        error: errorMessage || undefined,
      });
    } catch (error) {
      logger.error('[Setup] Verify Z.AI auth endpoint error:', error);
      res.status(500).json({
        success: false,
        authenticated: false,
        error: error instanceof Error ? error.message : 'Verification failed',
      });
    }
  };
}
