import { useState, useEffect, useCallback } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { getElectronAPI } from '@/lib/electron';

const logger = createLogger('RunningAgents');

export function useRunningAgents() {
  const [runningAgentsCount, setRunningAgentsCount] = useState(0);

  // Fetch running agents count function - used for initial load and event-driven updates
  const fetchRunningAgentsCount = useCallback(async () => {
    try {
      const api = getElectronAPI();
      if (api.runningAgents) {
        const result = await api.runningAgents.getAll();
        if (result.success && result.runningAgents) {
          setRunningAgentsCount(result.runningAgents.length);
        }
      }
    } catch (error) {
      logger.error('Error fetching running agents count:', error);
    }
  }, []);

  // Subscribe to auto-mode events to update running agents count in real-time
  useEffect(() => {
    const api = getElectronAPI();
    if (!api.autoMode) {
      // If autoMode is not available, still fetch initial count
      fetchRunningAgentsCount();
      return;
    }

    // Initial fetch on mount
    fetchRunningAgentsCount();

    const unsubscribe = api.autoMode.onEvent((event) => {
      // When a feature starts, completes, or errors, refresh the count
      if (
        event.type === 'auto_mode_feature_complete' ||
        event.type === 'auto_mode_error' ||
        event.type === 'auto_mode_feature_start'
      ) {
        fetchRunningAgentsCount();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [fetchRunningAgentsCount]);

  return {
    runningAgentsCount,
  };
}
