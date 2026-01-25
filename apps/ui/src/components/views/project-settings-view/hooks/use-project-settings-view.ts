import { useState, useCallback } from 'react';

export type ProjectSettingsViewId = 'identity' | 'theme' | 'worktrees' | 'claude' | 'danger';

interface UseProjectSettingsViewOptions {
  initialView?: ProjectSettingsViewId;
}

export function useProjectSettingsView({
  initialView = 'identity',
}: UseProjectSettingsViewOptions = {}) {
  const [activeView, setActiveView] = useState<ProjectSettingsViewId>(initialView);

  const navigateTo = useCallback((viewId: ProjectSettingsViewId) => {
    setActiveView(viewId);
  }, []);

  return {
    activeView,
    navigateTo,
  };
}
