import { useState, useEffect, useCallback, useRef } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { getElectronAPI } from '@/lib/electron';

const logger = createLogger('RunningAgents');

export function useRunningAgents() {
  const [runningAgentsCount, setRunningAgentsCount] = useState(0);
  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch running agents count function - used for initial load and event-driven updates
  const fetchRunningAgentsCount = useCallback(async () => {
    try {
      const api = getElectronAPI();
      if (api.runningAgents) {
        logger.debug('Fetching running agents count');
        const result = await api.runningAgents.getAll();
        if (result.success && result.runningAgents) {
          logger.debug('Running agents count fetched', {
            count: result.runningAgents.length,
          });
          setRunningAgentsCount(result.runningAgents.length);
        } else {
          logger.debug('Running agents count fetch returned empty/failed', {
            success: result.success,
          });
        }
      } else {
        logger.debug('Running agents API not available');
      }
    } catch (error) {
      logger.error('Error fetching running agents count:', error);
    }
  }, []);

  // Debounced fetch to avoid excessive API calls from frequent events
  const debouncedFetchRunningAgentsCount = useCallback(() => {
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
    }
    fetchTimeoutRef.current = setTimeout(() => {
      fetchRunningAgentsCount();
    }, 300);
  }, [fetchRunningAgentsCount]);

  // Subscribe to auto-mode events to update running agents count in real-time
  useEffect(() => {
    const api = getElectronAPI();
    if (!api.autoMode) {
      logger.debug('Auto mode API not available for running agents hook');
      // If autoMode is not available, still fetch initial count
      fetchRunningAgentsCount();
      return;
    }

    // Initial fetch on mount
    fetchRunningAgentsCount();

    const unsubscribe = api.autoMode.onEvent((event) => {
      logger.debug('Auto mode event for running agents hook', {
        type: event.type,
      });
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

  // Subscribe to backlog plan events to update running agents count
  useEffect(() => {
    const api = getElectronAPI();
    if (!api.backlogPlan) return;

    fetchRunningAgentsCount();

    const unsubscribe = api.backlogPlan.onEvent(() => {
      fetchRunningAgentsCount();
    });

    return () => {
      unsubscribe();
    };
  }, [fetchRunningAgentsCount]);

  // Subscribe to spec regeneration events to update running agents count
  useEffect(() => {
    const api = getElectronAPI();
    if (!api.specRegeneration) return;

    fetchRunningAgentsCount();

    const unsubscribe = api.specRegeneration.onEvent((event) => {
      logger.debug('Spec regeneration event for running agents hook', {
        type: event.type,
      });
      // When spec regeneration completes or errors, refresh immediately
      if (event.type === 'spec_regeneration_complete' || event.type === 'spec_regeneration_error') {
        fetchRunningAgentsCount();
      }
      // For progress events, use debounced fetch to avoid excessive calls
      else if (event.type === 'spec_regeneration_progress') {
        debouncedFetchRunningAgentsCount();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [fetchRunningAgentsCount, debouncedFetchRunningAgentsCount]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }
    };
  }, []);

  return {
    runningAgentsCount,
  };
}
