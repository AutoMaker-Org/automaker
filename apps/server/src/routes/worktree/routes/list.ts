/**
 * POST /list endpoint - List all git worktrees
 *
 * Returns actual git worktrees from `git worktree list`.
 * Does NOT include tracked branches - only real worktrees with separate directories.
 */

import type { Request, Response } from "express";
import { exec } from "child_process";
import { promisify } from "util";
import { isGitRepo, getErrorMessage, logError } from "../common.js";

const execAsync = promisify(exec);

interface WorktreeInfo {
  path: string;
  branch: string;
  isMain: boolean;
  isCurrent: boolean; // Is this the currently checked out branch in main?
  hasWorktree: boolean; // Always true for items in this list
  hasChanges?: boolean;
  changedFilesCount?: number;
}

async function getCurrentBranch(cwd: string): Promise<string> {
  try {
    const { stdout } = await execAsync("git branch --show-current", { cwd });
    return stdout.trim();
  } catch {
    return "";
  }
}

export function createListHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, includeDetails } = req.body as {
        projectPath: string;
        includeDetails?: boolean;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: "projectPath required" });
        return;
      }

      if (!(await isGitRepo(projectPath))) {
        res.json({ success: true, worktrees: [] });
        return;
      }

      // Get current branch in main directory
      const currentBranch = await getCurrentBranch(projectPath);

      // Get actual worktrees from git
      const { stdout } = await execAsync("git worktree list --porcelain", {
        cwd: projectPath,
      });

      const worktrees: WorktreeInfo[] = [];
      const lines = stdout.split("\n");
      let current: { path?: string; branch?: string } = {};
      let isFirst = true;

      for (const line of lines) {
        if (line.startsWith("worktree ")) {
          current.path = line.slice(9);
        } else if (line.startsWith("branch ")) {
          current.branch = line.slice(7).replace("refs/heads/", "");
        } else if (line === "") {
          if (current.path && current.branch) {
            worktrees.push({
              path: current.path,
              branch: current.branch,
              isMain: isFirst,
              isCurrent: current.branch === currentBranch,
              hasWorktree: true,
            });
            isFirst = false;
          }
          current = {};
        }
      }

      // If includeDetails is requested, fetch change status for each worktree
      if (includeDetails) {
        for (const worktree of worktrees) {
          try {
            const { stdout: statusOutput } = await execAsync(
              "git status --porcelain",
              { cwd: worktree.path }
            );
            const changedFiles = statusOutput
              .trim()
              .split("\n")
              .filter((line) => line.trim());
            worktree.hasChanges = changedFiles.length > 0;
            worktree.changedFilesCount = changedFiles.length;
          } catch {
            worktree.hasChanges = false;
            worktree.changedFilesCount = 0;
          }
        }
      }

      res.json({ success: true, worktrees });
    } catch (error) {
      logError(error, "List worktrees failed");
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
