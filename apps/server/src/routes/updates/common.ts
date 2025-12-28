/**
 * Common utilities for update routes
 */

import { createLogger } from '@automaker/utils';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
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
    '/home/linuxbrew/.linuxbrew/bin' // Linuxbrew
  );
  // pipx, other user installs - only add if HOME is defined
  if (process.env.HOME) {
    additionalPaths.push(`${process.env.HOME}/.local/bin`);
  }
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
 * Traverses up from the current file looking for a package.json with name "automaker".
 * This approach is more robust than using fixed relative paths.
 */
export function getAutomakerRoot(): string {
  const __filename = fileURLToPath(import.meta.url);
  let currentDir = path.dirname(__filename);
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    const packageJsonPath = path.join(currentDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        // Look for the monorepo root package.json with name "automaker"
        if (packageJson.name === 'automaker') {
          return currentDir;
        }
      } catch {
        // Ignore JSON parse errors, continue searching
      }
    }
    currentDir = path.dirname(currentDir);
  }

  // Fallback to fixed path if marker not found (shouldn't happen in normal usage)
  const fallbackDir = path.dirname(__filename);
  return path.resolve(fallbackDir, '..', '..', '..', '..', '..');
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
 * Validate that a URL looks like a valid git remote URL.
 * Also blocks shell metacharacters to prevent command injection.
 */
export function isValidGitUrl(url: string): boolean {
  // Allow HTTPS, SSH, and git protocols
  const startsWithValidProtocol =
    url.startsWith('https://') ||
    url.startsWith('git@') ||
    url.startsWith('git://') ||
    url.startsWith('ssh://');

  // Block shell metacharacters to prevent command injection
  const hasShellChars = /[;`|&<>()$!\\[\] ]/.test(url);

  return startsWithValidProtocol && !hasShellChars;
}

/**
 * Execute a callback with a temporary git remote, ensuring cleanup.
 * Centralizes the pattern of adding a temp remote, doing work, and removing it.
 */
export async function withTempGitRemote<T>(
  installPath: string,
  sourceUrl: string,
  callback: (tempRemoteName: string) => Promise<T>
): Promise<T> {
  const tempRemoteName = `automaker-temp-remote-${crypto.randomBytes(8).toString('hex')}`;
  try {
    await execAsync(`git remote add ${tempRemoteName} "${sourceUrl}"`, {
      cwd: installPath,
      env: execEnv,
    });
    return await callback(tempRemoteName);
  } finally {
    try {
      await execAsync(`git remote remove ${tempRemoteName}`, {
        cwd: installPath,
        env: execEnv,
      });
    } catch {
      // Ignore cleanup errors
    }
  }
}
