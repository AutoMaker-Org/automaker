import { useState, useCallback } from 'react';

export type SettingsViewId =
  | 'api-keys'
  | 'claude'
  | 'ai-enhancement'
  | 'mcp'
  | 'appearance'
  | 'terminal'
  | 'keyboard'
  | 'audio'
  | 'defaults'
  | 'danger';

interface UseSettingsViewOptions {
  initialView?: SettingsViewId;
}

export function useSettingsView({ initialView = 'api-keys' }: UseSettingsViewOptions = {}) {
  const [activeView, setActiveView] = useState<SettingsViewId>(initialView);

  const navigateTo = useCallback((viewId: SettingsViewId) => {
    setActiveView(viewId);
  }, []);

  return {
    activeView,
    navigateTo,
  };
}
