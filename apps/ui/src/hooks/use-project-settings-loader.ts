import { useEffect, useRef } from 'react';
import { useAppStore } from '@/store/app-store';
import { useProjectSettings } from '@/hooks/queries';

/**
 * Hook that loads project settings from the server when the current project changes.
 * This ensures that settings like board backgrounds are properly restored when
 * switching between projects or restarting the app.
 *
 * Uses React Query for data fetching with automatic caching.
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
  const setShowInitScriptIndicator = useAppStore((state) => state.setShowInitScriptIndicator);
  const setDefaultDeleteBranch = useAppStore((state) => state.setDefaultDeleteBranch);
  const setAutoDismissInitScriptIndicator = useAppStore(
    (state) => state.setAutoDismissInitScriptIndicator
  );
  const setWorktreeCopyFiles = useAppStore((state) => state.setWorktreeCopyFiles);

  const appliedProjectRef = useRef<{ path: string; dataUpdatedAt: number } | null>(null);

  // Fetch project settings with React Query
  const { data: settings, dataUpdatedAt } = useProjectSettings(currentProject?.path);

  // Apply settings when data changes
  useEffect(() => {
    if (!currentProject?.path || !settings) {
      return;
    }

    // Prevent applying the same settings multiple times
    if (
      appliedProjectRef.current?.path === currentProject.path &&
      appliedProjectRef.current?.dataUpdatedAt === dataUpdatedAt
    ) {
      return;
    }

    appliedProjectRef.current = { path: currentProject.path, dataUpdatedAt };
    const projectPath = currentProject.path;

    const bg = settings.boardBackground;

    // Apply boardBackground if present
    if (bg?.imagePath) {
      setBoardBackground(projectPath, bg.imagePath);
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
        (setter as (path: string, val: typeof value) => void)(projectPath, value);
      }
    }

    // Apply worktreePanelVisible if present
    if (settings.worktreePanelVisible !== undefined) {
      setWorktreePanelVisible(projectPath, settings.worktreePanelVisible);
    }

    // Apply showInitScriptIndicator if present
    if (settings.showInitScriptIndicator !== undefined) {
      setShowInitScriptIndicator(projectPath, settings.showInitScriptIndicator);
    }

    // Apply defaultDeleteBranchWithWorktree if present
    if (settings.defaultDeleteBranchWithWorktree !== undefined) {
      setDefaultDeleteBranch(projectPath, settings.defaultDeleteBranchWithWorktree);
    }

    // Apply autoDismissInitScriptIndicator if present
    if (settings.autoDismissInitScriptIndicator !== undefined) {
      setAutoDismissInitScriptIndicator(projectPath, settings.autoDismissInitScriptIndicator);
    }

    // Apply worktreeCopyFiles if present
    if (settings.worktreeCopyFiles !== undefined) {
      setWorktreeCopyFiles(projectPath, settings.worktreeCopyFiles);
    }

    // Apply activeClaudeApiProfileId and phaseModelOverrides if present
    // These are stored directly on the project, so we need to update both
    // currentProject AND the projects array to keep them in sync
    // Type assertion needed because API returns Record<string, unknown>
    const settingsWithExtras = settings as unknown as Record<string, unknown>;
    const activeClaudeApiProfileId = settingsWithExtras.activeClaudeApiProfileId as
      | string
      | null
      | undefined;
    const phaseModelOverrides = settingsWithExtras.phaseModelOverrides as
      | import('@automaker/types').PhaseModelConfig
      | undefined;

    // Check if we need to update the project
    const storeState = useAppStore.getState();
    // snapshotProject is the store's current value at this point in time;
    // it is distinct from updatedProjectData which is the new value we build below.
    const snapshotProject = storeState.currentProject;
    if (snapshotProject && snapshotProject.path === projectPath) {
      const needsUpdate =
        (activeClaudeApiProfileId !== undefined &&
          snapshotProject.activeClaudeApiProfileId !== activeClaudeApiProfileId) ||
        (phaseModelOverrides !== undefined &&
          JSON.stringify(snapshotProject.phaseModelOverrides) !==
            JSON.stringify(phaseModelOverrides));

      if (needsUpdate) {
        const updatedProjectData = {
          ...snapshotProject,
          ...(activeClaudeApiProfileId !== undefined && { activeClaudeApiProfileId }),
          ...(phaseModelOverrides !== undefined && { phaseModelOverrides }),
        };

        // Update both currentProject and projects array in a single setState call
        // to avoid two separate re-renders that can cascade during initialization
        // and contribute to React error #185 (maximum update depth exceeded).
        const updatedProjects = storeState.projects.map((p) =>
          p.id === snapshotProject.id ? updatedProjectData : p
        );
        // NOTE: Intentionally bypasses setCurrentProject() to avoid a second
        // render cycle that can trigger React error #185 (maximum update depth
        // exceeded). This means persistEffectiveThemeForProject() is skipped,
        // which is safe because only activeClaudeApiProfileId and
        // phaseModelOverrides are mutated here — not the project theme.
        useAppStore.setState({
          currentProject: updatedProjectData,
          projects: updatedProjects,
        });
      }
    }
  }, [
    currentProject?.path,
    settings,
    dataUpdatedAt,
    setBoardBackground,
    setCardOpacity,
    setColumnOpacity,
    setColumnBorderEnabled,
    setCardGlassmorphism,
    setCardBorderEnabled,
    setCardBorderOpacity,
    setHideScrollbar,
    setWorktreePanelVisible,
    setShowInitScriptIndicator,
    setDefaultDeleteBranch,
    setAutoDismissInitScriptIndicator,
    setWorktreeCopyFiles,
  ]);
}
