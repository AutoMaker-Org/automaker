/**
 * Create backup route handler
 */

import { Request, Response } from "express";
import { BackupService, BackupTrigger } from "../../../services/backup-service.js";
import { logError, getErrorMessage } from "../common.js";

export function createCreateHandler(backupService: BackupService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, trigger = "manual" } = req.body;

      if (!projectPath) {
        res.status(400).json({
          success: false,
          error: "projectPath is required",
        });
        return;
      }

      const validTriggers: BackupTrigger[] = [
        "manual",
        "git-pull",
        "git-merge",
        "git-checkout",
        "git-switch",
        "git-rebase",
        "scheduled",
        "auto-restore",
      ];

      if (!validTriggers.includes(trigger as BackupTrigger)) {
        res.status(400).json({
          success: false,
          error: `Invalid trigger. Valid triggers: ${validTriggers.join(", ")}`,
        });
        return;
      }

      const result = await backupService.createBackup(
        projectPath,
        trigger as BackupTrigger
      );

      if (result.success) {
        res.json({
          success: true,
          backupId: result.backupId,
          metadata: result.metadata,
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      logError(error, "Create backup");
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}
