import { useState, useEffect, useCallback, useRef } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { getElectronAPI } from '@/lib/electron';
import { pathsEqual } from '@/lib/utils';

const logger = createLogger('DevServerLogs');

export interface DevServerLogState {
  /** The log content (buffered + live) */
  logs: string;
  /** Whether the server is currently running */
  isRunning: boolean;
  /** Whether initial logs are being fetched */
  isLoading: boolean;
  /** Error message if fetching logs failed */
  error: string | null;
  /** Server port (if running) */
  port: number | null;
  /** Server URL (if running) */
  url: string | null;
  /** Timestamp when the server started */
  startedAt: string | null;
  /** Exit code (if server stopped) */
  exitCode: number | null;
  /** Error message from server (if stopped with error) */
  serverError: string | null;
}

interface UseDevServerLogsOptions {
  /** Path to the worktree to monitor logs for */
  worktreePath: string | null;
  /** Whether to automatically subscribe to log events (default: true) */
  autoSubscribe?: boolean;
}

/**
 * Hook to subscribe to dev server log events and manage log state.
 *
 * This hook:
 * 1. Fetches initial buffered logs from the server
 * 2. Subscribes to WebSocket events for real-time log streaming
 * 3. Handles server started/stopped events
 * 4. Provides log state for rendering in a panel
 *
 * @example
 * ```tsx
 * const { logs, isRunning, isLoading } = useDevServerLogs({
 *   worktreePath: '/path/to/worktree'
 * });
 * ```
 */
export function useDevServerLogs({ worktreePath, autoSubscribe = true }: UseDevServerLogsOptions) {
  const [state, setState] = useState<DevServerLogState>({
    logs: '',
    isRunning: false,
    isLoading: false,
    error: null,
    port: null,
    url: null,
    startedAt: null,
    exitCode: null,
    serverError: null,
  });

  // Keep track of whether we've fetched initial logs
  const hasFetchedInitialLogs = useRef(false);

  /**
   * Fetch buffered logs from the server
   */
  const fetchLogs = useCallback(async () => {
    if (!worktreePath) return;

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const api = getElectronAPI();
      if (!api?.worktree?.getDevServerLogs) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: 'Dev server logs API not available',
        }));
        return;
      }

      const result = await api.worktree.getDevServerLogs(worktreePath);

      if (result.success && result.result) {
        setState((prev) => ({
          ...prev,
          logs: result.result!.logs,
          isRunning: true,
          isLoading: false,
          port: result.result!.port,
          url: result.result!.url,
          startedAt: result.result!.startedAt,
          error: null,
        }));
        hasFetchedInitialLogs.current = true;
      } else {
        // Server might not be running - this is not necessarily an error
        setState((prev) => ({
          ...prev,
          isLoading: false,
          isRunning: false,
          error: result.error || null,
        }));
      }
    } catch (error) {
      logger.error('Failed to fetch dev server logs:', error);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch logs',
      }));
    }
  }, [worktreePath]);

  /**
   * Clear logs and reset state
   */
  const clearLogs = useCallback(() => {
    setState({
      logs: '',
      isRunning: false,
      isLoading: false,
      error: null,
      port: null,
      url: null,
      startedAt: null,
      exitCode: null,
      serverError: null,
    });
    hasFetchedInitialLogs.current = false;
  }, []);

  /**
   * Append content to logs
   */
  const appendLogs = useCallback((content: string) => {
    setState((prev) => ({
      ...prev,
      logs: prev.logs + content,
    }));
  }, []);

  // Fetch initial logs when worktreePath changes
  useEffect(() => {
    if (worktreePath && autoSubscribe) {
      hasFetchedInitialLogs.current = false;
      fetchLogs();
    } else {
      clearLogs();
    }
  }, [worktreePath, autoSubscribe, fetchLogs, clearLogs]);

  // Subscribe to WebSocket events
  useEffect(() => {
    if (!worktreePath || !autoSubscribe) return;

    const api = getElectronAPI();
    if (!api?.worktree?.onDevServerLogEvent) {
      logger.warn('Dev server log event API not available');
      return;
    }

    const unsubscribe = api.worktree.onDevServerLogEvent((event) => {
      // Filter events to only handle those for our worktree
      if (!pathsEqual(event.payload.worktreePath, worktreePath)) return;

      switch (event.type) {
        case 'dev-server:started': {
          const { payload } = event;
          logger.info('Dev server started:', payload);
          setState((prev) => ({
            ...prev,
            isRunning: true,
            port: payload.port,
            url: payload.url,
            startedAt: payload.timestamp,
            exitCode: null,
            serverError: null,
            // Clear logs on restart
            logs: '',
          }));
          hasFetchedInitialLogs.current = false;
          break;
        }
        case 'dev-server:output': {
          const { payload } = event;
          // Append the new output to existing logs
          if (payload.content) {
            appendLogs(payload.content);
          }
          break;
        }
        case 'dev-server:stopped': {
          const { payload } = event;
          logger.info('Dev server stopped:', payload);
          setState((prev) => ({
            ...prev,
            isRunning: false,
            exitCode: payload.exitCode,
            serverError: payload.error ?? null,
          }));
          break;
        }
      }
    });

    return unsubscribe;
  }, [worktreePath, autoSubscribe, appendLogs]);

  return {
    ...state,
    fetchLogs,
    clearLogs,
    appendLogs,
  };
}
