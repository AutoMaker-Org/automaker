export type ViewMode =
  | 'welcome'
  | 'setup'
  | 'spec'
  | 'board'
  | 'agent'
  | 'settings'
  | 'interview'
  | 'context'
  | 'running-agents'
  | 'terminal'
  | 'wiki'
  | 'ideation';

export type ThemeMode =
  // Special modes
  | 'system'
  // Dark themes
  | 'dark'
  | 'retro'
  | 'dracula'
  | 'nord'
  | 'monokai'
  | 'tokyonight'
  | 'solarized'
  | 'gruvbox'
  | 'catppuccin'
  | 'onedark'
  | 'synthwave'
  | 'red'
  | 'sunset'
  | 'gray'
  | 'forest'
  | 'ocean'
  | 'ember'
  | 'ayu-dark'
  | 'ayu-mirage'
  | 'matcha'
  // Light themes
  | 'light'
  | 'cream'
  | 'solarizedlight'
  | 'github'
  | 'paper'
  | 'rose'
  | 'mint'
  | 'lavender'
  | 'sand'
  | 'sky'
  | 'peach'
  | 'snow'
  | 'sepia'
  | 'gruvboxlight'
  | 'nordlight'
  | 'blossom'
  | 'ayu-light'
  | 'onelight'
  | 'bluloco'
  | 'feather';

export type BoardViewMode = 'kanban' | 'graph';

// Keyboard Shortcut with optional modifiers
export interface ShortcutKey {
  key: string; // The main key (e.g., "K", "N", "1")
  shift?: boolean; // Shift key modifier
  cmdCtrl?: boolean; // Cmd on Mac, Ctrl on Windows/Linux
  alt?: boolean; // Alt/Option key modifier
}

// Board background settings
export interface BackgroundSettings {
  imagePath: string | null;
  imageVersion?: number;
  cardOpacity: number;
  columnOpacity: number;
  columnBorderEnabled: boolean;
  cardGlassmorphism: boolean;
  cardBorderEnabled: boolean;
  cardBorderOpacity: number;
  hideScrollbar: boolean;
}

// Keyboard Shortcuts - stored as strings like "K", "Shift+N", "Cmd+K"
export interface KeyboardShortcuts {
  // Navigation shortcuts
  board: string;
  graph: string;
  agent: string;
  spec: string;
  context: string;
  memory: string;
  settings: string;
  projectSettings: string;
  terminal: string;
  ideation: string;
  notifications: string;
  githubIssues: string;
  githubPrs: string;

  // UI shortcuts
  toggleSidebar: string;

  // Action shortcuts
  addFeature: string;
  addContextFile: string;
  startNext: string;
  newSession: string;
  openProject: string;
  projectPicker: string;
  cyclePrevProject: string;
  cycleNextProject: string;

  // Terminal shortcuts
  splitTerminalRight: string;
  splitTerminalDown: string;
  closeTerminal: string;
  newTerminalTab: string;
}

// Import SidebarStyle from @automaker/types for UI slice
import type { SidebarStyle } from '@automaker/types';

/**
 * UI Slice State
 * Contains all UI-related state that is extracted into the UI slice.
 */
export interface UISliceState {
  // Core UI State
  currentView: ViewMode;
  sidebarOpen: boolean;
  sidebarStyle: SidebarStyle;
  collapsedNavSections: Record<string, boolean>;
  mobileSidebarHidden: boolean;

  // Theme State
  theme: ThemeMode;
  previewTheme: ThemeMode | null;

  // Font State
  fontFamilySans: string | null;
  fontFamilyMono: string | null;

  // Board UI State
  boardViewMode: BoardViewMode;
  boardBackgroundByProject: Record<string, BackgroundSettings>;

  // Settings UI State
  keyboardShortcuts: KeyboardShortcuts;
  muteDoneSound: boolean;
  disableSplashScreen: boolean;
  showQueryDevtools: boolean;
  chatHistoryOpen: boolean;

  // Panel Visibility State
  worktreePanelCollapsed: boolean;
  worktreePanelVisibleByProject: Record<string, boolean>;
  showInitScriptIndicatorByProject: Record<string, boolean>;
  autoDismissInitScriptIndicatorByProject: Record<string, boolean>;

  // File Picker UI State
  lastProjectDir: string;
  recentFolders: string[];
}

/**
 * UI Slice Actions
 * Contains all UI-related actions that are extracted into the UI slice.
 */
export interface UISliceActions {
  // View Actions
  setCurrentView: (view: ViewMode) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarStyle: (style: SidebarStyle) => void;
  setCollapsedNavSections: (sections: Record<string, boolean>) => void;
  toggleNavSection: (sectionLabel: string) => void;
  toggleMobileSidebarHidden: () => void;
  setMobileSidebarHidden: (hidden: boolean) => void;

  // Theme Actions (Pure UI only - project theme actions stay in main store)
  setTheme: (theme: ThemeMode) => void;
  getEffectiveTheme: () => ThemeMode;
  setPreviewTheme: (theme: ThemeMode | null) => void;

  // Font Actions (Pure UI only - project font actions stay in main store)
  setFontSans: (fontFamily: string | null) => void;
  setFontMono: (fontFamily: string | null) => void;
  getEffectiveFontSans: () => string | null;
  getEffectiveFontMono: () => string | null;

  // Board View Actions
  setBoardViewMode: (mode: BoardViewMode) => void;
  setBoardBackground: (projectPath: string, imagePath: string | null) => void;
  setCardOpacity: (projectPath: string, opacity: number) => void;
  setColumnOpacity: (projectPath: string, opacity: number) => void;
  setColumnBorderEnabled: (projectPath: string, enabled: boolean) => void;
  setCardGlassmorphism: (projectPath: string, enabled: boolean) => void;
  setCardBorderEnabled: (projectPath: string, enabled: boolean) => void;
  setCardBorderOpacity: (projectPath: string, opacity: number) => void;
  setHideScrollbar: (projectPath: string, hide: boolean) => void;
  getBoardBackground: (projectPath: string) => BackgroundSettings;
  clearBoardBackground: (projectPath: string) => void;

  // Settings UI Actions
  setKeyboardShortcut: (key: keyof KeyboardShortcuts, value: string) => void;
  setKeyboardShortcuts: (shortcuts: Partial<KeyboardShortcuts>) => void;
  resetKeyboardShortcuts: () => void;
  setMuteDoneSound: (muted: boolean) => void;
  setDisableSplashScreen: (disabled: boolean) => void;
  setShowQueryDevtools: (show: boolean) => void;
  setChatHistoryOpen: (open: boolean) => void;
  toggleChatHistory: () => void;

  // Panel Visibility Actions
  setWorktreePanelCollapsed: (collapsed: boolean) => void;
  setWorktreePanelVisible: (projectPath: string, visible: boolean) => void;
  getWorktreePanelVisible: (projectPath: string) => boolean;
  setShowInitScriptIndicator: (projectPath: string, visible: boolean) => void;
  getShowInitScriptIndicator: (projectPath: string) => boolean;
  setAutoDismissInitScriptIndicator: (projectPath: string, autoDismiss: boolean) => void;
  getAutoDismissInitScriptIndicator: (projectPath: string) => boolean;

  // File Picker UI Actions
  setLastProjectDir: (dir: string) => void;
  setRecentFolders: (folders: string[]) => void;
  addRecentFolder: (folder: string) => void;
}
