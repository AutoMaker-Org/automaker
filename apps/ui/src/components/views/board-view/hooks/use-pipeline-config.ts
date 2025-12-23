/**
 * Pipeline Configuration Hook for Board View
 *
 * Manages pipeline configuration state and API calls for the Kanban board.
 * Provides loading, error handling, and caching for pipeline configurations.
 *
 * @param projectPath - The path to the project, or null if no project is loaded
 * @returns Object containing config, loading state, error state, and action functions
 */

import { useState, useEffect, useCallback } from 'react';
import { getHttpApiClient } from '@/lib/http-api-client';
import { PipelineConfig, DEFAULT_PIPELINE_CONFIG } from '@automaker/types';

export function usePipelineConfig(projectPath: string | null) {
  const [config, setConfigState] = useState<PipelineConfig | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get API client
  const api = getHttpApiClient();

  // Load pipeline configuration
  const loadConfig = useCallback(async () => {
    if (!projectPath) {
      setConfigState(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await api.pipeline.getConfig(projectPath);
      if (response.success && response.config) {
        setConfigState(response.config);
      } else {
        // No config exists yet, use default (disabled)
        setConfigState(DEFAULT_PIPELINE_CONFIG);
      }
    } catch (err) {
      console.error('[usePipelineConfig] Failed to load pipeline config:', err);
      setError('Failed to load pipeline configuration');
      setConfigState(DEFAULT_PIPELINE_CONFIG);
    } finally {
      setIsLoading(false);
    }
  }, [projectPath, api.pipeline]);

  // Load config when project path changes
  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // Skip a pipeline step
  const skipStep = useCallback(
    async (featureId: string, stepId: string): Promise<boolean> => {
      if (!projectPath) return false;

      try {
        const response = await api.pipeline.skipStep(projectPath, featureId, stepId);
        return response.success;
      } catch (err) {
        console.error('[usePipelineConfig] Failed to skip step:', err);
        return false;
      }
    },
    [projectPath, api.pipeline]
  );

  // Retry a pipeline step
  const retryStep = useCallback(
    async (featureId: string, stepId: string): Promise<boolean> => {
      if (!projectPath) return false;

      try {
        const response = await api.pipeline.executeStep(projectPath, featureId, stepId);
        return response.success;
      } catch (err) {
        console.error('[usePipelineConfig] Failed to retry step:', err);
        return false;
      }
    },
    [projectPath, api.pipeline]
  );

  // Clear/reset a pipeline step
  const clearStep = useCallback(
    async (featureId: string, stepId: string): Promise<boolean> => {
      if (!projectPath) return false;

      try {
        const response = await api.pipeline.resetPipeline(projectPath, featureId, stepId);
        return response.success;
      } catch (err) {
        console.error('[usePipelineConfig] Failed to clear step:', err);
        return false;
      }
    },
    [projectPath, api.pipeline]
  );

  return {
    config,
    isLoading,
    error,
    reload: loadConfig,
    skipStep,
    retryStep,
    clearStep,
  };
}
