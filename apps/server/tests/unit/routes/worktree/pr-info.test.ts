import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockExpressContext } from '../../../utils/mocks.js';
import { createMockForgeInfo } from '../../../utils/gitea-mocks.js';

vi.mock('@/lib/forge-detector.js', () => ({
  detectForgeCached: vi.fn(),
}));

vi.mock('@/lib/gitea-client.js', () => ({
  GiteaClient: vi.fn(),
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

vi.mock('@automaker/platform', () => ({
  spawnProcess: vi.fn(),
  getExtendedPath: () => '/usr/bin',
}));

import { detectForgeCached } from '@/lib/forge-detector.js';
import { GiteaClient } from '@/lib/gitea-client.js';
import { createPRInfoHandler } from '@/routes/worktree/routes/pr-info.js';
import { exec } from 'child_process';

describe('pr-info (Gitea path)', () => {
  let mockGetPRByBranch: ReturnType<typeof vi.fn>;
  let mockGetPR: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockGetPRByBranch = vi.fn();
    mockGetPR = vi.fn();

    vi.mocked(GiteaClient).mockImplementation(function (this: any) {
      this.listIssues = vi.fn();
      this.listPRs = vi.fn();
      this.createPR = vi.fn();
      this.getPRByBranch = mockGetPRByBranch;
      this.getPR = mockGetPR;
      this.listIssueComments = vi.fn();
    } as any);
  });

  it('should return 400 when worktreePath is missing', async () => {
    const { req, res } = createMockExpressContext();
    req.body = { branchName: 'test' };

    const handler = createPRInfoHandler();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should return 400 when branchName is missing', async () => {
    const { req, res } = createMockExpressContext();
    req.body = { worktreePath: '/test/worktree' };

    const handler = createPRInfoHandler();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should return 400 for invalid branch name', async () => {
    const { req, res } = createMockExpressContext();
    req.body = { worktreePath: '/test/worktree', branchName: 'branch; rm -rf /' };

    const handler = createPRInfoHandler();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('unsafe'),
      })
    );
  });

  describe('Gitea forge path', () => {
    it('should return PR info when found', async () => {
      vi.mocked(detectForgeCached).mockResolvedValue(createMockForgeInfo('gitea'));

      mockGetPRByBranch.mockResolvedValue({
        number: 10,
        url: 'https://gitea.example.com/testowner/testrepo/pulls/10',
        title: 'Add dark mode',
        state: 'OPEN',
      });

      mockGetPR.mockResolvedValue({
        number: 10,
        title: 'Add dark mode',
        url: 'https://gitea.example.com/testowner/testrepo/pulls/10',
        state: 'OPEN',
        author: 'testuser',
        body: 'Description',
        comments: [
          {
            id: 100,
            author: 'testuser',
            body: 'LGTM',
            createdAt: '2024-01-15T12:00:00Z',
            isReviewComment: false,
          },
        ],
        reviewComments: [],
      });

      const { req, res } = createMockExpressContext();
      req.body = { worktreePath: '/test/worktree', branchName: 'feature/dark-mode' };

      const handler = createPRInfoHandler();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        result: {
          hasPR: true,
          ghCliAvailable: false,
          prInfo: expect.objectContaining({
            number: 10,
            title: 'Add dark mode',
          }),
        },
      });
    });

    it('should return hasPR false when no PR found for branch', async () => {
      vi.mocked(detectForgeCached).mockResolvedValue(createMockForgeInfo('gitea'));
      mockGetPRByBranch.mockResolvedValue(null);

      const { req, res } = createMockExpressContext();
      req.body = { worktreePath: '/test/worktree', branchName: 'feature/no-pr' };

      const handler = createPRInfoHandler();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        result: {
          hasPR: false,
          ghCliAvailable: false,
        },
      });
    });

    it('should return hasPR false when getPR fails', async () => {
      vi.mocked(detectForgeCached).mockResolvedValue(createMockForgeInfo('gitea'));

      mockGetPRByBranch.mockResolvedValue({
        number: 10,
        url: 'url',
        title: 'PR',
        state: 'OPEN',
      });

      mockGetPR.mockResolvedValue(null); // getPR returns null on error

      const { req, res } = createMockExpressContext();
      req.body = { worktreePath: '/test/worktree', branchName: 'feature/broken-pr' };

      const handler = createPRInfoHandler();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        result: {
          hasPR: false,
          ghCliAvailable: false,
        },
      });
    });
  });

  describe('GitHub forge path (fallthrough)', () => {
    it('should use gh CLI when forge is github', async () => {
      vi.mocked(detectForgeCached).mockResolvedValue(createMockForgeInfo('github'));

      // Mock exec for: command -v gh, git remote -v, gh pr list
      let callIndex = 0;
      const responses = [
        { stdout: '/usr/local/bin/gh\n' }, // command -v gh
        { stdout: 'origin\thttps://github.com/owner/repo.git (fetch)\n' }, // git remote -v
        { stdout: '[]' }, // gh pr list (no PR found)
      ];

      vi.mocked(exec).mockImplementation((_cmd: any, _opts: any, callback?: any) => {
        const cb = typeof _opts === 'function' ? _opts : callback;
        const response = responses[callIndex++];
        if (cb) {
          cb(null, { stdout: response?.stdout ?? '', stderr: '' });
        }
        return {} as any;
      });

      const { req, res } = createMockExpressContext();
      req.body = { worktreePath: '/test/worktree', branchName: 'feature/test' };

      const handler = createPRInfoHandler();
      await handler(req, res);

      expect(GiteaClient).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          result: expect.objectContaining({
            hasPR: false,
            ghCliAvailable: true,
          }),
        })
      );
    });

    it('should return ghCliAvailable false when gh is not installed', async () => {
      vi.mocked(detectForgeCached).mockResolvedValue(createMockForgeInfo('github'));

      // Mock exec: command -v gh fails
      vi.mocked(exec).mockImplementation((_cmd: any, _opts: any, callback?: any) => {
        const cb = typeof _opts === 'function' ? _opts : callback;
        if (cb) {
          cb(new Error('not found'), { stdout: '', stderr: '' });
        }
        return {} as any;
      });

      const { req, res } = createMockExpressContext();
      req.body = { worktreePath: '/test/worktree', branchName: 'feature/test' };

      const handler = createPRInfoHandler();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          result: expect.objectContaining({
            ghCliAvailable: false,
          }),
        })
      );
    });
  });
});
