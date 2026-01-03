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
import fsSync, { type Dirent, type Stats } from 'fs';
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
 * Options for writeFile
 */
export interface WriteFileOptions {
  encoding?: BufferEncoding;
  mode?: number;
  flag?: string;
}

/**
 * Wrapper around fs.writeFile that validates path first
 */
export async function writeFile(
  filePath: string,
  data: string | Buffer,
  optionsOrEncoding?: BufferEncoding | WriteFileOptions
): Promise<void> {
  const validatedPath = validatePath(filePath);
  return executeWithRetry(
    () => fs.writeFile(validatedPath, data, optionsOrEncoding),
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

// =============================================================================
// Synchronous File System Methods
// =============================================================================

/**
 * Options for writeFileSync
 */
export interface WriteFileSyncOptions {
  encoding?: BufferEncoding;
  mode?: number;
  flag?: string;
}

/**
 * Synchronous wrapper around fs.existsSync that validates path first
 */
export function existsSync(filePath: string): boolean {
  const validatedPath = validatePath(filePath);
  return fsSync.existsSync(validatedPath);
}

/**
 * Synchronous wrapper around fs.readFileSync that validates path first
 */
export function readFileSync(filePath: string, encoding?: BufferEncoding): string | Buffer {
  const validatedPath = validatePath(filePath);
  if (encoding) {
    return fsSync.readFileSync(validatedPath, encoding);
  }
  return fsSync.readFileSync(validatedPath);
}

/**
 * Synchronous wrapper around fs.writeFileSync that validates path first
 */
export function writeFileSync(
  filePath: string,
  data: string | Buffer,
  options?: WriteFileSyncOptions
): void {
  const validatedPath = validatePath(filePath);
  fsSync.writeFileSync(validatedPath, data, options);
}

/**
 * Synchronous wrapper around fs.mkdirSync that validates path first
 */
export function mkdirSync(
  dirPath: string,
  options?: { recursive?: boolean; mode?: number }
): string | undefined {
  const validatedPath = validatePath(dirPath);
  return fsSync.mkdirSync(validatedPath, options);
}

/**
 * Synchronous wrapper around fs.readdirSync that validates path first
 */
export function readdirSync(dirPath: string, options?: { withFileTypes?: false }): string[];
export function readdirSync(dirPath: string, options: { withFileTypes: true }): Dirent[];
export function readdirSync(
  dirPath: string,
  options?: { withFileTypes?: boolean }
): string[] | Dirent[] {
  const validatedPath = validatePath(dirPath);
  if (options?.withFileTypes === true) {
    return fsSync.readdirSync(validatedPath, { withFileTypes: true });
  }
  return fsSync.readdirSync(validatedPath);
}

/**
 * Synchronous wrapper around fs.statSync that validates path first
 */
export function statSync(filePath: string): Stats {
  const validatedPath = validatePath(filePath);
  return fsSync.statSync(validatedPath);
}

/**
 * Synchronous wrapper around fs.accessSync that validates path first
 */
export function accessSync(filePath: string, mode?: number): void {
  const validatedPath = validatePath(filePath);
  fsSync.accessSync(validatedPath, mode);
}

/**
 * Synchronous wrapper around fs.unlinkSync that validates path first
 */
export function unlinkSync(filePath: string): void {
  const validatedPath = validatePath(filePath);
  fsSync.unlinkSync(validatedPath);
}

/**
 * Synchronous wrapper around fs.rmSync that validates path first
 */
export function rmSync(filePath: string, options?: { recursive?: boolean; force?: boolean }): void {
  const validatedPath = validatePath(filePath);
  fsSync.rmSync(validatedPath, options);
}

// =============================================================================
// Environment File Operations
// =============================================================================

/**
 * Read and parse an .env file from a validated path
 * Returns a record of key-value pairs
 */
export async function readEnvFile(envPath: string): Promise<Record<string, string>> {
  const validatedPath = validatePath(envPath);
  try {
    const content = await executeWithRetry(
      () => fs.readFile(validatedPath, 'utf-8'),
      `readEnvFile(${envPath})`
    );
    return parseEnvContent(content);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

/**
 * Read and parse an .env file synchronously from a validated path
 */
export function readEnvFileSync(envPath: string): Record<string, string> {
  const validatedPath = validatePath(envPath);
  try {
    const content = fsSync.readFileSync(validatedPath, 'utf-8');
    return parseEnvContent(content);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

/**
 * Parse .env file content into a record
 */
function parseEnvContent(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const equalIndex = trimmed.indexOf('=');
    if (equalIndex > 0) {
      const key = trimmed.slice(0, equalIndex).trim();
      const value = trimmed.slice(equalIndex + 1).trim();
      result[key] = value;
    }
  }

  return result;
}

/**
 * Write or update a key-value pair in an .env file
 * Preserves existing content and comments
 */
export async function writeEnvKey(envPath: string, key: string, value: string): Promise<void> {
  const validatedPath = validatePath(envPath);

  let content = '';
  try {
    content = await executeWithRetry(
      () => fs.readFile(validatedPath, 'utf-8'),
      `readFile(${envPath})`
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
    // File doesn't exist, will create new one
  }

  const newContent = updateEnvContent(content, key, value);
  await executeWithRetry(() => fs.writeFile(validatedPath, newContent), `writeFile(${envPath})`);
}

/**
 * Write or update a key-value pair in an .env file (synchronous)
 */
export function writeEnvKeySync(envPath: string, key: string, value: string): void {
  const validatedPath = validatePath(envPath);

  let content = '';
  try {
    content = fsSync.readFileSync(validatedPath, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
    // File doesn't exist, will create new one
  }

  const newContent = updateEnvContent(content, key, value);
  fsSync.writeFileSync(validatedPath, newContent);
}

/**
 * Remove a key from an .env file
 */
export async function removeEnvKey(envPath: string, key: string): Promise<void> {
  const validatedPath = validatePath(envPath);

  let content = '';
  try {
    content = await executeWithRetry(
      () => fs.readFile(validatedPath, 'utf-8'),
      `readFile(${envPath})`
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return; // File doesn't exist, nothing to remove
    }
    throw error;
  }

  const newContent = removeEnvKeyFromContent(content, key);
  await executeWithRetry(() => fs.writeFile(validatedPath, newContent), `writeFile(${envPath})`);
}

/**
 * Remove a key from an .env file (synchronous)
 */
export function removeEnvKeySync(envPath: string, key: string): void {
  const validatedPath = validatePath(envPath);

  let content = '';
  try {
    content = fsSync.readFileSync(validatedPath, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return; // File doesn't exist, nothing to remove
    }
    throw error;
  }

  const newContent = removeEnvKeyFromContent(content, key);
  fsSync.writeFileSync(validatedPath, newContent);
}

/**
 * Update .env content with a new key-value pair
 */
function updateEnvContent(content: string, key: string, value: string): string {
  const lines = content.split('\n');
  const keyPrefix = `${key}=`;
  let found = false;

  const newLines = lines.map((line) => {
    if (line.trim().startsWith(keyPrefix)) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });

  if (!found) {
    // Add the key at the end
    if (newLines.length > 0 && newLines[newLines.length - 1].trim() !== '') {
      newLines.push(`${key}=${value}`);
    } else {
      // Replace last empty line or add to empty file
      if (newLines.length === 0 || (newLines.length === 1 && newLines[0] === '')) {
        newLines[0] = `${key}=${value}`;
      } else {
        newLines[newLines.length - 1] = `${key}=${value}`;
      }
    }
  }

  // Ensure file ends with newline
  let result = newLines.join('\n');
  if (!result.endsWith('\n')) {
    result += '\n';
  }
  return result;
}

/**
 * Remove a key from .env content
 */
function removeEnvKeyFromContent(content: string, key: string): string {
  const lines = content.split('\n');
  const keyPrefix = `${key}=`;
  const newLines = lines.filter((line) => !line.trim().startsWith(keyPrefix));

  // Remove trailing empty lines
  while (newLines.length > 0 && newLines[newLines.length - 1].trim() === '') {
    newLines.pop();
  }

  // Ensure file ends with newline if there's content
  let result = newLines.join('\n');
  if (result.length > 0 && !result.endsWith('\n')) {
    result += '\n';
  }
  return result;
}
