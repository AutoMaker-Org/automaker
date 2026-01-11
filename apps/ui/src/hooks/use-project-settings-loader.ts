import { useEffect, useRef } from 'react';
import { useAppStore } from '@/store/app-store';
import { getHttpApiClient } from '@/lib/http-api-client';

/**
 * Hook that loads project settings from the server when the current project changes.
 * This ensures that settings like board backgrounds are properly restored when
 * switching between projects or restarting the app.
 */
export function useProjectSettingsLoader() {
  const currentProject = useAppStore((state) => state.currentProject);
  const setBoardBackground = useAppStore((state) => state.setBoardBackground);
  const setCardOpacity = useAppStore((state) => state.setCardOpacity);
  const setColumnOpacity = useAppStore((state) => state.setColumnOpacity);
  const setColumnBorderEnabled = useAppStore((state) => state.setColumnBorderEnabled);
  const setCardGlassmorphism = useAppStore((state) => state.setCardGlassmorphism);
  const setCardBorderEnabled = useAppStore((state) => state.setCardBorderEnabled);
  const setCardBorderOpacity = useAppStore((state) => state.setCardBorderOpacity);
  const setHideScrollbar = useAppStore((state) => state.setHideScrollbar);
  const setWorktreePanelVisible = useAppStore((state) => state.setWorktreePanelVisible);

  const loadingRef = useRef<string | null>(null);
  const currentProjectRef = useRef<string | null>(null);

  useEffect(() => {
    currentProjectRef.current = currentProject?.path ?? null;

    if (!currentProject?.path) {
      return;
    }

    // Prevent loading the same project multiple times
    if (loadingRef.current === currentProject.path) {
      return;
    }

    loadingRef.current = currentProject.path;
    const requestedProjectPath = currentProject.path;

    const loadProjectSettings = async () => {
      try {
        const httpClient = getHttpApiClient();
        const result = await httpClient.settings.getProject(requestedProjectPath);

        // Race condition protection: ignore stale results if project changed
        if (currentProjectRef.current !== requestedProjectPath) {
          return;
        }

        if (result.success && result.settings) {
          const bg = result.settings.boardBackground;

          // Apply boardBackground if present
          if (bg?.imagePath) {
            setBoardBackground(requestedProjectPath, bg.imagePath);
          }

          // Settings map for cleaner iteration
          const settingsMap = {
            cardOpacity: setCardOpacity,
            columnOpacity: setColumnOpacity,
            columnBorderEnabled: setColumnBorderEnabled,
            cardGlassmorphism: setCardGlassmorphism,
            cardBorderEnabled: setCardBorderEnabled,
            cardBorderOpacity: setCardBorderOpacity,
            hideScrollbar: setHideScrollbar,
          } as const;

          // Apply all settings that are defined
          for (const [key, setter] of Object.entries(settingsMap)) {
            const value = bg?.[key as keyof typeof bg];
            if (value !== undefined) {
              (setter as (path: string, val: typeof value) => void)(requestedProjectPath, value);
            }
          }

          // Apply worktreePanelVisible if present
          if (result.settings.worktreePanelVisible !== undefined) {
            setWorktreePanelVisible(requestedProjectPath, result.settings.worktreePanelVisible);
          }
        }
      } catch (error) {
        console.error('Failed to load project settings:', error);
        // Don't show error toast - just log it
      }
    };

    loadProjectSettings();
  }, [currentProject?.path]);
}
