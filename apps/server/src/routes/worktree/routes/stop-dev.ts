/**
 * POST /stop-dev endpoint - Stop a dev server for a worktree
 *
 * Stops the development server running for a specific worktree,
 * freeing up the ports for reuse.
 */

import type { Request, Response } from "express";
import { getDevServerService } from "../../../services/dev-server-service.js";
import { getErrorMessage, logError } from "../common.js";

export function createStopDevHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { worktreePath } = req.body as {
        worktreePath: string;
      };

      if (!worktreePath) {
        res.status(400).json({
          success: false,
          error: "worktreePath is required",
        });
        return;
      }

      const devServerService = getDevServerService();
      const result = await devServerService.stopDevServer(worktreePath);

      if (result.success && result.result) {
        res.json({
          success: true,
          result: {
            worktreePath: result.result.worktreePath,
            message: result.result.message,
          },
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error || "Failed to stop dev server",
        });
      }
    } catch (error) {
      logError(error, "Stop dev server failed");
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
