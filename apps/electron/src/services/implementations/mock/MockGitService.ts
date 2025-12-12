/**
 * Mock implementation of IGitService
 * For web development and testing without Electron
 */

import type { IGitService } from "../../interfaces/IGitService";
import type { WorktreeDiffs, FileDiff } from "../../interfaces/IWorktreeService";
import type { ServiceResult } from "../../types";

export class MockGitService implements IGitService {
  async getDiffs(_projectPath: string): Promise<ServiceResult<WorktreeDiffs>> {
    console.log("[Mock] Getting git diffs");
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
    filePath: string
  ): Promise<ServiceResult<FileDiff>> {
    console.log("[Mock] Getting git file diff:", filePath);
    return {
      success: true,
      data: {
        diff: `diff --git a/${filePath} b/${filePath}\n+++ new file\n@@ -0,0 +1,5 @@\n+// New content`,
        filePath,
      },
    };
  }
}
