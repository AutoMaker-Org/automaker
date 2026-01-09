import { useState, useCallback } from 'react';

export type SettingsViewId =
  | 'api-keys'
  | 'claude'
  | 'providers'
  | 'claude-provider'
  | 'cursor-provider'
  | 'codex-provider'
  | 'opencode-provider'
  | 'mcp-servers'
  | 'prompts'
  | 'model-defaults'
  | 'appearance'
  | 'terminal'
  | 'keyboard'
  | 'audio'
  | 'defaults'
  | 'account'
  | 'security'
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
