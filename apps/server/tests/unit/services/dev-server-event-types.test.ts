import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { spawn } from 'child_process';

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

describe('DevServerService Event Types', () => {
  let testDataDir: string;
  let worktreeDir: string;
  let mockEmitter: EventEmitter;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    testDataDir = path.join(os.tmpdir(), `dev-server-events-test-${Date.now()}`);
    worktreeDir = path.join(os.tmpdir(), `dev-server-worktree-events-test-${Date.now()}`);
    await fs.mkdir(testDataDir, { recursive: true });
    await fs.mkdir(worktreeDir, { recursive: true });

    mockEmitter = new EventEmitter();

    vi.mocked(secureFs.access).mockResolvedValue(undefined);

    const mockServer = new EventEmitter() as any;
    mockServer.listen = vi.fn().mockImplementation((port: number, host: string) => {
      process.nextTick(() => mockServer.emit('listening'));
    });
    mockServer.close = vi.fn();
    vi.mocked(net.createServer).mockReturnValue(mockServer);
  });

  afterEach(async () => {
    try {
      await fs.rm(testDataDir, { recursive: true, force: true });
      await fs.rm(worktreeDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should emit all required event types during dev server lifecycle', async () => {
    const { getDevServerService } = await import('@/services/dev-server-service.js');
    const service = getDevServerService();
    await service.initialize(testDataDir, mockEmitter as any);

    const mockProcess = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mockProcess as any);

    const emittedEvents: Record<string, any[]> = {
      'dev-server:starting': [],
      'dev-server:started': [],
      'dev-server:url-detected': [],
      'dev-server:output': [],
      'dev-server:stopped': [],
    };

    Object.keys(emittedEvents).forEach((type) => {
      mockEmitter.on(type, (payload) => emittedEvents[type].push(payload));
    });

    // 1. Starting & Started
    await service.startDevServer(worktreeDir, worktreeDir);
    expect(emittedEvents['dev-server:starting'].length).toBe(1);
    expect(emittedEvents['dev-server:started'].length).toBe(1);

    // 2. Output & URL Detected
    mockProcess.stdout.emit('data', Buffer.from('Local: http://localhost:5173/\n'));
    // Throttled output needs a bit of time
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(emittedEvents['dev-server:output'].length).toBeGreaterThanOrEqual(1);
    expect(emittedEvents['dev-server:url-detected'].length).toBe(1);
    expect(emittedEvents['dev-server:url-detected'][0].url).toBe('http://localhost:5173/');

    // 3. Stopped
    await service.stopDevServer(worktreeDir);
    expect(emittedEvents['dev-server:stopped'].length).toBe(1);
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
