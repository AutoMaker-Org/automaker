/**
 * POST /create endpoint - Create a new git worktree
 */

import type { Request, Response } from "express";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import { mkdir, access } from "fs/promises";
import { isGitRepo, getErrorMessage, logError } from "../common.js";
import { trackBranch } from "./branch-tracking.js";

const execAsync = promisify(exec);

export function createCreateHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, branchName, baseBranch } = req.body as {
        projectPath: string;
        branchName: string;
        baseBranch?: string; // Optional base branch to create from (defaults to current HEAD)
      };

      if (!projectPath || !branchName) {
        res.status(400).json({
          success: false,
          error: "projectPath and branchName required",
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

      // Sanitize branch name for directory usage
      const sanitizedName = branchName.replace(/[^a-zA-Z0-9_-]/g, "-");
      const worktreesDir = path.join(projectPath, ".worktrees");
      const worktreePath = path.join(worktreesDir, sanitizedName);

      // Create worktrees directory if it doesn't exist
      await mkdir(worktreesDir, { recursive: true });

      // Check if worktree already exists
      try {
        await access(worktreePath);
        // Worktree already exists, return it instead of error
        res.json({
          success: true,
          worktree: {
            path: worktreePath,
            branch: branchName,
            isNew: false,
          },
        });
        return;
      } catch {
        // Worktree doesn't exist, good to proceed
      }

      // Check if branch exists
      let branchExists = false;
      try {
        await execAsync(`git rev-parse --verify ${branchName}`, {
          cwd: projectPath,
        });
        branchExists = true;
      } catch {
        // Branch doesn't exist
      }

      // Create worktree
      let createCmd: string;
      if (branchExists) {
        // Use existing branch
        createCmd = `git worktree add "${worktreePath}" ${branchName}`;
      } else {
        // Create new branch from base or HEAD
        const base = baseBranch || "HEAD";
        createCmd = `git worktree add -b ${branchName} "${worktreePath}" ${base}`;
      }

      await execAsync(createCmd, { cwd: projectPath });

      // Note: We intentionally do NOT symlink .automaker to worktrees
      // Features and config are always accessed from the main project path
      // This avoids symlink loop issues when activating worktrees

      // Track the branch so it persists in the UI even after worktree is removed
      await trackBranch(projectPath, branchName);

      res.json({
        success: true,
        worktree: {
          path: worktreePath,
          branch: branchName,
          isNew: !branchExists,
        },
      });
    } catch (error) {
      logError(error, "Create worktree failed");
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
