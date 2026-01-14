import { Router, Request, Response } from 'express';
import { CodexUsageService } from '../../services/codex-usage-service.js';
import { CodexModelCacheService } from '../../services/codex-model-cache-service.js';
import { createLogger } from '@automaker/utils';

const logger = createLogger('Codex');

export function createCodexRoutes(
  usageService: CodexUsageService,
  modelCacheService: CodexModelCacheService
): Router {
  const router = Router();

  // Get current usage (attempts to fetch from Codex CLI)
  router.get('/usage', async (_req: Request, res: Response) => {
    try {
      // Check if Codex CLI is available first
      const isAvailable = await usageService.isAvailable();
      if (!isAvailable) {
        // IMPORTANT: This endpoint is behind Automaker session auth already.
        // Use a 200 + error payload for Codex CLI issues so the UI doesn't
        // interpret it as an invalid Automaker session (401/403 triggers logout).
        res.status(200).json({
          error: 'Codex CLI not found',
          message: "Please install Codex CLI and run 'codex login' to authenticate",
        });
        return;
      }

      const usage = await usageService.fetchUsageData();
      res.json(usage);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      if (message.includes('not authenticated') || message.includes('login')) {
        // Do NOT use 401/403 here: that status code is reserved for Automaker session auth.
        res.status(200).json({
          error: 'Authentication required',
          message: "Please run 'codex login' to authenticate",
        });
      } else if (message.includes('not available') || message.includes('does not provide')) {
        // This is the expected case - Codex doesn't provide usage stats
        res.status(200).json({
          error: 'Usage statistics not available',
          message: message,
        });
      } else if (message.includes('timed out')) {
        res.status(200).json({
          error: 'Command timed out',
          message: 'The Codex CLI took too long to respond',
        });
      } else {
        logger.error('Error fetching usage:', error);
        res.status(500).json({ error: message });
      }
    }
  });

  // Get available Codex models (cached)
  router.get('/models', async (req: Request, res: Response) => {
    try {
      const forceRefresh = req.query.refresh === 'true';
      const { models, cachedAt } = await modelCacheService.getModelsWithMetadata(forceRefresh);

      if (models.length === 0) {
        res.status(503).json({
          success: false,
          error: 'Codex CLI not available or not authenticated',
          message: "Please install Codex CLI and run 'codex login' to authenticate",
        });
        return;
      }

      res.json({
        success: true,
        models,
        cachedAt,
      });
    } catch (error) {
      logger.error('Error fetching models:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({
        success: false,
        error: message,
      });
    }
  });

  return router;
}
