/**
 * WorktreeResolver - Git worktree discovery and resolution
 *
 * Extracted from AutoModeService to provide a standalone service for:
 * - Finding existing worktrees for a given branch
 * - Getting the current branch of a repository
 * - Listing all worktrees with their metadata
 *
 * Key behaviors:
 * - Parses `git worktree list --porcelain` output
 * - Always resolves paths to absolute (cross-platform compatibility)
 * - Handles detached HEAD and bare worktrees gracefully
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

/**
 * Information about a git worktree
 */
export interface WorktreeInfo {
  /** Absolute path to the worktree directory */
  path: string;
  /** Branch name (without refs/heads/ prefix), or null if detached HEAD */
  branch: string | null;
  /** Whether this is the main worktree (first in git worktree list) */
  isMain: boolean;
}

/**
 * WorktreeResolver handles git worktree discovery and path resolution.
 *
 * This service is responsible for:
 * 1. Finding existing worktrees by branch name
 * 2. Getting the current branch of a repository
 * 3. Listing all worktrees with normalized paths
 */
export class WorktreeResolver {
  /**
   * Get the current branch name for a git repository
   *
   * @param projectPath - Path to the git repository
   * @returns The current branch name, or null if not in a git repo or on detached HEAD
   */
  async getCurrentBranch(projectPath: string): Promise<string | null> {
    try {
      const { stdout } = await execAsync('git branch --show-current', { cwd: projectPath });
      const branch = stdout.trim();
      return branch || null;
    } catch {
      return null;
    }
  }

  /**
   * Find an existing worktree for a given branch name
   *
   * @param projectPath - Path to the git repository (main worktree)
   * @param branchName - Branch name to find worktree for
   * @returns Absolute path to the worktree, or null if not found
   */
  async findWorktreeForBranch(projectPath: string, branchName: string): Promise<string | null> {
    try {
      const { stdout } = await execAsync('git worktree list --porcelain', {
        cwd: projectPath,
      });

      const lines = stdout.split('\n');
      let currentPath: string | null = null;
      let currentBranch: string | null = null;

      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          currentPath = line.slice(9);
        } else if (line.startsWith('branch ')) {
          currentBranch = line.slice(7).replace('refs/heads/', '');
        } else if (line === '' && currentPath && currentBranch) {
          // End of a worktree entry
          if (currentBranch === branchName) {
            // Resolve to absolute path - git may return relative paths
            // On Windows, this is critical for cwd to work correctly
            // On all platforms, absolute paths ensure consistent behavior
            return this.resolvePath(projectPath, currentPath);
          }
          currentPath = null;
          currentBranch = null;
        }
      }

      // Check the last entry (if file doesn't end with newline)
      if (currentPath && currentBranch && currentBranch === branchName) {
        return this.resolvePath(projectPath, currentPath);
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * List all worktrees for a repository
   *
   * @param projectPath - Path to the git repository
   * @returns Array of WorktreeInfo objects with normalized paths
   */
  async listWorktrees(projectPath: string): Promise<WorktreeInfo[]> {
    try {
      const { stdout } = await execAsync('git worktree list --porcelain', {
        cwd: projectPath,
      });

      const worktrees: WorktreeInfo[] = [];
      const lines = stdout.split('\n');
      let currentPath: string | null = null;
      let currentBranch: string | null = null;
      let isFirstWorktree = true;

      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          currentPath = line.slice(9);
        } else if (line.startsWith('branch ')) {
          currentBranch = line.slice(7).replace('refs/heads/', '');
        } else if (line.startsWith('detached')) {
          // Detached HEAD - branch is null
          currentBranch = null;
        } else if (line === '' && currentPath) {
          // End of a worktree entry
          worktrees.push({
            path: this.resolvePath(projectPath, currentPath),
            branch: currentBranch,
            isMain: isFirstWorktree,
          });
          currentPath = null;
          currentBranch = null;
          isFirstWorktree = false;
        }
      }

      // Handle last entry if file doesn't end with newline
      if (currentPath) {
        worktrees.push({
          path: this.resolvePath(projectPath, currentPath),
          branch: currentBranch,
          isMain: isFirstWorktree,
        });
      }

      return worktrees;
    } catch {
      return [];
    }
  }

  /**
   * Resolve a path to absolute, handling both relative and absolute inputs
   *
   * @param projectPath - Base path for relative resolution
   * @param worktreePath - Path from git worktree list output
   * @returns Absolute path
   */
  private resolvePath(projectPath: string, worktreePath: string): string {
    return path.isAbsolute(worktreePath)
      ? path.resolve(worktreePath)
      : path.resolve(projectPath, worktreePath);
  }
}
