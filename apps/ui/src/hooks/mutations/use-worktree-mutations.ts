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
    mutationFn: async ({ worktreePath, message }: { worktreePath: string; message: string }) => {
      const api = getElectronAPI();
      const result = await api.worktree.commit(worktreePath, message);
      if (!result.success) {
        throw new Error(result.error || 'Failed to commit changes');
      }
      return result.result;
    },
    onSuccess: (_, { worktreePath }) => {
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
    mutationFn: async ({ worktreePath, force }: { worktreePath: string; force?: boolean }) => {
      const api = getElectronAPI();
      const result = await api.worktree.push(worktreePath, force);
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
 * @returns Mutation for pulling changes
 */
export function usePullWorktree() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (worktreePath: string) => {
      const api = getElectronAPI();
      const result = await api.worktree.pull(worktreePath);
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
      const result = await api.worktree.mergeFeature(
        projectPath,
        branchName,
        worktreePath,
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
 * @returns Mutation for switching branches
 */
export function useSwitchBranch() {
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
      const result = await api.worktree.switchBranch(worktreePath, branchName);
      if (!result.success) {
        throw new Error(result.error || 'Failed to switch branch');
      }
      return result.result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worktrees'] });
      toast.success('Switched branch');
    },
    onError: (error: Error) => {
      toast.error('Failed to switch branch', {
        description: error.message,
      });
    },
  });
}

/**
 * Checkout a new branch
 *
 * @returns Mutation for creating and checking out a new branch
 */
export function useCheckoutBranch() {
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
      const result = await api.worktree.checkoutBranch(worktreePath, branchName);
      if (!result.success) {
        throw new Error(result.error || 'Failed to checkout branch');
      }
      return result.result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worktrees'] });
      toast.success('New branch created and checked out');
    },
    onError: (error: Error) => {
      toast.error('Failed to checkout branch', {
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
