import { useState, useEffect, useCallback, useMemo } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { getElectronAPI } from '@/lib/electron';
import { useAppStore } from '@/store/app-store';
import type { TerminalInfo } from '@automaker/types';

const logger = createLogger('AvailableTerminals');

// Re-export TerminalInfo for convenience
export type { TerminalInfo };

export function useAvailableTerminals() {
  const [terminals, setTerminals] = useState<TerminalInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchAvailableTerminals = useCallback(async () => {
    try {
      const api = getElectronAPI();
      if (!api?.worktree?.getAvailableTerminals) {
        setIsLoading(false);
        return;
      }
      const result = await api.worktree.getAvailableTerminals();
      if (result.success && result.result?.terminals) {
        setTerminals(result.result.terminals);
      }
    } catch (error) {
      logger.error('Failed to fetch available terminals:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Refresh terminals by clearing the server cache and re-detecting
   * Use this when the user has installed/uninstalled terminals
   */
  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const api = getElectronAPI();
      if (!api?.worktree?.refreshTerminals) {
        // Fallback to regular fetch if refresh not available
        await fetchAvailableTerminals();
        return;
      }
      const result = await api.worktree.refreshTerminals();
      if (result.success && result.result?.terminals) {
        setTerminals(result.result.terminals);
        logger.info(`Terminal cache refreshed, found ${result.result.terminals.length} terminals`);
      }
    } catch (error) {
      logger.error('Failed to refresh terminals:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchAvailableTerminals]);

  useEffect(() => {
    fetchAvailableTerminals();
  }, [fetchAvailableTerminals]);

  return {
    terminals,
    isLoading,
    isRefreshing,
    refresh,
    // Convenience property: has external terminals available
    hasExternalTerminals: terminals.length > 0,
    // The first terminal is the "default" one (highest priority)
    defaultTerminal: terminals[0] ?? null,
  };
}

/**
 * Hook to get the effective default terminal based on user settings
 * Returns null if user prefers integrated terminal (defaultTerminalId is null)
 * Falls back to: user preference > first available external terminal
 */
export function useEffectiveDefaultTerminal(terminals: TerminalInfo[]): TerminalInfo | null {
  const defaultTerminalId = useAppStore((s) => s.defaultTerminalId);

  return useMemo(() => {
    // If user hasn't set a preference (null/undefined), they prefer integrated terminal
    if (defaultTerminalId == null) {
      return null;
    }

    // If user has set a preference, find it in available terminals
    if (defaultTerminalId) {
      const found = terminals.find((t) => t.id === defaultTerminalId);
      if (found) return found;
    }

    // If the saved preference doesn't exist anymore, fall back to first available
    return terminals[0] ?? null;
  }, [terminals, defaultTerminalId]);
}
