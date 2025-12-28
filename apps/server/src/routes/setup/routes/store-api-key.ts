/**
 * POST /store-api-key endpoint - Store API key
 */

import type { Request, Response } from 'express';
import {
  setApiKey,
  persistApiKeyToEnv,
  getErrorMessage,
  logError,
  getProviderEnvKey,
  isSupportedProvider,
} from '../common.js';
import { createLogger } from '@automaker/utils';

const logger = createLogger('Setup');

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

      // Validate provider against registry
      const envKey = getProviderEnvKey(provider);
      if (!envKey) {
        res.status(400).json({
          success: false,
          error: `Unsupported provider: ${provider}. Supported providers: anthropic, zai.`,
        });
        return;
      }

      setApiKey(provider, apiKey);

      // Set as environment variable and persist to .env
      process.env[envKey] = apiKey;
      await persistApiKeyToEnv(envKey, apiKey);
      logger.info(`[Setup] Stored API key as ${envKey}`);

      res.json({ success: true });
    } catch (error) {
      logError(error, 'Store API key failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
