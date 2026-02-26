/**
 * Unit tests for useTestRunners hook - dependency array changes
 *
 * The lint fix removed unnecessary deps (activeSessionByWorktree, sessions)
 * from useMemo for activeSession and isRunning. These tests verify that the
 * store-level getActiveSession and isWorktreeRunning functions work correctly
 * since they are the actual deps used in the hook's useMemo.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock the electron API
vi.mock('@/lib/electron', () => ({
  getElectronAPI: vi.fn(() => ({
    worktree: {
      onTestRunnerEvent: vi.fn(() => vi.fn()),
      getTestLogs: vi.fn(() => Promise.resolve({ success: false })),
    },
  })),
}));

// Mock the logger
vi.mock('@automaker/utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { useTestRunners } from '../../../src/hooks/use-test-runners';
import { useTestRunnersStore } from '../../../src/store/test-runners-store';

describe('useTestRunners - dependency changes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the store state by clearing all sessions
    const store = useTestRunnersStore.getState();
    // Clear any existing sessions
    Object.keys(store.sessions).forEach((id) => {
      store.removeSession(id);
    });
  });

  it('should return null activeSession when no worktreePath', () => {
    const { result } = renderHook(() => useTestRunners());

    expect(result.current.activeSession).toBeNull();
    expect(result.current.isRunning).toBe(false);
  });

  it('should return null activeSession when worktreePath has no active session', () => {
    const { result } = renderHook(() => useTestRunners('/test/worktree'));

    expect(result.current.activeSession).toBeNull();
    expect(result.current.isRunning).toBe(false);
  });

  it('should return empty sessions for worktree without sessions', () => {
    const { result } = renderHook(() => useTestRunners('/test/worktree'));

    expect(result.current.sessions).toEqual([]);
  });

  it('should verify store getActiveSession works correctly', () => {
    // This verifies the store-level function that the hook's useMemo depends on
    const store = useTestRunnersStore.getState();

    // No sessions initially
    expect(store.getActiveSession('/test/worktree')).toBeNull();

    // Add a session
    store.startSession({
      sessionId: 'test-session-1',
      worktreePath: '/test/worktree',
      command: 'npm test',
      status: 'running',
      startedAt: Date.now(),
    });

    // Should find it
    const active = useTestRunnersStore.getState().getActiveSession('/test/worktree');
    expect(active).not.toBeNull();
    expect(active?.sessionId).toBe('test-session-1');
    expect(active?.status).toBe('running');
  });

  it('should verify store isWorktreeRunning works correctly', () => {
    const store = useTestRunnersStore.getState();

    // Not running initially
    expect(store.isWorktreeRunning('/test/worktree')).toBe(false);

    // Start a session
    store.startSession({
      sessionId: 'test-session-2',
      worktreePath: '/test/worktree',
      command: 'npm test',
      status: 'running',
      startedAt: Date.now(),
    });

    expect(useTestRunnersStore.getState().isWorktreeRunning('/test/worktree')).toBe(true);

    // Complete the session
    useTestRunnersStore.getState().completeSession('test-session-2', 'passed', 0, 5000);

    expect(useTestRunnersStore.getState().isWorktreeRunning('/test/worktree')).toBe(false);
  });

  it('should not return sessions from different worktrees via store', () => {
    const store = useTestRunnersStore.getState();

    // Add session for worktree-b
    store.startSession({
      sessionId: 'test-session-b',
      worktreePath: '/test/worktree-b',
      command: 'npm test',
      status: 'running',
      startedAt: Date.now(),
    });

    // worktree-a should have no active session
    const active = useTestRunnersStore.getState().getActiveSession('/test/worktree-a');
    expect(active).toBeNull();
    expect(useTestRunnersStore.getState().isWorktreeRunning('/test/worktree-a')).toBe(false);

    // worktree-b should have the session
    const activeB = useTestRunnersStore.getState().getActiveSession('/test/worktree-b');
    expect(activeB).not.toBeNull();
    expect(activeB?.sessionId).toBe('test-session-b');
  });

  it('should return error when starting without worktreePath', async () => {
    const { result } = renderHook(() => useTestRunners());

    let startResult: { success: boolean; error?: string };
    await act(async () => {
      startResult = await result.current.start();
    });

    expect(startResult!.success).toBe(false);
    expect(startResult!.error).toBe('No worktree path provided');
  });

  it('should start a test run via the start action', async () => {
    const mockStartTests = vi.fn().mockResolvedValue({
      success: true,
      result: { sessionId: 'new-session' },
    });

    const { getElectronAPI } = await import('@/lib/electron');
    vi.mocked(getElectronAPI).mockReturnValue({
      worktree: {
        onTestRunnerEvent: vi.fn(() => vi.fn()),
        getTestLogs: vi.fn(() => Promise.resolve({ success: false })),
        startTests: mockStartTests,
      },
    } as ReturnType<typeof getElectronAPI>);

    const { result } = renderHook(() => useTestRunners('/test/worktree'));

    let startResult: { success: boolean; sessionId?: string };
    await act(async () => {
      startResult = await result.current.start();
    });

    expect(startResult!.success).toBe(true);
    expect(startResult!.sessionId).toBe('new-session');
  });

  it('should clear session history for a worktree', () => {
    const store = useTestRunnersStore.getState();

    // Add sessions for two worktrees
    store.startSession({
      sessionId: 'session-a',
      worktreePath: '/test/worktree-a',
      command: 'npm test',
      status: 'running',
      startedAt: Date.now(),
    });
    store.startSession({
      sessionId: 'session-b',
      worktreePath: '/test/worktree-b',
      command: 'npm test',
      status: 'running',
      startedAt: Date.now(),
    });

    const { result } = renderHook(() => useTestRunners('/test/worktree-a'));

    act(() => {
      result.current.clearHistory();
    });

    // worktree-a sessions should be cleared
    expect(useTestRunnersStore.getState().getActiveSession('/test/worktree-a')).toBeNull();
    // worktree-b sessions should still exist
    expect(useTestRunnersStore.getState().getActiveSession('/test/worktree-b')).not.toBeNull();
  });
});
