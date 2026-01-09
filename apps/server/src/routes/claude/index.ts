import { Router, Request, Response } from 'express';
import { ClaudeUsageService } from '../../services/claude-usage-service.js';
import { createLogger } from '@automaker/utils';

const logger = createLogger('Claude');

export function createClaudeRoutes(service: ClaudeUsageService): Router {
  const router = Router();

  // Get current usage (fetches from Claude CLI)
  router.get('/usage', async (req: Request, res: Response) => {
    try {
      // Check if Claude CLI is available first
      const isAvailable = await service.isAvailable();
      if (!isAvailable) {
        // IMPORTANT: This endpoint is behind Automaker session auth already.
        // Use a 200 + error payload for Claude CLI issues so the UI doesn't
        // interpret it as an invalid Automaker session (401/403 triggers logout).
        res.status(200).json({
          error: 'Claude CLI not found',
          message: "Please install Claude Code CLI and run 'claude login' to authenticate",
        });
        return;
      }

      const usage = await service.fetchUsageData();
      res.json(usage);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      if (message.includes('Authentication required') || message.includes('token_expired')) {
        // Do NOT use 401/403 here: that status code is reserved for Automaker session auth.
        res.status(200).json({
          error: 'Authentication required',
          message: "Please run 'claude login' to authenticate",
        });
      } else if (message.includes('timed out')) {
        res.status(200).json({
          error: 'Command timed out',
          message: 'The Claude CLI took too long to respond',
        });
      } else {
        logger.error('Error fetching usage:', error);
        res.status(500).json({ error: message });
      }
    }
  });

  return router;
}
