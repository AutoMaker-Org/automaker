/**
 * Shared git command execution utilities.
 *
 * This module provides the canonical `execGitCommand` helper and common
 * git utilities used across services and routes.  All consumers should
 * import from here rather than defining their own copy.
 */

import fs from 'fs/promises';
import path from 'path';
import { spawnProcess } from '@automaker/platform';
import { createLogger } from '@automaker/utils';

const logger = createLogger('GitLib');

// Extended PATH so git is found when the process does not inherit a full shell PATH
// (e.g. Electron, some CI, or IDE-launched processes).
const pathSeparator = process.platform === 'win32' ? ';' : ':';
const extraPaths: string[] =
  process.platform === 'win32'
    ? ([
        process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}\\Programs\\Git\\cmd`,
        process.env.PROGRAMFILES && `${process.env.PROGRAMFILES}\\Git\\cmd`,
        process.env['ProgramFiles(x86)'] && `${process.env['ProgramFiles(x86)']}\\Git\\cmd`,
      ].filter(Boolean) as string[])
    : [
        '/opt/homebrew/bin',
        '/usr/local/bin',
        '/usr/bin',
        '/home/linuxbrew/.linuxbrew/bin',
        process.env.HOME ? `${process.env.HOME}/.local/bin` : '',
      ].filter(Boolean);

const extendedPath = [process.env.PATH, ...extraPaths].filter(Boolean).join(pathSeparator);
const gitEnv = { ...process.env, PATH: extendedPath };

// ============================================================================
// Secure Command Execution
// ============================================================================

/**
 * Execute git command with array arguments to prevent command injection.
 * Uses spawnProcess from @automaker/platform for secure, cross-platform execution.
 *
 * @param args - Array of git command arguments (e.g., ['worktree', 'add', path])
 * @param cwd - Working directory to execute the command in
 * @param env - Optional additional environment variables to pass to the git process.
 *   These are merged on top of the current process environment.  Pass
 *   `{ LC_ALL: 'C' }` to force git to emit English output regardless of the
 *   system locale so that text-based output parsing remains reliable.
 * @param abortController - Optional AbortController to cancel the git process.
 *   When the controller is aborted the underlying process is sent SIGTERM and
 *   the returned promise rejects with an Error whose message is 'Process aborted'.
 * @returns Promise resolving to stdout output
 * @throws Error with stderr/stdout message if command fails. The thrown error
 *   also has `stdout` and `stderr` string properties for structured access.
 *
 * @example
 * ```typescript
 * // Safe: no injection possible
 * await execGitCommand(['branch', '-D', branchName], projectPath);
 *
 * // Force English output for reliable text parsing:
 * await execGitCommand(['rebase', '--', 'main'], worktreePath, { LC_ALL: 'C' });
 *
 * // With a process-level timeout:
 * const controller = new AbortController();
 * const timerId = setTimeout(() => controller.abort(), 30_000);
 * try {
 *   await execGitCommand(['fetch', '--all', '--quiet'], cwd, undefined, controller);
 * } finally {
 *   clearTimeout(timerId);
 * }
 *
 * // Instead of unsafe:
 * // await execAsync(`git branch -D ${branchName}`, { cwd });
 * ```
 */
export async function execGitCommand(
  args: string[],
  cwd: string,
  env?: Record<string, string>,
  abortController?: AbortController
): Promise<string> {
  const result = await spawnProcess({
    command: 'git',
    args,
    cwd,
    env:
      env !== undefined
        ? {
            ...gitEnv,
            ...env,
            PATH: [gitEnv.PATH, env.PATH].filter(Boolean).join(pathSeparator),
          }
        : gitEnv,
    ...(abortController !== undefined ? { abortController } : {}),
  });

  // spawnProcess returns { stdout, stderr, exitCode }
  if (result.exitCode === 0) {
    return result.stdout;
  } else {
    const errorMessage =
      result.stderr || result.stdout || `Git command failed with code ${result.exitCode}`;
    throw Object.assign(new Error(errorMessage), {
      stdout: result.stdout,
      stderr: result.stderr,
    });
  }
}

// ============================================================================
// Common Git Utilities
// ============================================================================

/**
 * Get the current branch name for the given worktree.
 *
 * This is the canonical implementation shared across services.  Services
 * should import this rather than duplicating the logic locally.
 *
 * @param worktreePath - Path to the git worktree
 * @returns The current branch name (trimmed)
 */
export async function getCurrentBranch(worktreePath: string): Promise<string> {
  const branchOutput = await execGitCommand(['rev-parse', '--abbrev-ref', 'HEAD'], worktreePath);
  return branchOutput.trim();
}

// ============================================================================
// Index Lock Recovery
// ============================================================================

/**
 * Check whether an error message indicates a stale git index lock file.
 *
 * Git operations that write to the index (e.g. `git stash push`) will fail
 * with "could not write index" or "Unable to create ... .lock" when a
 * `.git/index.lock` file exists from a previously interrupted operation.
 *
 * @param errorMessage - The error string from a failed git command
 * @returns true if the error looks like a stale index lock issue
 */
export function isIndexLockError(errorMessage: string): boolean {
  const lower = errorMessage.toLowerCase();
  return (
    lower.includes('could not write index') ||
    (lower.includes('unable to create') && lower.includes('index.lock')) ||
    lower.includes('index.lock')
  );
}

/**
 * Attempt to remove a stale `.git/index.lock` file for the given worktree.
 *
 * Uses `git rev-parse --git-dir` to locate the correct `.git` directory,
 * which works for both regular repositories and linked worktrees.
 *
 * @param worktreePath - Path to the git worktree (or main repo)
 * @returns true if a lock file was found and removed, false otherwise
 */
export async function removeStaleIndexLock(worktreePath: string): Promise<boolean> {
  try {
    // Resolve the .git directory (handles worktrees correctly)
    const gitDirRaw = await execGitCommand(['rev-parse', '--git-dir'], worktreePath);
    const gitDir = path.resolve(worktreePath, gitDirRaw.trim());
    const lockFilePath = path.join(gitDir, 'index.lock');

    // Check if the lock file exists
    try {
      await fs.access(lockFilePath);
    } catch {
      // Lock file does not exist — nothing to remove
      return false;
    }

    // Remove the stale lock file
    await fs.unlink(lockFilePath);
    logger.info('Removed stale index.lock file', { worktreePath, lockFilePath });
    return true;
  } catch (err) {
    logger.warn('Failed to remove stale index.lock file', {
      worktreePath,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * Execute a git command with automatic retry when a stale index.lock is detected.
 *
 * If the command fails with an error indicating a locked index file, this
 * helper will attempt to remove the stale `.git/index.lock` and retry the
 * command exactly once.
 *
 * This is particularly useful for `git stash push` which writes to the
 * index and commonly fails when a previous git operation was interrupted.
 *
 * @param args - Array of git command arguments
 * @param cwd - Working directory to execute the command in
 * @param env - Optional additional environment variables
 * @returns Promise resolving to stdout output
 * @throws The original error if retry also fails, or a non-lock error
 */
export async function execGitCommandWithLockRetry(
  args: string[],
  cwd: string,
  env?: Record<string, string>
): Promise<string> {
  try {
    return await execGitCommand(args, cwd, env);
  } catch (error: unknown) {
    const err = error as { message?: string; stderr?: string };
    const errorMessage = err.stderr || err.message || '';

    if (!isIndexLockError(errorMessage)) {
      throw error;
    }

    logger.info('Git command failed due to index lock, attempting cleanup and retry', {
      cwd,
      args: args.join(' '),
    });

    const removed = await removeStaleIndexLock(cwd);
    if (!removed) {
      // Could not remove the lock file — re-throw the original error
      throw error;
    }

    // Retry the command once after removing the lock file
    return await execGitCommand(args, cwd, env);
  }
}
