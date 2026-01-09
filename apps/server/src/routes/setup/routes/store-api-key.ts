/**
 * POST /store-api-key endpoint - Store API key
 */

import type { Request, Response } from 'express';
import { setApiKey, persistApiKeyToEnv, getErrorMessage, logError } from '../common.js';
import { createLogger } from '@automaker/utils';
import type { SettingsService } from '../../../services/settings-service.js';

const logger = createLogger('Setup');

export function createStoreApiKeyHandler(settingsService: SettingsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { provider, apiKey, baseUrl } = req.body as {
        provider: string;
        apiKey: string;
        baseUrl?: string;
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

        // Handle custom base URL if provided
        if (baseUrl && baseUrl.trim()) {
          process.env.ANTHROPIC_BASE_URL = baseUrl.trim();
          await persistApiKeyToEnv('ANTHROPIC_BASE_URL', baseUrl.trim());
          logger.info('[Setup] Stored custom base URL as ANTHROPIC_BASE_URL');
        } else if (process.env.ANTHROPIC_BASE_URL) {
          // Clear existing base URL if not provided
          delete process.env.ANTHROPIC_BASE_URL;
          // Note: we don't remove from .env file as that's more complex
          logger.info('[Setup] Cleared ANTHROPIC_BASE_URL from environment');
        }

        // Persist base URL to settings service
        if (baseUrl !== undefined) {
          await settingsService.updateCredentials({
            baseUrls: {
              anthropic: baseUrl.trim() || undefined,
            },
          });
          logger.info('[Setup] Persisted base URL to settings service');
        }
      } else {
        res.status(400).json({
          success: false,
          error: `Unsupported provider: ${provider}. Only anthropic is supported.`,
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
