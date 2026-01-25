/**
 * POST /list-remotes endpoint - List all remotes and their branches
 *
 * Note: Git repository validation (isGitRepo, hasCommits) is handled by
 * the requireValidWorktree middleware in index.ts
 */

import type { Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getErrorMessage, logWorktreeError } from '../common.js';

const execAsync = promisify(exec);

interface RemoteBranch {
  name: string;
  fullRef: string;
}

interface RemoteInfo {
  name: string;
  url: string;
  branches: RemoteBranch[];
}

export function createListRemotesHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { worktreePath } = req.body as {
        worktreePath: string;
      };

      if (!worktreePath) {
        res.status(400).json({
          success: false,
          error: 'worktreePath required',
        });
        return;
      }

      // Get list of remotes
      const { stdout: remotesOutput } = await execAsync('git remote -v', {
        cwd: worktreePath,
      });

      // Parse remotes (each remote appears twice - once for fetch, once for push)
      const remotesSet = new Map<string, string>();
      remotesOutput
        .trim()
        .split('\n')
        .filter((line) => line.trim())
        .forEach((line) => {
          const match = line.match(/^(\S+)\s+(\S+)\s+\(fetch\)$/);
          if (match) {
            remotesSet.set(match[1], match[2]);
          }
        });

      // Fetch latest from all remotes (silently, don't fail if offline)
      try {
        await execAsync('git fetch --all --quiet', {
          cwd: worktreePath,
          timeout: 15000, // 15 second timeout
        });
      } catch {
        // Ignore fetch errors - we'll use cached remote refs
      }

      // Get all remote branches
      const { stdout: remoteBranchesOutput } = await execAsync(
        'git branch -r --format="%(refname:short)"',
        { cwd: worktreePath }
      );

      // Group branches by remote
      const remotesBranches = new Map<string, RemoteBranch[]>();
      remotesSet.forEach((_, remoteName) => {
        remotesBranches.set(remoteName, []);
      });

      remoteBranchesOutput
        .trim()
        .split('\n')
        .filter((line) => line.trim())
        .forEach((line) => {
          const cleanLine = line.trim().replace(/^['"]|['"]$/g, '');
          // Skip HEAD pointers like "origin/HEAD"
          if (cleanLine.includes('/HEAD')) return;

          // Parse remote name from branch ref (e.g., "origin/main" -> "origin")
          const slashIndex = cleanLine.indexOf('/');
          if (slashIndex === -1) return;

          const remoteName = cleanLine.substring(0, slashIndex);
          const branchName = cleanLine.substring(slashIndex + 1);

          if (remotesBranches.has(remoteName)) {
            remotesBranches.get(remoteName)!.push({
              name: branchName,
              fullRef: cleanLine,
            });
          }
        });

      // Build final result
      const remotes: RemoteInfo[] = [];
      remotesSet.forEach((url, name) => {
        remotes.push({
          name,
          url,
          branches: remotesBranches.get(name) || [],
        });
      });

      res.json({
        success: true,
        result: {
          remotes,
        },
      });
    } catch (error) {
      const worktreePath = req.body?.worktreePath;
      logWorktreeError(error, 'List remotes failed', worktreePath);
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
