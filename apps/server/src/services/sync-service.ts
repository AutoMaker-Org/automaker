/**
 * SyncService - Pull then push in a single operation
 *
 * Composes performPull() and performPush() to synchronize a branch
 * with its remote. Always uses stashIfNeeded for the pull step.
 * If push fails with divergence after pull, retries once.
 *
 * Follows the same pattern as pull-service.ts and push-service.ts.
 */

import { createLogger, getErrorMessage } from '@automaker/utils';
import { performPull } from './pull-service.js';
import { performPush } from './push-service.js';
import type { PullResult } from './pull-service.js';
import type { PushResult } from './push-service.js';

const logger = createLogger('SyncService');

// ============================================================================
// Types
// ============================================================================

export interface SyncOptions {
  /** Remote name (defaults to 'origin') */
  remote?: string;
}

export interface SyncResult {
  success: boolean;
  error?: string;
  branch?: string;
  /** Whether the pull step was performed */
  pulled?: boolean;
  /** Whether the push step was performed */
  pushed?: boolean;
  /** Pull resulted in conflicts */
  hasConflicts?: boolean;
  /** Files with merge conflicts */
  conflictFiles?: string[];
  /** Source of conflicts ('pull' | 'stash') */
  conflictSource?: 'pull' | 'stash';
  /** Whether the pull was a fast-forward */
  isFastForward?: boolean;
  /** Whether the pull resulted in a merge commit */
  isMerge?: boolean;
  /** Whether push divergence was auto-resolved */
  autoResolved?: boolean;
  message?: string;
}

// ============================================================================
// Main Service Function
// ============================================================================

/**
 * Perform a sync operation (pull then push) on the given worktree.
 *
 * The workflow:
 * 1. Pull from remote with stashIfNeeded: true
 * 2. If pull has conflicts, stop and return conflict info
 * 3. Push to remote
 * 4. If push fails with divergence after pull, retry once
 *
 * @param worktreePath - Path to the git worktree
 * @param options - Sync options (remote)
 * @returns SyncResult with detailed status information
 */
export async function performSync(
  worktreePath: string,
  options?: SyncOptions
): Promise<SyncResult> {
  const targetRemote = options?.remote || 'origin';

  // 1. Pull from remote
  logger.info('Sync: starting pull', { worktreePath, remote: targetRemote });

  let pullResult: PullResult;
  try {
    pullResult = await performPull(worktreePath, {
      remote: targetRemote,
      stashIfNeeded: true,
    });
  } catch (pullError) {
    return {
      success: false,
      error: `Sync pull failed: ${getErrorMessage(pullError)}`,
    };
  }

  if (!pullResult.success) {
    return {
      success: false,
      branch: pullResult.branch,
      pulled: false,
      pushed: false,
      error: `Sync pull failed: ${pullResult.error}`,
      hasConflicts: pullResult.hasConflicts,
      conflictFiles: pullResult.conflictFiles,
      conflictSource: pullResult.conflictSource,
    };
  }

  // 2. If pull had conflicts, stop and return conflict info
  if (pullResult.hasConflicts) {
    return {
      success: false,
      branch: pullResult.branch,
      pulled: true,
      pushed: false,
      hasConflicts: true,
      conflictFiles: pullResult.conflictFiles,
      conflictSource: pullResult.conflictSource,
      isFastForward: pullResult.isFastForward,
      isMerge: pullResult.isMerge,
      error: 'Sync stopped: pull resulted in merge conflicts. Resolve conflicts and try again.',
      message: pullResult.message,
    };
  }

  // 3. Push to remote
  logger.info('Sync: pull succeeded, starting push', { worktreePath, remote: targetRemote });

  let pushResult: PushResult;
  try {
    pushResult = await performPush(worktreePath, {
      remote: targetRemote,
    });
  } catch (pushError) {
    return {
      success: false,
      branch: pullResult.branch,
      pulled: true,
      pushed: false,
      isFastForward: pullResult.isFastForward,
      isMerge: pullResult.isMerge,
      error: `Sync push failed: ${getErrorMessage(pushError)}`,
    };
  }

  if (!pushResult.success) {
    // 4. If push diverged after pull, retry once with autoResolve
    if (pushResult.diverged) {
      logger.info('Sync: push diverged after pull, retrying with autoResolve', {
        worktreePath,
        remote: targetRemote,
      });

      try {
        const retryResult = await performPush(worktreePath, {
          remote: targetRemote,
          autoResolve: true,
        });

        if (retryResult.success) {
          return {
            success: true,
            branch: retryResult.branch,
            pulled: true,
            pushed: true,
            autoResolved: true,
            isFastForward: pullResult.isFastForward,
            isMerge: pullResult.isMerge,
            message: 'Sync completed (push required auto-resolve).',
          };
        }

        return {
          success: false,
          branch: retryResult.branch,
          pulled: true,
          pushed: false,
          hasConflicts: retryResult.hasConflicts,
          conflictFiles: retryResult.conflictFiles,
          error: retryResult.error,
        };
      } catch (retryError) {
        return {
          success: false,
          branch: pullResult.branch,
          pulled: true,
          pushed: false,
          error: `Sync push retry failed: ${getErrorMessage(retryError)}`,
        };
      }
    }

    return {
      success: false,
      branch: pushResult.branch,
      pulled: true,
      pushed: false,
      isFastForward: pullResult.isFastForward,
      isMerge: pullResult.isMerge,
      error: `Sync push failed: ${pushResult.error}`,
    };
  }

  return {
    success: true,
    branch: pushResult.branch,
    pulled: pullResult.pulled ?? true,
    pushed: true,
    isFastForward: pullResult.isFastForward,
    isMerge: pullResult.isMerge,
    message: pullResult.pulled
      ? 'Sync completed: pulled latest changes and pushed.'
      : 'Sync completed: already up to date, pushed local commits.',
  };
}
