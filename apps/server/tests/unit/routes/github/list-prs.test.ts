import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockExpressContext } from '../../../utils/mocks.js';
import { createMockForgeInfo } from '../../../utils/gitea-mocks.js';

vi.mock('@/lib/forge-detector.js', () => ({
  detectForgeCached: vi.fn(),
}));

vi.mock('@/lib/gitea-client.js', () => ({
  GiteaClient: vi.fn(),
}));

vi.mock('@/routes/github/routes/check-github-remote.js', () => ({
  checkGitHubRemote: vi.fn(),
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

import { detectForgeCached } from '@/lib/forge-detector.js';
import { GiteaClient } from '@/lib/gitea-client.js';
import { checkGitHubRemote } from '@/routes/github/routes/check-github-remote.js';
import { createListPRsHandler } from '@/routes/github/routes/list-prs.js';
import { exec } from 'child_process';

describe('list-prs (Gitea path)', () => {
  let mockListPRs: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockListPRs = vi.fn();

    vi.mocked(GiteaClient).mockImplementation(function (this: any) {
      this.listIssues = vi.fn();
      this.listPRs = mockListPRs;
      this.createPR = vi.fn();
      this.getPRByBranch = vi.fn();
      this.getPR = vi.fn();
      this.listIssueComments = vi.fn();
    } as any);
  });

  it('should return 400 when projectPath is missing', async () => {
    const { req, res } = createMockExpressContext();
    req.body = {};

    const handler = createListPRsHandler();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  describe('Gitea forge path', () => {
    it('should return open and merged PRs from Gitea', async () => {
      vi.mocked(detectForgeCached).mockResolvedValue(createMockForgeInfo('gitea'));

      const openPR = {
        number: 10,
        title: 'Open PR',
        state: 'OPEN',
        author: { login: 'user' },
        createdAt: '2024-01-01T00:00:00Z',
        labels: [],
        url: 'https://gitea.example.com/pulls/10',
        isDraft: false,
        headRefName: 'feature/x',
        reviewDecision: null,
        mergeable: 'MERGEABLE',
        body: '',
      };

      const mergedPR = {
        number: 8,
        title: 'Merged PR',
        state: 'MERGED',
        author: { login: 'user' },
        createdAt: '2024-01-01T00:00:00Z',
        labels: [],
        url: 'https://gitea.example.com/pulls/8',
        isDraft: false,
        headRefName: 'fix/y',
        reviewDecision: null,
        mergeable: 'UNKNOWN',
        body: '',
      };

      const closedPR = {
        number: 7,
        title: 'Closed PR',
        state: 'CLOSED',
        author: { login: 'user' },
        createdAt: '2024-01-01T00:00:00Z',
        labels: [],
        url: 'https://gitea.example.com/pulls/7',
        isDraft: false,
        headRefName: 'fix/z',
        reviewDecision: null,
        mergeable: 'UNKNOWN',
        body: '',
      };

      mockListPRs
        .mockResolvedValueOnce([openPR]) // open PRs
        .mockResolvedValueOnce([mergedPR, closedPR]); // closed PRs (includes merged)

      const { req, res } = createMockExpressContext();
      req.body = { projectPath: '/test/project' };

      const handler = createListPRsHandler();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        openPRs: [openPR],
        mergedPRs: [mergedPR], // Only MERGED, not CLOSED
      });
    });

    it('should return empty mergedPRs when no merged PRs exist', async () => {
      vi.mocked(detectForgeCached).mockResolvedValue(createMockForgeInfo('gitea'));

      mockListPRs
        .mockResolvedValueOnce([]) // open
        .mockResolvedValueOnce([
          {
            // closed but not merged
            number: 7,
            title: 'Closed',
            state: 'CLOSED',
            author: { login: 'u' },
            createdAt: '2024-01-01T00:00:00Z',
            labels: [],
            url: 'url',
            isDraft: false,
            headRefName: 'b',
            reviewDecision: null,
            mergeable: 'UNKNOWN',
            body: '',
          },
        ]);

      const { req, res } = createMockExpressContext();
      req.body = { projectPath: '/test/project' };

      const handler = createListPRsHandler();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        openPRs: [],
        mergedPRs: [],
      });
    });

    it('should return error when Gitea forge info is incomplete', async () => {
      vi.mocked(detectForgeCached).mockResolvedValue({
        type: 'gitea',
        baseUrl: null,
        owner: null,
        repo: null,
        remoteUrl: null,
      });

      const { req, res } = createMockExpressContext();
      req.body = { projectPath: '/test/project' };

      const handler = createListPRsHandler();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('GitHub forge path (fallthrough)', () => {
    it('should use gh CLI when forge is github', async () => {
      vi.mocked(detectForgeCached).mockResolvedValue(createMockForgeInfo('github'));
      vi.mocked(checkGitHubRemote).mockResolvedValue({
        hasGitHubRemote: true,
        remoteUrl: 'https://github.com/owner/repo.git',
        owner: 'owner',
        repo: 'repo',
        hasRemote: true,
        forgeType: 'github',
        baseUrl: 'https://github.com',
      });

      vi.mocked(exec).mockImplementation((_cmd: any, _opts: any, callback?: any) => {
        const cb = typeof _opts === 'function' ? _opts : callback;
        if (cb) {
          cb(null, { stdout: '[]', stderr: '' });
        }
        return {} as any;
      });

      const { req, res } = createMockExpressContext();
      req.body = { projectPath: '/test/project' };

      const handler = createListPRsHandler();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
        })
      );
      expect(GiteaClient).not.toHaveBeenCalled();
    });
  });
});
