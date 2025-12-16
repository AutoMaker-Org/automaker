/**
 * Restore backup route handler
 */

import { Request, Response } from "express";
import { BackupService } from "../../../services/backup-service.js";
import { logError, getErrorMessage } from "../common.js";

export function createRestoreHandler(backupService: BackupService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, backupId } = req.body;

      if (!projectPath) {
        res.status(400).json({
          success: false,
          error: "projectPath is required",
        });
        return;
      }

      let result;

      if (backupId) {
        // Restore specific backup
        result = await backupService.restoreBackup(projectPath, backupId);
      } else {
        // Restore latest backup
        result = await backupService.restoreLatestBackup(projectPath);
      }

      if (result.success) {
        res.json({
          success: true,
          backupId: result.backupId,
          filesRestored: result.filesRestored,
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      logError(error, "Restore backup");
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}
