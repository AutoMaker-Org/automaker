/**
 * Delete backup route handler
 */

import { Request, Response } from "express";
import { BackupService } from "../../../services/backup-service.js";
import { logError, getErrorMessage } from "../common.js";

export function createDeleteHandler(backupService: BackupService) {
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

      if (!backupId) {
        res.status(400).json({
          success: false,
          error: "backupId is required",
        });
        return;
      }

      const success = await backupService.deleteBackup(projectPath, backupId);

      if (success) {
        res.json({
          success: true,
          message: `Backup ${backupId} deleted successfully`,
        });
      } else {
        res.status(500).json({
          success: false,
          error: `Failed to delete backup ${backupId}`,
        });
      }
    } catch (error) {
      logError(error, "Delete backup");
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}
