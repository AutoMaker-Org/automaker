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

// File Editor Types
export interface CursorPosition {
  line: number;
  column: number;
}

export interface FileHistoryEntry {
  path: string;
  openedAt: number; // timestamp
  closedAt?: number; // timestamp
}

export interface OpenTab {
  path: string;
  name: string;
  content: string;
  originalContent: string; // Content at last save/load, used for dirty detection
  language: string;
  isDirty: boolean;
  isLoading: boolean;
  cursorPosition: CursorPosition;
  lastModified?: number; // timestamp of last edit
  worktreePath?: string; // Root path of the worktree this file belongs to (for multi-worktree tabs)
  worktreeBranch?: string; // Branch name of the worktree (for display in tab)
}

export type EditorKeybindings = 'default' | 'vim' | 'emacs';

export type MarkdownPreviewMode = 'editor' | 'preview' | 'split';

export interface FileEditorSettings {
  autoSaveEnabled: boolean;
  autoSaveIntervalMs: number; // milliseconds between auto-saves (default 30000 = 30s)
  fontSize: number; // Editor font size in pixels (default 13)
  fontFamily: string | null; // null = use global mono font
  tabSize: number; // Tab width in spaces (default 2)
  indentWithTabs: boolean; // Use tabs instead of spaces (default false)
  wordWrap: boolean; // Enable line wrapping (default false)
  showMinimap: boolean; // Show minimap (not supported in CodeMirror, reserved) (default false)
  ligatures: boolean; // Enable font ligatures (default true)
  lineHeight: number; // Line height multiplier (default 1.5)
  showLineNumbers: boolean; // Show line numbers gutter (default true)
  showFoldGutter: boolean; // Show code fold gutter (default true)
  highlightActiveLine: boolean; // Highlight the active line (default true)
  bracketMatching: boolean; // Highlight matching brackets (default true)
  closeBrackets: boolean; // Auto-close brackets (default true)
  keybindings: EditorKeybindings; // Keybinding mode (default 'default')
  markdownPreviewMode: MarkdownPreviewMode; // Markdown preview mode (default 'editor')
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
  files: string;
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
