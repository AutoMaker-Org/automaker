/**
 * POST /activate endpoint - Switch main project to a worktree's branch
 *
 * This allows users to "activate" a worktree so their running dev server
 * (like Vite) shows the worktree's files. It does this by:
 * 1. Checking for uncommitted changes (fails if found)
 * 2. Removing the worktree (unlocks the branch)
 * 3. Checking out that branch in the main directory
 *
 * Users should commit their changes before activating a worktree.
 */

import type { Request, Response } from "express";
import { exec } from "child_process";
import { promisify } from "util";
import { getErrorMessage, logError } from "../common.js";

const execAsync = promisify(exec);

async function hasUncommittedChanges(cwd: string): Promise<boolean> {
  try {
    const { stdout } = await execAsync("git status --porcelain", { cwd });
    // Filter out our own .worktrees directory from the check
    const lines = stdout.trim().split("\n").filter((line) => {
      if (!line.trim()) return false;
      // Exclude .worktrees/ directory (created by automaker)
      if (line.includes(".worktrees/") || line.endsWith(".worktrees")) return false;
      return true;
    });
    return lines.length > 0;
  } catch {
    return false;
  }
}

async function getCurrentBranch(cwd: string): Promise<string> {
  const { stdout } = await execAsync("git branch --show-current", { cwd });
  return stdout.trim();
}

async function getWorktreeBranch(worktreePath: string): Promise<string> {
  const { stdout } = await execAsync("git branch --show-current", {
    cwd: worktreePath,
  });
  return stdout.trim();
}

async function getChangesSummary(cwd: string): Promise<string> {
  try {
    const { stdout } = await execAsync("git status --short", { cwd });
    const lines = stdout.trim().split("\n").filter((line) => {
      if (!line.trim()) return false;
      // Exclude .worktrees/ directory
      if (line.includes(".worktrees/") || line.endsWith(".worktrees")) return false;
      return true;
    });
    if (lines.length === 0) return "";
    if (lines.length <= 5) return lines.join(", ");
    return `${lines.slice(0, 5).join(", ")} and ${lines.length - 5} more files`;
  } catch {
    return "unknown changes";
  }
}

export function createActivateHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, worktreePath } = req.body as {
        projectPath: string;
        worktreePath: string | null; // null means switch back to main branch
      };

      if (!projectPath) {
        res.status(400).json({
          success: false,
          error: "projectPath is required",
        });
        return;
      }

      const currentBranch = await getCurrentBranch(projectPath);
      let targetBranch: string;

      // Check for uncommitted changes in main directory
      if (await hasUncommittedChanges(projectPath)) {
        const summary = await getChangesSummary(projectPath);
        res.status(400).json({
          success: false,
          error: `Cannot switch: you have uncommitted changes in the main directory (${summary}). Please commit your changes first.`,
          code: "UNCOMMITTED_CHANGES",
        });
        return;
      }

      if (worktreePath) {
        // Switching to a worktree's branch
        targetBranch = await getWorktreeBranch(worktreePath);

        // Check for uncommitted changes in the worktree
        if (await hasUncommittedChanges(worktreePath)) {
          const summary = await getChangesSummary(worktreePath);
          res.status(400).json({
            success: false,
            error: `Cannot switch: you have uncommitted changes in the worktree (${summary}). Please commit your changes first.`,
            code: "UNCOMMITTED_CHANGES",
          });
          return;
        }

        // Remove the worktree (unlocks the branch)
        console.log(`[activate] Removing worktree at ${worktreePath}...`);
        await execAsync(`git worktree remove "${worktreePath}" --force`, {
          cwd: projectPath,
        });

        // Checkout the branch in main directory
        console.log(`[activate] Checking out branch ${targetBranch}...`);
        await execAsync(`git checkout "${targetBranch}"`, { cwd: projectPath });
      } else {
        // Switching back to main branch
        try {
          const { stdout: mainBranch } = await execAsync(
            "git symbolic-ref refs/remotes/origin/HEAD --short 2>/dev/null | sed 's@origin/@@' || echo 'main'",
            { cwd: projectPath }
          );
          targetBranch = mainBranch.trim() || "main";
        } catch {
          targetBranch = "main";
        }

        // Checkout main branch
        console.log(`[activate] Checking out main branch ${targetBranch}...`);
        await execAsync(`git checkout "${targetBranch}"`, { cwd: projectPath });
      }

      res.json({
        success: true,
        result: {
          previousBranch: currentBranch,
          currentBranch: targetBranch,
          message: `Switched from ${currentBranch} to ${targetBranch}`,
        },
      });
    } catch (error) {
      logError(error, "Activate worktree failed");
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
