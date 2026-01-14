import { useEffect, useState, useCallback } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { useAppStore } from '@/store/app-store';

const logger = createLogger('SpecLoading');
import { getElectronAPI } from '@/lib/electron';

export function useSpecLoading() {
  const { currentProject, setAppSpec } = useAppStore();
  const [isLoading, setIsLoading] = useState(true);
  const [specExists, setSpecExists] = useState(true);
  const [isGenerationRunning, setIsGenerationRunning] = useState(false);

  const loadSpec = useCallback(async () => {
    if (!currentProject) return;

    setIsLoading(true);
    try {
      const api = getElectronAPI();

      // Check if spec generation is running before trying to load
      // This prevents showing "No App Specification Found" during generation
      if (api.specRegeneration) {
        const status = await api.specRegeneration.status(currentProject.path);
        if (status.success && status.isRunning) {
          logger.debug('Spec generation is running for this project, skipping load');
          setIsGenerationRunning(true);
          setIsLoading(false);
          return;
        }
      }
      // Always reset when generation is not running (handles edge case where api.specRegeneration might not be available)
      setIsGenerationRunning(false);

      const result = await api.readFile(`${currentProject.path}/.automaker/app_spec.txt`);

      if (result.success && result.content) {
        setAppSpec(result.content);
        setSpecExists(true);
      } else {
        // File doesn't exist
        setAppSpec('');
        setSpecExists(false);
      }
    } catch (error) {
      logger.error('Failed to load spec:', error);
      setSpecExists(false);
    } finally {
      setIsLoading(false);
    }
  }, [currentProject, setAppSpec]);

  useEffect(() => {
    loadSpec();
  }, [loadSpec]);

  return {
    isLoading,
    specExists,
    setSpecExists,
    isGenerationRunning,
    loadSpec,
  };
}
