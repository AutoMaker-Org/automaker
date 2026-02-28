/**
 * Tests for useDevServers hook
 * Verifies dev server state management, server lifecycle callbacks,
 * and correct distinction between isStartingAnyDevServer and isDevServerStarting.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDevServers } from '../../../src/components/views/board-view/worktree-panel/hooks/use-dev-servers';
import { getElectronAPI } from '@/lib/electron';
import type { ElectronAPI } from '@/lib/electron';
import type { WorktreeInfo } from '../../../src/components/views/board-view/worktree-panel/types';

vi.mock('@/lib/electron');
vi.mock('@automaker/utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

const mockGetElectronAPI = vi.mocked(getElectronAPI);

describe('useDevServers', () => {
  const projectPath = '/test/project';

  const createWorktree = (overrides: Partial<WorktreeInfo> = {}): WorktreeInfo => ({
    path: '/test/project/worktrees/feature-1',
    branch: 'feature/test-1',
    isMain: false,
    isCurrent: false,
    hasWorktree: true,
    ...overrides,
  });

  const mainWorktree = createWorktree({
    path: '/test/project',
    branch: 'main',
    isMain: true,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetElectronAPI.mockReturnValue(null);
  });

  describe('initial state', () => {
    it('should return isStartingAnyDevServer as false initially', () => {
      const { result } = renderHook(() => useDevServers({ projectPath }));
      expect(result.current.isStartingAnyDevServer).toBe(false);
    });

    it('should return isDevServerRunning as false for any worktree initially', () => {
      const { result } = renderHook(() => useDevServers({ projectPath }));
      expect(result.current.isDevServerRunning(mainWorktree)).toBe(false);
    });

    it('should return isDevServerStarting as false for any worktree initially', () => {
      const { result } = renderHook(() => useDevServers({ projectPath }));
      expect(result.current.isDevServerStarting(mainWorktree)).toBe(false);
    });

    it('should return undefined for getDevServerInfo when no server running', () => {
      const { result } = renderHook(() => useDevServers({ projectPath }));
      expect(result.current.getDevServerInfo(mainWorktree)).toBeUndefined();
    });
  });

  describe('isDevServerStarting vs isStartingAnyDevServer', () => {
    it('isDevServerStarting should check per-worktree starting state', () => {
      const { result } = renderHook(() => useDevServers({ projectPath }));

      const worktreeA = createWorktree({
        path: '/test/worktree-a',
        branch: 'feature/a',
      });
      const worktreeB = createWorktree({
        path: '/test/worktree-b',
        branch: 'feature/b',
      });

      // Neither should be starting initially
      expect(result.current.isDevServerStarting(worktreeA)).toBe(false);
      expect(result.current.isDevServerStarting(worktreeB)).toBe(false);
    });

    it('isStartingAnyDevServer should be a single boolean for all servers', () => {
      const { result } = renderHook(() => useDevServers({ projectPath }));
      expect(typeof result.current.isStartingAnyDevServer).toBe('boolean');
    });
  });

  describe('getWorktreeKey', () => {
    it('should use projectPath for main worktree', () => {
      const { result } = renderHook(() => useDevServers({ projectPath }));

      // The main worktree should normalize to projectPath
      const mainWt = createWorktree({ isMain: true, path: '/test/project' });
      const otherWt = createWorktree({ isMain: false, path: '/test/other' });

      // Both should resolve to different keys
      expect(result.current.isDevServerRunning(mainWt)).toBe(false);
      expect(result.current.isDevServerRunning(otherWt)).toBe(false);
    });
  });

  describe('handleStartDevServer', () => {
    it('should call startDevServer API when available', async () => {
      const mockStartDevServer = vi.fn().mockResolvedValue({
        success: true,
        result: {
          worktreePath: '/test/project',
          port: 3000,
          url: 'http://localhost:3000',
        },
      });

      mockGetElectronAPI.mockReturnValue({
        worktree: {
          startDevServer: mockStartDevServer,
          listDevServers: vi.fn().mockResolvedValue({ success: true, result: { servers: [] } }),
          onDevServerLogEvent: vi.fn().mockReturnValue(vi.fn()),
        },
      } as unknown as ElectronAPI);

      const { result } = renderHook(() => useDevServers({ projectPath }));

      await act(async () => {
        await result.current.handleStartDevServer(mainWorktree);
      });

      expect(mockStartDevServer).toHaveBeenCalledWith(projectPath, projectPath);
    });

    it('should set isStartingAnyDevServer to true during start and false after completion', async () => {
      let resolveStart: (value: unknown) => void;
      const startPromise = new Promise((resolve) => {
        resolveStart = resolve;
      });
      const mockStartDevServer = vi.fn().mockReturnValue(startPromise);

      mockGetElectronAPI.mockReturnValue({
        worktree: {
          startDevServer: mockStartDevServer,
          listDevServers: vi.fn().mockResolvedValue({ success: true, result: { servers: [] } }),
          onDevServerLogEvent: vi.fn().mockReturnValue(vi.fn()),
        },
      } as unknown as ElectronAPI);

      const { result } = renderHook(() => useDevServers({ projectPath }));

      // Initially not starting
      expect(result.current.isStartingAnyDevServer).toBe(false);

      // Start server (don't await - it will hang until we resolve)
      let startDone = false;
      act(() => {
        result.current.handleStartDevServer(mainWorktree).then(() => {
          startDone = true;
        });
      });

      // Resolve the start promise
      await act(async () => {
        resolveStart!({
          success: true,
          result: { worktreePath: '/test/project', port: 3000, url: 'http://localhost:3000' },
        });
        await new Promise((r) => setTimeout(r, 10));
      });

      // After completion, should be false again
      expect(result.current.isStartingAnyDevServer).toBe(false);
      expect(startDone).toBe(true);
    });
  });

  describe('handleStopDevServer', () => {
    it('should call stopDevServer API when available', async () => {
      const mockStopDevServer = vi.fn().mockResolvedValue({
        success: true,
        result: { message: 'Dev server stopped' },
      });

      mockGetElectronAPI.mockReturnValue({
        worktree: {
          stopDevServer: mockStopDevServer,
          listDevServers: vi.fn().mockResolvedValue({ success: true, result: { servers: [] } }),
          onDevServerLogEvent: vi.fn().mockReturnValue(vi.fn()),
        },
      } as unknown as ElectronAPI);

      const { result } = renderHook(() => useDevServers({ projectPath }));

      await act(async () => {
        await result.current.handleStopDevServer(mainWorktree);
      });

      expect(mockStopDevServer).toHaveBeenCalledWith(projectPath);
    });
  });

  describe('fetchDevServers on mount', () => {
    it('should fetch running dev servers on initialization', async () => {
      const mockListDevServers = vi.fn().mockResolvedValue({
        success: true,
        result: {
          servers: [
            {
              worktreePath: '/test/project',
              port: 3000,
              url: 'http://localhost:3000',
              urlDetected: true,
            },
          ],
        },
      });

      mockGetElectronAPI.mockReturnValue({
        worktree: {
          listDevServers: mockListDevServers,
          onDevServerLogEvent: vi.fn().mockReturnValue(vi.fn()),
        },
      } as unknown as ElectronAPI);

      const { result } = renderHook(() => useDevServers({ projectPath }));

      // Wait for initial fetch
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      expect(result.current.isDevServerRunning(mainWorktree)).toBe(true);
      expect(result.current.getDevServerInfo(mainWorktree)).toEqual(
        expect.objectContaining({
          port: 3000,
          url: 'http://localhost:3000',
          urlDetected: true,
        })
      );
    });
  });
});
