import { useState, useCallback } from 'react';
import { getElectronAPI } from '@/lib/electron';
import { toast } from 'sonner';
import type { WorktreeInfo } from '../types';

// Error codes that need special user-friendly handling
const GIT_STATUS_ERROR_CODES = ['NOT_GIT_REPO', 'NO_COMMITS'] as const;
type GitStatusErrorCode = (typeof GIT_STATUS_ERROR_CODES)[number];

// User-friendly messages for git status errors
const GIT_STATUS_ERROR_MESSAGES: Record<GitStatusErrorCode, string> = {
  NOT_GIT_REPO: 'This directory is not a git repository',
  NO_COMMITS: 'Repository has no commits yet. Create an initial commit first.',
};

/**
 * Helper to handle git status errors with user-friendly messages.
 * @returns true if the error was a git status error and was handled, false otherwise.
 */
function handleGitStatusError(result: { code?: string; error?: string }): boolean {
  const errorCode = result.code as GitStatusErrorCode | undefined;
  if (errorCode && GIT_STATUS_ERROR_CODES.includes(errorCode)) {
    toast.info(GIT_STATUS_ERROR_MESSAGES[errorCode] || result.error);
    return true;
  }
  return false;
}

interface UseWorktreeActionsOptions {
  fetchWorktrees: () => Promise<Array<{ path: string; branch: string }> | undefined>;
  fetchBranches: (worktreePath: string) => Promise<void>;
}

export function useWorktreeActions({ fetchWorktrees, fetchBranches }: UseWorktreeActionsOptions) {
  const [isPulling, setIsPulling] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [isActivating, setIsActivating] = useState(false);

  const handleSwitchBranch = useCallback(
    async (worktree: WorktreeInfo, branchName: string) => {
      if (isSwitching || branchName === worktree.branch) return;
      setIsSwitching(true);
      try {
        const api = getElectronAPI();
        if (!api?.worktree?.switchBranch) {
          toast.error('Switch branch API not available');
          return;
        }
        const result = await api.worktree.switchBranch(worktree.path, branchName);
        if (result.success && result.result) {
          toast.success(result.result.message);
          fetchWorktrees();
        } else {
          if (handleGitStatusError(result)) return;
          toast.error(result.error || 'Failed to switch branch');
        }
      } catch (error) {
        console.error('Switch branch failed:', error);
        toast.error('Failed to switch branch');
      } finally {
        setIsSwitching(false);
      }
    },
    [isSwitching, fetchWorktrees]
  );

  const handlePull = useCallback(
    async (worktree: WorktreeInfo) => {
      if (isPulling) return;
      setIsPulling(true);
      try {
        const api = getElectronAPI();
        if (!api?.worktree?.pull) {
          toast.error('Pull API not available');
          return;
        }
        const result = await api.worktree.pull(worktree.path);
        if (result.success && result.result) {
          toast.success(result.result.message);
          fetchWorktrees();
        } else {
          if (handleGitStatusError(result)) return;
          toast.error(result.error || 'Failed to pull latest changes');
        }
      } catch (error) {
        console.error('Pull failed:', error);
        toast.error('Failed to pull latest changes');
      } finally {
        setIsPulling(false);
      }
    },
    [isPulling, fetchWorktrees]
  );

  const handlePush = useCallback(
    async (worktree: WorktreeInfo) => {
      if (isPushing) return;
      setIsPushing(true);
      try {
        const api = getElectronAPI();
        if (!api?.worktree?.push) {
          toast.error('Push API not available');
          return;
        }
        const result = await api.worktree.push(worktree.path);
        if (result.success && result.result) {
          toast.success(result.result.message);
          fetchBranches(worktree.path);
          fetchWorktrees();
        } else {
          if (handleGitStatusError(result)) return;
          toast.error(result.error || 'Failed to push changes');
        }
      } catch (error) {
        console.error('Push failed:', error);
        toast.error('Failed to push changes');
      } finally {
        setIsPushing(false);
      }
    },
    [isPushing, fetchBranches, fetchWorktrees]
  );

  const handleOpenInEditor = useCallback(async (worktree: WorktreeInfo) => {
    try {
      const api = getElectronAPI();
      if (!api?.worktree?.openInEditor) {
        console.warn('Open in editor API not available');
        return;
      }
      const result = await api.worktree.openInEditor(worktree.path);
      if (result.success && result.result) {
        toast.success(result.result.message);
      } else if (result.error) {
        toast.error(result.error);
      }
    } catch (error) {
      console.error('Open in editor failed:', error);
    }
  }, []);

  return {
    isPulling,
    isPushing,
    isSwitching,
    isActivating,
    setIsActivating,
    handleSwitchBranch,
    handlePull,
    handlePush,
    handleOpenInEditor,
  };
}
