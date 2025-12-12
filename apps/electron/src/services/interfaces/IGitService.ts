/**
 * Git Service Interface
 * Provides git operations for the main project (non-worktree)
 */

import type { ServiceResult, IService } from "../types";
import type { FileStatus, WorktreeDiffs, FileDiff } from "./IWorktreeService";

export interface IGitService extends IService {
  /**
   * Get all file diffs for the main project
   */
  getDiffs(projectPath: string): Promise<ServiceResult<WorktreeDiffs>>;

  /**
   * Get diff for a specific file in the main project
   */
  getFileDiff(
    projectPath: string,
    filePath: string
  ): Promise<ServiceResult<FileDiff>>;
}

// Re-export types for convenience
export type { FileStatus, WorktreeDiffs, FileDiff } from "./IWorktreeService";
