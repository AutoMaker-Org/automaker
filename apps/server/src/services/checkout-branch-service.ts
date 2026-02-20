/**
 * CheckoutBranchService - Create and checkout a new branch with stash handling
 *
 * Handles new branch creation with automatic stash/reapply of local changes.
 * If there are uncommitted changes and the caller requests stashing, they are
 * stashed before creating the branch and reapplied after. If the stash pop
 * results in merge conflicts, returns a special response so the UI can create
 * a conflict resolution task.
 *
 * Follows the same pattern as worktree-branch-service.ts (performSwitchBranch).
 *
 * The workflow:
 * 0. Fetch latest from all remotes (ensures remote refs are up-to-date)
 * 1. Validate inputs (branch name, base branch)
 * 2. Get current branch name
 * 3. Check if target branch already exists
 * 4. Optionally stash local changes
 * 5. Create and checkout the new branch
 * 6. Reapply stashed changes (detect conflicts)
 * 7. Handle error recovery (restore stash if checkout fails)
 */

import { createLogger, getErrorMessage } from '@automaker/utils';
import { execGitCommand } from '../lib/git.js';
import type { EventEmitter } from '../lib/events.js';
import { hasAnyChanges, stashChanges, popStash, localBranchExists } from './branch-utils.js';

const logger = createLogger('CheckoutBranchService');

// ============================================================================
// Local Helpers
// ============================================================================

/** Timeout for git fetch operations (30 seconds) */
const FETCH_TIMEOUT_MS = 30_000;

/**
 * Fetch latest from all remotes (silently, with timeout).
 *
 * A process-level timeout is enforced via an AbortController so that a
 * slow or unresponsive remote does not block the branch creation flow
 * indefinitely.  Timeout errors are logged and treated as non-fatal
 * (the same as network-unavailable errors) so the rest of the workflow
 * continues normally.  This is called before creating the new branch to
 * ensure remote refs are up-to-date when a remote base branch is used.
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

// ============================================================================
// Types
// ============================================================================

export interface CheckoutBranchOptions {
  /** When true, stash local changes before checkout and reapply after */
  stashChanges?: boolean;
  /** When true, include untracked files in the stash */
  includeUntracked?: boolean;
}

export interface CheckoutBranchResult {
  success: boolean;
  error?: string;
  result?: {
    previousBranch: string;
    newBranch: string;
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
// Main Service Function
// ============================================================================

/**
 * Create and checkout a new branch, optionally stashing and restoring local changes.
 *
 * @param worktreePath - Path to the git worktree
 * @param branchName - Name of the new branch to create
 * @param baseBranch - Optional base branch to create from (defaults to current HEAD)
 * @param options - Stash handling options
 * @param events - Optional event emitter for lifecycle events
 * @returns CheckoutBranchResult with detailed status information
 */
export async function performCheckoutBranch(
  worktreePath: string,
  branchName: string,
  baseBranch?: string,
  options?: CheckoutBranchOptions,
  events?: EventEmitter
): Promise<CheckoutBranchResult> {
  const shouldStash = options?.stashChanges ?? false;
  const includeUntracked = options?.includeUntracked ?? true;

  // Emit start event
  events?.emit('switch:start', { worktreePath, branchName, operation: 'checkout' });

  // 0. Fetch latest from all remotes before creating the branch
  //    This ensures remote refs are up-to-date so that base branch validation
  //    works correctly for remote branch references (e.g. "origin/main").
  await fetchRemotes(worktreePath);

  // 1. Get current branch
  let previousBranch: string;
  try {
    const currentBranchOutput = await execGitCommand(
      ['rev-parse', '--abbrev-ref', 'HEAD'],
      worktreePath
    );
    previousBranch = currentBranchOutput.trim();
  } catch (branchError) {
    const branchErrorMsg = getErrorMessage(branchError);
    events?.emit('switch:error', {
      worktreePath,
      branchName,
      error: branchErrorMsg,
    });
    return {
      success: false,
      error: `Failed to determine current branch: ${branchErrorMsg}`,
    };
  }

  // 2. Check if branch already exists
  if (await localBranchExists(worktreePath, branchName)) {
    events?.emit('switch:error', {
      worktreePath,
      branchName,
      error: `Branch '${branchName}' already exists`,
    });
    return {
      success: false,
      error: `Branch '${branchName}' already exists`,
    };
  }

  // 3. Validate base branch if provided
  if (baseBranch) {
    try {
      await execGitCommand(['rev-parse', '--verify', baseBranch], worktreePath);
    } catch {
      events?.emit('switch:error', {
        worktreePath,
        branchName,
        error: `Base branch '${baseBranch}' does not exist`,
      });
      return {
        success: false,
        error: `Base branch '${baseBranch}' does not exist`,
      };
    }
  }

  // 4. Stash local changes if requested and there are changes
  let didStash = false;

  if (shouldStash) {
    const hadChanges = await hasAnyChanges(worktreePath, { includeUntracked });
    if (hadChanges) {
      events?.emit('switch:stash', {
        worktreePath,
        previousBranch,
        targetBranch: branchName,
        action: 'push',
      });

      const stashMessage = `Auto-stash before switching to ${branchName}`;
      try {
        didStash = await stashChanges(worktreePath, stashMessage, includeUntracked);
      } catch (stashError) {
        const stashErrorMsg = getErrorMessage(stashError);
        events?.emit('switch:error', {
          worktreePath,
          branchName,
          error: `Failed to stash local changes: ${stashErrorMsg}`,
        });
        return {
          success: false,
          error: `Failed to stash local changes before creating branch: ${stashErrorMsg}`,
        };
      }
    }
  }

  try {
    // 5. Create and checkout the new branch
    events?.emit('switch:checkout', {
      worktreePath,
      targetBranch: branchName,
      isRemote: false,
      previousBranch,
    });

    const checkoutArgs = ['checkout', '-b', branchName];
    if (baseBranch) {
      checkoutArgs.push(baseBranch);
    }
    await execGitCommand(checkoutArgs, worktreePath);

    // 6. Reapply stashed changes if we stashed earlier
    let hasConflicts = false;
    let conflictMessage = '';
    let stashReapplied = false;

    if (didStash) {
      events?.emit('switch:pop', {
        worktreePath,
        targetBranch: branchName,
        action: 'pop',
      });

      // Isolate the pop in its own try/catch so a thrown exception does not
      // propagate to the outer catch block, which would attempt a second pop.
      try {
        const popResult = await popStash(worktreePath);
        // Mark didStash false so the outer error-recovery path cannot pop again.
        didStash = false;
        hasConflicts = popResult.hasConflicts;
        if (popResult.hasConflicts) {
          conflictMessage = `Created branch '${branchName}' but merge conflicts occurred when reapplying your local changes. Please resolve the conflicts.`;
        } else if (!popResult.success) {
          conflictMessage = `Created branch '${branchName}' but failed to reapply stashed changes: ${popResult.error}. Your changes are still in the stash.`;
        } else {
          stashReapplied = true;
        }
      } catch (popError) {
        // Pop threw an unexpected exception. Record the error and clear didStash
        // so the outer catch does not attempt a second pop.
        didStash = false;
        conflictMessage = `Created branch '${branchName}' but an error occurred while reapplying stashed changes: ${getErrorMessage(popError)}. Your changes may still be in the stash.`;
        events?.emit('switch:pop', {
          worktreePath,
          targetBranch: branchName,
          action: 'pop',
          error: getErrorMessage(popError),
        });
      }
    }

    if (hasConflicts) {
      events?.emit('switch:done', {
        worktreePath,
        previousBranch,
        currentBranch: branchName,
        hasConflicts: true,
      });
      return {
        success: true,
        result: {
          previousBranch,
          newBranch: branchName,
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
        currentBranch: branchName,
        stashPopFailed: true,
      });
      return {
        success: true,
        result: {
          previousBranch,
          newBranch: branchName,
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
        currentBranch: branchName,
        stashReapplied,
      });
      return {
        success: true,
        result: {
          previousBranch,
          newBranch: branchName,
          message: `Created and checked out branch '${branchName}'${stashNote}`,
          hasConflicts: false,
          stashedChanges: stashReapplied,
        },
      };
    }
  } catch (checkoutError) {
    // 7. If checkout failed and we stashed, try to restore the stash
    if (didStash) {
      try {
        const popResult = await popStash(worktreePath);
        if (popResult.hasConflicts) {
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
              'but produced merge conflicts. Please resolve the conflicts before retrying.',
          };
        } else if (!popResult.success) {
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
        // popResult.success === true: stash was cleanly restored
      } catch (popError) {
        // popStash itself threw — build a failure result rather than letting
        // the exception propagate and produce an unhandled rejection.
        const checkoutErrorMsg = getErrorMessage(checkoutError);
        const popErrorMsg = getErrorMessage(popError);
        const combinedMessage =
          `${checkoutErrorMsg}. Additionally, an error occurred while attempting to restore ` +
          `your stashed changes: ${popErrorMsg} — your changes may still be saved in the stash.`;
        events?.emit('switch:error', {
          worktreePath,
          branchName,
          error: combinedMessage,
        });
        return {
          success: false,
          error: combinedMessage,
          stashPopConflicts: false,
          stashPopConflictMessage: combinedMessage,
        };
      }
    }
    const checkoutErrorMsg = getErrorMessage(checkoutError);
    events?.emit('switch:error', {
      worktreePath,
      branchName,
      error: checkoutErrorMsg,
    });
    return {
      success: false,
      error: checkoutErrorMsg,
      stashPopConflicts: false,
    };
  }
}
