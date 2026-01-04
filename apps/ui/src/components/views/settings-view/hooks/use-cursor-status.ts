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
 */
export function useCursorStatus() {
  const { setCursorCliStatus } = useSetupStore();

  const [status, setStatus] = useState<CursorStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
    } catch (error) {
      logger.error('Failed to load Cursor settings:', error);
      toast.error('Failed to load Cursor settings');
    } finally {
      setIsLoading(false);
    }
  }, [setCursorCliStatus]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return {
    status,
    isLoading,
    loadData,
  };
}
