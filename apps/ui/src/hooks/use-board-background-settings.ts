import { useCallback } from 'react';
import { createLogger } from '@automaker/utils/logger';
import {
  useBoardSettingsStore,
  defaultBoardBackgroundSettings,
} from '@/store/board-settings-store';
import { getHttpApiClient } from '@/lib/http-api-client';
import { toast } from 'sonner';

const logger = createLogger('BoardBackground');

/**
 * Hook for managing board background settings with automatic persistence to server
 */
export function useBoardBackgroundSettings() {
  const boardBackgroundByProject = useBoardSettingsStore((state) => state.boardBackgroundByProject);
  const setBoardBackgroundState = useBoardSettingsStore((state) => state.setBoardBackground);
  const setCardOpacityState = useBoardSettingsStore((state) => state.setCardOpacity);
  const setColumnOpacityState = useBoardSettingsStore((state) => state.setColumnOpacity);
  const setColumnBorderEnabledState = useBoardSettingsStore(
    (state) => state.setColumnBorderEnabled
  );
  const setCardGlassmorphismState = useBoardSettingsStore((state) => state.setCardGlassmorphism);
  const setCardBorderEnabledState = useBoardSettingsStore((state) => state.setCardBorderEnabled);
  const setCardBorderOpacityState = useBoardSettingsStore((state) => state.setCardBorderOpacity);
  const setHideScrollbarState = useBoardSettingsStore((state) => state.setHideScrollbar);
  const clearBoardBackgroundState = useBoardSettingsStore((state) => state.clearBoardBackground);
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
      return boardBackgroundByProject[projectPath] || defaultBoardBackgroundSettings;
    },
    [boardBackgroundByProject]
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
      setBoardBackgroundState(projectPath, imagePath);

      // Persist to server
      await persistSettings(projectPath, toUpdate);
    },
    [persistSettings, getCurrentSettings, setBoardBackgroundState]
  );

  const setCardOpacity = useCallback(
    async (projectPath: string, opacity: number) => {
      const current = getCurrentSettings(projectPath);
      setCardOpacityState(projectPath, opacity);
      await persistSettings(projectPath, { ...current, cardOpacity: opacity });
    },
    [persistSettings, getCurrentSettings, setCardOpacityState]
  );

  const setColumnOpacity = useCallback(
    async (projectPath: string, opacity: number) => {
      const current = getCurrentSettings(projectPath);
      setColumnOpacityState(projectPath, opacity);
      await persistSettings(projectPath, { ...current, columnOpacity: opacity });
    },
    [persistSettings, getCurrentSettings, setColumnOpacityState]
  );

  const setColumnBorderEnabled = useCallback(
    async (projectPath: string, enabled: boolean) => {
      const current = getCurrentSettings(projectPath);
      setColumnBorderEnabledState(projectPath, enabled);
      await persistSettings(projectPath, {
        ...current,
        columnBorderEnabled: enabled,
      });
    },
    [persistSettings, getCurrentSettings, setColumnBorderEnabledState]
  );

  const setCardGlassmorphism = useCallback(
    async (projectPath: string, enabled: boolean) => {
      const current = getCurrentSettings(projectPath);
      setCardGlassmorphismState(projectPath, enabled);
      await persistSettings(projectPath, {
        ...current,
        cardGlassmorphism: enabled,
      });
    },
    [persistSettings, getCurrentSettings, setCardGlassmorphismState]
  );

  const setCardBorderEnabled = useCallback(
    async (projectPath: string, enabled: boolean) => {
      const current = getCurrentSettings(projectPath);
      setCardBorderEnabledState(projectPath, enabled);
      await persistSettings(projectPath, {
        ...current,
        cardBorderEnabled: enabled,
      });
    },
    [persistSettings, getCurrentSettings, setCardBorderEnabledState]
  );

  const setCardBorderOpacity = useCallback(
    async (projectPath: string, opacity: number) => {
      const current = getCurrentSettings(projectPath);
      setCardBorderOpacityState(projectPath, opacity);
      await persistSettings(projectPath, {
        ...current,
        cardBorderOpacity: opacity,
      });
    },
    [persistSettings, getCurrentSettings, setCardBorderOpacityState]
  );

  const setHideScrollbar = useCallback(
    async (projectPath: string, hide: boolean) => {
      const current = getCurrentSettings(projectPath);
      setHideScrollbarState(projectPath, hide);
      await persistSettings(projectPath, { ...current, hideScrollbar: hide });
    },
    [persistSettings, getCurrentSettings, setHideScrollbarState]
  );

  const clearBoardBackground = useCallback(
    async (projectPath: string) => {
      clearBoardBackgroundState(projectPath);
      // Clear the boardBackground settings
      await persistSettings(projectPath, {
        ...defaultBoardBackgroundSettings,
        imageVersion: undefined,
      });
    },
    [clearBoardBackgroundState, persistSettings]
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
