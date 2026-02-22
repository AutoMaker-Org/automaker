/**
 * POST /discard-changes endpoint - Discard uncommitted changes in a worktree
 *
 * Supports two modes:
 * 1. Discard ALL changes (when no files array is provided)
 *    - Resets staged changes (git reset HEAD)
 *    - Discards modified tracked files (git checkout .)
 *    - Removes untracked files and directories (git clean -ffd)
 *
 * 2. Discard SELECTED files (when files array is provided)
 *    - Unstages selected staged files (git reset HEAD -- <files>)
 *    - Reverts selected tracked file changes (git checkout -- <files>)
 *    - Removes selected untracked files (git clean -ffd -- <files>)
 *
 * Note: Git repository validation (isGitRepo) is handled by
 * the requireGitRepoOnly middleware in index.ts
 */

import type { Request, Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { getErrorMessage, logError } from '@automaker/utils';
import { execGitCommand } from '../../../lib/git.js';

/**
 * Validate that a file path does not escape the worktree directory.
 * Prevents path traversal attacks (e.g., ../../etc/passwd) and
 * rejects symlinks inside the worktree that point outside of it.
 */
function validateFilePath(filePath: string, worktreePath: string): boolean {
  // Resolve the full path relative to the worktree (lexical resolution)
  const resolved = path.resolve(worktreePath, filePath);
  const normalizedWorktree = path.resolve(worktreePath);

  // First, perform lexical prefix check
  const lexicalOk =
    resolved.startsWith(normalizedWorktree + path.sep) || resolved === normalizedWorktree;
  if (!lexicalOk) {
    return false;
  }

  // Then, attempt symlink-aware validation using realpath.
  // This catches symlinks inside the worktree that point outside of it.
  try {
    const realResolved = fs.realpathSync(resolved);
    const realWorktree = fs.realpathSync(normalizedWorktree);
    return realResolved.startsWith(realWorktree + path.sep) || realResolved === realWorktree;
  } catch {
    // If realpath fails (e.g., target doesn't exist yet for untracked files),
    // fall back to the lexical startsWith check which already passed above.
    return true;
  }
}

/**
 * Parse a file path from git status --porcelain output, handling renames.
 * For renamed files (R status), git reports "old_path -> new_path" and
 * we need the new path to match what parseGitStatus() returns in git-utils.
 */
function parseFilePath(rawPath: string, indexStatus: string, workTreeStatus: string): string {
  const trimmedPath = rawPath.trim();
  if (indexStatus === 'R' || workTreeStatus === 'R') {
    const arrowIndex = trimmedPath.indexOf(' -> ');
    if (arrowIndex !== -1) {
      return trimmedPath.slice(arrowIndex + 4);
    }
  }
  return trimmedPath;
}

export function createDiscardChangesHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { worktreePath, files } = req.body as {
        worktreePath: string;
        files?: string[];
      };

      if (!worktreePath) {
        res.status(400).json({
          success: false,
          error: 'worktreePath required',
        });
        return;
      }

      // Check for uncommitted changes first
      const status = await execGitCommand(['status', '--porcelain'], worktreePath);

      if (!status.trim()) {
        res.json({
          success: true,
          result: {
            discarded: false,
            message: 'No changes to discard',
          },
        });
        return;
      }

      // Get branch name before discarding
      const branchOutput = await execGitCommand(
        ['rev-parse', '--abbrev-ref', 'HEAD'],
        worktreePath
      );
      const branchName = branchOutput.trim();

      // Parse the status output to categorize files
      // Git --porcelain format: XY PATH where X=index status, Y=worktree status
      // For renamed files: XY OLD_PATH -> NEW_PATH
      const statusLines = status.trim().split('\n').filter(Boolean);
      const allFiles = statusLines.map((line) => {
        const fileStatus = line.substring(0, 2);
        const rawPath = line.slice(3);
        const indexStatus = fileStatus.charAt(0);
        const workTreeStatus = fileStatus.charAt(1);
        // Parse path consistently with parseGitStatus() in git-utils,
        // which extracts the new path for renames
        const filePath = parseFilePath(rawPath, indexStatus, workTreeStatus);
        return { status: fileStatus, path: filePath };
      });

      // Determine which files to discard
      const isSelectiveDiscard = files && files.length > 0 && files.length < allFiles.length;

      if (isSelectiveDiscard) {
        // Selective discard: only discard the specified files
        const filesToDiscard = new Set(files);

        // Validate all requested file paths stay within the worktree
        const invalidPaths = files.filter((f) => !validateFilePath(f, worktreePath));
        if (invalidPaths.length > 0) {
          res.status(400).json({
            success: false,
            error: `Invalid file paths detected (path traversal): ${invalidPaths.join(', ')}`,
          });
          return;
        }

        // Separate files into categories for proper git operations
        const trackedModified: string[] = []; // Modified/deleted tracked files
        const stagedFiles: string[] = []; // Files that are staged
        const untrackedFiles: string[] = []; // Untracked files (?)
        const warnings: string[] = [];

        // Track which requested files were matched so we can handle unmatched ones
        const matchedFiles = new Set<string>();

        for (const file of allFiles) {
          if (!filesToDiscard.has(file.path)) continue;
          matchedFiles.add(file.path);

          // file.status is the raw two-character XY git porcelain status (no trim)
          // X = index/staging status, Y = worktree status
          const xy = file.status.substring(0, 2);
          const indexStatus = xy.charAt(0);
          const workTreeStatus = xy.charAt(1);

          if (indexStatus === '?' && workTreeStatus === '?') {
            untrackedFiles.push(file.path);
          } else if (indexStatus === 'A') {
            // Staged-new file: must be reset (unstaged) then cleaned (deleted).
            // Never pass to trackedModified — the file has no HEAD version to
            // check out, so `git checkout --` would fail or do nothing.
            stagedFiles.push(file.path);
            untrackedFiles.push(file.path);
          } else {
            // Check if the file has staged changes (index status X)
            if (indexStatus !== ' ' && indexStatus !== '?') {
              stagedFiles.push(file.path);
            }
            // Check for working tree changes (worktree status Y): handles MM, MD, etc.
            if (workTreeStatus !== ' ' && workTreeStatus !== '?') {
              trackedModified.push(file.path);
            }
          }
        }

        // Handle files from the UI that didn't match any entry in allFiles.
        // This can happen due to timing differences between the UI loading diffs
        // and the discard request, or path format differences.
        // Attempt to clean unmatched files directly as untracked files.
        for (const requestedFile of files) {
          if (!matchedFiles.has(requestedFile)) {
            untrackedFiles.push(requestedFile);
          }
        }

        // 1. Unstage selected staged files (using execFile to bypass shell)
        if (stagedFiles.length > 0) {
          try {
            await execGitCommand(['reset', 'HEAD', '--', ...stagedFiles], worktreePath);
          } catch (error) {
            const msg = getErrorMessage(error);
            logError(error, `Failed to unstage files: ${msg}`);
            warnings.push(`Failed to unstage some files: ${msg}`);
          }
        }

        // 2. Revert selected tracked file changes
        if (trackedModified.length > 0) {
          try {
            await execGitCommand(['checkout', '--', ...trackedModified], worktreePath);
          } catch (error) {
            const msg = getErrorMessage(error);
            logError(error, `Failed to revert tracked files: ${msg}`);
            warnings.push(`Failed to revert some tracked files: ${msg}`);
          }
        }

        // 3. Remove selected untracked files
        // Use -ffd (double force) to also handle nested git repositories
        if (untrackedFiles.length > 0) {
          try {
            await execGitCommand(['clean', '-ffd', '--', ...untrackedFiles], worktreePath);
          } catch (error) {
            const msg = getErrorMessage(error);
            logError(error, `Failed to clean untracked files: ${msg}`);
            warnings.push(`Failed to remove some untracked files: ${msg}`);
          }
        }

        const fileCount = files.length;

        // Verify the remaining state
        const finalStatus = await execGitCommand(['status', '--porcelain'], worktreePath);

        const remainingCount = finalStatus.trim()
          ? finalStatus.trim().split('\n').filter(Boolean).length
          : 0;
        const actualDiscarded = allFiles.length - remainingCount;

        let message =
          actualDiscarded < fileCount
            ? `Discarded ${actualDiscarded} of ${fileCount} selected files, ${remainingCount} files remaining`
            : `Discarded ${actualDiscarded} ${actualDiscarded === 1 ? 'file' : 'files'}`;

        res.json({
          success: true,
          result: {
            discarded: true,
            filesDiscarded: actualDiscarded,
            filesRemaining: remainingCount,
            branch: branchName,
            message,
            ...(warnings.length > 0 && { warnings }),
          },
        });
      } else {
        // Discard ALL changes (original behavior)
        const fileCount = allFiles.length;
        const warnings: string[] = [];

        // 1. Reset any staged changes
        try {
          await execGitCommand(['reset', 'HEAD'], worktreePath);
        } catch (error) {
          const msg = getErrorMessage(error);
          logError(error, `git reset HEAD failed: ${msg}`);
          warnings.push(`Failed to unstage changes: ${msg}`);
        }

        // 2. Discard changes in tracked files
        try {
          await execGitCommand(['checkout', '.'], worktreePath);
        } catch (error) {
          const msg = getErrorMessage(error);
          logError(error, `git checkout . failed: ${msg}`);
          warnings.push(`Failed to revert tracked changes: ${msg}`);
        }

        // 3. Remove untracked files and directories
        // Use -ffd (double force) to also handle nested git repositories
        try {
          await execGitCommand(['clean', '-ffd', '--'], worktreePath);
        } catch (error) {
          const msg = getErrorMessage(error);
          logError(error, `git clean -ffd failed: ${msg}`);
          warnings.push(`Failed to remove untracked files: ${msg}`);
        }

        // Verify all changes were discarded
        const finalStatus = await execGitCommand(['status', '--porcelain'], worktreePath);

        if (finalStatus.trim()) {
          const remainingCount = finalStatus.trim().split('\n').filter(Boolean).length;
          res.json({
            success: true,
            result: {
              discarded: true,
              filesDiscarded: fileCount - remainingCount,
              filesRemaining: remainingCount,
              branch: branchName,
              message: `Discarded ${fileCount - remainingCount} files, ${remainingCount} files could not be removed`,
              ...(warnings.length > 0 && { warnings }),
            },
          });
        } else {
          res.json({
            success: true,
            result: {
              discarded: true,
              filesDiscarded: fileCount,
              filesRemaining: 0,
              branch: branchName,
              message: `Discarded ${fileCount} ${fileCount === 1 ? 'file' : 'files'}`,
              ...(warnings.length > 0 && { warnings }),
            },
          });
        }
      }
    } catch (error) {
      logError(error, 'Discard changes failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
