/**
 * POST /diffs endpoint - Get diffs for a worktree
 */

import type { Request, Response } from "express";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs/promises";
import { getErrorMessage, logError } from "../common.js";

const execAsync = promisify(exec);

export function createDiffsHandler() {
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
        const { stdout: diff } = await execAsync("git diff HEAD", {
          cwd: worktreePath,
          maxBuffer: 10 * 1024 * 1024,
        });
        const { stdout: status } = await execAsync("git status --porcelain", {
          cwd: worktreePath,
        });

        const files = status
          .split("\n")
          .filter(Boolean)
          .map((line) => {
            const statusChar = line[0];
            const filePath = line.slice(3);
            const statusMap: Record<string, string> = {
              M: "Modified",
              A: "Added",
              D: "Deleted",
              R: "Renamed",
              C: "Copied",
              U: "Updated",
              "?": "Untracked",
            };
            return {
              status: statusChar,
              path: filePath,
              statusText: statusMap[statusChar] || "Unknown",
            };
          });

        res.json({
          success: true,
          diff,
          files,
          hasChanges: files.length > 0,
        });
      } catch {
        res.json({ success: true, diff: "", files: [], hasChanges: false });
      }
    } catch (error) {
      logError(error, "Get worktree diffs failed");
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
