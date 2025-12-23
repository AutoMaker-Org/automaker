/**
 * Pipeline Configuration Hook
 *
 * Manages pipeline configuration state and API calls
 */

import { useState, useEffect } from 'react';
import { getHttpApiClient } from '@/lib/http-api-client';
import { PipelineConfig, DEFAULT_PIPELINE_CONFIG } from '@automaker/types';

export function usePipelineConfig(projectPath: string | null) {
  const [config, setConfig] = useState<PipelineConfig>(DEFAULT_PIPELINE_CONFIG);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get API client
  const api = getHttpApiClient();

  // Load pipeline configuration
  const loadConfig = async () => {
    if (!projectPath) {
      console.log('[usePipelineConfig] No projectPath provided');
      return;
    }

    console.log('[usePipelineConfig] Loading config for path:', projectPath);
    console.log('[usePipelineConfig] Type of projectPath:', typeof projectPath);
    console.log('[usePipelineConfig] Is projectPath a string?', typeof projectPath === 'string');
    setIsLoading(true);
    setError(null);

    try {
      const response = await api.pipeline.getConfig(projectPath);
      setConfig(response.config || DEFAULT_PIPELINE_CONFIG);
    } catch (err) {
      console.error('Failed to load pipeline config:', err);
      setError('Failed to load pipeline configuration');
      setConfig(DEFAULT_PIPELINE_CONFIG);
    } finally {
      setIsLoading(false);
    }
  };

  // Save pipeline configuration
  const saveConfig = async (newConfig: PipelineConfig) => {
    if (!projectPath) return false;

    setIsLoading(true);
    setError(null);

    try {
      await api.pipeline.updateConfig(projectPath, newConfig);
      setConfig(newConfig);
      return true;
    } catch (err) {
      console.error('Failed to save pipeline config:', err);
      setError('Failed to save pipeline configuration');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // Load config when project path changes
  useEffect(() => {
    loadConfig();
  }, [projectPath]);

  return {
    config,
    setConfig: saveConfig,
    isLoading,
    error,
    reload: loadConfig,
  };
}
