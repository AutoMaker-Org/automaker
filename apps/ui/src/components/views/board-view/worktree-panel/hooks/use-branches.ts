import { useState, useCallback } from 'react';
import { useWorktreeBranches } from '@/hooks/queries';
import type { GitRepoStatus } from '../types';

/**
 * Hook for managing branch data with React Query
 *
 * Uses useWorktreeBranches for data fetching while maintaining
 * the current interface for backward compatibility. Tracks which
 * worktree path is currently being viewed and fetches branches on demand.
 */
export function useBranches() {
  const [currentWorktreePath, setCurrentWorktreePath] = useState<string | undefined>();
  const [branchFilter, setBranchFilter] = useState('');

  const {
    data: branchData,
    isLoading: isLoadingBranches,
    refetch,
  } = useWorktreeBranches(currentWorktreePath);

  const branches = branchData?.branches ?? [];
  const aheadCount = branchData?.aheadCount ?? 0;
  const behindCount = branchData?.behindCount ?? 0;
  const hasRemoteBranch = branchData?.hasRemoteBranch ?? false;
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

  const filteredBranches = branches.filter((b) =>
    b.name.toLowerCase().includes(branchFilter.toLowerCase())
  );

  return {
    branches,
    filteredBranches,
    aheadCount,
    behindCount,
    hasRemoteBranch,
    isLoadingBranches,
    branchFilter,
    setBranchFilter,
    resetBranchFilter,
    fetchBranches,
    gitRepoStatus,
  };
}
