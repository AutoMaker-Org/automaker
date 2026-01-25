import { useEffect, useRef } from 'react';
import { getElectronAPI } from '@/lib/electron';
import { createLogger } from '@automaker/utils/logger';

const logger = createLogger('BoardEffects');

interface UseBoardEffectsProps {
  currentProject: { path: string; id: string } | null;
  specCreatingForProject: string | null;
  setSpecCreatingForProject: (path: string | null) => void;
  checkContextExists: (featureId: string) => Promise<boolean>;
  features: any[];
  isLoading: boolean;
  featuresWithContext: Set<string>;
  setFeaturesWithContext: (set: Set<string>) => void;
}

export function useBoardEffects({
  currentProject,
  specCreatingForProject,
  setSpecCreatingForProject,
  checkContextExists,
  features,
  isLoading,
  featuresWithContext,
  setFeaturesWithContext,
}: UseBoardEffectsProps) {
  // Keep a ref to the current featuresWithContext for use in event handlers
  const featuresWithContextRef = useRef(featuresWithContext);
  useEffect(() => {
    featuresWithContextRef.current = featuresWithContext;
  }, [featuresWithContext]);
  // Make current project available globally for modal
  useEffect(() => {
    if (currentProject) {
      (window as any).__currentProject = currentProject;
    }
    return () => {
      (window as any).__currentProject = null;
    };
  }, [currentProject]);

  // Subscribe to spec regeneration events to clear creating state on completion
  useEffect(() => {
    const api = getElectronAPI();
    if (!api.specRegeneration) return;

    const unsubscribe = api.specRegeneration.onEvent((event) => {
      logger.info('Spec regeneration event:', event.type, 'for project:', event.projectPath);

      if (event.projectPath !== specCreatingForProject) {
        return;
      }

      if (event.type === 'spec_regeneration_complete') {
        setSpecCreatingForProject(null);
      } else if (event.type === 'spec_regeneration_error') {
        setSpecCreatingForProject(null);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [specCreatingForProject, setSpecCreatingForProject]);

  // Note: Running tasks sync is now handled by useAutoMode hook in BoardView
  // which correctly handles worktree/branch scoping.

  // Check which features have context files
  useEffect(() => {
    const checkAllContexts = async () => {
      const featuresWithPotentialContext = features.filter(
        (f) =>
          f.status === 'in_progress' ||
          f.status === 'waiting_approval' ||
          f.status === 'verified' ||
          (typeof f.status === 'string' && f.status.startsWith('pipeline_'))
      );
      const contextChecks = await Promise.all(
        featuresWithPotentialContext.map(async (f) => ({
          id: f.id,
          hasContext: await checkContextExists(f.id),
        }))
      );

      const newSet = new Set<string>();
      contextChecks.forEach(({ id, hasContext }) => {
        if (hasContext) {
          newSet.add(id);
        }
      });

      setFeaturesWithContext(newSet);
    };

    if (features.length > 0 && !isLoading) {
      checkAllContexts();
    }
  }, [features, isLoading, checkContextExists, setFeaturesWithContext]);

  // Re-check context when a feature stops, completes, or errors
  // This ensures hasContext is updated even if the features array doesn't change
  useEffect(() => {
    const api = getElectronAPI();
    if (!api?.autoMode) return;

    const unsubscribe = api.autoMode.onEvent(async (event) => {
      // When a feature stops (error/abort) or completes, re-check its context
      if (
        (event.type === 'auto_mode_error' || event.type === 'auto_mode_feature_complete') &&
        event.featureId
      ) {
        const hasContext = await checkContextExists(event.featureId);
        if (hasContext) {
          const newSet = new Set(featuresWithContextRef.current);
          newSet.add(event.featureId);
          setFeaturesWithContext(newSet);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [checkContextExists, setFeaturesWithContext]);
}
