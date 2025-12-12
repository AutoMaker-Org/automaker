/**
 * Electron implementation of IWorktreeService
 * Wraps window.electronAPI.worktree methods
 */

import type {
  IWorktreeService,
  WorktreeInfo,
  WorktreeStatus,
  WorktreeDiffs,
  WorktreeRevertResult,
  WorktreeMergeResult,
  WorktreeListItem,
  FileDiff,
} from "../../interfaces/IWorktreeService";
import type { ServiceResult } from "../../types";

export class ElectronWorktreeService implements IWorktreeService {
  async revertFeature(
    projectPath: string,
    featureId: string
  ): Promise<ServiceResult<WorktreeRevertResult>> {
    if (!window.electronAPI?.worktree) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.worktree.revertFeature(
      projectPath,
      featureId
    );

    if (result.success) {
      return {
        success: true,
        data: { removedPath: result.removedPath || "" },
      };
    }

    return { success: false, error: result.error || "Failed to revert feature" };
  }

  async mergeFeature(
    projectPath: string,
    featureId: string,
    options?: { squash?: boolean; deleteAfterMerge?: boolean }
  ): Promise<ServiceResult<WorktreeMergeResult>> {
    if (!window.electronAPI?.worktree) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.worktree.mergeFeature(
      projectPath,
      featureId,
      options
    );

    if (result.success) {
      return {
        success: true,
        data: { mergedBranch: result.mergedBranch || "" },
      };
    }

    return { success: false, error: result.error || "Failed to merge feature" };
  }

  async getInfo(
    projectPath: string,
    featureId: string
  ): Promise<ServiceResult<WorktreeInfo>> {
    if (!window.electronAPI?.worktree) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.worktree.getInfo(
      projectPath,
      featureId
    );

    if (result.success) {
      return {
        success: true,
        data: {
          worktreePath: result.worktreePath || "",
          branchName: result.branchName || "",
          head: result.head || "",
        },
      };
    }

    return { success: false, error: result.error || "Failed to get worktree info" };
  }

  async getStatus(
    projectPath: string,
    featureId: string
  ): Promise<ServiceResult<WorktreeStatus>> {
    if (!window.electronAPI?.worktree) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.worktree.getStatus(
      projectPath,
      featureId
    );

    if (result.success) {
      return {
        success: true,
        data: {
          modifiedFiles: result.modifiedFiles || 0,
          files: result.files || [],
          diffStat: result.diffStat || "",
          recentCommits: result.recentCommits || [],
        },
      };
    }

    return { success: false, error: result.error || "Failed to get worktree status" };
  }

  async list(projectPath: string): Promise<ServiceResult<WorktreeListItem[]>> {
    if (!window.electronAPI?.worktree) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.worktree.list(projectPath);

    if (result.success && result.worktrees) {
      return { success: true, data: result.worktrees };
    }

    return { success: false, error: result.error || "Failed to list worktrees" };
  }

  async getDiffs(
    projectPath: string,
    featureId: string
  ): Promise<ServiceResult<WorktreeDiffs>> {
    if (!window.electronAPI?.worktree) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.worktree.getDiffs(
      projectPath,
      featureId
    );

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
    featureId: string,
    filePath: string
  ): Promise<ServiceResult<FileDiff>> {
    if (!window.electronAPI?.worktree) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.worktree.getFileDiff(
      projectPath,
      featureId,
      filePath
    );

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
