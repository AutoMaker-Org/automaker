/**
 * useTestRunners - Hook for test runner lifecycle management
 *
 * This hook provides a complete interface for:
 * - Starting and stopping test runs
 * - Subscribing to test runner events (started, output, completed)
 * - Managing test session state per worktree
 * - Fetching existing test logs
 */

import { useEffect, useCallback, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { createLogger } from '@automaker/utils/logger';
import { getElectronAPI } from '@/lib/electron';
import { useTestRunnersStore, type TestSession } from '@/store/test-runners-store';
import type {
  TestRunStatus,
  TestRunnerStartedEvent,
  TestRunnerOutputEvent,
  TestRunnerCompletedEvent,
} from '@/types/electron';

const logger = createLogger('TestRunners');

/**
 * Options for starting a test run
 */
export interface StartTestOptions {
  /** Project path to get test command from settings */
  projectPath?: string;
  /** Specific test file to run (runs all tests if not provided) */
  testFile?: string;
}

/**
 * Result from starting a test run
 */
export interface StartTestResult {
  success: boolean;
  sessionId?: string;
  error?: string;
}

/**
 * Result from stopping a test run
 */
export interface StopTestResult {
  success: boolean;
  error?: string;
}

/**
 * Hook for managing test runners with full lifecycle support
 *
 * @param worktreePath - The worktree path to scope the hook to (optional for global event handling)
 * @returns Test runner state and actions
 */
export function useTestRunners(worktreePath?: string) {
  // Get store state and actions
  const {
    sessions,
    isLoading,
    error,
    startSession,
    appendOutput,
    completeSession,
    getActiveSession,
    getSession,
    isWorktreeRunning,
    removeSession,
    clearWorktreeSessions,
    setLoading,
    setError,
  } = useTestRunnersStore(
    useShallow((state) => ({
      sessions: state.sessions,
      isLoading: state.isLoading,
      error: state.error,
      startSession: state.startSession,
      appendOutput: state.appendOutput,
      completeSession: state.completeSession,
      getActiveSession: state.getActiveSession,
      getSession: state.getSession,
      isWorktreeRunning: state.isWorktreeRunning,
      removeSession: state.removeSession,
      clearWorktreeSessions: state.clearWorktreeSessions,
      setLoading: state.setLoading,
      setError: state.setError,
    }))
  );

  // Derived state for the current worktree
  const activeSession = useMemo(() => {
    if (!worktreePath) return null;
    return getActiveSession(worktreePath);
  }, [worktreePath, getActiveSession]);

  const isRunning = useMemo(() => {
    if (!worktreePath) return false;
    return isWorktreeRunning(worktreePath);
  }, [worktreePath, isWorktreeRunning]);

  // Get all sessions for the current worktree
  const worktreeSessions = useMemo(() => {
    if (!worktreePath) return [];
    return Object.values(sessions).filter((s) => s.worktreePath === worktreePath);
  }, [worktreePath, sessions]);

  // Subscribe to test runner events
  useEffect(() => {
    const api = getElectronAPI();
    if (!api?.worktree?.onTestRunnerEvent) {
      logger.warn('Test runner event subscription not available');
      return;
    }

    const unsubscribe = api.worktree.onTestRunnerEvent((event) => {
      // If worktreePath is specified, only handle events for that worktree
      if (worktreePath && event.payload.worktreePath !== worktreePath) {
        return;
      }

      switch (event.type) {
        case 'test-runner:started': {
          const payload = event.payload as TestRunnerStartedEvent;
          logger.info(`Test run started: ${payload.sessionId} in ${payload.worktreePath}`);

          startSession({
            sessionId: payload.sessionId,
            worktreePath: payload.worktreePath,
            command: payload.command,
            status: 'running',
            testFile: payload.testFile,
            startedAt: payload.timestamp,
          });
          break;
        }

        case 'test-runner:output': {
          const payload = event.payload as TestRunnerOutputEvent;
          appendOutput(payload.sessionId, payload.content);
          break;
        }

        case 'test-runner:completed': {
          const payload = event.payload as TestRunnerCompletedEvent;
          logger.info(
            `Test run completed: ${payload.sessionId} with status ${payload.status} (exit code: ${payload.exitCode})`
          );

          completeSession(payload.sessionId, payload.status, payload.exitCode, payload.duration);
          break;
        }
      }
    });

    return unsubscribe;
  }, [worktreePath, startSession, appendOutput, completeSession]);

  // Load existing test logs on mount (if worktreePath is provided)
  useEffect(() => {
    if (!worktreePath) return;

    const loadExistingLogs = async () => {
      try {
        const api = getElectronAPI();
        if (!api?.worktree?.getTestLogs) return;

        setLoading(true);
        setError(null);

        const result = await api.worktree.getTestLogs(worktreePath);

        if (result.success && result.result) {
          const { sessionId, command, status, testFile, logs, startedAt, finishedAt, exitCode } =
            result.result;

          // Only add if we don't already have this session
          const existingSession = getSession(sessionId);
          if (!existingSession) {
            startSession({
              sessionId,
              worktreePath,
              command,
              status,
              testFile,
              startedAt,
              finishedAt: finishedAt || undefined,
              exitCode: exitCode ?? undefined,
            });

            // Add existing logs
            if (logs) {
              appendOutput(sessionId, logs);
            }
          }
        }
      } catch (err) {
        logger.error('Error loading test logs:', err);
        setError(err instanceof Error ? err.message : 'Failed to load test logs');
      } finally {
        setLoading(false);
      }
    };

    loadExistingLogs();
  }, [worktreePath, setLoading, setError, getSession, startSession, appendOutput]);

  // Start a test run
  const start = useCallback(
    async (options?: StartTestOptions): Promise<StartTestResult> => {
      if (!worktreePath) {
        return { success: false, error: 'No worktree path provided' };
      }

      try {
        const api = getElectronAPI();
        if (!api?.worktree?.startTests) {
          return { success: false, error: 'Test runner API not available' };
        }

        logger.info(`Starting tests in ${worktreePath}`, options);

        const result = await api.worktree.startTests(worktreePath, {
          projectPath: options?.projectPath,
          testFile: options?.testFile,
        });

        if (!result.success) {
          logger.error('Failed to start tests:', result.error);
          return { success: false, error: result.error };
        }

        logger.info(`Tests started with session: ${result.result?.sessionId}`);
        return {
          success: true,
          sessionId: result.result?.sessionId,
        };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error starting tests';
        logger.error('Error starting tests:', err);
        return { success: false, error: errorMessage };
      }
    },
    [worktreePath]
  );

  // Stop a test run
  const stop = useCallback(
    async (sessionId?: string): Promise<StopTestResult> => {
      // Use provided sessionId or get the active session for this worktree
      const targetSessionId = sessionId || (worktreePath && activeSession?.sessionId);

      if (!targetSessionId) {
        return { success: false, error: 'No active test session to stop' };
      }

      try {
        const api = getElectronAPI();
        if (!api?.worktree?.stopTests) {
          return { success: false, error: 'Test runner API not available' };
        }

        logger.info(`Stopping test session: ${targetSessionId}`);

        const result = await api.worktree.stopTests(targetSessionId);

        if (!result.success) {
          logger.error('Failed to stop tests:', result.error);
          return { success: false, error: result.error };
        }

        logger.info('Tests stopped successfully');
        return { success: true };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error stopping tests';
        logger.error('Error stopping tests:', err);
        return { success: false, error: errorMessage };
      }
    },
    [worktreePath, activeSession]
  );

  // Refresh logs for the current session
  const refreshLogs = useCallback(
    async (sessionId?: string): Promise<{ success: boolean; logs?: string; error?: string }> => {
      const targetSessionId = sessionId || (worktreePath && activeSession?.sessionId);

      if (!targetSessionId && !worktreePath) {
        return { success: false, error: 'No session or worktree to refresh' };
      }

      try {
        const api = getElectronAPI();
        if (!api?.worktree?.getTestLogs) {
          return { success: false, error: 'Test logs API not available' };
        }

        const result = await api.worktree.getTestLogs(worktreePath, targetSessionId);

        if (!result.success) {
          return { success: false, error: result.error };
        }

        return {
          success: true,
          logs: result.result?.logs,
        };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error fetching logs';
        return { success: false, error: errorMessage };
      }
    },
    [worktreePath, activeSession]
  );

  // Clear session history for the current worktree
  const clearHistory = useCallback(() => {
    if (worktreePath) {
      clearWorktreeSessions(worktreePath);
    }
  }, [worktreePath, clearWorktreeSessions]);

  return {
    // State
    /** The currently active test session for this worktree */
    activeSession,
    /** Whether tests are currently running in this worktree */
    isRunning,
    /** All test sessions for this worktree (including completed) */
    sessions: worktreeSessions,
    /** Loading state */
    isLoading,
    /** Error state */
    error,

    // Actions
    /** Start a test run */
    start,
    /** Stop a test run */
    stop,
    /** Refresh logs for a session */
    refreshLogs,
    /** Clear session history for this worktree */
    clearHistory,

    // Lower-level access (for advanced use cases)
    /** Get a specific session by ID */
    getSession,
    /** Remove a specific session */
    removeSession,
  };
}

/**
 * Hook for subscribing to test runner events globally (across all worktrees)
 *
 * Useful for global status displays or notifications
 */
export function useTestRunnerEvents(
  onStarted?: (event: TestRunnerStartedEvent) => void,
  onOutput?: (event: TestRunnerOutputEvent) => void,
  onCompleted?: (event: TestRunnerCompletedEvent) => void
) {
  useEffect(() => {
    const api = getElectronAPI();
    if (!api?.worktree?.onTestRunnerEvent) {
      logger.warn('Test runner event subscription not available');
      return;
    }

    const unsubscribe = api.worktree.onTestRunnerEvent((event) => {
      switch (event.type) {
        case 'test-runner:started':
          onStarted?.(event.payload as TestRunnerStartedEvent);
          break;
        case 'test-runner:output':
          onOutput?.(event.payload as TestRunnerOutputEvent);
          break;
        case 'test-runner:completed':
          onCompleted?.(event.payload as TestRunnerCompletedEvent);
          break;
      }
    });

    return unsubscribe;
  }, [onStarted, onOutput, onCompleted]);
}

// Re-export types for convenience
export type { TestSession, TestRunStatus };
