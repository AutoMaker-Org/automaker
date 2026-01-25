import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  readWorktreeMetadata,
  writeWorktreeMetadata,
  updateWorktreePRInfo,
  getWorktreePRInfo,
  readAllWorktreeMetadata,
  deleteWorktreeMetadata,
  type WorktreeMetadata,
  type WorktreePRInfo,
} from '@/lib/worktree-metadata.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('worktree-metadata.ts', () => {
  let testProjectPath: string;

  beforeEach(async () => {
    testProjectPath = path.join(os.tmpdir(), `worktree-metadata-test-${Date.now()}`);
    await fs.mkdir(testProjectPath, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testProjectPath, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('sanitizeBranchName', () => {
    // Test through readWorktreeMetadata and writeWorktreeMetadata
    it('should sanitize branch names with invalid characters', async () => {
      const branch = 'feature/test-branch';
      const metadata: WorktreeMetadata = {
        branch,
        createdAt: new Date().toISOString(),
      };

      await writeWorktreeMetadata(testProjectPath, branch, metadata);
      const result = await readWorktreeMetadata(testProjectPath, branch);
      expect(result).toEqual(metadata);
    });

    it('should sanitize branch names with Windows invalid characters', async () => {
      const branch = 'feature:test*branch?';
      const metadata: WorktreeMetadata = {
        branch,
        createdAt: new Date().toISOString(),
      };

      await writeWorktreeMetadata(testProjectPath, branch, metadata);
      const result = await readWorktreeMetadata(testProjectPath, branch);
      expect(result).toEqual(metadata);
    });

    it('should sanitize Windows reserved names', async () => {
      const branch = 'CON';
      const metadata: WorktreeMetadata = {
        branch,
        createdAt: new Date().toISOString(),
      };

      await writeWorktreeMetadata(testProjectPath, branch, metadata);
      const result = await readWorktreeMetadata(testProjectPath, branch);
      expect(result).toEqual(metadata);
    });

    it('should handle empty branch name', async () => {
      const branch = '';
      const metadata: WorktreeMetadata = {
        branch: 'branch',
        createdAt: new Date().toISOString(),
      };

      // Empty branch name should be sanitized to "_branch"
      await writeWorktreeMetadata(testProjectPath, branch, metadata);
      const result = await readWorktreeMetadata(testProjectPath, branch);
      expect(result).toEqual(metadata);
    });

    it('should handle branch name that becomes empty after sanitization', async () => {
      // Test branch that would become empty after removing invalid chars
      const branch = '///';
      const metadata: WorktreeMetadata = {
        branch: 'branch',
        createdAt: new Date().toISOString(),
      };

      await writeWorktreeMetadata(testProjectPath, branch, metadata);
      const result = await readWorktreeMetadata(testProjectPath, branch);
      expect(result).toEqual(metadata);
    });
  });

  describe('readWorktreeMetadata', () => {
    it("should return null when metadata file doesn't exist", async () => {
      const result = await readWorktreeMetadata(testProjectPath, 'nonexistent-branch');
      expect(result).toBeNull();
    });

    it('should read existing metadata', async () => {
      const branch = 'test-branch';
      const metadata: WorktreeMetadata = {
        branch,
        createdAt: new Date().toISOString(),
      };

      await writeWorktreeMetadata(testProjectPath, branch, metadata);
      const result = await readWorktreeMetadata(testProjectPath, branch);
      expect(result).toEqual(metadata);
    });

    it('should read metadata with PR info', async () => {
      const branch = 'pr-branch';
      const metadata: WorktreeMetadata = {
        branch,
        createdAt: new Date().toISOString(),
        pr: {
          number: 123,
          url: 'https://github.com/owner/repo/pull/123',
          title: 'Test PR',
          state: 'OPEN',
          createdAt: new Date().toISOString(),
        },
      };

      await writeWorktreeMetadata(testProjectPath, branch, metadata);
      const result = await readWorktreeMetadata(testProjectPath, branch);
      expect(result).toEqual(metadata);
    });
  });

  describe('writeWorktreeMetadata', () => {
    it("should create metadata directory if it doesn't exist", async () => {
      const branch = 'new-branch';
      const metadata: WorktreeMetadata = {
        branch,
        createdAt: new Date().toISOString(),
      };

      await writeWorktreeMetadata(testProjectPath, branch, metadata);
      const result = await readWorktreeMetadata(testProjectPath, branch);
      expect(result).toEqual(metadata);
    });

    it('should overwrite existing metadata', async () => {
      const branch = 'existing-branch';
      const metadata1: WorktreeMetadata = {
        branch,
        createdAt: new Date().toISOString(),
      };
      const metadata2: WorktreeMetadata = {
        branch,
        createdAt: new Date().toISOString(),
        pr: {
          number: 456,
          url: 'https://github.com/owner/repo/pull/456',
          title: 'Updated PR',
          state: 'CLOSED',
          createdAt: new Date().toISOString(),
        },
      };

      await writeWorktreeMetadata(testProjectPath, branch, metadata1);
      await writeWorktreeMetadata(testProjectPath, branch, metadata2);
      const result = await readWorktreeMetadata(testProjectPath, branch);
      expect(result).toEqual(metadata2);
    });
  });

  describe('updateWorktreePRInfo', () => {
    it("should create new metadata if it doesn't exist", async () => {
      const branch = 'new-pr-branch';
      const prInfo: WorktreePRInfo = {
        number: 789,
        url: 'https://github.com/owner/repo/pull/789',
        title: 'New PR',
        state: 'OPEN',
        createdAt: new Date().toISOString(),
      };

      await updateWorktreePRInfo(testProjectPath, branch, prInfo);
      const result = await readWorktreeMetadata(testProjectPath, branch);
      expect(result).not.toBeNull();
      expect(result?.branch).toBe(branch);
      expect(result?.pr).toEqual(prInfo);
    });

    it('should update existing metadata with PR info', async () => {
      const branch = 'existing-pr-branch';
      const metadata: WorktreeMetadata = {
        branch,
        createdAt: new Date().toISOString(),
      };

      await writeWorktreeMetadata(testProjectPath, branch, metadata);

      const prInfo: WorktreePRInfo = {
        number: 999,
        url: 'https://github.com/owner/repo/pull/999',
        title: 'Updated PR',
        state: 'MERGED',
        createdAt: new Date().toISOString(),
      };

      await updateWorktreePRInfo(testProjectPath, branch, prInfo);
      const result = await readWorktreeMetadata(testProjectPath, branch);
      expect(result?.pr).toEqual(prInfo);
    });

    it('should preserve existing metadata when updating PR info', async () => {
      const branch = 'preserve-branch';
      const originalCreatedAt = new Date().toISOString();
      const metadata: WorktreeMetadata = {
        branch,
        createdAt: originalCreatedAt,
      };

      await writeWorktreeMetadata(testProjectPath, branch, metadata);

      const prInfo: WorktreePRInfo = {
        number: 111,
        url: 'https://github.com/owner/repo/pull/111',
        title: 'PR',
        state: 'OPEN',
        createdAt: new Date().toISOString(),
      };

      await updateWorktreePRInfo(testProjectPath, branch, prInfo);
      const result = await readWorktreeMetadata(testProjectPath, branch);
      expect(result?.createdAt).toBe(originalCreatedAt);
      expect(result?.pr).toEqual(prInfo);
    });
  });

  describe('getWorktreePRInfo', () => {
    it("should return null when metadata doesn't exist", async () => {
      const result = await getWorktreePRInfo(testProjectPath, 'nonexistent');
      expect(result).toBeNull();
    });

    it('should return null when metadata exists but has no PR info', async () => {
      const branch = 'no-pr-branch';
      const metadata: WorktreeMetadata = {
        branch,
        createdAt: new Date().toISOString(),
      };

      await writeWorktreeMetadata(testProjectPath, branch, metadata);
      const result = await getWorktreePRInfo(testProjectPath, branch);
      expect(result).toBeNull();
    });

    it('should return PR info when it exists', async () => {
      const branch = 'has-pr-branch';
      const prInfo: WorktreePRInfo = {
        number: 222,
        url: 'https://github.com/owner/repo/pull/222',
        title: 'Has PR',
        state: 'OPEN',
        createdAt: new Date().toISOString(),
      };

      await updateWorktreePRInfo(testProjectPath, branch, prInfo);
      const result = await getWorktreePRInfo(testProjectPath, branch);
      expect(result).toEqual(prInfo);
    });
  });

  describe('readAllWorktreeMetadata', () => {
    it("should return empty map when worktrees directory doesn't exist", async () => {
      const result = await readAllWorktreeMetadata(testProjectPath);
      expect(result.size).toBe(0);
    });

    it('should return empty map when worktrees directory is empty', async () => {
      const worktreesDir = path.join(testProjectPath, '.automaker', 'worktrees');
      await fs.mkdir(worktreesDir, { recursive: true });

      const result = await readAllWorktreeMetadata(testProjectPath);
      expect(result.size).toBe(0);
    });

    it('should read all worktree metadata', async () => {
      const branch1 = 'branch-1';
      const branch2 = 'branch-2';
      const metadata1: WorktreeMetadata = {
        branch: branch1,
        createdAt: new Date().toISOString(),
      };
      const metadata2: WorktreeMetadata = {
        branch: branch2,
        createdAt: new Date().toISOString(),
        pr: {
          number: 333,
          url: 'https://github.com/owner/repo/pull/333',
          title: 'PR 3',
          state: 'OPEN',
          createdAt: new Date().toISOString(),
        },
      };

      await writeWorktreeMetadata(testProjectPath, branch1, metadata1);
      await writeWorktreeMetadata(testProjectPath, branch2, metadata2);

      const result = await readAllWorktreeMetadata(testProjectPath);
      expect(result.size).toBe(2);
      expect(result.get(branch1)).toEqual(metadata1);
      expect(result.get(branch2)).toEqual(metadata2);
    });

    it('should skip directories without worktree.json', async () => {
      const worktreesDir = path.join(testProjectPath, '.automaker', 'worktrees');
      const emptyDir = path.join(worktreesDir, 'empty-dir');
      await fs.mkdir(emptyDir, { recursive: true });

      const branch = 'valid-branch';
      const metadata: WorktreeMetadata = {
        branch,
        createdAt: new Date().toISOString(),
      };
      await writeWorktreeMetadata(testProjectPath, branch, metadata);

      const result = await readAllWorktreeMetadata(testProjectPath);
      expect(result.size).toBe(1);
      expect(result.get(branch)).toEqual(metadata);
    });

    it('should skip files in worktrees directory', async () => {
      const worktreesDir = path.join(testProjectPath, '.automaker', 'worktrees');
      await fs.mkdir(worktreesDir, { recursive: true });
      const filePath = path.join(worktreesDir, 'not-a-dir.txt');
      await fs.writeFile(filePath, 'content');

      const branch = 'valid-branch';
      const metadata: WorktreeMetadata = {
        branch,
        createdAt: new Date().toISOString(),
      };
      await writeWorktreeMetadata(testProjectPath, branch, metadata);

      const result = await readAllWorktreeMetadata(testProjectPath);
      expect(result.size).toBe(1);
      expect(result.get(branch)).toEqual(metadata);
    });

    it('should skip directories with malformed JSON', async () => {
      const worktreesDir = path.join(testProjectPath, '.automaker', 'worktrees');
      const badDir = path.join(worktreesDir, 'bad-dir');
      await fs.mkdir(badDir, { recursive: true });
      const badJsonPath = path.join(badDir, 'worktree.json');
      await fs.writeFile(badJsonPath, 'not valid json');

      const branch = 'valid-branch';
      const metadata: WorktreeMetadata = {
        branch,
        createdAt: new Date().toISOString(),
      };
      await writeWorktreeMetadata(testProjectPath, branch, metadata);

      const result = await readAllWorktreeMetadata(testProjectPath);
      expect(result.size).toBe(1);
      expect(result.get(branch)).toEqual(metadata);
    });
  });

  describe('deleteWorktreeMetadata', () => {
    it('should delete worktree metadata directory', async () => {
      const branch = 'to-delete';
      const metadata: WorktreeMetadata = {
        branch,
        createdAt: new Date().toISOString(),
      };

      await writeWorktreeMetadata(testProjectPath, branch, metadata);
      let result = await readWorktreeMetadata(testProjectPath, branch);
      expect(result).not.toBeNull();

      await deleteWorktreeMetadata(testProjectPath, branch);
      result = await readWorktreeMetadata(testProjectPath, branch);
      expect(result).toBeNull();
    });

    it("should handle deletion when metadata doesn't exist", async () => {
      // Should not throw
      await expect(deleteWorktreeMetadata(testProjectPath, 'nonexistent')).resolves.toBeUndefined();
    });
  });
});
