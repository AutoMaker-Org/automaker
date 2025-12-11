import { useState, useEffect } from 'react';
import { getElectronAPI, ElectronAPI } from '@/lib/electron';

/**
 * Hook to get the Electron API instance
 * Handles the async nature of getElectronAPI and provides loading state
 */
export function useElectronAPI() {
  const [api, setApi] = useState<ElectronAPI | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const initApi = async () => {
      try {
        setLoading(true);
        setError(null);
        const electronApi = await getElectronAPI();
        
        if (mounted) {
          if (electronApi) {
            setApi(electronApi);
          } else {
            setError('Failed to initialize API. Please ensure helper service is running.');
          }
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to initialize API');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    initApi();

    return () => {
      mounted = false;
    };
  }, []);

  return { api, loading, error };
}

/**
 * Get a cached instance of the Electron API
 * This is useful for one-time operations where you don't need reactive updates
 */
let cachedApi: ElectronAPI | null = null;
let apiPromise: Promise<ElectronAPI | null> | null = null;

export async function getElectronAPIAsync(): Promise<ElectronAPI | null> {
  if (cachedApi) {
    return cachedApi;
  }

  if (!apiPromise) {
    apiPromise = getElectronAPI().then(api => {
      cachedApi = api;
      return api;
    });
  }

  return apiPromise;
}