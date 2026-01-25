/**
 * Auto Mode Mutations
 *
 * React Query mutations for auto mode operations like running features,
 * stopping features, and plan approval.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getElectronAPI } from '@/lib/electron';
import { queryKeys } from '@/lib/query-keys';
import { toast } from 'sonner';

/**
 * Start running a feature in auto mode
 *
 * @param projectPath - Path to the project
 * @returns Mutation for starting a feature
 *
 * @example
 * ```tsx
 * const startFeature = useStartFeature(projectPath);
 * startFeature.mutate({ featureId: 'abc123', useWorktrees: true });
 * ```
 */
export function useStartFeature(projectPath: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      featureId,
      useWorktrees,
      worktreePath,
    }: {
      featureId: string;
      useWorktrees?: boolean;
      worktreePath?: string;
    }) => {
      const api = getElectronAPI();
      const result = await api.autoMode.runFeature(
        projectPath,
        featureId,
        useWorktrees,
        worktreePath
      );
      if (!result.success) {
        throw new Error(result.error || 'Failed to start feature');
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.runningAgents.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.features.all(projectPath) });
    },
    onError: (error: Error) => {
      toast.error('Failed to start feature', {
        description: error.message,
      });
    },
  });
}

/**
 * Resume a paused or interrupted feature
 *
 * @param projectPath - Path to the project
 * @returns Mutation for resuming a feature
 */
export function useResumeFeature(projectPath: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      featureId,
      useWorktrees,
    }: {
      featureId: string;
      useWorktrees?: boolean;
    }) => {
      const api = getElectronAPI();
      const result = await api.autoMode.resumeFeature(projectPath, featureId, useWorktrees);
      if (!result.success) {
        throw new Error(result.error || 'Failed to resume feature');
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.runningAgents.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.features.all(projectPath) });
    },
    onError: (error: Error) => {
      toast.error('Failed to resume feature', {
        description: error.message,
      });
    },
  });
}

/**
 * Stop a running feature
 *
 * @returns Mutation for stopping a feature
 *
 * @example
 * ```tsx
 * const stopFeature = useStopFeature();
 * // Simple stop
 * stopFeature.mutate('feature-id');
 * // Stop with project path for cache invalidation
 * stopFeature.mutate({ featureId: 'feature-id', projectPath: '/path/to/project' });
 * ```
 */
export function useStopFeature() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: string | { featureId: string; projectPath?: string }) => {
      const featureId = typeof input === 'string' ? input : input.featureId;
      const api = getElectronAPI();
      const result = await api.autoMode.stopFeature(featureId);
      if (!result.success) {
        throw new Error(result.error || 'Failed to stop feature');
      }
      // Return projectPath for use in onSuccess
      return { ...result, projectPath: typeof input === 'string' ? undefined : input.projectPath };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.runningAgents.all() });
      // Also invalidate features cache if projectPath is provided
      if (data.projectPath) {
        queryClient.invalidateQueries({ queryKey: queryKeys.features.all(data.projectPath) });
      }
      toast.success('Feature stopped');
    },
    onError: (error: Error) => {
      toast.error('Failed to stop feature', {
        description: error.message,
      });
    },
  });
}

/**
 * Verify a completed feature
 *
 * @param projectPath - Path to the project
 * @returns Mutation for verifying a feature
 */
export function useVerifyFeature(projectPath: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (featureId: string) => {
      const api = getElectronAPI();
      const result = await api.autoMode.verifyFeature(projectPath, featureId);
      if (!result.success) {
        throw new Error(result.error || 'Failed to verify feature');
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.features.all(projectPath) });
    },
    onError: (error: Error) => {
      toast.error('Failed to verify feature', {
        description: error.message,
      });
    },
  });
}

/**
 * Approve or reject a plan
 *
 * @param projectPath - Path to the project
 * @returns Mutation for plan approval
 *
 * @example
 * ```tsx
 * const approvePlan = useApprovePlan(projectPath);
 * approvePlan.mutate({ featureId: 'abc', approved: true });
 * ```
 */
export function useApprovePlan(projectPath: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      featureId,
      approved,
      editedPlan,
      feedback,
    }: {
      featureId: string;
      approved: boolean;
      editedPlan?: string;
      feedback?: string;
    }) => {
      const api = getElectronAPI();
      const result = await api.autoMode.approvePlan(
        projectPath,
        featureId,
        approved,
        editedPlan,
        feedback
      );
      if (!result.success) {
        throw new Error(result.error || 'Failed to submit plan decision');
      }
      return result;
    },
    onSuccess: (_, { approved }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.features.all(projectPath) });
      if (approved) {
        toast.success('Plan approved');
      } else {
        toast.info('Plan rejected');
      }
    },
    onError: (error: Error) => {
      toast.error('Failed to submit plan decision', {
        description: error.message,
      });
    },
  });
}

/**
 * Send a follow-up prompt to a feature
 *
 * @param projectPath - Path to the project
 * @returns Mutation for sending follow-up
 */
export function useFollowUpFeature(projectPath: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      featureId,
      prompt,
      imagePaths,
      useWorktrees,
    }: {
      featureId: string;
      prompt: string;
      imagePaths?: string[];
      useWorktrees?: boolean;
    }) => {
      const api = getElectronAPI();
      const result = await api.autoMode.followUpFeature(
        projectPath,
        featureId,
        prompt,
        imagePaths,
        useWorktrees
      );
      if (!result.success) {
        throw new Error(result.error || 'Failed to send follow-up');
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.runningAgents.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.features.all(projectPath) });
    },
    onError: (error: Error) => {
      toast.error('Failed to send follow-up', {
        description: error.message,
      });
    },
  });
}

/**
 * Commit feature changes
 *
 * @param projectPath - Path to the project
 * @returns Mutation for committing feature
 */
export function useCommitFeature(projectPath: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (featureId: string) => {
      const api = getElectronAPI();
      const result = await api.autoMode.commitFeature(projectPath, featureId);
      if (!result.success) {
        throw new Error(result.error || 'Failed to commit changes');
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.features.all(projectPath) });
      queryClient.invalidateQueries({ queryKey: queryKeys.worktrees.all(projectPath) });
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
 * Analyze project structure
 *
 * @returns Mutation for project analysis
 */
export function useAnalyzeProject() {
  return useMutation({
    mutationFn: async (projectPath: string) => {
      const api = getElectronAPI();
      const result = await api.autoMode.analyzeProject(projectPath);
      if (!result.success) {
        throw new Error(result.error || 'Failed to analyze project');
      }
      return result;
    },
    onSuccess: () => {
      toast.success('Project analysis started');
    },
    onError: (error: Error) => {
      toast.error('Failed to analyze project', {
        description: error.message,
      });
    },
  });
}

/**
 * Start auto mode for all pending features
 *
 * @param projectPath - Path to the project
 * @returns Mutation for starting auto mode
 */
export function useStartAutoMode(projectPath: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (maxConcurrency?: number) => {
      const api = getElectronAPI();
      const result = await api.autoMode.start(projectPath, maxConcurrency);
      if (!result.success) {
        throw new Error(result.error || 'Failed to start auto mode');
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.runningAgents.all() });
      toast.success('Auto mode started');
    },
    onError: (error: Error) => {
      toast.error('Failed to start auto mode', {
        description: error.message,
      });
    },
  });
}

/**
 * Stop auto mode for all features
 *
 * @param projectPath - Path to the project
 * @returns Mutation for stopping auto mode
 */
export function useStopAutoMode(projectPath: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const api = getElectronAPI();
      const result = await api.autoMode.stop(projectPath);
      if (!result.success) {
        throw new Error(result.error || 'Failed to stop auto mode');
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.runningAgents.all() });
      toast.success('Auto mode stopped');
    },
    onError: (error: Error) => {
      toast.error('Failed to stop auto mode', {
        description: error.message,
      });
    },
  });
}
