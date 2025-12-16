/**
 * Backup Service - Handles backup and restore of .automaker configuration folder
 * Provides automatic backup before git operations and manual backup/restore commands
 */

import path from "path";
import fs from "fs/promises";
import crypto from "crypto";
import { createLogger } from "../lib/logger.js";

const logger = createLogger("BackupService");

export interface BackupMetadata {
  id: string;
  timestamp: string;
  projectPath: string;
  trigger: BackupTrigger;
  fileCount: number;
  totalSize: number;
  checksum: string;
  valid: boolean;
}

export interface BackupManifest {
  version: number;
  backups: BackupMetadata[];
  retentionCount: number;
  lastCleanup: string | null;
}

export type BackupTrigger =
  | "manual"
  | "git-pull"
  | "git-merge"
  | "git-checkout"
  | "git-switch"
  | "git-rebase"
  | "scheduled"
  | "auto-restore";

export interface BackupResult {
  success: boolean;
  backupId?: string;
  error?: string;
  metadata?: BackupMetadata;
}

export interface RestoreResult {
  success: boolean;
  backupId?: string;
  error?: string;
  filesRestored?: number;
}

export interface BackupConfig {
  retentionCount: number;
  backupDir: string;
  autoBackupEnabled: boolean;
}

const DEFAULT_CONFIG: BackupConfig = {
  retentionCount: 10,
  backupDir: ".automaker-backups",
  autoBackupEnabled: true,
};

const MANIFEST_FILE = "manifest.json";
const MANIFEST_VERSION = 1;

export class BackupService {
  private config: BackupConfig;

  constructor(config: Partial<BackupConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get the backup directory path for a project
   */
  getBackupDir(projectPath: string): string {
    return path.join(projectPath, this.config.backupDir);
  }

  /**
   * Get the automaker config directory path
   */
  getAutomakerDir(projectPath: string): string {
    return path.join(projectPath, ".automaker");
  }

  /**
   * Get the manifest file path
   */
  getManifestPath(projectPath: string): string {
    return path.join(this.getBackupDir(projectPath), MANIFEST_FILE);
  }

  /**
   * Generate a unique backup ID
   */
  generateBackupId(): string {
    const timestamp = Date.now();
    const randomPart = crypto.randomBytes(4).toString("hex");
    return `backup-${timestamp}-${randomPart}`;
  }

  /**
   * Load the backup manifest, creating one if it doesn't exist
   */
  async loadManifest(projectPath: string): Promise<BackupManifest> {
    const manifestPath = this.getManifestPath(projectPath);

    try {
      const content = await fs.readFile(manifestPath, "utf-8");
      const manifest = JSON.parse(content) as BackupManifest;

      // Ensure version compatibility
      if (manifest.version !== MANIFEST_VERSION) {
        logger.warn(`Manifest version mismatch: expected ${MANIFEST_VERSION}, got ${manifest.version}`);
      }

      return manifest;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        // Return default manifest if file doesn't exist
        return {
          version: MANIFEST_VERSION,
          backups: [],
          retentionCount: this.config.retentionCount,
          lastCleanup: null,
        };
      }
      throw error;
    }
  }

  /**
   * Save the backup manifest
   */
  async saveManifest(projectPath: string, manifest: BackupManifest): Promise<void> {
    const backupDir = this.getBackupDir(projectPath);
    await fs.mkdir(backupDir, { recursive: true });

    const manifestPath = this.getManifestPath(projectPath);
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
  }

  /**
   * Calculate checksum for a file
   */
  private async calculateFileChecksum(filePath: string): Promise<string> {
    const content = await fs.readFile(filePath);
    return crypto.createHash("sha256").update(content).digest("hex");
  }

  /**
   * Calculate combined checksum for a directory
   */
  private async calculateDirectoryChecksum(dirPath: string): Promise<string> {
    const files = await this.getAllFiles(dirPath);
    const checksums: string[] = [];

    for (const file of files.sort()) {
      const relativePath = path.relative(dirPath, file);
      const checksum = await this.calculateFileChecksum(file);
      checksums.push(`${relativePath}:${checksum}`);
    }

    return crypto.createHash("sha256").update(checksums.join("\n")).digest("hex");
  }

  /**
   * Get all files in a directory recursively
   */
  private async getAllFiles(dirPath: string): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          const subFiles = await this.getAllFiles(fullPath);
          files.push(...subFiles);
        } else if (entry.isFile()) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      logger.error(`Error reading directory ${dirPath}:`, error);
    }

    return files;
  }

  /**
   * Get total size of all files in a directory
   */
  private async getDirectorySize(dirPath: string): Promise<number> {
    const files = await this.getAllFiles(dirPath);
    let totalSize = 0;

    for (const file of files) {
      try {
        const stats = await fs.stat(file);
        totalSize += stats.size;
      } catch {
        // Ignore files that can't be accessed
      }
    }

    return totalSize;
  }

  /**
   * Copy a directory recursively
   */
  private async copyDirectory(src: string, dest: string): Promise<number> {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });
    let fileCount = 0;

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        fileCount += await this.copyDirectory(srcPath, destPath);
      } else if (entry.isFile()) {
        await fs.copyFile(srcPath, destPath);
        fileCount++;
      }
    }

    return fileCount;
  }

  /**
   * Create a backup of the .automaker folder
   */
  async createBackup(projectPath: string, trigger: BackupTrigger): Promise<BackupResult> {
    const automakerDir = this.getAutomakerDir(projectPath);

    // Check if .automaker exists
    try {
      await fs.access(automakerDir);
    } catch {
      return {
        success: false,
        error: ".automaker directory does not exist",
      };
    }

    const backupId = this.generateBackupId();
    const backupPath = path.join(this.getBackupDir(projectPath), backupId);

    try {
      // Create backup directory
      await fs.mkdir(backupPath, { recursive: true });

      // Copy .automaker to backup location
      const fileCount = await this.copyDirectory(automakerDir, backupPath);

      // Calculate checksum and size
      const checksum = await this.calculateDirectoryChecksum(backupPath);
      const totalSize = await this.getDirectorySize(backupPath);

      // Create metadata
      const metadata: BackupMetadata = {
        id: backupId,
        timestamp: new Date().toISOString(),
        projectPath,
        trigger,
        fileCount,
        totalSize,
        checksum,
        valid: true,
      };

      // Update manifest
      const manifest = await this.loadManifest(projectPath);
      manifest.backups.push(metadata);
      await this.saveManifest(projectPath, manifest);

      // Cleanup old backups
      await this.cleanupOldBackups(projectPath);

      logger.info(`Created backup ${backupId} with ${fileCount} files (${trigger})`);

      return {
        success: true,
        backupId,
        metadata,
      };
    } catch (error) {
      logger.error(`Failed to create backup:`, error);

      // Clean up partial backup
      try {
        await fs.rm(backupPath, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Restore from a backup
   */
  async restoreBackup(projectPath: string, backupId: string): Promise<RestoreResult> {
    const backupPath = path.join(this.getBackupDir(projectPath), backupId);
    const automakerDir = this.getAutomakerDir(projectPath);

    // Verify backup exists
    try {
      await fs.access(backupPath);
    } catch {
      return {
        success: false,
        error: `Backup ${backupId} not found`,
      };
    }

    // Validate backup integrity
    const manifest = await this.loadManifest(projectPath);
    const backupMetadata = manifest.backups.find((b) => b.id === backupId);

    if (backupMetadata) {
      const currentChecksum = await this.calculateDirectoryChecksum(backupPath);
      if (currentChecksum !== backupMetadata.checksum) {
        logger.warn(`Backup ${backupId} checksum mismatch - backup may be corrupted`);
        return {
          success: false,
          error: "Backup integrity check failed - checksum mismatch",
        };
      }
    }

    try {
      // Create a backup of current state before restoration (for safety)
      const preRestoreBackup = await this.createBackup(projectPath, "auto-restore");
      if (preRestoreBackup.success) {
        logger.info(`Created pre-restore backup: ${preRestoreBackup.backupId}`);
      }

      // Remove existing .automaker directory
      await fs.rm(automakerDir, { recursive: true, force: true });

      // Copy backup to .automaker
      const filesRestored = await this.copyDirectory(backupPath, automakerDir);

      logger.info(`Restored backup ${backupId} with ${filesRestored} files`);

      return {
        success: true,
        backupId,
        filesRestored,
      };
    } catch (error) {
      logger.error(`Failed to restore backup ${backupId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Restore from the most recent valid backup
   */
  async restoreLatestBackup(projectPath: string): Promise<RestoreResult> {
    const manifest = await this.loadManifest(projectPath);
    const validBackups = manifest.backups
      .filter((b) => b.valid)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (validBackups.length === 0) {
      return {
        success: false,
        error: "No valid backups available",
      };
    }

    return this.restoreBackup(projectPath, validBackups[0].id);
  }

  /**
   * List all backups for a project
   */
  async listBackups(projectPath: string): Promise<BackupMetadata[]> {
    const manifest = await this.loadManifest(projectPath);
    return manifest.backups.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  /**
   * Get a specific backup's metadata
   */
  async getBackup(projectPath: string, backupId: string): Promise<BackupMetadata | null> {
    const manifest = await this.loadManifest(projectPath);
    return manifest.backups.find((b) => b.id === backupId) || null;
  }

  /**
   * Delete a specific backup
   */
  async deleteBackup(projectPath: string, backupId: string): Promise<boolean> {
    const backupPath = path.join(this.getBackupDir(projectPath), backupId);

    try {
      await fs.rm(backupPath, { recursive: true, force: true });

      // Update manifest
      const manifest = await this.loadManifest(projectPath);
      manifest.backups = manifest.backups.filter((b) => b.id !== backupId);
      await this.saveManifest(projectPath, manifest);

      logger.info(`Deleted backup ${backupId}`);
      return true;
    } catch (error) {
      logger.error(`Failed to delete backup ${backupId}:`, error);
      return false;
    }
  }

  /**
   * Clean up old backups based on retention policy
   */
  async cleanupOldBackups(projectPath: string): Promise<number> {
    const manifest = await this.loadManifest(projectPath);
    const retentionCount = manifest.retentionCount || this.config.retentionCount;

    // Sort backups by timestamp (newest first)
    const sortedBackups = [...manifest.backups].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // Keep only the most recent N backups
    const backupsToDelete = sortedBackups.slice(retentionCount);
    let deletedCount = 0;

    for (const backup of backupsToDelete) {
      const deleted = await this.deleteBackup(projectPath, backup.id);
      if (deleted) {
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      // Update manifest cleanup timestamp
      manifest.lastCleanup = new Date().toISOString();
      await this.saveManifest(projectPath, manifest);
      logger.info(`Cleaned up ${deletedCount} old backups`);
    }

    return deletedCount;
  }

  /**
   * Validate a backup's integrity
   */
  async validateBackup(projectPath: string, backupId: string): Promise<boolean> {
    const backupPath = path.join(this.getBackupDir(projectPath), backupId);
    const manifest = await this.loadManifest(projectPath);
    const backupMetadata = manifest.backups.find((b) => b.id === backupId);

    if (!backupMetadata) {
      logger.warn(`Backup ${backupId} not found in manifest`);
      return false;
    }

    try {
      // Check backup directory exists
      await fs.access(backupPath);

      // Calculate current checksum
      const currentChecksum = await this.calculateDirectoryChecksum(backupPath);

      // Compare with stored checksum
      const isValid = currentChecksum === backupMetadata.checksum;

      // Update validity in manifest if changed
      if (backupMetadata.valid !== isValid) {
        backupMetadata.valid = isValid;
        await this.saveManifest(projectPath, manifest);
      }

      return isValid;
    } catch (error) {
      logger.error(`Failed to validate backup ${backupId}:`, error);

      // Mark as invalid in manifest
      backupMetadata.valid = false;
      await this.saveManifest(projectPath, manifest);

      return false;
    }
  }

  /**
   * Check if .automaker folder has been modified/corrupted
   */
  async detectChanges(projectPath: string, referenceBackupId?: string): Promise<{
    changed: boolean;
    missing: boolean;
    details?: string;
  }> {
    const automakerDir = this.getAutomakerDir(projectPath);

    // Check if .automaker exists
    try {
      await fs.access(automakerDir);
    } catch {
      return {
        changed: true,
        missing: true,
        details: ".automaker directory is missing",
      };
    }

    // If a reference backup is provided, compare against it
    if (referenceBackupId) {
      const backupPath = path.join(this.getBackupDir(projectPath), referenceBackupId);

      try {
        const currentChecksum = await this.calculateDirectoryChecksum(automakerDir);
        const backupChecksum = await this.calculateDirectoryChecksum(backupPath);

        return {
          changed: currentChecksum !== backupChecksum,
          missing: false,
          details: currentChecksum !== backupChecksum
            ? "Configuration has changed since last backup"
            : undefined,
        };
      } catch (error) {
        return {
          changed: true,
          missing: false,
          details: `Error comparing with backup: ${error}`,
        };
      }
    }

    // If no reference, just check basic structure
    const requiredDirs = ["context", "features", "images"];
    const requiredFiles = ["categories.json"];

    for (const dir of requiredDirs) {
      try {
        await fs.access(path.join(automakerDir, dir));
      } catch {
        return {
          changed: true,
          missing: false,
          details: `Required directory missing: ${dir}`,
        };
      }
    }

    for (const file of requiredFiles) {
      try {
        await fs.access(path.join(automakerDir, file));
      } catch {
        return {
          changed: true,
          missing: false,
          details: `Required file missing: ${file}`,
        };
      }
    }

    return {
      changed: false,
      missing: false,
    };
  }

  /**
   * Update retention count configuration
   */
  async setRetentionCount(projectPath: string, count: number): Promise<void> {
    const manifest = await this.loadManifest(projectPath);
    manifest.retentionCount = count;
    await this.saveManifest(projectPath, manifest);

    // Trigger cleanup with new retention policy
    await this.cleanupOldBackups(projectPath);
  }

  /**
   * Get backup statistics for a project
   */
  async getStats(projectPath: string): Promise<{
    totalBackups: number;
    validBackups: number;
    totalSize: number;
    oldestBackup: string | null;
    newestBackup: string | null;
  }> {
    const manifest = await this.loadManifest(projectPath);
    const backups = manifest.backups;

    if (backups.length === 0) {
      return {
        totalBackups: 0,
        validBackups: 0,
        totalSize: 0,
        oldestBackup: null,
        newestBackup: null,
      };
    }

    const sortedBackups = [...backups].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    return {
      totalBackups: backups.length,
      validBackups: backups.filter((b) => b.valid).length,
      totalSize: backups.reduce((sum, b) => sum + b.totalSize, 0),
      oldestBackup: sortedBackups[0]?.timestamp || null,
      newestBackup: sortedBackups[sortedBackups.length - 1]?.timestamp || null,
    };
  }
}
