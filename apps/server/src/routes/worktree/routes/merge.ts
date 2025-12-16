/**
 * POST /merge endpoint - Merge feature (merge worktree branch into main)
 */

import type { Request, Response } from "express";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import { getErrorMessage, logError } from "../common.js";

const execAsync = promisify(exec);

export function createMergeHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, featureId, options } = req.body as {
        projectPath: string;
        featureId: string;
        options?: { squash?: boolean; message?: string };
      };

      if (!projectPath || !featureId) {
        res
          .status(400)
          .json({
            success: false,
            error: "projectPath and featureId required",
          });
        return;
      }

      const branchName = `feature/${featureId}`;
      // Git worktrees are stored in project directory
      const worktreePath = path.join(projectPath, ".worktrees", featureId);

      // Get current branch
      const { stdout: currentBranch } = await execAsync(
        "git rev-parse --abbrev-ref HEAD",
        { cwd: projectPath }
      );

      // Merge the feature branch
      const mergeCmd = options?.squash
        ? `git merge --squash ${branchName}`
        : `git merge ${branchName} -m "${
            options?.message || `Merge ${branchName}`
          }"`;

      await execAsync(mergeCmd, { cwd: projectPath });

      // If squash merge, need to commit
      if (options?.squash) {
        await execAsync(
          `git commit -m "${
            options?.message || `Merge ${branchName} (squash)`
          }"`,
          { cwd: projectPath }
        );
      }

      // Clean up worktree and branch
      try {
        await execAsync(`git worktree remove "${worktreePath}" --force`, {
          cwd: projectPath,
        });
        await execAsync(`git branch -D ${branchName}`, { cwd: projectPath });
      } catch {
        // Cleanup errors are non-fatal
      }

      res.json({ success: true, mergedBranch: branchName });
    } catch (error) {
      logError(error, "Merge worktree failed");
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
