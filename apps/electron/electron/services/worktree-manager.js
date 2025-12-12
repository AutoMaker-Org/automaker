const path = require("path");
const fs = require("fs/promises");
const { exec, spawn } = require("child_process");
const { promisify } = require("util");

const execAsync = promisify(exec);

/**
 * Worktree Manager - Handles git worktrees for feature isolation
 *
 * This service creates isolated git worktrees for each feature, allowing:
 * - Features to be worked on in isolation without affecting the main branch
 * - Easy rollback/revert by simply deleting the worktree
 * - Checkpointing - user can see changes in the worktree before merging
 */
class WorktreeManager {
  constructor() {
    // Cache for worktree info
    this.worktreeCache = new Map();
  }

  /**
   * Get the base worktree directory path
   */
  getWorktreeBasePath(projectPath) {
    return path.join(projectPath, ".automaker", "worktrees");
  }

  /**
   * Generate a safe branch name from feature description
   */
  generateBranchName(feature) {
    // Create a slug from the description
    const slug = feature.description
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "") // Remove special chars
      .replace(/\s+/g, "-") // Replace spaces with hyphens
      .substring(0, 40); // Limit length

    // Add feature ID for uniqueness
    const shortId = feature.id.replace("feature-", "").substring(0, 12);
    return `feature/${shortId}-${slug}`;
  }

  /**
   * Check if the project is a git repository
   */
  async isGitRepo(projectPath) {
    try {
      await execAsync("git rev-parse --is-inside-work-tree", { cwd: projectPath });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the current branch name
   */
  async getCurrentBranch(projectPath) {
    try {
      const { stdout } = await execAsync("git rev-parse --abbrev-ref HEAD", { cwd: projectPath });
      return stdout.trim();
    } catch (error) {
      console.error("[WorktreeManager] Failed to get current branch:", error);
      return null;
    }
  }

  /**
   * Check if a branch exists (local or remote)
   */
  async branchExists(projectPath, branchName) {
    try {
      await execAsync(`git rev-parse --verify ${branchName}`, { cwd: projectPath });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List all existing worktrees
   */
  async listWorktrees(projectPath) {
    try {
      const { stdout } = await execAsync("git worktree list --porcelain", { cwd: projectPath });
      const worktrees = [];
      const lines = stdout.split("\n");

      let currentWorktree = null;
      for (const line of lines) {
        if (line.startsWith("worktree ")) {
          if (currentWorktree) {
            worktrees.push(currentWorktree);
          }
          currentWorktree = { path: line.replace("worktree ", "") };
        } else if (line.startsWith("branch ") && currentWorktree) {
          currentWorktree.branch = line.replace("branch refs/heads/", "");
        } else if (line.startsWith("HEAD ") && currentWorktree) {
          currentWorktree.head = line.replace("HEAD ", "");
        }
      }
      if (currentWorktree) {
        worktrees.push(currentWorktree);
      }

      return worktrees;
    } catch (error) {
      console.error("[WorktreeManager] Failed to list worktrees:", error);
      return [];
    }
  }

  /**
   * Create a worktree for a feature
   * @param {string} projectPath - Path to the main project
   * @param {object} feature - Feature object with id and description
   * @returns {object} - { success, worktreePath, branchName, error }
   */
  async createWorktree(projectPath, feature) {
    console.log(`[WorktreeManager] Creating worktree for feature: ${feature.id}`);

    // Check if project is a git repo
    if (!await this.isGitRepo(projectPath)) {
      return { success: false, error: "Project is not a git repository" };
    }

    const branchName = this.generateBranchName(feature);
    const worktreeBasePath = this.getWorktreeBasePath(projectPath);
    const worktreePath = path.join(worktreeBasePath, branchName.replace("feature/", ""));

    try {
      // Ensure worktree directory exists
      await fs.mkdir(worktreeBasePath, { recursive: true });

      // Check if worktree already exists
      const worktrees = await this.listWorktrees(projectPath);
      const existingWorktree = worktrees.find(
        w => w.path === worktreePath || w.branch === branchName
      );

      if (existingWorktree) {
        console.log(`[WorktreeManager] Worktree already exists for feature: ${feature.id}`);
        return {
          success: true,
          worktreePath: existingWorktree.path,
          branchName: existingWorktree.branch,
          existed: true,
        };
      }

      // Get current branch to base the new branch on
      const baseBranch = await this.getCurrentBranch(projectPath);
      if (!baseBranch) {
        return { success: false, error: "Could not determine current branch" };
      }

      // Check if branch already exists
      const branchExists = await this.branchExists(projectPath, branchName);

      if (branchExists) {
        // Use existing branch
        console.log(`[WorktreeManager] Using existing branch: ${branchName}`);
        await execAsync(`git worktree add "${worktreePath}" ${branchName}`, { cwd: projectPath });
      } else {
        // Create new worktree with new branch
        console.log(`[WorktreeManager] Creating new branch: ${branchName} based on ${baseBranch}`);
        await execAsync(`git worktree add -b ${branchName} "${worktreePath}" ${baseBranch}`, { cwd: projectPath });
      }

      // Copy .automaker directory to worktree (except worktrees directory itself to avoid recursion)
      const automakerSrc = path.join(projectPath, ".automaker");
      const automakerDst = path.join(worktreePath, ".automaker");

      try {
        await fs.mkdir(automakerDst, { recursive: true });

        // Note: Features are stored in .automaker/features/{id}/feature.json
        // These are managed by the main project, not copied to worktrees

        // Copy app_spec.txt if it exists
        const appSpecSrc = path.join(automakerSrc, "app_spec.txt");
        const appSpecDst = path.join(automakerDst, "app_spec.txt");
        try {
          const content = await fs.readFile(appSpecSrc, "utf-8");
          await fs.writeFile(appSpecDst, content, "utf-8");
        } catch {
          // App spec might not exist yet
        }

        // Copy categories.json if it exists
        const categoriesSrc = path.join(automakerSrc, "categories.json");
        const categoriesDst = path.join(automakerDst, "categories.json");
        try {
          const content = await fs.readFile(categoriesSrc, "utf-8");
          await fs.writeFile(categoriesDst, content, "utf-8");
        } catch {
          // Categories might not exist yet
        }
      } catch (error) {
        console.warn("[WorktreeManager] Failed to copy .automaker directory:", error);
      }

      // Store worktree info in cache
      this.worktreeCache.set(feature.id, {
        worktreePath,
        branchName,
        createdAt: new Date().toISOString(),
        baseBranch,
      });

      console.log(`[WorktreeManager] Worktree created at: ${worktreePath}`);
      return {
        success: true,
        worktreePath,
        branchName,
        baseBranch,
        existed: false,
      };
    } catch (error) {
      console.error("[WorktreeManager] Failed to create worktree:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get worktree info for a feature
   */
  async getWorktreeInfo(projectPath, featureId) {
    // Check cache first
    if (this.worktreeCache.has(featureId)) {
      return { success: true, ...this.worktreeCache.get(featureId) };
    }

    // Scan worktrees to find matching one
    const worktrees = await this.listWorktrees(projectPath);
    const worktreeBasePath = this.getWorktreeBasePath(projectPath);

    for (const worktree of worktrees) {
      // Check if this worktree is in our worktree directory
      if (worktree.path.startsWith(worktreeBasePath)) {
        // Check if the feature ID is in the branch name
        const shortId = featureId.replace("feature-", "").substring(0, 12);
        if (worktree.branch && worktree.branch.includes(shortId)) {
          const info = {
            worktreePath: worktree.path,
            branchName: worktree.branch,
            head: worktree.head,
          };
          this.worktreeCache.set(featureId, info);
          return { success: true, ...info };
        }
      }
    }

    return { success: false, error: "Worktree not found" };
  }

  /**
   * Remove a worktree for a feature
   * This effectively reverts all changes made by the agent
   */
  async removeWorktree(projectPath, featureId, deleteBranch = false) {
    console.log(`[WorktreeManager] Removing worktree for feature: ${featureId}`);

    const worktreeInfo = await this.getWorktreeInfo(projectPath, featureId);
    if (!worktreeInfo.success) {
      console.log(`[WorktreeManager] No worktree found for feature: ${featureId}`);
      return { success: true, message: "No worktree to remove" };
    }

    const { worktreePath, branchName } = worktreeInfo;

    try {
      // Remove the worktree
      await execAsync(`git worktree remove "${worktreePath}" --force`, { cwd: projectPath });
      console.log(`[WorktreeManager] Worktree removed: ${worktreePath}`);

      // Optionally delete the branch too
      if (deleteBranch && branchName) {
        try {
          await execAsync(`git branch -D ${branchName}`, { cwd: projectPath });
          console.log(`[WorktreeManager] Branch deleted: ${branchName}`);
        } catch (error) {
          console.warn(`[WorktreeManager] Could not delete branch ${branchName}:`, error.message);
        }
      }

      // Remove from cache
      this.worktreeCache.delete(featureId);

      return { success: true, removedPath: worktreePath, removedBranch: deleteBranch ? branchName : null };
    } catch (error) {
      console.error("[WorktreeManager] Failed to remove worktree:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get status of changes in a worktree
   */
  async getWorktreeStatus(worktreePath) {
    try {
      const { stdout: statusOutput } = await execAsync("git status --porcelain", { cwd: worktreePath });
      const { stdout: diffStat } = await execAsync("git diff --stat", { cwd: worktreePath });
      const { stdout: commitLog } = await execAsync("git log --oneline -10", { cwd: worktreePath });

      const files = statusOutput.trim().split("\n").filter(Boolean);
      const commits = commitLog.trim().split("\n").filter(Boolean);

      return {
        success: true,
        modifiedFiles: files.length,
        files: files.slice(0, 20), // Limit to 20 files
        diffStat: diffStat.trim(),
        recentCommits: commits.slice(0, 5), // Last 5 commits
      };
    } catch (error) {
      console.error("[WorktreeManager] Failed to get worktree status:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get detailed file diff content for a worktree
   * Returns unified diff format for all changes
   */
  async getFileDiffs(worktreePath) {
    try {
      // Get both staged and unstaged diffs
      const { stdout: unstagedDiff } = await execAsync("git diff --no-color", {
        cwd: worktreePath,
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer for large diffs
      });
      const { stdout: stagedDiff } = await execAsync("git diff --cached --no-color", {
        cwd: worktreePath,
        maxBuffer: 10 * 1024 * 1024
      });

      // Get list of files with their status
      const { stdout: statusOutput } = await execAsync("git status --porcelain", { cwd: worktreePath });
      const files = statusOutput.trim().split("\n").filter(Boolean);

      // Parse file statuses
      const fileStatuses = files.map(line => {
        const status = line.substring(0, 2);
        const filePath = line.substring(3);
        return {
          status: status.trim() || 'M',
          path: filePath,
          statusText: this.getStatusText(status)
        };
      });

      // Combine diffs
      const combinedDiff = [stagedDiff, unstagedDiff].filter(Boolean).join("\n");

      return {
        success: true,
        diff: combinedDiff,
        files: fileStatuses,
        hasChanges: files.length > 0
      };
    } catch (error) {
      console.error("[WorktreeManager] Failed to get file diffs:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get human-readable status text from git status code
   */
  getStatusText(status) {
    const statusMap = {
      'M': 'Modified',
      'A': 'Added',
      'D': 'Deleted',
      'R': 'Renamed',
      'C': 'Copied',
      'U': 'Updated',
      '?': 'Untracked',
      '!': 'Ignored'
    };
    const firstChar = status.charAt(0);
    const secondChar = status.charAt(1);
    return statusMap[firstChar] || statusMap[secondChar] || 'Changed';
  }

  /**
   * Get diff for a specific file in a worktree
   */
  async getFileDiff(worktreePath, filePath) {
    try {
      // Try to get unstaged diff first, then staged if no unstaged changes
      let diff = '';
      try {
        const { stdout } = await execAsync(`git diff --no-color -- "${filePath}"`, {
          cwd: worktreePath,
          maxBuffer: 5 * 1024 * 1024
        });
        diff = stdout;
      } catch {
        // File might be staged
      }

      if (!diff) {
        try {
          const { stdout } = await execAsync(`git diff --cached --no-color -- "${filePath}"`, {
            cwd: worktreePath,
            maxBuffer: 5 * 1024 * 1024
          });
          diff = stdout;
        } catch {
          // File might be untracked, show the content
        }
      }

      // If still no diff, might be an untracked file - show the content
      if (!diff) {
        try {
          const fullPath = path.join(worktreePath, filePath);
          const content = await fs.readFile(fullPath, 'utf-8');
          diff = `+++ ${filePath} (new file)\n${content.split('\n').map(l => '+' + l).join('\n')}`;
        } catch {
          diff = '(Unable to read file content)';
        }
      }

      return {
        success: true,
        diff,
        filePath
      };
    } catch (error) {
      console.error(`[WorktreeManager] Failed to get diff for ${filePath}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Merge worktree changes back to the main branch
   */
  async mergeWorktree(projectPath, featureId, options = {}) {
    console.log(`[WorktreeManager] Merging worktree for feature: ${featureId}`);

    const worktreeInfo = await this.getWorktreeInfo(projectPath, featureId);
    if (!worktreeInfo.success) {
      return { success: false, error: "Worktree not found" };
    }

    const { branchName, worktreePath } = worktreeInfo;
    const baseBranch = await this.getCurrentBranch(projectPath);

    try {
      // First commit any uncommitted changes in the worktree
      const { stdout: status } = await execAsync("git status --porcelain", { cwd: worktreePath });
      if (status.trim()) {
        // There are uncommitted changes - commit them
        await execAsync("git add -A", { cwd: worktreePath });
        const commitMsg = options.commitMessage || `feat: complete ${featureId}`;
        await execAsync(`git commit -m "${commitMsg}"`, { cwd: worktreePath });
      }

      // Merge the feature branch into the current branch in the main repo
      if (options.squash) {
        await execAsync(`git merge --squash ${branchName}`, { cwd: projectPath });
        const squashMsg = options.squashMessage || `feat: ${featureId} - squashed merge`;
        await execAsync(`git commit -m "${squashMsg}"`, { cwd: projectPath });
      } else {
        await execAsync(`git merge ${branchName} --no-ff -m "Merge ${branchName}"`, { cwd: projectPath });
      }

      console.log(`[WorktreeManager] Successfully merged ${branchName} into ${baseBranch}`);

      // Optionally cleanup worktree after merge
      if (options.cleanup) {
        await this.removeWorktree(projectPath, featureId, true);
      }

      return {
        success: true,
        mergedBranch: branchName,
        intoBranch: baseBranch,
      };
    } catch (error) {
      console.error("[WorktreeManager] Failed to merge worktree:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Sync changes from main branch to worktree (rebase or merge)
   */
  async syncWorktree(projectPath, featureId, method = "rebase") {
    console.log(`[WorktreeManager] Syncing worktree for feature: ${featureId}`);

    const worktreeInfo = await this.getWorktreeInfo(projectPath, featureId);
    if (!worktreeInfo.success) {
      return { success: false, error: "Worktree not found" };
    }

    const { worktreePath, baseBranch } = worktreeInfo;

    try {
      if (method === "rebase") {
        await execAsync(`git rebase ${baseBranch}`, { cwd: worktreePath });
      } else {
        await execAsync(`git merge ${baseBranch}`, { cwd: worktreePath });
      }

      return { success: true, method };
    } catch (error) {
      console.error("[WorktreeManager] Failed to sync worktree:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get list of all feature worktrees
   */
  async getAllFeatureWorktrees(projectPath) {
    const worktrees = await this.listWorktrees(projectPath);
    const worktreeBasePath = this.getWorktreeBasePath(projectPath);

    return worktrees.filter(w =>
      w.path.startsWith(worktreeBasePath) &&
      w.branch &&
      w.branch.startsWith("feature/")
    );
  }

  /**
   * Cleanup orphaned worktrees (worktrees without matching features)
   */
  async cleanupOrphanedWorktrees(projectPath, activeFeatureIds) {
    console.log("[WorktreeManager] Cleaning up orphaned worktrees...");

    const worktrees = await this.getAllFeatureWorktrees(projectPath);
    const cleaned = [];

    for (const worktree of worktrees) {
      // Extract feature ID from branch name
      const branchParts = worktree.branch.replace("feature/", "").split("-");
      const shortId = branchParts[0];

      // Check if any active feature has this short ID
      const hasMatchingFeature = activeFeatureIds.some(id => {
        const featureShortId = id.replace("feature-", "").substring(0, 12);
        return featureShortId === shortId;
      });

      if (!hasMatchingFeature) {
        console.log(`[WorktreeManager] Removing orphaned worktree: ${worktree.path}`);
        try {
          await execAsync(`git worktree remove "${worktree.path}" --force`, { cwd: projectPath });
          await execAsync(`git branch -D ${worktree.branch}`, { cwd: projectPath });
          cleaned.push(worktree.path);
        } catch (error) {
          console.warn(`[WorktreeManager] Failed to cleanup worktree ${worktree.path}:`, error.message);
        }
      }
    }

    return { success: true, cleaned };
  }
}

module.exports = new WorktreeManager();
