/**
 * POST /create-pr endpoint - Commit changes and create a pull request from a worktree
 */

import type { Request, Response } from "express";
import { exec } from "child_process";
import { promisify } from "util";
import { getErrorMessage, logError } from "../common.js";

const execAsync = promisify(exec);

// Extended PATH to include common tool installation locations
// This is needed because Electron apps don't inherit the user's shell PATH
const pathSeparator = process.platform === "win32" ? ";" : ":";
const additionalPaths: string[] = [];

if (process.platform === "win32") {
  // Windows paths
  if (process.env.LOCALAPPDATA) {
    additionalPaths.push(`${process.env.LOCALAPPDATA}\\Programs\\Git\\cmd`);
  }
  if (process.env.PROGRAMFILES) {
    additionalPaths.push(`${process.env.PROGRAMFILES}\\Git\\cmd`);
  }
  if (process.env["ProgramFiles(x86)"]) {
    additionalPaths.push(`${process.env["ProgramFiles(x86)"]}\\Git\\cmd`);
  }
} else {
  // Unix/Mac paths
  additionalPaths.push(
    "/opt/homebrew/bin",        // Homebrew on Apple Silicon
    "/usr/local/bin",           // Homebrew on Intel Mac, common Linux location
    "/home/linuxbrew/.linuxbrew/bin", // Linuxbrew
    `${process.env.HOME}/.local/bin`, // pipx, other user installs
  );
}

const extendedPath = [
  process.env.PATH,
  ...additionalPaths.filter(Boolean),
].filter(Boolean).join(pathSeparator);

const execEnv = {
  ...process.env,
  PATH: extendedPath,
};

export function createCreatePRHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { worktreePath, commitMessage, prTitle, prBody, baseBranch, draft } = req.body as {
        worktreePath: string;
        commitMessage?: string;
        prTitle?: string;
        prBody?: string;
        baseBranch?: string;
        draft?: boolean;
      };

      if (!worktreePath) {
        res.status(400).json({
          success: false,
          error: "worktreePath required",
        });
        return;
      }

      // Get current branch name
      const { stdout: branchOutput } = await execAsync(
        "git rev-parse --abbrev-ref HEAD",
        { cwd: worktreePath, env: execEnv }
      );
      const branchName = branchOutput.trim();

      // Check for uncommitted changes
      const { stdout: status } = await execAsync("git status --porcelain", {
        cwd: worktreePath,
        env: execEnv,
      });
      const hasChanges = status.trim().length > 0;

      // If there are changes, commit them
      let commitHash: string | null = null;
      if (hasChanges) {
        const message = commitMessage || `Changes from ${branchName}`;

        // Stage all changes
        await execAsync("git add -A", { cwd: worktreePath, env: execEnv });

        // Create commit
        await execAsync(`git commit -m "${message.replace(/"/g, '\\"')}"`, {
          cwd: worktreePath,
          env: execEnv,
        });

        // Get commit hash
        const { stdout: hashOutput } = await execAsync("git rev-parse HEAD", {
          cwd: worktreePath,
          env: execEnv,
        });
        commitHash = hashOutput.trim().substring(0, 8);
      }

      // Push the branch to remote
      let pushError: string | null = null;
      try {
        await execAsync(`git push -u origin ${branchName}`, {
          cwd: worktreePath,
          env: execEnv,
        });
      } catch (error: unknown) {
        // If push fails, try with --set-upstream
        try {
          await execAsync(`git push --set-upstream origin ${branchName}`, {
            cwd: worktreePath,
            env: execEnv,
          });
        } catch (error2: unknown) {
          // Capture push error for reporting
          const err = error2 as { stderr?: string; message?: string };
          pushError = err.stderr || err.message || "Push failed";
          console.error("[CreatePR] Push failed:", pushError);
        }
      }

      // If push failed, return error
      if (pushError) {
        res.status(500).json({
          success: false,
          error: `Failed to push branch: ${pushError}`,
        });
        return;
      }

      // Create PR using gh CLI or provide browser fallback
      const base = baseBranch || "main";
      const title = prTitle || branchName;
      const body = prBody || `Changes from branch ${branchName}`;
      const draftFlag = draft ? "--draft" : "";

      let prUrl: string | null = null;
      let prError: string | null = null;
      let browserUrl: string | null = null;
      let ghCliAvailable = false;

      // Check if gh CLI is available (cross-platform)
      try {
        const checkCommand = process.platform === "win32" 
          ? "where gh" 
          : "command -v gh";
        await execAsync(checkCommand, { env: execEnv });
        ghCliAvailable = true;
      } catch {
        ghCliAvailable = false;
      }

      // Get repository URL for browser fallback
      let repoUrl: string | null = null;
      let upstreamRepo: string | null = null;
      let originOwner: string | null = null;
      try {
        const { stdout: remotes } = await execAsync("git remote -v", {
          cwd: worktreePath,
          env: execEnv,
        });

        // Parse remotes to detect fork workflow and get repo URL
        const lines = remotes.split(/\r?\n/); // Handle both Unix and Windows line endings
        for (const line of lines) {
          // Try multiple patterns to match different remote URL formats
          // Pattern 1: git@github.com:owner/repo.git (fetch)
          // Pattern 2: https://github.com/owner/repo.git (fetch)
          // Pattern 3: https://github.com/owner/repo (fetch)
          let match = line.match(/^(\w+)\s+.*[:/]([^/]+)\/([^/\s]+?)(?:\.git)?\s+\(fetch\)/);
          if (!match) {
            // Try SSH format: git@github.com:owner/repo.git
            match = line.match(/^(\w+)\s+git@[^:]+:([^/]+)\/([^\s]+?)(?:\.git)?\s+\(fetch\)/);
          }
          if (!match) {
            // Try HTTPS format: https://github.com/owner/repo.git
            match = line.match(/^(\w+)\s+https?:\/\/[^/]+\/([^/]+)\/([^\s]+?)(?:\.git)?\s+\(fetch\)/);
          }
          
          if (match) {
            const [, remoteName, owner, repo] = match;
            if (remoteName === "upstream") {
              upstreamRepo = `${owner}/${repo}`;
              repoUrl = `https://github.com/${owner}/${repo}`;
            } else if (remoteName === "origin") {
              originOwner = owner;
              if (!repoUrl) {
                repoUrl = `https://github.com/${owner}/${repo}`;
              }
            }
          }
        }
      } catch (error) {
        // Couldn't parse remotes - will try fallback
      }

      // Fallback: Try to get repo URL from git config if remote parsing failed
      if (!repoUrl) {
        try {
          const { stdout: originUrl } = await execAsync("git config --get remote.origin.url", {
            cwd: worktreePath,
            env: execEnv,
          });
          const url = originUrl.trim();
          
          // Parse URL to extract owner/repo
          // Handle both SSH (git@github.com:owner/repo.git) and HTTPS (https://github.com/owner/repo.git)
          let match = url.match(/[:/]([^/]+)\/([^/\s]+?)(?:\.git)?$/);
          if (match) {
            const [, owner, repo] = match;
            originOwner = owner;
            repoUrl = `https://github.com/${owner}/${repo}`;
          }
        } catch (error) {
          // Failed to get repo URL from config
        }
      }

      // Construct browser URL for PR creation
      if (repoUrl) {
        const encodedTitle = encodeURIComponent(title);
        const encodedBody = encodeURIComponent(body);

        if (upstreamRepo && originOwner) {
          // Fork workflow: PR to upstream from origin
          browserUrl = `https://github.com/${upstreamRepo}/compare/${base}...${originOwner}:${branchName}?expand=1&title=${encodedTitle}&body=${encodedBody}`;
        } else {
          // Regular repo
          browserUrl = `${repoUrl}/compare/${base}...${branchName}?expand=1&title=${encodedTitle}&body=${encodedBody}`;
        }
      }

      if (ghCliAvailable) {
        try {
          // Build gh pr create command
          let prCmd = `gh pr create --base "${base}"`;

          // If this is a fork (has upstream remote), specify the repo and head
          if (upstreamRepo && originOwner) {
            // For forks: --repo specifies where to create PR, --head specifies source
            prCmd += ` --repo "${upstreamRepo}" --head "${originOwner}:${branchName}"`;
          } else {
            // Not a fork, just specify the head branch
            prCmd += ` --head "${branchName}"`;
          }

          prCmd += ` --title "${title.replace(/"/g, '\\"')}" --body "${body.replace(/"/g, '\\"')}" ${draftFlag}`;
          prCmd = prCmd.trim();

          const { stdout: prOutput } = await execAsync(prCmd, {
            cwd: worktreePath,
            env: execEnv,
          });
          prUrl = prOutput.trim();
        } catch (ghError: unknown) {
          // gh CLI failed
          const err = ghError as { stderr?: string; message?: string };
          prError = err.stderr || err.message || "PR creation failed";
        }
      } else {
        prError = "gh_cli_not_available";
      }

      // Return result with browser fallback URL
      res.json({
        success: true,
        result: {
          branch: branchName,
          committed: hasChanges,
          commitHash,
          pushed: true,
          prUrl,
          prCreated: !!prUrl,
          prError: prError || undefined,
          browserUrl: browserUrl || undefined,
          ghCliAvailable,
        },
      });
    } catch (error) {
      logError(error, "Create PR failed");
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
