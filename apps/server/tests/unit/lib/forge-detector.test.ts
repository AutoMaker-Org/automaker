import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock child_process exec before importing the module under test
vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

// Mock @automaker/utils to suppress logger output
vi.mock('@automaker/utils', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { exec } from 'child_process';
import { promisify } from 'util';

// We need to access the module's internal cache, so we dynamically import after mocking
let detectForge: typeof import('@/lib/forge-detector.js').detectForge;
let detectForgeCached: typeof import('@/lib/forge-detector.js').detectForgeCached;

// Helper to mock execAsync behavior
function mockExecAsync(stdout: string) {
  vi.mocked(exec).mockImplementation((_cmd: any, _opts: any, callback?: any) => {
    const cb = typeof _opts === 'function' ? _opts : callback;
    if (cb) {
      cb(null, { stdout, stderr: '' });
    }
    return {} as any;
  });
}

function mockExecAsyncError(error: Error) {
  vi.mocked(exec).mockImplementation((_cmd: any, _opts: any, callback?: any) => {
    const cb = typeof _opts === 'function' ? _opts : callback;
    if (cb) {
      cb(error, { stdout: '', stderr: error.message });
    }
    return {} as any;
  });
}

describe('forge-detector', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset module to clear cache between tests
    vi.resetModules();

    // Re-mock after resetModules
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

    const mod = await import('@/lib/forge-detector.js');
    detectForge = mod.detectForge;
    detectForgeCached = mod.detectForgeCached;

    // Reset fetch mock
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('detectForge', () => {
    it('should detect GitHub HTTPS remote', async () => {
      mockExecAsync('https://github.com/owner/repo.git\n');

      const result = await detectForge('/test/project');

      expect(result.type).toBe('github');
      expect(result.owner).toBe('owner');
      expect(result.repo).toBe('repo');
      expect(result.baseUrl).toBe('https://github.com');
    });

    it('should detect GitHub SSH remote', async () => {
      mockExecAsync('git@github.com:owner/repo.git\n');

      const result = await detectForge('/test/project');

      expect(result.type).toBe('github');
      expect(result.owner).toBe('owner');
      expect(result.repo).toBe('repo');
    });

    it('should detect GitHub URL without .git suffix', async () => {
      mockExecAsync('https://github.com/owner/repo\n');

      const result = await detectForge('/test/project');

      expect(result.type).toBe('github');
      expect(result.owner).toBe('owner');
      expect(result.repo).toBe('repo');
    });

    it('should detect Gitea HTTPS remote when version probe succeeds', async () => {
      mockExecAsync('https://gitea.example.com/owner/repo.git\n');

      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ version: '1.21.0' }),
      } as Response);

      const result = await detectForge('/test/project');

      expect(result.type).toBe('gitea');
      expect(result.owner).toBe('owner');
      expect(result.repo).toBe('repo');
      expect(result.baseUrl).toBe('https://gitea.example.com');
    });

    it('should detect Gitea SSH remote when version probe succeeds', async () => {
      mockExecAsync('git@gitea.example.com:owner/repo\n');

      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ version: '1.21.0' }),
      } as Response);

      const result = await detectForge('/test/project');

      expect(result.type).toBe('gitea');
      expect(result.owner).toBe('owner');
      expect(result.repo).toBe('repo');
      expect(result.baseUrl).toBe('https://gitea.example.com');
    });

    it('should return unknown when version probe returns 404', async () => {
      mockExecAsync('https://gitlab.example.com/owner/repo.git\n');

      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: false,
        status: 404,
      } as Response);

      const result = await detectForge('/test/project');

      expect(result.type).toBe('unknown');
      expect(result.owner).toBe('owner');
      expect(result.repo).toBe('repo');
    });

    it('should return unknown when version probe times out', async () => {
      mockExecAsync('https://example.com/owner/repo.git\n');

      vi.mocked(globalThis.fetch).mockRejectedValue(new Error('AbortError'));

      const result = await detectForge('/test/project');

      expect(result.type).toBe('unknown');
    });

    it('should return unknown when version probe returns invalid JSON', async () => {
      mockExecAsync('https://example.com/owner/repo.git\n');

      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ name: 'not-gitea' }), // no version field
      } as Response);

      const result = await detectForge('/test/project');

      expect(result.type).toBe('unknown');
    });

    it('should return unknown with null fields when no remote configured', async () => {
      mockExecAsyncError(new Error('fatal: No such remote'));

      const result = await detectForge('/test/project');

      expect(result.type).toBe('unknown');
      expect(result.baseUrl).toBeNull();
      expect(result.owner).toBeNull();
      expect(result.repo).toBeNull();
      expect(result.remoteUrl).toBeNull();
    });

    it('should return unknown for malformed URL', async () => {
      mockExecAsync('not-a-valid-url\n');

      const result = await detectForge('/test/project');

      expect(result.type).toBe('unknown');
    });

    it('should strip .git suffix from GitHub repo name', async () => {
      mockExecAsync('https://github.com/owner/my-repo.git\n');

      const result = await detectForge('/test/project');

      expect(result.repo).toBe('my-repo');
    });

    it('should set remoteUrl from git output', async () => {
      mockExecAsync('https://github.com/owner/repo.git\n');

      const result = await detectForge('/test/project');

      expect(result.remoteUrl).toBe('https://github.com/owner/repo.git');
    });
  });

  describe('detectForgeCached', () => {
    it('should return cached result on second call within TTL', async () => {
      mockExecAsync('https://github.com/owner/repo.git\n');

      const result1 = await detectForgeCached('/test/project');
      expect(result1.type).toBe('github');

      // exec should have been called once
      const callCount = vi.mocked(exec).mock.calls.length;

      const result2 = await detectForgeCached('/test/project');
      expect(result2.type).toBe('github');

      // exec should NOT have been called again (cached)
      expect(vi.mocked(exec).mock.calls.length).toBe(callCount);
    });

    it('should re-detect after cache expires', async () => {
      vi.useFakeTimers();

      mockExecAsync('https://github.com/owner/repo.git\n');

      await detectForgeCached('/test/project');
      const callCountAfterFirst = vi.mocked(exec).mock.calls.length;

      // Advance time past cache TTL (60s)
      vi.advanceTimersByTime(61_000);

      await detectForgeCached('/test/project');

      // exec should have been called again after cache expiry
      expect(vi.mocked(exec).mock.calls.length).toBeGreaterThan(callCountAfterFirst);

      vi.useRealTimers();
    });

    it('should cache different project paths independently', async () => {
      let callIndex = 0;
      const responses = [
        'https://github.com/owner/repo1.git\n',
        'https://gitea.example.com/owner/repo2.git\n',
      ];

      vi.mocked(exec).mockImplementation((_cmd: any, _opts: any, callback?: any) => {
        const cb = typeof _opts === 'function' ? _opts : callback;
        if (cb) {
          cb(null, { stdout: responses[callIndex++] || responses[0], stderr: '' });
        }
        return {} as any;
      });

      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ version: '1.21.0' }),
      } as Response);

      const result1 = await detectForgeCached('/project1');
      const result2 = await detectForgeCached('/project2');

      expect(result1.type).toBe('github');
      expect(result2.type).toBe('gitea');
    });
  });
});
