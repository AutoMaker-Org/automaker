/**
 * POST /verify-codex-auth endpoint - Verify Codex authentication
 */

import type { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import { CODEX_MODEL_MAP } from '@automaker/types';
import { ProviderFactory } from '../../../providers/provider-factory.js';
import { getApiKey } from '../common.js';
import { getCodexAuthIndicators } from '@automaker/platform';
import {
  createSecureAuthEnv,
  AuthSessionManager,
  AuthRateLimiter,
  validateApiKey,
  createTempEnvOverride,
} from '../../../lib/auth-utils.js';

const logger = createLogger('Setup');
const rateLimiter = new AuthRateLimiter();
const OPENAI_API_KEY_ENV = 'OPENAI_API_KEY';
const AUTH_PROMPT = "Reply with only the word 'ok'";
const AUTH_TIMEOUT_MS = 30000;
const ERROR_BILLING_MESSAGE =
  'Credit balance is too low. Please add credits to your OpenAI account.';
const ERROR_RATE_LIMIT_MESSAGE =
  'Rate limit reached. Please wait a while before trying again or upgrade your plan.';
const ERROR_CLI_AUTH_REQUIRED =
  "CLI authentication failed. Please run 'codex login' to authenticate.";
const ERROR_API_KEY_REQUIRED = 'No API key configured. Please enter an API key first.';
const AUTH_ERROR_PATTERNS = [
  'authentication',
  'unauthorized',
  'invalid_api_key',
  'invalid api key',
  'api key is invalid',
  'not authenticated',
  'login',
  'auth(',
  'token refresh',
  'tokenrefresh',
  'failed to parse server response',
  'transport channel closed',
];
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
const RATE_LIMIT_PATTERNS = [
  'limit reached',
  'rate limit',
  'rate_limit',
  'too many requests',
  'resets',
  '429',
];

function containsAuthError(text: string): boolean {
  const lowerText = text.toLowerCase();
  return AUTH_ERROR_PATTERNS.some((pattern) => lowerText.includes(pattern));
}

function isBillingError(text: string): boolean {
  const lowerText = text.toLowerCase();
  return BILLING_ERROR_PATTERNS.some((pattern) => lowerText.includes(pattern));
}

function isRateLimitError(text: string): boolean {
  if (isBillingError(text)) {
    return false;
  }
  const lowerText = text.toLowerCase();
  return RATE_LIMIT_PATTERNS.some((pattern) => lowerText.includes(pattern));
}

export function createVerifyCodexAuthHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    const { authMethod, apiKey } = req.body as {
      authMethod?: 'cli' | 'api_key';
      apiKey?: string;
    };

    // Create session ID for cleanup
    const sessionId = `codex-auth-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Rate limiting
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    if (!rateLimiter.canAttempt(clientIp)) {
      const resetTime = rateLimiter.getResetTime(clientIp);
      res.status(429).json({
        success: false,
        authenticated: false,
        error: 'Too many authentication attempts. Please try again later.',
        resetTime,
      });
      return;
    }

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), AUTH_TIMEOUT_MS);

    try {
      // Create secure environment without modifying process.env
      const authEnv = createSecureAuthEnv(authMethod || 'api_key', apiKey, 'openai');

      // For API key auth, validate and use the provided key or stored key
      if (authMethod === 'api_key') {
        if (apiKey) {
          // Use the provided API key
          const validation = validateApiKey(apiKey, 'openai');
          if (!validation.isValid) {
            res.json({ success: true, authenticated: false, error: validation.error });
            return;
          }
          authEnv[OPENAI_API_KEY_ENV] = validation.normalizedKey;
        } else {
          // Try stored key
          const storedApiKey = getApiKey('openai');
          if (storedApiKey) {
            const validation = validateApiKey(storedApiKey, 'openai');
            if (!validation.isValid) {
              res.json({ success: true, authenticated: false, error: validation.error });
              return;
            }
            authEnv[OPENAI_API_KEY_ENV] = validation.normalizedKey;
          } else if (!authEnv[OPENAI_API_KEY_ENV]) {
            res.json({ success: true, authenticated: false, error: ERROR_API_KEY_REQUIRED });
            return;
          }
        }
      }

      // Create session and temporary environment override
      AuthSessionManager.createSession(sessionId, authMethod || 'api_key', undefined, 'openai');
      const cleanupEnv = createTempEnvOverride(authEnv);

      try {
        if (authMethod === 'cli') {
          const authIndicators = await getCodexAuthIndicators();
          if (!authIndicators.hasOAuthToken && !authIndicators.hasApiKey) {
            res.json({
              success: true,
              authenticated: false,
              error: ERROR_CLI_AUTH_REQUIRED,
            });
            return;
          }
        }

        // Use Codex provider explicitly (not ProviderFactory.getProviderForModel)
        // because Cursor also supports GPT models and has higher priority
        const provider = ProviderFactory.getProviderByName('codex');
        if (!provider) {
          throw new Error('Codex provider not available');
        }
        const stream = provider.executeQuery({
          prompt: AUTH_PROMPT,
          model: CODEX_MODEL_MAP.gpt52Codex,
          cwd: process.cwd(),
          maxTurns: 1,
          allowedTools: [],
          abortController,
        });

        let receivedAnyContent = false;
        let errorMessage = '';

        for await (const msg of stream) {
          if (msg.type === 'error' && msg.error) {
            if (isBillingError(msg.error)) {
              errorMessage = ERROR_BILLING_MESSAGE;
            } else if (isRateLimitError(msg.error)) {
              errorMessage = ERROR_RATE_LIMIT_MESSAGE;
            } else {
              errorMessage = msg.error;
            }
            break;
          }

          if (msg.type === 'assistant' && msg.message?.content) {
            for (const block of msg.message.content) {
              if (block.type === 'text' && block.text) {
                receivedAnyContent = true;
                if (isBillingError(block.text)) {
                  errorMessage = ERROR_BILLING_MESSAGE;
                  break;
                }
                if (isRateLimitError(block.text)) {
                  errorMessage = ERROR_RATE_LIMIT_MESSAGE;
                  break;
                }
                if (containsAuthError(block.text)) {
                  errorMessage = block.text;
                  break;
                }
              }
            }
          }

          if (msg.type === 'result' && msg.result) {
            receivedAnyContent = true;
            if (isBillingError(msg.result)) {
              errorMessage = ERROR_BILLING_MESSAGE;
            } else if (isRateLimitError(msg.result)) {
              errorMessage = ERROR_RATE_LIMIT_MESSAGE;
            } else if (containsAuthError(msg.result)) {
              errorMessage = msg.result;
              break;
            }
          }
        }

        if (errorMessage) {
          // Rate limit and billing errors mean auth succeeded but usage is limited
          const isUsageLimitError =
            errorMessage === ERROR_BILLING_MESSAGE || errorMessage === ERROR_RATE_LIMIT_MESSAGE;

          const response: {
            success: boolean;
            authenticated: boolean;
            error: string;
            details?: string;
          } = {
            success: true,
            authenticated: isUsageLimitError ? true : false,
            error: isUsageLimitError
              ? errorMessage
              : authMethod === 'cli'
                ? ERROR_CLI_AUTH_REQUIRED
                : 'API key is invalid or has been revoked.',
          };

          // Include detailed error for auth failures so users can debug
          if (!isUsageLimitError && errorMessage !== response.error) {
            response.details = errorMessage;
          }

          res.json(response);
          return;
        }

        if (!receivedAnyContent) {
          res.json({
            success: true,
            authenticated: false,
            error: 'No response received from Codex. Please check your authentication.',
          });
          return;
        }

        res.json({ success: true, authenticated: true });
      } finally {
        // Clean up environment override
        cleanupEnv();
      }
    } catch (error: unknown) {
      const errMessage = error instanceof Error ? error.message : String(error);
      logger.error('[Setup] Codex auth verification error:', errMessage);
      const normalizedError = isBillingError(errMessage)
        ? ERROR_BILLING_MESSAGE
        : isRateLimitError(errMessage)
          ? ERROR_RATE_LIMIT_MESSAGE
          : errMessage;
      res.json({
        success: true,
        authenticated: false,
        error: normalizedError,
      });
    } finally {
      clearTimeout(timeoutId);
      // Clean up session
      AuthSessionManager.destroySession(sessionId);
    }
  };
}
