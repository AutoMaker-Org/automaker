import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockExpressContext } from '../../../utils/mocks.js';
import { createMockForgeInfo, GITEA_FIXTURES } from '../../../utils/gitea-mocks.js';

// Mock dependencies
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
import { checkGitHubRemote } from '@/routes/github/routes/check-github-remote.js';
import { createListIssuesHandler } from '@/routes/github/routes/list-issues.js';
import { exec } from 'child_process';

describe('list-issues (Gitea path)', () => {
  let mockListIssues: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockListIssues = vi.fn();

    vi.mocked(GiteaClient).mockImplementation(function (this: any) {
      this.listIssues = mockListIssues;
      this.listPRs = vi.fn();
      this.createPR = vi.fn();
      this.getPRByBranch = vi.fn();
      this.getPR = vi.fn();
      this.listIssueComments = vi.fn();
    } as any);
  });

  it('should return 400 when projectPath is missing', async () => {
    const { req, res } = createMockExpressContext();
    req.body = {};

    const handler = createListIssuesHandler();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  describe('Gitea forge path', () => {
    it('should return open and closed issues from Gitea', async () => {
      vi.mocked(detectForgeCached).mockResolvedValue(createMockForgeInfo('gitea'));

      const openIssue = {
        number: 42,
        title: 'Open issue',
        state: 'open',
        author: { login: 'user' },
        createdAt: '2024-01-01T00:00:00Z',
        labels: [],
        url: 'https://gitea.example.com/issues/42',
        body: '',
        assignees: [],
      };
      const closedIssue = {
        number: 41,
        title: 'Closed issue',
        state: 'closed',
        author: { login: 'user' },
        createdAt: '2024-01-01T00:00:00Z',
        labels: [],
        url: 'https://gitea.example.com/issues/41',
        body: '',
        assignees: [],
      };

      mockListIssues.mockResolvedValueOnce([openIssue]).mockResolvedValueOnce([closedIssue]);

      const { req, res } = createMockExpressContext();
      req.body = { projectPath: '/test/project' };

      const handler = createListIssuesHandler();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        openIssues: [openIssue],
        closedIssues: [closedIssue],
      });
    });

    it('should handle empty issue lists', async () => {
      vi.mocked(detectForgeCached).mockResolvedValue(createMockForgeInfo('gitea'));
      mockListIssues.mockResolvedValue([]);

      const { req, res } = createMockExpressContext();
      req.body = { projectPath: '/test/project' };

      const handler = createListIssuesHandler();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        openIssues: [],
        closedIssues: [],
      });
    });

    it('should return error when Gitea forge info is incomplete', async () => {
      vi.mocked(detectForgeCached).mockResolvedValue({
        type: 'gitea',
        baseUrl: 'https://gitea.example.com',
        owner: null,
        repo: null,
        remoteUrl: null,
      });

      const { req, res } = createMockExpressContext();
      req.body = { projectPath: '/test/project' };

      const handler = createListIssuesHandler();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('Gitea'),
        })
      );
    });

    it('should pass settingsService to GiteaClient', async () => {
      vi.mocked(detectForgeCached).mockResolvedValue(createMockForgeInfo('gitea'));
      mockListIssues.mockResolvedValue([]);

      const mockSettingsService = { getCredentials: vi.fn() } as any;

      const { req, res } = createMockExpressContext();
      req.body = { projectPath: '/test/project' };

      const handler = createListIssuesHandler(mockSettingsService);
      await handler(req, res);

      expect(GiteaClient).toHaveBeenCalledWith(
        expect.objectContaining({
          settingsService: mockSettingsService,
        })
      );
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

      // Mock exec for gh issue list
      vi.mocked(exec).mockImplementation((_cmd: any, _opts: any, callback?: any) => {
        const cb = typeof _opts === 'function' ? _opts : callback;
        if (cb) {
          cb(null, { stdout: '[]', stderr: '' });
        }
        return {} as any;
      });

      const { req, res } = createMockExpressContext();
      req.body = { projectPath: '/test/project' };

      const handler = createListIssuesHandler();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
        })
      );
      // GiteaClient should NOT have been instantiated
      expect(GiteaClient).not.toHaveBeenCalled();
    });

    it('should return error when no supported remote is detected', async () => {
      vi.mocked(detectForgeCached).mockResolvedValue(createMockForgeInfo('unknown'));
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
      req.body = { projectPath: '/test/project' };

      const handler = createListIssuesHandler();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });
});
