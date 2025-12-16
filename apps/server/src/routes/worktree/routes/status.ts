/**
 * POST /status endpoint - Get worktree status
 */

import type { Request, Response } from "express";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs/promises";
import { getErrorMessage, logError } from "../common.js";

const execAsync = promisify(exec);

export function createStatusHandler() {
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
        await fs.access(worktreePath);
        const { stdout: status } = await execAsync("git status --porcelain", {
          cwd: worktreePath,
        });
        const files = status
          .split("\n")
          .filter(Boolean)
          .map((line) => line.slice(3));
        const { stdout: diffStat } = await execAsync("git diff --stat", {
          cwd: worktreePath,
        });
        const { stdout: logOutput } = await execAsync(
          'git log --oneline -5 --format="%h %s"',
          { cwd: worktreePath }
        );

        res.json({
          success: true,
          modifiedFiles: files.length,
          files,
          diffStat: diffStat.trim(),
          recentCommits: logOutput.trim().split("\n").filter(Boolean),
        });
      } catch {
        res.json({
          success: true,
          modifiedFiles: 0,
          files: [],
          diffStat: "",
          recentCommits: [],
        });
      }
    } catch (error) {
      logError(error, "Get worktree status failed");
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
