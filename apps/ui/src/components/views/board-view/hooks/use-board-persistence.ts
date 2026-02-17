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
  const { updateFeature } = useAppStore();
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

      try {
        const api = getElectronAPI();
        if (!api.features) {
          logger.error('Features API not available');
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
        }
      } catch (error) {
        logger.error('Failed to persist feature update:', error);
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

      const result = await api.features.create(currentProject.path, feature as ApiFeature);
      if (result.success && result.feature) {
        updateFeature(result.feature.id, result.feature as Partial<Feature>);
        // Invalidate React Query cache to sync UI
        queryClient.invalidateQueries({
          queryKey: queryKeys.features.all(currentProject.path),
        });
      } else if (!result.success) {
        throw new Error(result.error || 'Failed to create feature on server');
      }
    },
    [currentProject, updateFeature, queryClient]
  );

  // Persist feature deletion to API
  const persistFeatureDelete = useCallback(
    async (featureId: string) => {
      if (!currentProject) return;

      try {
        const api = getElectronAPI();
        if (!api.features) {
          logger.error('Features API not available');
          return;
        }

        await api.features.delete(currentProject.path, featureId);
        // Invalidate React Query cache to sync UI
        queryClient.invalidateQueries({
          queryKey: queryKeys.features.all(currentProject.path),
        });
      } catch (error) {
        logger.error('Failed to persist feature deletion:', error);
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
