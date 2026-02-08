import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockExpressContext } from '../../../utils/mocks.js';
import { createMockForgeInfo } from '../../../utils/gitea-mocks.js';

vi.mock('@/lib/forge-detector.js', () => ({
  detectForgeCached: vi.fn(),
}));

vi.mock('@/lib/gitea-client.js', () => ({
  GiteaClient: vi.fn(),
}));

vi.mock('@/lib/worktree-metadata.js', () => ({
  updateWorktreePRInfo: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

vi.mock('@automaker/utils', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('@automaker/types', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@automaker/types')>();
  return {
    ...actual,
    validatePRState: vi.fn((state: string) => state),
  };
});

vi.mock('@automaker/platform', () => ({
  spawnProcess: vi.fn(),
  getExtendedPath: () => '/usr/bin',
}));

import { detectForgeCached } from '@/lib/forge-detector.js';
import { GiteaClient } from '@/lib/gitea-client.js';
import { updateWorktreePRInfo } from '@/lib/worktree-metadata.js';
import { createCreatePRHandler } from '@/routes/worktree/routes/create-pr.js';
import { exec } from 'child_process';

function mockExecSequence(responses: Array<{ stdout?: string; error?: Error }>) {
  const mock = vi.mocked(exec);
  let callIndex = 0;

  mock.mockImplementation((_cmd: any, _opts: any, callback?: any) => {
    const cb = typeof _opts === 'function' ? _opts : callback;
    const response = responses[callIndex++];
    if (cb) {
      if (response?.error) {
        cb(response.error, { stdout: '', stderr: response.error.message });
      } else {
        cb(null, { stdout: response?.stdout ?? '', stderr: '' });
      }
    }
    return {} as any;
  });
}

describe('create-pr (Gitea path)', () => {
  let mockGetPRByBranch: ReturnType<typeof vi.fn>;
  let mockCreatePR: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockGetPRByBranch = vi.fn().mockResolvedValue(null);
    mockCreatePR = vi.fn();

    vi.mocked(GiteaClient).mockImplementation(function (this: any) {
      this.listIssues = vi.fn();
      this.listPRs = vi.fn();
      this.createPR = mockCreatePR;
      this.getPRByBranch = mockGetPRByBranch;
      this.getPR = vi.fn();
      this.listIssueComments = vi.fn();
    } as any);
  });

  it('should return 400 when worktreePath is missing', async () => {
    const { req, res } = createMockExpressContext();
    req.body = {};

    const handler = createCreatePRHandler();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  describe('Gitea forge path', () => {
    it('should create new PR via GiteaClient after push', async () => {
      // Sequence: git rev-parse (branch), git status, git push
      mockExecSequence([
        { stdout: 'feature/my-branch\n' }, // git rev-parse --abbrev-ref HEAD
        { stdout: '' }, // git status --porcelain (no changes)
        { stdout: '' }, // git push -u origin feature/my-branch
      ]);

      vi.mocked(detectForgeCached).mockResolvedValue(createMockForgeInfo('gitea'));

      mockCreatePR.mockResolvedValue({
        number: 15,
        url: 'https://gitea.example.com/testowner/testrepo/pulls/15',
        state: 'OPEN',
      });

      const { req, res } = createMockExpressContext();
      req.body = {
        worktreePath: '/test/worktree',
        projectPath: '/test/project',
        prTitle: 'My Feature',
        prBody: 'Description',
        baseBranch: 'main',
      };

      const handler = createCreatePRHandler();
      await handler(req, res);

      expect(mockCreatePR).toHaveBeenCalledWith(
        'My Feature',
        'Description',
        'feature/my-branch',
        'main'
      );

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          result: expect.objectContaining({
            prUrl: 'https://gitea.example.com/testowner/testrepo/pulls/15',
            prCreated: true,
            prAlreadyExisted: false,
          }),
        })
      );
    });

    it('should return existing PR without creating new one', async () => {
      mockExecSequence([{ stdout: 'feature/my-branch\n' }, { stdout: '' }, { stdout: '' }]);

      vi.mocked(detectForgeCached).mockResolvedValue(createMockForgeInfo('gitea'));

      mockGetPRByBranch.mockResolvedValue({
        number: 10,
        url: 'https://gitea.example.com/testowner/testrepo/pulls/10',
        title: 'Existing PR',
        state: 'OPEN',
      });

      const { req, res } = createMockExpressContext();
      req.body = {
        worktreePath: '/test/worktree',
        projectPath: '/test/project',
      };

      const handler = createCreatePRHandler();
      await handler(req, res);

      expect(mockCreatePR).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          result: expect.objectContaining({
            prUrl: 'https://gitea.example.com/testowner/testrepo/pulls/10',
            prAlreadyExisted: true,
          }),
        })
      );
    });

    it('should construct correct browser URL for Gitea', async () => {
      mockExecSequence([{ stdout: 'feature/my-branch\n' }, { stdout: '' }, { stdout: '' }]);

      vi.mocked(detectForgeCached).mockResolvedValue(createMockForgeInfo('gitea'));
      mockCreatePR.mockResolvedValue({
        number: 15,
        url: 'https://gitea.example.com/testowner/testrepo/pulls/15',
        state: 'OPEN',
      });

      const { req, res } = createMockExpressContext();
      req.body = {
        worktreePath: '/test/worktree',
        projectPath: '/test/project',
        baseBranch: 'main',
      };

      const handler = createCreatePRHandler();
      await handler(req, res);

      const result = vi.mocked(res.json).mock.calls[0][0];
      expect(result.result.browserUrl).toBe(
        'https://gitea.example.com/testowner/testrepo/compare/main...feature/my-branch'
      );
    });

    it('should handle PR creation failure gracefully', async () => {
      mockExecSequence([{ stdout: 'feature/my-branch\n' }, { stdout: '' }, { stdout: '' }]);

      vi.mocked(detectForgeCached).mockResolvedValue(createMockForgeInfo('gitea'));
      mockCreatePR.mockRejectedValue(new Error('API rate limit'));

      const { req, res } = createMockExpressContext();
      req.body = {
        worktreePath: '/test/worktree',
        projectPath: '/test/project',
      };

      const handler = createCreatePRHandler();
      await handler(req, res);

      // Should still succeed (push worked) but report PR error
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          result: expect.objectContaining({
            pushed: true,
            prCreated: false,
            prError: 'API rate limit',
          }),
        })
      );
    });

    it('should store PR metadata via updateWorktreePRInfo', async () => {
      mockExecSequence([{ stdout: 'feature/my-branch\n' }, { stdout: '' }, { stdout: '' }]);

      vi.mocked(detectForgeCached).mockResolvedValue(createMockForgeInfo('gitea'));
      mockCreatePR.mockResolvedValue({
        number: 15,
        url: 'https://gitea.example.com/testowner/testrepo/pulls/15',
        state: 'OPEN',
      });

      const { req, res } = createMockExpressContext();
      req.body = {
        worktreePath: '/test/worktree',
        projectPath: '/test/project',
        prTitle: 'My PR',
      };

      const handler = createCreatePRHandler();
      await handler(req, res);

      expect(updateWorktreePRInfo).toHaveBeenCalledWith(
        '/test/project',
        'feature/my-branch',
        expect.objectContaining({
          number: 15,
          url: 'https://gitea.example.com/testowner/testrepo/pulls/15',
          state: 'OPEN',
        })
      );
    });
  });

  describe('GitHub forge path (fallthrough)', () => {
    it('should use gh CLI when forge is github', async () => {
      // Sequence: git rev-parse, git status, git push, git remote -v, gh pr list, gh pr create
      mockExecSequence([
        { stdout: 'feature/my-branch\n' },
        { stdout: '' },
        { stdout: '' },
        {
          stdout:
            'origin\thttps://github.com/owner/repo.git (fetch)\norigin\thttps://github.com/owner/repo.git (push)\n',
        },
        { stdout: '[]' }, // gh pr list (no existing)
        { stdout: 'https://github.com/owner/repo/pull/99\n' }, // gh pr create
      ]);

      vi.mocked(detectForgeCached).mockResolvedValue(createMockForgeInfo('github'));

      const { req, res } = createMockExpressContext();
      req.body = {
        worktreePath: '/test/worktree',
        projectPath: '/test/project',
        prTitle: 'Title',
        prBody: 'Body',
      };

      const handler = createCreatePRHandler();
      await handler(req, res);

      expect(GiteaClient).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
        })
      );
    });
  });
});
