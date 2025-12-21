/**
 * POST /delete endpoint - Delete a git worktree
 */

import type { Request, Response } from "express";
import { exec } from "child_process";
import { promisify } from "util";
import { isGitRepo } from "@automaker/git-utils";
import { getErrorMessage, logError } from "../common.js";

const execAsync = promisify(exec);

export function createDeleteHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, worktreePath, deleteBranch } = req.body as {
        projectPath: string;
        worktreePath: string;
        deleteBranch?: boolean; // Whether to also delete the branch
      };

      if (!projectPath || !worktreePath) {
        res.status(400).json({
          success: false,
          error: "projectPath and worktreePath required",
        });
        return;
      }

      if (!(await isGitRepo(projectPath))) {
        res.status(400).json({
          success: false,
          error: "Not a git repository",
        });
        return;
      }

      // Get branch name before removing worktree
      let branchName: string | null = null;
      try {
        const { stdout } = await execAsync("git rev-parse --abbrev-ref HEAD", {
          cwd: worktreePath,
        });
        branchName = stdout.trim();
      } catch {
        // Could not get branch name
      }

      // Remove the worktree
      try {
        await execAsync(`git worktree remove "${worktreePath}" --force`, {
          cwd: projectPath,
        });
      } catch (error) {
        // Try with prune if remove fails
        await execAsync("git worktree prune", { cwd: projectPath });
      }

      // Optionally delete the branch
      if (deleteBranch && branchName && branchName !== "main" && branchName !== "master") {
        try {
          await execAsync(`git branch -D ${branchName}`, { cwd: projectPath });
        } catch {
          // Branch deletion failed, not critical
        }
      }

      res.json({
        success: true,
        deleted: {
          worktreePath,
          branch: deleteBranch ? branchName : null,
        },
      });
    } catch (error) {
      logError(error, "Delete worktree failed");
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
