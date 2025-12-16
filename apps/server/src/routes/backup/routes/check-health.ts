/**
 * Check health route handler - detects .automaker issues and suggests recovery
 */

import { Request, Response } from "express";
import { BackupService } from "../../../services/backup-service.js";
import { GitWatcherService } from "../../../services/git-watcher-service.js";
import { logError, getErrorMessage } from "../common.js";

export function createCheckHealthHandler(
  backupService: BackupService,
  gitWatcher: GitWatcherService
) {
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

      const healthResult = await gitWatcher.checkAndSuggestRecovery(projectPath);
      const stats = await backupService.getStats(projectPath);

      res.json({
        success: true,
        health: {
          healthy: healthResult.healthy,
          issues: healthResult.issues,
          suggestions: healthResult.suggestions,
        },
        backupStats: {
          availableBackups: healthResult.availableBackups,
          validBackups: stats.validBackups,
          newestBackup: stats.newestBackup,
        },
      });
    } catch (error) {
      logError(error, "Check health");
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}
