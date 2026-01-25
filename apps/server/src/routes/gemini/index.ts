import { Router, Request, Response } from 'express';
import { GeminiProvider } from '../../providers/gemini-provider.js';
import { getGeminiUsageService } from '../../services/gemini-usage-service.js';
import { createLogger } from '@automaker/utils';

const logger = createLogger('Gemini');

export function createGeminiRoutes(): Router {
  const router = Router();

  // Get current usage/quota data from Google Cloud API
  router.get('/usage', async (_req: Request, res: Response) => {
    try {
      const usageService = getGeminiUsageService();
      const usageData = await usageService.fetchUsageData();

      res.json(usageData);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error fetching Gemini usage:', error);

      // Return error in a format the UI expects
      res.status(200).json({
        authenticated: false,
        authMethod: 'none',
        usedPercent: 0,
        remainingPercent: 100,
        lastUpdated: new Date().toISOString(),
        error: `Failed to fetch Gemini usage: ${message}`,
      });
    }
  });

  // Check if Gemini is available
  router.get('/status', async (_req: Request, res: Response) => {
    try {
      const provider = new GeminiProvider();
      const status = await provider.detectInstallation();

      const authMethod =
        (status as any).authMethod ||
        (status.authenticated ? (status.hasApiKey ? 'api_key' : 'cli_login') : 'none');

      res.json({
        success: true,
        installed: status.installed,
        version: status.version || null,
        path: status.path || null,
        authenticated: status.authenticated || false,
        authMethod,
        hasCredentialsFile: (status as any).hasCredentialsFile || false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ success: false, error: message });
    }
  });

  return router;
}
