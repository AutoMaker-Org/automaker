import { create } from 'zustand';
// Note: persist middleware removed - settings now sync via API (use-settings-sync.ts)
import type { Project, TrashedProject } from '@/lib/electron';
import { getElectronAPI } from '@/lib/electron';
import { createLogger } from '@automaker/utils/logger';
import { setItem, getItem } from '@/lib/storage';
import type {
  Feature as BaseFeature,
  FeatureImagePath,
  FeatureTextFilePath,
  ModelAlias,
  PlanningMode,
  ThinkingLevel,
  ModelProvider,
  CursorModelId,
  CodexModelId,
  OpencodeModelId,
  PhaseModelConfig,
  PhaseModelKey,
  PhaseModelEntry,
  MCPServerConfig,
  FeatureStatusWithPipeline,
  PipelineConfig,
  PipelineStep,
  PromptCustomization,
} from '@automaker/types';
import {
  getAllCursorModelIds,
  getAllCodexModelIds,
  getAllOpencodeModelIds,
  DEFAULT_PHASE_MODELS,
  DEFAULT_OPENCODE_MODEL,
} from '@automaker/types';

const logger = createLogger('AppStore');

// Re-export types for convenience
export type {
  ModelAlias,
  PlanningMode,
  ThinkingLevel,
  ModelProvider,
  FeatureTextFilePath,
  FeatureImagePath,
};

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

// LocalStorage key for theme persistence (fallback when server settings aren't available)
export const THEME_STORAGE_KEY = 'automaker:theme';

/**
 * Get the theme from localStorage as a fallback
 * Used before server settings are loaded (e.g., on login/setup pages)
 */
export function getStoredTheme(): ThemeMode | null {
  const stored = getItem(THEME_STORAGE_KEY);
  if (stored) return stored as ThemeMode;

  // Backwards compatibility: older versions stored theme inside the Zustand persist blob.
  // We intentionally keep reading it as a fallback so users don't get a "default theme flash"
  // on login/logged-out pages if THEME_STORAGE_KEY hasn't been written yet.
  try {
    const legacy = getItem('automaker-storage');
    if (!legacy) return null;
    const parsed = JSON.parse(legacy) as { state?: { theme?: unknown } } | { theme?: unknown };
    const theme = (parsed as any)?.state?.theme ?? (parsed as any)?.theme;
    if (typeof theme === 'string' && theme.length > 0) {
      return theme as ThemeMode;
    }
  } catch {
    // Ignore legacy parse errors
  }

  return null;
}

/**
 * Save theme to localStorage for immediate persistence
 * This is used as a fallback when server settings can't be loaded
 */
function saveThemeToStorage(theme: ThemeMode): void {
  setItem(THEME_STORAGE_KEY, theme);
}

function persistEffectiveThemeForProject(project: Project | null, fallbackTheme: ThemeMode): void {
  const projectTheme = project?.theme as ThemeMode | undefined;
  const themeToStore = projectTheme ?? fallbackTheme;
  saveThemeToStorage(themeToStore);
}

export type BoardViewMode = 'kanban' | 'graph';

export interface ApiKeys {
  anthropic: string;
  google: string;
  openai: string;
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
  graph: string;
  agent: string;
  spec: string;
  context: string;
  memory: string;
  settings: string;
  terminal: string;
  ideation: string;
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

// Default keyboard shortcuts
export const DEFAULT_KEYBOARD_SHORTCUTS: KeyboardShortcuts = {
  // Navigation
  board: 'K',
  graph: 'H',
  agent: 'A',
  spec: 'D',
  context: 'C',
  memory: 'Y',
  settings: 'S',
  terminal: 'T',
  ideation: 'I',
  githubIssues: 'G',
  githubPrs: 'R',

  // UI
  toggleSidebar: '`',

  // Actions
  // Note: Some shortcuts share the same key (e.g., "N" for addFeature, newSession)
  // This is intentional as they are context-specific and only active in their respective views
  addFeature: 'N', // Only active in board view
  addContextFile: 'N', // Only active in context view
  startNext: 'G', // Only active in board view
  newSession: 'N', // Only active in agent view
  openProject: 'O', // Global shortcut
  projectPicker: 'P', // Global shortcut
  cyclePrevProject: 'Q', // Global shortcut
  cycleNextProject: 'E', // Global shortcut

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
  status: FeatureStatusWithPipeline;
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
  lastActiveProjectPath: string | null; // Last project path to detect route changes vs project switches
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
  boardViewMode: BoardViewMode; // Whether to show kanban or dependency graph view

  // Feature Default Settings
  defaultSkipTests: boolean; // Default value for skip tests when creating new features
  enableDependencyBlocking: boolean; // When true, show blocked badges and warnings for features with incomplete dependencies (default: true)
  skipVerificationInAutoMode: boolean; // When true, auto-mode grabs features even if dependencies are not verified (only checks they're not running)

  // Worktree Settings
  useWorktrees: boolean; // Whether to use git worktree isolation for features (default: true)

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

  // Keyboard Shortcuts
  keyboardShortcuts: KeyboardShortcuts; // User-defined keyboard shortcuts

  // Audio Settings
  muteDoneSound: boolean; // When true, mute the notification sound when agents complete (default: false)

  // Enhancement Model Settings
  enhancementModel: ModelAlias; // Model used for feature enhancement (default: sonnet)

  // Validation Model Settings
  validationModel: ModelAlias; // Model used for GitHub issue validation (default: opus)

  // Phase Model Settings - per-phase AI model configuration
  phaseModels: PhaseModelConfig;
  favoriteModels: string[];

  // Cursor CLI Settings (global)
  enabledCursorModels: CursorModelId[]; // Which Cursor models are available in feature modal
  cursorDefaultModel: CursorModelId; // Default Cursor model selection

  // Codex CLI Settings (global)
  enabledCodexModels: CodexModelId[]; // Which Codex models are available in feature modal
  codexDefaultModel: CodexModelId; // Default Codex model selection
  codexAutoLoadAgents: boolean; // Auto-load .codex/AGENTS.md files
  codexSandboxMode: 'read-only' | 'workspace-write' | 'danger-full-access'; // Sandbox policy
  codexApprovalPolicy: 'untrusted' | 'on-failure' | 'on-request' | 'never'; // Approval policy
  codexEnableWebSearch: boolean; // Enable web search capability
  codexEnableImages: boolean; // Enable image processing

  // OpenCode CLI Settings (global)
  enabledOpencodeModels: OpencodeModelId[]; // Which OpenCode models are available in feature modal
  opencodeDefaultModel: OpencodeModelId; // Default OpenCode model selection

  // Claude Agent SDK Settings
  autoLoadClaudeMd: boolean; // Auto-load CLAUDE.md files using SDK's settingSources option
  skipSandboxWarning: boolean; // Skip the sandbox environment warning dialog on startup

  // MCP Servers
  mcpServers: MCPServerConfig[]; // List of configured MCP servers for agent use

  // Editor Configuration
  defaultEditorCommand: string | null; // Default editor for "Open In" action

  // Skills Configuration
  enableSkills: boolean; // Enable Skills functionality (loads from .claude/skills/ directories)
  skillsSources: Array<'user' | 'project'>; // Which directories to load Skills from

  // Subagents Configuration
  enableSubagents: boolean; // Enable Custom Subagents functionality (loads from .claude/agents/ directories)
  subagentsSources: Array<'user' | 'project'>; // Which directories to load Subagents from

  // Prompt Customization
  promptCustomization: PromptCustomization; // Custom prompts for Auto Mode, Agent, Backlog Plan, Enhancement

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

  // Codex Usage Tracking
  codexUsage: CodexUsage | null;
  codexUsageLastUpdated: number | null;

  // Codex Models (dynamically fetched)
  codexModels: Array<{
    id: string;
    label: string;
    description: string;
    hasThinking: boolean;
    supportsVision: boolean;
    tier: 'premium' | 'standard' | 'basic';
    isDefault: boolean;
  }>;
  codexModelsLoading: boolean;
  codexModelsError: string | null;
  codexModelsLastFetched: number | null;

  // Pipeline Configuration (per-project, keyed by project path)
  pipelineConfigByProject: Record<string, PipelineConfig>;

  // Worktree Panel Visibility (per-project, keyed by project path)
  // Whether the worktree panel row is visible (default: true)
  worktreePanelVisibleByProject: Record<string, boolean>;

  // UI State (previously in localStorage, now synced via API)
  /** Whether worktree panel is collapsed in board view */
  worktreePanelCollapsed: boolean;
  /** Last directory opened in file picker */
  lastProjectDir: string;
  /** Recently accessed folders for quick access */
  recentFolders: string[];
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

// Codex Usage types
export type CodexPlanType =
  | 'free'
  | 'plus'
  | 'pro'
  | 'team'
  | 'business'
  | 'enterprise'
  | 'edu'
  | 'unknown';

export interface CodexRateLimitWindow {
  limit: number;
  used: number;
  remaining: number;
  usedPercent: number; // Percentage used (0-100)
  windowDurationMins: number; // Duration in minutes
  resetsAt: number; // Unix timestamp in seconds
}

export interface CodexUsage {
  rateLimits: {
    primary?: CodexRateLimitWindow;
    secondary?: CodexRateLimitWindow;
    planType?: CodexPlanType;
  } | null;
  lastUpdated: string;
}

// Response type for Codex usage API (can be success or error)
export type CodexUsageResponse = CodexUsage | { error: string; message?: string };

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
  toggleProjectFavorite: (projectId: string) => void; // Toggle project favorite status

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
  setBoardViewMode: (mode: BoardViewMode) => void;

  // Feature Default Settings actions
  setDefaultSkipTests: (skip: boolean) => void;
  setEnableDependencyBlocking: (enabled: boolean) => void;
  setSkipVerificationInAutoMode: (enabled: boolean) => Promise<void>;

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

  // Keyboard Shortcuts actions
  setKeyboardShortcut: (key: keyof KeyboardShortcuts, value: string) => void;
  setKeyboardShortcuts: (shortcuts: Partial<KeyboardShortcuts>) => void;
  resetKeyboardShortcuts: () => void;

  // Audio Settings actions
  setMuteDoneSound: (muted: boolean) => void;

  // Enhancement Model actions
  setEnhancementModel: (model: ModelAlias) => void;

  // Validation Model actions
  setValidationModel: (model: ModelAlias) => void;

  // Phase Model actions
  setPhaseModel: (phase: PhaseModelKey, entry: PhaseModelEntry) => Promise<void>;
  setPhaseModels: (models: Partial<PhaseModelConfig>) => Promise<void>;
  resetPhaseModels: () => Promise<void>;
  toggleFavoriteModel: (modelId: string) => void;

  // Cursor CLI Settings actions
  setEnabledCursorModels: (models: CursorModelId[]) => void;
  setCursorDefaultModel: (model: CursorModelId) => void;
  toggleCursorModel: (model: CursorModelId, enabled: boolean) => void;

  // Codex CLI Settings actions
  setEnabledCodexModels: (models: CodexModelId[]) => void;
  setCodexDefaultModel: (model: CodexModelId) => void;
  toggleCodexModel: (model: CodexModelId, enabled: boolean) => void;
  setCodexAutoLoadAgents: (enabled: boolean) => Promise<void>;
  setCodexSandboxMode: (
    mode: 'read-only' | 'workspace-write' | 'danger-full-access'
  ) => Promise<void>;
  setCodexApprovalPolicy: (
    policy: 'untrusted' | 'on-failure' | 'on-request' | 'never'
  ) => Promise<void>;
  setCodexEnableWebSearch: (enabled: boolean) => Promise<void>;
  setCodexEnableImages: (enabled: boolean) => Promise<void>;

  // OpenCode CLI Settings actions
  setEnabledOpencodeModels: (models: OpencodeModelId[]) => void;
  setOpencodeDefaultModel: (model: OpencodeModelId) => void;
  toggleOpencodeModel: (model: OpencodeModelId, enabled: boolean) => void;

  // Claude Agent SDK Settings actions
  setAutoLoadClaudeMd: (enabled: boolean) => Promise<void>;
  setSkipSandboxWarning: (skip: boolean) => Promise<void>;

  // Editor Configuration actions
  setDefaultEditorCommand: (command: string | null) => void;

  // Prompt Customization actions
  setPromptCustomization: (customization: PromptCustomization) => Promise<void>;

  // MCP Server actions
  addMCPServer: (server: Omit<MCPServerConfig, 'id'>) => void;
  updateMCPServer: (id: string, updates: Partial<MCPServerConfig>) => void;
  removeMCPServer: (id: string) => void;
  reorderMCPServers: (oldIndex: number, newIndex: number) => void;

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
  setTerminalLastActiveProjectPath: (projectPath: string | null) => void;
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

  // Plan Approval actions
  setPendingPlanApproval: (
    approval: {
      featureId: string;
      projectPath: string;
      planContent: string;
      planningMode: 'lite' | 'spec' | 'full';
    } | null
  ) => void;

  // Pipeline actions
  setPipelineConfig: (projectPath: string, config: PipelineConfig) => void;
  getPipelineConfig: (projectPath: string) => PipelineConfig | null;
  addPipelineStep: (
    projectPath: string,
    step: Omit<PipelineStep, 'id' | 'createdAt' | 'updatedAt'>
  ) => PipelineStep;
  updatePipelineStep: (
    projectPath: string,
    stepId: string,
    updates: Partial<Omit<PipelineStep, 'id' | 'createdAt'>>
  ) => void;
  deletePipelineStep: (projectPath: string, stepId: string) => void;
  reorderPipelineSteps: (projectPath: string, stepIds: string[]) => void;

  // Worktree Panel Visibility actions (per-project)
  setWorktreePanelVisible: (projectPath: string, visible: boolean) => void;
  getWorktreePanelVisible: (projectPath: string) => boolean;

  // UI State actions (previously in localStorage, now synced via API)
  setWorktreePanelCollapsed: (collapsed: boolean) => void;
  setLastProjectDir: (dir: string) => void;
  setRecentFolders: (folders: string[]) => void;
  addRecentFolder: (folder: string) => void;

  // Claude Usage Tracking actions
  setClaudeRefreshInterval: (interval: number) => void;
  setClaudeUsageLastUpdated: (timestamp: number) => void;
  setClaudeUsage: (usage: ClaudeUsage | null) => void;

  // Codex Usage Tracking actions
  setCodexUsage: (usage: CodexUsage | null) => void;

  // Codex Models actions
  fetchCodexModels: (forceRefresh?: boolean) => Promise<void>;
  setCodexModels: (
    models: Array<{
      id: string;
      label: string;
      description: string;
      hasThinking: boolean;
      supportsVision: boolean;
      tier: 'premium' | 'standard' | 'basic';
      isDefault: boolean;
    }>
  ) => void;

  // Reset
  reset: () => void;
}

const initialState: AppState = {
  projects: [],
  currentProject: null,
  trashedProjects: [],
  projectHistory: [],
  projectHistoryIndex: -1,
  currentView: 'welcome',
  sidebarOpen: true,
  lastSelectedSessionByProject: {},
  theme: getStoredTheme() || 'dark', // Use localStorage theme as initial value, fallback to 'dark'
  features: [],
  appSpec: '',
  ipcConnected: false,
  apiKeys: {
    anthropic: '',
    google: '',
    openai: '',
  },
  chatSessions: [],
  currentChatSession: null,
  chatHistoryOpen: false,
  autoModeByProject: {},
  autoModeActivityLog: [],
  maxConcurrency: 3, // Default to 3 concurrent agents
  boardViewMode: 'kanban', // Default to kanban view
  defaultSkipTests: true, // Default to manual verification (tests disabled)
  enableDependencyBlocking: true, // Default to enabled (show dependency blocking UI)
  skipVerificationInAutoMode: false, // Default to disabled (require dependencies to be verified)
  useWorktrees: true, // Default to enabled (git worktree isolation)
  currentWorktreeByProject: {},
  worktreesByProject: {},
  keyboardShortcuts: DEFAULT_KEYBOARD_SHORTCUTS, // Default keyboard shortcuts
  muteDoneSound: false, // Default to sound enabled (not muted)
  enhancementModel: 'sonnet', // Default to sonnet for feature enhancement
  validationModel: 'opus', // Default to opus for GitHub issue validation
  phaseModels: DEFAULT_PHASE_MODELS, // Phase-specific model configuration
  favoriteModels: [],
  enabledCursorModels: getAllCursorModelIds(), // All Cursor models enabled by default
  cursorDefaultModel: 'auto', // Default to auto selection
  enabledCodexModels: getAllCodexModelIds(), // All Codex models enabled by default
  codexDefaultModel: 'codex-gpt-5.2-codex', // Default to GPT-5.2-Codex
  codexAutoLoadAgents: false, // Default to disabled (user must opt-in)
  codexSandboxMode: 'workspace-write', // Default to workspace-write for safety
  codexApprovalPolicy: 'on-request', // Default to on-request for balanced safety
  codexEnableWebSearch: false, // Default to disabled
  codexEnableImages: false, // Default to disabled
  enabledOpencodeModels: getAllOpencodeModelIds(), // All OpenCode models enabled by default
  opencodeDefaultModel: DEFAULT_OPENCODE_MODEL, // Default to Claude Sonnet 4.5
  autoLoadClaudeMd: false, // Default to disabled (user must opt-in)
  skipSandboxWarning: false, // Default to disabled (show sandbox warning dialog)
  mcpServers: [], // No MCP servers configured by default
  defaultEditorCommand: null, // Auto-detect: Cursor > VS Code > first available
  enableSkills: true, // Skills enabled by default
  skillsSources: ['user', 'project'] as Array<'user' | 'project'>, // Load from both sources by default
  enableSubagents: true, // Subagents enabled by default
  subagentsSources: ['user', 'project'] as Array<'user' | 'project'>, // Load from both sources by default
  promptCustomization: {}, // Empty by default - all prompts use built-in defaults
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
    lastActiveProjectPath: null,
  },
  terminalLayoutByProject: {},
  specCreatingForProject: null,
  defaultPlanningMode: 'skip' as PlanningMode,
  defaultRequirePlanApproval: false,
  pendingPlanApproval: null,
  claudeRefreshInterval: 60,
  claudeUsage: null,
  claudeUsageLastUpdated: null,
  codexUsage: null,
  codexUsageLastUpdated: null,
  codexModels: [],
  codexModelsLoading: false,
  codexModelsError: null,
  codexModelsLastFetched: null,
  pipelineConfigByProject: {},
  worktreePanelVisibleByProject: {},
  // UI State (previously in localStorage, now synced via API)
  worktreePanelCollapsed: false,
  lastProjectDir: '',
  recentFolders: [],
};

export const useAppStore = create<AppState & AppActions>()((set, get) => ({
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
    const nextCurrentProject = isCurrent ? null : get().currentProject;

    set({
      projects: remainingProjects,
      trashedProjects: [trashedProject, ...existingTrash],
      currentProject: nextCurrentProject,
      currentView: isCurrent ? 'welcome' : get().currentView,
    });

    persistEffectiveThemeForProject(nextCurrentProject, get().theme);
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
      persistEffectiveThemeForProject(samePathProject, get().theme);
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
    persistEffectiveThemeForProject(restoredProject, get().theme);
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
    persistEffectiveThemeForProject(project, get().theme);
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
      const effectiveTheme = theme || trashedProject?.theme || currentProject?.theme || globalTheme;
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
      persistEffectiveThemeForProject(targetProject, get().theme);
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
      persistEffectiveThemeForProject(targetProject, get().theme);
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

  toggleProjectFavorite: (projectId) => {
    const { projects, currentProject } = get();
    const updatedProjects = projects.map((p) =>
      p.id === projectId ? { ...p, isFavorite: !p.isFavorite } : p
    );
    set({ projects: updatedProjects });
    // Also update currentProject if it matches
    if (currentProject?.id === projectId) {
      set({
        currentProject: {
          ...currentProject,
          isFavorite: !currentProject.isFavorite,
        },
      });
    }
  },

  // View actions
  setCurrentView: (view) => set({ currentView: view }),
  toggleSidebar: () => set({ sidebarOpen: !get().sidebarOpen }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  // Theme actions
  setTheme: (theme) => {
    // Save to localStorage for fallback when server settings aren't available
    saveThemeToStorage(theme);
    set({ theme });
  },

  setProjectTheme: (projectId, theme) => {
    // Update the project's theme property
    const projects = get().projects.map((p) =>
      p.id === projectId ? { ...p, theme: theme === null ? undefined : theme } : p
    );
    set({ projects });

    // Also update currentProject if it's the same project
    const currentProject = get().currentProject;
    if (currentProject?.id === projectId) {
      const updatedTheme = theme === null ? undefined : theme;
      set({
        currentProject: {
          ...currentProject,
          theme: updatedTheme,
        },
      });
      persistEffectiveThemeForProject({ ...currentProject, theme: updatedTheme }, get().theme);
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
      title: title || `Chat ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
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
  setBoardViewMode: (mode) => set({ boardViewMode: mode }),

  // Feature Default Settings actions
  setDefaultSkipTests: (skip) => set({ defaultSkipTests: skip }),
  setEnableDependencyBlocking: (enabled) => set({ enableDependencyBlocking: enabled }),
  setSkipVerificationInAutoMode: async (enabled) => {
    set({ skipVerificationInAutoMode: enabled });
    // Sync to server settings file
    const { syncSettingsToServer } = await import('@/hooks/use-settings-migration');
    await syncSettingsToServer();
  },

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

  // Validation Model actions
  setValidationModel: (model) => set({ validationModel: model }),

  // Phase Model actions
  setPhaseModel: async (phase, entry) => {
    set((state) => ({
      phaseModels: {
        ...state.phaseModels,
        [phase]: entry,
      },
    }));
    // Sync to server settings file
    const { syncSettingsToServer } = await import('@/hooks/use-settings-migration');
    await syncSettingsToServer();
  },
  setPhaseModels: async (models) => {
    set((state) => ({
      phaseModels: {
        ...state.phaseModels,
        ...models,
      },
    }));
    // Sync to server settings file
    const { syncSettingsToServer } = await import('@/hooks/use-settings-migration');
    await syncSettingsToServer();
  },
  resetPhaseModels: async () => {
    set({ phaseModels: DEFAULT_PHASE_MODELS });
    // Sync to server settings file
    const { syncSettingsToServer } = await import('@/hooks/use-settings-migration');
    await syncSettingsToServer();
  },
  toggleFavoriteModel: (modelId) => {
    const current = get().favoriteModels;
    if (current.includes(modelId)) {
      set({ favoriteModels: current.filter((id) => id !== modelId) });
    } else {
      set({ favoriteModels: [...current, modelId] });
    }
  },

  // Cursor CLI Settings actions
  setEnabledCursorModels: (models) => set({ enabledCursorModels: models }),
  setCursorDefaultModel: (model) => set({ cursorDefaultModel: model }),
  toggleCursorModel: (model, enabled) =>
    set((state) => ({
      enabledCursorModels: enabled
        ? [...state.enabledCursorModels, model]
        : state.enabledCursorModels.filter((m) => m !== model),
    })),

  // Codex CLI Settings actions
  setEnabledCodexModels: (models) => set({ enabledCodexModels: models }),
  setCodexDefaultModel: (model) => set({ codexDefaultModel: model }),
  toggleCodexModel: (model, enabled) =>
    set((state) => ({
      enabledCodexModels: enabled
        ? [...state.enabledCodexModels, model]
        : state.enabledCodexModels.filter((m) => m !== model),
    })),
  setCodexAutoLoadAgents: async (enabled) => {
    set({ codexAutoLoadAgents: enabled });
    const { syncSettingsToServer } = await import('@/hooks/use-settings-migration');
    await syncSettingsToServer();
  },
  setCodexSandboxMode: async (mode) => {
    set({ codexSandboxMode: mode });
    const { syncSettingsToServer } = await import('@/hooks/use-settings-migration');
    await syncSettingsToServer();
  },
  setCodexApprovalPolicy: async (policy) => {
    set({ codexApprovalPolicy: policy });
    const { syncSettingsToServer } = await import('@/hooks/use-settings-migration');
    await syncSettingsToServer();
  },
  setCodexEnableWebSearch: async (enabled) => {
    set({ codexEnableWebSearch: enabled });
    const { syncSettingsToServer } = await import('@/hooks/use-settings-migration');
    await syncSettingsToServer();
  },
  setCodexEnableImages: async (enabled) => {
    set({ codexEnableImages: enabled });
    const { syncSettingsToServer } = await import('@/hooks/use-settings-migration');
    await syncSettingsToServer();
  },

  // OpenCode CLI Settings actions
  setEnabledOpencodeModels: (models) => set({ enabledOpencodeModels: models }),
  setOpencodeDefaultModel: (model) => set({ opencodeDefaultModel: model }),
  toggleOpencodeModel: (model, enabled) =>
    set((state) => ({
      enabledOpencodeModels: enabled
        ? [...state.enabledOpencodeModels, model]
        : state.enabledOpencodeModels.filter((m) => m !== model),
    })),

  // Claude Agent SDK Settings actions
  setAutoLoadClaudeMd: async (enabled) => {
    const previous = get().autoLoadClaudeMd;
    set({ autoLoadClaudeMd: enabled });
    // Sync to server settings file
    const { syncSettingsToServer } = await import('@/hooks/use-settings-migration');
    const ok = await syncSettingsToServer();
    if (!ok) {
      logger.error('Failed to sync autoLoadClaudeMd setting to server - reverting');
      set({ autoLoadClaudeMd: previous });
    }
  },
  setSkipSandboxWarning: async (skip) => {
    const previous = get().skipSandboxWarning;
    set({ skipSandboxWarning: skip });
    // Sync to server settings file
    const { syncSettingsToServer } = await import('@/hooks/use-settings-migration');
    const ok = await syncSettingsToServer();
    if (!ok) {
      logger.error('Failed to sync skipSandboxWarning setting to server - reverting');
      set({ skipSandboxWarning: previous });
    }
  },

  // Editor Configuration actions
  setDefaultEditorCommand: (command) => set({ defaultEditorCommand: command }),
  // Prompt Customization actions
  setPromptCustomization: async (customization) => {
    set({ promptCustomization: customization });
    // Sync to server settings file
    const { syncSettingsToServer } = await import('@/hooks/use-settings-migration');
    await syncSettingsToServer();
  },

  // MCP Server actions
  addMCPServer: (server) => {
    const id = `mcp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    set({ mcpServers: [...get().mcpServers, { ...server, id, enabled: true }] });
  },

  updateMCPServer: (id, updates) => {
    set({
      mcpServers: get().mcpServers.map((s) => (s.id === id ? { ...s, ...updates } : s)),
    });
  },

  removeMCPServer: (id) => {
    set({ mcpServers: get().mcpServers.filter((s) => s.id !== id) });
  },

  reorderMCPServers: (oldIndex, newIndex) => {
    const servers = [...get().mcpServers];
    const [movedServer] = servers.splice(oldIndex, 1);
    servers.splice(newIndex, 0, movedServer);
    set({ mcpServers: servers });
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
        // Preserve lastActiveProjectPath - it will be updated separately when needed
        lastActiveProjectPath: current.lastActiveProjectPath,
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

  setTerminalLastActiveProjectPath: (projectPath) => {
    const current = get().terminalState;
    set({
      terminalState: { ...current, lastActiveProjectPath: projectPath },
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
      const tabName = sourceWillBeRemoved ? sourceTab.name : `Terminal ${current.tabs.length + 1}`;
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
      newTabs = newTabs.map((t) => (t.id === sourceTabId ? { ...t, layout: newSourceLayout } : t));
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

    const newTabs = current.tabs.map((t) => (t.id === tabId ? { ...t, layout: updatedLayout } : t));

    set({
      terminalState: { ...current, tabs: newTabs },
    });
  },

  // Convert runtime layout to persisted format (preserves sessionIds for reconnection)
  saveTerminalLayout: (projectPath) => {
    const current = get().terminalState;
    if (current.tabs.length === 0) {
      // Nothing to save, clear any existing layout
      const next = { ...get().terminalLayoutByProject };
      delete next[projectPath];
      set({ terminalLayoutByProject: next });
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
    const next = { ...get().terminalLayoutByProject };
    delete next[projectPath];
    set({ terminalLayoutByProject: next });
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

  // Codex Usage Tracking actions
  setCodexUsage: (usage: CodexUsage | null) =>
    set({
      codexUsage: usage,
      codexUsageLastUpdated: usage ? Date.now() : null,
    }),

  // Codex Models actions
  fetchCodexModels: async (forceRefresh = false) => {
    const { codexModelsLastFetched, codexModelsLoading } = get();

    // Skip if already loading
    if (codexModelsLoading) return;

    // Skip if recently fetched (< 5 minutes ago) and not forcing refresh
    if (!forceRefresh && codexModelsLastFetched && Date.now() - codexModelsLastFetched < 300000) {
      return;
    }

    set({ codexModelsLoading: true, codexModelsError: null });

    try {
      const api = getElectronAPI();
      if (!api.codex) {
        throw new Error('Codex API not available');
      }

      const result = await api.codex.getModels(forceRefresh);

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch Codex models');
      }

      set({
        codexModels: result.models || [],
        codexModelsLastFetched: Date.now(),
        codexModelsLoading: false,
        codexModelsError: null,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      set({
        codexModelsError: errorMessage,
        codexModelsLoading: false,
      });
    }
  },

  setCodexModels: (models) =>
    set({
      codexModels: models,
      codexModelsLastFetched: Date.now(),
    }),

  // Pipeline actions
  setPipelineConfig: (projectPath, config) => {
    set({
      pipelineConfigByProject: {
        ...get().pipelineConfigByProject,
        [projectPath]: config,
      },
    });
  },

  getPipelineConfig: (projectPath) => {
    return get().pipelineConfigByProject[projectPath] || null;
  },

  addPipelineStep: (projectPath, step) => {
    const config = get().pipelineConfigByProject[projectPath] || { version: 1, steps: [] };
    const now = new Date().toISOString();
    const newStep: PipelineStep = {
      ...step,
      id: `step_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`,
      createdAt: now,
      updatedAt: now,
    };

    const newSteps = [...config.steps, newStep].sort((a, b) => a.order - b.order);
    newSteps.forEach((s, index) => {
      s.order = index;
    });

    set({
      pipelineConfigByProject: {
        ...get().pipelineConfigByProject,
        [projectPath]: { ...config, steps: newSteps },
      },
    });

    return newStep;
  },

  updatePipelineStep: (projectPath, stepId, updates) => {
    const config = get().pipelineConfigByProject[projectPath];
    if (!config) return;

    const stepIndex = config.steps.findIndex((s) => s.id === stepId);
    if (stepIndex === -1) return;

    const updatedSteps = [...config.steps];
    updatedSteps[stepIndex] = {
      ...updatedSteps[stepIndex],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    set({
      pipelineConfigByProject: {
        ...get().pipelineConfigByProject,
        [projectPath]: { ...config, steps: updatedSteps },
      },
    });
  },

  deletePipelineStep: (projectPath, stepId) => {
    const config = get().pipelineConfigByProject[projectPath];
    if (!config) return;

    const newSteps = config.steps.filter((s) => s.id !== stepId);
    newSteps.forEach((s, index) => {
      s.order = index;
    });

    set({
      pipelineConfigByProject: {
        ...get().pipelineConfigByProject,
        [projectPath]: { ...config, steps: newSteps },
      },
    });
  },

  reorderPipelineSteps: (projectPath, stepIds) => {
    const config = get().pipelineConfigByProject[projectPath];
    if (!config) return;

    const stepMap = new Map(config.steps.map((s) => [s.id, s]));
    const reorderedSteps = stepIds
      .map((id, index) => {
        const step = stepMap.get(id);
        if (!step) return null;
        return { ...step, order: index, updatedAt: new Date().toISOString() };
      })
      .filter((s): s is PipelineStep => s !== null);

    set({
      pipelineConfigByProject: {
        ...get().pipelineConfigByProject,
        [projectPath]: { ...config, steps: reorderedSteps },
      },
    });
  },

  // Worktree Panel Visibility actions (per-project)
  setWorktreePanelVisible: (projectPath, visible) => {
    set({
      worktreePanelVisibleByProject: {
        ...get().worktreePanelVisibleByProject,
        [projectPath]: visible,
      },
    });
  },

  getWorktreePanelVisible: (projectPath) => {
    // Default to true (visible) if not set
    return get().worktreePanelVisibleByProject[projectPath] ?? true;
  },

  // UI State actions (previously in localStorage, now synced via API)
  setWorktreePanelCollapsed: (collapsed) => set({ worktreePanelCollapsed: collapsed }),
  setLastProjectDir: (dir) => set({ lastProjectDir: dir }),
  setRecentFolders: (folders) => set({ recentFolders: folders }),
  addRecentFolder: (folder) => {
    const current = get().recentFolders;
    // Remove if already exists, then add to front
    const filtered = current.filter((f) => f !== folder);
    // Keep max 10 recent folders
    const updated = [folder, ...filtered].slice(0, 10);
    set({ recentFolders: updated });
  },

  // Reset
  reset: () => set(initialState),
}));
