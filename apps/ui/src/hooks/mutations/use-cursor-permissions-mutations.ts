/**
 * Cursor Permissions Mutation Hooks
 *
 * React Query mutations for managing Cursor CLI permissions.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getHttpApiClient } from '@/lib/http-api-client';
import { queryKeys } from '@/lib/query-keys';
import { toast } from 'sonner';

interface ApplyProfileInput {
  profileId: 'strict' | 'development';
  scope: 'global' | 'project';
}

/**
 * Apply a Cursor permission profile
 *
 * @param projectPath - Optional path to the project (required for project scope)
 * @returns Mutation for applying permission profiles
 *
 * @example
 * ```tsx
 * const applyMutation = useApplyCursorProfile(projectPath);
 * applyMutation.mutate({ profileId: 'development', scope: 'project' });
 * ```
 */
export function useApplyCursorProfile(projectPath?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ApplyProfileInput) => {
      const { profileId, scope } = input;
      const api = getHttpApiClient();
      const result = await api.setup.applyCursorPermissionProfile(
        profileId,
        scope,
        scope === 'project' ? projectPath : undefined
      );

      if (!result.success) {
        throw new Error(result.error || 'Failed to apply profile');
      }

      return result;
    },
    onSuccess: (result) => {
      // Invalidate permissions cache
      queryClient.invalidateQueries({
        queryKey: queryKeys.cursorPermissions.permissions(projectPath),
      });
      toast.success(result.message || 'Profile applied');
    },
    onError: (error) => {
      toast.error('Failed to apply profile', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });
}

/**
 * Copy Cursor example config to clipboard
 *
 * @returns Mutation for copying config
 *
 * @example
 * ```tsx
 * const copyMutation = useCopyCursorConfig();
 * copyMutation.mutate('development');
 * ```
 */
export function useCopyCursorConfig() {
  return useMutation({
    mutationFn: async (profileId: 'strict' | 'development') => {
      const api = getHttpApiClient();
      const result = await api.setup.getCursorExampleConfig(profileId);

      if (!result.success || !result.config) {
        throw new Error(result.error || 'Failed to get config');
      }

      await navigator.clipboard.writeText(result.config);
      return result;
    },
    onSuccess: () => {
      toast.success('Config copied to clipboard');
    },
    onError: (error) => {
      toast.error('Failed to copy config', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });
}
