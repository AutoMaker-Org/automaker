import { useEffect, useRef } from 'react';
import { useAppStore } from '@/store/app-store';
import { useBoardSettingsStore } from '@/store/board-settings-store';
import { getHttpApiClient } from '@/lib/http-api-client';

/**
 * Hook that loads project settings from the server when the current project changes.
 * This ensures that settings like board backgrounds are properly restored when
 * switching between projects or restarting the app.
 */
export function useProjectSettingsLoader() {
  const currentProject = useAppStore((state) => state.currentProject);

  // Use board-settings store for board background actions
  const setBoardBackground = useBoardSettingsStore((state) => state.setBoardBackground);
  const setCardOpacity = useBoardSettingsStore((state) => state.setCardOpacity);
  const setColumnOpacity = useBoardSettingsStore((state) => state.setColumnOpacity);
  const setColumnBorderEnabled = useBoardSettingsStore((state) => state.setColumnBorderEnabled);
  const setCardGlassmorphism = useBoardSettingsStore((state) => state.setCardGlassmorphism);
  const setCardBorderEnabled = useBoardSettingsStore((state) => state.setCardBorderEnabled);
  const setCardBorderOpacity = useBoardSettingsStore((state) => state.setCardBorderOpacity);
  const setHideScrollbar = useBoardSettingsStore((state) => state.setHideScrollbar);

  // Keep worktree-related settings in app-store for now
  const setWorktreePanelVisible = useAppStore((state) => state.setWorktreePanelVisible);
  const setShowInitScriptIndicator = useAppStore((state) => state.setShowInitScriptIndicator);
  const setDefaultDeleteBranch = useAppStore((state) => state.setDefaultDeleteBranch);
  const setAutoDismissInitScriptIndicator = useAppStore(
    (state) => state.setAutoDismissInitScriptIndicator
  );

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

          // Apply showInitScriptIndicator if present
          if (result.settings.showInitScriptIndicator !== undefined) {
            setShowInitScriptIndicator(
              requestedProjectPath,
              result.settings.showInitScriptIndicator
            );
          }

          // Apply defaultDeleteBranch if present
          if (result.settings.defaultDeleteBranch !== undefined) {
            setDefaultDeleteBranch(requestedProjectPath, result.settings.defaultDeleteBranch);
          }

          // Apply autoDismissInitScriptIndicator if present
          if (result.settings.autoDismissInitScriptIndicator !== undefined) {
            setAutoDismissInitScriptIndicator(
              requestedProjectPath,
              result.settings.autoDismissInitScriptIndicator
            );
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
