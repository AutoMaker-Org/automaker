/**
 * Git status parsing utilities
 */

import { exec } from "child_process";
import { promisify } from "util";
import { GIT_STATUS_MAP, type FileStatus } from './types.js';

const execAsync = promisify(exec);

/**
 * Get a readable status text from git status codes
 * Handles both single character and XY format status codes
 */
function getStatusText(indexStatus: string, workTreeStatus: string): string {
  // Untracked files
  if (indexStatus === "?" && workTreeStatus === "?") {
    return "Untracked";
  }

  // Ignored files
  if (indexStatus === "!" && workTreeStatus === "!") {
    return "Ignored";
  }

  // Prioritize staging area status, then working tree
  const primaryStatus = indexStatus !== " " && indexStatus !== "?" ? indexStatus : workTreeStatus;

  // Handle combined statuses
  if (indexStatus !== " " && indexStatus !== "?" && workTreeStatus !== " " && workTreeStatus !== "?") {
    // Both staging and working tree have changes
    const indexText = GIT_STATUS_MAP[indexStatus] || "Changed";
    const workText = GIT_STATUS_MAP[workTreeStatus] || "Changed";
    if (indexText === workText) {
      return indexText;
    }
    return `${indexText} (staged), ${workText} (unstaged)`;
  }

  return GIT_STATUS_MAP[primaryStatus] || "Changed";
}

/**
 * Check if a path is a git repository
 */
export async function isGitRepo(repoPath: string): Promise<boolean> {
  try {
    await execAsync("git rev-parse --is-inside-work-tree", { cwd: repoPath });
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse the output of `git status --porcelain` into FileStatus array
 * Git porcelain format: XY PATH where X=staging area status, Y=working tree status
 * For renamed files: XY ORIG_PATH -> NEW_PATH
 */
export function parseGitStatus(statusOutput: string): FileStatus[] {
  return statusOutput
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      // Git porcelain format uses two status characters: XY
      // X = status in staging area (index)
      // Y = status in working tree
      const indexStatus = line[0] || " ";
      const workTreeStatus = line[1] || " ";

      // File path starts at position 3 (after "XY ")
      let filePath = line.slice(3);

      // Handle renamed files (format: "R  old_path -> new_path")
      if (indexStatus === "R" || workTreeStatus === "R") {
        const arrowIndex = filePath.indexOf(" -> ");
        if (arrowIndex !== -1) {
          filePath = filePath.slice(arrowIndex + 4); // Use new path
        }
      }

      // Determine the primary status character for backwards compatibility
      // Prioritize staging area status, then working tree
      let primaryStatus: string;
      if (indexStatus === "?" && workTreeStatus === "?") {
        primaryStatus = "?"; // Untracked
      } else if (indexStatus !== " " && indexStatus !== "?") {
        primaryStatus = indexStatus; // Staged change
      } else {
        primaryStatus = workTreeStatus; // Working tree change
      }

      return {
        status: primaryStatus,
        path: filePath,
        statusText: getStatusText(indexStatus, workTreeStatus),
      };
    });
}
