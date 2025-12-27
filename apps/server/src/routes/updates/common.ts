/**
 * Common utilities for update routes
 */

import { createLogger } from '@automaker/utils';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import { getErrorMessage as getErrorMessageShared, createLogError } from '../common.js';

const logger = createLogger('Updates');
export const execAsync = promisify(exec);

// Re-export shared utilities
export { getErrorMessageShared as getErrorMessage };
export const logError = createLogError(logger);

// ============================================================================
// Extended PATH configuration for Electron apps
// ============================================================================

const pathSeparator = process.platform === 'win32' ? ';' : ':';
const additionalPaths: string[] = [];

if (process.platform === 'win32') {
  // Windows paths
  if (process.env.LOCALAPPDATA) {
    additionalPaths.push(`${process.env.LOCALAPPDATA}\\Programs\\Git\\cmd`);
  }
  if (process.env.PROGRAMFILES) {
    additionalPaths.push(`${process.env.PROGRAMFILES}\\Git\\cmd`);
  }
  if (process.env['ProgramFiles(x86)']) {
    additionalPaths.push(`${process.env['ProgramFiles(x86)']}\\Git\\cmd`);
  }
} else {
  // Unix/Mac paths
  additionalPaths.push(
    '/opt/homebrew/bin', // Homebrew on Apple Silicon
    '/usr/local/bin', // Homebrew on Intel Mac, common Linux location
    '/home/linuxbrew/.linuxbrew/bin', // Linuxbrew
    `${process.env.HOME}/.local/bin` // pipx, other user installs
  );
}

const extendedPath = [process.env.PATH, ...additionalPaths.filter(Boolean)]
  .filter(Boolean)
  .join(pathSeparator);

/**
 * Environment variables with extended PATH for executing shell commands.
 */
export const execEnv = {
  ...process.env,
  PATH: extendedPath,
};

// ============================================================================
// Automaker installation path
// ============================================================================

/**
 * Get the root directory of the Automaker installation.
 * This is the directory containing the package.json (monorepo root).
 */
export function getAutomakerRoot(): string {
  // In ESM, we use import.meta.url to get the current file path
  // This file is at: apps/server/src/routes/updates/common.ts
  // So we need to go up 5 levels to get to the monorepo root
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  // Go up from: updates -> routes -> src -> server -> apps -> root
  return path.resolve(__dirname, '..', '..', '..', '..', '..');
}

/**
 * Check if git is available on the system
 */
export async function isGitAvailable(): Promise<boolean> {
  try {
    await execAsync('git --version', { env: execEnv });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a path is a git repository
 */
export async function isGitRepo(repoPath: string): Promise<boolean> {
  try {
    await execAsync('git rev-parse --is-inside-work-tree', { cwd: repoPath, env: execEnv });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the current HEAD commit hash
 */
export async function getCurrentCommit(repoPath: string): Promise<string> {
  const { stdout } = await execAsync('git rev-parse HEAD', { cwd: repoPath, env: execEnv });
  return stdout.trim();
}

/**
 * Get the short version of a commit hash
 */
export async function getShortCommit(repoPath: string): Promise<string> {
  const { stdout } = await execAsync('git rev-parse --short HEAD', { cwd: repoPath, env: execEnv });
  return stdout.trim();
}

/**
 * Check if the repo has local uncommitted changes
 */
export async function hasLocalChanges(repoPath: string): Promise<boolean> {
  const { stdout } = await execAsync('git status --porcelain', { cwd: repoPath, env: execEnv });
  return stdout.trim().length > 0;
}

/**
 * Validate that a URL looks like a valid git remote URL
 */
export function isValidGitUrl(url: string): boolean {
  // Allow HTTPS and SSH git URLs
  return (
    url.startsWith('https://') ||
    url.startsWith('git@') ||
    url.startsWith('git://') ||
    url.startsWith('ssh://')
  );
}
