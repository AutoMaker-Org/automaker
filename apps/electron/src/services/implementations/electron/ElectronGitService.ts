/**
 * Electron implementation of IGitService
 * Wraps window.electronAPI.git methods for non-worktree operations
 */

import type { IGitService } from "../../interfaces/IGitService";
import type { WorktreeDiffs, FileDiff } from "../../interfaces/IWorktreeService";
import type { ServiceResult } from "../../types";

export class ElectronGitService implements IGitService {
  async getDiffs(projectPath: string): Promise<ServiceResult<WorktreeDiffs>> {
    if (!window.electronAPI?.git) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.git.getDiffs(projectPath);

    if (result.success) {
      return {
        success: true,
        data: {
          diff: result.diff || "",
          files: result.files || [],
          hasChanges: result.hasChanges || false,
        },
      };
    }

    return { success: false, error: result.error || "Failed to get diffs" };
  }

  async getFileDiff(
    projectPath: string,
    filePath: string
  ): Promise<ServiceResult<FileDiff>> {
    if (!window.electronAPI?.git) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.git.getFileDiff(projectPath, filePath);

    if (result.success) {
      return {
        success: true,
        data: {
          diff: result.diff || "",
          filePath: result.filePath || filePath,
        },
      };
    }

    return { success: false, error: result.error || "Failed to get file diff" };
  }
}
