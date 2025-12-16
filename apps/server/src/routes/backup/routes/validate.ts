/**
 * Validate backup route handler
 */

import { Request, Response } from "express";
import { BackupService } from "../../../services/backup-service.js";
import { logError, getErrorMessage } from "../common.js";

export function createValidateHandler(backupService: BackupService) {
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

      const isValid = await backupService.validateBackup(projectPath, backupId);

      res.json({
        success: true,
        backupId,
        valid: isValid,
        message: isValid
          ? "Backup integrity verified"
          : "Backup integrity check failed - backup may be corrupted",
      });
    } catch (error) {
      logError(error, "Validate backup");
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}
