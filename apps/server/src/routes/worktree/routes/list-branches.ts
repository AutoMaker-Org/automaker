/**
 * POST /list-branches endpoint - List all local branches and optionally remote branches
 *
 * Note: Git repository validation (isGitRepo, hasCommits) is handled by
 * the requireValidWorktree middleware in index.ts
 */

import type { Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getErrorMessage, logWorktreeError } from '../common.js';

const execAsync = promisify(exec);

interface BranchInfo {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
}

export function createListBranchesHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { worktreePath, includeRemote = false } = req.body as {
        worktreePath: string;
        includeRemote?: boolean;
      };

      if (!worktreePath) {
        res.status(400).json({
          success: false,
          error: 'worktreePath required',
        });
        return;
      }

      // Get current branch
      const { stdout: currentBranchOutput } = await execAsync('git rev-parse --abbrev-ref HEAD', {
        cwd: worktreePath,
      });
      const currentBranch = currentBranchOutput.trim();

      // List all local branches
      // Use double quotes around the format string for cross-platform compatibility
      // Single quotes are preserved literally on Windows; double quotes work on both
      const { stdout: branchesOutput } = await execAsync('git branch --format="%(refname:short)"', {
        cwd: worktreePath,
      });

      const branches: BranchInfo[] = branchesOutput
        .trim()
        .split('\n')
        .filter((b) => b.trim())
        .map((name) => {
          // Remove any surrounding quotes (Windows git may preserve them)
          const cleanName = name.trim().replace(/^['"]|['"]$/g, '');
          return {
            name: cleanName,
            isCurrent: cleanName === currentBranch,
            isRemote: false,
          };
        });

      // Fetch remote branches if requested
      if (includeRemote) {
        try {
          // Fetch latest remote refs (silently, don't fail if offline)
          try {
            await execAsync('git fetch --all --quiet', {
              cwd: worktreePath,
              timeout: 10000, // 10 second timeout
            });
          } catch {
            // Ignore fetch errors - we'll use cached remote refs
          }

          // List remote branches
          const { stdout: remoteBranchesOutput } = await execAsync(
            'git branch -r --format="%(refname:short)"',
            { cwd: worktreePath }
          );

          const localBranchNames = new Set(branches.map((b) => b.name));

          remoteBranchesOutput
            .trim()
            .split('\n')
            .filter((b) => b.trim())
            .forEach((name) => {
              // Remove any surrounding quotes
              const cleanName = name.trim().replace(/^['"]|['"]$/g, '');
              // Skip HEAD pointers like "origin/HEAD"
              if (cleanName.includes('/HEAD')) return;

              // Only add remote branches if a branch with the exact same name isn't already
              // in the list. This avoids duplicates if a local branch is named like a remote one.
              // Note: We intentionally include remote branches even when a local branch with the
              // same base name exists (e.g., show "origin/main" even if local "main" exists),
              // since users need to select remote branches as PR base targets.
              if (!localBranchNames.has(cleanName)) {
                branches.push({
                  name: cleanName, // Keep full name like "origin/main"
                  isCurrent: false,
                  isRemote: true,
                });
              }
            });
        } catch {
          // Ignore errors fetching remote branches - return local branches only
        }
      }

      // Get ahead/behind count for current branch and check if remote branch exists
      let aheadCount = 0;
      let behindCount = 0;
      let hasRemoteBranch = false;
      try {
        // First check if there's a remote tracking branch
        const { stdout: upstreamOutput } = await execAsync(
          `git rev-parse --abbrev-ref ${currentBranch}@{upstream}`,
          { cwd: worktreePath }
        );

        if (upstreamOutput.trim()) {
          hasRemoteBranch = true;
          const { stdout: aheadBehindOutput } = await execAsync(
            `git rev-list --left-right --count ${currentBranch}@{upstream}...HEAD`,
            { cwd: worktreePath }
          );
          const [behind, ahead] = aheadBehindOutput.trim().split(/\s+/).map(Number);
          aheadCount = ahead || 0;
          behindCount = behind || 0;
        }
      } catch {
        // No upstream branch set - check if the branch exists on any remote
        try {
          // Check if there's a matching branch on origin (most common remote)
          const { stdout: remoteBranchOutput } = await execAsync(
            `git ls-remote --heads origin ${currentBranch}`,
            { cwd: worktreePath, timeout: 5000 }
          );
          hasRemoteBranch = remoteBranchOutput.trim().length > 0;
        } catch {
          // No remote branch found or origin doesn't exist
          hasRemoteBranch = false;
        }
      }

      res.json({
        success: true,
        result: {
          currentBranch,
          branches,
          aheadCount,
          behindCount,
          hasRemoteBranch,
        },
      });
    } catch (error) {
      const worktreePath = req.body?.worktreePath;
      logWorktreeError(error, 'List branches failed', worktreePath);
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
