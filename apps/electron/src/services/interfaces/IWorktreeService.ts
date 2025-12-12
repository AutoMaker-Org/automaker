/**
 * Worktree Service Interface
 * Manages git worktrees for feature isolation
 */

import type { ServiceResult, IService } from "../types";

export interface WorktreeInfo {
  worktreePath: string;
  branchName: string;
  head: string;
}

export interface FileStatus {
  status: string;
  path: string;
  statusText: string;
}

export interface WorktreeStatus {
  modifiedFiles: number;
  files: string[];
  diffStat: string;
  recentCommits: string[];
}

export interface WorktreeDiffs {
  diff: string;
  files: FileStatus[];
  hasChanges: boolean;
}

export interface FileDiff {
  diff: string;
  filePath: string;
}

export interface WorktreeRevertResult {
  removedPath: string;
}

export interface WorktreeMergeResult {
  mergedBranch: string;
}

export interface WorktreeListItem {
  path: string;
  branch: string;
  featureId?: string;
}

export interface IWorktreeService extends IService {
  /**
   * Revert all changes for a feature (discard worktree)
   */
  revertFeature(
    projectPath: string,
    featureId: string
  ): Promise<ServiceResult<WorktreeRevertResult>>;

  /**
   * Merge feature changes to main branch
   */
  mergeFeature(
    projectPath: string,
    featureId: string,
    options?: { squash?: boolean; deleteAfterMerge?: boolean }
  ): Promise<ServiceResult<WorktreeMergeResult>>;

  /**
   * Get worktree information for a feature
   */
  getInfo(
    projectPath: string,
    featureId: string
  ): Promise<ServiceResult<WorktreeInfo>>;

  /**
   * Get worktree status (changed files, commits)
   */
  getStatus(
    projectPath: string,
    featureId: string
  ): Promise<ServiceResult<WorktreeStatus>>;

  /**
   * List all worktrees for a project
   */
  list(projectPath: string): Promise<ServiceResult<WorktreeListItem[]>>;

  /**
   * Get all file diffs for a feature
   */
  getDiffs(
    projectPath: string,
    featureId: string
  ): Promise<ServiceResult<WorktreeDiffs>>;

  /**
   * Get diff for a specific file
   */
  getFileDiff(
    projectPath: string,
    featureId: string,
    filePath: string
  ): Promise<ServiceResult<FileDiff>>;
}
