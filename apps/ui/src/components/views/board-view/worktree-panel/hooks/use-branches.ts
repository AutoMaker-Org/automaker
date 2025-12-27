import { useState, useCallback } from 'react';
import { getElectronAPI } from '@/lib/electron';
import type { BranchInfo, GitRepoStatus } from '../types';

export function useBranches() {
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [aheadCount, setAheadCount] = useState(0);
  const [behindCount, setBehindCount] = useState(0);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [branchFilter, setBranchFilter] = useState('');
  const [gitRepoStatus, setGitRepoStatus] = useState<GitRepoStatus>({
    isGitRepo: true,
    hasCommits: true,
  });

  /** Helper to reset branch state to initial values */
  const resetBranchState = useCallback(() => {
    setBranches([]);
    setAheadCount(0);
    setBehindCount(0);
  }, []);

  const fetchBranches = useCallback(
    async (worktreePath: string) => {
      setIsLoadingBranches(true);
      try {
        const api = getElectronAPI();
        if (!api?.worktree?.listBranches) {
          console.warn('List branches API not available');
          return;
        }
        const result = await api.worktree.listBranches(worktreePath);
        if (result.success && result.result) {
          setBranches(result.result.branches);
          setAheadCount(result.result.aheadCount || 0);
          setBehindCount(result.result.behindCount || 0);
          setGitRepoStatus({ isGitRepo: true, hasCommits: true });
        } else if (result.code === 'NOT_GIT_REPO') {
          // Not a git repository - clear branches silently without logging an error
          resetBranchState();
          setGitRepoStatus({ isGitRepo: false, hasCommits: false });
        } else if (result.code === 'NO_COMMITS') {
          // Git repo but no commits yet - clear branches silently without logging an error
          resetBranchState();
          setGitRepoStatus({ isGitRepo: true, hasCommits: false });
        } else if (!result.success) {
          // Other errors - log them
          console.warn('Failed to fetch branches:', result.error);
          resetBranchState();
        }
      } catch (error) {
        console.error('Failed to fetch branches:', error);
        resetBranchState();
        // Reset git status to unknown state on network/API errors
        setGitRepoStatus({ isGitRepo: true, hasCommits: true });
      } finally {
        setIsLoadingBranches(false);
      }
    },
    [resetBranchState]
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
    isLoadingBranches,
    branchFilter,
    setBranchFilter,
    resetBranchFilter,
    fetchBranches,
    gitRepoStatus,
  };
}
