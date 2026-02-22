import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Feature as ApiFeature } from '@automaker/types';
import { Feature } from '@/store/app-store';
import { getElectronAPI } from '@/lib/electron';
import { useAppStore } from '@/store/app-store';
import { createLogger } from '@automaker/utils/logger';
import { queryKeys } from '@/lib/query-keys';

const logger = createLogger('BoardPersistence');

interface UseBoardPersistenceProps {
  currentProject: { path: string; id: string } | null;
}

export function useBoardPersistence({ currentProject }: UseBoardPersistenceProps) {
  // IMPORTANT: Use individual selector instead of bare useAppStore() to prevent
  // subscribing to the entire store. Bare useAppStore() causes the host component
  // (BoardView) to re-render on EVERY store change, which cascades through effects
  // and triggers React error #185 (maximum update depth exceeded).
  const updateFeature = useAppStore((s) => s.updateFeature);
  const queryClient = useQueryClient();

  // Persist feature update to API (replaces saveFeatures)
  const persistFeatureUpdate = useCallback(
    async (
      featureId: string,
      updates: Partial<Feature>,
      descriptionHistorySource?: 'enhance' | 'edit',
      enhancementMode?: 'improve' | 'technical' | 'simplify' | 'acceptance' | 'ux-reviewer',
      preEnhancementDescription?: string
    ) => {
      if (!currentProject) return;

      // Capture previous cache snapshot for rollback on error
      const previousFeatures = queryClient.getQueryData<Feature[]>(
        queryKeys.features.all(currentProject.path)
      );

      // Optimistically update React Query cache for immediate board refresh
      // This ensures status changes (e.g., restoring archived features) are reflected immediately
      queryClient.setQueryData<Feature[]>(
        queryKeys.features.all(currentProject.path),
        (existing) => {
          if (!existing) return existing;
          return existing.map((f) => (f.id === featureId ? { ...f, ...updates } : f));
        }
      );

      try {
        const api = getElectronAPI();
        if (!api.features) {
          logger.error('Features API not available');
          // Rollback optimistic update since we can't persist
          if (previousFeatures) {
            queryClient.setQueryData(queryKeys.features.all(currentProject.path), previousFeatures);
          }
          return;
        }

        logger.info('Calling API features.update', { featureId, updates });
        const result = await api.features.update(
          currentProject.path,
          featureId,
          updates,
          descriptionHistorySource,
          enhancementMode,
          preEnhancementDescription
        );
        logger.info('API features.update result', {
          success: result.success,
          feature: result.feature,
        });
        if (result.success && result.feature) {
          const updatedFeature = result.feature as Feature;
          updateFeature(updatedFeature.id, updatedFeature as Partial<Feature>);
          // Update cache with server-confirmed feature before invalidating
          queryClient.setQueryData<Feature[]>(
            queryKeys.features.all(currentProject.path),
            (features) => {
              if (!features) return features;
              return features.map((feature) =>
                feature.id === updatedFeature.id ? { ...feature, ...updatedFeature } : feature
              );
            }
          );
          // Invalidate React Query cache to sync UI
          queryClient.invalidateQueries({
            queryKey: queryKeys.features.all(currentProject.path),
          });
        } else if (!result.success) {
          logger.error('API features.update failed', result);
          // Rollback optimistic update on failure
          if (previousFeatures) {
            queryClient.setQueryData(queryKeys.features.all(currentProject.path), previousFeatures);
          }
          queryClient.invalidateQueries({
            queryKey: queryKeys.features.all(currentProject.path),
          });
        }
      } catch (error) {
        logger.error('Failed to persist feature update:', error);
        // Rollback optimistic update on error
        if (previousFeatures) {
          queryClient.setQueryData(queryKeys.features.all(currentProject.path), previousFeatures);
        }
        queryClient.invalidateQueries({
          queryKey: queryKeys.features.all(currentProject.path),
        });
      }
    },
    [currentProject, updateFeature, queryClient]
  );

  // Persist feature creation to API
  // Throws on failure so callers can handle it (e.g., remove the feature from state)
  const persistFeatureCreate = useCallback(
    async (feature: Feature) => {
      if (!currentProject) return;

      const api = getElectronAPI();
      if (!api.features) {
        throw new Error('Features API not available');
      }

      // Capture previous cache snapshot for synchronous rollback on error
      const previousFeatures = queryClient.getQueryData<Feature[]>(
        queryKeys.features.all(currentProject.path)
      );

      // Optimistically add to React Query cache for immediate board refresh
      queryClient.setQueryData<Feature[]>(
        queryKeys.features.all(currentProject.path),
        (existing) => (existing ? [...existing, feature] : [feature])
      );

      try {
        const result = await api.features.create(currentProject.path, feature as ApiFeature);
        if (result.success && result.feature) {
          updateFeature(result.feature.id, result.feature as Partial<Feature>);
          // Update cache with server-confirmed feature before invalidating
          queryClient.setQueryData<Feature[]>(
            queryKeys.features.all(currentProject.path),
            (features) => {
              if (!features) return features;
              return features.map((f) =>
                f.id === result.feature!.id ? { ...f, ...(result.feature as Feature) } : f
              );
            }
          );
        } else if (!result.success) {
          throw new Error(result.error || 'Failed to create feature on server');
        }
        // Always invalidate to sync with server state
        queryClient.invalidateQueries({
          queryKey: queryKeys.features.all(currentProject.path),
        });
      } catch (error) {
        logger.error('Failed to persist feature creation:', error);
        // Rollback optimistic update synchronously on error
        if (previousFeatures) {
          queryClient.setQueryData(queryKeys.features.all(currentProject.path), previousFeatures);
        }
        queryClient.invalidateQueries({
          queryKey: queryKeys.features.all(currentProject.path),
        });
        throw error;
      }
    },
    [currentProject, updateFeature, queryClient]
  );

  // Persist feature deletion to API
  const persistFeatureDelete = useCallback(
    async (featureId: string) => {
      if (!currentProject) return;

      // Optimistically remove from React Query cache for immediate board refresh
      const previousFeatures = queryClient.getQueryData<Feature[]>(
        queryKeys.features.all(currentProject.path)
      );
      queryClient.setQueryData<Feature[]>(
        queryKeys.features.all(currentProject.path),
        (existing) => (existing ? existing.filter((f) => f.id !== featureId) : existing)
      );

      const api = getElectronAPI();
      if (!api.features) {
        // Rollback optimistic deletion since we can't persist
        queryClient.setQueryData(queryKeys.features.all(currentProject.path), previousFeatures);
        queryClient.invalidateQueries({
          queryKey: queryKeys.features.all(currentProject.path),
        });
        throw new Error('Features API not available');
      }

      try {
        await api.features.delete(currentProject.path, featureId);
        // Invalidate to sync with server state
        queryClient.invalidateQueries({
          queryKey: queryKeys.features.all(currentProject.path),
        });
      } catch (error) {
        logger.error('Failed to persist feature deletion:', error);
        // Rollback optimistic update on error
        if (previousFeatures) {
          queryClient.setQueryData(queryKeys.features.all(currentProject.path), previousFeatures);
        }
        queryClient.invalidateQueries({
          queryKey: queryKeys.features.all(currentProject.path),
        });
        throw error;
      }
    },
    [currentProject, queryClient]
  );

  return {
    persistFeatureCreate,
    persistFeatureUpdate,
    persistFeatureDelete,
  };
}
