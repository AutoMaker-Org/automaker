import { useState, useEffect, useCallback, useRef } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { useAppStore } from '@/store/app-store';
import { getElectronAPI } from '@/lib/electron';
import { pathsEqual } from '@/lib/utils';
import type { WorktreeInfo } from '../types';

const logger = createLogger('Worktrees');

interface UseWorktreesOptions {
  projectPath: string;
  refreshTrigger?: number;
  onRemovedWorktrees?: (removedWorktrees: Array<{ path: string; branch: string }>) => void;
}

export function useWorktrees({
  projectPath,
  refreshTrigger = 0,
  onRemovedWorktrees,
}: UseWorktreesOptions) {
  const [isLoading, setIsLoading] = useState(false);
  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([]);

  const currentWorktree = useAppStore((s) => s.getCurrentWorktree(projectPath));
  const setCurrentWorktree = useAppStore((s) => s.setCurrentWorktree);
  const setWorktreesInStore = useAppStore((s) => s.setWorktrees);
  const useWorktreesEnabled = useAppStore((s) => s.useWorktrees);

  const fetchWorktrees = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!projectPath) return;
      const silent = options?.silent ?? false;
      if (!silent) {
        setIsLoading(true);
      }
      try {
        const api = getElectronAPI();
        if (!api?.worktree?.listAll) {
          logger.warn('Worktree API not available');
          return;
        }
        const result = await api.worktree.listAll(projectPath, true);
        if (result.success && result.worktrees) {
          setWorktrees(result.worktrees);
          setWorktreesInStore(projectPath, result.worktrees);
        }
        // Return removed worktrees so they can be handled by the caller
        return result.removedWorktrees;
      } catch (error) {
        logger.error('Failed to fetch worktrees:', error);
        return undefined;
      } finally {
        if (!silent) {
          setIsLoading(false);
        }
      }
    },
    [projectPath, setWorktreesInStore]
  );

  useEffect(() => {
    fetchWorktrees();
  }, [fetchWorktrees]);

  useEffect(() => {
    if (refreshTrigger > 0) {
      fetchWorktrees().then((removedWorktrees) => {
        if (removedWorktrees && removedWorktrees.length > 0 && onRemovedWorktrees) {
          onRemovedWorktrees(removedWorktrees);
        }
      });
    }
  }, [refreshTrigger, fetchWorktrees, onRemovedWorktrees]);

  // Use a ref to track the current worktree to avoid running validation
  // when selection changes (which could cause a race condition with stale worktrees list)
  const currentWorktreeRef = useRef(currentWorktree);
  useEffect(() => {
    currentWorktreeRef.current = currentWorktree;
  }, [currentWorktree]);

  // Validation effect: only runs when worktrees list changes (not on selection change)
  // This prevents a race condition where the selection is reset because the
  // local worktrees state hasn't been updated yet from the async fetch
  useEffect(() => {
    if (worktrees.length > 0) {
      const current = currentWorktreeRef.current;
      const currentPath = current?.path;
      const currentWorktreeExists =
        currentPath === null
          ? true
          : worktrees.some((w) => !w.isMain && pathsEqual(w.path, currentPath));

      if (current == null || (currentPath !== null && !currentWorktreeExists)) {
        // Find the primary worktree and get its branch name
        // Fallback to "main" only if worktrees haven't loaded yet
        const mainWorktree = worktrees.find((w) => w.isMain);
        const mainBranch = mainWorktree?.branch || 'main';
        setCurrentWorktree(projectPath, null, mainBranch);
      }
    }
  }, [worktrees, projectPath, setCurrentWorktree]);

  const handleSelectWorktree = useCallback(
    (worktree: WorktreeInfo) => {
      setCurrentWorktree(projectPath, worktree.isMain ? null : worktree.path, worktree.branch);
    },
    [projectPath, setCurrentWorktree]
  );

  const currentWorktreePath = currentWorktree?.path ?? null;
  const selectedWorktree = currentWorktreePath
    ? worktrees.find((w) => pathsEqual(w.path, currentWorktreePath))
    : worktrees.find((w) => w.isMain);

  return {
    isLoading,
    worktrees,
    currentWorktree,
    currentWorktreePath,
    selectedWorktree,
    useWorktreesEnabled,
    fetchWorktrees,
    handleSelectWorktree,
  };
}
