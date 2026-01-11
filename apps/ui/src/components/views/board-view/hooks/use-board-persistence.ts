import { useCallback } from 'react';
import { Feature } from '@/store/app-store';
import { getElectronAPI } from '@/lib/electron';
import { useAppStore } from '@/store/app-store';
import { createLogger } from '@automaker/utils/logger';

const logger = createLogger('BoardPersistence');

interface UseBoardPersistenceProps {
  currentProject: { path: string; id: string } | null;
}

export function useBoardPersistence({ currentProject }: UseBoardPersistenceProps) {
  const { updateFeature } = useAppStore();

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

        const result = await api.features.update(
          currentProject.path,
          featureId,
          updates,
          descriptionHistorySource,
          enhancementMode,
          preEnhancementDescription
        );
        if (result.success && result.feature) {
          updateFeature(result.feature.id, result.feature);
        }
      } catch (error) {
        logger.error('Failed to persist feature update:', error);
      }
    },
    [currentProject, updateFeature]
  );

  // Persist feature creation to API
  const persistFeatureCreate = useCallback(
    async (feature: Feature) => {
      if (!currentProject) return;

      try {
        const api = getElectronAPI();
        if (!api.features) {
          logger.error('Features API not available');
          return;
        }

        const result = await api.features.create(currentProject.path, feature);
        if (result.success && result.feature) {
          updateFeature(result.feature.id, result.feature);
        }
      } catch (error) {
        logger.error('Failed to persist feature creation:', error);
      }
    },
    [currentProject, updateFeature]
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
      } catch (error) {
        logger.error('Failed to persist feature deletion:', error);
      }
    },
    [currentProject]
  );

  return {
    persistFeatureCreate,
    persistFeatureUpdate,
    persistFeatureDelete,
  };
}
