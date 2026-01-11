import { useState, useEffect, useCallback } from 'react';
import { getElectronAPI, LinearConnectionStatus } from '@/lib/electron';
import { createLogger } from '@automaker/utils/logger';

const logger = createLogger('useLinearConnection');

export function useLinearConnection() {
  const [status, setStatus] = useState<LinearConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkConnection = useCallback(async () => {
    const api = getElectronAPI();
    if (!api.linear) {
      setStatus({ connected: false, error: 'Linear API not available' });
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const result = await api.linear.checkConnection();
      setStatus(result);
    } catch (err) {
      logger.error('Failed to check Linear connection:', err);
      setError(err instanceof Error ? err.message : 'Connection check failed');
      setStatus({ connected: false, error: 'Connection check failed' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  return {
    status,
    loading,
    error,
    refresh: checkConnection,
    isConnected: status?.connected ?? false,
    user: status?.user,
    organization: status?.organization,
  };
}
