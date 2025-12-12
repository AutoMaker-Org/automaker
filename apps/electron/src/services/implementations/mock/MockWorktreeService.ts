/**
 * Mock implementation of IWorktreeService
 * For web development and testing without Electron
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

export class MockWorktreeService implements IWorktreeService {
  async revertFeature(
    _projectPath: string,
    featureId: string
  ): Promise<ServiceResult<WorktreeRevertResult>> {
    console.log("[Mock] Reverting feature:", featureId);
    return {
      success: true,
      data: { removedPath: `/mock/worktree/${featureId}` },
    };
  }

  async mergeFeature(
    _projectPath: string,
    featureId: string,
    _options?: { squash?: boolean; deleteAfterMerge?: boolean }
  ): Promise<ServiceResult<WorktreeMergeResult>> {
    console.log("[Mock] Merging feature:", featureId);
    return {
      success: true,
      data: { mergedBranch: `feature/${featureId}` },
    };
  }

  async getInfo(
    _projectPath: string,
    featureId: string
  ): Promise<ServiceResult<WorktreeInfo>> {
    console.log("[Mock] Getting worktree info:", featureId);
    return {
      success: true,
      data: {
        worktreePath: `/mock/worktrees/${featureId}`,
        branchName: `feature/${featureId}`,
        head: "abc1234",
      },
    };
  }

  async getStatus(
    _projectPath: string,
    featureId: string
  ): Promise<ServiceResult<WorktreeStatus>> {
    console.log("[Mock] Getting worktree status:", featureId);
    return {
      success: true,
      data: {
        modifiedFiles: 3,
        files: ["src/feature.ts", "tests/feature.spec.ts", "README.md"],
        diffStat: " 3 files changed, 50 insertions(+), 10 deletions(-)",
        recentCommits: [
          "abc1234 feat: implement feature",
          "def5678 test: add tests for feature",
        ],
      },
    };
  }

  async list(_projectPath: string): Promise<ServiceResult<WorktreeListItem[]>> {
    console.log("[Mock] Listing worktrees");
    return { success: true, data: [] };
  }

  async getDiffs(
    _projectPath: string,
    _featureId: string
  ): Promise<ServiceResult<WorktreeDiffs>> {
    console.log("[Mock] Getting file diffs");
    return {
      success: true,
      data: {
        diff: "diff --git a/src/feature.ts b/src/feature.ts\n+++ new file\n@@ -0,0 +1,10 @@\n+export function feature() {\n+  return 'hello';\n+}",
        files: [
          { status: "A", path: "src/feature.ts", statusText: "Added" },
          { status: "M", path: "README.md", statusText: "Modified" },
        ],
        hasChanges: true,
      },
    };
  }

  async getFileDiff(
    _projectPath: string,
    _featureId: string,
    filePath: string
  ): Promise<ServiceResult<FileDiff>> {
    console.log("[Mock] Getting file diff:", filePath);
    return {
      success: true,
      data: {
        diff: `diff --git a/${filePath} b/${filePath}\n+++ new file\n@@ -0,0 +1,5 @@\n+// New content`,
        filePath,
      },
    };
  }
}
