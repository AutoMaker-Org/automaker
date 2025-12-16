/**
 * Backup stats route handler
 */

import { Request, Response } from "express";
import { BackupService } from "../../../services/backup-service.js";
import { logError, getErrorMessage } from "../common.js";

export function createStatsHandler(backupService: BackupService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body;

      if (!projectPath) {
        res.status(400).json({
          success: false,
          error: "projectPath is required",
        });
        return;
      }

      const stats = await backupService.getStats(projectPath);

      res.json({
        success: true,
        stats,
      });
    } catch (error) {
      logError(error, "Get backup stats");
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}
