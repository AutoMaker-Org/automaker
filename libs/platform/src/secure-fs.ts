/**
 * Secure File System Adapter
 *
 * All file I/O operations must go through this adapter to enforce
 * ALLOWED_ROOT_DIRECTORY restrictions at the actual access point,
 * not just at the API layer. This provides defense-in-depth security.
 *
 * This module also implements:
 * - Concurrency limiting via p-limit to prevent ENFILE/EMFILE errors
 * - Retry logic with exponential backoff for transient file descriptor errors
 */

import fs from 'fs/promises';
import type { Dirent } from 'fs';
import path from 'path';
import pLimit from 'p-limit';
import { validatePath } from './security.js';

/**
 * Configuration for file operation throttling
 */
interface ThrottleConfig {
  /** Maximum concurrent file operations (default: 100) */
  maxConcurrency: number;
  /** Maximum retry attempts for ENFILE/EMFILE errors (default: 3) */
  maxRetries: number;
  /** Base delay in ms for exponential backoff (default: 100) */
  baseDelay: number;
  /** Maximum delay in ms for exponential backoff (default: 5000) */
  maxDelay: number;
}

const DEFAULT_CONFIG: ThrottleConfig = {
  maxConcurrency: 100,
  maxRetries: 3,
  baseDelay: 100,
  maxDelay: 5000,
};

let config: ThrottleConfig = { ...DEFAULT_CONFIG };
let fsLimit = pLimit(config.maxConcurrency);

/**
 * Configure the file operation throttling settings
 * @param newConfig - Partial configuration to merge with defaults
 */
export function configureThrottling(newConfig: Partial<ThrottleConfig>): void {
  const newConcurrency = newConfig.maxConcurrency;

  if (newConcurrency !== undefined && newConcurrency !== config.maxConcurrency) {
    if (fsLimit.activeCount > 0 || fsLimit.pendingCount > 0) {
      throw new Error(
        `[SecureFS] Cannot change maxConcurrency while operations are in flight. Active: ${fsLimit.activeCount}, Pending: ${fsLimit.pendingCount}`
      );
    }
    fsLimit = pLimit(newConcurrency);
  }

  config = { ...config, ...newConfig };
}

/**
 * Get the current throttling configuration
 */
export function getThrottlingConfig(): Readonly<ThrottleConfig> {
  return { ...config };
}

/**
 * Get the number of pending operations in the queue
 */
export function getPendingOperations(): number {
  return fsLimit.pendingCount;
}

/**
 * Get the number of active operations currently running
 */
export function getActiveOperations(): number {
  return fsLimit.activeCount;
}

/**
 * Error codes that indicate file descriptor exhaustion
 */
const FILE_DESCRIPTOR_ERROR_CODES = new Set(['ENFILE', 'EMFILE']);

/**
 * Check if an error is a file descriptor exhaustion error
 */
function isFileDescriptorError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'code' in error) {
    return FILE_DESCRIPTOR_ERROR_CODES.has((error as { code: string }).code);
  }
  return false;
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(attempt: number): number {
  const exponentialDelay = config.baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * config.baseDelay;
  return Math.min(exponentialDelay + jitter, config.maxDelay);
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a file operation with throttling and retry logic
 */
async function executeWithRetry<T>(operation: () => Promise<T>, operationName: string): Promise<T> {
  return fsLimit(async () => {
    let lastError: unknown;

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        if (isFileDescriptorError(error) && attempt < config.maxRetries) {
          const delay = calculateDelay(attempt);
          console.warn(
            `[SecureFS] ${operationName}: File descriptor error (attempt ${attempt + 1}/${config.maxRetries + 1}), retrying in ${delay}ms`
          );
          await sleep(delay);
          continue;
        }

        throw error;
      }
    }

    throw lastError;
  });
}

/**
 * Wrapper around fs.access that validates path first
 */
export async function access(filePath: string, mode?: number): Promise<void> {
  const validatedPath = validatePath(filePath);
  return executeWithRetry(() => fs.access(validatedPath, mode), `access(${filePath})`);
}

/**
 * Wrapper around fs.readFile that validates path first
 */
export async function readFile(
  filePath: string,
  encoding?: BufferEncoding
): Promise<string | Buffer> {
  const validatedPath = validatePath(filePath);
  return executeWithRetry<string | Buffer>(() => {
    if (encoding) {
      return fs.readFile(validatedPath, encoding);
    }
    return fs.readFile(validatedPath);
  }, `readFile(${filePath})`);
}

/**
 * Wrapper around fs.writeFile that validates path first
 */
export async function writeFile(
  filePath: string,
  data: string | Buffer,
  encoding?: BufferEncoding
): Promise<void> {
  const validatedPath = validatePath(filePath);
  return executeWithRetry(
    () => fs.writeFile(validatedPath, data, encoding),
    `writeFile(${filePath})`
  );
}

/**
 * Wrapper around fs.mkdir that validates path first
 */
export async function mkdir(
  dirPath: string,
  options?: { recursive?: boolean; mode?: number }
): Promise<string | undefined> {
  const validatedPath = validatePath(dirPath);
  return executeWithRetry(() => fs.mkdir(validatedPath, options), `mkdir(${dirPath})`);
}

/**
 * Wrapper around fs.readdir that validates path first
 */
export async function readdir(
  dirPath: string,
  options?: { withFileTypes?: false; encoding?: BufferEncoding }
): Promise<string[]>;
export async function readdir(
  dirPath: string,
  options: { withFileTypes: true; encoding?: BufferEncoding }
): Promise<Dirent[]>;
export async function readdir(
  dirPath: string,
  options?: { withFileTypes?: boolean; encoding?: BufferEncoding }
): Promise<string[] | Dirent[]> {
  const validatedPath = validatePath(dirPath);
  return executeWithRetry<string[] | Dirent[]>(() => {
    if (options?.withFileTypes === true) {
      return fs.readdir(validatedPath, { withFileTypes: true });
    }
    return fs.readdir(validatedPath);
  }, `readdir(${dirPath})`);
}

/**
 * Wrapper around fs.stat that validates path first
 */
export async function stat(filePath: string): Promise<ReturnType<typeof fs.stat>> {
  const validatedPath = validatePath(filePath);
  return executeWithRetry(() => fs.stat(validatedPath), `stat(${filePath})`);
}

/**
 * Wrapper around fs.rm that validates path first
 */
export async function rm(
  filePath: string,
  options?: { recursive?: boolean; force?: boolean }
): Promise<void> {
  const validatedPath = validatePath(filePath);
  return executeWithRetry(() => fs.rm(validatedPath, options), `rm(${filePath})`);
}

/**
 * Wrapper around fs.unlink that validates path first
 */
export async function unlink(filePath: string): Promise<void> {
  const validatedPath = validatePath(filePath);
  return executeWithRetry(() => fs.unlink(validatedPath), `unlink(${filePath})`);
}

/**
 * Wrapper around fs.copyFile that validates both paths first
 */
export async function copyFile(src: string, dest: string, mode?: number): Promise<void> {
  const validatedSrc = validatePath(src);
  const validatedDest = validatePath(dest);
  return executeWithRetry(
    () => fs.copyFile(validatedSrc, validatedDest, mode),
    `copyFile(${src}, ${dest})`
  );
}

/**
 * Wrapper around fs.appendFile that validates path first
 */
export async function appendFile(
  filePath: string,
  data: string | Buffer,
  encoding?: BufferEncoding
): Promise<void> {
  const validatedPath = validatePath(filePath);
  return executeWithRetry(
    () => fs.appendFile(validatedPath, data, encoding),
    `appendFile(${filePath})`
  );
}

/**
 * Wrapper around fs.rename that validates both paths first
 */
export async function rename(oldPath: string, newPath: string): Promise<void> {
  const validatedOldPath = validatePath(oldPath);
  const validatedNewPath = validatePath(newPath);
  return executeWithRetry(
    () => fs.rename(validatedOldPath, validatedNewPath),
    `rename(${oldPath}, ${newPath})`
  );
}

/**
 * Wrapper around fs.lstat that validates path first
 * Returns file stats without following symbolic links
 */
export async function lstat(filePath: string): Promise<ReturnType<typeof fs.lstat>> {
  const validatedPath = validatePath(filePath);
  return executeWithRetry(() => fs.lstat(validatedPath), `lstat(${filePath})`);
}

/**
 * Wrapper around path.join that returns resolved path
 * Does NOT validate - use this for path construction, then pass to other operations
 */
export function joinPath(...pathSegments: string[]): string {
  return path.join(...pathSegments);
}

/**
 * Wrapper around path.resolve that returns resolved path
 * Does NOT validate - use this for path construction, then pass to other operations
 */
export function resolvePath(...pathSegments: string[]): string {
  return path.resolve(...pathSegments);
}
