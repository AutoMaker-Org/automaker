import { useState, useEffect, useCallback } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { toast } from 'sonner';

const logger = createLogger('CursorStatus');
import { getHttpApiClient } from '@/lib/http-api-client';
import { useSetupStore } from '@/store/setup-store';

export interface CursorStatus {
  installed: boolean;
  version?: string;
  authenticated: boolean;
  method?: string;
}

/**
 * Custom hook for managing Cursor CLI status
 * Handles checking CLI installation, authentication, and refresh functionality
 *
 * OPTIMIZATION: Data loading is NOW LAZY - loads only on demand (on refresh click)
 * to avoid 5-10 second auth check that blocks the settings page from opening
 */
export function useCursorStatus() {
  const { setCursorCliStatus } = useSetupStore();

  const [status, setStatus] = useState<CursorStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const api = getHttpApiClient();
      const statusResult = await api.setup.getCursorStatus();

      if (statusResult.success) {
        const newStatus = {
          installed: statusResult.installed ?? false,
          version: statusResult.version ?? undefined,
          authenticated: statusResult.auth?.authenticated ?? false,
          method: statusResult.auth?.method,
        };
        setStatus(newStatus);

        // Also update the global setup store so other components can access the status
        setCursorCliStatus({
          installed: newStatus.installed,
          version: newStatus.version,
          auth: newStatus.authenticated
            ? {
                authenticated: true,
                method: newStatus.method || 'unknown',
              }
            : undefined,
        });
      }
      setHasChecked(true);
    } catch (error) {
      logger.error('Failed to load Cursor settings:', error);
      toast.error('Failed to load Cursor settings');
      setHasChecked(true);
    } finally {
      setIsLoading(false);
    }
  }, [setCursorCliStatus]);

  // Load data on first mount (lazy load) with a small delay to avoid blocking UI
  useEffect(() => {
    if (!hasChecked) {
      // Defer the API call to the next event loop iteration to avoid blocking
      // the settings page from rendering. This gives the UI a chance to show
      // the skeleton/placeholder before the slow auth check starts.
      const timer = setTimeout(() => {
        loadData();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [hasChecked, loadData]);

  return {
    status,
    isLoading,
    loadData,
    hasChecked,
  };
}
