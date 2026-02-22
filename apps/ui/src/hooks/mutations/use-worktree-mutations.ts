/**
 * Worktree Mutations
 *
 * React Query mutations for worktree operations like creating, deleting,
 * committing, pushing, and creating pull requests.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getElectronAPI } from '@/lib/electron';
import { queryKeys } from '@/lib/query-keys';
import { toast } from 'sonner';

/**
 * Create a new worktree
 *
 * @param projectPath - Path to the project
 * @returns Mutation for creating a worktree
 */
export function useCreateWorktree(projectPath: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ branchName, baseBranch }: { branchName: string; baseBranch?: string }) => {
      const api = getElectronAPI();
      if (!api.worktree) throw new Error('Worktree API not available');
      const result = await api.worktree.create(projectPath, branchName, baseBranch);
      if (!result.success) {
        throw new Error(result.error || 'Failed to create worktree');
      }
      return result.worktree;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.worktrees.all(projectPath) });
      toast.success('Worktree created');
    },
    onError: (error: Error) => {
      toast.error('Failed to create worktree', {
        description: error.message,
      });
    },
  });
}

/**
 * Delete a worktree
 *
 * @param projectPath - Path to the project
 * @returns Mutation for deleting a worktree
 */
export function useDeleteWorktree(projectPath: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      worktreePath,
      deleteBranch,
    }: {
      worktreePath: string;
      deleteBranch?: boolean;
    }) => {
      const api = getElectronAPI();
      if (!api.worktree) throw new Error('Worktree API not available');
      const result = await api.worktree.delete(projectPath, worktreePath, deleteBranch);
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete worktree');
      }
      return result.deleted;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.worktrees.all(projectPath) });
      toast.success('Worktree deleted');
    },
    onError: (error: Error) => {
      toast.error('Failed to delete worktree', {
        description: error.message,
      });
    },
  });
}

/**
 * Commit changes in a worktree
 *
 * @returns Mutation for committing changes
 */
export function useCommitWorktree() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      worktreePath,
      message,
      files,
    }: {
      worktreePath: string;
      message: string;
      files?: string[];
    }) => {
      const api = getElectronAPI();
      if (!api.worktree) throw new Error('Worktree API not available');
      const result = await api.worktree.commit(worktreePath, message, files);
      if (!result.success) {
        throw new Error(result.error || 'Failed to commit changes');
      }
      return result.result;
    },
    onSuccess: (_, { worktreePath: _worktreePath }) => {
      // Invalidate all worktree queries since we don't know the project path
      queryClient.invalidateQueries({ queryKey: ['worktrees'] });
      toast.success('Changes committed');
    },
    onError: (error: Error) => {
      toast.error('Failed to commit changes', {
        description: error.message,
      });
    },
  });
}

/**
 * Push worktree branch to remote
 *
 * @returns Mutation for pushing changes
 */
export function usePushWorktree() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      worktreePath,
      force,
      remote,
    }: {
      worktreePath: string;
      force?: boolean;
      remote?: string;
    }) => {
      const api = getElectronAPI();
      if (!api.worktree) throw new Error('Worktree API not available');
      const result = await api.worktree.push(worktreePath, force, remote);
      if (!result.success) {
        throw new Error(result.error || 'Failed to push changes');
      }
      return result.result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worktrees'] });
      toast.success('Changes pushed to remote');
    },
    onError: (error: Error) => {
      toast.error('Failed to push changes', {
        description: error.message,
      });
    },
  });
}

/**
 * Pull changes from remote
 *
 * Enhanced to support stash management. When stashIfNeeded is true,
 * local changes will be automatically stashed before pulling and
 * reapplied afterward.
 *
 * @returns Mutation for pulling changes
 */
export function usePullWorktree() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      worktreePath,
      remote,
      stashIfNeeded,
    }: {
      worktreePath: string;
      remote?: string;
      stashIfNeeded?: boolean;
    }) => {
      const api = getElectronAPI();
      if (!api.worktree) throw new Error('Worktree API not available');
      const result = await api.worktree.pull(worktreePath, remote, stashIfNeeded);
      if (!result.success) {
        throw new Error(result.error || 'Failed to pull changes');
      }
      return result.result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worktrees'] });
      toast.success('Changes pulled from remote');
    },
    onError: (error: Error) => {
      toast.error('Failed to pull changes', {
        description: error.message,
      });
    },
  });
}

/**
 * Sync worktree branch (pull then push)
 *
 * @returns Mutation for syncing changes
 */
export function useSyncWorktree() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ worktreePath, remote }: { worktreePath: string; remote?: string }) => {
      const api = getElectronAPI();
      if (!api.worktree) throw new Error('Worktree API not available');
      const result = await api.worktree.sync(worktreePath, remote);
      if (!result.success) {
        throw new Error(result.error || 'Failed to sync');
      }
      return result.result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worktrees'] });
      toast.success('Branch synced with remote');
    },
    onError: (error: Error) => {
      toast.error('Failed to sync', {
        description: error.message,
      });
    },
  });
}

/**
 * Set upstream tracking branch
 *
 * @returns Mutation for setting tracking branch
 */
export function useSetTracking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      worktreePath,
      remote,
      branch,
    }: {
      worktreePath: string;
      remote: string;
      branch?: string;
    }) => {
      const api = getElectronAPI();
      if (!api.worktree) throw new Error('Worktree API not available');
      const result = await api.worktree.setTracking(worktreePath, remote, branch);
      if (!result.success) {
        throw new Error(result.error || 'Failed to set tracking branch');
      }
      return result.result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['worktrees'] });
      toast.success('Tracking branch set', {
        description: result?.message,
      });
    },
    onError: (error: Error) => {
      toast.error('Failed to set tracking branch', {
        description: error.message,
      });
    },
  });
}

/**
 * Create a pull request from a worktree
 *
 * @returns Mutation for creating a PR
 */
export function useCreatePullRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      worktreePath,
      options,
    }: {
      worktreePath: string;
      options?: {
        projectPath?: string;
        commitMessage?: string;
        prTitle?: string;
        prBody?: string;
        baseBranch?: string;
        draft?: boolean;
      };
    }) => {
      const api = getElectronAPI();
      if (!api.worktree) throw new Error('Worktree API not available');
      const result = await api.worktree.createPR(worktreePath, options);
      if (!result.success) {
        throw new Error(result.error || 'Failed to create pull request');
      }
      return result.result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['worktrees'] });
      queryClient.invalidateQueries({ queryKey: ['github', 'prs'] });
      if (result?.prUrl) {
        toast.success('Pull request created', {
          description: `PR #${result.prNumber} created`,
          action: {
            label: 'Open',
            onClick: () => {
              const api = getElectronAPI();
              api.openExternalLink(result.prUrl!);
            },
          },
        });
      } else if (result?.prAlreadyExisted) {
        toast.info('Pull request already exists');
      }
    },
    onError: (error: Error) => {
      toast.error('Failed to create pull request', {
        description: error.message,
      });
    },
  });
}

/**
 * Merge a worktree branch into main
 *
 * @param projectPath - Path to the project
 * @returns Mutation for merging a feature
 */
export function useMergeWorktree(projectPath: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      branchName,
      worktreePath,
      options,
    }: {
      branchName: string;
      worktreePath: string;
      options?: {
        squash?: boolean;
        message?: string;
      };
    }) => {
      const api = getElectronAPI();
      if (!api.worktree) throw new Error('Worktree API not available');
      const result = await api.worktree.mergeFeature(
        projectPath,
        branchName,
        worktreePath,
        undefined, // targetBranch - use default (main)
        options
      );
      if (!result.success) {
        throw new Error(result.error || 'Failed to merge feature');
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.worktrees.all(projectPath) });
      queryClient.invalidateQueries({ queryKey: queryKeys.features.all(projectPath) });
      toast.success('Feature merged successfully');
    },
    onError: (error: Error) => {
      toast.error('Failed to merge feature', {
        description: error.message,
      });
    },
  });
}

/**
 * Switch to a different branch
 *
 * Automatically stashes local changes before switching and reapplies them after.
 * If the reapply causes merge conflicts, the onConflict callback is called so
 * the UI can create a conflict resolution task.
 *
 * If the checkout itself fails and the stash-pop used to restore changes also
 * produces conflicts, the onStashPopConflict callback is called so the UI can
 * create an AI-assisted conflict resolution task on the board.
 *
 * @param options.onConflict - Callback when merge conflicts occur after stash reapply (success path)
 * @param options.onStashPopConflict - Callback when checkout fails AND stash-pop restoration has conflicts
 * @returns Mutation for switching branches
 */
export function useSwitchBranch(options?: {
  onConflict?: (info: { worktreePath: string; branchName: string; previousBranch: string }) => void;
  onStashPopConflict?: (info: {
    worktreePath: string;
    branchName: string;
    stashPopConflictMessage: string;
  }) => void;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      worktreePath,
      branchName,
    }: {
      worktreePath: string;
      branchName: string;
    }) => {
      const api = getElectronAPI();
      if (!api.worktree) throw new Error('Worktree API not available');
      const result = await api.worktree.switchBranch(worktreePath, branchName);
      if (!result.success) {
        // When the checkout failed and restoring the stash produced conflicts, surface
        // this as a structured error so the caller can create a board task for resolution.
        if (result.stashPopConflicts) {
          const conflictError = new Error(result.error || 'Failed to switch branch');
          // Attach the extra metadata so onError can forward it to the callback.
          (
            conflictError as Error & {
              stashPopConflicts: boolean;
              stashPopConflictMessage: string;
              worktreePath: string;
              branchName: string;
            }
          ).stashPopConflicts = true;
          (
            conflictError as Error & {
              stashPopConflicts: boolean;
              stashPopConflictMessage: string;
              worktreePath: string;
              branchName: string;
            }
          ).stashPopConflictMessage =
            result.stashPopConflictMessage ??
            'Stash pop resulted in conflicts: please resolve conflicts before retrying.';
          (
            conflictError as Error & {
              stashPopConflicts: boolean;
              stashPopConflictMessage: string;
              worktreePath: string;
              branchName: string;
            }
          ).worktreePath = worktreePath;
          (
            conflictError as Error & {
              stashPopConflicts: boolean;
              stashPopConflictMessage: string;
              worktreePath: string;
              branchName: string;
            }
          ).branchName = branchName;
          throw conflictError;
        }
        throw new Error(result.error || 'Failed to switch branch');
      }
      if (!result.result) {
        throw new Error('Switch branch returned no result');
      }
      return result.result;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['worktrees'] });

      if (data?.hasConflicts) {
        toast.warning('Switched branch with conflicts', {
          description: data.message,
          duration: 8000,
        });
        // Trigger conflict resolution callback
        options?.onConflict?.({
          worktreePath: variables.worktreePath,
          branchName: data.currentBranch,
          previousBranch: data.previousBranch,
        });
      } else {
        const desc = data?.stashedChanges ? 'Local changes were stashed and reapplied' : undefined;
        toast.success('Switched branch', { description: desc });
      }
    },
    onError: (error: Error) => {
      const enrichedError = error as Error & {
        stashPopConflicts?: boolean;
        stashPopConflictMessage?: string;
        worktreePath?: string;
        branchName?: string;
      };

      if (
        enrichedError.stashPopConflicts &&
        enrichedError.worktreePath &&
        enrichedError.branchName
      ) {
        // Checkout failed AND the stash-pop produced conflicts — notify the UI so it
        // can create an AI-assisted board task to guide the user through resolution.
        toast.error('Branch switch failed with stash conflicts', {
          description:
            enrichedError.stashPopConflictMessage ??
            'Stash pop resulted in conflicts. Please resolve the conflicts in your working tree.',
          duration: 10000,
        });
        options?.onStashPopConflict?.({
          worktreePath: enrichedError.worktreePath,
          branchName: enrichedError.branchName,
          stashPopConflictMessage:
            enrichedError.stashPopConflictMessage ??
            'Stash pop resulted in conflicts. Please resolve the conflicts in your working tree.',
        });
      } else {
        toast.error('Failed to switch branch', {
          description: error.message,
        });
      }
    },
  });
}

/**
 * Checkout a new branch
 *
 * Supports automatic stash handling. When stashChanges is true in the mutation
 * variables, local changes are stashed before creating the branch and reapplied
 * after. If the reapply causes merge conflicts, the onConflict callback is called.
 *
 * If the checkout itself fails and the stash-pop used to restore changes also
 * produces conflicts, the onStashPopConflict callback is called.
 *
 * @param options.onConflict - Callback when merge conflicts occur after stash reapply
 * @param options.onStashPopConflict - Callback when checkout fails AND stash-pop restoration has conflicts
 * @returns Mutation for creating and checking out a new branch
 */
export function useCheckoutBranch(options?: {
  onConflict?: (info: { worktreePath: string; branchName: string; previousBranch: string }) => void;
  onStashPopConflict?: (info: {
    worktreePath: string;
    branchName: string;
    stashPopConflictMessage: string;
  }) => void;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      worktreePath,
      branchName,
      baseBranch,
      stashChanges,
      includeUntracked,
    }: {
      worktreePath: string;
      branchName: string;
      baseBranch?: string;
      stashChanges?: boolean;
      includeUntracked?: boolean;
    }) => {
      const api = getElectronAPI();
      if (!api.worktree) throw new Error('Worktree API not available');
      const result = await api.worktree.checkoutBranch(
        worktreePath,
        branchName,
        baseBranch,
        stashChanges,
        includeUntracked
      );
      if (!result.success) {
        // When the checkout failed and restoring the stash produced conflicts
        if (result.stashPopConflicts) {
          const conflictError = new Error(result.error || 'Failed to checkout branch');
          (
            conflictError as Error & {
              stashPopConflicts: boolean;
              stashPopConflictMessage: string;
              worktreePath: string;
              branchName: string;
            }
          ).stashPopConflicts = true;
          (
            conflictError as Error & {
              stashPopConflicts: boolean;
              stashPopConflictMessage: string;
              worktreePath: string;
              branchName: string;
            }
          ).stashPopConflictMessage =
            result.stashPopConflictMessage ??
            'Stash pop resulted in conflicts: please resolve conflicts before retrying.';
          (
            conflictError as Error & {
              stashPopConflicts: boolean;
              stashPopConflictMessage: string;
              worktreePath: string;
              branchName: string;
            }
          ).worktreePath = worktreePath;
          (
            conflictError as Error & {
              stashPopConflicts: boolean;
              stashPopConflictMessage: string;
              worktreePath: string;
              branchName: string;
            }
          ).branchName = branchName;
          throw conflictError;
        }
        throw new Error(result.error || 'Failed to checkout branch');
      }
      return result.result;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['worktrees'] });

      if (data?.hasConflicts) {
        toast.warning('Branch created with conflicts', {
          description: data.message,
          duration: 8000,
        });
        options?.onConflict?.({
          worktreePath: variables.worktreePath,
          branchName: data.newBranch ?? variables.branchName,
          previousBranch: data.previousBranch ?? '',
        });
      } else {
        const desc = data?.stashedChanges ? 'Local changes were stashed and reapplied' : undefined;
        toast.success('New branch created and checked out', { description: desc });
      }
    },
    onError: (error: Error) => {
      const enrichedError = error as Error & {
        stashPopConflicts?: boolean;
        stashPopConflictMessage?: string;
        worktreePath?: string;
        branchName?: string;
      };

      if (
        enrichedError.stashPopConflicts &&
        enrichedError.worktreePath &&
        enrichedError.branchName
      ) {
        toast.error('Branch creation failed with stash conflicts', {
          description:
            enrichedError.stashPopConflictMessage ??
            'Stash pop resulted in conflicts. Please resolve the conflicts in your working tree.',
          duration: 10000,
        });
        options?.onStashPopConflict?.({
          worktreePath: enrichedError.worktreePath,
          branchName: enrichedError.branchName,
          stashPopConflictMessage:
            enrichedError.stashPopConflictMessage ??
            'Stash pop resulted in conflicts. Please resolve the conflicts in your working tree.',
        });
      } else {
        toast.error('Failed to checkout branch', {
          description: error.message,
        });
      }
    },
  });
}

/**
 * Generate a PR title and description from branch diff
 *
 * @returns Mutation for generating a PR description
 */
export function useGeneratePRDescription() {
  return useMutation({
    mutationFn: async ({
      worktreePath,
      baseBranch,
    }: {
      worktreePath: string;
      baseBranch?: string;
    }) => {
      const api = getElectronAPI();
      if (!api.worktree) throw new Error('Worktree API not available');
      const result = await api.worktree.generatePRDescription(worktreePath, baseBranch);
      if (!result.success) {
        throw new Error(result.error || 'Failed to generate PR description');
      }
      return { title: result.title ?? '', body: result.body ?? '' };
    },
    onError: (error: Error) => {
      toast.error('Failed to generate PR description', {
        description: error.message,
      });
    },
  });
}

/**
 * Generate a commit message from git diff
 *
 * @returns Mutation for generating a commit message
 */
export function useGenerateCommitMessage() {
  return useMutation({
    mutationFn: async (worktreePath: string) => {
      const api = getElectronAPI();
      if (!api.worktree) throw new Error('Worktree API not available');
      const result = await api.worktree.generateCommitMessage(worktreePath);
      if (!result.success) {
        throw new Error(result.error || 'Failed to generate commit message');
      }
      return result.message ?? '';
    },
    onError: (error: Error) => {
      toast.error('Failed to generate commit message', {
        description: error.message,
      });
    },
  });
}

/**
 * Open worktree in editor
 *
 * @returns Mutation for opening in editor
 */
export function useOpenInEditor() {
  return useMutation({
    mutationFn: async ({
      worktreePath,
      editorCommand,
    }: {
      worktreePath: string;
      editorCommand?: string;
    }) => {
      const api = getElectronAPI();
      if (!api.worktree) throw new Error('Worktree API not available');
      const result = await api.worktree.openInEditor(worktreePath, editorCommand);
      if (!result.success) {
        throw new Error(result.error || 'Failed to open in editor');
      }
      return result.result;
    },
    onError: (error: Error) => {
      toast.error('Failed to open in editor', {
        description: error.message,
      });
    },
  });
}

/**
 * Initialize git in a project
 *
 * @returns Mutation for initializing git
 */
export function useInitGit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (projectPath: string) => {
      const api = getElectronAPI();
      if (!api.worktree) throw new Error('Worktree API not available');
      const result = await api.worktree.initGit(projectPath);
      if (!result.success) {
        throw new Error(result.error || 'Failed to initialize git');
      }
      return result.result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worktrees'] });
      queryClient.invalidateQueries({ queryKey: ['github'] });
      toast.success('Git repository initialized');
    },
    onError: (error: Error) => {
      toast.error('Failed to initialize git', {
        description: error.message,
      });
    },
  });
}

/**
 * Set init script for a project
 *
 * @param projectPath - Path to the project
 * @returns Mutation for setting init script
 */
export function useSetInitScript(projectPath: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (content: string) => {
      const api = getElectronAPI();
      if (!api.worktree) throw new Error('Worktree API not available');
      const result = await api.worktree.setInitScript(projectPath, content);
      if (!result.success) {
        throw new Error(result.error || 'Failed to save init script');
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.worktrees.initScript(projectPath) });
      toast.success('Init script saved');
    },
    onError: (error: Error) => {
      toast.error('Failed to save init script', {
        description: error.message,
      });
    },
  });
}

/**
 * Delete init script for a project
 *
 * @param projectPath - Path to the project
 * @returns Mutation for deleting init script
 */
export function useDeleteInitScript(projectPath: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const api = getElectronAPI();
      if (!api.worktree) throw new Error('Worktree API not available');
      const result = await api.worktree.deleteInitScript(projectPath);
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete init script');
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.worktrees.initScript(projectPath) });
      toast.success('Init script deleted');
    },
    onError: (error: Error) => {
      toast.error('Failed to delete init script', {
        description: error.message,
      });
    },
  });
}
