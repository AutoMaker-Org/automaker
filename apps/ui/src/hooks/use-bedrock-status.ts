import { useEffect } from 'react';
import { useAppStore } from '@/store/app-store';
import { getElectronAPI } from '@/lib/electron';

/**
 * Load Bedrock configuration status on mount
 * Updates app-store with bedrockConfigured boolean
 *
 * This hook should be called once in the root layout to initialize
 * the Bedrock status when the app loads.
 */
export function useBedrockStatus() {
  const { setBedrockConfigured, setBedrockEnabled } = useAppStore();

  useEffect(() => {
    const loadStatus = async () => {
      try {
        const api = getElectronAPI();
        if (!api?.settings?.getBedrockStatus) return;

        const response = await api.settings.getBedrockStatus();
        if (response.success) {
          setBedrockConfigured(response.bedrockConfigured);
          setBedrockEnabled(response.bedrockEnabled);
        }
      } catch (error) {
        console.error('Failed to load Bedrock status:', error);
      }
    };

    loadStatus();
  }, [setBedrockConfigured, setBedrockEnabled]);
}
