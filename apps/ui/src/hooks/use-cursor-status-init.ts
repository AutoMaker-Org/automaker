import { useEffect, useRef } from 'react';
import { useSetupStore } from '@/store/setup-store';
import { getHttpApiClient } from '@/lib/http-api-client';

/**
 * Hook to initialize Cursor CLI status on app startup.
 * This ensures the cursorCliStatus is available in the setup store
 * before the user opens feature dialogs.
 */
export function useCursorStatusInit() {
  // Use individual selectors instead of bare useSetupStore() to prevent
  // re-rendering on every setup store mutation during initialization.
  const setCursorCliStatus = useSetupStore((s) => s.setCursorCliStatus);
  const initialized = useRef(false);

  useEffect(() => {
    // Only initialize once per session
    if (initialized.current) {
      return;
    }
    // Check current status at call time rather than via dependency to avoid
    // re-renders when other setup store fields change during initialization.
    const currentStatus = useSetupStore.getState().cursorCliStatus;
    if (currentStatus !== null) {
      initialized.current = true;
      return;
    }
    initialized.current = true;

    const initCursorStatus = async () => {
      try {
        const api = getHttpApiClient();
        const statusResult = await api.setup.getCursorStatus();

        if (statusResult.success) {
          setCursorCliStatus({
            installed: statusResult.installed ?? false,
            version: statusResult.version ?? undefined,
            auth: statusResult.auth?.authenticated
              ? {
                  authenticated: true,
                  method: statusResult.auth.method || 'unknown',
                }
              : undefined,
          });
        }
      } catch (error) {
        // Silently fail - cursor is optional
        console.debug('[CursorStatusInit] Failed to check cursor status:', error);
      }
    };

    initCursorStatus();
  }, [setCursorCliStatus]);
}
