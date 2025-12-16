/**
 * POST /info endpoint - Get worktree info
 */

import type { Request, Response } from "express";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs/promises";
import { getErrorMessage, logError } from "../common.js";

const execAsync = promisify(exec);

export function createInfoHandler() {
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

      // Check if worktree exists (git worktrees are stored in project directory)
      const worktreePath = path.join(projectPath, ".worktrees", featureId);
      try {
        await fs.access(worktreePath);
        const { stdout } = await execAsync("git rev-parse --abbrev-ref HEAD", {
          cwd: worktreePath,
        });
        res.json({
          success: true,
          worktreePath,
          branchName: stdout.trim(),
        });
      } catch {
        res.json({ success: true, worktreePath: null, branchName: null });
      }
    } catch (error) {
      logError(error, "Get worktree info failed");
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
