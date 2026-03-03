import { useState, useEffect, useCallback, useRef } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { getElectronAPI } from '@/lib/electron';
import { pathsEqual } from '@/lib/utils';

const logger = createLogger('DevServerLogs');

// Maximum log buffer size (characters) - matches server-side MAX_SCROLLBACK_SIZE
const MAX_LOG_BUFFER_SIZE = 50_000; // ~50KB

export interface DevServerLogState {
  /** The log content (buffered + live) */
  logs: string;
  /** Incremented whenever logs content changes (including trim+shift) */
  logsVersion: number;
  /** True when the latest append caused head truncation */
  didTrim: boolean;
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
    logsVersion: 0,
    didTrim: false,
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

  // Buffer for batching rapid output events into fewer setState calls.
  // Content accumulates here and is flushed via requestAnimationFrame,
  // ensuring at most one React re-render per animation frame (~60fps max).
  // A fallback setTimeout ensures the buffer is flushed even when RAF is
  // throttled (e.g., when the tab is in the background).
  const pendingOutputRef = useRef('');
  const rafIdRef = useRef<number | null>(null);
  const timerIdRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetPendingOutput = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (timerIdRef.current !== null) {
      clearTimeout(timerIdRef.current);
      timerIdRef.current = null;
    }
    pendingOutputRef.current = '';
  }, []);

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
    resetPendingOutput();
    setState({
      logs: '',
      logsVersion: 0,
      didTrim: false,
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
  }, [resetPendingOutput]);

  const flushPendingOutput = useCallback(() => {
    // Clear both scheduling handles to prevent duplicate flushes
    rafIdRef.current = null;
    if (timerIdRef.current !== null) {
      clearTimeout(timerIdRef.current);
      timerIdRef.current = null;
    }
    const content = pendingOutputRef.current;
    if (!content) return;
    pendingOutputRef.current = '';

    setState((prev) => {
      const combined = prev.logs + content;
      const didTrim = combined.length > MAX_LOG_BUFFER_SIZE;
      let newLogs = combined;
      if (didTrim) {
        const slicePoint = combined.length - MAX_LOG_BUFFER_SIZE;
        // Find the next newline after the slice point to avoid cutting a line in half
        const firstNewlineIndex = combined.indexOf('\n', slicePoint);
        newLogs = combined.slice(firstNewlineIndex > -1 ? firstNewlineIndex + 1 : slicePoint);
      }
      return {
        ...prev,
        logs: newLogs,
        didTrim,
        logsVersion: prev.logsVersion + 1,
      };
    });
  }, []);

  /**
   * Append content to logs, enforcing a maximum buffer size to prevent
   * unbounded memory growth and progressive UI lag.
   *
   * Uses requestAnimationFrame to batch rapid output events into at most
   * one React state update per frame, preventing excessive re-renders.
   * A fallback setTimeout(250ms) ensures the buffer is flushed even when
   * RAF is throttled (e.g., when the tab is in the background).
   * If the pending buffer reaches MAX_LOG_BUFFER_SIZE, flushes immediately
   * to prevent unbounded memory growth.
   */
  const appendLogs = useCallback(
    (content: string) => {
      pendingOutputRef.current += content;

      // Flush immediately if buffer has reached the size limit
      if (pendingOutputRef.current.length >= MAX_LOG_BUFFER_SIZE) {
        flushPendingOutput();
        return;
      }

      // Schedule a RAF flush if not already scheduled
      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(flushPendingOutput);
      }

      // Schedule a fallback timer flush if not already scheduled,
      // to handle cases where RAF is throttled (background tab)
      if (timerIdRef.current === null) {
        timerIdRef.current = setTimeout(flushPendingOutput, 250);
      }
    },
    [flushPendingOutput]
  );

  // Clean up pending RAF on unmount to prevent state updates after unmount
  useEffect(() => {
    return () => {
      resetPendingOutput();
    };
  }, [resetPendingOutput]);

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
          resetPendingOutput();
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
        case 'dev-server:url-detected': {
          const { payload } = event;
          logger.info('Dev server URL detected:', payload);
          setState((prev) => ({
            ...prev,
            url: payload.url,
            port: payload.port,
          }));
          break;
        }
      }
    });

    return unsubscribe;
  }, [worktreePath, autoSubscribe, appendLogs, resetPendingOutput]);

  return {
    ...state,
    fetchLogs,
    clearLogs,
    appendLogs,
  };
}
