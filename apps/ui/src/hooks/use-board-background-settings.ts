import { useCallback } from 'react';
import { useAppStore } from '@/store/app-store';
import { useUpdateProjectSettings } from '@/hooks/mutations';

/**
 * Hook for managing board background settings with automatic persistence to server.
 * Uses React Query mutation for server persistence with automatic error handling.
 *
 * For sliders, the modal uses local state during dragging and calls:
 * - setCardOpacity/setColumnOpacity/setCardBorderOpacity to update store on commit
 * - persistSettings directly to save to server on commit
 */
export function useBoardBackgroundSettings() {
  const store = useAppStore();

  // Get the mutation without a fixed project path - we'll pass it with each call
  const updateProjectSettings = useUpdateProjectSettings();

  // Helper to persist settings to server
  const persistSettings = useCallback(
    (projectPath: string, settingsToUpdate: Record<string, unknown>) => {
      updateProjectSettings.mutate({
        projectPath,
        settings: { boardBackground: settingsToUpdate },
      });
    },
    [updateProjectSettings]
  );

  // Get current background settings for a project
  const getCurrentSettings = useCallback(
    (projectPath: string) => {
      const current = store.boardBackgroundByProject[projectPath];
      return (
        current || {
          imagePath: null,
          cardOpacity: 100,
          columnOpacity: 100,
          columnBorderEnabled: true,
          cardGlassmorphism: true,
          cardBorderEnabled: true,
          cardBorderOpacity: 100,
          hideScrollbar: false,
        }
      );
    },
    [store.boardBackgroundByProject]
  );

  // Persisting wrappers for store actions
  const setBoardBackground = useCallback(
    async (projectPath: string, imagePath: string | null) => {
      // Get current settings first
      const current = getCurrentSettings(projectPath);

      // Prepare the updated settings
      const toUpdate = {
        ...current,
        imagePath,
        imageVersion: imagePath ? Date.now() : undefined,
      };

      // Update local store
      store.setBoardBackground(projectPath, imagePath);

      // Persist to server
      await persistSettings(projectPath, toUpdate);
    },
    [store, persistSettings, getCurrentSettings]
  );

  // Update store (called on slider commit to update the board view)
  const setCardOpacity = useCallback(
    (projectPath: string, opacity: number) => {
      store.setCardOpacity(projectPath, opacity);
    },
    [store]
  );

  // Update store (called on slider commit to update the board view)
  const setColumnOpacity = useCallback(
    (projectPath: string, opacity: number) => {
      store.setColumnOpacity(projectPath, opacity);
    },
    [store]
  );

  const setColumnBorderEnabled = useCallback(
    async (projectPath: string, enabled: boolean) => {
      const current = getCurrentSettings(projectPath);
      store.setColumnBorderEnabled(projectPath, enabled);
      await persistSettings(projectPath, {
        ...current,
        columnBorderEnabled: enabled,
      });
    },
    [store, persistSettings, getCurrentSettings]
  );

  const setCardGlassmorphism = useCallback(
    async (projectPath: string, enabled: boolean) => {
      const current = getCurrentSettings(projectPath);
      store.setCardGlassmorphism(projectPath, enabled);
      await persistSettings(projectPath, {
        ...current,
        cardGlassmorphism: enabled,
      });
    },
    [store, persistSettings, getCurrentSettings]
  );

  const setCardBorderEnabled = useCallback(
    async (projectPath: string, enabled: boolean) => {
      const current = getCurrentSettings(projectPath);
      store.setCardBorderEnabled(projectPath, enabled);
      await persistSettings(projectPath, {
        ...current,
        cardBorderEnabled: enabled,
      });
    },
    [store, persistSettings, getCurrentSettings]
  );

  // Update store (called on slider commit to update the board view)
  const setCardBorderOpacity = useCallback(
    (projectPath: string, opacity: number) => {
      store.setCardBorderOpacity(projectPath, opacity);
    },
    [store]
  );

  const setHideScrollbar = useCallback(
    async (projectPath: string, hide: boolean) => {
      const current = getCurrentSettings(projectPath);
      store.setHideScrollbar(projectPath, hide);
      await persistSettings(projectPath, { ...current, hideScrollbar: hide });
    },
    [store, persistSettings, getCurrentSettings]
  );

  const clearBoardBackground = useCallback(
    async (projectPath: string) => {
      store.clearBoardBackground(projectPath);
      // Clear the boardBackground settings
      await persistSettings(projectPath, {
        imagePath: null,
        imageVersion: undefined,
        cardOpacity: 100,
        columnOpacity: 100,
        columnBorderEnabled: true,
        cardGlassmorphism: true,
        cardBorderEnabled: true,
        cardBorderOpacity: 100,
        hideScrollbar: false,
      });
    },
    [store, persistSettings]
  );

  return {
    setBoardBackground,
    setCardOpacity,
    setColumnOpacity,
    setColumnBorderEnabled,
    setCardGlassmorphism,
    setCardBorderEnabled,
    setCardBorderOpacity,
    setHideScrollbar,
    clearBoardBackground,
    getCurrentSettings,
    persistSettings,
  };
}
