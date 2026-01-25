/**
 * GET /dev-server-logs endpoint - Get buffered logs for a worktree's dev server
 *
 * Returns the scrollback buffer containing historical log output for a running
 * dev server. Used by clients to populate the log panel on initial connection
 * before subscribing to real-time updates via WebSocket.
 */

import type { Request, Response } from 'express';
import { getDevServerService } from '../../../services/dev-server-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createGetDevServerLogsHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { worktreePath } = req.query as {
        worktreePath?: string;
      };

      if (!worktreePath) {
        res.status(400).json({
          success: false,
          error: 'worktreePath query parameter is required',
        });
        return;
      }

      const devServerService = getDevServerService();
      const result = devServerService.getServerLogs(worktreePath);

      if (result.success && result.result) {
        res.json({
          success: true,
          result: {
            worktreePath: result.result.worktreePath,
            port: result.result.port,
            url: result.result.url,
            logs: result.result.logs,
            startedAt: result.result.startedAt,
          },
        });
      } else {
        res.status(404).json({
          success: false,
          error: result.error || 'Failed to get dev server logs',
        });
      }
    } catch (error) {
      logError(error, 'Get dev server logs failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
