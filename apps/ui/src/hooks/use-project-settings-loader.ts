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
  const setCurrentProject = useAppStore((state) => state.setCurrentProject);

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

    // Apply activeClaudeApiProfileId and phaseModelOverrides if present
    // These are stored directly on the project, so we need to update both
    // currentProject AND the projects array to keep them in sync
    // Type assertion needed because API returns Record<string, unknown>
    const settingsWithExtras = settings as Record<string, unknown>;
    const activeClaudeApiProfileId = settingsWithExtras.activeClaudeApiProfileId as
      | string
      | null
      | undefined;
    const phaseModelOverrides = settingsWithExtras.phaseModelOverrides as
      | import('@automaker/types').PhaseModelConfig
      | undefined;

    // Check if we need to update the project
    const storeState = useAppStore.getState();
    const updatedProject = storeState.currentProject;
    if (updatedProject && updatedProject.path === projectPath) {
      const needsUpdate =
        (activeClaudeApiProfileId !== undefined &&
          updatedProject.activeClaudeApiProfileId !== activeClaudeApiProfileId) ||
        (phaseModelOverrides !== undefined &&
          JSON.stringify(updatedProject.phaseModelOverrides) !==
            JSON.stringify(phaseModelOverrides));

      if (needsUpdate) {
        const updatedProjectData = {
          ...updatedProject,
          ...(activeClaudeApiProfileId !== undefined && { activeClaudeApiProfileId }),
          ...(phaseModelOverrides !== undefined && { phaseModelOverrides }),
        };

        // Update currentProject
        setCurrentProject(updatedProjectData);

        // Also update the project in the projects array to keep them in sync
        const updatedProjects = storeState.projects.map((p) =>
          p.id === updatedProject.id ? updatedProjectData : p
        );
        useAppStore.setState({ projects: updatedProjects });
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
    setCurrentProject,
  ]);
}
