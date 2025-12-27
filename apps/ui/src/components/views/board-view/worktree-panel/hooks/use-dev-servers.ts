import { useState, useEffect, useCallback } from 'react';
import { getElectronAPI } from '@/lib/electron';
import { normalizePath } from '@/lib/utils';
import { toast } from 'sonner';
import type { DevServerInfo, WorktreeInfo } from '../types';

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
          serversMap.set(server.worktreePath, server);
        }
        setRunningDevServers(serversMap);
      }
    } catch (error) {
      console.error('Failed to fetch dev servers:', error);
    }
  }, []);

  useEffect(() => {
    fetchDevServers();
  }, [fetchDevServers]);

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
            });
            return next;
          });
          toast.success(`Dev server started on port ${result.result.port}`);
        } else {
          toast.error(result.error || 'Failed to start dev server');
        }
      } catch (error) {
        console.error('Start dev server failed:', error);
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
        console.error('Stop dev server failed:', error);
        toast.error('Failed to stop dev server');
      }
    },
    [projectPath]
  );

  const handleOpenDevServerUrl = useCallback(
    (worktree: WorktreeInfo) => {
      const serverInfo = runningDevServers.get(getWorktreeKey(worktree));
      if (serverInfo) {
        window.open(serverInfo.url, '_blank');
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
