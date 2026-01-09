import { useCallback } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { useAppStore } from '@/store/app-store';
import { getHttpApiClient } from '@/lib/http-api-client';
import { toast } from 'sonner';

const logger = createLogger('BoardBackground');

/**
 * Hook for managing board background settings with automatic persistence to server
 */
export function useBoardBackgroundSettings() {
  const store = useAppStore();
  const httpClient = getHttpApiClient();

  // Helper to persist settings to server
  const persistSettings = useCallback(
    async (projectPath: string, settingsToUpdate: Record<string, unknown>) => {
      try {
        const result = await httpClient.settings.updateProject(projectPath, {
          boardBackground: settingsToUpdate,
        });

        if (!result.success) {
          logger.error('Failed to persist settings:', result.error);
          toast.error('Failed to save settings');
        }
      } catch (error) {
        logger.error('Failed to persist settings:', error);
        toast.error('Failed to save settings');
      }
    },
    [httpClient]
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

  const setCardOpacity = useCallback(
    async (projectPath: string, opacity: number) => {
      const current = getCurrentSettings(projectPath);
      store.setCardOpacity(projectPath, opacity);
      await persistSettings(projectPath, { ...current, cardOpacity: opacity });
    },
    [store, persistSettings, getCurrentSettings]
  );

  const setColumnOpacity = useCallback(
    async (projectPath: string, opacity: number) => {
      const current = getCurrentSettings(projectPath);
      store.setColumnOpacity(projectPath, opacity);
      await persistSettings(projectPath, { ...current, columnOpacity: opacity });
    },
    [store, persistSettings, getCurrentSettings]
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

  const setCardBorderOpacity = useCallback(
    async (projectPath: string, opacity: number) => {
      const current = getCurrentSettings(projectPath);
      store.setCardBorderOpacity(projectPath, opacity);
      await persistSettings(projectPath, {
        ...current,
        cardBorderOpacity: opacity,
      });
    },
    [store, persistSettings, getCurrentSettings]
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
  };
}
