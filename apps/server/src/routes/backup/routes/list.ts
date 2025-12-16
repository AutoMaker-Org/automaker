/**
 * List backups route handler
 */

import { Request, Response } from "express";
import { BackupService } from "../../../services/backup-service.js";
import { logError, getErrorMessage } from "../common.js";

export function createListHandler(backupService: BackupService) {
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

      const backups = await backupService.listBackups(projectPath);

      res.json({
        success: true,
        backups,
        count: backups.length,
      });
    } catch (error) {
      logError(error, "List backups");
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}
