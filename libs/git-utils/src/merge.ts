/**
 * Git merge and worktree cleanup utilities
 *
 * Reusable merge logic extracted from the worktree merge route
 * for use in auto-mode auto-merge and other contexts.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '@automaker/utils';

const execAsync = promisify(exec);
const logger = createLogger('GitMerge');

export interface MergeResult {
  success: boolean;
  hasConflicts: boolean;
  error?: string;
}

export interface CleanupResult {
  worktreeDeleted: boolean;
  branchDeleted: boolean;
}

/**
 * Validate branch name to prevent command injection.
 * Git branch names cannot contain: space, ~, ^, :, ?, *, [, \, or control chars.
 */
function isValidBranchName(name: string): boolean {
  return /^[a-zA-Z0-9._\-/]+$/.test(name) && name.length < 250;
}

/**
 * Merge a worktree branch into a target branch.
 *
 * Checks out the target branch, runs `git merge` (squash or regular),
 * and detects conflicts via stdout/stderr.
 *
 * @param projectPath - Path to the main git repository
 * @param branchName - Source branch to merge from
 * @param mergeTo - Target branch to merge into (e.g. 'main')
 * @param options - Merge options (squash, custom message)
 * @returns MergeResult indicating success/failure and conflict status
 */
export async function mergeWorktreeBranch(
  projectPath: string,
  branchName: string,
  mergeTo: string,
  options?: { squash?: boolean; message?: string }
): Promise<MergeResult> {
  // Validate branch names
  if (!isValidBranchName(branchName) || !isValidBranchName(mergeTo)) {
    return { success: false, hasConflicts: false, error: 'Invalid branch name' };
  }

  // Validate source branch exists
  try {
    await execAsync(`git rev-parse --verify ${branchName}`, { cwd: projectPath });
  } catch {
    return { success: false, hasConflicts: false, error: `Branch "${branchName}" does not exist` };
  }

  // Validate target branch exists
  try {
    await execAsync(`git rev-parse --verify ${mergeTo}`, { cwd: projectPath });
  } catch {
    return {
      success: false,
      hasConflicts: false,
      error: `Target branch "${mergeTo}" does not exist`,
    };
  }

  // Checkout target branch
  try {
    await execAsync(`git checkout ${mergeTo}`, { cwd: projectPath });
  } catch (error) {
    const err = error as { message?: string };
    return {
      success: false,
      hasConflicts: false,
      error: `Failed to checkout ${mergeTo}: ${err.message || 'unknown error'}`,
    };
  }

  // Merge the feature branch
  const mergeMsg = options?.message || `Merge ${branchName} into ${mergeTo}`;
  const mergeCmd = options?.squash
    ? `git merge --squash ${branchName}`
    : `git merge ${branchName} -m "${mergeMsg}"`;

  try {
    await execAsync(mergeCmd, { cwd: projectPath });
  } catch (mergeError: unknown) {
    const err = mergeError as { stdout?: string; stderr?: string; message?: string };
    const output = `${err.stdout || ''} ${err.stderr || ''} ${err.message || ''}`;
    const hasConflicts = output.includes('CONFLICT') || output.includes('Automatic merge failed');

    if (hasConflicts) {
      return {
        success: false,
        hasConflicts: true,
        error: `Merge CONFLICT: Automatic merge of "${branchName}" into "${mergeTo}" failed. Please resolve conflicts manually.`,
      };
    }

    return { success: false, hasConflicts: false, error: output.trim() };
  }

  // If squash merge, need to commit
  if (options?.squash) {
    try {
      const squashMsg = options?.message || `Merge ${branchName} (squash)`;
      await execAsync(`git commit -m "${squashMsg}"`, { cwd: projectPath });
    } catch (commitError: unknown) {
      const err = commitError as { message?: string };
      return {
        success: false,
        hasConflicts: false,
        error: `Squash commit failed: ${err.message || 'unknown error'}`,
      };
    }
  }

  return { success: true, hasConflicts: false };
}

/**
 * Clean up a worktree and its branch after a successful merge.
 *
 * Removes the worktree (with fallback to prune) and deletes the branch
 * (skipping main/master for safety).
 *
 * @param projectPath - Path to the main git repository
 * @param worktreePath - Path to the worktree directory to remove
 * @param branchName - Branch to delete after worktree removal
 * @returns CleanupResult indicating what was deleted
 */
export async function cleanupWorktree(
  projectPath: string,
  worktreePath: string,
  branchName: string
): Promise<CleanupResult> {
  let worktreeDeleted = false;
  let branchDeleted = false;

  // Remove the worktree
  try {
    await execAsync(`git worktree remove "${worktreePath}" --force`, { cwd: projectPath });
    worktreeDeleted = true;
  } catch {
    // Try with prune if remove fails
    try {
      await execAsync('git worktree prune', { cwd: projectPath });
      worktreeDeleted = true;
    } catch {
      logger.warn(`Failed to remove worktree: ${worktreePath}`);
    }
  }

  // Delete the branch (but not main/master)
  if (branchName !== 'main' && branchName !== 'master') {
    if (!isValidBranchName(branchName)) {
      logger.warn(`Invalid branch name detected, skipping deletion: ${branchName}`);
    } else {
      try {
        await execAsync(`git branch -D ${branchName}`, { cwd: projectPath });
        branchDeleted = true;
      } catch {
        logger.warn(`Failed to delete branch: ${branchName}`);
      }
    }
  }

  return { worktreeDeleted, branchDeleted };
}
