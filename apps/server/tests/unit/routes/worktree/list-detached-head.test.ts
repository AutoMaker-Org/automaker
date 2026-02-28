/**
 * Tests for worktree list endpoint handling of detached HEAD state.
 *
 * When a worktree is in detached HEAD state (e.g., during a rebase),
 * `git worktree list --porcelain` outputs "detached" instead of
 * "branch refs/heads/...". Previously, these worktrees were silently
 * dropped from the response because the parser required both path AND branch.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { Request, Response } from 'express';
import { exec } from 'child_process';
import { createMockExpressContext } from '../../../utils/mocks.js';

// Mock all external dependencies before importing the module under test
vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

vi.mock('@/lib/git.js', () => ({
  execGitCommand: vi.fn(),
}));

vi.mock('@automaker/git-utils', () => ({
  isGitRepo: vi.fn(async () => true),
}));

vi.mock('@automaker/utils', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('@automaker/types', () => ({
  validatePRState: vi.fn((state: string) => state),
}));

vi.mock('@/lib/secure-fs.js', () => ({
  access: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn(),
  readdir: vi.fn().mockResolvedValue([]),
  stat: vi.fn(),
}));

vi.mock('@/lib/worktree-metadata.js', () => ({
  readAllWorktreeMetadata: vi.fn(async () => new Map()),
  updateWorktreePRInfo: vi.fn(async () => undefined),
}));

vi.mock('@/routes/worktree/common.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    getErrorMessage: vi.fn((e: Error) => e?.message || 'Unknown error'),
    logError: vi.fn(),
    normalizePath: vi.fn((p: string) => p),
    execEnv: {},
    isGhCliAvailable: vi.fn().mockResolvedValue(false),
  };
});

vi.mock('@/routes/github/routes/check-github-remote.js', () => ({
  checkGitHubRemote: vi.fn().mockResolvedValue({ hasGitHubRemote: false }),
}));

import { createListHandler } from '@/routes/worktree/routes/list.js';
import * as secureFs from '@/lib/secure-fs.js';
import { execGitCommand } from '@/lib/git.js';
import { readAllWorktreeMetadata, updateWorktreePRInfo } from '@/lib/worktree-metadata.js';
import { isGitRepo } from '@automaker/git-utils';
import { isGhCliAvailable, normalizePath, getErrorMessage } from '@/routes/worktree/common.js';
import { checkGitHubRemote } from '@/routes/github/routes/check-github-remote.js';

/**
 * Set up execGitCommand mock (list handler uses this via lib/git.js, not child_process.exec).
 */
function setupExecGitCommandMock(options: {
  porcelainOutput: string;
  projectBranch?: string;
  gitDirs?: Record<string, string>;
  worktreeBranches?: Record<string, string>;
}) {
  const { porcelainOutput, projectBranch = 'main', gitDirs = {}, worktreeBranches = {} } = options;

  vi.mocked(execGitCommand).mockImplementation(async (args: string[], cwd: string) => {
    if (args[0] === 'worktree' && args[1] === 'list' && args[2] === '--porcelain') {
      return porcelainOutput;
    }
    if (args[0] === 'branch' && args[1] === '--show-current') {
      if (worktreeBranches[cwd] !== undefined) {
        return worktreeBranches[cwd] + '\n';
      }
      return projectBranch + '\n';
    }
    if (args[0] === 'rev-parse' && args[1] === '--git-dir') {
      if (cwd && gitDirs[cwd]) {
        return gitDirs[cwd] + '\n';
      }
      throw new Error('not a git directory');
    }
    if (args[0] === 'rev-parse' && args[1] === '--abbrev-ref' && args[2] === 'HEAD') {
      return 'HEAD\n';
    }
    if (args[0] === 'worktree' && args[1] === 'prune') {
      return '';
    }
    if (args[0] === 'status' && args[1] === '--porcelain') {
      return '';
    }
    if (args[0] === 'diff' && args[1] === '--name-only' && args[2] === '--diff-filter=U') {
      return '';
    }
    return '';
  });
}

describe('worktree list - detached HEAD handling', () => {
  let req: Request;
  let res: Response;

  beforeEach(() => {
    vi.clearAllMocks();
    const context = createMockExpressContext();
    req = context.req;
    res = context.res;

    // Re-establish mock implementations cleared by mockReset/clearAllMocks
    vi.mocked(isGitRepo).mockResolvedValue(true);
    vi.mocked(readAllWorktreeMetadata).mockResolvedValue(new Map());
    vi.mocked(isGhCliAvailable).mockResolvedValue(false);
    vi.mocked(checkGitHubRemote).mockResolvedValue({ hasGitHubRemote: false });
    vi.mocked(normalizePath).mockImplementation((p: string) => p);
    vi.mocked(getErrorMessage).mockImplementation(
      (e: unknown) => (e as Error)?.message || 'Unknown error'
    );

    // Default: all paths exist
    vi.mocked(secureFs.access).mockResolvedValue(undefined);
    // Default: .worktrees directory doesn't exist (no scan via readdir)
    vi.mocked(secureFs.readdir).mockRejectedValue(new Error('ENOENT'));
    // Default: readFile fails
    vi.mocked(secureFs.readFile).mockRejectedValue(new Error('ENOENT'));

    // Default execGitCommand so list handler gets valid porcelain/branch output (vitest clearMocks resets implementations)
    setupExecGitCommandMock({
      porcelainOutput: 'worktree /project\nbranch refs/heads/main\n\n',
      projectBranch: 'main',
    });
  });

  /**
   * Helper: set up execGitCommand mock for the list handler.
   * Worktree-specific behavior can be customized via the options parameter.
   */
  function setupStandardExec(options: {
    porcelainOutput: string;
    projectBranch?: string;
    /** Map of worktree path -> git-dir path */
    gitDirs?: Record<string, string>;
    /** Map of worktree cwd -> branch for `git branch --show-current` */
    worktreeBranches?: Record<string, string>;
  }) {
    setupExecGitCommandMock(options);
  }

  /** Suppress .worktrees dir scan by making access throw for the .worktrees dir. */
  function disableWorktreesScan() {
    vi.mocked(secureFs.access).mockImplementation(async (p) => {
      const pathStr = String(p);
      // Block only the .worktrees dir access check in scanWorktreesDirectory
      if (pathStr.endsWith('.worktrees') || pathStr.endsWith('.worktrees/')) {
        throw new Error('ENOENT');
      }
      // All other paths exist
      return undefined;
    });
  }

  describe('porcelain parser', () => {
    it('should include normal worktrees with branch lines', async () => {
      req.body = { projectPath: '/project' };

      setupStandardExec({
        porcelainOutput: [
          'worktree /project',
          'branch refs/heads/main',
          '',
          'worktree /project/.worktrees/feature-a',
          'branch refs/heads/feature-a',
          '',
        ].join('\n'),
      });
      disableWorktreesScan();

      const handler = createListHandler();
      await handler(req, res);

      const response = vi.mocked(res.json).mock.calls[0][0] as {
        success: boolean;
        worktrees: Array<{ branch: string; path: string; isMain: boolean; hasWorktree: boolean }>;
      };

      expect(response.success).toBe(true);
      expect(response.worktrees).toHaveLength(2);
      expect(response.worktrees[0]).toEqual(
        expect.objectContaining({
          path: '/project',
          branch: 'main',
          isMain: true,
          hasWorktree: true,
        })
      );
      expect(response.worktrees[1]).toEqual(
        expect.objectContaining({
          path: '/project/.worktrees/feature-a',
          branch: 'feature-a',
          isMain: false,
          hasWorktree: true,
        })
      );
    });

    it('should include worktrees with detached HEAD and recover branch from rebase-merge state', async () => {
      req.body = { projectPath: '/project' };

      setupStandardExec({
        porcelainOutput: [
          'worktree /project',
          'branch refs/heads/main',
          '',
          'worktree /project/.worktrees/rebasing-wt',
          'detached',
          '',
        ].join('\n'),
        gitDirs: {
          '/project/.worktrees/rebasing-wt': '/project/.worktrees/rebasing-wt/.git',
        },
      });
      disableWorktreesScan();

      // rebase-merge/head-name returns the branch being rebased
      vi.mocked(secureFs.readFile).mockImplementation(async (filePath) => {
        const pathStr = String(filePath);
        if (pathStr.includes('rebase-merge/head-name')) {
          return 'refs/heads/feature/my-rebasing-branch\n' as any;
        }
        throw new Error('ENOENT');
      });

      const handler = createListHandler();
      await handler(req, res);

      const response = vi.mocked(res.json).mock.calls[0][0] as {
        worktrees: Array<{ branch: string; path: string; isCurrent: boolean }>;
      };
      expect(response.worktrees).toHaveLength(2);
      expect(response.worktrees[1]).toEqual(
        expect.objectContaining({
          path: '/project/.worktrees/rebasing-wt',
          branch: 'feature/my-rebasing-branch',
          isMain: false,
          isCurrent: false,
          hasWorktree: true,
        })
      );
    });

    it('should include worktrees with detached HEAD and recover branch from rebase-apply state', async () => {
      req.body = { projectPath: '/project' };

      setupStandardExec({
        porcelainOutput: [
          'worktree /project',
          'branch refs/heads/main',
          '',
          'worktree /project/.worktrees/apply-wt',
          'detached',
          '',
        ].join('\n'),
        gitDirs: {
          '/project/.worktrees/apply-wt': '/project/.worktrees/apply-wt/.git',
        },
      });
      disableWorktreesScan();

      // rebase-merge doesn't exist, but rebase-apply does
      vi.mocked(secureFs.readFile).mockImplementation(async (filePath) => {
        const pathStr = String(filePath);
        if (pathStr.includes('rebase-apply/head-name')) {
          return 'refs/heads/feature/apply-branch\n' as any;
        }
        throw new Error('ENOENT');
      });

      const handler = createListHandler();
      await handler(req, res);

      const response = vi.mocked(res.json).mock.calls[0][0] as {
        worktrees: Array<{ branch: string; path: string }>;
      };
      const detachedWt = response.worktrees.find((w) => w.path === '/project/.worktrees/apply-wt');
      expect(detachedWt).toBeDefined();
      expect(detachedWt!.branch).toBe('feature/apply-branch');
    });

    it('should show merge conflict worktrees normally since merge does not detach HEAD', async () => {
      // During a merge conflict, HEAD stays on the branch, so `git worktree list --porcelain`
      // still outputs `branch refs/heads/...`. This test verifies merge conflicts don't
      // trigger the detached HEAD recovery path.
      req.body = { projectPath: '/project' };

      setupStandardExec({
        porcelainOutput: [
          'worktree /project',
          'branch refs/heads/main',
          '',
          'worktree /project/.worktrees/merge-wt',
          'branch refs/heads/feature/merge-branch',
          '',
        ].join('\n'),
      });
      disableWorktreesScan();

      const handler = createListHandler();
      await handler(req, res);

      const response = vi.mocked(res.json).mock.calls[0][0] as {
        worktrees: Array<{ branch: string; path: string }>;
      };
      const mergeWt = response.worktrees.find((w) => w.path === '/project/.worktrees/merge-wt');
      expect(mergeWt).toBeDefined();
      expect(mergeWt!.branch).toBe('feature/merge-branch');
    });

    it('should fall back to (detached) when all branch recovery methods fail', async () => {
      req.body = { projectPath: '/project' };

      setupStandardExec({
        porcelainOutput: [
          'worktree /project',
          'branch refs/heads/main',
          '',
          'worktree /project/.worktrees/unknown-wt',
          'detached',
          '',
        ].join('\n'),
        worktreeBranches: {
          '/project/.worktrees/unknown-wt': '', // empty = no branch
        },
      });
      disableWorktreesScan();

      // All readFile calls fail (no gitDirs so rev-parse --git-dir will throw)
      vi.mocked(secureFs.readFile).mockRejectedValue(new Error('ENOENT'));

      const handler = createListHandler();
      await handler(req, res);

      const response = vi.mocked(res.json).mock.calls[0][0] as {
        worktrees: Array<{ branch: string; path: string }>;
      };
      const detachedWt = response.worktrees.find(
        (w) => w.path === '/project/.worktrees/unknown-wt'
      );
      expect(detachedWt).toBeDefined();
      expect(detachedWt!.branch).toBe('(detached)');
    });

    it('should not include detached worktree when directory does not exist on disk', async () => {
      req.body = { projectPath: '/project' };

      setupStandardExec({
        porcelainOutput: [
          'worktree /project',
          'branch refs/heads/main',
          '',
          'worktree /project/.worktrees/deleted-wt',
          'detached',
          '',
        ].join('\n'),
      });

      // The deleted worktree doesn't exist on disk
      vi.mocked(secureFs.access).mockImplementation(async (p) => {
        const pathStr = String(p);
        if (pathStr.includes('deleted-wt')) {
          throw new Error('ENOENT');
        }
        if (pathStr.endsWith('.worktrees') || pathStr.endsWith('.worktrees/')) {
          throw new Error('ENOENT');
        }
        return undefined;
      });

      const handler = createListHandler();
      await handler(req, res);

      const response = vi.mocked(res.json).mock.calls[0][0] as {
        worktrees: Array<{ branch: string; path: string }>;
      };
      // Only the main worktree should be present
      expect(response.worktrees).toHaveLength(1);
      expect(response.worktrees[0].path).toBe('/project');
    });

    it('should set isCurrent to false for detached worktrees even if recovered branch matches current branch', async () => {
      req.body = { projectPath: '/project' };

      setupStandardExec({
        porcelainOutput: [
          'worktree /project',
          'branch refs/heads/main',
          '',
          'worktree /project/.worktrees/rebasing-wt',
          'detached',
          '',
        ].join('\n'),
        // currentBranch for project is 'feature/my-branch'
        projectBranch: 'feature/my-branch',
        gitDirs: {
          '/project/.worktrees/rebasing-wt': '/project/.worktrees/rebasing-wt/.git',
        },
      });
      disableWorktreesScan();

      // Recovery returns the same branch as currentBranch
      vi.mocked(secureFs.readFile).mockImplementation(async (filePath) => {
        const pathStr = String(filePath);
        if (pathStr.includes('rebase-merge/head-name')) {
          return 'refs/heads/feature/my-branch\n' as any;
        }
        throw new Error('ENOENT');
      });

      const handler = createListHandler();
      await handler(req, res);

      const response = vi.mocked(res.json).mock.calls[0][0] as {
        worktrees: Array<{ branch: string; isCurrent: boolean; path: string }>;
      };
      const detachedWt = response.worktrees.find(
        (w) => w.path === '/project/.worktrees/rebasing-wt'
      );
      expect(detachedWt).toBeDefined();
      // Detached worktrees should always have isCurrent=false
      expect(detachedWt!.isCurrent).toBe(false);
    });

    it('should handle mixed normal and detached worktrees', async () => {
      req.body = { projectPath: '/project' };

      setupStandardExec({
        porcelainOutput: [
          'worktree /project',
          'branch refs/heads/main',
          '',
          'worktree /project/.worktrees/normal-wt',
          'branch refs/heads/feature-normal',
          '',
          'worktree /project/.worktrees/rebasing-wt',
          'detached',
          '',
          'worktree /project/.worktrees/another-normal',
          'branch refs/heads/feature-other',
          '',
        ].join('\n'),
        gitDirs: {
          '/project/.worktrees/rebasing-wt': '/project/.worktrees/rebasing-wt/.git',
        },
      });
      disableWorktreesScan();

      vi.mocked(secureFs.readFile).mockImplementation(async (filePath) => {
        const pathStr = String(filePath);
        if (pathStr.includes('rebase-merge/head-name')) {
          return 'refs/heads/feature/rebasing\n' as any;
        }
        throw new Error('ENOENT');
      });

      const handler = createListHandler();
      await handler(req, res);

      const response = vi.mocked(res.json).mock.calls[0][0] as {
        worktrees: Array<{ branch: string; path: string; isMain: boolean }>;
      };
      expect(response.worktrees).toHaveLength(4);
      expect(response.worktrees[0]).toEqual(
        expect.objectContaining({ path: '/project', branch: 'main', isMain: true })
      );
      expect(response.worktrees[1]).toEqual(
        expect.objectContaining({
          path: '/project/.worktrees/normal-wt',
          branch: 'feature-normal',
          isMain: false,
        })
      );
      expect(response.worktrees[2]).toEqual(
        expect.objectContaining({
          path: '/project/.worktrees/rebasing-wt',
          branch: 'feature/rebasing',
          isMain: false,
        })
      );
      expect(response.worktrees[3]).toEqual(
        expect.objectContaining({
          path: '/project/.worktrees/another-normal',
          branch: 'feature-other',
          isMain: false,
        })
      );
    });

    it('should correctly advance isFirst flag past detached worktrees', async () => {
      req.body = { projectPath: '/project' };

      setupStandardExec({
        porcelainOutput: [
          'worktree /project',
          'branch refs/heads/main',
          '',
          'worktree /project/.worktrees/detached-wt',
          'detached',
          '',
          'worktree /project/.worktrees/normal-wt',
          'branch refs/heads/feature-x',
          '',
        ].join('\n'),
      });
      disableWorktreesScan();
      vi.mocked(secureFs.readFile).mockRejectedValue(new Error('ENOENT'));

      const handler = createListHandler();
      await handler(req, res);

      const response = vi.mocked(res.json).mock.calls[0][0] as {
        worktrees: Array<{ branch: string; isMain: boolean }>;
      };
      expect(response.worktrees).toHaveLength(3);
      expect(response.worktrees[0].isMain).toBe(true); // main
      expect(response.worktrees[1].isMain).toBe(false); // detached
      expect(response.worktrees[2].isMain).toBe(false); // normal
    });

    it('should not add removed detached worktrees to removedWorktrees list', async () => {
      req.body = { projectPath: '/project' };

      setupStandardExec({
        porcelainOutput: [
          'worktree /project',
          'branch refs/heads/main',
          '',
          'worktree /project/.worktrees/gone-wt',
          'detached',
          '',
        ].join('\n'),
      });

      // The detached worktree doesn't exist on disk
      vi.mocked(secureFs.access).mockImplementation(async (p) => {
        const pathStr = String(p);
        if (pathStr.includes('gone-wt')) {
          throw new Error('ENOENT');
        }
        if (pathStr.endsWith('.worktrees') || pathStr.endsWith('.worktrees/')) {
          throw new Error('ENOENT');
        }
        return undefined;
      });

      const handler = createListHandler();
      await handler(req, res);

      const response = vi.mocked(res.json).mock.calls[0][0] as {
        worktrees: Array<{ branch: string }>;
        removedWorktrees?: Array<{ path: string; branch: string }>;
      };
      // Should not be in removed list since we don't know the branch
      expect(response.removedWorktrees).toBeUndefined();
    });

    it('should strip refs/heads/ prefix from recovered branch name', async () => {
      req.body = { projectPath: '/project' };

      setupStandardExec({
        porcelainOutput: [
          'worktree /project',
          'branch refs/heads/main',
          '',
          'worktree /project/.worktrees/wt1',
          'detached',
          '',
        ].join('\n'),
        gitDirs: {
          '/project/.worktrees/wt1': '/project/.worktrees/wt1/.git',
        },
      });
      disableWorktreesScan();

      vi.mocked(secureFs.readFile).mockImplementation(async (filePath) => {
        const pathStr = String(filePath);
        if (pathStr.includes('rebase-merge/head-name')) {
          return 'refs/heads/my-branch\n' as any;
        }
        throw new Error('ENOENT');
      });

      const handler = createListHandler();
      await handler(req, res);

      const response = vi.mocked(res.json).mock.calls[0][0] as {
        worktrees: Array<{ branch: string; path: string }>;
      };
      const wt = response.worktrees.find((w) => w.path === '/project/.worktrees/wt1');
      expect(wt).toBeDefined();
      // Should be 'my-branch', not 'refs/heads/my-branch'
      expect(wt!.branch).toBe('my-branch');
    });
  });

  describe('scanWorktreesDirectory with detached HEAD recovery', () => {
    it('should recover branch for discovered worktrees with detached HEAD', async () => {
      req.body = { projectPath: '/project' };

      vi.mocked(execGitCommand).mockImplementation(async (args: string[], cwd: string) => {
        if (args[0] === 'worktree' && args[1] === 'list') {
          return 'worktree /project\nbranch refs/heads/main\n\n';
        }
        if (args[0] === 'branch' && args[1] === '--show-current') {
          return cwd === '/project' ? 'main\n' : '\n';
        }
        if (args[0] === 'rev-parse' && args[1] === '--abbrev-ref') {
          return 'HEAD\n';
        }
        if (args[0] === 'rev-parse' && args[1] === '--git-dir') {
          return '/project/.worktrees/orphan-wt/.git\n';
        }
        return '';
      });

      // .worktrees directory exists and has an orphan worktree
      vi.mocked(secureFs.access).mockResolvedValue(undefined);
      vi.mocked(secureFs.readdir).mockResolvedValue([
        { name: 'orphan-wt', isDirectory: () => true, isFile: () => false } as any,
      ]);
      vi.mocked(secureFs.stat).mockResolvedValue({
        isFile: () => true,
        isDirectory: () => false,
      } as any);

      // readFile returns branch from rebase-merge/head-name
      vi.mocked(secureFs.readFile).mockImplementation(async (filePath) => {
        const pathStr = String(filePath);
        if (pathStr.includes('rebase-merge/head-name')) {
          return 'refs/heads/feature/orphan-branch\n' as any;
        }
        throw new Error('ENOENT');
      });

      const handler = createListHandler();
      await handler(req, res);

      const response = vi.mocked(res.json).mock.calls[0][0] as {
        worktrees: Array<{ branch: string; path: string }>;
      };

      const orphanWt = response.worktrees.find((w) => w.path === '/project/.worktrees/orphan-wt');
      expect(orphanWt).toBeDefined();
      expect(orphanWt!.branch).toBe('feature/orphan-branch');
    });

    it('should skip discovered worktrees when all branch detection fails', async () => {
      req.body = { projectPath: '/project' };

      vi.mocked(execGitCommand).mockImplementation(async (args: string[], cwd: string) => {
        if (args[0] === 'worktree' && args[1] === 'list') {
          return 'worktree /project\nbranch refs/heads/main\n\n';
        }
        if (args[0] === 'branch' && args[1] === '--show-current') {
          return cwd === '/project' ? 'main\n' : '\n';
        }
        if (args[0] === 'rev-parse' && args[1] === '--abbrev-ref') {
          return 'HEAD\n';
        }
        if (args[0] === 'rev-parse' && args[1] === '--git-dir') {
          throw new Error('not a git dir');
        }
        return '';
      });

      vi.mocked(secureFs.access).mockResolvedValue(undefined);
      vi.mocked(secureFs.readdir).mockResolvedValue([
        { name: 'broken-wt', isDirectory: () => true, isFile: () => false } as any,
      ]);
      vi.mocked(secureFs.stat).mockResolvedValue({
        isFile: () => true,
        isDirectory: () => false,
      } as any);
      vi.mocked(secureFs.readFile).mockRejectedValue(new Error('ENOENT'));

      const handler = createListHandler();
      await handler(req, res);

      const response = vi.mocked(res.json).mock.calls[0][0] as {
        worktrees: Array<{ branch: string; path: string }>;
      };

      // Only main worktree should be present
      expect(response.worktrees).toHaveLength(1);
      expect(response.worktrees[0].branch).toBe('main');
    });
  });

  describe('PR tracking precedence', () => {
    it('should keep manually tracked PR from metadata when branch PR differs', async () => {
      req.body = { projectPath: '/project', includeDetails: true };

      vi.mocked(readAllWorktreeMetadata).mockResolvedValue(
        new Map([
          [
            'feature-a',
            {
              branch: 'feature-a',
              createdAt: '2026-01-01T00:00:00.000Z',
              pr: {
                number: 99,
                url: 'https://github.com/org/repo/pull/99',
                title: 'Manual override PR',
                state: 'OPEN',
                createdAt: '2026-01-01T00:00:00.000Z',
              },
            },
          ],
        ])
      );
      vi.mocked(isGhCliAvailable).mockResolvedValue(true);
      vi.mocked(checkGitHubRemote).mockResolvedValue({
        hasGitHubRemote: true,
        owner: 'org',
        repo: 'repo',
      });
      vi.mocked(secureFs.access).mockImplementation(async (p) => {
        const pathStr = String(p);
        if (
          pathStr.includes('MERGE_HEAD') ||
          pathStr.includes('rebase-merge') ||
          pathStr.includes('rebase-apply') ||
          pathStr.includes('CHERRY_PICK_HEAD')
        ) {
          throw new Error('ENOENT');
        }
        return undefined;
      });

      vi.mocked(execGitCommand).mockImplementation(async (args: string[], cwd: string) => {
        if (args[0] === 'rev-parse' && args[1] === '--git-dir') {
          throw new Error('no git dir');
        }
        if (args[0] === 'worktree' && args[1] === 'list') {
          return [
            'worktree /project',
            'branch refs/heads/main',
            '',
            'worktree /project/.worktrees/feature-a',
            'branch refs/heads/feature-a',
            '',
          ].join('\n');
        }
        if (args[0] === 'branch' && args[1] === '--show-current') {
          return cwd === '/project' ? 'main\n' : 'feature-a\n';
        }
        if (args[0] === 'status' && args[1] === '--porcelain') {
          return '';
        }
        return '';
      });
      (exec as unknown as Mock).mockImplementation(
        (
          cmd: string,
          _opts: unknown,
          callback?: (err: Error | null, out: { stdout: string; stderr: string }) => void
        ) => {
          const cb = typeof _opts === 'function' ? _opts : callback!;
          if (cmd.includes('gh pr list')) {
            cb(null, {
              stdout: JSON.stringify([
                {
                  number: 42,
                  title: 'Branch PR',
                  url: 'https://github.com/org/repo/pull/42',
                  state: 'OPEN',
                  headRefName: 'feature-a',
                  createdAt: '2026-01-02T00:00:00.000Z',
                },
              ]),
              stderr: '',
            });
          } else {
            cb(null, { stdout: '', stderr: '' });
          }
        }
      );
      disableWorktreesScan();

      const handler = createListHandler();
      await handler(req, res);

      const response = vi.mocked(res.json).mock.calls[0][0] as {
        worktrees: Array<{ branch: string; pr?: { number: number; title: string } }>;
      };
      const featureWorktree = response.worktrees.find((w) => w.branch === 'feature-a');
      expect(featureWorktree?.pr?.number).toBe(99);
      expect(featureWorktree?.pr?.title).toBe('Manual override PR');
    });

    it('should prefer GitHub PR when it matches metadata number and sync updated fields', async () => {
      req.body = { projectPath: '/project-2', includeDetails: true };

      vi.mocked(readAllWorktreeMetadata).mockResolvedValue(
        new Map([
          [
            'feature-a',
            {
              branch: 'feature-a',
              createdAt: '2026-01-01T00:00:00.000Z',
              pr: {
                number: 42,
                url: 'https://github.com/org/repo/pull/42',
                title: 'Old title',
                state: 'OPEN',
                createdAt: '2026-01-01T00:00:00.000Z',
              },
            },
          ],
        ])
      );
      vi.mocked(isGhCliAvailable).mockResolvedValue(true);
      vi.mocked(checkGitHubRemote).mockResolvedValue({
        hasGitHubRemote: true,
        owner: 'org',
        repo: 'repo',
      });
      vi.mocked(secureFs.access).mockImplementation(async (p) => {
        const pathStr = String(p);
        if (
          pathStr.includes('MERGE_HEAD') ||
          pathStr.includes('rebase-merge') ||
          pathStr.includes('rebase-apply') ||
          pathStr.includes('CHERRY_PICK_HEAD')
        ) {
          throw new Error('ENOENT');
        }
        return undefined;
      });

      vi.mocked(execGitCommand).mockImplementation(async (args: string[], cwd: string) => {
        if (args[0] === 'rev-parse' && args[1] === '--git-dir') {
          throw new Error('no git dir');
        }
        if (args[0] === 'worktree' && args[1] === 'list') {
          return [
            'worktree /project-2',
            'branch refs/heads/main',
            '',
            'worktree /project-2/.worktrees/feature-a',
            'branch refs/heads/feature-a',
            '',
          ].join('\n');
        }
        if (args[0] === 'branch' && args[1] === '--show-current') {
          return cwd === '/project-2' ? 'main\n' : 'feature-a\n';
        }
        if (args[0] === 'status' && args[1] === '--porcelain') {
          return '';
        }
        return '';
      });
      (exec as unknown as Mock).mockImplementation(
        (
          cmd: string,
          _opts: unknown,
          callback?: (err: Error | null, out: { stdout: string; stderr: string }) => void
        ) => {
          const cb = typeof _opts === 'function' ? _opts : callback!;
          if (cmd.includes('gh pr list')) {
            cb(null, {
              stdout: JSON.stringify([
                {
                  number: 42,
                  title: 'New title from GitHub',
                  url: 'https://github.com/org/repo/pull/42',
                  state: 'MERGED',
                  headRefName: 'feature-a',
                  createdAt: '2026-01-02T00:00:00.000Z',
                },
              ]),
              stderr: '',
            });
          } else {
            cb(null, { stdout: '', stderr: '' });
          }
        }
      );
      disableWorktreesScan();

      const handler = createListHandler();
      await handler(req, res);

      const response = vi.mocked(res.json).mock.calls[0][0] as {
        worktrees: Array<{ branch: string; pr?: { number: number; title: string; state: string } }>;
      };
      const featureWorktree = response.worktrees.find((w) => w.branch === 'feature-a');
      expect(featureWorktree?.pr?.number).toBe(42);
      expect(featureWorktree?.pr?.title).toBe('New title from GitHub');
      expect(featureWorktree?.pr?.state).toBe('MERGED');
      expect(vi.mocked(updateWorktreePRInfo)).toHaveBeenCalledWith(
        '/project-2',
        'feature-a',
        expect.objectContaining({
          number: 42,
          title: 'New title from GitHub',
          state: 'MERGED',
        })
      );
    });
  });
});
