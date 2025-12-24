import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Project, TrashedProject } from '@/lib/electron';
import type {
  Feature as BaseFeature,
  FeatureImagePath,
  FeatureTextFilePath,
  AgentModel,
  PlanningMode,
  AIProfile,
  McpServerConfig,
} from '@automaker/types';

// Re-export ThemeMode for convenience
export type { ThemeMode };

export type ViewMode =
  | 'welcome'
  | 'setup'
  | 'spec'
  | 'board'
  | 'agent'
  | 'settings'
  | 'interview'
  | 'context'
  | 'profiles'
  | 'running-agents'
  | 'terminal'
  | 'wiki';

export type ThemeMode =
  | 'light'
  | 'dark'
  | 'system'
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
  | 'cream'
  | 'sunset'
  | 'gray';

export type KanbanCardDetailLevel = 'minimal' | 'standard' | 'detailed';

export type BoardViewMode = 'kanban' | 'graph';

export interface ApiKeys {
  anthropic: string;
  google: string;
  openai: string;
  zai: string;
}

// Keyboard Shortcut with optional modifiers
export interface ShortcutKey {
  key: string; // The main key (e.g., "K", "N", "1")
  shift?: boolean; // Shift key modifier
  cmdCtrl?: boolean; // Cmd on Mac, Ctrl on Windows/Linux
  alt?: boolean; // Alt/Option key modifier
}

// Helper to parse shortcut string to ShortcutKey object
export function parseShortcut(shortcut: string | undefined | null): ShortcutKey {
  if (!shortcut) return { key: '' };
  const parts = shortcut.split('+').map((p) => p.trim());
  const result: ShortcutKey = { key: parts[parts.length - 1] };

  // Normalize common OS-specific modifiers (Cmd/Ctrl/Win/Super symbols) into cmdCtrl
  for (let i = 0; i < parts.length - 1; i++) {
    const modifier = parts[i].toLowerCase();
    if (modifier === 'shift') result.shift = true;
    else if (
      modifier === 'cmd' ||
      modifier === 'ctrl' ||
      modifier === 'win' ||
      modifier === 'super' ||
      modifier === '⌘' ||
      modifier === '^' ||
      modifier === '⊞' ||
      modifier === '◆'
    )
      result.cmdCtrl = true;
    else if (modifier === 'alt' || modifier === 'opt' || modifier === 'option' || modifier === '⌥')
      result.alt = true;
  }

  return result;
}

// Helper to format ShortcutKey to display string
export function formatShortcut(shortcut: string | undefined | null, forDisplay = false): string {
  if (!shortcut) return '';
  const parsed = parseShortcut(shortcut);
  const parts: string[] = [];

  // Prefer User-Agent Client Hints when available; fall back to legacy
  const platform: 'darwin' | 'win32' | 'linux' = (() => {
    if (typeof navigator === 'undefined') return 'linux';

    const uaPlatform = (
      navigator as Navigator & { userAgentData?: { platform?: string } }
    ).userAgentData?.platform?.toLowerCase?.();
    const legacyPlatform = navigator.platform?.toLowerCase?.();
    const platformString = uaPlatform || legacyPlatform || '';

    if (platformString.includes('mac')) return 'darwin';
    if (platformString.includes('win')) return 'win32';
    return 'linux';
  })();

  // Primary modifier - OS-specific
  if (parsed.cmdCtrl) {
    if (forDisplay) {
      parts.push(platform === 'darwin' ? '⌘' : platform === 'win32' ? '⊞' : '◆');
    } else {
      parts.push(platform === 'darwin' ? 'Cmd' : platform === 'win32' ? 'Win' : 'Super');
    }
  }

  // Alt/Option
  if (parsed.alt) {
    parts.push(
      forDisplay ? (platform === 'darwin' ? '⌥' : 'Alt') : platform === 'darwin' ? 'Opt' : 'Alt'
    );
  }

  // Shift
  if (parsed.shift) {
    parts.push(forDisplay ? '⇧' : 'Shift');
  }

  parts.push(parsed.key.toUpperCase());

  // Add spacing when displaying symbols
  return parts.join(forDisplay ? ' ' : '+');
}

// Keyboard Shortcuts - stored as strings like "K", "Shift+N", "Cmd+K"
export interface KeyboardShortcuts {
  // Navigation shortcuts
  board: string;
  agent: string;
  spec: string;
  context: string;
  settings: string;
  profiles: string;
  terminal: string;

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
  addProfile: string;

  // Terminal shortcuts
  splitTerminalRight: string;
  splitTerminalDown: string;
  closeTerminal: string;
  newTerminalTab: string;
}

// Default keyboard shortcuts
export const DEFAULT_KEYBOARD_SHORTCUTS: KeyboardShortcuts = {
  // Navigation
  board: 'K',
  agent: 'A',
  spec: 'D',
  context: 'C',
  settings: 'S',
  profiles: 'M',
  terminal: 'T',

  // UI
  toggleSidebar: '`',

  // Actions
  // Note: Some shortcuts share the same key (e.g., "N" for addFeature, newSession, addProfile)
  // This is intentional as they are context-specific and only active in their respective views
  addFeature: 'N', // Only active in board view
  addContextFile: 'N', // Only active in context view
  startNext: 'G', // Only active in board view
  newSession: 'N', // Only active in agent view
  openProject: 'O', // Global shortcut
  projectPicker: 'P', // Global shortcut
  cyclePrevProject: 'Q', // Global shortcut
  cycleNextProject: 'E', // Global shortcut
  addProfile: 'N', // Only active in profiles view

  // Terminal shortcuts (only active in terminal view)
  // Using Alt modifier to avoid conflicts with both terminal signals AND browser shortcuts
  splitTerminalRight: 'Alt+D',
  splitTerminalDown: 'Alt+S',
  closeTerminal: 'Alt+W',
  newTerminalTab: 'Alt+T',
};

export interface ImageAttachment {
  id?: string; // Optional - may not be present in messages loaded from server
  data: string; // base64 encoded image data
  mimeType: string; // e.g., "image/png", "image/jpeg"
  filename: string;
  size?: number; // file size in bytes - optional for messages from server
}

export interface TextFileAttachment {
  id: string;
  content: string; // text content of the file
  mimeType: string; // e.g., "text/plain", "text/markdown"
  filename: string;
  size: number; // file size in bytes
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  images?: ImageAttachment[];
  textFiles?: TextFileAttachment[];
}

export interface ChatSession {
  id: string;
  title: string;
  projectId: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
  archived: boolean;
}

// UI-specific: base64-encoded images (not in shared types)
export interface FeatureImage {
  id: string;
  data: string; // base64 encoded
  mimeType: string;
  filename: string;
  size: number;
}

// Available models for feature execution
export type ClaudeModel = 'opus' | 'sonnet' | 'haiku';

export interface Feature extends Omit<
  BaseFeature,
  'steps' | 'imagePaths' | 'textFilePaths' | 'status'
> {
  id: string;
  title?: string;
  titleGenerating?: boolean;
  category: string;
  description: string;
  steps: string[]; // Required in UI (not optional)
  status: 'backlog' | 'in_progress' | 'waiting_approval' | 'verified' | 'completed';
  images?: FeatureImage[]; // UI-specific base64 images
  imagePaths?: FeatureImagePath[]; // Stricter type than base (no string | union)
  textFilePaths?: FeatureTextFilePath[]; // Text file attachments for context
  justFinishedAt?: string; // UI-specific: ISO timestamp when agent just finished
  prUrl?: string; // UI-specific: Pull request URL
}

// Parsed task from spec (for spec and full planning modes)
export interface ParsedTask {
  id: string; // e.g., "T001"
  description: string; // e.g., "Create user model"
  filePath?: string; // e.g., "src/models/user.ts"
  phase?: string; // e.g., "Phase 1: Foundation" (for full mode)
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

// PlanSpec status for feature planning/specification
export interface PlanSpec {
  status: 'pending' | 'generating' | 'generated' | 'approved' | 'rejected';
  content?: string; // The actual spec/plan markdown content
  version: number;
  generatedAt?: string; // ISO timestamp
  approvedAt?: string; // ISO timestamp
  reviewedByUser: boolean; // True if user has seen the spec
  tasksCompleted?: number;
  tasksTotal?: number;
  currentTaskId?: string; // ID of the task currently being worked on
  tasks?: ParsedTask[]; // Parsed tasks from the spec
}

// File tree node for project analysis
export interface FileTreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  extension?: string;
  children?: FileTreeNode[];
}

// Project analysis result
export interface ProjectAnalysis {
  fileTree: FileTreeNode[];
  totalFiles: number;
  totalDirectories: number;
  filesByExtension: Record<string, number>;
  analyzedAt: string;
}

// Terminal panel layout types (recursive for splits)
export type TerminalPanelContent =
  | { type: 'terminal'; sessionId: string; size?: number; fontSize?: number }
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
}

// Persisted terminal layout - now includes sessionIds for reconnection
// Used to restore terminal layout structure when switching projects
export type PersistedTerminalPanel =
  | { type: 'terminal'; size?: number; fontSize?: number; sessionId?: string }
  | {
      type: 'split';
      id?: string; // Optional for backwards compatibility with older persisted layouts
      direction: 'horizontal' | 'vertical';
      panels: PersistedTerminalPanel[];
      size?: number;
    };

// Helper to generate unique split IDs
const generateSplitId = () => `split-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

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
}

export interface AppState {
  // Project state
  projects: Project[];
  currentProject: Project | null;
  trashedProjects: TrashedProject[];
  projectHistory: string[]; // Array of project IDs in MRU order (most recent first)
  projectHistoryIndex: number; // Current position in project history for cycling

  // View state
  currentView: ViewMode;
  sidebarOpen: boolean;

  // Agent Session state (per-project, keyed by project path)
  lastSelectedSessionByProject: Record<string, string>; // projectPath -> sessionId

  // Theme
  theme: ThemeMode;

  // Features/Kanban
  features: Feature[];

  // App spec
  appSpec: string;

  // IPC status
  ipcConnected: boolean;

  // API Keys
  apiKeys: ApiKeys;

  // Chat Sessions
  chatSessions: ChatSession[];
  currentChatSession: ChatSession | null;
  chatHistoryOpen: boolean;

  // Auto Mode (per-project state, keyed by project ID)
  autoModeByProject: Record<
    string,
    {
      isRunning: boolean;
      runningTasks: string[]; // Feature IDs being worked on
    }
  >;
  autoModeActivityLog: AutoModeActivity[];
  maxConcurrency: number; // Maximum number of concurrent agent tasks

  // Kanban Card Display Settings
  kanbanCardDetailLevel: KanbanCardDetailLevel; // Level of detail shown on kanban cards
  boardViewMode: BoardViewMode; // Whether to show kanban or dependency graph view

  // Feature Default Settings
  defaultSkipTests: boolean; // Default value for skip tests when creating new features
  enableDependencyBlocking: boolean; // When true, show blocked badges and warnings for features with incomplete dependencies (default: true)

  // Worktree Settings
  useWorktrees: boolean; // Whether to use git worktree isolation for features (default: false)

  // User-managed Worktrees (per-project)
  // projectPath -> { path: worktreePath or null for main, branch: branch name }
  currentWorktreeByProject: Record<string, { path: string | null; branch: string }>;
  worktreesByProject: Record<
    string,
    Array<{
      path: string;
      branch: string;
      isMain: boolean;
      hasChanges?: boolean;
      changedFilesCount?: number;
    }>
  >;

  // AI Profiles
  aiProfiles: AIProfile[];

  // MCP Server Configuration
  mcpServers: McpServerConfig[];

  // Profile Display Settings
  showProfilesOnly: boolean; // When true, hide model tweaking options and show only profile selection

  // Keyboard Shortcuts
  keyboardShortcuts: KeyboardShortcuts; // User-defined keyboard shortcuts

  // Audio Settings
  muteDoneSound: boolean; // When true, mute the notification sound when agents complete (default: false)

  // Enhancement Model Settings
  enhancementModel: AgentModel; // Model used for feature enhancement (default: sonnet)

  // Project Analysis
  projectAnalysis: ProjectAnalysis | null;
  isAnalyzing: boolean;

  // Board Background Settings (per-project, keyed by project path)
  boardBackgroundByProject: Record<
    string,
    {
      imagePath: string | null; // Path to background image in .automaker directory
      imageVersion?: number; // Timestamp to bust browser cache when image is updated
      cardOpacity: number; // Opacity of cards (0-100)
      columnOpacity: number; // Opacity of columns (0-100)
      columnBorderEnabled: boolean; // Whether to show column borders
      cardGlassmorphism: boolean; // Whether to use glassmorphism (backdrop-blur) on cards
      cardBorderEnabled: boolean; // Whether to show card borders
      cardBorderOpacity: number; // Opacity of card borders (0-100)
      hideScrollbar: boolean; // Whether to hide the board scrollbar
    }
  >;

  // Theme Preview (for hover preview in theme selectors)
  previewTheme: ThemeMode | null;

  // Terminal state
  terminalState: TerminalState;

  // Terminal layout persistence (per-project, keyed by project path)
  // Stores the tab/split structure so it can be restored when switching projects
  terminalLayoutByProject: Record<string, PersistedTerminalState>;

  // Spec Creation State (per-project, keyed by project path)
  // Tracks which project is currently having its spec generated
  specCreatingForProject: string | null;

  defaultPlanningMode: PlanningMode;
  defaultRequirePlanApproval: boolean;
  defaultAIProfileId: string | null;

  // Plan Approval State
  // When a plan requires user approval, this holds the pending approval details
  pendingPlanApproval: {
    featureId: string;
    projectPath: string;
    planContent: string;
    planningMode: 'lite' | 'spec' | 'full';
  } | null;

  // Claude Usage Tracking
  claudeRefreshInterval: number; // Refresh interval in seconds (default: 60)
  claudeUsage: ClaudeUsage | null;
  claudeUsageLastUpdated: number | null;
}

// Claude Usage interface matching the server response
export type ClaudeUsage = {
  sessionTokensUsed: number;
  sessionLimit: number;
  sessionPercentage: number;
  sessionResetTime: string;
  sessionResetText: string;

  weeklyTokensUsed: number;
  weeklyLimit: number;
  weeklyPercentage: number;
  weeklyResetTime: string;
  weeklyResetText: string;

  sonnetWeeklyTokensUsed: number;
  sonnetWeeklyPercentage: number;
  sonnetResetText: string;

  costUsed: number | null;
  costLimit: number | null;
  costCurrency: string | null;

  lastUpdated: string;
  userTimezone: string;
};

// Response type for Claude usage API (can be success or error)
export type ClaudeUsageResponse = ClaudeUsage | { error: string; message?: string };

/**
 * Check if Claude usage is at its limit (any of: session >= 100%, weekly >= 100%, OR cost >= limit)
 * Returns true if any limit is reached, meaning auto mode should pause feature pickup.
 */
export function isClaudeUsageAtLimit(claudeUsage: ClaudeUsage | null): boolean {
  if (!claudeUsage) {
    // No usage data available - don't block
    return false;
  }

  // Check session limit (5-hour window)
  if (claudeUsage.sessionPercentage >= 100) {
    return true;
  }

  // Check weekly limit
  if (claudeUsage.weeklyPercentage >= 100) {
    return true;
  }

  // Check cost limit (if configured)
  if (
    claudeUsage.costLimit !== null &&
    claudeUsage.costLimit > 0 &&
    claudeUsage.costUsed !== null &&
    claudeUsage.costUsed >= claudeUsage.costLimit
  ) {
    return true;
  }

  return false;
}

// Default background settings for board backgrounds
export const defaultBackgroundSettings: {
  imagePath: string | null;
  imageVersion?: number;
  cardOpacity: number;
  columnOpacity: number;
  columnBorderEnabled: boolean;
  cardGlassmorphism: boolean;
  cardBorderEnabled: boolean;
  cardBorderOpacity: number;
  hideScrollbar: boolean;
} = {
  imagePath: null,
  cardOpacity: 100,
  columnOpacity: 100,
  columnBorderEnabled: true,
  cardGlassmorphism: true,
  cardBorderEnabled: true,
  cardBorderOpacity: 100,
  hideScrollbar: false,
};

export interface AutoModeActivity {
  id: string;
  featureId: string;
  timestamp: Date;
  type:
    | 'start'
    | 'progress'
    | 'tool'
    | 'complete'
    | 'error'
    | 'planning'
    | 'action'
    | 'verification';
  message: string;
  tool?: string;
  passes?: boolean;
  phase?: 'planning' | 'action' | 'verification';
  errorType?: 'authentication' | 'execution';
}

export interface AppActions {
  // Project actions
  setProjects: (projects: Project[]) => void;
  addProject: (project: Project) => void;
  removeProject: (projectId: string) => void;
  moveProjectToTrash: (projectId: string) => void;
  restoreTrashedProject: (projectId: string) => void;
  deleteTrashedProject: (projectId: string) => void;
  emptyTrash: () => void;
  setCurrentProject: (project: Project | null) => void;
  upsertAndSetCurrentProject: (path: string, name: string, theme?: ThemeMode) => Project; // Upsert project by path and set as current
  reorderProjects: (oldIndex: number, newIndex: number) => void;
  cyclePrevProject: () => void; // Cycle back through project history (Q)
  cycleNextProject: () => void; // Cycle forward through project history (E)
  clearProjectHistory: () => void; // Clear history, keeping only current project

  // View actions
  setCurrentView: (view: ViewMode) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;

  // Theme actions
  setTheme: (theme: ThemeMode) => void;
  setProjectTheme: (projectId: string, theme: ThemeMode | null) => void; // Set per-project theme (null to clear)
  getEffectiveTheme: () => ThemeMode; // Get the effective theme (project, global, or preview if set)
  setPreviewTheme: (theme: ThemeMode | null) => void; // Set preview theme for hover preview (null to clear)

  // Feature actions
  setFeatures: (features: Feature[]) => void;
  updateFeature: (id: string, updates: Partial<Feature>) => void;
  addFeature: (feature: Omit<Feature, 'id'> & Partial<Pick<Feature, 'id'>>) => Feature;
  removeFeature: (id: string) => void;
  moveFeature: (id: string, newStatus: Feature['status']) => void;

  // App spec actions
  setAppSpec: (spec: string) => void;

  // IPC actions
  setIpcConnected: (connected: boolean) => void;

  // API Keys actions
  setApiKeys: (keys: Partial<ApiKeys>) => void;

  // Chat Session actions
  createChatSession: (title?: string) => ChatSession;
  updateChatSession: (sessionId: string, updates: Partial<ChatSession>) => void;
  addMessageToSession: (sessionId: string, message: ChatMessage) => void;
  setCurrentChatSession: (session: ChatSession | null) => void;
  archiveChatSession: (sessionId: string) => void;
  unarchiveChatSession: (sessionId: string) => void;
  deleteChatSession: (sessionId: string) => void;
  setChatHistoryOpen: (open: boolean) => void;
  toggleChatHistory: () => void;

  // Auto Mode actions (per-project)
  setAutoModeRunning: (projectId: string, running: boolean) => void;
  addRunningTask: (projectId: string, taskId: string) => void;
  removeRunningTask: (projectId: string, taskId: string) => void;
  clearRunningTasks: (projectId: string) => void;
  getAutoModeState: (projectId: string) => {
    isRunning: boolean;
    runningTasks: string[];
  };
  addAutoModeActivity: (activity: Omit<AutoModeActivity, 'id' | 'timestamp'>) => void;
  clearAutoModeActivity: () => void;
  setMaxConcurrency: (max: number) => void;

  // Kanban Card Settings actions
  setKanbanCardDetailLevel: (level: KanbanCardDetailLevel) => void;
  setBoardViewMode: (mode: BoardViewMode) => void;

  // Feature Default Settings actions
  setDefaultSkipTests: (skip: boolean) => void;
  setEnableDependencyBlocking: (enabled: boolean) => void;

  // Worktree Settings actions
  setUseWorktrees: (enabled: boolean) => void;
  setCurrentWorktree: (projectPath: string, worktreePath: string | null, branch: string) => void;
  setWorktrees: (
    projectPath: string,
    worktrees: Array<{
      path: string;
      branch: string;
      isMain: boolean;
      hasChanges?: boolean;
      changedFilesCount?: number;
    }>
  ) => void;
  getCurrentWorktree: (projectPath: string) => { path: string | null; branch: string } | null;
  getWorktrees: (projectPath: string) => Array<{
    path: string;
    branch: string;
    isMain: boolean;
    hasChanges?: boolean;
    changedFilesCount?: number;
  }>;
  isPrimaryWorktreeBranch: (projectPath: string, branchName: string) => boolean;
  getPrimaryWorktreeBranch: (projectPath: string) => string | null;

  // Profile Display Settings actions
  setShowProfilesOnly: (enabled: boolean) => void;

  // Keyboard Shortcuts actions
  setKeyboardShortcut: (key: keyof KeyboardShortcuts, value: string) => void;
  setKeyboardShortcuts: (shortcuts: Partial<KeyboardShortcuts>) => void;
  resetKeyboardShortcuts: () => void;

  // Audio Settings actions
  setMuteDoneSound: (muted: boolean) => void;

  // Enhancement Model actions
  setEnhancementModel: (model: AgentModel) => void;

  // AI Profile actions
  addAIProfile: (profile: Omit<AIProfile, 'id'>) => void;
  updateAIProfile: (id: string, updates: Partial<AIProfile>) => void;
  removeAIProfile: (id: string) => void;
  reorderAIProfiles: (oldIndex: number, newIndex: number) => void;
  resetAIProfiles: () => void;

  // MCP Server actions
  setMcpServers: (servers: McpServerConfig[]) => void;
  addMcpServer: (server: Omit<McpServerConfig, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateMcpServer: (
    id: string,
    updates: Partial<Omit<McpServerConfig, 'id' | 'createdAt'>>
  ) => void;
  deleteMcpServer: (id: string) => void;

  // Project Analysis actions
  setProjectAnalysis: (analysis: ProjectAnalysis | null) => void;
  setIsAnalyzing: (analyzing: boolean) => void;
  clearAnalysis: () => void;

  // Agent Session actions
  setLastSelectedSession: (projectPath: string, sessionId: string | null) => void;
  getLastSelectedSession: (projectPath: string) => string | null;

  // Board Background actions
  setBoardBackground: (projectPath: string, imagePath: string | null) => void;
  setCardOpacity: (projectPath: string, opacity: number) => void;
  setColumnOpacity: (projectPath: string, opacity: number) => void;
  setColumnBorderEnabled: (projectPath: string, enabled: boolean) => void;
  getBoardBackground: (projectPath: string) => {
    imagePath: string | null;
    cardOpacity: number;
    columnOpacity: number;
    columnBorderEnabled: boolean;
    cardGlassmorphism: boolean;
    cardBorderEnabled: boolean;
    cardBorderOpacity: number;
    hideScrollbar: boolean;
  };
  setCardGlassmorphism: (projectPath: string, enabled: boolean) => void;
  setCardBorderEnabled: (projectPath: string, enabled: boolean) => void;
  setCardBorderOpacity: (projectPath: string, opacity: number) => void;
  setHideScrollbar: (projectPath: string, hide: boolean) => void;
  clearBoardBackground: (projectPath: string) => void;

  // Terminal actions
  setTerminalUnlocked: (unlocked: boolean, token?: string) => void;
  setActiveTerminalSession: (sessionId: string | null) => void;
  toggleTerminalMaximized: (sessionId: string) => void;
  addTerminalToLayout: (
    sessionId: string,
    direction?: 'horizontal' | 'vertical',
    targetSessionId?: string
  ) => void;
  removeTerminalFromLayout: (sessionId: string) => void;
  swapTerminals: (sessionId1: string, sessionId2: string) => void;
  clearTerminalState: () => void;
  setTerminalPanelFontSize: (sessionId: string, fontSize: number) => void;
  setTerminalDefaultFontSize: (fontSize: number) => void;
  setTerminalDefaultRunScript: (script: string) => void;
  setTerminalScreenReaderMode: (enabled: boolean) => void;
  setTerminalFontFamily: (fontFamily: string) => void;
  setTerminalScrollbackLines: (lines: number) => void;
  setTerminalLineHeight: (lineHeight: number) => void;
  setTerminalMaxSessions: (maxSessions: number) => void;
  addTerminalTab: (name?: string) => string;
  removeTerminalTab: (tabId: string) => void;
  setActiveTerminalTab: (tabId: string) => void;
  renameTerminalTab: (tabId: string, name: string) => void;
  reorderTerminalTabs: (fromTabId: string, toTabId: string) => void;
  moveTerminalToTab: (sessionId: string, targetTabId: string | 'new') => void;
  addTerminalToTab: (
    sessionId: string,
    tabId: string,
    direction?: 'horizontal' | 'vertical'
  ) => void;
  setTerminalTabLayout: (
    tabId: string,
    layout: TerminalPanelContent,
    activeSessionId?: string
  ) => void;
  updateTerminalPanelSizes: (tabId: string, panelKeys: string[], sizes: number[]) => void;
  saveTerminalLayout: (projectPath: string) => void;
  getPersistedTerminalLayout: (projectPath: string) => PersistedTerminalState | null;
  clearPersistedTerminalLayout: (projectPath: string) => void;

  // Spec Creation actions
  setSpecCreatingForProject: (projectPath: string | null) => void;
  isSpecCreatingForProject: (projectPath: string) => boolean;

  setDefaultPlanningMode: (mode: PlanningMode) => void;
  setDefaultRequirePlanApproval: (require: boolean) => void;
  setDefaultAIProfileId: (profileId: string | null) => void;

  // Plan Approval actions
  setPendingPlanApproval: (
    approval: {
      featureId: string;
      projectPath: string;
      planContent: string;
      planningMode: 'lite' | 'spec' | 'full';
    } | null
  ) => void;

  // Reset
  reset: () => void;
}

// Default built-in AI profiles
const DEFAULT_AI_PROFILES: AIProfile[] = [
  {
    id: 'profile-heavy-task',
    name: 'Heavy Task',
    description:
      'Claude Opus with Ultrathink for complex architecture, migrations, or deep debugging.',
    model: 'opus',
    planningModel: 'opus',
    thinkingLevel: 'ultrathink',
    provider: 'claude',
    isBuiltIn: true,
    icon: 'Brain',
    implementationEndpointPreset: 'default',
  },
  {
    id: 'profile-balanced',
    name: 'Balanced',
    description: 'Claude Sonnet with medium thinking for typical development tasks.',
    model: 'sonnet',
    planningModel: 'sonnet',
    thinkingLevel: 'medium',
    provider: 'claude',
    isBuiltIn: true,
    icon: 'Scale',
    implementationEndpointPreset: 'default',
  },
  {
    id: 'profile-quick-edit',
    name: 'Quick Edit',
    description: 'Claude Haiku for fast, simple edits and minor fixes.',
    model: 'haiku',
    planningModel: 'haiku',
    thinkingLevel: 'none',
    provider: 'claude',
    isBuiltIn: true,
    icon: 'Zap',
    implementationEndpointPreset: 'default',
  },
];

const initialState: AppState = {
  projects: [],
  currentProject: null,
  trashedProjects: [],
  projectHistory: [],
  projectHistoryIndex: -1,
  currentView: 'welcome',
  sidebarOpen: true,
  lastSelectedSessionByProject: {},
  theme: 'dark',
  features: [],
  appSpec: '',
  ipcConnected: false,
  apiKeys: {
    anthropic: '',
    google: '',
    openai: '',
    zai: '',
  },
  chatSessions: [],
  currentChatSession: null,
  chatHistoryOpen: false,
  autoModeByProject: {},
  autoModeActivityLog: [],
  maxConcurrency: 3, // Default to 3 concurrent agents
  kanbanCardDetailLevel: 'standard', // Default to standard detail level
  boardViewMode: 'kanban', // Default to kanban view
  defaultSkipTests: true, // Default to manual verification (tests disabled)
  enableDependencyBlocking: true, // Default to enabled (show dependency blocking UI)
  useWorktrees: false, // Default to disabled (worktree feature is experimental)
  currentWorktreeByProject: {},
  worktreesByProject: {},
  showProfilesOnly: false, // Default to showing all options (not profiles only)
  keyboardShortcuts: DEFAULT_KEYBOARD_SHORTCUTS, // Default keyboard shortcuts
  muteDoneSound: false, // Default to sound enabled (not muted)
  enhancementModel: 'sonnet', // Default to sonnet for feature enhancement
  aiProfiles: DEFAULT_AI_PROFILES,
  mcpServers: [],
  projectAnalysis: null,
  isAnalyzing: false,
  boardBackgroundByProject: {},
  previewTheme: null,
  terminalState: {
    isUnlocked: false,
    authToken: null,
    tabs: [],
    activeTabId: null,
    activeSessionId: null,
    maximizedSessionId: null,
    defaultFontSize: 14,
    defaultRunScript: '',
    screenReaderMode: false,
    fontFamily: "Menlo, Monaco, 'Courier New', monospace",
    scrollbackLines: 5000,
    lineHeight: 1.0,
    maxSessions: 100,
  },
  terminalLayoutByProject: {},
  specCreatingForProject: null,
  defaultPlanningMode: 'skip' as PlanningMode,
  defaultRequirePlanApproval: false,
  defaultAIProfileId: null,
  pendingPlanApproval: null,
  claudeRefreshInterval: 60,
  claudeUsage: null,
  claudeUsageLastUpdated: null,
};

export const useAppStore = create<AppState & AppActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      // Project actions
      setProjects: (projects) => set({ projects }),

      addProject: (project) => {
        const projects = get().projects;
        const existing = projects.findIndex((p) => p.path === project.path);
        if (existing >= 0) {
          const updated = [...projects];
          updated[existing] = {
            ...project,
            lastOpened: new Date().toISOString(),
          };
          set({ projects: updated });
        } else {
          set({
            projects: [...projects, { ...project, lastOpened: new Date().toISOString() }],
          });
        }
      },

      removeProject: (projectId) => {
        set({ projects: get().projects.filter((p) => p.id !== projectId) });
      },

      moveProjectToTrash: (projectId) => {
        const project = get().projects.find((p) => p.id === projectId);
        if (!project) return;

        const remainingProjects = get().projects.filter((p) => p.id !== projectId);
        const existingTrash = get().trashedProjects.filter((p) => p.id !== projectId);
        const trashedProject: TrashedProject = {
          ...project,
          trashedAt: new Date().toISOString(),
          deletedFromDisk: false,
        };

        const isCurrent = get().currentProject?.id === projectId;

        set({
          projects: remainingProjects,
          trashedProjects: [trashedProject, ...existingTrash],
          currentProject: isCurrent ? null : get().currentProject,
          currentView: isCurrent ? 'welcome' : get().currentView,
        });
      },

      restoreTrashedProject: (projectId) => {
        const trashed = get().trashedProjects.find((p) => p.id === projectId);
        if (!trashed) return;

        const remainingTrash = get().trashedProjects.filter((p) => p.id !== projectId);
        const existingProjects = get().projects;
        const samePathProject = existingProjects.find((p) => p.path === trashed.path);
        const projectsWithoutId = existingProjects.filter((p) => p.id !== projectId);

        // If a project with the same path already exists, keep it and just remove from trash
        if (samePathProject) {
          set({
            trashedProjects: remainingTrash,
            currentProject: samePathProject,
            currentView: 'board',
          });
          return;
        }

        const restoredProject: Project = {
          id: trashed.id,
          name: trashed.name,
          path: trashed.path,
          lastOpened: new Date().toISOString(),
          theme: trashed.theme, // Preserve theme from trashed project
        };

        set({
          trashedProjects: remainingTrash,
          projects: [...projectsWithoutId, restoredProject],
          currentProject: restoredProject,
          currentView: 'board',
        });
      },

      deleteTrashedProject: (projectId) => {
        set({
          trashedProjects: get().trashedProjects.filter((p) => p.id !== projectId),
        });
      },

      emptyTrash: () => set({ trashedProjects: [] }),

      reorderProjects: (oldIndex, newIndex) => {
        const projects = [...get().projects];
        const [movedProject] = projects.splice(oldIndex, 1);
        projects.splice(newIndex, 0, movedProject);
        set({ projects });
      },

      setCurrentProject: (project) => {
        set({ currentProject: project });
        if (project) {
          set({ currentView: 'board' });
          // Add to project history (MRU order)
          const currentHistory = get().projectHistory;
          // Remove this project if it's already in history
          const filteredHistory = currentHistory.filter((id) => id !== project.id);
          // Add to the front (most recent)
          const newHistory = [project.id, ...filteredHistory];
          // Reset history index to 0 (current project)
          set({ projectHistory: newHistory, projectHistoryIndex: 0 });
        } else {
          set({ currentView: 'welcome' });
        }
      },

      upsertAndSetCurrentProject: (path, name, theme) => {
        const { projects, trashedProjects, currentProject, theme: globalTheme } = get();
        const existingProject = projects.find((p) => p.path === path);
        let project: Project;

        if (existingProject) {
          // Update existing project, preserving theme and other properties
          project = {
            ...existingProject,
            name, // Update name in case it changed
            lastOpened: new Date().toISOString(),
          };
          // Update the project in the store
          const updatedProjects = projects.map((p) => (p.id === existingProject.id ? project : p));
          set({ projects: updatedProjects });
        } else {
          // Create new project - check for trashed project with same path first (preserves theme if deleted/recreated)
          // Then fall back to provided theme, then current project theme, then global theme
          const trashedProject = trashedProjects.find((p) => p.path === path);
          const effectiveTheme =
            theme || trashedProject?.theme || currentProject?.theme || globalTheme;
          project = {
            id: `project-${Date.now()}`,
            name,
            path,
            lastOpened: new Date().toISOString(),
            theme: effectiveTheme,
          };
          // Add the new project to the store
          set({
            projects: [...projects, { ...project, lastOpened: new Date().toISOString() }],
          });
        }

        // Set as current project (this will also update history and view)
        get().setCurrentProject(project);
        return project;
      },

      cyclePrevProject: () => {
        const { projectHistory, projectHistoryIndex, projects } = get();

        // Filter history to only include valid projects
        const validHistory = projectHistory.filter((id) => projects.some((p) => p.id === id));

        if (validHistory.length <= 1) return; // Need at least 2 valid projects to cycle

        // Find current position in valid history
        const currentProjectId = get().currentProject?.id;
        let currentIndex = currentProjectId
          ? validHistory.indexOf(currentProjectId)
          : projectHistoryIndex;

        // If current project not found in valid history, start from 0
        if (currentIndex === -1) currentIndex = 0;

        // Move to the next index (going back in history = higher index), wrapping around
        const newIndex = (currentIndex + 1) % validHistory.length;
        const targetProjectId = validHistory[newIndex];
        const targetProject = projects.find((p) => p.id === targetProjectId);

        if (targetProject) {
          // Update history to only include valid projects and set new index
          set({
            currentProject: targetProject,
            projectHistory: validHistory,
            projectHistoryIndex: newIndex,
            currentView: 'board',
          });
        }
      },

      cycleNextProject: () => {
        const { projectHistory, projectHistoryIndex, projects } = get();

        // Filter history to only include valid projects
        const validHistory = projectHistory.filter((id) => projects.some((p) => p.id === id));

        if (validHistory.length <= 1) return; // Need at least 2 valid projects to cycle

        // Find current position in valid history
        const currentProjectId = get().currentProject?.id;
        let currentIndex = currentProjectId
          ? validHistory.indexOf(currentProjectId)
          : projectHistoryIndex;

        // If current project not found in valid history, start from 0
        if (currentIndex === -1) currentIndex = 0;

        // Move to the previous index (going forward = lower index), wrapping around
        const newIndex = currentIndex <= 0 ? validHistory.length - 1 : currentIndex - 1;
        const targetProjectId = validHistory[newIndex];
        const targetProject = projects.find((p) => p.id === targetProjectId);

        if (targetProject) {
          // Update history to only include valid projects and set new index
          set({
            currentProject: targetProject,
            projectHistory: validHistory,
            projectHistoryIndex: newIndex,
            currentView: 'board',
          });
        }
      },

      clearProjectHistory: () => {
        const currentProject = get().currentProject;
        if (currentProject) {
          // Keep only the current project in history
          set({
            projectHistory: [currentProject.id],
            projectHistoryIndex: 0,
          });
        } else {
          // No current project, clear everything
          set({
            projectHistory: [],
            projectHistoryIndex: -1,
          });
        }
      },

      // View actions
      setCurrentView: (view) => set({ currentView: view }),
      toggleSidebar: () => set({ sidebarOpen: !get().sidebarOpen }),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      // Theme actions
      setTheme: (theme) => set({ theme }),

      setProjectTheme: (projectId, theme) => {
        // Update the project's theme property
        const projects = get().projects.map((p) =>
          p.id === projectId ? { ...p, theme: theme === null ? undefined : theme } : p
        );
        set({ projects });

        // Also update currentProject if it's the same project
        const currentProject = get().currentProject;
        if (currentProject?.id === projectId) {
          set({
            currentProject: {
              ...currentProject,
              theme: theme === null ? undefined : theme,
            },
          });
        }
      },

      getEffectiveTheme: () => {
        // If preview theme is set, use it (for hover preview)
        const previewTheme = get().previewTheme;
        if (previewTheme) {
          return previewTheme;
        }
        const currentProject = get().currentProject;
        // If current project has a theme set, use it
        if (currentProject?.theme) {
          return currentProject.theme as ThemeMode;
        }
        // Otherwise fall back to global theme
        return get().theme;
      },

      setPreviewTheme: (theme) => set({ previewTheme: theme }),

      // Feature actions
      setFeatures: (features) => set({ features }),

      updateFeature: (id, updates) => {
        set({
          features: get().features.map((f) => (f.id === id ? { ...f, ...updates } : f)),
        });
      },

      addFeature: (feature) => {
        const id = feature.id || `feature-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const featureWithId = { ...feature, id } as unknown as Feature;
        set({ features: [...get().features, featureWithId] });
        return featureWithId;
      },

      removeFeature: (id) => {
        set({ features: get().features.filter((f) => f.id !== id) });
      },

      moveFeature: (id, newStatus) => {
        set({
          features: get().features.map((f) => (f.id === id ? { ...f, status: newStatus } : f)),
        });
      },

      // App spec actions
      setAppSpec: (spec) => set({ appSpec: spec }),

      // IPC actions
      setIpcConnected: (connected) => set({ ipcConnected: connected }),

      // API Keys actions
      setApiKeys: (keys) => set({ apiKeys: { ...get().apiKeys, ...keys } }),

      // Chat Session actions
      createChatSession: (title) => {
        const currentProject = get().currentProject;
        if (!currentProject) {
          throw new Error('No project selected');
        }

        const now = new Date();
        const session: ChatSession = {
          id: `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          title:
            title || `Chat ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
          projectId: currentProject.id,
          messages: [
            {
              id: 'welcome',
              role: 'assistant',
              content:
                "Hello! I'm the Automaker Agent. I can help you build software autonomously. What would you like to create today?",
              timestamp: now,
            },
          ],
          createdAt: now,
          updatedAt: now,
          archived: false,
        };

        set({
          chatSessions: [...get().chatSessions, session],
          currentChatSession: session,
        });

        return session;
      },

      updateChatSession: (sessionId, updates) => {
        set({
          chatSessions: get().chatSessions.map((session) =>
            session.id === sessionId ? { ...session, ...updates, updatedAt: new Date() } : session
          ),
        });

        // Update current session if it's the one being updated
        const currentSession = get().currentChatSession;
        if (currentSession && currentSession.id === sessionId) {
          set({
            currentChatSession: {
              ...currentSession,
              ...updates,
              updatedAt: new Date(),
            },
          });
        }
      },

      addMessageToSession: (sessionId, message) => {
        const sessions = get().chatSessions;
        const sessionIndex = sessions.findIndex((s) => s.id === sessionId);

        if (sessionIndex >= 0) {
          const updatedSessions = [...sessions];
          updatedSessions[sessionIndex] = {
            ...updatedSessions[sessionIndex],
            messages: [...updatedSessions[sessionIndex].messages, message],
            updatedAt: new Date(),
          };

          set({ chatSessions: updatedSessions });

          // Update current session if it's the one being updated
          const currentSession = get().currentChatSession;
          if (currentSession && currentSession.id === sessionId) {
            set({
              currentChatSession: updatedSessions[sessionIndex],
            });
          }
        }
      },

      setCurrentChatSession: (session) => {
        set({ currentChatSession: session });
      },

      archiveChatSession: (sessionId) => {
        get().updateChatSession(sessionId, { archived: true });
      },

      unarchiveChatSession: (sessionId) => {
        get().updateChatSession(sessionId, { archived: false });
      },

      deleteChatSession: (sessionId) => {
        const currentSession = get().currentChatSession;
        set({
          chatSessions: get().chatSessions.filter((s) => s.id !== sessionId),
          currentChatSession: currentSession?.id === sessionId ? null : currentSession,
        });
      },

      setChatHistoryOpen: (open) => set({ chatHistoryOpen: open }),

      toggleChatHistory: () => set({ chatHistoryOpen: !get().chatHistoryOpen }),

      // Auto Mode actions (per-project)
      setAutoModeRunning: (projectId, running) => {
        const current = get().autoModeByProject;
        const projectState = current[projectId] || {
          isRunning: false,
          runningTasks: [],
        };
        set({
          autoModeByProject: {
            ...current,
            [projectId]: { ...projectState, isRunning: running },
          },
        });
      },

      addRunningTask: (projectId, taskId) => {
        const current = get().autoModeByProject;
        const projectState = current[projectId] || {
          isRunning: false,
          runningTasks: [],
        };
        if (!projectState.runningTasks.includes(taskId)) {
          set({
            autoModeByProject: {
              ...current,
              [projectId]: {
                ...projectState,
                runningTasks: [...projectState.runningTasks, taskId],
              },
            },
          });
        }
      },

      removeRunningTask: (projectId, taskId) => {
        const current = get().autoModeByProject;
        const projectState = current[projectId] || {
          isRunning: false,
          runningTasks: [],
        };
        set({
          autoModeByProject: {
            ...current,
            [projectId]: {
              ...projectState,
              runningTasks: projectState.runningTasks.filter((id) => id !== taskId),
            },
          },
        });
      },

      clearRunningTasks: (projectId) => {
        const current = get().autoModeByProject;
        const projectState = current[projectId] || {
          isRunning: false,
          runningTasks: [],
        };
        set({
          autoModeByProject: {
            ...current,
            [projectId]: { ...projectState, runningTasks: [] },
          },
        });
      },

      getAutoModeState: (projectId) => {
        const projectState = get().autoModeByProject[projectId];
        return projectState || { isRunning: false, runningTasks: [] };
      },

      addAutoModeActivity: (activity) => {
        const id = `activity-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const newActivity: AutoModeActivity = {
          ...activity,
          id,
          timestamp: new Date(),
        };

        // Keep only the last 100 activities to avoid memory issues
        const currentLog = get().autoModeActivityLog;
        const updatedLog = [...currentLog, newActivity].slice(-100);

        set({ autoModeActivityLog: updatedLog });
      },

      clearAutoModeActivity: () => set({ autoModeActivityLog: [] }),

      setMaxConcurrency: (max) => set({ maxConcurrency: max }),

      // Kanban Card Settings actions
      setKanbanCardDetailLevel: (level) => set({ kanbanCardDetailLevel: level }),
      setBoardViewMode: (mode) => set({ boardViewMode: mode }),

      // Feature Default Settings actions
      setDefaultSkipTests: (skip) => set({ defaultSkipTests: skip }),
      setEnableDependencyBlocking: (enabled) => set({ enableDependencyBlocking: enabled }),

      // Worktree Settings actions
      setUseWorktrees: (enabled) => set({ useWorktrees: enabled }),

      setCurrentWorktree: (projectPath, worktreePath, branch) => {
        const current = get().currentWorktreeByProject;
        set({
          currentWorktreeByProject: {
            ...current,
            [projectPath]: { path: worktreePath, branch },
          },
        });
      },

      setWorktrees: (projectPath, worktrees) => {
        const current = get().worktreesByProject;
        set({
          worktreesByProject: {
            ...current,
            [projectPath]: worktrees,
          },
        });
      },

      getCurrentWorktree: (projectPath) => {
        return get().currentWorktreeByProject[projectPath] ?? null;
      },

      getWorktrees: (projectPath) => {
        return get().worktreesByProject[projectPath] ?? [];
      },

      isPrimaryWorktreeBranch: (projectPath, branchName) => {
        const worktrees = get().worktreesByProject[projectPath] ?? [];
        const primary = worktrees.find((w) => w.isMain);
        return primary?.branch === branchName;
      },

      getPrimaryWorktreeBranch: (projectPath) => {
        const worktrees = get().worktreesByProject[projectPath] ?? [];
        const primary = worktrees.find((w) => w.isMain);
        return primary?.branch ?? null;
      },

      // Profile Display Settings actions
      setShowProfilesOnly: (enabled) => set({ showProfilesOnly: enabled }),

      // Keyboard Shortcuts actions
      setKeyboardShortcut: (key, value) => {
        set({
          keyboardShortcuts: {
            ...get().keyboardShortcuts,
            [key]: value,
          },
        });
      },

      setKeyboardShortcuts: (shortcuts) => {
        set({
          keyboardShortcuts: {
            ...get().keyboardShortcuts,
            ...shortcuts,
          },
        });
      },

      resetKeyboardShortcuts: () => {
        set({ keyboardShortcuts: DEFAULT_KEYBOARD_SHORTCUTS });
      },

      // Audio Settings actions
      setMuteDoneSound: (muted) => set({ muteDoneSound: muted }),

      // Enhancement Model actions
      setEnhancementModel: (model) => set({ enhancementModel: model }),

      // AI Profile actions
      addAIProfile: (profile) => {
        const id = `profile-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        set({ aiProfiles: [...get().aiProfiles, { ...profile, id }] });
      },

      updateAIProfile: (id, updates) => {
        set({
          aiProfiles: get().aiProfiles.map((p) => (p.id === id ? { ...p, ...updates } : p)),
        });
      },

      removeAIProfile: (id) => {
        // Only allow removing non-built-in profiles
        const profile = get().aiProfiles.find((p) => p.id === id);
        if (profile && !profile.isBuiltIn) {
          // Clear default if this profile was selected
          if (get().defaultAIProfileId === id) {
            set({ defaultAIProfileId: null });
          }
          set({ aiProfiles: get().aiProfiles.filter((p) => p.id !== id) });
        }
      },

      reorderAIProfiles: (oldIndex, newIndex) => {
        const profiles = [...get().aiProfiles];
        const [movedProfile] = profiles.splice(oldIndex, 1);
        profiles.splice(newIndex, 0, movedProfile);
        set({ aiProfiles: profiles });
      },

      resetAIProfiles: () => {
        // Merge: keep user-created profiles, but refresh all built-in profiles to latest defaults
        const defaultProfileIds = new Set(DEFAULT_AI_PROFILES.map((p) => p.id));
        const userProfiles = get().aiProfiles.filter(
          (p) => !p.isBuiltIn && !defaultProfileIds.has(p.id)
        );
        set({ aiProfiles: [...DEFAULT_AI_PROFILES, ...userProfiles] });
      },

      // MCP Server actions
      setMcpServers: (servers) => set({ mcpServers: servers }),

      addMcpServer: (server) => {
        const id = `mcp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const now = new Date().toISOString();
        set({
          mcpServers: [...get().mcpServers, { ...server, id, createdAt: now, updatedAt: now }],
        });
      },

      updateMcpServer: (id, updates) => {
        set({
          mcpServers: get().mcpServers.map((server) =>
            server.id === id
              ? { ...server, ...updates, updatedAt: new Date().toISOString() }
              : server
          ),
        });
      },

      deleteMcpServer: (id) => {
        set({ mcpServers: get().mcpServers.filter((server) => server.id !== id) });
      },

      // Project Analysis actions
      setProjectAnalysis: (analysis) => set({ projectAnalysis: analysis }),
      setIsAnalyzing: (analyzing) => set({ isAnalyzing: analyzing }),
      clearAnalysis: () => set({ projectAnalysis: null }),

      // Agent Session actions
      setLastSelectedSession: (projectPath, sessionId) => {
        const current = get().lastSelectedSessionByProject;
        if (sessionId === null) {
          // Remove the entry for this project
          const rest = Object.fromEntries(
            Object.entries(current).filter(([key]) => key !== projectPath)
          );
          set({ lastSelectedSessionByProject: rest });
        } else {
          set({
            lastSelectedSessionByProject: {
              ...current,
              [projectPath]: sessionId,
            },
          });
        }
      },

      getLastSelectedSession: (projectPath) => {
        return get().lastSelectedSessionByProject[projectPath] || null;
      },

      // Board Background actions
      setBoardBackground: (projectPath, imagePath) => {
        const current = get().boardBackgroundByProject;
        const existing = current[projectPath] || {
          imagePath: null,
          cardOpacity: 100,
          columnOpacity: 100,
          columnBorderEnabled: true,
          cardGlassmorphism: true,
          cardBorderEnabled: true,
          cardBorderOpacity: 100,
          hideScrollbar: false,
        };
        set({
          boardBackgroundByProject: {
            ...current,
            [projectPath]: {
              ...existing,
              imagePath,
              // Update imageVersion timestamp to bust browser cache when image changes
              imageVersion: imagePath ? Date.now() : undefined,
            },
          },
        });
      },

      setCardOpacity: (projectPath, opacity) => {
        const current = get().boardBackgroundByProject;
        const existing = current[projectPath] || defaultBackgroundSettings;
        set({
          boardBackgroundByProject: {
            ...current,
            [projectPath]: {
              ...existing,
              cardOpacity: opacity,
            },
          },
        });
      },

      setColumnOpacity: (projectPath, opacity) => {
        const current = get().boardBackgroundByProject;
        const existing = current[projectPath] || defaultBackgroundSettings;
        set({
          boardBackgroundByProject: {
            ...current,
            [projectPath]: {
              ...existing,
              columnOpacity: opacity,
            },
          },
        });
      },

      getBoardBackground: (projectPath) => {
        const settings = get().boardBackgroundByProject[projectPath];
        return settings || defaultBackgroundSettings;
      },

      setColumnBorderEnabled: (projectPath, enabled) => {
        const current = get().boardBackgroundByProject;
        const existing = current[projectPath] || defaultBackgroundSettings;
        set({
          boardBackgroundByProject: {
            ...current,
            [projectPath]: {
              ...existing,
              columnBorderEnabled: enabled,
            },
          },
        });
      },

      setCardGlassmorphism: (projectPath, enabled) => {
        const current = get().boardBackgroundByProject;
        const existing = current[projectPath] || defaultBackgroundSettings;
        set({
          boardBackgroundByProject: {
            ...current,
            [projectPath]: {
              ...existing,
              cardGlassmorphism: enabled,
            },
          },
        });
      },

      setCardBorderEnabled: (projectPath, enabled) => {
        const current = get().boardBackgroundByProject;
        const existing = current[projectPath] || defaultBackgroundSettings;
        set({
          boardBackgroundByProject: {
            ...current,
            [projectPath]: {
              ...existing,
              cardBorderEnabled: enabled,
            },
          },
        });
      },

      setCardBorderOpacity: (projectPath, opacity) => {
        const current = get().boardBackgroundByProject;
        const existing = current[projectPath] || defaultBackgroundSettings;
        set({
          boardBackgroundByProject: {
            ...current,
            [projectPath]: {
              ...existing,
              cardBorderOpacity: opacity,
            },
          },
        });
      },

      setHideScrollbar: (projectPath, hide) => {
        const current = get().boardBackgroundByProject;
        const existing = current[projectPath] || defaultBackgroundSettings;
        set({
          boardBackgroundByProject: {
            ...current,
            [projectPath]: {
              ...existing,
              hideScrollbar: hide,
            },
          },
        });
      },

      clearBoardBackground: (projectPath) => {
        const current = get().boardBackgroundByProject;
        const existing = current[projectPath] || defaultBackgroundSettings;
        set({
          boardBackgroundByProject: {
            ...current,
            [projectPath]: {
              ...existing,
              imagePath: null, // Only clear the image, preserve other settings
              imageVersion: undefined, // Clear version when clearing image
            },
          },
        });
      },

      // Terminal actions
      setTerminalUnlocked: (unlocked, token) => {
        set({
          terminalState: {
            ...get().terminalState,
            isUnlocked: unlocked,
            authToken: token || null,
          },
        });
      },

      setActiveTerminalSession: (sessionId) => {
        set({
          terminalState: {
            ...get().terminalState,
            activeSessionId: sessionId,
          },
        });
      },

      toggleTerminalMaximized: (sessionId) => {
        const current = get().terminalState;
        const newMaximized = current.maximizedSessionId === sessionId ? null : sessionId;
        set({
          terminalState: {
            ...current,
            maximizedSessionId: newMaximized,
            // Also set as active when maximizing
            activeSessionId: newMaximized ?? current.activeSessionId,
          },
        });
      },

      addTerminalToLayout: (sessionId, direction = 'horizontal', targetSessionId) => {
        const current = get().terminalState;
        const newTerminal: TerminalPanelContent = {
          type: 'terminal',
          sessionId,
          size: 50,
        };

        // If no tabs, create first tab
        if (current.tabs.length === 0) {
          const newTabId = `tab-${Date.now()}`;
          set({
            terminalState: {
              ...current,
              tabs: [
                {
                  id: newTabId,
                  name: 'Terminal 1',
                  layout: { type: 'terminal', sessionId, size: 100 },
                },
              ],
              activeTabId: newTabId,
              activeSessionId: sessionId,
            },
          });
          return;
        }

        // Add to active tab's layout
        const activeTab = current.tabs.find((t) => t.id === current.activeTabId);
        if (!activeTab) return;

        // If targetSessionId is provided, find and split that specific terminal
        const splitTargetTerminal = (
          node: TerminalPanelContent,
          targetId: string,
          targetDirection: 'horizontal' | 'vertical'
        ): TerminalPanelContent => {
          if (node.type === 'terminal') {
            if (node.sessionId === targetId) {
              // Found the target - split it
              return {
                type: 'split',
                id: generateSplitId(),
                direction: targetDirection,
                panels: [{ ...node, size: 50 }, newTerminal],
              };
            }
            // Not the target, return unchanged
            return node;
          }
          // It's a split - recurse into panels
          return {
            ...node,
            panels: node.panels.map((p) => splitTargetTerminal(p, targetId, targetDirection)),
          };
        };

        // Legacy behavior: add to root layout (when no targetSessionId)
        const addToRootLayout = (
          node: TerminalPanelContent,
          targetDirection: 'horizontal' | 'vertical'
        ): TerminalPanelContent => {
          if (node.type === 'terminal') {
            return {
              type: 'split',
              id: generateSplitId(),
              direction: targetDirection,
              panels: [{ ...node, size: 50 }, newTerminal],
            };
          }
          // If same direction, add to existing split
          if (node.direction === targetDirection) {
            const newSize = 100 / (node.panels.length + 1);
            return {
              ...node,
              panels: [
                ...node.panels.map((p) => ({ ...p, size: newSize })),
                { ...newTerminal, size: newSize },
              ],
            };
          }
          // Different direction, wrap in new split
          return {
            type: 'split',
            id: generateSplitId(),
            direction: targetDirection,
            panels: [{ ...node, size: 50 }, newTerminal],
          };
        };

        let newLayout: TerminalPanelContent;
        if (!activeTab.layout) {
          newLayout = { type: 'terminal', sessionId, size: 100 };
        } else if (targetSessionId) {
          newLayout = splitTargetTerminal(activeTab.layout, targetSessionId, direction);
        } else {
          newLayout = addToRootLayout(activeTab.layout, direction);
        }

        const newTabs = current.tabs.map((t) =>
          t.id === current.activeTabId ? { ...t, layout: newLayout } : t
        );

        set({
          terminalState: {
            ...current,
            tabs: newTabs,
            activeSessionId: sessionId,
          },
        });
      },

      removeTerminalFromLayout: (sessionId) => {
        const current = get().terminalState;
        if (current.tabs.length === 0) return;

        // Find which tab contains this session
        const findFirstTerminal = (node: TerminalPanelContent | null): string | null => {
          if (!node) return null;
          if (node.type === 'terminal') return node.sessionId;
          for (const panel of node.panels) {
            const found = findFirstTerminal(panel);
            if (found) return found;
          }
          return null;
        };

        const removeAndCollapse = (node: TerminalPanelContent): TerminalPanelContent | null => {
          if (node.type === 'terminal') {
            return node.sessionId === sessionId ? null : node;
          }
          const newPanels: TerminalPanelContent[] = [];
          for (const panel of node.panels) {
            const result = removeAndCollapse(panel);
            if (result !== null) newPanels.push(result);
          }
          if (newPanels.length === 0) return null;
          if (newPanels.length === 1) return newPanels[0];
          // Normalize sizes to sum to 100%
          const totalSize = newPanels.reduce((sum, p) => sum + (p.size || 0), 0);
          const normalizedPanels =
            totalSize > 0
              ? newPanels.map((p) => ({ ...p, size: ((p.size || 0) / totalSize) * 100 }))
              : newPanels.map((p) => ({ ...p, size: 100 / newPanels.length }));
          return { ...node, panels: normalizedPanels };
        };

        let newTabs = current.tabs.map((tab) => {
          if (!tab.layout) return tab;
          const newLayout = removeAndCollapse(tab.layout);
          return { ...tab, layout: newLayout };
        });

        // Remove empty tabs
        newTabs = newTabs.filter((tab) => tab.layout !== null);

        // Determine new active session
        const newActiveTabId =
          newTabs.length > 0
            ? current.activeTabId && newTabs.find((t) => t.id === current.activeTabId)
              ? current.activeTabId
              : newTabs[0].id
            : null;
        const newActiveSessionId = newActiveTabId
          ? findFirstTerminal(newTabs.find((t) => t.id === newActiveTabId)?.layout || null)
          : null;

        set({
          terminalState: {
            ...current,
            tabs: newTabs,
            activeTabId: newActiveTabId,
            activeSessionId: newActiveSessionId,
          },
        });
      },

      swapTerminals: (sessionId1, sessionId2) => {
        const current = get().terminalState;
        if (current.tabs.length === 0) return;

        const swapInLayout = (node: TerminalPanelContent): TerminalPanelContent => {
          if (node.type === 'terminal') {
            if (node.sessionId === sessionId1) return { ...node, sessionId: sessionId2 };
            if (node.sessionId === sessionId2) return { ...node, sessionId: sessionId1 };
            return node;
          }
          return { ...node, panels: node.panels.map(swapInLayout) };
        };

        const newTabs = current.tabs.map((tab) => ({
          ...tab,
          layout: tab.layout ? swapInLayout(tab.layout) : null,
        }));

        set({
          terminalState: { ...current, tabs: newTabs },
        });
      },

      clearTerminalState: () => {
        const current = get().terminalState;
        set({
          terminalState: {
            // Preserve auth state - user shouldn't need to re-authenticate
            isUnlocked: current.isUnlocked,
            authToken: current.authToken,
            // Clear session-specific state only
            tabs: [],
            activeTabId: null,
            activeSessionId: null,
            maximizedSessionId: null,
            // Preserve user preferences - these should persist across projects
            defaultFontSize: current.defaultFontSize,
            defaultRunScript: current.defaultRunScript,
            screenReaderMode: current.screenReaderMode,
            fontFamily: current.fontFamily,
            scrollbackLines: current.scrollbackLines,
            lineHeight: current.lineHeight,
            maxSessions: current.maxSessions,
          },
        });
      },

      setTerminalPanelFontSize: (sessionId, fontSize) => {
        const current = get().terminalState;
        const clampedSize = Math.max(8, Math.min(32, fontSize));

        const updateFontSize = (node: TerminalPanelContent): TerminalPanelContent => {
          if (node.type === 'terminal') {
            if (node.sessionId === sessionId) {
              return { ...node, fontSize: clampedSize };
            }
            return node;
          }
          return { ...node, panels: node.panels.map(updateFontSize) };
        };

        const newTabs = current.tabs.map((tab) => {
          if (!tab.layout) return tab;
          return { ...tab, layout: updateFontSize(tab.layout) };
        });

        set({
          terminalState: { ...current, tabs: newTabs },
        });
      },

      setTerminalDefaultFontSize: (fontSize) => {
        const current = get().terminalState;
        const clampedSize = Math.max(8, Math.min(32, fontSize));
        set({
          terminalState: { ...current, defaultFontSize: clampedSize },
        });
      },

      setTerminalDefaultRunScript: (script) => {
        const current = get().terminalState;
        set({
          terminalState: { ...current, defaultRunScript: script },
        });
      },

      setTerminalScreenReaderMode: (enabled) => {
        const current = get().terminalState;
        set({
          terminalState: { ...current, screenReaderMode: enabled },
        });
      },

      setTerminalFontFamily: (fontFamily) => {
        const current = get().terminalState;
        set({
          terminalState: { ...current, fontFamily },
        });
      },

      setTerminalScrollbackLines: (lines) => {
        const current = get().terminalState;
        // Clamp to reasonable range: 1000 - 100000 lines
        const clampedLines = Math.max(1000, Math.min(100000, lines));
        set({
          terminalState: { ...current, scrollbackLines: clampedLines },
        });
      },

      setTerminalLineHeight: (lineHeight) => {
        const current = get().terminalState;
        // Clamp to reasonable range: 1.0 - 2.0
        const clampedHeight = Math.max(1.0, Math.min(2.0, lineHeight));
        set({
          terminalState: { ...current, lineHeight: clampedHeight },
        });
      },

      setTerminalMaxSessions: (maxSessions) => {
        const current = get().terminalState;
        // Clamp to reasonable range: 1 - 500
        const clampedMax = Math.max(1, Math.min(500, maxSessions));
        set({
          terminalState: { ...current, maxSessions: clampedMax },
        });
      },

      addTerminalTab: (name) => {
        const current = get().terminalState;
        const newTabId = `tab-${Date.now()}`;
        const tabNumber = current.tabs.length + 1;
        const newTab: TerminalTab = {
          id: newTabId,
          name: name || `Terminal ${tabNumber}`,
          layout: null,
        };
        set({
          terminalState: {
            ...current,
            tabs: [...current.tabs, newTab],
            activeTabId: newTabId,
          },
        });
        return newTabId;
      },

      removeTerminalTab: (tabId) => {
        const current = get().terminalState;
        const newTabs = current.tabs.filter((t) => t.id !== tabId);
        let newActiveTabId = current.activeTabId;
        let newActiveSessionId = current.activeSessionId;

        if (current.activeTabId === tabId) {
          newActiveTabId = newTabs.length > 0 ? newTabs[0].id : null;
          if (newActiveTabId) {
            const newActiveTab = newTabs.find((t) => t.id === newActiveTabId);
            const findFirst = (node: TerminalPanelContent): string | null => {
              if (node.type === 'terminal') return node.sessionId;
              for (const p of node.panels) {
                const f = findFirst(p);
                if (f) return f;
              }
              return null;
            };
            newActiveSessionId = newActiveTab?.layout ? findFirst(newActiveTab.layout) : null;
          } else {
            newActiveSessionId = null;
          }
        }

        set({
          terminalState: {
            ...current,
            tabs: newTabs,
            activeTabId: newActiveTabId,
            activeSessionId: newActiveSessionId,
          },
        });
      },

      setActiveTerminalTab: (tabId) => {
        const current = get().terminalState;
        const tab = current.tabs.find((t) => t.id === tabId);
        if (!tab) return;

        let newActiveSessionId = current.activeSessionId;
        if (tab.layout) {
          const findFirst = (node: TerminalPanelContent): string | null => {
            if (node.type === 'terminal') return node.sessionId;
            for (const p of node.panels) {
              const f = findFirst(p);
              if (f) return f;
            }
            return null;
          };
          newActiveSessionId = findFirst(tab.layout);
        }

        set({
          terminalState: {
            ...current,
            activeTabId: tabId,
            activeSessionId: newActiveSessionId,
            // Clear maximized state when switching tabs - the maximized terminal
            // belongs to the previous tab and shouldn't persist across tab switches
            maximizedSessionId: null,
          },
        });
      },

      renameTerminalTab: (tabId, name) => {
        const current = get().terminalState;
        const newTabs = current.tabs.map((t) => (t.id === tabId ? { ...t, name } : t));
        set({
          terminalState: { ...current, tabs: newTabs },
        });
      },

      reorderTerminalTabs: (fromTabId, toTabId) => {
        const current = get().terminalState;
        const fromIndex = current.tabs.findIndex((t) => t.id === fromTabId);
        const toIndex = current.tabs.findIndex((t) => t.id === toTabId);

        if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
          return;
        }

        // Reorder tabs by moving fromIndex to toIndex
        const newTabs = [...current.tabs];
        const [movedTab] = newTabs.splice(fromIndex, 1);
        newTabs.splice(toIndex, 0, movedTab);

        set({
          terminalState: { ...current, tabs: newTabs },
        });
      },

      moveTerminalToTab: (sessionId, targetTabId) => {
        const current = get().terminalState;

        let sourceTabId: string | null = null;
        let originalTerminalNode: (TerminalPanelContent & { type: 'terminal' }) | null = null;

        const findTerminal = (
          node: TerminalPanelContent
        ): (TerminalPanelContent & { type: 'terminal' }) | null => {
          if (node.type === 'terminal') {
            return node.sessionId === sessionId ? node : null;
          }
          for (const panel of node.panels) {
            const found = findTerminal(panel);
            if (found) return found;
          }
          return null;
        };

        for (const tab of current.tabs) {
          if (tab.layout) {
            const found = findTerminal(tab.layout);
            if (found) {
              sourceTabId = tab.id;
              originalTerminalNode = found;
              break;
            }
          }
        }
        if (!sourceTabId || !originalTerminalNode) return;
        if (sourceTabId === targetTabId) return;

        const sourceTab = current.tabs.find((t) => t.id === sourceTabId);
        if (!sourceTab?.layout) return;

        const removeAndCollapse = (node: TerminalPanelContent): TerminalPanelContent | null => {
          if (node.type === 'terminal') {
            return node.sessionId === sessionId ? null : node;
          }
          const newPanels: TerminalPanelContent[] = [];
          for (const panel of node.panels) {
            const result = removeAndCollapse(panel);
            if (result !== null) newPanels.push(result);
          }
          if (newPanels.length === 0) return null;
          if (newPanels.length === 1) return newPanels[0];
          // Normalize sizes to sum to 100%
          const totalSize = newPanels.reduce((sum, p) => sum + (p.size || 0), 0);
          const normalizedPanels =
            totalSize > 0
              ? newPanels.map((p) => ({ ...p, size: ((p.size || 0) / totalSize) * 100 }))
              : newPanels.map((p) => ({ ...p, size: 100 / newPanels.length }));
          return { ...node, panels: normalizedPanels };
        };

        const newSourceLayout = removeAndCollapse(sourceTab.layout);

        let finalTargetTabId = targetTabId;
        let newTabs = current.tabs;

        if (targetTabId === 'new') {
          const newTabId = `tab-${Date.now()}`;
          const sourceWillBeRemoved = !newSourceLayout;
          const tabName = sourceWillBeRemoved
            ? sourceTab.name
            : `Terminal ${current.tabs.length + 1}`;
          newTabs = [
            ...current.tabs,
            {
              id: newTabId,
              name: tabName,
              layout: {
                type: 'terminal',
                sessionId,
                size: 100,
                fontSize: originalTerminalNode.fontSize,
              },
            },
          ];
          finalTargetTabId = newTabId;
        } else {
          const targetTab = current.tabs.find((t) => t.id === targetTabId);
          if (!targetTab) return;

          const terminalNode: TerminalPanelContent = {
            type: 'terminal',
            sessionId,
            size: 50,
            fontSize: originalTerminalNode.fontSize,
          };
          let newTargetLayout: TerminalPanelContent;

          if (!targetTab.layout) {
            newTargetLayout = {
              type: 'terminal',
              sessionId,
              size: 100,
              fontSize: originalTerminalNode.fontSize,
            };
          } else if (targetTab.layout.type === 'terminal') {
            newTargetLayout = {
              type: 'split',
              id: generateSplitId(),
              direction: 'horizontal',
              panels: [{ ...targetTab.layout, size: 50 }, terminalNode],
            };
          } else {
            newTargetLayout = {
              ...targetTab.layout,
              panels: [...targetTab.layout.panels, terminalNode],
            };
          }

          newTabs = current.tabs.map((t) =>
            t.id === targetTabId ? { ...t, layout: newTargetLayout } : t
          );
        }

        if (!newSourceLayout) {
          newTabs = newTabs.filter((t) => t.id !== sourceTabId);
        } else {
          newTabs = newTabs.map((t) =>
            t.id === sourceTabId ? { ...t, layout: newSourceLayout } : t
          );
        }

        set({
          terminalState: {
            ...current,
            tabs: newTabs,
            activeTabId: finalTargetTabId,
            activeSessionId: sessionId,
          },
        });
      },

      addTerminalToTab: (sessionId, tabId, direction = 'horizontal') => {
        const current = get().terminalState;
        const tab = current.tabs.find((t) => t.id === tabId);
        if (!tab) return;

        const terminalNode: TerminalPanelContent = {
          type: 'terminal',
          sessionId,
          size: 50,
        };
        let newLayout: TerminalPanelContent;

        if (!tab.layout) {
          newLayout = { type: 'terminal', sessionId, size: 100 };
        } else if (tab.layout.type === 'terminal') {
          newLayout = {
            type: 'split',
            id: generateSplitId(),
            direction,
            panels: [{ ...tab.layout, size: 50 }, terminalNode],
          };
        } else {
          if (tab.layout.direction === direction) {
            const newSize = 100 / (tab.layout.panels.length + 1);
            newLayout = {
              ...tab.layout,
              panels: [
                ...tab.layout.panels.map((p) => ({ ...p, size: newSize })),
                { ...terminalNode, size: newSize },
              ],
            };
          } else {
            newLayout = {
              type: 'split',
              id: generateSplitId(),
              direction,
              panels: [{ ...tab.layout, size: 50 }, terminalNode],
            };
          }
        }

        const newTabs = current.tabs.map((t) => (t.id === tabId ? { ...t, layout: newLayout } : t));

        set({
          terminalState: {
            ...current,
            tabs: newTabs,
            activeTabId: tabId,
            activeSessionId: sessionId,
          },
        });
      },

      setTerminalTabLayout: (tabId, layout, activeSessionId) => {
        const current = get().terminalState;
        const tab = current.tabs.find((t) => t.id === tabId);
        if (!tab) return;

        const newTabs = current.tabs.map((t) => (t.id === tabId ? { ...t, layout } : t));

        // Find first terminal in layout if no activeSessionId provided
        const findFirst = (node: TerminalPanelContent): string | null => {
          if (node.type === 'terminal') return node.sessionId;
          for (const p of node.panels) {
            const found = findFirst(p);
            if (found) return found;
          }
          return null;
        };

        const newActiveSessionId = activeSessionId || findFirst(layout);

        set({
          terminalState: {
            ...current,
            tabs: newTabs,
            activeTabId: tabId,
            activeSessionId: newActiveSessionId,
          },
        });
      },

      updateTerminalPanelSizes: (tabId, panelKeys, sizes) => {
        const current = get().terminalState;
        const tab = current.tabs.find((t) => t.id === tabId);
        if (!tab || !tab.layout) return;

        // Create a map of panel key to new size
        const sizeMap = new Map<string, number>();
        panelKeys.forEach((key, index) => {
          sizeMap.set(key, sizes[index]);
        });

        // Helper to generate panel key (matches getPanelKey in terminal-view.tsx)
        const getPanelKey = (panel: TerminalPanelContent): string => {
          if (panel.type === 'terminal') return panel.sessionId;
          const childKeys = panel.panels.map(getPanelKey).join('-');
          return `split-${panel.direction}-${childKeys}`;
        };

        // Recursively update sizes in the layout
        const updateSizes = (panel: TerminalPanelContent): TerminalPanelContent => {
          const key = getPanelKey(panel);
          const newSize = sizeMap.get(key);

          if (panel.type === 'terminal') {
            return newSize !== undefined ? { ...panel, size: newSize } : panel;
          }

          return {
            ...panel,
            size: newSize !== undefined ? newSize : panel.size,
            panels: panel.panels.map(updateSizes),
          };
        };

        const updatedLayout = updateSizes(tab.layout);

        const newTabs = current.tabs.map((t) =>
          t.id === tabId ? { ...t, layout: updatedLayout } : t
        );

        set({
          terminalState: { ...current, tabs: newTabs },
        });
      },

      // Convert runtime layout to persisted format (preserves sessionIds for reconnection)
      saveTerminalLayout: (projectPath) => {
        const current = get().terminalState;
        if (current.tabs.length === 0) {
          // Nothing to save, clear any existing layout
          const { [projectPath]: _, ...rest } = get().terminalLayoutByProject;
          set({ terminalLayoutByProject: rest });
          return;
        }

        // Convert TerminalPanelContent to PersistedTerminalPanel
        // Now preserves sessionId so we can reconnect when switching back
        const persistPanel = (panel: TerminalPanelContent): PersistedTerminalPanel => {
          if (panel.type === 'terminal') {
            return {
              type: 'terminal',
              size: panel.size,
              fontSize: panel.fontSize,
              sessionId: panel.sessionId, // Preserve for reconnection
            };
          }
          return {
            type: 'split',
            id: panel.id, // Preserve stable ID
            direction: panel.direction,
            panels: panel.panels.map(persistPanel),
            size: panel.size,
          };
        };

        const persistedTabs: PersistedTerminalTab[] = current.tabs.map((tab) => ({
          id: tab.id,
          name: tab.name,
          layout: tab.layout ? persistPanel(tab.layout) : null,
        }));

        const activeTabIndex = current.tabs.findIndex((t) => t.id === current.activeTabId);

        const persisted: PersistedTerminalState = {
          tabs: persistedTabs,
          activeTabIndex: activeTabIndex >= 0 ? activeTabIndex : 0,
          defaultFontSize: current.defaultFontSize,
          defaultRunScript: current.defaultRunScript,
          screenReaderMode: current.screenReaderMode,
          fontFamily: current.fontFamily,
          scrollbackLines: current.scrollbackLines,
          lineHeight: current.lineHeight,
        };

        set({
          terminalLayoutByProject: {
            ...get().terminalLayoutByProject,
            [projectPath]: persisted,
          },
        });
      },

      getPersistedTerminalLayout: (projectPath) => {
        return get().terminalLayoutByProject[projectPath] || null;
      },

      clearPersistedTerminalLayout: (projectPath) => {
        const { [projectPath]: _, ...rest } = get().terminalLayoutByProject;
        set({ terminalLayoutByProject: rest });
      },

      // Spec Creation actions
      setSpecCreatingForProject: (projectPath) => {
        set({ specCreatingForProject: projectPath });
      },

      isSpecCreatingForProject: (projectPath) => {
        return get().specCreatingForProject === projectPath;
      },

      setDefaultPlanningMode: (mode) => set({ defaultPlanningMode: mode }),
      setDefaultRequirePlanApproval: (require) => set({ defaultRequirePlanApproval: require }),
      setDefaultAIProfileId: (profileId) => set({ defaultAIProfileId: profileId }),

      // Plan Approval actions
      setPendingPlanApproval: (approval) => set({ pendingPlanApproval: approval }),

      // Claude Usage Tracking actions
      setClaudeRefreshInterval: (interval: number) => set({ claudeRefreshInterval: interval }),
      setClaudeUsageLastUpdated: (timestamp: number) => set({ claudeUsageLastUpdated: timestamp }),
      setClaudeUsage: (usage: ClaudeUsage | null) =>
        set({
          claudeUsage: usage,
          claudeUsageLastUpdated: usage ? Date.now() : null,
        }),

      // Reset
      reset: () => set(initialState),
    }),
    {
      name: 'automaker-storage',
      version: 3, // Increment when making breaking changes to persisted state
      // Custom merge function to properly restore terminal settings on every load
      // The default shallow merge doesn't work because we persist terminalSettings
      // separately from terminalState (to avoid persisting session data like tabs)
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<AppState> & {
          terminalSettings?: PersistedTerminalSettings;
        };
        const current = currentState as AppState & AppActions;

        // Start with default shallow merge
        const merged = { ...current, ...persisted } as AppState & AppActions;

        // Restore terminal settings into terminalState
        // terminalSettings is persisted separately from terminalState to avoid
        // persisting session data (tabs, activeSessionId, etc.)
        if (persisted.terminalSettings) {
          merged.terminalState = {
            // Start with current (initial) terminalState for session fields
            ...current.terminalState,
            // Override with persisted settings
            defaultFontSize:
              persisted.terminalSettings.defaultFontSize ?? current.terminalState.defaultFontSize,
            defaultRunScript:
              persisted.terminalSettings.defaultRunScript ?? current.terminalState.defaultRunScript,
            screenReaderMode:
              persisted.terminalSettings.screenReaderMode ?? current.terminalState.screenReaderMode,
            fontFamily: persisted.terminalSettings.fontFamily ?? current.terminalState.fontFamily,
            scrollbackLines:
              persisted.terminalSettings.scrollbackLines ?? current.terminalState.scrollbackLines,
            lineHeight: persisted.terminalSettings.lineHeight ?? current.terminalState.lineHeight,
            maxSessions:
              persisted.terminalSettings.maxSessions ?? current.terminalState.maxSessions,
          };
        }

        return merged;
      },
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as Partial<AppState>;

        // Migration from version 0 (no version) to version 1:
        // - Change addContextFile shortcut from "F" to "N"
        if (version === 0) {
          if (state.keyboardShortcuts?.addContextFile === 'F') {
            state.keyboardShortcuts.addContextFile = 'N';
          }
        }

        // Migration from version 1 to version 2:
        // - Change terminal shortcut from "Cmd+`" to "T"
        if (version <= 1) {
          if (
            state.keyboardShortcuts?.terminal === 'Cmd+`' ||
            state.keyboardShortcuts?.terminal === undefined
          ) {
            state.keyboardShortcuts = {
              ...DEFAULT_KEYBOARD_SHORTCUTS,
              ...state.keyboardShortcuts,
              terminal: 'T',
            };
          }
        }

        // Migration from version 2 to version 3:
        // - Fix GLM model name from lowercase 'glm-4.7' to uppercase 'GLM-4.7'
        if (version <= 2) {
          // Fix enhancementModel
          if ((state.enhancementModel as string) === 'glm-4.7') {
            state.enhancementModel = 'GLM-4.7';
          }
          // Fix model in AI profiles
          if (state.aiProfiles) {
            state.aiProfiles = state.aiProfiles.map((profile) => ({
              ...profile,
              model: profile.model === 'glm-4.7' ? 'GLM-4.7' : profile.model,
              planningModel:
                profile.planningModel === 'glm-4.7' ? 'GLM-4.7' : profile.planningModel,
            }));
          }
        }

        // Rehydrate terminal settings from persisted state
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const persistedSettings = (state as any).terminalSettings as
          | PersistedTerminalSettings
          | undefined;
        if (persistedSettings) {
          state.terminalState = {
            ...state.terminalState,
            // Preserve session state (tabs, activeTabId, etc.) but restore settings
            isUnlocked: state.terminalState?.isUnlocked ?? false,
            authToken: state.terminalState?.authToken ?? null,
            tabs: state.terminalState?.tabs ?? [],
            activeTabId: state.terminalState?.activeTabId ?? null,
            activeSessionId: state.terminalState?.activeSessionId ?? null,
            maximizedSessionId: state.terminalState?.maximizedSessionId ?? null,
            // Restore persisted settings
            defaultFontSize: persistedSettings.defaultFontSize ?? 14,
            defaultRunScript: persistedSettings.defaultRunScript ?? '',
            screenReaderMode: persistedSettings.screenReaderMode ?? false,
            fontFamily: persistedSettings.fontFamily ?? "Menlo, Monaco, 'Courier New', monospace",
            scrollbackLines: persistedSettings.scrollbackLines ?? 5000,
            lineHeight: persistedSettings.lineHeight ?? 1.0,
            maxSessions: persistedSettings.maxSessions ?? 100,
          };
        }

        return state as AppState;
      },
      partialize: (state) =>
        ({
          // Project management
          projects: state.projects,
          currentProject: state.currentProject,
          trashedProjects: state.trashedProjects,
          projectHistory: state.projectHistory,
          projectHistoryIndex: state.projectHistoryIndex,
          // Features - cached locally for faster hydration (authoritative source is server)
          features: state.features,
          // UI state
          currentView: state.currentView,
          theme: state.theme,
          sidebarOpen: state.sidebarOpen,
          chatHistoryOpen: state.chatHistoryOpen,
          kanbanCardDetailLevel: state.kanbanCardDetailLevel,
          boardViewMode: state.boardViewMode,
          // Settings
          apiKeys: state.apiKeys,
          maxConcurrency: state.maxConcurrency,
          // Note: autoModeByProject is intentionally NOT persisted
          // Auto-mode should always default to OFF on app refresh
          defaultSkipTests: state.defaultSkipTests,
          enableDependencyBlocking: state.enableDependencyBlocking,
          useWorktrees: state.useWorktrees,
          currentWorktreeByProject: state.currentWorktreeByProject,
          worktreesByProject: state.worktreesByProject,
          showProfilesOnly: state.showProfilesOnly,
          keyboardShortcuts: state.keyboardShortcuts,
          muteDoneSound: state.muteDoneSound,
          enhancementModel: state.enhancementModel,
          // Profiles, MCP servers, and sessions
          aiProfiles: state.aiProfiles,
          mcpServers: state.mcpServers,
          chatSessions: state.chatSessions,
          lastSelectedSessionByProject: state.lastSelectedSessionByProject,
          // Board background settings
          boardBackgroundByProject: state.boardBackgroundByProject,
          // Terminal layout persistence (per-project)
          terminalLayoutByProject: state.terminalLayoutByProject,
          // Terminal settings persistence (global)
          terminalSettings: {
            defaultFontSize: state.terminalState.defaultFontSize,
            defaultRunScript: state.terminalState.defaultRunScript,
            screenReaderMode: state.terminalState.screenReaderMode,
            fontFamily: state.terminalState.fontFamily,
            scrollbackLines: state.terminalState.scrollbackLines,
            lineHeight: state.terminalState.lineHeight,
            maxSessions: state.terminalState.maxSessions,
          } as PersistedTerminalSettings,
          defaultPlanningMode: state.defaultPlanningMode,
          defaultRequirePlanApproval: state.defaultRequirePlanApproval,
          defaultAIProfileId: state.defaultAIProfileId,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }) as any,
    }
  )
);
