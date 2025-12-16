/**
 * POST /revert endpoint - Revert feature (remove worktree)
 */

import type { Request, Response } from "express";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import { getErrorMessage, logError } from "../common.js";

const execAsync = promisify(exec);

export function createRevertHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, featureId } = req.body as {
        projectPath: string;
        featureId: string;
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

      // Git worktrees are stored in project directory
      const worktreePath = path.join(projectPath, ".worktrees", featureId);

      try {
        // Remove worktree
        await execAsync(`git worktree remove "${worktreePath}" --force`, {
          cwd: projectPath,
        });
        // Delete branch
        await execAsync(`git branch -D feature/${featureId}`, {
          cwd: projectPath,
        });

        res.json({ success: true, removedPath: worktreePath });
      } catch (error) {
        // Worktree might not exist
        res.json({ success: true, removedPath: null });
      }
    } catch (error) {
      logError(error, "Revert worktree failed");
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
