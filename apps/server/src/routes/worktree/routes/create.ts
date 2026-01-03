/**
 * POST /create endpoint - Create a new git worktree
 *
 * This endpoint handles worktree creation with proper checks:
 * 1. First checks if git already has a worktree for the branch (anywhere)
 * 2. If found, returns the existing worktree (no error)
 * 3. Only creates a new worktree if none exists for the branch
 */

import type { Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import * as secureFs from '../../../lib/secure-fs.js';
import {
  isGitRepo,
  getErrorMessage,
  logError,
  normalizePath,
  ensureInitialCommit,
} from '../common.js';
import { trackBranch } from './branch-tracking.js';

const execAsync = promisify(exec);

/**
 * Find an existing worktree for a given branch by checking git worktree list
 */
async function findExistingWorktreeForBranch(
  projectPath: string,
  branchName: string
): Promise<{ path: string; branch: string } | null> {
  try {
    const { stdout } = await execAsync('git worktree list --porcelain', {
      cwd: projectPath,
    });

    const lines = stdout.split('\n');
    let currentPath: string | null = null;
    let currentBranch: string | null = null;

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        currentPath = line.slice(9);
      } else if (line.startsWith('branch ')) {
        currentBranch = line.slice(7).replace('refs/heads/', '');
      } else if (line === '' && currentPath && currentBranch) {
        // End of a worktree entry
        if (currentBranch === branchName) {
          // Resolve to absolute path - git may return relative paths
          // Critical for cross-platform compatibility (Windows, macOS, Linux)
          const resolvedPath = path.isAbsolute(currentPath)
            ? path.resolve(currentPath)
            : path.resolve(projectPath, currentPath);
          return { path: resolvedPath, branch: currentBranch };
        }
        currentPath = null;
        currentBranch = null;
      }
    }

    // Check the last entry (if file doesn't end with newline)
    if (currentPath && currentBranch && currentBranch === branchName) {
      // Resolve to absolute path for cross-platform compatibility
      const resolvedPath = path.isAbsolute(currentPath)
        ? path.resolve(currentPath)
        : path.resolve(projectPath, currentPath);
      return { path: resolvedPath, branch: currentBranch };
    }

    return null;
  } catch {
    return null;
  }
}

export function createCreateHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, branchName, baseBranch } = req.body as {
        projectPath: string;
        branchName: string;
        baseBranch?: string; // Optional base branch to create from (defaults to current HEAD)
      };

      if (!projectPath || !branchName) {
        res.status(400).json({
          success: false,
          error: 'projectPath and branchName required',
        });
        return;
      }

      if (!(await isGitRepo(projectPath))) {
        res.status(400).json({
          success: false,
          error: 'Not a git repository',
        });
        return;
      }

      // Ensure the repository has at least one commit so worktree commands referencing HEAD succeed
      // Pass git identity env vars so commits work without global git config
      const gitEnv = {
        GIT_AUTHOR_NAME: 'Automaker',
        GIT_AUTHOR_EMAIL: 'automaker@localhost',
        GIT_COMMITTER_NAME: 'Automaker',
        GIT_COMMITTER_EMAIL: 'automaker@localhost',
      };
      await ensureInitialCommit(projectPath, gitEnv);

      // First, check if git already has a worktree for this branch (anywhere)
      const existingWorktree = await findExistingWorktreeForBranch(projectPath, branchName);
      if (existingWorktree) {
        // Worktree already exists, return it as success (not an error)
        // This handles manually created worktrees or worktrees from previous runs
        console.log(
          `[Worktree] Found existing worktree for branch "${branchName}" at: ${existingWorktree.path}`
        );

        // Track the branch so it persists in the UI
        await trackBranch(projectPath, branchName);

        res.json({
          success: true,
          worktree: {
            path: normalizePath(existingWorktree.path),
            branch: branchName,
            isNew: false, // Not newly created
          },
        });
        return;
      }

      // Sanitize branch name for directory usage
      const sanitizedName = branchName.replace(/[^a-zA-Z0-9_-]/g, '-');
      const worktreesDir = path.join(projectPath, '.worktrees');
      const worktreePath = path.join(worktreesDir, sanitizedName);

      // Create worktrees directory if it doesn't exist
      await secureFs.mkdir(worktreesDir, { recursive: true });

      // Check if branch exists
      let branchExists = false;
      try {
        await execAsync(`git rev-parse --verify ${branchName}`, {
          cwd: projectPath,
        });
        branchExists = true;
      } catch {
        // Branch doesn't exist
      }

      // Create worktree
      let createCmd: string;
      if (branchExists) {
        // Use existing branch
        createCmd = `git worktree add "${worktreePath}" ${branchName}`;
      } else {
        // Create new branch from base or HEAD
        const base = baseBranch || 'HEAD';
        createCmd = `git worktree add -b ${branchName} "${worktreePath}" ${base}`;
      }

      await execAsync(createCmd, { cwd: projectPath });

      // Note: We intentionally do NOT symlink .automaker to worktrees
      // Features and config are always accessed from the main project path
      // This avoids symlink loop issues when activating worktrees

      // Track the branch so it persists in the UI even after worktree is removed
      await trackBranch(projectPath, branchName);

      // Resolve to absolute path for cross-platform compatibility
      // normalizePath converts to forward slashes for API consistency
      const absoluteWorktreePath = path.resolve(worktreePath);
      res.json({
        success: true,
        worktree: {
          path: normalizePath(absoluteWorktreePath),
          branch: branchName,
          isNew: !branchExists,
        },
      });
    } catch (error) {
      logError(error, 'Create worktree failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
