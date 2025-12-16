/**
 * Backup routes - HTTP API for backup and restore operations
 */

import { Router } from "express";
import { BackupService } from "../../services/backup-service.js";
import { GitWatcherService } from "../../services/git-watcher-service.js";
import { createCreateHandler } from "./routes/create.js";
import { createListHandler } from "./routes/list.js";
import { createRestoreHandler } from "./routes/restore.js";
import { createDeleteHandler } from "./routes/delete.js";
import { createValidateHandler } from "./routes/validate.js";
import { createStatsHandler } from "./routes/stats.js";
import { createCheckHealthHandler } from "./routes/check-health.js";
import { createGetConfigHandler, createUpdateConfigHandler } from "./routes/config.js";

export interface BackupRoutesDependencies {
  backupService: BackupService;
  gitWatcher: GitWatcherService;
}

export function createBackupRoutes(deps: BackupRoutesDependencies): Router {
  const router = Router();
  const { backupService, gitWatcher } = deps;

  // Backup CRUD operations
  router.post("/create", createCreateHandler(backupService));
  router.post("/list", createListHandler(backupService));
  router.post("/restore", createRestoreHandler(backupService));
  router.post("/delete", createDeleteHandler(backupService));

  // Validation and stats
  router.post("/validate", createValidateHandler(backupService));
  router.post("/stats", createStatsHandler(backupService));

  // Health check and recovery suggestions
  router.post("/check-health", createCheckHealthHandler(backupService, gitWatcher));

  // Configuration
  router.get("/config", createGetConfigHandler(gitWatcher));
  router.post("/config", createUpdateConfigHandler(backupService, gitWatcher));

  return router;
}

// Re-export services for convenience
export { BackupService } from "../../services/backup-service.js";
export { GitWatcherService } from "../../services/git-watcher-service.js";
