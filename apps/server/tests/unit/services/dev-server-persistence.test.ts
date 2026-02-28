import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { spawn, execSync } from 'child_process';

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

import * as secureFs from '@/lib/secure-fs.js';
import net from 'net';

describe('DevServerService Persistence & Sync', () => {
  let testDataDir: string;
  let worktreeDir: string;
  let mockEmitter: EventEmitter;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    testDataDir = path.join(os.tmpdir(), `dev-server-persistence-test-${Date.now()}`);
    worktreeDir = path.join(os.tmpdir(), `dev-server-worktree-test-${Date.now()}`);
    await fs.mkdir(testDataDir, { recursive: true });
    await fs.mkdir(worktreeDir, { recursive: true });

    mockEmitter = new EventEmitter();

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
      await fs.rm(testDataDir, { recursive: true, force: true });
      await fs.rm(worktreeDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should emit dev-server:starting when startDevServer is called', async () => {
    const { getDevServerService } = await import('@/services/dev-server-service.js');
    const service = getDevServerService();
    await service.initialize(testDataDir, mockEmitter as any);

    const mockProcess = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mockProcess as any);

    const events: any[] = [];
    mockEmitter.on('dev-server:starting', (payload) => events.push(payload));

    await service.startDevServer(worktreeDir, worktreeDir);

    expect(events.length).toBe(1);
    expect(events[0].worktreePath).toBe(worktreeDir);
  });

  it('should prevent concurrent starts for the same worktree', async () => {
    const { getDevServerService } = await import('@/services/dev-server-service.js');
    const service = getDevServerService();
    await service.initialize(testDataDir, mockEmitter as any);

    // Delay spawn to simulate long starting time
    vi.mocked(spawn).mockImplementation(() => {
      const p = createMockProcess();
      // Don't return immediately, simulate some work
      return p as any;
    });

    // Start first one (don't await yet if we want to test concurrency)
    const promise1 = service.startDevServer(worktreeDir, worktreeDir);

    // Try to start second one immediately
    const result2 = await service.startDevServer(worktreeDir, worktreeDir);

    expect(result2.success).toBe(false);
    expect(result2.error).toContain('already starting');

    await promise1;
  });

  it('should persist state to dev-servers.json when started', async () => {
    const { getDevServerService } = await import('@/services/dev-server-service.js');
    const service = getDevServerService();
    await service.initialize(testDataDir, mockEmitter as any);

    const mockProcess = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mockProcess as any);

    await service.startDevServer(worktreeDir, worktreeDir);

    const statePath = path.join(testDataDir, 'dev-servers.json');
    const exists = await fs
      .access(statePath)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);

    const content = await fs.readFile(statePath, 'utf-8');
    const state = JSON.parse(content);
    expect(state.length).toBe(1);
    expect(state[0].worktreePath).toBe(worktreeDir);
  });

  it('should load state from dev-servers.json on initialize', async () => {
    // 1. Create a fake state file
    const persistedInfo = [
      {
        worktreePath: worktreeDir,
        allocatedPort: 3005,
        port: 3005,
        url: 'http://localhost:3005',
        startedAt: new Date().toISOString(),
        urlDetected: true,
        customCommand: 'npm run dev',
      },
    ];
    await fs.writeFile(path.join(testDataDir, 'dev-servers.json'), JSON.stringify(persistedInfo));

    // 2. Mock port as IN USE (so it re-attaches)
    const mockServer = new EventEmitter() as any;
    mockServer.listen = vi.fn().mockImplementation((port: number, host: string) => {
      // Fail to listen = port in use
      process.nextTick(() => mockServer.emit('error', new Error('EADDRINUSE')));
    });
    vi.mocked(net.createServer).mockReturnValue(mockServer);

    const { getDevServerService } = await import('@/services/dev-server-service.js');
    const service = getDevServerService();
    await service.initialize(testDataDir, mockEmitter as any);

    expect(service.isRunning(worktreeDir)).toBe(true);
    const info = service.getServerInfo(worktreeDir);
    expect(info?.port).toBe(3005);
  });

  it('should prune stale servers from state on initialize if port is available', async () => {
    // 1. Create a fake state file
    const persistedInfo = [
      {
        worktreePath: worktreeDir,
        allocatedPort: 3005,
        port: 3005,
        url: 'http://localhost:3005',
        startedAt: new Date().toISOString(),
        urlDetected: true,
      },
    ];
    await fs.writeFile(path.join(testDataDir, 'dev-servers.json'), JSON.stringify(persistedInfo));

    // 2. Mock port as AVAILABLE (so it prunes)
    const mockServer = new EventEmitter() as any;
    mockServer.listen = vi.fn().mockImplementation((port: number, host: string) => {
      process.nextTick(() => mockServer.emit('listening'));
    });
    mockServer.close = vi.fn();
    vi.mocked(net.createServer).mockReturnValue(mockServer);

    const { getDevServerService } = await import('@/services/dev-server-service.js');
    const service = getDevServerService();
    await service.initialize(testDataDir, mockEmitter as any);

    expect(service.isRunning(worktreeDir)).toBe(false);

    // Give it a moment to complete the pruning saveState
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Check if file was updated
    const content = await fs.readFile(path.join(testDataDir, 'dev-servers.json'), 'utf-8');
    const state = JSON.parse(content);
    expect(state.length).toBe(0);
  });

  it('should update persisted state when URL is detected', async () => {
    const { getDevServerService } = await import('@/services/dev-server-service.js');
    const service = getDevServerService();
    await service.initialize(testDataDir, mockEmitter as any);

    const mockProcess = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mockProcess as any);

    await service.startDevServer(worktreeDir, worktreeDir);

    // Simulate output with URL
    mockProcess.stdout.emit('data', Buffer.from('Local: http://localhost:5555/\n'));

    // Give it a moment to process and save (needs to wait for saveQueue)
    await new Promise((resolve) => setTimeout(resolve, 300));

    const content = await fs.readFile(path.join(testDataDir, 'dev-servers.json'), 'utf-8');
    const state = JSON.parse(content);
    expect(state[0].url).toBe('http://localhost:5555/');
    expect(state[0].port).toBe(5555);
    expect(state[0].urlDetected).toBe(true);
  });
});

// Helper to create a mock child process
function createMockProcess() {
  const mockProcess = new EventEmitter() as any;
  mockProcess.stdout = new EventEmitter();
  mockProcess.stderr = new EventEmitter();
  mockProcess.kill = vi.fn();
  mockProcess.killed = false;
  mockProcess.pid = 12345;
  mockProcess.unref = vi.fn();
  return mockProcess;
}
