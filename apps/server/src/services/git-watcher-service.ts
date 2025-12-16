/**
 * Git Watcher Service - Monitors git operations and triggers automatic backups
 * Watches for potentially destructive git operations that could affect .automaker folder
 */

import fs from "fs/promises";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { createLogger } from "../lib/logger.js";
import { BackupService, BackupTrigger, BackupResult } from "./backup-service.js";
import { EventEmitter, EventType } from "../lib/events.js";

const logger = createLogger("GitWatcher");
const execAsync = promisify(exec);

// Extend EventType for backup events
export type BackupEventType =
  | "backup:created"
  | "backup:restored"
  | "backup:error"
  | "backup:cleanup"
  | "backup:git-operation-detected";

export interface GitWatcherConfig {
  enabled: boolean;
  watchedOperations: string[];
  preOperationBackup: boolean;
  postOperationCheck: boolean;
  autoRestore: boolean;
}

const DEFAULT_CONFIG: GitWatcherConfig = {
  enabled: true,
  watchedOperations: ["pull", "merge", "checkout", "switch", "rebase", "reset"],
  preOperationBackup: true,
  postOperationCheck: true,
  autoRestore: false, // Disabled by default for safety
};

interface GitOperationResult {
  operation: string;
  success: boolean;
  backupCreated: boolean;
  backupId?: string;
  changesDetected?: boolean;
  autoRestored?: boolean;
  error?: string;
}

export class GitWatcherService {
  private backupService: BackupService;
  private events?: EventEmitter;
  private config: GitWatcherConfig;
  private watchedProjects: Map<string, { lastBackupId?: string }> = new Map();

  constructor(
    backupService: BackupService,
    events?: EventEmitter,
    config: Partial<GitWatcherConfig> = {}
  ) {
    this.backupService = backupService;
    this.events = events;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if a path is inside a git repository
   */
  async isGitRepository(projectPath: string): Promise<boolean> {
    try {
      await execAsync("git rev-parse --is-inside-work-tree", {
        cwd: projectPath,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the current git branch
   */
  async getCurrentBranch(projectPath: string): Promise<string | null> {
    try {
      const { stdout } = await execAsync("git rev-parse --abbrev-ref HEAD", {
        cwd: projectPath,
      });
      return stdout.trim();
    } catch {
      return null;
    }
  }

  /**
   * Get the current git commit hash
   */
  async getCurrentCommit(projectPath: string): Promise<string | null> {
    try {
      const { stdout } = await execAsync("git rev-parse HEAD", {
        cwd: projectPath,
      });
      return stdout.trim();
    } catch {
      return null;
    }
  }

  /**
   * Map git operation to backup trigger
   */
  private mapOperationToTrigger(operation: string): BackupTrigger {
    const triggerMap: Record<string, BackupTrigger> = {
      pull: "git-pull",
      merge: "git-merge",
      checkout: "git-checkout",
      switch: "git-switch",
      rebase: "git-rebase",
    };
    return triggerMap[operation] || "manual";
  }

  /**
   * Emit backup event via the event emitter
   */
  private emitEvent(type: string, payload: unknown): void {
    if (this.events) {
      // Cast to EventType since we're extending it
      this.events.emit(type as EventType, payload);
    }
  }

  /**
   * Pre-operation hook - creates backup before git operation
   */
  async preOperation(
    projectPath: string,
    operation: string
  ): Promise<{ success: boolean; backupId?: string; error?: string }> {
    if (!this.config.enabled || !this.config.preOperationBackup) {
      return { success: true };
    }

    // Check if operation should be watched
    if (!this.config.watchedOperations.includes(operation)) {
      return { success: true };
    }

    logger.info(`Pre-operation backup for ${operation} in ${projectPath}`);

    this.emitEvent("backup:git-operation-detected" as EventType, {
      projectPath,
      operation,
      phase: "pre",
    });

    const trigger = this.mapOperationToTrigger(operation);
    const result = await this.backupService.createBackup(projectPath, trigger);

    if (result.success && result.backupId) {
      // Track the backup for post-operation check
      this.watchedProjects.set(projectPath, { lastBackupId: result.backupId });

      this.emitEvent("backup:created" as EventType, {
        projectPath,
        backupId: result.backupId,
        trigger: operation,
      });
    } else {
      this.emitEvent("backup:error" as EventType, {
        projectPath,
        operation,
        error: result.error,
      });
    }

    return {
      success: result.success,
      backupId: result.backupId,
      error: result.error,
    };
  }

  /**
   * Post-operation hook - checks for changes after git operation
   */
  async postOperation(
    projectPath: string,
    operation: string
  ): Promise<GitOperationResult> {
    const result: GitOperationResult = {
      operation,
      success: true,
      backupCreated: false,
    };

    if (!this.config.enabled || !this.config.postOperationCheck) {
      return result;
    }

    const projectState = this.watchedProjects.get(projectPath);
    const referenceBackupId = projectState?.lastBackupId;

    logger.info(`Post-operation check for ${operation} in ${projectPath}`);

    // Detect changes to .automaker
    const changeResult = await this.backupService.detectChanges(
      projectPath,
      referenceBackupId
    );

    result.changesDetected = changeResult.changed;

    if (changeResult.missing) {
      logger.warn(`.automaker directory is missing after ${operation}`);
      result.success = false;

      // Attempt auto-restore if enabled
      if (this.config.autoRestore && referenceBackupId) {
        const restoreResult = await this.backupService.restoreBackup(
          projectPath,
          referenceBackupId
        );

        if (restoreResult.success) {
          logger.info(`Auto-restored .automaker from ${referenceBackupId}`);
          result.autoRestored = true;

          this.emitEvent("backup:restored" as EventType, {
            projectPath,
            backupId: referenceBackupId,
            trigger: "auto",
          });
        } else {
          result.error = `Auto-restore failed: ${restoreResult.error}`;
          this.emitEvent("backup:error" as EventType, {
            projectPath,
            operation: "auto-restore",
            error: restoreResult.error,
          });
        }
      } else {
        result.error = ".automaker directory is missing. Manual restoration may be required.";
      }
    } else if (changeResult.changed) {
      logger.info(`.automaker directory changed after ${operation}: ${changeResult.details}`);
    }

    // Clean up tracked state
    this.watchedProjects.delete(projectPath);

    return result;
  }

  /**
   * Execute a git operation with automatic backup
   * This wraps the git operation with pre/post hooks
   */
  async executeWithBackup(
    projectPath: string,
    operation: string,
    gitArgs: string[]
  ): Promise<{
    success: boolean;
    output?: string;
    backup?: BackupResult;
    postCheck?: GitOperationResult;
    error?: string;
  }> {
    // Verify it's a git repository
    if (!(await this.isGitRepository(projectPath))) {
      return {
        success: false,
        error: "Not a git repository",
      };
    }

    // Pre-operation backup
    const preResult = await this.preOperation(projectPath, operation);
    const backup = preResult.backupId
      ? await this.backupService.getBackup(projectPath, preResult.backupId)
      : undefined;

    // Execute git operation
    let gitOutput: string;
    let gitSuccess: boolean;
    let gitError: string | undefined;

    try {
      const command = `git ${operation} ${gitArgs.join(" ")}`;
      const { stdout, stderr } = await execAsync(command, {
        cwd: projectPath,
        maxBuffer: 10 * 1024 * 1024,
      });
      gitOutput = stdout + (stderr ? `\n${stderr}` : "");
      gitSuccess = true;
    } catch (error: any) {
      gitOutput = error.stdout || "";
      gitError = error.stderr || error.message;
      gitSuccess = false;
    }

    // Post-operation check
    const postCheck = await this.postOperation(projectPath, operation);

    return {
      success: gitSuccess && postCheck.success,
      output: gitOutput,
      backup: backup
        ? {
            success: true,
            backupId: backup.id,
            metadata: backup,
          }
        : undefined,
      postCheck,
      error: gitError || postCheck.error,
    };
  }

  /**
   * Check .automaker status and suggest recovery if needed
   */
  async checkAndSuggestRecovery(
    projectPath: string
  ): Promise<{
    healthy: boolean;
    issues: string[];
    suggestions: string[];
    availableBackups: number;
  }> {
    const issues: string[] = [];
    const suggestions: string[] = [];

    // Check for .automaker existence and structure
    const changeResult = await this.backupService.detectChanges(projectPath);

    if (changeResult.missing) {
      issues.push(".automaker directory is missing");
      suggestions.push("Restore from a recent backup using the restore command");
    } else if (changeResult.changed && changeResult.details) {
      issues.push(changeResult.details);
    }

    // Get available backups
    const backups = await this.backupService.listBackups(projectPath);
    const validBackups = backups.filter((b) => b.valid);

    if (issues.length > 0 && validBackups.length > 0) {
      const latestBackup = validBackups[0];
      suggestions.push(
        `Latest backup available: ${latestBackup.id} from ${latestBackup.timestamp}`
      );
    }

    if (validBackups.length === 0 && issues.length > 0) {
      suggestions.push("No valid backups available. Consider initializing the project again.");
    }

    return {
      healthy: issues.length === 0,
      issues,
      suggestions,
      availableBackups: validBackups.length,
    };
  }

  /**
   * Register a project for watching
   */
  registerProject(projectPath: string): void {
    if (!this.watchedProjects.has(projectPath)) {
      this.watchedProjects.set(projectPath, {});
      logger.debug(`Registered project for watching: ${projectPath}`);
    }
  }

  /**
   * Unregister a project from watching
   */
  unregisterProject(projectPath: string): void {
    this.watchedProjects.delete(projectPath);
    logger.debug(`Unregistered project from watching: ${projectPath}`);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<GitWatcherConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info("GitWatcher configuration updated");
  }

  /**
   * Get current configuration
   */
  getConfig(): GitWatcherConfig {
    return { ...this.config };
  }

  /**
   * Enable or disable the watcher
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    logger.info(`GitWatcher ${enabled ? "enabled" : "disabled"}`);
  }

  /**
   * Enable or disable auto-restore
   */
  setAutoRestore(enabled: boolean): void {
    this.config.autoRestore = enabled;
    logger.info(`Auto-restore ${enabled ? "enabled" : "disabled"}`);
  }
}
