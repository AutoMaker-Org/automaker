import { useMemo } from 'react';
import {
  useKeyboardShortcuts,
  useKeyboardShortcutsConfig,
  type KeyboardShortcut,
} from '@/hooks/use-keyboard-shortcuts';

interface UseAgentShortcutsOptions {
  currentProject: { path: string; name: string } | null;
  quickCreateSessionRef: React.MutableRefObject<(() => Promise<void>) | null>;
}

export function useAgentShortcuts({
  currentProject,
  quickCreateSessionRef,
}: UseAgentShortcutsOptions): void {
  const shortcuts = useKeyboardShortcutsConfig();

  // Keyboard shortcuts for agent view
  const agentShortcuts: KeyboardShortcut[] = useMemo(() => {
    const shortcutsList: KeyboardShortcut[] = [];

    // New session shortcut - only when in agent view with a project
    if (currentProject) {
      shortcutsList.push({
        key: shortcuts.newSession,
        action: () => {
          if (quickCreateSessionRef.current) {
            quickCreateSessionRef.current();
          }
        },
        description: 'Create new session',
      });
    }

    return shortcutsList;
  }, [currentProject, shortcuts, quickCreateSessionRef]);

  // Register keyboard shortcuts
  useKeyboardShortcuts(agentShortcuts);
}
