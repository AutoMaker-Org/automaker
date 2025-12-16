/**
 * POST /start-dev endpoint - Start a dev server for a worktree
 *
 * Spins up a development server (npm run dev) in the worktree directory
 * on a unique port, allowing preview of the worktree's changes without
 * affecting the main dev server.
 */

import type { Request, Response } from "express";
import { getDevServerService } from "../../../services/dev-server-service.js";
import { getErrorMessage, logError } from "../common.js";

export function createStartDevHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, worktreePath } = req.body as {
        projectPath: string;
        worktreePath: string;
      };

      if (!projectPath) {
        res.status(400).json({
          success: false,
          error: "projectPath is required",
        });
        return;
      }

      if (!worktreePath) {
        res.status(400).json({
          success: false,
          error: "worktreePath is required",
        });
        return;
      }

      const devServerService = getDevServerService();
      const result = await devServerService.startDevServer(projectPath, worktreePath);

      if (result.success && result.result) {
        res.json({
          success: true,
          result: {
            worktreePath: result.result.worktreePath,
            port: result.result.port,
            url: result.result.url,
            message: result.result.message,
          },
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error || "Failed to start dev server",
        });
      }
    } catch (error) {
      logError(error, "Start dev server failed");
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
