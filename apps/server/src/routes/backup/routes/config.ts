/**
 * Backup configuration route handler
 */

import { Request, Response } from "express";
import { BackupService } from "../../../services/backup-service.js";
import { GitWatcherService } from "../../../services/git-watcher-service.js";
import { logError, getErrorMessage } from "../common.js";

export function createGetConfigHandler(gitWatcher: GitWatcherService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const config = gitWatcher.getConfig();

      res.json({
        success: true,
        config,
      });
    } catch (error) {
      logError(error, "Get backup config");
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}

export function createUpdateConfigHandler(
  backupService: BackupService,
  gitWatcher: GitWatcherService
) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, retentionCount, enabled, autoRestore, watchedOperations } =
        req.body;

      // Update retention count if provided
      if (projectPath && typeof retentionCount === "number") {
        if (retentionCount < 1 || retentionCount > 100) {
          res.status(400).json({
            success: false,
            error: "retentionCount must be between 1 and 100",
          });
          return;
        }
        await backupService.setRetentionCount(projectPath, retentionCount);
      }

      // Update git watcher config
      const configUpdates: Record<string, unknown> = {};

      if (typeof enabled === "boolean") {
        configUpdates.enabled = enabled;
      }

      if (typeof autoRestore === "boolean") {
        configUpdates.autoRestore = autoRestore;
      }

      if (Array.isArray(watchedOperations)) {
        configUpdates.watchedOperations = watchedOperations;
      }

      if (Object.keys(configUpdates).length > 0) {
        gitWatcher.updateConfig(configUpdates);
      }

      res.json({
        success: true,
        config: gitWatcher.getConfig(),
        message: "Configuration updated successfully",
      });
    } catch (error) {
      logError(error, "Update backup config");
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}
