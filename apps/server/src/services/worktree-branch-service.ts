/**
 * WorktreeBranchService - Switch branch operations without HTTP
 *
 * Handles branch switching with automatic stash/reapply of local changes.
 * If there are uncommitted changes, they are stashed before switching and
 * reapplied after. If the stash pop results in merge conflicts, returns
 * a special response so the UI can create a conflict resolution task.
 *
 * For remote branches (e.g., "origin/feature"), automatically creates a
 * local tracking branch and checks it out.
 *
 * Fetches the latest remote refs before switching to ensure remote branch
 * references are up-to-date for accurate detection and checkout.
 *
 * Extracted from the worktree switch-branch route to improve organization
 * and testability. Follows the same pattern as pull-service.ts and
 * rebase-service.ts.
 */

import { createLogger, getErrorMessage } from '@automaker/utils';
import { execGitCommand } from '../lib/git.js';
import type { EventEmitter } from '../lib/events.js';
import { hasAnyChanges, stashChanges, popStash, localBranchExists } from './branch-utils.js';

const logger = createLogger('WorktreeBranchService');

// ============================================================================
// Types
// ============================================================================

export interface SwitchBranchResult {
  success: boolean;
  error?: string;
  result?: {
    previousBranch: string;
    currentBranch: string;
    message: string;
    hasConflicts?: boolean;
    stashedChanges?: boolean;
  };
  /** Set when checkout fails and stash pop produced conflicts during recovery */
  stashPopConflicts?: boolean;
  /** Human-readable message when stash pop conflicts occur during error recovery */
  stashPopConflictMessage?: string;
}

// ============================================================================
// Local Helpers
// ============================================================================

/** Timeout for git fetch operations (30 seconds) */
const FETCH_TIMEOUT_MS = 30_000;

/**
 * Fetch latest from all remotes (silently, with timeout).
 *
 * A process-level timeout is enforced via an AbortController so that a
 * slow or unresponsive remote does not block the branch-switch flow
 * indefinitely.  Timeout errors are logged and treated as non-fatal
 * (the same as network-unavailable errors) so the rest of the workflow
 * continues normally.  This is called before the branch switch to
 * ensure remote refs are up-to-date for branch detection and checkout.
 */
async function fetchRemotes(cwd: string): Promise<void> {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    await execGitCommand(['fetch', '--all', '--quiet'], cwd, undefined, controller);
  } catch (error) {
    if (controller.signal.aborted) {
      // Fetch timed out - log and continue; callers should not be blocked by a slow remote
      logger.warn(
        `fetchRemotes timed out after ${FETCH_TIMEOUT_MS}ms - continuing without latest remote refs`
      );
    } else {
      logger.warn(`fetchRemotes failed: ${getErrorMessage(error)} - continuing with local refs`);
    }
    // Non-fatal: continue with locally available refs regardless of failure type
  } finally {
    clearTimeout(timerId);
  }
}

/**
 * Parse a remote branch name like "origin/feature-branch" into its parts.
 * Splits on the first slash so the remote is the segment before the first '/'
 * and the branch is everything after it (preserving any subsequent slashes).
 * For example, "origin/feature/my-branch" → { remote: "origin", branch: "feature/my-branch" }.
 * Returns null if the input contains no slash.
 */
function parseRemoteBranch(branchName: string): { remote: string; branch: string } | null {
  const firstSlash = branchName.indexOf('/');
  if (firstSlash === -1) return null;
  return {
    remote: branchName.substring(0, firstSlash),
    branch: branchName.substring(firstSlash + 1),
  };
}

/**
 * Check if a branch name refers to a remote branch
 */
async function isRemoteBranch(cwd: string, branchName: string): Promise<boolean> {
  try {
    const stdout = await execGitCommand(['branch', '-r', '--format=%(refname:short)'], cwd);
    const remoteBranches = stdout
      .trim()
      .split('\n')
      .map((b) => b.trim().replace(/^['"]|['"]$/g, ''))
      .filter((b) => b);
    return remoteBranches.includes(branchName);
  } catch (err) {
    logger.error('isRemoteBranch: failed to list remote branches — returning false', {
      branchName,
      cwd,
      error: getErrorMessage(err),
    });
    return false;
  }
}

// ============================================================================
// Main Service Function
// ============================================================================

/**
 * Perform a full branch switch workflow on the given worktree.
 *
 * The workflow:
 * 1. Fetch latest from all remotes (ensures remote refs are up-to-date)
 * 2. Get current branch name
 * 3. Detect remote vs local branch and determine target
 * 4. Return early if already on target branch
 * 5. Validate branch existence
 * 6. Stash local changes if any
 * 7. Checkout the target branch
 * 8. Reapply stashed changes (detect conflicts)
 * 9. Handle error recovery (restore stash if checkout fails)
 *
 * @param worktreePath - Path to the git worktree
 * @param branchName - Branch to switch to (can be local or remote like "origin/feature")
 * @param events - Optional event emitter for lifecycle events
 * @returns SwitchBranchResult with detailed status information
 */
export async function performSwitchBranch(
  worktreePath: string,
  branchName: string,
  events?: EventEmitter
): Promise<SwitchBranchResult> {
  // Emit start event
  events?.emit('switch:start', { worktreePath, branchName });

  // 1. Fetch latest from all remotes before switching
  //    This ensures remote branch refs are up-to-date so that isRemoteBranch()
  //    can detect newly created remote branches and local tracking branches
  //    are aware of upstream changes.
  await fetchRemotes(worktreePath);

  // 2. Get current branch
  const currentBranchOutput = await execGitCommand(
    ['rev-parse', '--abbrev-ref', 'HEAD'],
    worktreePath
  );
  const previousBranch = currentBranchOutput.trim();

  // 3. Determine the actual target branch name for checkout
  let targetBranch = branchName;
  let isRemote = false;

  // Check if this is a remote branch (e.g., "origin/feature-branch")
  let parsedRemote: { remote: string; branch: string } | null = null;
  if (await isRemoteBranch(worktreePath, branchName)) {
    isRemote = true;
    parsedRemote = parseRemoteBranch(branchName);
    if (parsedRemote) {
      targetBranch = parsedRemote.branch;
    } else {
      events?.emit('switch:error', {
        worktreePath,
        branchName,
        error: `Failed to parse remote branch name '${branchName}'`,
      });
      return {
        success: false,
        error: `Failed to parse remote branch name '${branchName}'`,
      };
    }
  }

  // 4. Return early if already on the target branch
  if (previousBranch === targetBranch) {
    events?.emit('switch:done', {
      worktreePath,
      previousBranch,
      currentBranch: targetBranch,
      alreadyOnBranch: true,
    });
    return {
      success: true,
      result: {
        previousBranch,
        currentBranch: targetBranch,
        message: `Already on branch '${targetBranch}'`,
      },
    };
  }

  // 5. Check if target branch exists as a local branch
  if (!isRemote) {
    if (!(await localBranchExists(worktreePath, branchName))) {
      events?.emit('switch:error', {
        worktreePath,
        branchName,
        error: `Branch '${branchName}' does not exist`,
      });
      return {
        success: false,
        error: `Branch '${branchName}' does not exist`,
      };
    }
  }

  // 6. Stash local changes if any exist
  const hadChanges = await hasAnyChanges(worktreePath, { excludeWorktreePaths: true });
  let didStash = false;

  if (hadChanges) {
    events?.emit('switch:stash', {
      worktreePath,
      previousBranch,
      targetBranch,
      action: 'push',
    });
    const stashMessage = `automaker-branch-switch: ${previousBranch} → ${targetBranch}`;
    try {
      didStash = await stashChanges(worktreePath, stashMessage, true);
    } catch (stashError) {
      const stashErrorMsg = getErrorMessage(stashError);
      events?.emit('switch:error', {
        worktreePath,
        branchName,
        error: `Failed to stash local changes: ${stashErrorMsg}`,
      });
      return {
        success: false,
        error: `Failed to stash local changes before switching branches: ${stashErrorMsg}`,
      };
    }
  }

  try {
    // 7. Switch to the target branch
    events?.emit('switch:checkout', {
      worktreePath,
      targetBranch,
      isRemote,
      previousBranch,
    });

    if (isRemote) {
      if (!parsedRemote) {
        throw new Error(`Failed to parse remote branch name '${branchName}'`);
      }
      if (await localBranchExists(worktreePath, parsedRemote.branch)) {
        // Local branch exists, just checkout
        await execGitCommand(['checkout', parsedRemote.branch], worktreePath);
      } else {
        // Create local tracking branch from remote
        await execGitCommand(['checkout', '-b', parsedRemote.branch, branchName], worktreePath);
      }
    } else {
      await execGitCommand(['checkout', targetBranch], worktreePath);
    }

    // 8. Reapply stashed changes if we stashed earlier
    let hasConflicts = false;
    let conflictMessage = '';
    let stashReapplied = false;

    if (didStash) {
      events?.emit('switch:pop', {
        worktreePath,
        targetBranch,
        action: 'pop',
      });

      const popResult = await popStash(worktreePath);
      hasConflicts = popResult.hasConflicts;
      if (popResult.hasConflicts) {
        conflictMessage = `Switched to branch '${targetBranch}' but merge conflicts occurred when reapplying your local changes. Please resolve the conflicts.`;
      } else if (!popResult.success) {
        // Stash pop failed for a non-conflict reason - the stash is still there
        conflictMessage = `Switched to branch '${targetBranch}' but failed to reapply stashed changes: ${popResult.error}. Your changes are still in the stash.`;
      } else {
        stashReapplied = true;
      }
    }

    if (hasConflicts) {
      events?.emit('switch:done', {
        worktreePath,
        previousBranch,
        currentBranch: targetBranch,
        hasConflicts: true,
      });
      return {
        success: true,
        result: {
          previousBranch,
          currentBranch: targetBranch,
          message: conflictMessage,
          hasConflicts: true,
          stashedChanges: true,
        },
      };
    } else if (didStash && !stashReapplied) {
      // Stash pop failed for a non-conflict reason — stash is still present
      events?.emit('switch:done', {
        worktreePath,
        previousBranch,
        currentBranch: targetBranch,
        stashPopFailed: true,
      });
      return {
        success: true,
        result: {
          previousBranch,
          currentBranch: targetBranch,
          message: conflictMessage,
          hasConflicts: false,
          stashedChanges: true,
        },
      };
    } else {
      const stashNote = stashReapplied ? ' (local changes stashed and reapplied)' : '';
      events?.emit('switch:done', {
        worktreePath,
        previousBranch,
        currentBranch: targetBranch,
        stashReapplied,
      });
      return {
        success: true,
        result: {
          previousBranch,
          currentBranch: targetBranch,
          message: `Switched to branch '${targetBranch}'${stashNote}`,
          hasConflicts: false,
          stashedChanges: stashReapplied,
        },
      };
    }
  } catch (checkoutError) {
    // 9. Error recovery: if checkout failed and we stashed, try to restore the stash
    if (didStash) {
      const popResult = await popStash(worktreePath);
      if (popResult.hasConflicts) {
        // Stash pop itself produced merge conflicts — the working tree is now in a
        // conflicted state even though the checkout failed. Surface this clearly so
        // the caller can prompt the user (or AI) to resolve conflicts rather than
        // simply retrying the branch switch.
        const checkoutErrorMsg = getErrorMessage(checkoutError);
        events?.emit('switch:error', {
          worktreePath,
          branchName,
          error: checkoutErrorMsg,
          stashPopConflicts: true,
        });
        return {
          success: false,
          error: checkoutErrorMsg,
          stashPopConflicts: true,
          stashPopConflictMessage:
            'Stash pop resulted in conflicts: your stashed changes were partially reapplied ' +
            'but produced merge conflicts. Please resolve the conflicts before retrying the branch switch.',
        };
      } else if (!popResult.success) {
        // Stash pop failed for a non-conflict reason; the stash entry is still intact.
        // Include this detail alongside the original checkout error.
        const checkoutErrorMsg = getErrorMessage(checkoutError);
        const combinedMessage =
          `${checkoutErrorMsg}. Additionally, restoring your stashed changes failed: ` +
          `${popResult.error ?? 'unknown error'} — your changes are still saved in the stash.`;
        events?.emit('switch:error', {
          worktreePath,
          branchName,
          error: combinedMessage,
        });
        return {
          success: false,
          error: combinedMessage,
          stashPopConflicts: false,
        };
      }
      // popResult.success === true: stash was cleanly restored, re-throw the checkout error
    }
    const checkoutErrorMsg = getErrorMessage(checkoutError);
    events?.emit('switch:error', {
      worktreePath,
      branchName,
      error: checkoutErrorMsg,
    });
    throw checkoutError;
  }
}
