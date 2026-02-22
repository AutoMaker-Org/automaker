/**
 * PushService - Push git operations without HTTP
 *
 * Encapsulates the full git push workflow including:
 * - Branch name and detached HEAD detection
 * - Safe array-based command execution (no shell interpolation)
 * - Divergent branch detection and auto-resolution via pull-then-retry
 * - Structured result reporting
 *
 * Mirrors the pull-service.ts pattern for consistency.
 */

import { createLogger, getErrorMessage } from '@automaker/utils';
import { execGitCommand } from '@automaker/git-utils';
import { getCurrentBranch } from '../lib/git.js';
import { performPull } from './pull-service.js';

const logger = createLogger('PushService');

// ============================================================================
// Types
// ============================================================================

export interface PushOptions {
  /** Remote name to push to (defaults to 'origin') */
  remote?: string;
  /** Force push */
  force?: boolean;
  /** When true and push is rejected due to divergence, pull then retry push */
  autoResolve?: boolean;
}

export interface PushResult {
  success: boolean;
  error?: string;
  branch?: string;
  pushed?: boolean;
  /** Whether the push was initially rejected because the branches diverged */
  diverged?: boolean;
  /** Whether divergence was automatically resolved via pull-then-retry */
  autoResolved?: boolean;
  /** Whether the auto-resolve pull resulted in merge conflicts */
  hasConflicts?: boolean;
  /** Files with merge conflicts (only when hasConflicts is true) */
  conflictFiles?: string[];
  message?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Detect whether push error output indicates a diverged/non-fast-forward rejection.
 */
function isDivergenceError(errorOutput: string): boolean {
  const lower = errorOutput.toLowerCase();
  // Require specific divergence indicators rather than just 'rejected' alone,
  // which could match pre-receive hook rejections or protected branch errors.
  const hasNonFastForward = lower.includes('non-fast-forward');
  const hasFetchFirst = lower.includes('fetch first');
  const hasFailedToPush = lower.includes('failed to push some refs');
  const hasRejected = lower.includes('rejected');
  return hasNonFastForward || hasFetchFirst || (hasRejected && hasFailedToPush);
}

// ============================================================================
// Main Service Function
// ============================================================================

/**
 * Perform a git push on the given worktree.
 *
 * The workflow:
 * 1. Get current branch name (detect detached HEAD)
 * 2. Attempt `git push <remote> <branch>` with safe array args
 * 3. If push fails with divergence and autoResolve is true:
 *    a. Pull from the same remote (with stash support)
 *    b. If pull succeeds without conflicts, retry push
 * 4. If push fails with "no upstream" error, retry with --set-upstream
 * 5. Return structured result
 *
 * @param worktreePath - Path to the git worktree
 * @param options - Push options (remote, force, autoResolve)
 * @returns PushResult with detailed status information
 */
export async function performPush(
  worktreePath: string,
  options?: PushOptions
): Promise<PushResult> {
  const targetRemote = options?.remote || 'origin';
  const force = options?.force ?? false;
  const autoResolve = options?.autoResolve ?? false;

  // 1. Get current branch name
  let branchName: string;
  try {
    branchName = await getCurrentBranch(worktreePath);
  } catch (err) {
    return {
      success: false,
      error: `Failed to get current branch: ${getErrorMessage(err)}`,
    };
  }

  // 2. Check for detached HEAD state
  if (branchName === 'HEAD') {
    return {
      success: false,
      error: 'Cannot push in detached HEAD state. Please checkout a branch first.',
    };
  }

  // 3. Build push args (no -u flag; upstream is set in the fallback path only when needed)
  const pushArgs = ['push', targetRemote, branchName];
  if (force) {
    pushArgs.push('--force');
  }

  // 4. Attempt push
  try {
    await execGitCommand(pushArgs, worktreePath);

    return {
      success: true,
      branch: branchName,
      pushed: true,
      message: `Successfully pushed ${branchName} to ${targetRemote}`,
    };
  } catch (pushError: unknown) {
    const err = pushError as { stderr?: string; stdout?: string; message?: string };
    const errorOutput = `${err.stderr || ''} ${err.stdout || ''} ${err.message || ''}`;

    // 5. Check if the error is a divergence rejection
    if (isDivergenceError(errorOutput)) {
      if (!autoResolve) {
        return {
          success: false,
          branch: branchName,
          pushed: false,
          diverged: true,
          error: `Push rejected: remote has changes not present locally. Use sync or pull first, or enable auto-resolve.`,
          message: `Push to ${targetRemote} was rejected because the remote branch has diverged.`,
        };
      }

      // 6. Auto-resolve: pull then retry push
      logger.info('Push rejected due to divergence, attempting auto-resolve via pull', {
        worktreePath,
        remote: targetRemote,
        branch: branchName,
      });

      try {
        const pullResult = await performPull(worktreePath, {
          remote: targetRemote,
          stashIfNeeded: true,
        });

        if (!pullResult.success) {
          return {
            success: false,
            branch: branchName,
            pushed: false,
            diverged: true,
            autoResolved: false,
            error: `Auto-resolve failed during pull: ${pullResult.error}`,
          };
        }

        if (pullResult.hasConflicts) {
          return {
            success: false,
            branch: branchName,
            pushed: false,
            diverged: true,
            autoResolved: false,
            hasConflicts: true,
            conflictFiles: pullResult.conflictFiles,
            error:
              'Auto-resolve pull resulted in merge conflicts. Resolve conflicts and push again.',
          };
        }

        // 7. Retry push after successful pull
        try {
          await execGitCommand(pushArgs, worktreePath);

          return {
            success: true,
            branch: branchName,
            pushed: true,
            diverged: true,
            autoResolved: true,
            message: `Push succeeded after auto-resolving divergence (pulled from ${targetRemote} first).`,
          };
        } catch (retryError: unknown) {
          const retryErr = retryError as { stderr?: string; message?: string };
          return {
            success: false,
            branch: branchName,
            pushed: false,
            diverged: true,
            autoResolved: false,
            error: `Push failed after auto-resolve pull: ${retryErr.stderr || retryErr.message || 'Unknown error'}`,
          };
        }
      } catch (pullError) {
        return {
          success: false,
          branch: branchName,
          pushed: false,
          diverged: true,
          autoResolved: false,
          error: `Auto-resolve pull failed: ${getErrorMessage(pullError)}`,
        };
      }
    }

    // 6b. Non-divergence error (e.g. no upstream configured) - retry with --set-upstream
    const isNoUpstreamError =
      errorOutput.toLowerCase().includes('no upstream') ||
      errorOutput.toLowerCase().includes('has no upstream branch') ||
      errorOutput.toLowerCase().includes('set-upstream');
    if (isNoUpstreamError) {
      try {
        const setUpstreamArgs = ['push', '--set-upstream', targetRemote, branchName];
        if (force) {
          setUpstreamArgs.push('--force');
        }
        await execGitCommand(setUpstreamArgs, worktreePath);

        return {
          success: true,
          branch: branchName,
          pushed: true,
          message: `Successfully pushed ${branchName} to ${targetRemote} (set upstream)`,
        };
      } catch (upstreamError: unknown) {
        const upstreamErr = upstreamError as { stderr?: string; message?: string };
        return {
          success: false,
          branch: branchName,
          pushed: false,
          error: upstreamErr.stderr || upstreamErr.message || getErrorMessage(pushError),
        };
      }
    }

    // 6c. Other push error - return as-is
    return {
      success: false,
      branch: branchName,
      pushed: false,
      error: err.stderr || err.message || getErrorMessage(pushError),
    };
  }
}
