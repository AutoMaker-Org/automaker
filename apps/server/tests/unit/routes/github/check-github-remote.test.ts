import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockExpressContext } from '../../../utils/mocks.js';
import { createMockForgeInfo } from '../../../utils/gitea-mocks.js';

// Mock forge-detector module
vi.mock('@/lib/forge-detector.js', () => ({
  detectForgeCached: vi.fn(),
}));

// Mock child_process
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

import { exec } from 'child_process';
import { detectForgeCached } from '@/lib/forge-detector.js';
import {
  createCheckGitHubRemoteHandler,
  checkGitHubRemote,
} from '@/routes/github/routes/check-github-remote.js';

function mockExecAsync(stdout: string) {
  vi.mocked(exec).mockImplementation((_cmd: any, _opts: any, callback?: any) => {
    const cb = typeof _opts === 'function' ? _opts : callback;
    if (cb) {
      cb(null, { stdout, stderr: '' });
    }
    return {} as any;
  });
}

function mockExecAsyncError() {
  vi.mocked(exec).mockImplementation((_cmd: any, _opts: any, callback?: any) => {
    const cb = typeof _opts === 'function' ? _opts : callback;
    if (cb) {
      cb(new Error('command failed'), { stdout: '', stderr: '' });
    }
    return {} as any;
  });
}

describe('check-github-remote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkGitHubRemote', () => {
    it('should detect GitHub remote', async () => {
      vi.mocked(detectForgeCached).mockResolvedValue(createMockForgeInfo('github'));
      // Mock gh repo view for enrichment
      mockExecAsync(JSON.stringify({ name: 'testrepo', owner: { login: 'testowner' } }));

      const result = await checkGitHubRemote('/test/project');

      expect(result.hasGitHubRemote).toBe(true);
      expect(result.forgeType).toBe('github');
      expect(result.hasRemote).toBe(true);
      expect(result.owner).toBe('testowner');
      expect(result.repo).toBe('testrepo');
    });

    it('should detect Gitea remote', async () => {
      vi.mocked(detectForgeCached).mockResolvedValue(createMockForgeInfo('gitea'));

      const result = await checkGitHubRemote('/test/project');

      expect(result.hasGitHubRemote).toBe(false);
      expect(result.hasRemote).toBe(true);
      expect(result.forgeType).toBe('gitea');
      expect(result.baseUrl).toBe('https://gitea.example.com');
      expect(result.owner).toBe('testowner');
      expect(result.repo).toBe('testrepo');
    });

    it('should return unknown when no remote detected', async () => {
      vi.mocked(detectForgeCached).mockResolvedValue(createMockForgeInfo('unknown'));

      const result = await checkGitHubRemote('/test/project');

      expect(result.hasGitHubRemote).toBe(false);
      expect(result.hasRemote).toBe(false);
      expect(result.forgeType).toBe('unknown');
    });

    it('should enrich GitHub result with gh CLI data', async () => {
      vi.mocked(detectForgeCached).mockResolvedValue({
        ...createMockForgeInfo('github'),
        owner: 'git-owner',
        repo: 'git-repo',
      });
      mockExecAsync(JSON.stringify({ name: 'gh-repo', owner: { login: 'gh-owner' } }));

      const result = await checkGitHubRemote('/test/project');

      // gh CLI takes precedence for owner/repo
      expect(result.owner).toBe('gh-owner');
      expect(result.repo).toBe('gh-repo');
    });

    it('should still work when gh CLI fails', async () => {
      vi.mocked(detectForgeCached).mockResolvedValue(createMockForgeInfo('github'));
      mockExecAsyncError();

      const result = await checkGitHubRemote('/test/project');

      expect(result.hasGitHubRemote).toBe(true);
      expect(result.forgeType).toBe('github');
      // Falls back to forge-detector values
      expect(result.owner).toBe('testowner');
      expect(result.repo).toBe('testrepo');
    });
  });

  describe('createCheckGitHubRemoteHandler', () => {
    it('should return 400 if projectPath is missing', async () => {
      const { req, res } = createMockExpressContext();
      req.body = {};

      const handler = createCheckGitHubRemoteHandler();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'projectPath is required',
        })
      );
    });

    it('should return forge info for valid request', async () => {
      vi.mocked(detectForgeCached).mockResolvedValue(createMockForgeInfo('gitea'));

      const { req, res } = createMockExpressContext();
      req.body = { projectPath: '/test/project' };

      const handler = createCheckGitHubRemoteHandler();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          forgeType: 'gitea',
          hasRemote: true,
        })
      );
    });
  });
});
