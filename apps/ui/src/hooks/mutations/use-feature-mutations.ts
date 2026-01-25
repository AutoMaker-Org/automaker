/**
 * Feature Mutations
 *
 * React Query mutations for creating, updating, and deleting features.
 * Includes optimistic updates for better UX.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getElectronAPI } from '@/lib/electron';
import { queryKeys } from '@/lib/query-keys';
import { toast } from 'sonner';
import type { Feature } from '@/store/app-store';

/**
 * Create a new feature
 *
 * @param projectPath - Path to the project
 * @returns Mutation for creating a feature
 *
 * @example
 * ```tsx
 * const createFeature = useCreateFeature(projectPath);
 * createFeature.mutate({ id: 'uuid', title: 'New Feature', ... });
 * ```
 */
export function useCreateFeature(projectPath: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (feature: Feature) => {
      const api = getElectronAPI();
      const result = await api.features?.create(projectPath, feature);
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to create feature');
      }
      return result.feature;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.features.all(projectPath),
      });
      toast.success('Feature created');
    },
    onError: (error: Error) => {
      toast.error('Failed to create feature', {
        description: error.message,
      });
    },
  });
}

/**
 * Update an existing feature
 *
 * @param projectPath - Path to the project
 * @returns Mutation for updating a feature with optimistic updates
 */
export function useUpdateFeature(projectPath: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      featureId,
      updates,
      descriptionHistorySource,
      enhancementMode,
      preEnhancementDescription,
    }: {
      featureId: string;
      updates: Partial<Feature>;
      descriptionHistorySource?: 'enhance' | 'edit';
      enhancementMode?: 'improve' | 'technical' | 'simplify' | 'acceptance' | 'ux-reviewer';
      preEnhancementDescription?: string;
    }) => {
      const api = getElectronAPI();
      const result = await api.features?.update(
        projectPath,
        featureId,
        updates,
        descriptionHistorySource,
        enhancementMode,
        preEnhancementDescription
      );
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to update feature');
      }
      return result.feature;
    },
    // Optimistic update
    onMutate: async ({ featureId, updates }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({
        queryKey: queryKeys.features.all(projectPath),
      });

      // Snapshot the previous value
      const previousFeatures = queryClient.getQueryData<Feature[]>(
        queryKeys.features.all(projectPath)
      );

      // Optimistically update the cache
      if (previousFeatures) {
        queryClient.setQueryData<Feature[]>(
          queryKeys.features.all(projectPath),
          previousFeatures.map((f) => (f.id === featureId ? { ...f, ...updates } : f))
        );
      }

      return { previousFeatures };
    },
    onError: (error: Error, _, context) => {
      // Rollback on error
      if (context?.previousFeatures) {
        queryClient.setQueryData(queryKeys.features.all(projectPath), context.previousFeatures);
      }
      toast.error('Failed to update feature', {
        description: error.message,
      });
    },
    onSettled: () => {
      // Always refetch after error or success
      queryClient.invalidateQueries({
        queryKey: queryKeys.features.all(projectPath),
      });
    },
  });
}

/**
 * Delete a feature
 *
 * @param projectPath - Path to the project
 * @returns Mutation for deleting a feature with optimistic updates
 */
export function useDeleteFeature(projectPath: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (featureId: string) => {
      const api = getElectronAPI();
      const result = await api.features?.delete(projectPath, featureId);
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to delete feature');
      }
    },
    // Optimistic delete
    onMutate: async (featureId) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.features.all(projectPath),
      });

      const previousFeatures = queryClient.getQueryData<Feature[]>(
        queryKeys.features.all(projectPath)
      );

      if (previousFeatures) {
        queryClient.setQueryData<Feature[]>(
          queryKeys.features.all(projectPath),
          previousFeatures.filter((f) => f.id !== featureId)
        );
      }

      return { previousFeatures };
    },
    onError: (error: Error, _, context) => {
      if (context?.previousFeatures) {
        queryClient.setQueryData(queryKeys.features.all(projectPath), context.previousFeatures);
      }
      toast.error('Failed to delete feature', {
        description: error.message,
      });
    },
    onSuccess: () => {
      toast.success('Feature deleted');
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.features.all(projectPath),
      });
    },
  });
}

/**
 * Generate a title for a feature description
 *
 * @returns Mutation for generating a title
 */
export function useGenerateTitle() {
  return useMutation({
    mutationFn: async (description: string) => {
      const api = getElectronAPI();
      const result = await api.features?.generateTitle(description);
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to generate title');
      }
      return result.title ?? '';
    },
    onError: (error: Error) => {
      toast.error('Failed to generate title', {
        description: error.message,
      });
    },
  });
}

/**
 * Batch update multiple features (for reordering)
 *
 * @param projectPath - Path to the project
 * @returns Mutation for batch updating features
 */
export function useBatchUpdateFeatures(projectPath: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: Array<{ featureId: string; updates: Partial<Feature> }>) => {
      const api = getElectronAPI();
      const results = await Promise.all(
        updates.map(({ featureId, updates: featureUpdates }) =>
          api.features?.update(projectPath, featureId, featureUpdates)
        )
      );

      const failed = results.filter((r) => !r?.success);
      if (failed.length > 0) {
        throw new Error(`Failed to update ${failed.length} features`);
      }
    },
    // Optimistic batch update
    onMutate: async (updates) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.features.all(projectPath),
      });

      const previousFeatures = queryClient.getQueryData<Feature[]>(
        queryKeys.features.all(projectPath)
      );

      if (previousFeatures) {
        const updatesMap = new Map(updates.map((u) => [u.featureId, u.updates]));
        queryClient.setQueryData<Feature[]>(
          queryKeys.features.all(projectPath),
          previousFeatures.map((f) => {
            const featureUpdates = updatesMap.get(f.id);
            return featureUpdates ? { ...f, ...featureUpdates } : f;
          })
        );
      }

      return { previousFeatures };
    },
    onError: (error: Error, _, context) => {
      if (context?.previousFeatures) {
        queryClient.setQueryData(queryKeys.features.all(projectPath), context.previousFeatures);
      }
      toast.error('Failed to update features', {
        description: error.message,
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.features.all(projectPath),
      });
    },
  });
}
