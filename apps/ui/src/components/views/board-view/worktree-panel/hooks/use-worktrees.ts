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

  // Sync worktrees to Zustand store when they change.
  // Use a ref to track the previous worktrees and skip the store update when the
  // data hasn't structurally changed. Without this check, every React Query refetch
  // (triggered by WebSocket event invalidations) would update the store even when
  // the worktree list is identical, causing a cascade of re-renders in BoardView →
  // selectedWorktree → useAutoMode → refreshStatus that can trigger React error #185.
  const prevWorktreesJsonRef = useRef<string>('');
  useEffect(() => {
    if (worktrees.length > 0) {
      // Compare serialized worktrees to skip no-op store updates
      const json = JSON.stringify(worktrees);
      if (json !== prevWorktreesJsonRef.current) {
        prevWorktreesJsonRef.current = json;
        setWorktreesInStore(projectPath, worktrees);
      }
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

  const currentWorktreePath = currentWorktree?.path ?? null;

  const handleSelectWorktree = useCallback(
    (worktree: WorktreeInfo) => {
      // Skip invalidation when re-selecting the already-active worktree
      const isSameWorktree = worktree.isMain
        ? currentWorktreePath === null
        : pathsEqual(worktree.path, currentWorktreePath ?? '');

      if (isSameWorktree) return;

      setCurrentWorktree(projectPath, worktree.isMain ? null : worktree.path, worktree.branch);

      // Defer feature query invalidation so the store update and client-side
      // re-filtering happen in the current render cycle first. The features
      // list is the same regardless of worktree (filtering is client-side),
      // so the board updates instantly. The deferred invalidation ensures
      // feature card details (planSpec, todo lists) are refreshed in the
      // background without blocking the worktree switch.
      setTimeout(() => {
        queryClient.invalidateQueries({
          queryKey: queryKeys.features.all(projectPath),
        });
      }, 0);
    },
    [projectPath, setCurrentWorktree, queryClient, currentWorktreePath]
  );

  // fetchWorktrees for backward compatibility - now just triggers a refetch
  // The silent option is accepted but not used (React Query handles loading states)
  // Returns removed worktrees array if any were detected, undefined otherwise
  const fetchWorktrees = useCallback(
    async (_options?: {
      silent?: boolean;
    }): Promise<Array<{ path: string; branch: string }> | undefined> => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.worktrees.all(projectPath),
      });
      const result = await refetch();
      return result.data?.removedWorktrees;
    },
    [projectPath, queryClient, refetch]
  );

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
