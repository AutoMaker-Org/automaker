import { useState, useEffect, useCallback, useMemo } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { getElectronAPI } from '@/lib/electron';
import { useAppStore } from '@/store/app-store';
import type { EditorInfo } from '@automaker/types';

const logger = createLogger('AvailableEditors');

// Re-export EditorInfo for convenience
export type { EditorInfo };

export function useAvailableEditors() {
  const [editors, setEditors] = useState<EditorInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchAvailableEditors = useCallback(async () => {
    try {
      const api = getElectronAPI();
      if (!api?.worktree?.getAvailableEditors) {
        setIsLoading(false);
        return;
      }
      const result = await api.worktree.getAvailableEditors();
      if (result.success && result.result?.editors) {
        setEditors(result.result.editors);
      }
    } catch (error) {
      logger.error('Failed to fetch available editors:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Refresh editors by clearing the server cache and re-detecting
   * Use this when the user has installed/uninstalled editors
   */
  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const api = getElectronAPI();
      if (!api?.worktree?.refreshEditors) {
        // Fallback to regular fetch if refresh not available
        await fetchAvailableEditors();
        return;
      }
      const result = await api.worktree.refreshEditors();
      if (result.success && result.result?.editors) {
        setEditors(result.result.editors);
        logger.info(`Editor cache refreshed, found ${result.result.editors.length} editors`);
      }
    } catch (error) {
      logger.error('Failed to refresh editors:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchAvailableEditors]);

  useEffect(() => {
    fetchAvailableEditors();
  }, [fetchAvailableEditors]);

  return {
    editors,
    isLoading,
    isRefreshing,
    refresh,
    // Convenience property: has multiple editors (for deciding whether to show submenu)
    hasMultipleEditors: editors.length > 1,
    // The first editor is the "default" one
    defaultEditor: editors[0] ?? null,
  };
}

/**
 * Hook to get the effective default editor based on user settings
 * Falls back to: Cursor > VS Code > first available editor
 */
export function useEffectiveDefaultEditor(editors: EditorInfo[]): EditorInfo | null {
  const defaultEditorCommand = useAppStore((s) => s.defaultEditorCommand);

  return useMemo(() => {
    if (editors.length === 0) return null;

    // If user has a saved preference and it exists in available editors, use it
    if (defaultEditorCommand) {
      const found = editors.find((e) => e.command === defaultEditorCommand);
      if (found) return found;
    }

    // Auto-detect: prefer Cursor, then VS Code, then first available
    const cursor = editors.find((e) => e.command === 'cursor');
    if (cursor) return cursor;

    const vscode = editors.find((e) => e.command === 'code');
    if (vscode) return vscode;

    return editors[0];
  }, [editors, defaultEditorCommand]);
}
