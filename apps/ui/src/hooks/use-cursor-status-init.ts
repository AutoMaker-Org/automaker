import { useEffect, useRef } from 'react';
import { useSetupStore } from '@/store/setup-store';
import { getHttpApiClient } from '@/lib/http-api-client';

/**
 * Hook to initialize Cursor CLI status on app startup.
 * This ensures the cursorCliStatus is available in the setup store
 * before the user opens feature dialogs.
 *
 * @param ready - When false (default: false), the hook waits before firing.
 *   Pass true once non-critical startup work can begin (i.e., after board renders).
 */
export function useCursorStatusInit(ready = false) {
  const { setCursorCliStatus, cursorCliStatus } = useSetupStore();
  const initialized = useRef(false);

  useEffect(() => {
    // Wait until caller signals it's OK to fire (deferred to avoid competing
    // with critical startup requests on mobile's limited TCP connection pool)
    if (!ready) return;

    // Only initialize once per session
    if (initialized.current || cursorCliStatus !== null) {
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
  }, [ready, setCursorCliStatus, cursorCliStatus]);
}
