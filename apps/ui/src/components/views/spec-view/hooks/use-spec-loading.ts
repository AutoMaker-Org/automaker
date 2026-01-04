import { useEffect, useState, useCallback } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { useAppStore } from '@/store/app-store';

const logger = createLogger('SpecLoading');
import { getElectronAPI } from '@/lib/electron';

export function useSpecLoading() {
  const { currentProject, setAppSpec } = useAppStore();
  const [isLoading, setIsLoading] = useState(true);
  const [specExists, setSpecExists] = useState(true);

  const loadSpec = useCallback(async () => {
    if (!currentProject) return;

    setIsLoading(true);
    try {
      const api = getElectronAPI();
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
    loadSpec,
  };
}
