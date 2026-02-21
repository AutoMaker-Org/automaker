// Terminal panel layout types (recursive for splits)
export type TerminalPanelContent =
  | { type: 'terminal'; sessionId: string; size?: number; fontSize?: number; branchName?: string }
  | { type: 'testRunner'; sessionId: string; size?: number; worktreePath: string }
  | {
      type: 'split';
      id: string; // Stable ID for React key stability
      direction: 'horizontal' | 'vertical';
      panels: TerminalPanelContent[];
      size?: number;
    };

// Terminal tab - each tab has its own layout
export interface TerminalTab {
  id: string;
  name: string;
  layout: TerminalPanelContent | null;
}

export interface TerminalState {
  isUnlocked: boolean;
  authToken: string | null;
  tabs: TerminalTab[];
  activeTabId: string | null;
  activeSessionId: string | null;
  maximizedSessionId: string | null; // Session ID of the maximized terminal pane (null if none)
  defaultFontSize: number; // Default font size for new terminals
  defaultRunScript: string; // Script to run when a new terminal is created (e.g., "claude" to start Claude Code)
  screenReaderMode: boolean; // Enable screen reader accessibility mode
  fontFamily: string; // Font family for terminal text
  scrollbackLines: number; // Number of lines to keep in scrollback buffer
  lineHeight: number; // Line height multiplier for terminal text
  maxSessions: number; // Maximum concurrent terminal sessions (server setting)
  lastActiveProjectPath: string | null; // Last project path to detect route changes vs project switches
  openTerminalMode: 'newTab' | 'split'; // How to open terminals from "Open in Terminal" action
  customBackgroundColor: string | null; // Custom background color override (hex color string, null = use theme default)
  customForegroundColor: string | null; // Custom foreground/text color override (hex color string, null = use theme default)
}

// Persisted terminal layout - now includes sessionIds for reconnection
// Used to restore terminal layout structure when switching projects
export type PersistedTerminalPanel =
  | { type: 'terminal'; size?: number; fontSize?: number; sessionId?: string; branchName?: string }
  | { type: 'testRunner'; size?: number; sessionId?: string; worktreePath?: string }
  | {
      type: 'split';
      id?: string; // Optional for backwards compatibility with older persisted layouts
      direction: 'horizontal' | 'vertical';
      panels: PersistedTerminalPanel[];
      size?: number;
    };

// Helper to generate unique split IDs
export const generateSplitId = () =>
  `split-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

export interface PersistedTerminalTab {
  id: string;
  name: string;
  layout: PersistedTerminalPanel | null;
}

export interface PersistedTerminalState {
  tabs: PersistedTerminalTab[];
  activeTabIndex: number; // Use index instead of ID since IDs are regenerated
  defaultFontSize: number;
  defaultRunScript?: string; // Optional to support existing persisted data
  screenReaderMode?: boolean; // Optional to support existing persisted data
  fontFamily?: string; // Optional to support existing persisted data
  scrollbackLines?: number; // Optional to support existing persisted data
  lineHeight?: number; // Optional to support existing persisted data
}

// Persisted terminal settings - stored globally (not per-project)
export interface PersistedTerminalSettings {
  defaultFontSize: number;
  defaultRunScript: string;
  screenReaderMode: boolean;
  fontFamily: string;
  scrollbackLines: number;
  lineHeight: number;
  maxSessions: number;
  openTerminalMode: 'newTab' | 'split';
  customBackgroundColor: string | null; // Custom background color override (hex color string, null = use theme default)
  customForegroundColor: string | null; // Custom foreground/text color override (hex color string, null = use theme default)
}
