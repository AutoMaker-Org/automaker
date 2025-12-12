const path = require("path");
const fs = require("fs/promises");

/**
 * Context Manager - Handles reading, writing, and deleting context files for features
 */
class ContextManager {
  /**
   * Write output to feature context file
   */
  async writeToContextFile(projectPath, featureId, content) {
    if (!projectPath) return;

    try {
      const featureDir = path.join(
        projectPath,
        ".automaker",
        "features",
        featureId
      );

      // Ensure feature directory exists
      try {
        await fs.access(featureDir);
      } catch {
        await fs.mkdir(featureDir, { recursive: true });
      }

      const filePath = path.join(featureDir, "agent-output.md");

      // Append to existing file or create new one
      try {
        const existing = await fs.readFile(filePath, "utf-8");
        await fs.writeFile(filePath, existing + content, "utf-8");
      } catch {
        await fs.writeFile(filePath, content, "utf-8");
      }
    } catch (error) {
      console.error("[ContextManager] Failed to write to context file:", error);
    }
  }

  /**
   * Read context file for a feature
   */
  async readContextFile(projectPath, featureId) {
    try {
      const contextPath = path.join(
        projectPath,
        ".automaker",
        "features",
        featureId,
        "agent-output.md"
      );
      const content = await fs.readFile(contextPath, "utf-8");
      return content;
    } catch (error) {
      console.log(`[ContextManager] No context file found for ${featureId}`);
      return null;
    }
  }

  /**
   * Delete agent context file for a feature
   */
  async deleteContextFile(projectPath, featureId) {
    if (!projectPath) return;

    try {
      const contextPath = path.join(
        projectPath,
        ".automaker",
        "features",
        featureId,
        "agent-output.md"
      );
      await fs.unlink(contextPath);
      console.log(
        `[ContextManager] Deleted agent context for feature ${featureId}`
      );
    } catch (error) {
      // File might not exist, which is fine
      if (error.code !== "ENOENT") {
        console.error("[ContextManager] Failed to delete context file:", error);
      }
    }
  }

  /**
   * Read the memory.md file containing lessons learned and common issues
   * Returns formatted string to inject into prompts
   */
  async getMemoryContent(projectPath) {
    if (!projectPath) return "";

    try {
      const memoryPath = path.join(projectPath, ".automaker", "memory.md");

      // Check if file exists
      try {
        await fs.access(memoryPath);
      } catch {
        // File doesn't exist, return empty string
        return "";
      }

      const content = await fs.readFile(memoryPath, "utf-8");

      if (!content.trim()) {
        return "";
      }

      return `
**🧠 Agent Memory - Previous Lessons Learned:**

The following memory file contains lessons learned from previous agent runs, including common issues and their solutions. Review this carefully to avoid repeating past mistakes.

<agent-memory>
${content}
</agent-memory>

**IMPORTANT:** If you encounter a new issue that took significant debugging effort to resolve, add it to the memory file at \`.automaker/memory.md\` in a concise format:
- Issue title
- Problem description (1-2 sentences)
- Solution/fix (with code example if helpful)

This helps future agent runs avoid the same pitfalls.
`;
    } catch (error) {
      console.error("[ContextManager] Failed to read memory file:", error);
      return "";
    }
  }

  /**
   * List context files from .automaker/context/ directory and get previews
   * Returns a formatted string with file names and first 50 lines of each file
   */
  async getContextFilesPreview(projectPath) {
    if (!projectPath) return "";

    try {
      const contextDir = path.join(projectPath, ".automaker", "context");

      // Check if directory exists
      try {
        await fs.access(contextDir);
      } catch {
        // Directory doesn't exist, return empty string
        return "";
      }

      // Read directory contents
      const entries = await fs.readdir(contextDir, { withFileTypes: true });
      const files = entries
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .sort();

      if (files.length === 0) {
        return "";
      }

      // Build preview string
      const previews = [];
      previews.push(`\n**📁 Context Files Available:**\n`);
      previews.push(
        `The following context files are available in \`.automaker/context/\` directory.`
      );
      previews.push(
        `These files contain additional context that may be relevant to your work.`
      );
      previews.push(
        `You can read them in full using the Read tool if needed.\n`
      );

      for (const fileName of files) {
        try {
          const filePath = path.join(contextDir, fileName);
          const content = await fs.readFile(filePath, "utf-8");
          const lines = content.split("\n");
          const previewLines = lines.slice(0, 50);
          const preview = previewLines.join("\n");
          const hasMore = lines.length > 50;

          previews.push(`\n**File: ${fileName}**`);
          if (hasMore) {
            previews.push(
              `(Showing first 50 of ${lines.length} lines - use Read tool to see full content)`
            );
          }
          previews.push(`\`\`\``);
          previews.push(preview);
          previews.push(`\`\`\`\n`);
        } catch (error) {
          console.error(
            `[ContextManager] Failed to read context file ${fileName}:`,
            error
          );
          previews.push(`\n**File: ${fileName}** (Error reading file)\n`);
        }
      }

      return previews.join("\n");
    } catch (error) {
      console.error("[ContextManager] Failed to list context files:", error);
      return "";
    }
  }

  /**
   * Save the initial git state before a feature starts executing
   * This captures all files that were already modified before the AI agent started
   * @param {string} projectPath - Path to the project
   * @param {string} featureId - Feature ID
   * @returns {Promise<{modifiedFiles: string[], untrackedFiles: string[]}>}
   */
  async saveInitialGitState(projectPath, featureId) {
    if (!projectPath) return { modifiedFiles: [], untrackedFiles: [] };

    try {
      const { execSync } = require("child_process");
      const featureDir = path.join(
        projectPath,
        ".automaker",
        "features",
        featureId
      );

      // Ensure feature directory exists
      try {
        await fs.access(featureDir);
      } catch {
        await fs.mkdir(featureDir, { recursive: true });
      }

      // Get list of modified files (both staged and unstaged)
      let modifiedFiles = [];
      try {
        const modifiedOutput = execSync("git diff --name-only HEAD", {
          cwd: projectPath,
          encoding: "utf-8",
        }).trim();
        if (modifiedOutput) {
          modifiedFiles = modifiedOutput.split("\n").filter(Boolean);
        }
      } catch (error) {
        console.log(
          "[ContextManager] No modified files or git error:",
          error.message
        );
      }

      // Get list of untracked files
      let untrackedFiles = [];
      try {
        const untrackedOutput = execSync(
          "git ls-files --others --exclude-standard",
          {
            cwd: projectPath,
            encoding: "utf-8",
          }
        ).trim();
        if (untrackedOutput) {
          untrackedFiles = untrackedOutput.split("\n").filter(Boolean);
        }
      } catch (error) {
        console.log(
          "[ContextManager] Error getting untracked files:",
          error.message
        );
      }

      // Save the initial state to a JSON file
      const stateFile = path.join(featureDir, "git-state.json");
      const state = {
        timestamp: new Date().toISOString(),
        modifiedFiles,
        untrackedFiles,
      };

      await fs.writeFile(stateFile, JSON.stringify(state, null, 2), "utf-8");
      console.log(
        `[ContextManager] Saved initial git state for ${featureId}:`,
        {
          modifiedCount: modifiedFiles.length,
          untrackedCount: untrackedFiles.length,
        }
      );

      return state;
    } catch (error) {
      console.error(
        "[ContextManager] Failed to save initial git state:",
        error
      );
      return { modifiedFiles: [], untrackedFiles: [] };
    }
  }

  /**
   * Get the initial git state saved before a feature started executing
   * @param {string} projectPath - Path to the project
   * @param {string} featureId - Feature ID
   * @returns {Promise<{modifiedFiles: string[], untrackedFiles: string[], timestamp: string} | null>}
   */
  async getInitialGitState(projectPath, featureId) {
    if (!projectPath) return null;

    try {
      const stateFile = path.join(
        projectPath,
        ".automaker",
        "features",
        featureId,
        "git-state.json"
      );
      const content = await fs.readFile(stateFile, "utf-8");
      return JSON.parse(content);
    } catch (error) {
      console.log(
        `[ContextManager] No initial git state found for ${featureId}`
      );
      return null;
    }
  }

  /**
   * Delete the git state file for a feature
   * @param {string} projectPath - Path to the project
   * @param {string} featureId - Feature ID
   */
  async deleteGitStateFile(projectPath, featureId) {
    if (!projectPath) return;

    try {
      const stateFile = path.join(
        projectPath,
        ".automaker",
        "features",
        featureId,
        "git-state.json"
      );
      await fs.unlink(stateFile);
      console.log(`[ContextManager] Deleted git state file for ${featureId}`);
    } catch (error) {
      // File might not exist, which is fine
      if (error.code !== "ENOENT") {
        console.error(
          "[ContextManager] Failed to delete git state file:",
          error
        );
      }
    }
  }

  /**
   * Calculate which files were changed during the AI session
   * by comparing current git state with the saved initial state
   * @param {string} projectPath - Path to the project
   * @param {string} featureId - Feature ID
   * @returns {Promise<{newFiles: string[], modifiedFiles: string[]}>}
   */
  async getFilesChangedDuringSession(projectPath, featureId) {
    if (!projectPath) return { newFiles: [], modifiedFiles: [] };

    try {
      const { execSync } = require("child_process");

      // Get initial state
      const initialState = await this.getInitialGitState(
        projectPath,
        featureId
      );

      // Get current state
      let currentModified = [];
      try {
        const modifiedOutput = execSync("git diff --name-only HEAD", {
          cwd: projectPath,
          encoding: "utf-8",
        }).trim();
        if (modifiedOutput) {
          currentModified = modifiedOutput.split("\n").filter(Boolean);
        }
      } catch (error) {
        console.log("[ContextManager] No modified files or git error");
      }

      let currentUntracked = [];
      try {
        const untrackedOutput = execSync(
          "git ls-files --others --exclude-standard",
          {
            cwd: projectPath,
            encoding: "utf-8",
          }
        ).trim();
        if (untrackedOutput) {
          currentUntracked = untrackedOutput.split("\n").filter(Boolean);
        }
      } catch (error) {
        console.log("[ContextManager] Error getting untracked files");
      }

      if (!initialState) {
        // No initial state - all current changes are considered from this session
        console.log(
          "[ContextManager] No initial state found, returning all current changes"
        );
        return {
          newFiles: currentUntracked,
          modifiedFiles: currentModified,
        };
      }

      // Calculate files that are new since the session started
      const initialModifiedSet = new Set(initialState.modifiedFiles || []);
      const initialUntrackedSet = new Set(initialState.untrackedFiles || []);

      // New files = current untracked - initial untracked
      const newFiles = currentUntracked.filter(
        (f) => !initialUntrackedSet.has(f)
      );

      // Modified files = current modified - initial modified
      const modifiedFiles = currentModified.filter(
        (f) => !initialModifiedSet.has(f)
      );

      console.log(
        `[ContextManager] Files changed during session for ${featureId}:`,
        {
          newFilesCount: newFiles.length,
          modifiedFilesCount: modifiedFiles.length,
          newFiles,
          modifiedFiles,
        }
      );

      return { newFiles, modifiedFiles };
    } catch (error) {
      console.error(
        "[ContextManager] Failed to calculate changed files:",
        error
      );
      return { newFiles: [], modifiedFiles: [] };
    }
  }
}

module.exports = new ContextManager();
