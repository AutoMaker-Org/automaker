/**
 * POST /file-diff endpoint - Get diff for a specific file
 */

import type { Request, Response } from "express";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs/promises";
import { getErrorMessage, logError } from "../common.js";

const execAsync = promisify(exec);

export function createFileDiffHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, featureId, filePath } = req.body as {
        projectPath: string;
        featureId: string;
        filePath: string;
      };

      if (!projectPath || !featureId || !filePath) {
        res.status(400).json({
          success: false,
          error: "projectPath, featureId, and filePath required",
        });
        return;
      }

      // Git worktrees are stored in project directory
      const worktreePath = path.join(projectPath, ".worktrees", featureId);

      try {
        await fs.access(worktreePath);
        const { stdout: diff } = await execAsync(
          `git diff HEAD -- "${filePath}"`,
          {
            cwd: worktreePath,
            maxBuffer: 10 * 1024 * 1024,
          }
        );

        res.json({ success: true, diff, filePath });
      } catch {
        res.json({ success: true, diff: "", filePath });
      }
    } catch (error) {
      logError(error, "Get worktree file diff failed");
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
