import { useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '@/store/app-store';
import { useWorktrees as useWorktreesQuery } from '@/hooks/queries';
import { queryKeys } from '@/lib/query-keys';
import { pathsEqual } from '@/lib/utils';
import type { WorktreeInfo } from '../types';

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
  const queryClient = useQueryClient();

  const currentWorktree = useAppStore((s) => s.getCurrentWorktree(projectPath));
  const setCurrentWorktree = useAppStore((s) => s.setCurrentWorktree);
  const setWorktreesInStore = useAppStore((s) => s.setWorktrees);
  const useWorktreesEnabled = useAppStore((s) => s.useWorktrees);

  // Use the React Query hook
  const { data, isLoading, refetch } = useWorktreesQuery(projectPath);
  const worktrees = (data?.worktrees ?? []) as WorktreeInfo[];

  // Sync worktrees to Zustand store when they change
  useEffect(() => {
    if (worktrees.length > 0) {
      setWorktreesInStore(projectPath, worktrees);
    }
  }, [worktrees, projectPath, setWorktreesInStore]);

  // Handle removed worktrees callback when data changes
  const prevRemovedWorktreesRef = useRef<string | null>(null);
  useEffect(() => {
    if (data?.removedWorktrees && data.removedWorktrees.length > 0) {
      // Create a stable key to avoid duplicate callbacks
      const key = JSON.stringify(data.removedWorktrees);
      if (key !== prevRemovedWorktreesRef.current) {
        prevRemovedWorktreesRef.current = key;
        onRemovedWorktrees?.(data.removedWorktrees);
      }
    }
  }, [data?.removedWorktrees, onRemovedWorktrees]);

  // Handle refresh trigger
  useEffect(() => {
    if (refreshTrigger > 0) {
      // Invalidate and refetch to get fresh data including any removed worktrees
      queryClient.invalidateQueries({
        queryKey: queryKeys.worktrees.all(projectPath),
      });
    }
  }, [refreshTrigger, projectPath, queryClient]);

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

  // fetchWorktrees for backward compatibility - now just triggers a refetch
  const fetchWorktrees = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.worktrees.all(projectPath),
    });
    return refetch();
  }, [projectPath, queryClient, refetch]);

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
