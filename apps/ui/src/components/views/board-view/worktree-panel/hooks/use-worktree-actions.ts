import { useState, useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { createLogger } from '@automaker/utils/logger';
import { getElectronAPI } from '@/lib/electron';
import { getHttpApiClient } from '@/lib/http-api-client';
import { toast } from 'sonner';
import {
  useSwitchBranch,
  usePullWorktree,
  usePushWorktree,
  useOpenInEditor,
} from '@/hooks/mutations';
import type { WorktreeInfo } from '../types';
import type { UncommittedChangesInfo } from '../../dialogs/stash-confirm-dialog';

const logger = createLogger('WorktreeActions');

/** Pending branch switch details, stored while awaiting user confirmation */
export interface PendingSwitchInfo {
  worktree: WorktreeInfo;
  branchName: string;
  changesInfo: UncommittedChangesInfo;
}

interface UseWorktreeActionsOptions {
  /** Callback when merge conflicts occur after branch switch stash reapply */
  onBranchSwitchConflict?: (info: {
    worktreePath: string;
    branchName: string;
    previousBranch: string;
  }) => void;
  /** Callback when checkout fails AND the stash-pop restoration produces merge conflicts */
  onStashPopConflict?: (info: {
    worktreePath: string;
    branchName: string;
    stashPopConflictMessage: string;
  }) => void;
}

export function useWorktreeActions(options?: UseWorktreeActionsOptions) {
  const navigate = useNavigate();
  const [isActivating, setIsActivating] = useState(false);

  // Pending branch switch state (waiting for user stash decision)
  const [pendingSwitch, setPendingSwitch] = useState<PendingSwitchInfo | null>(null);

  // Use React Query mutations
  const switchBranchMutation = useSwitchBranch({
    onConflict: options?.onBranchSwitchConflict,
    onStashPopConflict: options?.onStashPopConflict,
  });
  const pullMutation = usePullWorktree();
  const pushMutation = usePushWorktree();
  const openInEditorMutation = useOpenInEditor();

  /**
   * Initiate a branch switch.
   * First checks for uncommitted changes and, if found, stores the pending
   * switch so the caller can show a confirmation dialog.
   */
  const handleSwitchBranch = useCallback(
    async (worktree: WorktreeInfo, branchName: string) => {
      if (switchBranchMutation.isPending || branchName === worktree.branch) return;

      // Check for uncommitted changes before switching
      try {
        const api = getHttpApiClient();
        const changesResult = await api.worktree.checkChanges(worktree.path);

        if (changesResult.success && changesResult.result?.hasChanges) {
          // Store the pending switch and let the UI show the confirmation dialog
          setPendingSwitch({
            worktree,
            branchName,
            changesInfo: {
              staged: changesResult.result.staged,
              unstaged: changesResult.result.unstaged,
              untracked: changesResult.result.untracked,
              totalFiles: changesResult.result.totalFiles,
            },
          });
          return;
        }
      } catch (err) {
        // If we can't check for changes, proceed with the switch (server will auto-stash)
        logger.warn('Failed to check for uncommitted changes, proceeding with switch:', err);
      }

      // No changes detected, proceed directly (server still handles stash as safety net)
      switchBranchMutation.mutate({
        worktreePath: worktree.path,
        branchName,
      });
    },
    [switchBranchMutation]
  );

  /**
   * Confirm the pending branch switch after the user chooses an action.
   * The server-side performSwitchBranch always auto-stashes when there are changes,
   * so when the user chooses "proceed without stashing" we still switch (the server
   * detects and stashes automatically). When "cancel", we just clear the pending state.
   */
  const confirmPendingSwitch = useCallback(
    (action: 'stash-and-proceed' | 'proceed-without-stash' | 'cancel') => {
      if (!pendingSwitch) return;

      if (action === 'cancel') {
        setPendingSwitch(null);
        return;
      }

      // Both 'stash-and-proceed' and 'proceed-without-stash' trigger the switch.
      // The server-side performSwitchBranch handles the stash/pop cycle automatically.
      // 'proceed-without-stash' means the user is OK with the server's auto-stash behavior.
      switchBranchMutation.mutate({
        worktreePath: pendingSwitch.worktree.path,
        branchName: pendingSwitch.branchName,
      });

      setPendingSwitch(null);
    },
    [pendingSwitch, switchBranchMutation]
  );

  /** Clear the pending switch without performing any action */
  const cancelPendingSwitch = useCallback(() => {
    setPendingSwitch(null);
  }, []);

  const handlePull = useCallback(
    async (worktree: WorktreeInfo, remote?: string) => {
      if (pullMutation.isPending) return;
      pullMutation.mutate({
        worktreePath: worktree.path,
        remote,
      });
    },
    [pullMutation]
  );

  const handlePush = useCallback(
    async (worktree: WorktreeInfo, remote?: string) => {
      if (pushMutation.isPending) return;
      pushMutation.mutate({
        worktreePath: worktree.path,
        remote,
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

  const handleRunTerminalScript = useCallback(
    (worktree: WorktreeInfo, command: string) => {
      // Navigate to the terminal view with the worktree path, branch, and command to run
      // The terminal view will create a new terminal and automatically execute the command
      navigate({
        to: '/terminal',
        search: {
          cwd: worktree.path,
          branch: worktree.branch,
          mode: 'tab' as const,
          nonce: Date.now(),
          command,
        },
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
    handleRunTerminalScript,
    handleOpenInEditor,
    handleOpenInExternalTerminal,
    // Stash confirmation state for branch switching
    pendingSwitch,
    confirmPendingSwitch,
    cancelPendingSwitch,
  };
}
