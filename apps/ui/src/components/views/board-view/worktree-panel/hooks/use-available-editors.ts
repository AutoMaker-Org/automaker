import { useMemo, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getElectronAPI } from '@/lib/electron';
import { useAppStore } from '@/store/app-store';
import { useAvailableEditors as useAvailableEditorsQuery } from '@/hooks/queries';
import { queryKeys } from '@/lib/query-keys';
import type { EditorInfo } from '@automaker/types';

// Re-export EditorInfo for convenience
export type { EditorInfo };

/**
 * Hook for fetching and managing available editors
 *
 * Uses React Query for data fetching with caching.
 * Provides a refresh function that clears server cache and re-detects editors.
 */
export function useAvailableEditors() {
  const queryClient = useQueryClient();
  const { data: editors = [], isLoading } = useAvailableEditorsQuery();

  /**
   * Mutation to refresh editors by clearing the server cache and re-detecting
   * Use this when the user has installed/uninstalled editors
   */
  const { mutate: refreshMutate, isPending: isRefreshing } = useMutation({
    mutationFn: async () => {
      const api = getElectronAPI();
      const result = await api.worktree.refreshEditors();
      if (!result.success) {
        throw new Error(result.error || 'Failed to refresh editors');
      }
      return result.result?.editors ?? [];
    },
    onSuccess: (newEditors) => {
      // Update the cache with new editors
      queryClient.setQueryData(queryKeys.worktrees.editors(), newEditors);
    },
  });

  const refresh = useCallback(() => {
    refreshMutate();
  }, [refreshMutate]);

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
