/**
 * POST /init-git endpoint - Initialize a git repository in a directory
 */

import type { Request, Response } from "express";
import { exec } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";
import { join } from "path";
import { getErrorMessage, logError } from "../common.js";

const execAsync = promisify(exec);

export function createInitGitHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as {
        projectPath: string;
      };

      if (!projectPath) {
        res.status(400).json({
          success: false,
          error: "projectPath required",
        });
        return;
      }

      // Check if .git already exists
      const gitDirPath = join(projectPath, ".git");
      if (existsSync(gitDirPath)) {
        res.json({
          success: true,
          result: {
            initialized: false,
            message: "Git repository already exists",
          },
        });
        return;
      }

      // Initialize git and create an initial empty commit
      await execAsync(
        `git init && git commit --allow-empty -m "Initial commit"`,
        { cwd: projectPath }
      );

      res.json({
        success: true,
        result: {
          initialized: true,
          message: "Git repository initialized with initial commit",
        },
      });
    } catch (error) {
      logError(error, "Init git failed");
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
