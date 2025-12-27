/**
 * Common utilities for worktree routes
 */

import { createLogger } from '@automaker/utils';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { getErrorMessage as getErrorMessageShared, createLogError } from '../common.js';
import { FeatureLoader } from '../../services/feature-loader.js';

const logger = createLogger('Worktree');
export const execAsync = promisify(exec);
const featureLoader = new FeatureLoader();

// ============================================================================
// Constants
// ============================================================================

/** Maximum allowed length for git branch names */
export const MAX_BRANCH_NAME_LENGTH = 250;

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
 * Electron apps don't inherit the user's shell PATH, so we need to add
 * common tool installation locations.
 */
export const execEnv = {
  ...process.env,
  PATH: extendedPath,
};

// ============================================================================
// Validation utilities
// ============================================================================

/**
 * Validate branch name to prevent command injection.
 * Git branch names cannot contain: space, ~, ^, :, ?, *, [, \, or control chars.
 * We also reject shell metacharacters for safety.
 */
export function isValidBranchName(name: string): boolean {
  return /^[a-zA-Z0-9._\-/]+$/.test(name) && name.length < MAX_BRANCH_NAME_LENGTH;
}

/**
 * Check if gh CLI is available on the system
 */
export async function isGhCliAvailable(): Promise<boolean> {
  try {
    const checkCommand = process.platform === 'win32' ? 'where gh' : 'command -v gh';
    await execAsync(checkCommand, { env: execEnv });
    return true;
  } catch {
    return false;
  }
}

export const AUTOMAKER_INITIAL_COMMIT_MESSAGE = 'chore: automaker initial commit';

/**
 * Normalize path separators to forward slashes for cross-platform consistency.
 * This ensures paths from `path.join()` (backslashes on Windows) match paths
 * from git commands (which may use forward slashes).
 */
export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * Check if a path is a git repo
 */
export async function isGitRepo(repoPath: string): Promise<boolean> {
  try {
    await execAsync('git rev-parse --is-inside-work-tree', { cwd: repoPath });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a git repository has at least one commit (i.e., HEAD exists)
 * Returns false for freshly initialized repos with no commits
 */
export async function hasCommits(repoPath: string): Promise<boolean> {
  try {
    await execAsync('git rev-parse --verify HEAD', { cwd: repoPath });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if an error is ENOENT (file/path not found or spawn failed)
 * These are expected in test environments with mock paths
 */
export function isENOENT(error: unknown): boolean {
  return error !== null && typeof error === 'object' && 'code' in error && error.code === 'ENOENT';
}

/**
 * Check if a path is a mock/test path that doesn't exist
 */
export function isMockPath(worktreePath: string): boolean {
  return worktreePath.startsWith('/mock/') || worktreePath.includes('/mock/');
}

/**
 * Conditionally log worktree errors - suppress ENOENT for mock paths
 * to reduce noise in test output
 */
export function logWorktreeError(error: unknown, message: string, worktreePath?: string): void {
  // Don't log ENOENT errors for mock paths (expected in tests)
  if (isENOENT(error) && worktreePath && isMockPath(worktreePath)) {
    return;
  }
  logError(error, message);
}

// Re-export shared utilities
export { getErrorMessageShared as getErrorMessage };
export const logError = createLogError(logger);

/**
 * Ensure the repository has at least one commit so git commands that rely on HEAD work.
 * Returns true if an empty commit was created, false if the repo already had commits.
 */
export async function ensureInitialCommit(repoPath: string): Promise<boolean> {
  try {
    await execAsync('git rev-parse --verify HEAD', { cwd: repoPath });
    return false;
  } catch {
    try {
      await execAsync(`git commit --allow-empty -m "${AUTOMAKER_INITIAL_COMMIT_MESSAGE}"`, {
        cwd: repoPath,
      });
      logger.info(`[Worktree] Created initial empty commit to enable worktrees in ${repoPath}`);
      return true;
    } catch (error) {
      const reason = getErrorMessageShared(error);
      throw new Error(
        `Failed to create initial git commit. Please commit manually and retry. ${reason}`
      );
    }
  }
}
