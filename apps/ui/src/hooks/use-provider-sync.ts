/**
 * Hook to sync the default AI provider with the backend on startup
 *
 * This ensures that when the app loads, the backend uses the same
 * default provider as the frontend (persisted in localStorage).
 */

import { useEffect, useRef } from 'react';
import { useAppStore } from '@/store/app-store';
import { getElectronAPI } from '@/lib/electron';

export function useProviderSync() {
  const { defaultProvider } = useAppStore();
  const hasSynced = useRef(false);

  useEffect(() => {
    // Only sync once on mount
    if (hasSynced.current) return;
    hasSynced.current = true;

    const syncProvider = async () => {
      try {
        const api = getElectronAPI();
        if (api.setup && 'setDefaultProvider' in api.setup) {
          await (api.setup as any).setDefaultProvider(defaultProvider);
          console.log(`[ProviderSync] Synced default provider: ${defaultProvider}`);
        }
      } catch (error) {
        console.error('[ProviderSync] Failed to sync provider:', error);
      }
    };

    syncProvider();
  }, [defaultProvider]);
}
