import { useState, useEffect, useCallback, useRef } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { getElectronAPI } from '@/lib/electron';
import { normalizePath } from '@/lib/utils';
import { toast } from 'sonner';
import type { DevServerInfo, WorktreeInfo } from '../types';

const logger = createLogger('DevServers');

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

export function useDevServers({ projectPath }: UseDevServersOptions) {
  const [isStartingDevServer, setIsStartingDevServer] = useState(false);
  const [runningDevServers, setRunningDevServers] = useState<Map<string, DevServerInfo>>(new Map());

  // Track which worktrees have had their url-detected toast shown to prevent re-triggering
  const toastShownForRef = useRef<Set<string>>(new Set());

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
          }
        }
        setRunningDevServers(serversMap);
      }
    } catch (error) {
      logger.error('Failed to fetch dev servers:', error);
    }
  }, []);

  useEffect(() => {
    fetchDevServers();
  }, [fetchDevServers]);

  // Subscribe to all dev server lifecycle events for reactive state updates
  useEffect(() => {
    const api = getElectronAPI();
    if (!api?.worktree?.onDevServerLogEvent) return;

    const unsubscribe = api.worktree.onDevServerLogEvent((event) => {
      if (event.type === 'dev-server:url-detected') {
        const { worktreePath, url, port } = event.payload;
        const key = normalizePath(worktreePath);
        let didUpdate = false;
        setRunningDevServers((prev) => {
          const existing = prev.get(key);
          if (!existing) return prev;
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
        }
      } else if (event.type === 'dev-server:stopped') {
        // Reactively remove the server from state when it stops
        const { worktreePath } = event.payload;
        const key = normalizePath(worktreePath);
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
      }
    });

    return unsubscribe;
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
    [isStartingDevServer, projectPath]
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
    [projectPath]
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
