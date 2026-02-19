/**
 * RebaseService - Rebase git operations without HTTP
 *
 * Handles git rebase operations with conflict detection and reporting.
 * Follows the same pattern as merge-service.ts and cherry-pick-service.ts.
 */

import fs from 'fs/promises';
import path from 'path';
import { createLogger, getErrorMessage, isValidRemoteName } from '@automaker/utils';
import { execGitCommand, getCurrentBranch, getConflictFiles } from '@automaker/git-utils';

const logger = createLogger('RebaseService');

// ============================================================================
// Types
// ============================================================================

export interface RebaseOptions {
  /** Remote name to fetch from before rebasing (defaults to 'origin') */
  remote?: string;
}

export interface RebaseResult {
  success: boolean;
  error?: string;
  hasConflicts?: boolean;
  conflictFiles?: string[];
  aborted?: boolean;
  branch?: string;
  ontoBranch?: string;
  message?: string;
}

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Run a git rebase operation on the given worktree.
 *
 * @param worktreePath - Path to the git worktree
 * @param ontoBranch - The branch to rebase onto (e.g., 'origin/main')
 * @param options - Optional rebase options (remote name for fetch)
 * @returns RebaseResult with success/failure information
 */
export async function runRebase(
  worktreePath: string,
  ontoBranch: string,
  options?: RebaseOptions
): Promise<RebaseResult> {
  // Reject empty, whitespace-only, or dash-prefixed branch names.
  const normalizedOntoBranch = ontoBranch?.trim() ?? '';
  if (normalizedOntoBranch === '' || normalizedOntoBranch.startsWith('-')) {
    return {
      success: false,
      error: `Invalid branch name: "${ontoBranch}" must not be empty or start with a dash.`,
    };
  }

  // Get current branch name before rebase
  let currentBranch: string;
  try {
    currentBranch = await getCurrentBranch(worktreePath);
  } catch (branchErr) {
    return {
      success: false,
      error: `Failed to resolve current branch for worktree "${worktreePath}": ${getErrorMessage(branchErr)}`,
    };
  }

  // Validate the remote name to prevent git option injection.
  // Reject invalid remote names so the caller knows their input was wrong,
  // consistent with how invalid branch names are handled above.
  const remote = options?.remote || 'origin';
  if (!isValidRemoteName(remote)) {
    logger.warn('Invalid remote name supplied to rebase-service', {
      remote,
      worktreePath,
    });
    return {
      success: false,
      error: `Invalid remote name: "${remote}"`,
    };
  }

  // Fetch latest from remote before rebasing to ensure we have up-to-date refs
  try {
    await execGitCommand(['fetch', remote], worktreePath);
  } catch (fetchError) {
    logger.warn('Failed to fetch from remote before rebase; proceeding with local refs', {
      remote,
      worktreePath,
      error: getErrorMessage(fetchError),
    });
    // Non-fatal: proceed with local refs if fetch fails (e.g. offline)
  }

  try {
    // Pass ontoBranch after '--' so git treats it as a ref, not an option.
    // Set LC_ALL=C so git always emits English output regardless of the system
    // locale, making text-based conflict detection reliable.
    await execGitCommand(['rebase', '--', normalizedOntoBranch], worktreePath, { LC_ALL: 'C' });

    return {
      success: true,
      branch: currentBranch,
      ontoBranch: normalizedOntoBranch,
      message: `Successfully rebased ${currentBranch} onto ${normalizedOntoBranch}`,
    };
  } catch (rebaseError: unknown) {
    // Check if this is a rebase conflict.  We use a multi-layer strategy so
    // that detection is reliable even when locale settings vary or git's text
    // output changes across versions:
    //
    //  1. Primary (text-based): scan the error output for well-known English
    //     conflict markers.  Because we pass LC_ALL=C above these strings are
    //     always in English, but we keep the check as one layer among several.
    //
    //  2. Repository-state check: run `git rev-parse --git-dir` to find the
    //     actual .git directory, then verify whether the in-progress rebase
    //     state directories (.git/rebase-merge or .git/rebase-apply) exist.
    //     These are created by git at the start of a rebase and are the most
    //     reliable indicator that a rebase is still in progress (i.e. stopped
    //     due to conflicts).
    //
    //  3. Unmerged-path check: run `git status --porcelain` (machine-readable,
    //     locale-independent) and look for lines whose first two characters
    //     indicate an unmerged state (UU, AA, DD, AU, UA, DU, UD).
    //
    // hasConflicts is true when ANY of the three layers returns positive.
    const err = rebaseError as { stdout?: string; stderr?: string; message?: string };
    const output = `${err.stdout || ''} ${err.stderr || ''} ${err.message || ''}`;

    // Layer 1 – text matching (locale-safe because we set LC_ALL=C above).
    const textIndicatesConflict =
      output.includes('CONFLICT') ||
      output.includes('could not apply') ||
      output.includes('Resolve all conflicts') ||
      output.includes('fix conflicts');

    // Layers 2 & 3 – repository state inspection (locale-independent).
    let rebaseStateExists = false;
    let hasUnmergedPaths = false;
    try {
      // Find the canonical .git directory for this worktree.
      const gitDir = (await execGitCommand(['rev-parse', '--git-dir'], worktreePath)).trim();
      // git rev-parse --git-dir returns a path relative to cwd when the repo is
      // a worktree, so we resolve it against worktreePath.
      const resolvedGitDir = path.resolve(worktreePath, gitDir);

      // Layer 2: check for rebase state directories.
      const rebaseMergeDir = path.join(resolvedGitDir, 'rebase-merge');
      const rebaseApplyDir = path.join(resolvedGitDir, 'rebase-apply');
      const [rebaseMergeExists, rebaseApplyExists] = await Promise.all([
        fs
          .access(rebaseMergeDir)
          .then(() => true)
          .catch(() => false),
        fs
          .access(rebaseApplyDir)
          .then(() => true)
          .catch(() => false),
      ]);
      rebaseStateExists = rebaseMergeExists || rebaseApplyExists;
    } catch {
      // If rev-parse fails the repo may be in an unexpected state; fall back to
      // text-based detection only.
    }

    try {
      // Layer 3: check for unmerged paths via machine-readable git status.
      const statusOutput = await execGitCommand(['status', '--porcelain'], worktreePath, {
        LC_ALL: 'C',
      });
      // Unmerged status codes occupy the first two characters of each line.
      // Standard unmerged codes: UU, AA, DD, AU, UA, DU, UD.
      hasUnmergedPaths = statusOutput
        .split('\n')
        .some((line) => /^(UU|AA|DD|AU|UA|DU|UD)/.test(line));
    } catch {
      // git status failing is itself a sign something is wrong; leave
      // hasUnmergedPaths as false and rely on the other layers.
    }

    const hasConflicts = textIndicatesConflict || rebaseStateExists || hasUnmergedPaths;

    if (hasConflicts) {
      // Attempt to fetch the list of conflicted files.  We wrap this in its
      // own try/catch so that a failure here does NOT prevent abortRebase from
      // running – keeping the repository in a clean state is the priority.
      let conflictFiles: string[] | undefined;
      let conflictFilesError: unknown;
      try {
        conflictFiles = await getConflictFiles(worktreePath);
      } catch (getConflictFilesError: unknown) {
        conflictFilesError = getConflictFilesError;
        logger.warn('Failed to retrieve conflict files after rebase conflict', {
          worktreePath,
          error: getErrorMessage(getConflictFilesError),
        });
      }

      // Abort the rebase to leave the repo in a clean state.  This must
      // always run regardless of whether getConflictFiles succeeded.
      const aborted = await abortRebase(worktreePath);

      if (!aborted) {
        logger.error('Failed to abort rebase after conflict; repository may be in a dirty state', {
          worktreePath,
        });
      }

      // Re-throw a composed error so callers retain both the original rebase
      // failure context and any conflict-file lookup failure.
      if (conflictFilesError !== undefined) {
        const composedMessage = [
          `Rebase of "${currentBranch}" onto "${normalizedOntoBranch}" failed due to conflicts.`,
          `Original rebase error: ${getErrorMessage(rebaseError)}`,
          `Additionally, fetching conflict files failed: ${getErrorMessage(conflictFilesError)}`,
          aborted
            ? 'The rebase was aborted; no changes were applied.'
            : 'The rebase abort also failed; repository may be in a dirty state.',
        ].join(' ');
        throw new Error(composedMessage);
      }

      return {
        success: false,
        error: aborted
          ? `Rebase of "${currentBranch}" onto "${normalizedOntoBranch}" aborted due to conflicts; no changes were applied.`
          : `Rebase of "${currentBranch}" onto "${normalizedOntoBranch}" failed due to conflicts and the abort also failed; repository may be in a dirty state.`,
        hasConflicts: true,
        conflictFiles,
        aborted,
        branch: currentBranch,
        ontoBranch: normalizedOntoBranch,
      };
    }

    // Non-conflict error - propagate
    throw rebaseError;
  }
}

/**
 * Abort an in-progress rebase operation.
 *
 * @param worktreePath - Path to the git worktree
 * @returns true if abort succeeded, false if it failed (logged as warning)
 */
export async function abortRebase(worktreePath: string): Promise<boolean> {
  try {
    await execGitCommand(['rebase', '--abort'], worktreePath);
    return true;
  } catch (err) {
    logger.warn('Failed to abort rebase after conflict', err instanceof Error ? err.message : err);
    return false;
  }
}
