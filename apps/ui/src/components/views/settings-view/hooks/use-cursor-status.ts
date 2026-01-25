import { useEffect, useMemo, useCallback } from 'react';
import { useCursorCliStatus } from '@/hooks/queries';
import { useSetupStore } from '@/store/setup-store';

export interface CursorStatus {
  installed: boolean;
  version?: string;
  authenticated: boolean;
  method?: string;
}

/**
 * Custom hook for managing Cursor CLI status
 * Uses React Query for data fetching with automatic caching.
 */
export function useCursorStatus() {
  const { setCursorCliStatus } = useSetupStore();
  const { data: result, isLoading, refetch } = useCursorCliStatus();

  // Transform the API result into the local CursorStatus shape
  const status = useMemo((): CursorStatus | null => {
    if (!result) return null;
    return {
      installed: result.installed ?? false,
      version: result.version ?? undefined,
      authenticated: result.auth?.authenticated ?? false,
      method: result.auth?.method,
    };
  }, [result]);

  // Keep the global setup store in sync with query data
  useEffect(() => {
    if (status) {
      setCursorCliStatus({
        installed: status.installed,
        version: status.version,
        auth: status.authenticated
          ? {
              authenticated: true,
              method: status.method || 'unknown',
            }
          : undefined,
      });
    }
  }, [status, setCursorCliStatus]);

  const loadData = useCallback(() => {
    refetch();
  }, [refetch]);

  return {
    status,
    isLoading,
    loadData,
  };
}
