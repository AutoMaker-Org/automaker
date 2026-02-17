import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { WorktreeResolver, type WorktreeInfo } from '@/services/worktree-resolver.js';
import { exec } from 'child_process';
import path from 'path';

// Mock child_process
vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

/**
 * Helper to normalize paths for cross-platform test compatibility.
 * On Windows, path.resolve('/Users/dev/project') returns 'C:\Users\dev\project' (with current drive).
 * This helper ensures test expectations match the actual platform behavior.
 */
const normalizePath = (p: string): string => path.resolve(p);

// Create promisified mock helper
const mockExecAsync = (
  impl: (cmd: string, options?: { cwd?: string }) => Promise<{ stdout: string; stderr: string }>
) => {
  (exec as unknown as Mock).mockImplementation(
    (
      cmd: string,
      options: { cwd?: string } | undefined,
      callback: (error: Error | null, result: { stdout: string; stderr: string }) => void
    ) => {
      impl(cmd, options)
        .then((result) => callback(null, result))
        .catch((error) => callback(error, { stdout: '', stderr: '' }));
    }
  );
};

describe('WorktreeResolver', () => {
  let resolver: WorktreeResolver;

  beforeEach(() => {
    vi.clearAllMocks();
    resolver = new WorktreeResolver();
  });

  describe('getCurrentBranch', () => {
    it('should return branch name when on a branch', async () => {
      mockExecAsync(async () => ({ stdout: 'main\n', stderr: '' }));

      const branch = await resolver.getCurrentBranch('/test/project');

      expect(branch).toBe('main');
    });

    it('should return null on detached HEAD (empty output)', async () => {
      mockExecAsync(async () => ({ stdout: '', stderr: '' }));

      const branch = await resolver.getCurrentBranch('/test/project');

      expect(branch).toBeNull();
    });

    it('should return null when git command fails', async () => {
      mockExecAsync(async () => {
        throw new Error('Not a git repository');
      });

      const branch = await resolver.getCurrentBranch('/not/a/git/repo');

      expect(branch).toBeNull();
    });

    it('should trim whitespace from branch name', async () => {
      mockExecAsync(async () => ({ stdout: '  feature-branch  \n', stderr: '' }));

      const branch = await resolver.getCurrentBranch('/test/project');

      expect(branch).toBe('feature-branch');
    });

    it('should use provided projectPath as cwd', async () => {
      let capturedCwd: string | undefined;
      mockExecAsync(async (cmd, options) => {
        capturedCwd = options?.cwd;
        return { stdout: 'main\n', stderr: '' };
      });

      await resolver.getCurrentBranch('/custom/path');

      expect(capturedCwd).toBe('/custom/path');
    });
  });

  describe('findWorktreeForBranch', () => {
    const porcelainOutput = `worktree /Users/dev/project
branch refs/heads/main

worktree /Users/dev/project/.worktrees/feature-x
branch refs/heads/feature-x

worktree /Users/dev/project/.worktrees/feature-y
branch refs/heads/feature-y
`;

    it('should find worktree by branch name', async () => {
      mockExecAsync(async () => ({ stdout: porcelainOutput, stderr: '' }));

      const result = await resolver.findWorktreeForBranch('/Users/dev/project', 'feature-x');

      expect(result).toBe(normalizePath('/Users/dev/project/.worktrees/feature-x'));
    });

    it('should return null when branch not found', async () => {
      mockExecAsync(async () => ({ stdout: porcelainOutput, stderr: '' }));

      const path = await resolver.findWorktreeForBranch('/Users/dev/project', 'non-existent');

      expect(path).toBeNull();
    });

    it('should return null when git command fails', async () => {
      mockExecAsync(async () => {
        throw new Error('Not a git repository');
      });

      const path = await resolver.findWorktreeForBranch('/not/a/repo', 'main');

      expect(path).toBeNull();
    });

    it('should find main worktree', async () => {
      mockExecAsync(async () => ({ stdout: porcelainOutput, stderr: '' }));

      const result = await resolver.findWorktreeForBranch('/Users/dev/project', 'main');

      expect(result).toBe(normalizePath('/Users/dev/project'));
    });

    it('should handle porcelain output without trailing newline', async () => {
      const noTrailingNewline = `worktree /Users/dev/project
branch refs/heads/main

worktree /Users/dev/project/.worktrees/feature-x
branch refs/heads/feature-x`;

      mockExecAsync(async () => ({ stdout: noTrailingNewline, stderr: '' }));

      const result = await resolver.findWorktreeForBranch('/Users/dev/project', 'feature-x');

      expect(result).toBe(normalizePath('/Users/dev/project/.worktrees/feature-x'));
    });

    it('should resolve relative paths to absolute', async () => {
      const relativePathOutput = `worktree /Users/dev/project
branch refs/heads/main

worktree .worktrees/feature-relative
branch refs/heads/feature-relative
`;

      mockExecAsync(async () => ({ stdout: relativePathOutput, stderr: '' }));

      const result = await resolver.findWorktreeForBranch('/Users/dev/project', 'feature-relative');

      // Should resolve to absolute path (platform-specific)
      expect(result).toBe(normalizePath('/Users/dev/project/.worktrees/feature-relative'));
    });

    it('should use projectPath as cwd for git command', async () => {
      let capturedCwd: string | undefined;
      mockExecAsync(async (cmd, options) => {
        capturedCwd = options?.cwd;
        return { stdout: porcelainOutput, stderr: '' };
      });

      await resolver.findWorktreeForBranch('/custom/project', 'main');

      expect(capturedCwd).toBe('/custom/project');
    });
  });

  describe('listWorktrees', () => {
    it('should list all worktrees with metadata', async () => {
      const porcelainOutput = `worktree /Users/dev/project
branch refs/heads/main

worktree /Users/dev/project/.worktrees/feature-x
branch refs/heads/feature-x

worktree /Users/dev/project/.worktrees/feature-y
branch refs/heads/feature-y
`;

      mockExecAsync(async () => ({ stdout: porcelainOutput, stderr: '' }));

      const worktrees = await resolver.listWorktrees('/Users/dev/project');

      expect(worktrees).toHaveLength(3);
      expect(worktrees[0]).toEqual({
        path: normalizePath('/Users/dev/project'),
        branch: 'main',
        isMain: true,
      });
      expect(worktrees[1]).toEqual({
        path: normalizePath('/Users/dev/project/.worktrees/feature-x'),
        branch: 'feature-x',
        isMain: false,
      });
      expect(worktrees[2]).toEqual({
        path: normalizePath('/Users/dev/project/.worktrees/feature-y'),
        branch: 'feature-y',
        isMain: false,
      });
    });

    it('should return empty array when git command fails', async () => {
      mockExecAsync(async () => {
        throw new Error('Not a git repository');
      });

      const worktrees = await resolver.listWorktrees('/not/a/repo');

      expect(worktrees).toEqual([]);
    });

    it('should handle detached HEAD worktrees', async () => {
      const porcelainWithDetached = `worktree /Users/dev/project
branch refs/heads/main

worktree /Users/dev/project/.worktrees/detached-wt
detached
`;

      mockExecAsync(async () => ({ stdout: porcelainWithDetached, stderr: '' }));

      const worktrees = await resolver.listWorktrees('/Users/dev/project');

      expect(worktrees).toHaveLength(2);
      expect(worktrees[1]).toEqual({
        path: normalizePath('/Users/dev/project/.worktrees/detached-wt'),
        branch: null, // Detached HEAD has no branch
        isMain: false,
      });
    });

    it('should mark only first worktree as main', async () => {
      const multipleWorktrees = `worktree /Users/dev/project
branch refs/heads/main

worktree /Users/dev/project/.worktrees/wt1
branch refs/heads/branch1

worktree /Users/dev/project/.worktrees/wt2
branch refs/heads/branch2
`;

      mockExecAsync(async () => ({ stdout: multipleWorktrees, stderr: '' }));

      const worktrees = await resolver.listWorktrees('/Users/dev/project');

      expect(worktrees[0].isMain).toBe(true);
      expect(worktrees[1].isMain).toBe(false);
      expect(worktrees[2].isMain).toBe(false);
    });

    it('should resolve relative paths to absolute', async () => {
      const relativePathOutput = `worktree /Users/dev/project
branch refs/heads/main

worktree .worktrees/relative-wt
branch refs/heads/relative-branch
`;

      mockExecAsync(async () => ({ stdout: relativePathOutput, stderr: '' }));

      const worktrees = await resolver.listWorktrees('/Users/dev/project');

      expect(worktrees[1].path).toBe(normalizePath('/Users/dev/project/.worktrees/relative-wt'));
    });

    it('should handle single worktree (main only)', async () => {
      const singleWorktree = `worktree /Users/dev/project
branch refs/heads/main
`;

      mockExecAsync(async () => ({ stdout: singleWorktree, stderr: '' }));

      const worktrees = await resolver.listWorktrees('/Users/dev/project');

      expect(worktrees).toHaveLength(1);
      expect(worktrees[0]).toEqual({
        path: normalizePath('/Users/dev/project'),
        branch: 'main',
        isMain: true,
      });
    });

    it('should handle empty git worktree list output', async () => {
      mockExecAsync(async () => ({ stdout: '', stderr: '' }));

      const worktrees = await resolver.listWorktrees('/Users/dev/project');

      expect(worktrees).toEqual([]);
    });

    it('should handle output without trailing newline', async () => {
      const noTrailingNewline = `worktree /Users/dev/project
branch refs/heads/main

worktree /Users/dev/project/.worktrees/feature-x
branch refs/heads/feature-x`;

      mockExecAsync(async () => ({ stdout: noTrailingNewline, stderr: '' }));

      const worktrees = await resolver.listWorktrees('/Users/dev/project');

      expect(worktrees).toHaveLength(2);
      expect(worktrees[1].branch).toBe('feature-x');
    });
  });
});
