/**
 * MergeService - Direct merge operations without HTTP
 *
 * Extracted from worktree merge route to allow internal service calls.
 */

import { createLogger, isValidBranchName, isValidRemoteName } from '@automaker/utils';
import { type EventEmitter } from '../lib/events.js';
import { execGitCommand } from '@automaker/git-utils';
const logger = createLogger('MergeService');

export interface MergeOptions {
  squash?: boolean;
  message?: string;
  deleteWorktreeAndBranch?: boolean;
  /** Remote name to fetch from before merging (defaults to 'origin') */
  remote?: string;
}

export interface MergeServiceResult {
  success: boolean;
  error?: string;
  hasConflicts?: boolean;
  conflictFiles?: string[];
  mergedBranch?: string;
  targetBranch?: string;
  deleted?: {
    worktreeDeleted: boolean;
    branchDeleted: boolean;
  };
}

/**
 * Perform a git merge operation directly without HTTP.
 *
 * @param projectPath - Path to the git repository
 * @param branchName - Source branch to merge
 * @param worktreePath - Path to the worktree (used for deletion if requested)
 * @param targetBranch - Branch to merge into (defaults to 'main')
 * @param options - Merge options
 * @param options.squash - If true, perform a squash merge
 * @param options.message - Custom merge commit message
 * @param options.deleteWorktreeAndBranch - If true, delete worktree and branch after merge
 * @param options.remote - Remote name to fetch from before merging (defaults to 'origin')
 */
export async function performMerge(
  projectPath: string,
  branchName: string,
  worktreePath: string,
  targetBranch: string = 'main',
  options?: MergeOptions,
  emitter?: EventEmitter
): Promise<MergeServiceResult> {
  if (!projectPath || !branchName || !worktreePath) {
    return {
      success: false,
      error: 'projectPath, branchName, and worktreePath are required',
    };
  }

  const mergeTo = targetBranch || 'main';

  // Validate branch names early to reject invalid input before any git operations
  if (!isValidBranchName(branchName)) {
    return {
      success: false,
      error: `Invalid source branch name: "${branchName}"`,
    };
  }
  if (!isValidBranchName(mergeTo)) {
    return {
      success: false,
      error: `Invalid target branch name: "${mergeTo}"`,
    };
  }

  // Validate source branch exists (using safe array-based command)
  try {
    await execGitCommand(['rev-parse', '--verify', branchName], projectPath);
  } catch {
    return {
      success: false,
      error: `Branch "${branchName}" does not exist`,
    };
  }

  // Validate target branch exists (using safe array-based command)
  try {
    await execGitCommand(['rev-parse', '--verify', mergeTo], projectPath);
  } catch {
    return {
      success: false,
      error: `Target branch "${mergeTo}" does not exist`,
    };
  }

  // Validate the remote name to prevent git option injection.
  // Reject invalid remote names so the caller knows their input was wrong,
  // consistent with how invalid branch names are handled above.
  const remote = options?.remote || 'origin';
  if (!isValidRemoteName(remote)) {
    logger.warn('Invalid remote name supplied to merge-service', {
      remote,
      projectPath,
    });
    return {
      success: false,
      error: `Invalid remote name: "${remote}"`,
    };
  }

  // Fetch latest from remote before merging to ensure we have up-to-date refs
  try {
    await execGitCommand(['fetch', remote], projectPath);
  } catch (fetchError) {
    logger.warn('Failed to fetch from remote before merge; proceeding with local refs', {
      remote,
      projectPath,
      error: (fetchError as Error).message,
    });
    // Non-fatal: proceed with local refs if fetch fails (e.g. offline)
  }

  // Emit merge:start after validating inputs
  emitter?.emit('merge:start', { branchName, targetBranch: mergeTo, worktreePath });

  // Merge the feature branch into the target branch (using safe array-based commands)
  const mergeMessage = options?.message || `Merge ${branchName} into ${mergeTo}`;
  const mergeArgs = options?.squash
    ? ['merge', '--squash', branchName]
    : ['merge', branchName, '-m', mergeMessage];

  try {
    // Set LC_ALL=C so git always emits English output regardless of the system
    // locale, making text-based conflict detection reliable.
    await execGitCommand(mergeArgs, projectPath, { LC_ALL: 'C' });
  } catch (mergeError: unknown) {
    // Check if this is a merge conflict.  We use a multi-layer strategy so
    // that detection is reliable even when locale settings vary or git's text
    // output changes across versions:
    //
    //  1. Primary (text-based): scan the error output for well-known English
    //     conflict markers.  Because we pass LC_ALL=C above these strings are
    //     always in English, but we keep the check as one layer among several.
    //
    //  2. Unmerged-path check: run `git diff --name-only --diff-filter=U`
    //     (locale-stable) and treat any non-empty output as a conflict
    //     indicator, capturing the file list at the same time.
    //
    //  3. Fallback status check: run `git status --porcelain` and look for
    //     lines whose first two characters indicate an unmerged state
    //     (UU, AA, DD, AU, UA, DU, UD).
    //
    // hasConflicts is true when ANY of the three layers returns positive.
    const err = mergeError as { stdout?: string; stderr?: string; message?: string };
    const output = `${err.stdout || ''} ${err.stderr || ''} ${err.message || ''}`;

    // Layer 1 – text matching (locale-safe because we set LC_ALL=C above).
    const textIndicatesConflict =
      output.includes('CONFLICT') || output.includes('Automatic merge failed');

    // Layers 2 & 3 – repository state inspection (locale-independent).
    // Layer 2: get conflicted files via diff (also locale-stable output).
    let conflictFiles: string[] | undefined;
    let diffIndicatesConflict = false;
    try {
      const diffOutput = await execGitCommand(
        ['diff', '--name-only', '--diff-filter=U'],
        projectPath,
        { LC_ALL: 'C' }
      );
      const files = diffOutput
        .trim()
        .split('\n')
        .filter((f) => f.trim().length > 0);
      if (files.length > 0) {
        diffIndicatesConflict = true;
        conflictFiles = files;
      }
    } catch {
      // If we can't get the file list, leave conflictFiles undefined so callers
      // can distinguish "no conflicts" (empty array) from "unknown due to diff failure" (undefined)
    }

    // Layer 3: check for unmerged paths via machine-readable git status.
    let hasUnmergedPaths = false;
    try {
      const statusOutput = await execGitCommand(['status', '--porcelain'], projectPath, {
        LC_ALL: 'C',
      });
      // Unmerged status codes occupy the first two characters of each line.
      // Standard unmerged codes: UU, AA, DD, AU, UA, DU, UD.
      const unmergedLines = statusOutput
        .split('\n')
        .filter((line) => /^(UU|AA|DD|AU|UA|DU|UD)/.test(line));
      hasUnmergedPaths = unmergedLines.length > 0;

      // If Layer 2 did not populate conflictFiles (e.g. diff failed or returned
      // nothing) but Layer 3 does detect unmerged paths, parse the status lines
      // to extract filenames and assign them to conflictFiles so callers always
      // receive an accurate file list when conflicts are present.
      if (hasUnmergedPaths && conflictFiles === undefined) {
        const parsedFiles = unmergedLines
          .map((line) => line.slice(2).trim())
          .filter((f) => f.length > 0);
        // Deduplicate (e.g. rename entries can appear twice)
        conflictFiles = [...new Set(parsedFiles)];
      }
    } catch {
      // git status failing is itself a sign something is wrong; leave
      // hasUnmergedPaths as false and rely on the other layers.
    }

    const hasConflicts = textIndicatesConflict || diffIndicatesConflict || hasUnmergedPaths;

    if (hasConflicts) {
      // Emit merge:conflict event with conflict details
      emitter?.emit('merge:conflict', { branchName, targetBranch: mergeTo, conflictFiles });

      return {
        success: false,
        error: `Merge CONFLICT: Automatic merge of "${branchName}" into "${mergeTo}" failed. Please resolve conflicts manually.`,
        hasConflicts: true,
        conflictFiles,
      };
    }

    // Emit merge:error for non-conflict errors before re-throwing
    emitter?.emit('merge:error', {
      branchName,
      targetBranch: mergeTo,
      error: err.message || String(mergeError),
    });

    // Re-throw non-conflict errors
    throw mergeError;
  }

  // If squash merge, need to commit (using safe array-based command)
  if (options?.squash) {
    const squashMessage = options?.message || `Merge ${branchName} (squash)`;
    try {
      await execGitCommand(['commit', '-m', squashMessage], projectPath);
    } catch (commitError: unknown) {
      const err = commitError as { message?: string };
      // Emit merge:error so subscribers always receive either merge:success or merge:error
      emitter?.emit('merge:error', {
        branchName,
        targetBranch: mergeTo,
        error: err.message || String(commitError),
      });
      throw commitError;
    }
  }

  // Optionally delete the worktree and branch after merging
  let worktreeDeleted = false;
  let branchDeleted = false;

  if (options?.deleteWorktreeAndBranch) {
    // Remove the worktree
    try {
      await execGitCommand(['worktree', 'remove', worktreePath, '--force'], projectPath);
      worktreeDeleted = true;
    } catch {
      // Try with prune if remove fails
      try {
        await execGitCommand(['worktree', 'prune'], projectPath);
        worktreeDeleted = true;
      } catch {
        logger.warn(`Failed to remove worktree: ${worktreePath}`);
      }
    }

    // Delete the branch (but not main/master)
    if (branchName !== 'main' && branchName !== 'master') {
      try {
        await execGitCommand(['branch', '-D', branchName], projectPath);
        branchDeleted = true;
      } catch {
        logger.warn(`Failed to delete branch: ${branchName}`);
      }
    }
  }

  // Emit merge:success with merged branch, target branch, and deletion info
  emitter?.emit('merge:success', {
    mergedBranch: branchName,
    targetBranch: mergeTo,
    deleted: options?.deleteWorktreeAndBranch ? { worktreeDeleted, branchDeleted } : undefined,
  });

  return {
    success: true,
    mergedBranch: branchName,
    targetBranch: mergeTo,
    deleted: options?.deleteWorktreeAndBranch ? { worktreeDeleted, branchDeleted } : undefined,
  };
}
