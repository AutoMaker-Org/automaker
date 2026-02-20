import { useState, useEffect, useCallback } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { getElectronAPI } from '@/lib/electron';
import { normalizePath } from '@/lib/utils';
import { toast } from 'sonner';
import type { DevServerInfo, WorktreeInfo } from '../types';

const logger = createLogger('DevServers');

interface UseDevServersOptions {
  projectPath: string;
}

export function useDevServers({ projectPath }: UseDevServersOptions) {
  const [isStartingDevServer, setIsStartingDevServer] = useState(false);
  const [runningDevServers, setRunningDevServers] = useState<Map<string, DevServerInfo>>(new Map());

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
          serversMap.set(normalizePath(server.worktreePath), {
            ...server,
            urlDetected: server.urlDetected ?? true,
          });
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

  // Subscribe to url-detected events to update port/url when the actual dev server port is detected
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
          toast.success(`Dev server running on port ${port}`);
        }
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
          setRunningDevServers((prev) => {
            const next = new Map(prev);
            next.set(normalizePath(targetPath), {
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
          setRunningDevServers((prev) => {
            const next = new Map(prev);
            next.delete(normalizePath(targetPath));
            return next;
          });
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

      try {
        // Rewrite URL hostname to match the current browser's hostname.
        // This ensures dev server URLs work when accessing Automaker from
        // remote machines (e.g., 192.168.x.x or hostname.local instead of localhost).
        const devServerUrl = new URL(serverInfo.url);

        // Security: Only allow http/https protocols to prevent potential attacks
        // via data:, javascript:, file:, or other dangerous URL schemes
        if (devServerUrl.protocol !== 'http:' && devServerUrl.protocol !== 'https:') {
          logger.error('Invalid dev server URL protocol:', devServerUrl.protocol);
          toast.error('Invalid dev server URL', {
            description: 'The server returned an unsupported URL protocol.',
          });
          return;
        }

        devServerUrl.hostname = window.location.hostname;
        window.open(devServerUrl.toString(), '_blank', 'noopener,noreferrer');
      } catch (error) {
        logger.error('Failed to parse dev server URL:', error);
        toast.error('Failed to open dev server', {
          description: 'The server URL could not be processed. Please try again.',
        });
      }
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
