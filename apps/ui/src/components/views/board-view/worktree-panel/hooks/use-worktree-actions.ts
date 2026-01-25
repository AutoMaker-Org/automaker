import { useState, useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { createLogger } from '@automaker/utils/logger';
import { getElectronAPI } from '@/lib/electron';
import { toast } from 'sonner';
import {
  useSwitchBranch,
  usePullWorktree,
  usePushWorktree,
  useOpenInEditor,
} from '@/hooks/mutations';
import type { WorktreeInfo } from '../types';

const logger = createLogger('WorktreeActions');

export function useWorktreeActions() {
  const navigate = useNavigate();
  const [isActivating, setIsActivating] = useState(false);

  // Use React Query mutations
  const switchBranchMutation = useSwitchBranch();
  const pullMutation = usePullWorktree();
  const pushMutation = usePushWorktree();
  const openInEditorMutation = useOpenInEditor();

  const handleSwitchBranch = useCallback(
    async (worktree: WorktreeInfo, branchName: string) => {
      if (switchBranchMutation.isPending || branchName === worktree.branch) return;
      switchBranchMutation.mutate({
        worktreePath: worktree.path,
        branchName,
      });
    },
    [switchBranchMutation]
  );

  const handlePull = useCallback(
    async (worktree: WorktreeInfo) => {
      if (pullMutation.isPending) return;
      pullMutation.mutate(worktree.path);
    },
    [pullMutation]
  );

  const handlePush = useCallback(
    async (worktree: WorktreeInfo) => {
      if (pushMutation.isPending) return;
      pushMutation.mutate({
        worktreePath: worktree.path,
      });
    },
    [pushMutation]
  );

  const handleOpenInIntegratedTerminal = useCallback(
    (worktree: WorktreeInfo, mode?: 'tab' | 'split') => {
      // Navigate to the terminal view with the worktree path and branch name
      // The terminal view will handle creating the terminal with the specified cwd
      // Include nonce to allow opening the same worktree multiple times
      navigate({
        to: '/terminal',
        search: { cwd: worktree.path, branch: worktree.branch, mode, nonce: Date.now() },
      });
    },
    [navigate]
  );

  const handleOpenInEditor = useCallback(
    async (worktree: WorktreeInfo, editorCommand?: string) => {
      openInEditorMutation.mutate({
        worktreePath: worktree.path,
        editorCommand,
      });
    },
    [openInEditorMutation]
  );

  const handleOpenInExternalTerminal = useCallback(
    async (worktree: WorktreeInfo, terminalId?: string) => {
      try {
        const api = getElectronAPI();
        if (!api?.worktree?.openInExternalTerminal) {
          logger.warn('Open in external terminal API not available');
          return;
        }
        const result = await api.worktree.openInExternalTerminal(worktree.path, terminalId);
        if (result.success && result.result) {
          toast.success(result.result.message);
        } else if (result.error) {
          toast.error(result.error);
        }
      } catch (error) {
        logger.error('Open in external terminal failed:', error);
      }
    },
    []
  );

  return {
    isPulling: pullMutation.isPending,
    isPushing: pushMutation.isPending,
    isSwitching: switchBranchMutation.isPending,
    isActivating,
    setIsActivating,
    handleSwitchBranch,
    handlePull,
    handlePush,
    handleOpenInIntegratedTerminal,
    handleOpenInEditor,
    handleOpenInExternalTerminal,
  };
}
