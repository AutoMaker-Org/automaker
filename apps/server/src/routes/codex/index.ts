import { Router, Request, Response } from 'express';
import { CodexUsageService } from '../../services/codex-usage-service.js';

const AUTH_ERROR_PATTERNS = [
  'authentication',
  'not authenticated',
  'unauthorized',
  'login',
  'authorization',
  'token',
  'invalid_api_key',
  'invalid api key',
];

function isAuthError(message: string): boolean {
  const lower = message.toLowerCase();
  return AUTH_ERROR_PATTERNS.some((pattern) => lower.includes(pattern));
}

export function createCodexRoutes(service: CodexUsageService): Router {
  const router = Router();

  router.get('/usage', async (_req: Request, res: Response) => {
    try {
      const isAvailable = await service.isAvailable();
      if (!isAvailable) {
        res.status(503).json({
          error: 'Codex CLI not found',
          message: "Please install Codex CLI and run 'codex login' to authenticate",
        });
        return;
      }

      const usage = await service.fetchUsageData();
      res.json(usage);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      if (isAuthError(message)) {
        res.status(401).json({
          error: 'Authentication required',
          message: "Please run 'codex login' to authenticate",
        });
      } else if (message.includes('timed out')) {
        res.status(504).json({
          error: 'Command timed out',
          message: 'The Codex CLI took too long to respond',
        });
      } else {
        console.error('Error fetching Codex usage:', error);
        res.status(500).json({ error: message });
      }
    }
  });

  return router;
}
