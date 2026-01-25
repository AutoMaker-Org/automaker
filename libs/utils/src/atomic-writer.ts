/**
 * Atomic file writing utilities for JSON data
 *
 * Provides atomic write operations using temp-file + rename pattern,
 * ensuring data integrity even during crashes or power failures.
 */

import { secureFs } from '@automaker/platform';
import path from 'path';
import crypto from 'crypto';
import { createLogger } from './logger.js';
import { mkdirSafe } from './fs-utils.js';

const logger = createLogger('AtomicWriter');

/** Default maximum number of backup files to keep for crash recovery */
export const DEFAULT_BACKUP_COUNT = 3;

/**
 * Options for atomic write operations
 */
export interface AtomicWriteOptions {
  /** Number of spaces for JSON indentation (default: 2) */
  indent?: number;
  /** Create parent directories if they don't exist (default: false) */
  createDirs?: boolean;
  /** Number of backup files to keep (0 = no backups, default: 0). When > 0, rotates .bak1, .bak2, etc. */
  backupCount?: number;
}

/**
 * Rotate backup files (.bak1 -> .bak2 -> .bak3, oldest is deleted)
 * and create a new backup from the current file.
 *
 * @param filePath - Absolute path to the file being backed up
 * @param maxBackups - Maximum number of backup files to keep
 */
export async function rotateBackups(
  filePath: string,
  maxBackups: number = DEFAULT_BACKUP_COUNT
): Promise<void> {
  // Check if the source file exists before attempting backup
  try {
    await secureFs.access(filePath);
  } catch {
    // No existing file to backup
    return;
  }

  // Rotate existing backups: .bak3 is deleted, .bak2 -> .bak3, .bak1 -> .bak2
  for (let i = maxBackups; i >= 1; i--) {
    const currentBackup = `${filePath}.bak${i}`;
    const nextBackup = `${filePath}.bak${i + 1}`;

    try {
      if (i === maxBackups) {
        // Delete the oldest backup
        await secureFs.unlink(currentBackup);
      } else {
        // Rename current backup to next slot
        await secureFs.rename(currentBackup, nextBackup);
      }
    } catch {
      // Ignore errors - backup file may not exist
    }
  }

  // Copy current file to .bak1
  try {
    await secureFs.copyFile(filePath, `${filePath}.bak1`);
  } catch (error) {
    logger.warn(`Failed to create backup of ${filePath}:`, error);
    // Continue with write even if backup fails
  }
}

/**
 * Atomically write JSON data to a file.
 *
 * Uses the temp-file + rename pattern for atomicity:
 * 1. Writes data to a temporary file
 * 2. Atomically renames temp file to target path
 * 3. Cleans up temp file on error
 *
 * @param filePath - Absolute path to the target file
 * @param data - Data to serialize as JSON
 * @param options - Optional write options
 * @throws Error if write fails (temp file is cleaned up)
 *
 * @example
 * ```typescript
 * await atomicWriteJson('/path/to/config.json', { key: 'value' });
 * await atomicWriteJson('/path/to/data.json', data, { indent: 4, createDirs: true });
 * ```
 */
export async function atomicWriteJson<T>(
  filePath: string,
  data: T,
  options: AtomicWriteOptions = {}
): Promise<void> {
  const { indent = 2, createDirs = false, backupCount = 0 } = options;
  const resolvedPath = path.resolve(filePath);
  // Use timestamp + random suffix to ensure uniqueness even for concurrent writes
  const uniqueSuffix = `${Date.now()}.${crypto.randomBytes(4).toString('hex')}`;
  const tempPath = `${resolvedPath}.tmp.${uniqueSuffix}`;

  // Create parent directories if requested
  if (createDirs) {
    const dirPath = path.dirname(resolvedPath);
    await mkdirSafe(dirPath);
  }

  const content = JSON.stringify(data, null, indent);

  try {
    // Rotate backups before writing (if backups are enabled)
    if (backupCount > 0) {
      await rotateBackups(resolvedPath, backupCount);
    }

    await secureFs.writeFile(tempPath, content, 'utf-8');
    await secureFs.rename(tempPath, resolvedPath);
  } catch (error) {
    // Clean up temp file if it exists
    try {
      await secureFs.unlink(tempPath);
    } catch {
      // Ignore cleanup errors - best effort
    }
    logger.error(`Failed to atomically write to ${resolvedPath}:`, error);
    throw error;
  }
}

/**
 * Safely read JSON from a file with fallback to default value.
 *
 * Returns the default value if:
 * - File doesn't exist (ENOENT)
 * - File content is invalid JSON
 *
 * @param filePath - Absolute path to the file
 * @param defaultValue - Value to return if file doesn't exist or is invalid
 * @returns Parsed JSON data or default value
 *
 * @example
 * ```typescript
 * const config = await readJsonFile('/path/to/config.json', { version: 1 });
 * ```
 */
export async function readJsonFile<T>(filePath: string, defaultValue: T): Promise<T> {
  const resolvedPath = path.resolve(filePath);

  try {
    const content = (await secureFs.readFile(resolvedPath, 'utf-8')) as string;
    return JSON.parse(content) as T;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') {
      return defaultValue;
    }
    logger.error(`Error reading JSON from ${resolvedPath}:`, error);
    return defaultValue;
  }
}

/**
 * Atomically update a JSON file by reading, transforming, and writing.
 *
 * Provides a safe read-modify-write pattern:
 * 1. Reads existing file (or uses default)
 * 2. Applies updater function
 * 3. Atomically writes result
 *
 * @param filePath - Absolute path to the file
 * @param defaultValue - Default value if file doesn't exist
 * @param updater - Function that transforms the data
 * @param options - Optional write options
 *
 * @example
 * ```typescript
 * await updateJsonAtomically(
 *   '/path/to/counter.json',
 *   { count: 0 },
 *   (data) => ({ ...data, count: data.count + 1 })
 * );
 * ```
 */
export async function updateJsonAtomically<T>(
  filePath: string,
  defaultValue: T,
  updater: (current: T) => T | Promise<T>,
  options: AtomicWriteOptions = {}
): Promise<void> {
  const current = await readJsonFile(filePath, defaultValue);
  const updated = await updater(current);
  await atomicWriteJson(filePath, updated, options);
}

/**
 * Result of a JSON read operation with recovery information
 */
export interface ReadJsonRecoveryResult<T> {
  /** The data that was successfully read */
  data: T;
  /** Whether recovery was needed (main file was corrupted or missing) */
  recovered: boolean;
  /** Source of the data: 'main', 'backup', 'temp', or 'default' */
  source: 'main' | 'backup' | 'temp' | 'default';
  /** Error message if the main file had an issue */
  error?: string;
}

/**
 * Options for readJsonWithRecovery
 */
export interface ReadJsonRecoveryOptions {
  /** Maximum number of backup files to check (.bak1, .bak2, etc.) Default: 3 */
  maxBackups?: number;
  /** Whether to automatically restore main file from backup when corrupted. Default: true */
  autoRestore?: boolean;
}

/**
 * Log a warning if recovery was needed (from backup or temp file).
 *
 * Use this helper to reduce duplicate logging code when using readJsonWithRecovery.
 *
 * @param result - The result from readJsonWithRecovery
 * @param identifier - A human-readable identifier for the file being recovered (e.g., "Feature abc123")
 * @param loggerInstance - Optional logger instance to use (defaults to AtomicWriter logger)
 *
 * @example
 * ```typescript
 * const result = await readJsonWithRecovery(featurePath, null);
 * logRecoveryWarning(result, `Feature ${featureId}`);
 * ```
 */
export function logRecoveryWarning<T>(
  result: ReadJsonRecoveryResult<T>,
  identifier: string,
  loggerInstance: { warn: (msg: string, ...args: unknown[]) => void } = logger
): void {
  if (result.recovered && result.source !== 'default') {
    loggerInstance.warn(`${identifier} was recovered from ${result.source}: ${result.error}`);
  }
}

/**
 * Read JSON file with automatic recovery from backups.
 *
 * This function attempts to read a JSON file with fallback to backups:
 * 1. Try to read the main file
 * 2. If corrupted, check for temp files (.tmp.*) that might have valid data
 * 3. If no valid temp file, try backup files (.bak1, .bak2, .bak3)
 * 4. If all fail, return the default value
 *
 * Optionally restores the main file from a valid backup (autoRestore: true).
 *
 * @param filePath - Absolute path to the file
 * @param defaultValue - Value to return if no valid data found
 * @param options - Recovery options
 * @returns Result containing the data and recovery information
 *
 * @example
 * ```typescript
 * const result = await readJsonWithRecovery('/path/to/config.json', { version: 1 });
 * if (result.recovered) {
 *   console.log(`Recovered from ${result.source}: ${result.error}`);
 * }
 * const config = result.data;
 * ```
 */
export async function readJsonWithRecovery<T>(
  filePath: string,
  defaultValue: T,
  options: ReadJsonRecoveryOptions = {}
): Promise<ReadJsonRecoveryResult<T>> {
  const { maxBackups = 3, autoRestore = true } = options;
  const resolvedPath = path.resolve(filePath);
  const dirPath = path.dirname(resolvedPath);
  const fileName = path.basename(resolvedPath);

  // Try to read the main file first
  try {
    const content = (await secureFs.readFile(resolvedPath, 'utf-8')) as string;
    const data = JSON.parse(content) as T;
    return { data, recovered: false, source: 'main' };
  } catch (mainError) {
    const nodeError = mainError as NodeJS.ErrnoException;
    const errorMessage =
      nodeError.code === 'ENOENT'
        ? 'File does not exist'
        : `Failed to parse: ${mainError instanceof Error ? mainError.message : String(mainError)}`;

    // If file doesn't exist, check for temp files or backups
    logger.warn(`Main file ${resolvedPath} unavailable: ${errorMessage}`);

    // Try to find and recover from temp files first (in case of interrupted write)
    try {
      const files = (await secureFs.readdir(dirPath)) as string[];
      const tempFiles = files
        .filter((f: string) => f.startsWith(`${fileName}.tmp.`))
        .sort()
        .reverse(); // Most recent first

      for (const tempFile of tempFiles) {
        const tempPath = path.join(dirPath, tempFile);
        try {
          const content = (await secureFs.readFile(tempPath, 'utf-8')) as string;
          const data = JSON.parse(content) as T;

          logger.info(`Recovered data from temp file: ${tempPath}`);

          // Optionally restore main file from temp
          if (autoRestore) {
            try {
              await secureFs.rename(tempPath, resolvedPath);
              logger.info(`Restored main file from temp: ${tempPath}`);
            } catch (restoreError) {
              logger.warn(`Failed to restore main file from temp: ${restoreError}`);
            }
          }

          return { data, recovered: true, source: 'temp', error: errorMessage };
        } catch {
          // This temp file is also corrupted, try next
          continue;
        }
      }
    } catch {
      // Could not read directory, skip temp file check
    }

    // Try backup files (.bak1, .bak2, .bak3)
    for (let i = 1; i <= maxBackups; i++) {
      const backupPath = `${resolvedPath}.bak${i}`;
      try {
        const content = (await secureFs.readFile(backupPath, 'utf-8')) as string;
        const data = JSON.parse(content) as T;

        logger.info(`Recovered data from backup: ${backupPath}`);

        // Optionally restore main file from backup
        if (autoRestore) {
          try {
            await secureFs.copyFile(backupPath, resolvedPath);
            logger.info(`Restored main file from backup: ${backupPath}`);
          } catch (restoreError) {
            logger.warn(`Failed to restore main file from backup: ${restoreError}`);
          }
        }

        return { data, recovered: true, source: 'backup', error: errorMessage };
      } catch {
        // This backup doesn't exist or is corrupted, try next
        continue;
      }
    }

    // All recovery attempts failed, return default
    logger.warn(`All recovery attempts failed for ${resolvedPath}, using default value`);
    return { data: defaultValue, recovered: true, source: 'default', error: errorMessage };
  }
}
