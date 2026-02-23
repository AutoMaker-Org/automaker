/**
 * Git status parsing utilities
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { GIT_STATUS_MAP, type FileStatus, type MergeStateInfo } from './types.js';

const execAsync = promisify(exec);

/**
 * Get a readable status text from git status codes
 * Handles both single character and XY format status codes
 */
function getStatusText(indexStatus: string, workTreeStatus: string): string {
  // Untracked files
  if (indexStatus === '?' && workTreeStatus === '?') {
    return 'Untracked';
  }

  // Ignored files
  if (indexStatus === '!' && workTreeStatus === '!') {
    return 'Ignored';
  }

  // Prioritize staging area status, then working tree
  const primaryStatus = indexStatus !== ' ' && indexStatus !== '?' ? indexStatus : workTreeStatus;

  // Handle combined statuses
  if (
    indexStatus !== ' ' &&
    indexStatus !== '?' &&
    workTreeStatus !== ' ' &&
    workTreeStatus !== '?'
  ) {
    // Both staging and working tree have changes
    const indexText = GIT_STATUS_MAP[indexStatus] || 'Changed';
    const workText = GIT_STATUS_MAP[workTreeStatus] || 'Changed';
    if (indexText === workText) {
      return indexText;
    }
    return `${indexText} (staged), ${workText} (unstaged)`;
  }

  return GIT_STATUS_MAP[primaryStatus] || 'Changed';
}

/**
 * Check if a path is a git repository
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
 * Parse the output of `git status --porcelain` into FileStatus array
 * Git porcelain format: XY PATH where X=staging area status, Y=working tree status
 * For renamed files: XY ORIG_PATH -> NEW_PATH
 */
export function parseGitStatus(statusOutput: string): FileStatus[] {
  return statusOutput
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      // Git porcelain format uses two status characters: XY
      // X = status in staging area (index)
      // Y = status in working tree
      const indexStatus = line[0] || ' ';
      const workTreeStatus = line[1] || ' ';

      // File path starts at position 3 (after "XY ")
      let filePath = line.slice(3);

      // Handle renamed files (format: "R  old_path -> new_path")
      if (indexStatus === 'R' || workTreeStatus === 'R') {
        const arrowIndex = filePath.indexOf(' -> ');
        if (arrowIndex !== -1) {
          filePath = filePath.slice(arrowIndex + 4); // Use new path
        }
      }

      // Determine the primary status character for backwards compatibility
      // Prioritize staging area status, then working tree
      let primaryStatus: string;
      if (indexStatus === '?' && workTreeStatus === '?') {
        primaryStatus = '?'; // Untracked
      } else if (indexStatus !== ' ' && indexStatus !== '?') {
        primaryStatus = indexStatus; // Staged change
      } else {
        primaryStatus = workTreeStatus; // Working tree change
      }

      // Detect merge-affected files: when both X and Y are 'U', or U appears in either position
      // In merge state, git uses 'U' (unmerged) to indicate merge-affected entries
      const isMergeAffected =
        indexStatus === 'U' ||
        workTreeStatus === 'U' ||
        (indexStatus === 'A' && workTreeStatus === 'A') || // both-added
        (indexStatus === 'D' && workTreeStatus === 'D'); // both-deleted (during merge)

      let mergeType: string | undefined;
      if (isMergeAffected) {
        if (indexStatus === 'U' && workTreeStatus === 'U') mergeType = 'both-modified';
        else if (indexStatus === 'A' && workTreeStatus === 'U') mergeType = 'added-by-us';
        else if (indexStatus === 'U' && workTreeStatus === 'A') mergeType = 'added-by-them';
        else if (indexStatus === 'D' && workTreeStatus === 'U') mergeType = 'deleted-by-us';
        else if (indexStatus === 'U' && workTreeStatus === 'D') mergeType = 'deleted-by-them';
        else if (indexStatus === 'A' && workTreeStatus === 'A') mergeType = 'both-added';
        else if (indexStatus === 'D' && workTreeStatus === 'D') mergeType = 'both-deleted';
        else mergeType = 'unmerged';
      }

      return {
        status: primaryStatus,
        path: filePath,
        statusText: getStatusText(indexStatus, workTreeStatus),
        indexStatus,
        workTreeStatus,
        ...(isMergeAffected && { isMergeAffected: true }),
        ...(mergeType && { mergeType }),
      };
    });
}

/**
 * Check if the current HEAD commit is a merge commit (has more than one parent).
 * This is used to detect completed merge commits so we can show what the merge changed.
 *
 * @param repoPath - Path to the git repository or worktree
 * @returns Object with isMergeCommit flag and the list of files affected by the merge
 */
export async function detectMergeCommit(
  repoPath: string
): Promise<{ isMergeCommit: boolean; mergeAffectedFiles: string[] }> {
  try {
    // Check how many parents HEAD has using rev-parse
    // For a merge commit, HEAD^2 exists (second parent); for non-merge commits it doesn't
    try {
      await execAsync('git rev-parse --verify "HEAD^2"', { cwd: repoPath });
    } catch {
      // HEAD^2 doesn't exist — not a merge commit
      return { isMergeCommit: false, mergeAffectedFiles: [] };
    }

    // HEAD is a merge commit - get the files it changed relative to first parent
    let mergeAffectedFiles: string[] = [];
    try {
      const { stdout: diffOutput } = await execAsync('git diff --name-only "HEAD~1" "HEAD"', {
        cwd: repoPath,
      });
      mergeAffectedFiles = diffOutput
        .trim()
        .split('\n')
        .filter((f) => f.trim().length > 0);
    } catch {
      // Ignore errors getting affected files
    }

    return { isMergeCommit: true, mergeAffectedFiles };
  } catch {
    return { isMergeCommit: false, mergeAffectedFiles: [] };
  }
}

/**
 * Detect the current merge state of a git repository.
 * Checks for .git/MERGE_HEAD, .git/rebase-merge, .git/rebase-apply,
 * and .git/CHERRY_PICK_HEAD to determine if a merge/rebase/cherry-pick
 * is in progress.
 *
 * @param repoPath - Path to the git repository or worktree
 * @returns MergeStateInfo describing the current merge state
 */
export async function detectMergeState(repoPath: string): Promise<MergeStateInfo> {
  const defaultState: MergeStateInfo = {
    isMerging: false,
    mergeOperationType: null,
    isCleanMerge: false,
    mergeAffectedFiles: [],
    conflictFiles: [],
  };

  try {
    // Find the actual .git directory (handles worktrees with .git file pointing to main repo)
    const { stdout: gitDirRaw } = await execAsync('git rev-parse --git-dir', { cwd: repoPath });
    const gitDir = path.resolve(repoPath, gitDirRaw.trim());

    // Check for merge/rebase/cherry-pick indicators
    let mergeOperationType: 'merge' | 'rebase' | 'cherry-pick' | null = null;

    const checks = [
      { file: 'MERGE_HEAD', type: 'merge' as const },
      { file: 'rebase-merge', type: 'rebase' as const },
      { file: 'rebase-apply', type: 'rebase' as const },
      { file: 'CHERRY_PICK_HEAD', type: 'cherry-pick' as const },
    ];

    for (const check of checks) {
      try {
        await fs.access(path.join(gitDir, check.file));
        mergeOperationType = check.type;
        break;
      } catch {
        // File doesn't exist, continue checking
      }
    }

    if (!mergeOperationType) {
      return defaultState;
    }

    // Get unmerged files (files with conflicts)
    let conflictFiles: string[] = [];
    try {
      const { stdout: diffOutput } = await execAsync('git diff --name-only --diff-filter=U', {
        cwd: repoPath,
      });
      conflictFiles = diffOutput
        .trim()
        .split('\n')
        .filter((f) => f.trim().length > 0);
    } catch {
      // Ignore errors getting conflict files
    }

    // Get all files affected by the merge (staged files that came from the merge)
    let mergeAffectedFiles: string[] = [];
    try {
      const { stdout: statusOutput } = await execAsync('git status --porcelain', {
        cwd: repoPath,
      });
      const files = parseGitStatus(statusOutput);
      mergeAffectedFiles = files
        .filter((f) => f.isMergeAffected || (f.indexStatus !== ' ' && f.indexStatus !== '?'))
        .map((f) => f.path);
    } catch {
      // Ignore errors
    }

    return {
      isMerging: true,
      mergeOperationType,
      isCleanMerge: conflictFiles.length === 0,
      mergeAffectedFiles,
      conflictFiles,
    };
  } catch {
    return defaultState;
  }
}
