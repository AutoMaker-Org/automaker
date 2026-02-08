import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GITEA_FIXTURES, createMockSettingsService } from '../../utils/gitea-mocks.js';

vi.mock('@automaker/utils', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { GiteaClient } from '@/lib/gitea-client.js';

const BASE_URL = 'https://gitea.example.com';
const OWNER = 'testowner';
const REPO = 'testrepo';

describe('GiteaClient', () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn();
    delete process.env.GITEA_TOKEN;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  function mockFetchResponse(data: unknown, status = 200) {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      json: async () => data,
      text: async () => JSON.stringify(data),
    } as Response);
  }

  function mockFetchSequence(responses: Array<{ data: unknown; status?: number }>) {
    const mock = vi.mocked(globalThis.fetch);
    for (const [i, resp] of responses.entries()) {
      mock.mockResolvedValueOnce({
        ok: (resp.status ?? 200) >= 200 && (resp.status ?? 200) < 300,
        status: resp.status ?? 200,
        statusText: (resp.status ?? 200) === 200 ? 'OK' : 'Error',
        json: async () => resp.data,
        text: async () => JSON.stringify(resp.data),
      } as Response);
    }
  }

  describe('Token resolution', () => {
    it('should use token from credentials (settingsService)', async () => {
      const settingsService = createMockSettingsService({ gitea: 'cred-token-123' });
      const client = new GiteaClient({
        baseUrl: BASE_URL,
        owner: OWNER,
        repo: REPO,
        settingsService: settingsService as any,
      });

      mockFetchResponse([]);

      await client.listIssues('open', 10);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'token cred-token-123',
          }),
        })
      );
    });

    it('should use GITEA_TOKEN env var when no credentials token', async () => {
      const settingsService = createMockSettingsService({ gitea: '' });
      process.env.GITEA_TOKEN = 'env-token-456';

      const client = new GiteaClient({
        baseUrl: BASE_URL,
        owner: OWNER,
        repo: REPO,
        settingsService: settingsService as any,
      });

      mockFetchResponse([]);

      await client.listIssues('open', 10);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'token env-token-456',
          }),
        })
      );
    });

    it('should send request without auth header when no token available', async () => {
      const settingsService = createMockSettingsService({ gitea: '' });
      const client = new GiteaClient({
        baseUrl: BASE_URL,
        owner: OWNER,
        repo: REPO,
        settingsService: settingsService as any,
      });

      mockFetchResponse([]);

      await client.listIssues('open', 10);

      const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
      const headers = (fetchCall[1] as RequestInit).headers as Record<string, string>;
      expect(headers.Authorization).toBeUndefined();
    });
  });

  describe('API methods', () => {
    let client: GiteaClient;

    beforeEach(() => {
      const settingsService = createMockSettingsService({ gitea: 'test-token' });
      client = new GiteaClient({
        baseUrl: BASE_URL,
        owner: OWNER,
        repo: REPO,
        settingsService: settingsService as any,
      });
    });

    describe('listIssues', () => {
      it('should return issues and filter out PRs', async () => {
        mockFetchResponse([GITEA_FIXTURES.issue, GITEA_FIXTURES.issueWithPR]);

        const result = await client.listIssues('open', 100);

        expect(result).toHaveLength(1);
        expect(result[0].number).toBe(42);
        expect(result[0].title).toBe('Fix login bug');
      });

      it('should return empty array when API returns empty', async () => {
        mockFetchResponse([]);

        const result = await client.listIssues('open', 100);

        expect(result).toEqual([]);
      });

      it('should map issue fields correctly', async () => {
        mockFetchResponse([GITEA_FIXTURES.issue]);

        const result = await client.listIssues('open', 100);

        expect(result[0]).toEqual({
          number: 42,
          title: 'Fix login bug',
          state: 'open',
          author: {
            login: 'testuser',
            avatarUrl: 'https://gitea.example.com/avatars/1',
          },
          createdAt: '2024-01-15T10:00:00Z',
          labels: [{ name: 'bug', color: 'ff0000' }],
          url: 'https://gitea.example.com/testowner/testrepo/issues/42',
          body: 'Login form crashes on submit',
          assignees: [
            { login: 'devuser', avatarUrl: 'https://gitea.example.com/avatars/2' },
          ],
        });
      });

      it('should handle null assignees', async () => {
        const issueWithNullAssignees = { ...GITEA_FIXTURES.issue, assignees: null };
        mockFetchResponse([issueWithNullAssignees]);

        const result = await client.listIssues('open', 100);

        expect(result[0].assignees).toEqual([]);
      });

      it('should handle null body', async () => {
        const issueWithNullBody = { ...GITEA_FIXTURES.issue, body: null as any };
        mockFetchResponse([issueWithNullBody]);

        const result = await client.listIssues('open', 100);

        expect(result[0].body).toBe('');
      });
    });

    describe('listPRs', () => {
      it('should return mapped PRs', async () => {
        mockFetchResponse([GITEA_FIXTURES.pullRequest]);

        const result = await client.listPRs('open', 100);

        expect(result).toHaveLength(1);
        expect(result[0].number).toBe(10);
        expect(result[0].title).toBe('Add dark mode');
        expect(result[0].state).toBe('OPEN');
        expect(result[0].isDraft).toBe(false);
        expect(result[0].headRefName).toBe('feature/dark-mode');
        expect(result[0].mergeable).toBe('MERGEABLE');
      });

      it('should set merged PRs state to MERGED', async () => {
        mockFetchResponse([GITEA_FIXTURES.mergedPullRequest]);

        const result = await client.listPRs('closed', 100);

        expect(result[0].state).toBe('MERGED');
      });

      it('should map PR fields correctly', async () => {
        mockFetchResponse([GITEA_FIXTURES.pullRequest]);

        const result = await client.listPRs('open', 100);

        expect(result[0]).toEqual({
          number: 10,
          title: 'Add dark mode',
          state: 'OPEN',
          author: { login: 'testuser' },
          createdAt: '2024-01-20T10:00:00Z',
          labels: [{ name: 'enhancement', color: '00ff00' }],
          url: 'https://gitea.example.com/testowner/testrepo/pulls/10',
          isDraft: false,
          headRefName: 'feature/dark-mode',
          reviewDecision: null,
          mergeable: 'MERGEABLE',
          body: 'Adds dark mode support',
        });
      });

      it('should set mergeable to UNKNOWN when not mergeable', async () => {
        const nonMergeablePR = { ...GITEA_FIXTURES.pullRequest, mergeable: false };
        mockFetchResponse([nonMergeablePR]);

        const result = await client.listPRs('open', 100);

        expect(result[0].mergeable).toBe('UNKNOWN');
      });
    });

    describe('createPR', () => {
      it('should send correct POST body and return mapped PR', async () => {
        mockFetchResponse({
          number: 15,
          html_url: 'https://gitea.example.com/testowner/testrepo/pulls/15',
          state: 'open',
        });

        const result = await client.createPR('New Feature', 'Description', 'feature/new', 'main');

        expect(result).toEqual({
          number: 15,
          url: 'https://gitea.example.com/testowner/testrepo/pulls/15',
          state: 'OPEN',
        });

        // Verify POST body
        const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
        const body = JSON.parse((fetchCall[1] as RequestInit).body as string);
        expect(body).toEqual({
          title: 'New Feature',
          body: 'Description',
          head: 'feature/new',
          base: 'main',
        });
      });
    });

    describe('getPRByBranch', () => {
      it('should find PR by head branch name', async () => {
        mockFetchResponse([GITEA_FIXTURES.pullRequest]);

        const result = await client.getPRByBranch('feature/dark-mode');

        expect(result).toEqual({
          number: 10,
          url: 'https://gitea.example.com/testowner/testrepo/pulls/10',
          title: 'Add dark mode',
          state: 'OPEN',
        });
      });

      it('should return null when no matching PR', async () => {
        mockFetchResponse([GITEA_FIXTURES.pullRequest]);

        const result = await client.getPRByBranch('nonexistent-branch');

        expect(result).toBeNull();
      });
    });

    describe('getPR', () => {
      it('should return PR details with comments', async () => {
        // First call: GET PR details
        // Second call: issue comments
        // Third call: review comments
        mockFetchSequence([
          { data: GITEA_FIXTURES.pullRequest },
          { data: [GITEA_FIXTURES.comment] },
          { data: [GITEA_FIXTURES.reviewComment] },
        ]);

        const result = await client.getPR(10);

        expect(result).not.toBeNull();
        expect(result!.number).toBe(10);
        expect(result!.title).toBe('Add dark mode');
        expect(result!.comments).toHaveLength(1);
        expect(result!.comments[0].body).toBe('Looks good to me!');
        expect(result!.comments[0].isReviewComment).toBe(false);
        expect(result!.reviewComments).toHaveLength(1);
        expect(result!.reviewComments[0].body).toBe('Consider using a constant here');
        expect(result!.reviewComments[0].isReviewComment).toBe(true);
        expect(result!.reviewComments[0].path).toBe('src/main.ts');
      });

      it('should return null when PR fetch fails', async () => {
        vi.mocked(globalThis.fetch).mockRejectedValue(new Error('Network error'));

        const result = await client.getPR(999);

        expect(result).toBeNull();
      });
    });

    describe('listIssueComments', () => {
      it('should return mapped comments', async () => {
        mockFetchResponse([GITEA_FIXTURES.comment]);

        const result = await client.listIssueComments(42);

        expect(result.comments).toHaveLength(1);
        expect(result.comments[0]).toEqual({
          id: '100',
          author: {
            login: 'testuser',
            avatarUrl: 'https://gitea.example.com/avatars/1',
          },
          body: 'Looks good to me!',
          createdAt: '2024-01-15T12:00:00Z',
          updatedAt: '2024-01-15T12:00:00Z',
        });
        expect(result.totalCount).toBe(1);
        expect(result.hasNextPage).toBe(false);
      });

      it('should return empty result for no comments', async () => {
        mockFetchResponse([]);

        const result = await client.listIssueComments(42);

        expect(result.comments).toEqual([]);
        expect(result.totalCount).toBe(0);
      });
    });

    describe('API error handling', () => {
      it('should throw on 401 error', async () => {
        vi.mocked(globalThis.fetch).mockResolvedValue({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          text: async () => 'invalid token',
        } as Response);

        await expect(client.listIssues('open', 10)).rejects.toThrow('Gitea API error 401');
      });

      it('should throw on 500 error', async () => {
        vi.mocked(globalThis.fetch).mockResolvedValue({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          text: async () => 'server error',
        } as Response);

        await expect(client.listIssues('open', 10)).rejects.toThrow('Gitea API error 500');
      });
    });
  });
});
