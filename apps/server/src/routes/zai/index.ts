import { Router, Request, Response } from 'express';
import { ZaiUsageService } from '../../services/zai-usage-service.js';
import type { SettingsService } from '../../services/settings-service.js';
import { createLogger } from '@automaker/utils';

const logger = createLogger('Zai');

export function createZaiRoutes(
  usageService: ZaiUsageService,
  settingsService: SettingsService
): Router {
  const router = Router();

  // Initialize z.ai API token from credentials on startup
  (async () => {
    try {
      const credentials = await settingsService.getCredentials();
      if (credentials.apiKeys?.zai) {
        usageService.setApiToken(credentials.apiKeys.zai);
        logger.info('[init] Loaded z.ai API key from credentials');
      }
    } catch (error) {
      logger.error('[init] Failed to load z.ai API key from credentials:', error);
    }
  })();

  // Get current usage (fetches from z.ai API)
  router.get('/usage', async (_req: Request, res: Response) => {
    try {
      // Check if z.ai API is configured
      const isAvailable = usageService.isAvailable();
      if (!isAvailable) {
        // Use a 200 + error payload so the UI doesn't interpret it as session auth error
        res.status(200).json({
          error: 'z.ai API not configured',
          message: 'Set Z_AI_API_KEY environment variable to enable z.ai usage tracking',
        });
        return;
      }

      const usage = await usageService.fetchUsageData();
      res.json(usage);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      if (message.includes('not configured') || message.includes('API token')) {
        res.status(200).json({
          error: 'API token required',
          message: 'Set Z_AI_API_KEY environment variable to enable z.ai usage tracking',
        });
      } else if (message.includes('failed') || message.includes('request')) {
        res.status(200).json({
          error: 'API request failed',
          message: message,
        });
      } else {
        logger.error('Error fetching z.ai usage:', error);
        res.status(500).json({ error: message });
      }
    }
  });

  // Configure API token (for settings page)
  router.post('/configure', async (req: Request, res: Response) => {
    try {
      const { apiToken, apiHost } = req.body;

      if (apiToken !== undefined) {
        // Set in-memory token
        usageService.setApiToken(apiToken || '');

        // Persist to credentials (deep merge happens in updateCredentials)
        try {
          await settingsService.updateCredentials({
            apiKeys: { zai: apiToken || '' },
          } as Parameters<typeof settingsService.updateCredentials>[0]);
          logger.info('[configure] Saved z.ai API key to credentials');
        } catch (persistError) {
          logger.error('[configure] Failed to persist z.ai API key:', persistError);
        }
      }

      if (apiHost) {
        usageService.setApiHost(apiHost);
      }

      res.json({
        success: true,
        message: 'z.ai configuration updated',
        isAvailable: usageService.isAvailable(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error configuring z.ai:', error);
      res.status(500).json({ error: message });
    }
  });

  // Verify API key without storing it (for testing in settings)
  router.post('/verify', async (req: Request, res: Response) => {
    try {
      const { apiKey } = req.body;

      if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
        res.json({
          success: false,
          authenticated: false,
          error: 'Please provide an API key to test.',
        });
        return;
      }

      // Test the key by making a request to z.ai API
      const quotaUrl =
        process.env.Z_AI_QUOTA_URL ||
        `${process.env.Z_AI_API_HOST ? `https://${process.env.Z_AI_API_HOST}` : 'https://api.z.ai'}/api/monitor/usage/quota/limit`;

      logger.info(`[verify] Testing API key against: ${quotaUrl}`);

      const response = await fetch(quotaUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey.trim()}`,
          Accept: 'application/json',
        },
      });

      if (response.ok) {
        res.json({
          success: true,
          authenticated: true,
          message: 'Connection successful! z.ai API responded.',
        });
      } else if (response.status === 401 || response.status === 403) {
        res.json({
          success: false,
          authenticated: false,
          error: 'Invalid API key. Please check your key and try again.',
        });
      } else {
        res.json({
          success: false,
          authenticated: false,
          error: `API request failed: ${response.status} ${response.statusText}`,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error verifying z.ai API key:', error);
      res.json({
        success: false,
        authenticated: false,
        error: `Network error: ${message}`,
      });
    }
  });

  // Check if z.ai is available
  router.get('/status', async (_req: Request, res: Response) => {
    try {
      const isAvailable = usageService.isAvailable();
      const hasEnvApiKey = Boolean(process.env.Z_AI_API_KEY);
      const hasApiKey = usageService.getApiToken() !== null;

      res.json({
        success: true,
        available: isAvailable,
        hasApiKey,
        hasEnvApiKey,
        message: isAvailable ? 'z.ai API is configured' : 'z.ai API token not configured',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ success: false, error: message });
    }
  });

  return router;
}
