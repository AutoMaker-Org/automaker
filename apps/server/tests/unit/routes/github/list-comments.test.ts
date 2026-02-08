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
  spawn: vi.fn(),
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
import { createListCommentsHandler } from '@/routes/github/routes/list-comments.js';

describe('list-comments (Gitea path)', () => {
  let mockListIssueComments: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockListIssueComments = vi.fn();

    vi.mocked(GiteaClient).mockImplementation(function (this: any) {
      this.listIssues = vi.fn();
      this.listPRs = vi.fn();
      this.createPR = vi.fn();
      this.getPRByBranch = vi.fn();
      this.getPR = vi.fn();
      this.listIssueComments = mockListIssueComments;
    } as any);
  });

  it('should return 400 when projectPath is missing', async () => {
    const { req, res } = createMockExpressContext();
    req.body = {};

    const handler = createListCommentsHandler();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should return 400 when issueNumber is missing', async () => {
    const { req, res } = createMockExpressContext();
    req.body = { projectPath: '/test/project' };

    const handler = createListCommentsHandler();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should return 400 when issueNumber is not a number', async () => {
    const { req, res } = createMockExpressContext();
    req.body = { projectPath: '/test/project', issueNumber: 'abc' };

    const handler = createListCommentsHandler();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  describe('Gitea forge path', () => {
    it('should return comments from Gitea', async () => {
      vi.mocked(detectForgeCached).mockResolvedValue(createMockForgeInfo('gitea'));

      const mockResult = {
        comments: [
          {
            id: '100',
            author: { login: 'testuser', avatarUrl: 'https://gitea.example.com/avatars/1' },
            body: 'Test comment',
            createdAt: '2024-01-15T12:00:00Z',
            updatedAt: '2024-01-15T12:00:00Z',
          },
        ],
        totalCount: 1,
        hasNextPage: false,
        endCursor: undefined,
      };

      mockListIssueComments.mockResolvedValue(mockResult);

      const { req, res } = createMockExpressContext();
      req.body = { projectPath: '/test/project', issueNumber: 42 };

      const handler = createListCommentsHandler();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        ...mockResult,
      });
    });

    it('should handle empty comments', async () => {
      vi.mocked(detectForgeCached).mockResolvedValue(createMockForgeInfo('gitea'));

      const emptyResult = {
        comments: [],
        totalCount: 0,
        hasNextPage: false,
        endCursor: undefined,
      };

      mockListIssueComments.mockResolvedValue(emptyResult);

      const { req, res } = createMockExpressContext();
      req.body = { projectPath: '/test/project', issueNumber: 42 };

      const handler = createListCommentsHandler();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        ...emptyResult,
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
      req.body = { projectPath: '/test/project', issueNumber: 42 };

      const handler = createListCommentsHandler();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('GitHub forge path (fallthrough)', () => {
    it('should return error when no GitHub remote and forge is not gitea', async () => {
      vi.mocked(detectForgeCached).mockResolvedValue(createMockForgeInfo('unknown'));

      // Mock checkGitHubRemote imported by the module
      const { checkGitHubRemote } = await import('@/routes/github/routes/check-github-remote.js');
      vi.mocked(checkGitHubRemote).mockResolvedValue({
        hasGitHubRemote: false,
        remoteUrl: null,
        owner: null,
        repo: null,
        hasRemote: false,
        forgeType: 'unknown',
        baseUrl: null,
      });

      const { req, res } = createMockExpressContext();
      req.body = { projectPath: '/test/project', issueNumber: 42 };

      const handler = createListCommentsHandler();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });
});
