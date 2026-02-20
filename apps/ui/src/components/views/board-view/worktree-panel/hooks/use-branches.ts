import { useState, useCallback, useRef, useEffect } from 'react';
import { useWorktreeBranches } from '@/hooks/queries';
import type { GitRepoStatus } from '../types';

/** Explicit return type for the useBranches hook */
export interface UseBranchesReturn {
  branches: Array<{ name: string; isCurrent: boolean; isRemote: boolean }>;
  filteredBranches: Array<{ name: string; isCurrent: boolean; isRemote: boolean }>;
  aheadCount: number;
  behindCount: number;
  hasRemoteBranch: boolean;
  /**
   * @deprecated Use {@link getTrackingRemote}(worktreePath) instead — this value
   * only reflects the last-queried worktree and is unreliable when multiple panels
   * share the hook.
   */
  trackingRemote: string | undefined;
  /** Per-worktree tracking remote lookup — avoids stale values when multiple panels share the hook */
  getTrackingRemote: (worktreePath: string) => string | undefined;
  isLoadingBranches: boolean;
  branchFilter: string;
  setBranchFilter: (filter: string) => void;
  resetBranchFilter: () => void;
  fetchBranches: (worktreePath: string) => void;
  /** Prune cached tracking-remote entries for worktree paths that no longer exist */
  pruneStaleEntries: (activePaths: Set<string>) => void;
  gitRepoStatus: GitRepoStatus;
}

/**
 * Hook for managing branch data with React Query
 *
 * Uses useWorktreeBranches for data fetching while maintaining
 * the current interface for backward compatibility. Tracks which
 * worktree path is currently being viewed and fetches branches on demand.
 */
export function useBranches(): UseBranchesReturn {
  const [currentWorktreePath, setCurrentWorktreePath] = useState<string | undefined>();
  const [branchFilter, setBranchFilter] = useState('');

  const {
    data: branchData,
    isLoading: isLoadingBranches,
    refetch,
  } = useWorktreeBranches(currentWorktreePath, true);

  const branches = branchData?.branches ?? [];
  const aheadCount = branchData?.aheadCount ?? 0;
  const behindCount = branchData?.behindCount ?? 0;
  const hasRemoteBranch = branchData?.hasRemoteBranch ?? false;
  const trackingRemote = branchData?.trackingRemote;

  // Per-worktree tracking remote cache: keeps results from previous fetchBranches()
  // calls so multiple WorktreePanel instances don't all share a single stale value.
  const trackingRemoteByPathRef = useRef<Record<string, string | undefined>>({});

  // Update cache whenever query data changes for the current path
  useEffect(() => {
    if (currentWorktreePath && branchData) {
      trackingRemoteByPathRef.current[currentWorktreePath] = branchData.trackingRemote;
    }
  }, [currentWorktreePath, branchData]);

  const getTrackingRemote = useCallback(
    (worktreePath: string): string | undefined => {
      // If asking about the currently active query path, use fresh data
      if (worktreePath === currentWorktreePath) {
        return trackingRemote;
      }
      // Otherwise fall back to the cached value from a previous fetch
      return trackingRemoteByPathRef.current[worktreePath];
    },
    [currentWorktreePath, trackingRemote]
  );

  // Use conservative defaults (false) until data is confirmed
  // This prevents the UI from assuming git capabilities before the query completes
  const gitRepoStatus: GitRepoStatus = {
    isGitRepo: branchData?.isGitRepo ?? false,
    hasCommits: branchData?.hasCommits ?? false,
  };

  const fetchBranches = useCallback(
    (worktreePath: string) => {
      if (worktreePath === currentWorktreePath) {
        // Same path - just refetch to get latest data
        refetch();
      } else {
        // Different path - update the tracked path (triggers new query)
        setCurrentWorktreePath(worktreePath);
      }
    },
    [currentWorktreePath, refetch]
  );

  const resetBranchFilter = useCallback(() => {
    setBranchFilter('');
  }, []);

  /** Remove cached tracking-remote entries for worktree paths that no longer exist. */
  const pruneStaleEntries = useCallback((activePaths: Set<string>) => {
    const cache = trackingRemoteByPathRef.current;
    for (const key of Object.keys(cache)) {
      if (!activePaths.has(key)) {
        delete cache[key];
      }
    }
  }, []);

  const filteredBranches = branches.filter((b) =>
    b.name.toLowerCase().includes(branchFilter.toLowerCase())
  );

  return {
    branches,
    filteredBranches,
    aheadCount,
    behindCount,
    hasRemoteBranch,
    trackingRemote,
    getTrackingRemote,
    isLoadingBranches,
    branchFilter,
    setBranchFilter,
    resetBranchFilter,
    fetchBranches,
    pruneStaleEntries,
    gitRepoStatus,
  };
}
