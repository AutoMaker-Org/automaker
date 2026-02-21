import { useState, useEffect, useCallback, useRef } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { getElectronAPI } from '@/lib/electron';
import { normalizePath } from '@/lib/utils';
import { toast } from 'sonner';
import type { DevServerInfo, WorktreeInfo } from '../types';

const logger = createLogger('DevServers');

// Timeout (ms) for port detection before showing a warning to the user
const PORT_DETECTION_TIMEOUT_MS = 30_000;
// Interval (ms) for periodic state reconciliation with the backend
const STATE_RECONCILE_INTERVAL_MS = 5_000;

interface UseDevServersOptions {
  projectPath: string;
}

/**
 * Helper to build the browser-accessible dev server URL by rewriting the hostname
 * to match the current window's hostname (supports remote access).
 * Returns null if the URL is invalid or uses an unsupported protocol.
 */
function buildDevServerBrowserUrl(serverUrl: string): string | null {
  try {
    const devServerUrl = new URL(serverUrl);
    // Security: Only allow http/https protocols
    if (devServerUrl.protocol !== 'http:' && devServerUrl.protocol !== 'https:') {
      return null;
    }
    devServerUrl.hostname = window.location.hostname;
    return devServerUrl.toString();
  } catch {
    return null;
  }
}

/**
 * Show a toast notification for a detected dev server URL.
 * Extracted to avoid duplication between event handler and reconciliation paths.
 */
function showUrlDetectedToast(url: string, port: number): void {
  const browserUrl = buildDevServerBrowserUrl(url);
  toast.success(`Dev server running on port ${port}`, {
    description: browserUrl ? browserUrl : url,
    action: browserUrl
      ? {
          label: 'Open in Browser',
          onClick: () => {
            window.open(browserUrl, '_blank', 'noopener,noreferrer');
          },
        }
      : undefined,
    duration: 8000,
  });
}

export function useDevServers({ projectPath }: UseDevServersOptions) {
  const [isStartingDevServer, setIsStartingDevServer] = useState(false);
  const [runningDevServers, setRunningDevServers] = useState<Map<string, DevServerInfo>>(new Map());

  // Track which worktrees have had their url-detected toast shown to prevent re-triggering
  const toastShownForRef = useRef<Set<string>>(new Set());

  // Track port detection timeouts per worktree key
  const portDetectionTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Track whether initial fetch has completed to avoid reconciliation race
  const initialFetchDone = useRef(false);

  /**
   * Clear a port detection timeout for a given key
   */
  const clearPortDetectionTimer = useCallback((key: string) => {
    const timer = portDetectionTimers.current.get(key);
    if (timer) {
      clearTimeout(timer);
      portDetectionTimers.current.delete(key);
    }
  }, []);

  /**
   * Start a port detection timeout for a server that hasn't detected its URL yet.
   * After PORT_DETECTION_TIMEOUT_MS, if still undetected, show a warning toast
   * and attempt to reconcile state with the backend.
   */
  const startPortDetectionTimer = useCallback(
    (key: string) => {
      // Clear any existing timer for this key
      clearPortDetectionTimer(key);

      const timer = setTimeout(async () => {
        portDetectionTimers.current.delete(key);

        // Check if the server is still in undetected state.
        // Use a setState-updater-as-reader to access the latest state snapshot,
        // but keep the updater pure (no side effects, just reads).
        let needsReconciliation = false;
        setRunningDevServers((prev) => {
          const server = prev.get(key);
          needsReconciliation = !!server && !server.urlDetected;
          return prev; // no state change
        });

        if (!needsReconciliation) return;

        logger.warn(`Port detection timeout for ${key} after ${PORT_DETECTION_TIMEOUT_MS}ms`);

        // Try to reconcile with backend - the server may have detected the URL
        // but the WebSocket event was missed
        try {
          const api = getElectronAPI();
          if (!api?.worktree?.listDevServers) return;
          const result = await api.worktree.listDevServers();
          if (result.success && result.result?.servers) {
            const backendServer = result.result.servers.find(
              (s) => normalizePath(s.worktreePath) === key
            );
            if (backendServer && backendServer.urlDetected) {
              // Backend has detected the URL - update our state
              logger.info(`Port detection reconciled from backend for ${key}`);
              setRunningDevServers((prev) => {
                const next = new Map(prev);
                next.set(key, {
                  ...backendServer,
                  urlDetected: true,
                });
                return next;
              });
              if (!toastShownForRef.current.has(key)) {
                toastShownForRef.current.add(key);
                showUrlDetectedToast(backendServer.url, backendServer.port);
              }
              return;
            }

            if (!backendServer) {
              // Server is no longer running on the backend - remove from state
              logger.info(`Server ${key} no longer running on backend, removing from state`);
              setRunningDevServers((prev) => {
                if (!prev.has(key)) return prev;
                const next = new Map(prev);
                next.delete(key);
                return next;
              });
              toastShownForRef.current.delete(key);
              return;
            }
          }
        } catch (error) {
          logger.error('Failed to reconcile port detection:', error);
        }

        // If we get here, the backend also hasn't detected the URL - show warning
        toast.warning('Port detection is taking longer than expected', {
          description:
            'The dev server may be slow to start, or the port output format is not recognized.',
          action: {
            label: 'Retry',
            onClick: () => {
              // Use ref to get the latest startPortDetectionTimer, avoiding stale closure
              startPortDetectionTimerRef.current(key);
            },
          },
          duration: 10000,
        });
      }, PORT_DETECTION_TIMEOUT_MS);

      portDetectionTimers.current.set(key, timer);
    },
    [clearPortDetectionTimer]
  );

  // Ref to hold the latest startPortDetectionTimer callback, avoiding stale closures
  // in long-lived callbacks like toast action handlers
  const startPortDetectionTimerRef = useRef(startPortDetectionTimer);
  startPortDetectionTimerRef.current = startPortDetectionTimer;

  const fetchDevServers = useCallback(async () => {
    try {
      const api = getElectronAPI();
      if (!api?.worktree?.listDevServers) {
        return;
      }
      const result = await api.worktree.listDevServers();
      if (result.success && result.result?.servers) {
        const serversMap = new Map<string, DevServerInfo>();
        for (const server of result.result.servers) {
          const key = normalizePath(server.worktreePath);
          serversMap.set(key, {
            ...server,
            urlDetected: server.urlDetected ?? true,
          });
          // Mark already-detected servers as having shown the toast
          // so we don't re-trigger on initial load
          if (server.urlDetected !== false) {
            toastShownForRef.current.add(key);
            // Clear any pending detection timer since URL is already detected
            clearPortDetectionTimer(key);
          } else {
            // Server running but URL not yet detected - start timeout
            startPortDetectionTimer(key);
          }
        }
        setRunningDevServers(serversMap);
      }
      initialFetchDone.current = true;
    } catch (error) {
      logger.error('Failed to fetch dev servers:', error);
      initialFetchDone.current = true;
    }
  }, [clearPortDetectionTimer, startPortDetectionTimer]);

  useEffect(() => {
    fetchDevServers();
  }, [fetchDevServers]);

  // Periodic state reconciliation: poll backend to catch missed WebSocket events
  // This handles edge cases like PWA restart, WebSocket reconnection gaps, etc.
  useEffect(() => {
    const reconcile = async () => {
      if (!initialFetchDone.current) return;
      // Skip reconciliation when the tab/panel is not visible to avoid
      // unnecessary API calls while the user isn't looking at the panel.
      if (document.hidden) return;

      try {
        const api = getElectronAPI();
        if (!api?.worktree?.listDevServers) return;

        const result = await api.worktree.listDevServers();
        if (!result.success || !result.result?.servers) return;

        const backendServers = new Map<string, (typeof result.result.servers)[number]>();
        for (const server of result.result.servers) {
          backendServers.set(normalizePath(server.worktreePath), server);
        }

        // Collect side-effect actions in a local array so the setState updater
        // remains pure. Side effects are executed after the state update.
        const sideEffects: Array<() => void> = [];

        setRunningDevServers((prev) => {
          let changed = false;
          const next = new Map(prev);

          // Add or update servers from backend
          for (const [key, server] of backendServers) {
            const existing = next.get(key);
            if (!existing) {
              // Server running on backend but not in our state - add it
              sideEffects.push(() => logger.info(`Reconciliation: adding missing server ${key}`));
              next.set(key, {
                ...server,
                urlDetected: server.urlDetected ?? true,
              });
              if (server.urlDetected !== false) {
                sideEffects.push(() => {
                  toastShownForRef.current.add(key);
                  clearPortDetectionTimer(key);
                });
              } else {
                sideEffects.push(() => startPortDetectionTimer(key));
              }
              changed = true;
            } else if (!existing.urlDetected && server.urlDetected) {
              // URL was detected on backend but we missed the event - update
              sideEffects.push(() => {
                logger.info(`Reconciliation: URL detected for ${key}`);
                clearPortDetectionTimer(key);
                if (!toastShownForRef.current.has(key)) {
                  toastShownForRef.current.add(key);
                  showUrlDetectedToast(server.url, server.port);
                }
              });
              next.set(key, {
                ...server,
                urlDetected: true,
              });
              changed = true;
            } else if (
              existing.urlDetected &&
              server.urlDetected &&
              (existing.port !== server.port || existing.url !== server.url)
            ) {
              // Port or URL changed between sessions - update
              sideEffects.push(() => logger.info(`Reconciliation: port/URL changed for ${key}`));
              next.set(key, {
                ...server,
                urlDetected: true,
              });
              changed = true;
            }
          }

          // Remove servers from our state that are no longer on the backend
          for (const [key] of next) {
            if (!backendServers.has(key)) {
              sideEffects.push(() => {
                logger.info(`Reconciliation: removing stale server ${key}`);
                toastShownForRef.current.delete(key);
                clearPortDetectionTimer(key);
              });
              next.delete(key);
              changed = true;
            }
          }

          return changed ? next : prev;
        });

        // Execute side effects outside the updater
        for (const fn of sideEffects) fn();
      } catch (error) {
        // Reconciliation failures are non-critical - just log and continue
        logger.debug('State reconciliation failed:', error);
      }
    };

    const intervalId = setInterval(reconcile, STATE_RECONCILE_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [clearPortDetectionTimer, startPortDetectionTimer]);

  // Subscribe to all dev server lifecycle events for reactive state updates
  useEffect(() => {
    const api = getElectronAPI();
    if (!api?.worktree?.onDevServerLogEvent) return;

    const unsubscribe = api.worktree.onDevServerLogEvent((event) => {
      if (event.type === 'dev-server:url-detected') {
        const { worktreePath, url, port } = event.payload;
        const key = normalizePath(worktreePath);
        // Clear the port detection timeout since URL was successfully detected
        clearPortDetectionTimer(key);
        let didUpdate = false;
        setRunningDevServers((prev) => {
          const existing = prev.get(key);
          // If the server isn't in our state yet (e.g., race condition on first load
          // where url-detected arrives before fetchDevServers completes), create the entry
          if (!existing) {
            const next = new Map(prev);
            next.set(key, {
              worktreePath,
              url,
              port,
              urlDetected: true,
            });
            didUpdate = true;
            return next;
          }
          // Avoid updating if already detected with same url/port
          if (existing.urlDetected && existing.url === url && existing.port === port) return prev;
          const next = new Map(prev);
          next.set(key, {
            ...existing,
            url,
            port,
            urlDetected: true,
          });
          didUpdate = true;
          return next;
        });
        if (didUpdate) {
          logger.info(`Dev server URL detected for ${worktreePath}: ${url} (port ${port})`);
          // Only show toast on the transition from undetected → detected (not on re-renders/polls)
          if (!toastShownForRef.current.has(key)) {
            toastShownForRef.current.add(key);
            showUrlDetectedToast(url, port);
          }
        }
      } else if (event.type === 'dev-server:stopped') {
        // Reactively remove the server from state when it stops
        const { worktreePath } = event.payload;
        const key = normalizePath(worktreePath);
        // Clear any pending port detection timeout
        clearPortDetectionTimer(key);
        setRunningDevServers((prev) => {
          if (!prev.has(key)) return prev;
          const next = new Map(prev);
          next.delete(key);
          return next;
        });
        // Clear the toast tracking so a fresh detection will show a new toast
        toastShownForRef.current.delete(key);
        logger.info(`Dev server stopped for ${worktreePath} (reactive update)`);
      } else if (event.type === 'dev-server:started') {
        // Reactively add/update the server when it starts
        const { worktreePath, port, url } = event.payload;
        const key = normalizePath(worktreePath);
        // Clear previous toast tracking for this key so a new detection triggers a fresh toast
        toastShownForRef.current.delete(key);
        setRunningDevServers((prev) => {
          const next = new Map(prev);
          next.set(key, {
            worktreePath,
            port,
            url,
            urlDetected: false,
          });
          return next;
        });
        // Start port detection timeout for the new server
        startPortDetectionTimer(key);
      }
    });

    return unsubscribe;
  }, [clearPortDetectionTimer, startPortDetectionTimer]);

  // Cleanup all port detection timers on unmount
  useEffect(() => {
    return () => {
      for (const timer of portDetectionTimers.current.values()) {
        clearTimeout(timer);
      }
      portDetectionTimers.current.clear();
    };
  }, []);

  const getWorktreeKey = useCallback(
    (worktree: WorktreeInfo) => {
      const path = worktree.isMain ? projectPath : worktree.path;
      return path ? normalizePath(path) : path;
    },
    [projectPath]
  );

  const handleStartDevServer = useCallback(
    async (worktree: WorktreeInfo) => {
      if (isStartingDevServer) return;
      setIsStartingDevServer(true);

      try {
        const api = getElectronAPI();
        if (!api?.worktree?.startDevServer) {
          toast.error('Start dev server API not available');
          return;
        }

        const targetPath = worktree.isMain ? projectPath : worktree.path;
        const result = await api.worktree.startDevServer(projectPath, targetPath);

        if (result.success && result.result) {
          const key = normalizePath(targetPath);
          // Clear toast tracking so the new port detection shows a fresh toast
          toastShownForRef.current.delete(key);
          setRunningDevServers((prev) => {
            const next = new Map(prev);
            next.set(key, {
              worktreePath: result.result!.worktreePath,
              port: result.result!.port,
              url: result.result!.url,
              urlDetected: false,
            });
            return next;
          });
          // Start port detection timeout
          startPortDetectionTimer(key);
          toast.success('Dev server started, detecting port...');
        } else {
          toast.error(result.error || 'Failed to start dev server');
        }
      } catch (error) {
        logger.error('Start dev server failed:', error);
        toast.error('Failed to start dev server');
      } finally {
        setIsStartingDevServer(false);
      }
    },
    [isStartingDevServer, projectPath, startPortDetectionTimer]
  );

  const handleStopDevServer = useCallback(
    async (worktree: WorktreeInfo) => {
      try {
        const api = getElectronAPI();
        if (!api?.worktree?.stopDevServer) {
          toast.error('Stop dev server API not available');
          return;
        }

        const targetPath = worktree.isMain ? projectPath : worktree.path;
        const result = await api.worktree.stopDevServer(targetPath);

        if (result.success) {
          const key = normalizePath(targetPath);
          // Clear port detection timeout
          clearPortDetectionTimer(key);
          setRunningDevServers((prev) => {
            const next = new Map(prev);
            next.delete(key);
            return next;
          });
          // Clear toast tracking so future restarts get a fresh toast
          toastShownForRef.current.delete(key);
          toast.success(result.result?.message || 'Dev server stopped');
        } else {
          toast.error(result.error || 'Failed to stop dev server');
        }
      } catch (error) {
        logger.error('Stop dev server failed:', error);
        toast.error('Failed to stop dev server');
      }
    },
    [projectPath, clearPortDetectionTimer]
  );

  const handleOpenDevServerUrl = useCallback(
    (worktree: WorktreeInfo) => {
      const serverInfo = runningDevServers.get(getWorktreeKey(worktree));
      if (!serverInfo) {
        logger.warn('No dev server info found for worktree:', getWorktreeKey(worktree));
        toast.error('Dev server not found', {
          description: 'The dev server may have stopped. Try starting it again.',
        });
        return;
      }

      const browserUrl = buildDevServerBrowserUrl(serverInfo.url);
      if (!browserUrl) {
        logger.error('Invalid dev server URL:', serverInfo.url);
        toast.error('Invalid dev server URL', {
          description: 'The server returned an unsupported URL protocol.',
        });
        return;
      }

      window.open(browserUrl, '_blank', 'noopener,noreferrer');
    },
    [runningDevServers, getWorktreeKey]
  );

  const isDevServerRunning = useCallback(
    (worktree: WorktreeInfo) => {
      return runningDevServers.has(getWorktreeKey(worktree));
    },
    [runningDevServers, getWorktreeKey]
  );

  const getDevServerInfo = useCallback(
    (worktree: WorktreeInfo) => {
      return runningDevServers.get(getWorktreeKey(worktree));
    },
    [runningDevServers, getWorktreeKey]
  );

  return {
    isStartingDevServer,
    runningDevServers,
    getWorktreeKey,
    isDevServerRunning,
    getDevServerInfo,
    handleStartDevServer,
    handleStopDevServer,
    handleOpenDevServerUrl,
  };
}
