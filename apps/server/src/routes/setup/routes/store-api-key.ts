/**
 * POST /store-api-key endpoint - Store API key
 */

import type { Request, Response } from 'express';
import { setApiKey, persistApiKeyToEnv, getErrorMessage, logError } from '../common.js';
import { createLogger } from '@automaker/utils';

const logger = createLogger('Setup');
const OPENAI_API_KEY_ENV = 'OPENAI_API_KEY';

export function createStoreApiKeyHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { provider, apiKey } = req.body as {
        provider: string;
        apiKey: string;
      };

      if (!provider || !apiKey) {
        res.status(400).json({ success: false, error: 'provider and apiKey required' });
        return;
      }

      setApiKey(provider, apiKey);

      // Also set as environment variable and persist to .env
      if (provider === 'anthropic' || provider === 'anthropic_oauth_token') {
        // Both API key and OAuth token use ANTHROPIC_API_KEY
        process.env.ANTHROPIC_API_KEY = apiKey;
        await persistApiKeyToEnv('ANTHROPIC_API_KEY', apiKey);
        logger.info('[Setup] Stored API key as ANTHROPIC_API_KEY');
      } else if (provider === 'openai') {
        process.env[OPENAI_API_KEY_ENV] = apiKey;
        await persistApiKeyToEnv(OPENAI_API_KEY_ENV, apiKey);
        logger.info('[Setup] Stored API key as OPENAI_API_KEY');
      } else {
        res.status(400).json({
          success: false,
          error: `Unsupported provider: ${provider}. Only anthropic and openai are supported.`,
        });
        return;
      }

      res.json({ success: true });
    } catch (error) {
      logError(error, 'Store API key failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
