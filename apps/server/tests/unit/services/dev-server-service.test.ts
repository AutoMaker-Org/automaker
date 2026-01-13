import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
  execSync: vi.fn(),
  execFile: vi.fn(),
}));

// Mock secure-fs
vi.mock('@/lib/secure-fs.js', () => ({
  access: vi.fn(),
}));

// Mock net
vi.mock('net', () => ({
  default: {
    createServer: vi.fn(),
  },
  createServer: vi.fn(),
}));

import { spawn, execSync } from 'child_process';
import * as secureFs from '@/lib/secure-fs.js';
import net from 'net';

describe('dev-server-service.ts', () => {
  let testDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    testDir = path.join(os.tmpdir(), `dev-server-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });

    // Default mock for secureFs.access - return resolved (file exists)
    vi.mocked(secureFs.access).mockResolvedValue(undefined);

    // Default mock for net.createServer - port available
    const mockServer = new EventEmitter() as any;
    mockServer.listen = vi.fn().mockImplementation((port: number, host: string) => {
      process.nextTick(() => mockServer.emit('listening'));
    });
    mockServer.close = vi.fn();
    vi.mocked(net.createServer).mockReturnValue(mockServer);

    // Default mock for execSync - no process on port
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('No process found');
    });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('getDevServerService', () => {
    it('should return a singleton instance', async () => {
      const { getDevServerService } = await import('@/services/dev-server-service.js');

      const instance1 = getDevServerService();
      const instance2 = getDevServerService();

      expect(instance1).toBe(instance2);
    });
  });

  describe('startDevServer', () => {
    it('should return error if worktree path does not exist', async () => {
      vi.mocked(secureFs.access).mockRejectedValueOnce(new Error('File not found'));

      const { getDevServerService } = await import('@/services/dev-server-service.js');
      const service = getDevServerService();

      const result = await service.startDevServer('/project', '/nonexistent/worktree');

      expect(result.success).toBe(false);
      expect(result.error).toContain('does not exist');
    });

    it('should return error if no package.json found', async () => {
      vi.mocked(secureFs.access).mockImplementation(async (p: any) => {
        if (typeof p === 'string' && p.includes('package.json')) {
          throw new Error('File not found');
        }
        return undefined;
      });

      const { getDevServerService } = await import('@/services/dev-server-service.js');
      const service = getDevServerService();

      const result = await service.startDevServer(testDir, testDir);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No package.json found');
    });

    it('should detect npm as package manager with package-lock.json', async () => {
      vi.mocked(secureFs.access).mockImplementation(async (p: any) => {
        const pathStr = typeof p === 'string' ? p : '';
        if (pathStr.includes('bun.lockb')) throw new Error('Not found');
        if (pathStr.includes('pnpm-lock.yaml')) throw new Error('Not found');
        if (pathStr.includes('yarn.lock')) throw new Error('Not found');
        if (pathStr.includes('package-lock.json')) return undefined;
        if (pathStr.includes('package.json')) return undefined;
        return undefined;
      });

      const mockProcess = createMockProcess();
      vi.mocked(spawn).mockReturnValue(mockProcess as any);

      const { getDevServerService } = await import('@/services/dev-server-service.js');
      const service = getDevServerService();

      await service.startDevServer(testDir, testDir);

      expect(spawn).toHaveBeenCalledWith('npm', ['run', 'dev'], expect.any(Object));
    });

    it('should detect yarn as package manager with yarn.lock', async () => {
      vi.mocked(secureFs.access).mockImplementation(async (p: any) => {
        const pathStr = typeof p === 'string' ? p : '';
        if (pathStr.includes('bun.lockb')) throw new Error('Not found');
        if (pathStr.includes('pnpm-lock.yaml')) throw new Error('Not found');
        if (pathStr.includes('yarn.lock')) return undefined;
        if (pathStr.includes('package.json')) return undefined;
        return undefined;
      });

      const mockProcess = createMockProcess();
      vi.mocked(spawn).mockReturnValue(mockProcess as any);

      const { getDevServerService } = await import('@/services/dev-server-service.js');
      const service = getDevServerService();

      await service.startDevServer(testDir, testDir);

      expect(spawn).toHaveBeenCalledWith('yarn', ['dev'], expect.any(Object));
    });

    it('should detect pnpm as package manager with pnpm-lock.yaml', async () => {
      vi.mocked(secureFs.access).mockImplementation(async (p: any) => {
        const pathStr = typeof p === 'string' ? p : '';
        if (pathStr.includes('bun.lockb')) throw new Error('Not found');
        if (pathStr.includes('pnpm-lock.yaml')) return undefined;
        if (pathStr.includes('package.json')) return undefined;
        return undefined;
      });

      const mockProcess = createMockProcess();
      vi.mocked(spawn).mockReturnValue(mockProcess as any);

      const { getDevServerService } = await import('@/services/dev-server-service.js');
      const service = getDevServerService();

      await service.startDevServer(testDir, testDir);

      expect(spawn).toHaveBeenCalledWith('pnpm', ['run', 'dev'], expect.any(Object));
    });

    it('should detect bun as package manager with bun.lockb', async () => {
      vi.mocked(secureFs.access).mockImplementation(async (p: any) => {
        const pathStr = typeof p === 'string' ? p : '';
        if (pathStr.includes('bun.lockb')) return undefined;
        if (pathStr.includes('package.json')) return undefined;
        return undefined;
      });

      const mockProcess = createMockProcess();
      vi.mocked(spawn).mockReturnValue(mockProcess as any);

      const { getDevServerService } = await import('@/services/dev-server-service.js');
      const service = getDevServerService();

      await service.startDevServer(testDir, testDir);

      expect(spawn).toHaveBeenCalledWith('bun', ['run', 'dev'], expect.any(Object));
    });

    it('should return existing server info if already running', async () => {
      vi.mocked(secureFs.access).mockResolvedValue(undefined);

      const mockProcess = createMockProcess();
      vi.mocked(spawn).mockReturnValue(mockProcess as any);

      const { getDevServerService } = await import('@/services/dev-server-service.js');
      const service = getDevServerService();

      // Start first server
      const result1 = await service.startDevServer(testDir, testDir);
      expect(result1.success).toBe(true);

      // Try to start again - should return existing
      const result2 = await service.startDevServer(testDir, testDir);
      expect(result2.success).toBe(true);
      expect(result2.result?.message).toContain('already running');
    });

    it('should start dev server successfully', async () => {
      vi.mocked(secureFs.access).mockResolvedValue(undefined);

      const mockProcess = createMockProcess();
      vi.mocked(spawn).mockReturnValue(mockProcess as any);

      const { getDevServerService } = await import('@/services/dev-server-service.js');
      const service = getDevServerService();

      const result = await service.startDevServer(testDir, testDir);

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();
      expect(result.result?.port).toBeGreaterThanOrEqual(3001);
      expect(result.result?.url).toContain('http://localhost:');
    });
  });

  describe('stopDevServer', () => {
    it('should return success if server not found', async () => {
      const { getDevServerService } = await import('@/services/dev-server-service.js');
      const service = getDevServerService();

      const result = await service.stopDevServer('/nonexistent/path');

      expect(result.success).toBe(true);
      expect(result.result?.message).toContain('already stopped');
    });

    it('should stop a running server', async () => {
      vi.mocked(secureFs.access).mockResolvedValue(undefined);

      const mockProcess = createMockProcess();
      vi.mocked(spawn).mockReturnValue(mockProcess as any);

      const { getDevServerService } = await import('@/services/dev-server-service.js');
      const service = getDevServerService();

      // Start server
      await service.startDevServer(testDir, testDir);

      // Stop server
      const result = await service.stopDevServer(testDir);

      expect(result.success).toBe(true);
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
    });
  });

  describe('listDevServers', () => {
    it('should return empty list when no servers running', async () => {
      const { getDevServerService } = await import('@/services/dev-server-service.js');
      const service = getDevServerService();

      const result = service.listDevServers();

      expect(result.success).toBe(true);
      expect(result.result.servers).toEqual([]);
    });

    it('should list running servers', async () => {
      vi.mocked(secureFs.access).mockResolvedValue(undefined);

      const mockProcess = createMockProcess();
      vi.mocked(spawn).mockReturnValue(mockProcess as any);

      const { getDevServerService } = await import('@/services/dev-server-service.js');
      const service = getDevServerService();

      await service.startDevServer(testDir, testDir);

      const result = service.listDevServers();

      expect(result.success).toBe(true);
      expect(result.result.servers.length).toBeGreaterThanOrEqual(1);
      expect(result.result.servers[0].worktreePath).toBe(testDir);
    });
  });

  describe('isRunning', () => {
    it('should return false for non-running server', async () => {
      const { getDevServerService } = await import('@/services/dev-server-service.js');
      const service = getDevServerService();

      expect(service.isRunning('/some/path')).toBe(false);
    });

    it('should return true for running server', async () => {
      vi.mocked(secureFs.access).mockResolvedValue(undefined);

      const mockProcess = createMockProcess();
      vi.mocked(spawn).mockReturnValue(mockProcess as any);

      const { getDevServerService } = await import('@/services/dev-server-service.js');
      const service = getDevServerService();

      await service.startDevServer(testDir, testDir);

      expect(service.isRunning(testDir)).toBe(true);
    });
  });

  describe('getServerInfo', () => {
    it('should return undefined for non-running server', async () => {
      const { getDevServerService } = await import('@/services/dev-server-service.js');
      const service = getDevServerService();

      expect(service.getServerInfo('/some/path')).toBeUndefined();
    });

    it('should return info for running server', async () => {
      vi.mocked(secureFs.access).mockResolvedValue(undefined);

      const mockProcess = createMockProcess();
      vi.mocked(spawn).mockReturnValue(mockProcess as any);

      const { getDevServerService } = await import('@/services/dev-server-service.js');
      const service = getDevServerService();

      await service.startDevServer(testDir, testDir);

      const info = service.getServerInfo(testDir);
      expect(info).toBeDefined();
      expect(info?.worktreePath).toBe(testDir);
      expect(info?.port).toBeGreaterThanOrEqual(3001);
    });
  });

  describe('getAllocatedPorts', () => {
    it('should return allocated ports', async () => {
      vi.mocked(secureFs.access).mockResolvedValue(undefined);

      const mockProcess = createMockProcess();
      vi.mocked(spawn).mockReturnValue(mockProcess as any);

      const { getDevServerService } = await import('@/services/dev-server-service.js');
      const service = getDevServerService();

      await service.startDevServer(testDir, testDir);

      const ports = service.getAllocatedPorts();
      expect(ports.length).toBeGreaterThanOrEqual(1);
      expect(ports[0]).toBeGreaterThanOrEqual(3001);
    });
  });

  describe('stopAll', () => {
    it('should stop all running servers', async () => {
      vi.mocked(secureFs.access).mockResolvedValue(undefined);

      const mockProcess = createMockProcess();
      vi.mocked(spawn).mockReturnValue(mockProcess as any);

      const { getDevServerService } = await import('@/services/dev-server-service.js');
      const service = getDevServerService();

      await service.startDevServer(testDir, testDir);

      await service.stopAll();

      expect(service.listDevServers().result.servers).toHaveLength(0);
    });
  });
});

// Helper to create a mock child process
function createMockProcess() {
  const mockProcess = new EventEmitter() as any;
  mockProcess.stdout = new EventEmitter();
  mockProcess.stderr = new EventEmitter();
  mockProcess.kill = vi.fn();
  mockProcess.killed = false;

  // Don't exit immediately - let the test control the lifecycle
  return mockProcess;
}
