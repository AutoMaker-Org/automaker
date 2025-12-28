/**
 * Settings Types - Shared types for file-based settings storage
 *
 * Defines the structure for global settings, credentials, and per-project settings
 * that are persisted to disk in JSON format. These types are used by both the server
 * (for file I/O via SettingsService) and the UI (for state management and sync).
 */

import type { AgentModel } from './model.js';

// Re-export AgentModel for convenience
export type { AgentModel };

/**
 * ThemeMode - Available color themes for the UI
 *
 * Includes system theme and multiple color schemes organized by dark/light:
 * - System: Respects OS dark/light mode preference
 * - Dark themes (16): dark, retro, dracula, nord, monokai, tokyonight, solarized,
 *   gruvbox, catppuccin, onedark, synthwave, red, sunset, gray, forest, ocean
 * - Light themes (16): light, cream, solarizedlight, github, paper, rose, mint,
 *   lavender, sand, sky, peach, snow, sepia, gruvboxlight, nordlight, blossom
 */
export type ThemeMode =
  | 'system'
  // Dark themes (16)
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
  // Light themes (16)
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
  | 'blossom';

/** KanbanCardDetailLevel - Controls how much information is displayed on kanban cards */
export type KanbanCardDetailLevel = 'minimal' | 'standard' | 'detailed';

/** PlanningMode - Planning levels for feature generation workflows */
export type PlanningMode = 'skip' | 'lite' | 'spec' | 'full';

/** ThinkingLevel - Extended thinking levels for Claude models (reasoning intensity) */
export type ThinkingLevel = 'none' | 'low' | 'medium' | 'high' | 'ultrathink';

/** ModelProvider - AI model provider for credentials and API key management */
export type ModelProvider = 'claude';

/**
 * WindowBounds - Electron window position and size for persistence
 *
 * Stored in global settings to restore window state across sessions.
 * Includes position (x, y), dimensions (width, height), and maximized state.
 */
export interface WindowBounds {
  /** Window X position on screen */
  x: number;
  /** Window Y position on screen */
  y: number;
  /** Window width in pixels */
  width: number;
  /** Window height in pixels */
  height: number;
  /** Whether window was maximized when closed */
  isMaximized: boolean;
}

/**
 * KeyboardShortcuts - User-configurable keyboard bindings for common actions
 *
 * Each property maps an action to a keyboard shortcut string
 * (e.g., "Ctrl+K", "Alt+N", "Shift+P")
 */
export interface KeyboardShortcuts {
  /** Open board view */
  board: string;
  /** Open agent panel */
  agent: string;
  /** Open feature spec editor */
  spec: string;
  /** Open context files panel */
  context: string;
  /** Open settings */
  settings: string;
  /** Open AI profiles */
  profiles: string;
  /** Open terminal */
  terminal: string;
  /** Toggle sidebar visibility */
  toggleSidebar: string;
  /** Add new feature */
  addFeature: string;
  /** Add context file */
  addContextFile: string;
  /** Start next feature generation */
  startNext: string;
  /** Create new chat session */
  newSession: string;
  /** Open project picker */
  openProject: string;
  /** Open project picker (alternate) */
  projectPicker: string;
  /** Cycle to previous project */
  cyclePrevProject: string;
  /** Cycle to next project */
  cycleNextProject: string;
  /** Add new AI profile */
  addProfile: string;
  /** Split terminal right */
  splitTerminalRight: string;
  /** Split terminal down */
  splitTerminalDown: string;
  /** Close current terminal */
  closeTerminal: string;
}

/**
 * AIProfile - Configuration for an AI model with specific parameters
 *
 * Profiles can be built-in defaults or user-created. They define which model to use,
 * thinking level, and other parameters for feature generation tasks.
 */
export interface AIProfile {
  /** Unique identifier for the profile */
  id: string;
  /** Display name for the profile */
  name: string;
  /** User-friendly description */
  description: string;
  /** Which Claude model to use (opus, sonnet, haiku) */
  model: AgentModel;
  /** Extended thinking level for reasoning-based tasks */
  thinkingLevel: ThinkingLevel;
  /** Provider (currently only "claude") */
  provider: ModelProvider;
  /** Whether this is a built-in default profile */
  isBuiltIn: boolean;
  /** Optional icon identifier or emoji */
  icon?: string;
}

/**
 * MCPToolInfo - Information about a tool provided by an MCP server
 *
 * Contains the tool's name, description, and whether it's enabled for use.
 */
export interface MCPToolInfo {
  /** Tool name as exposed by the MCP server */
  name: string;
  /** Description of what the tool does */
  description?: string;
  /** Whether this tool is enabled for use (defaults to true) */
  enabled: boolean;
}

/**
 * MCPServerConfig - Configuration for an MCP (Model Context Protocol) server
 *
 * MCP servers provide additional tools and capabilities to AI agents.
 * Supports stdio (subprocess), SSE, and HTTP transport types.
 */
export interface MCPServerConfig {
  /** Unique identifier for the server config */
  id: string;
  /** Display name for the server */
  name: string;
  /** User-friendly description of what this server provides */
  description?: string;
  /** Transport type: stdio (default), sse, or http */
  type?: 'stdio' | 'sse' | 'http';
  /** For stdio: command to execute (e.g., 'node', 'python', 'npx') */
  command?: string;
  /** For stdio: arguments to pass to the command */
  args?: string[];
  /** For stdio: environment variables to set */
  env?: Record<string, string>;
  /** For sse/http: URL endpoint */
  url?: string;
  /** For sse/http: headers to include in requests */
  headers?: Record<string, string>;
  /** Whether this server is enabled */
  enabled?: boolean;
  /** Tools discovered from this server with their enabled states */
  tools?: MCPToolInfo[];
  /** Timestamp when tools were last fetched */
  toolsLastFetched?: string;
}

/**
 * ProjectRef - Minimal reference to a project stored in global settings
 *
 * Used for the projects list and project history. Full project data is loaded separately.
 */
export interface ProjectRef {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Absolute filesystem path to project directory */
  path: string;
  /** ISO timestamp of last time project was opened */
  lastOpened?: string;
  /** Project-specific theme override (or undefined to use global) */
  theme?: string;
}

/**
 * TrashedProjectRef - Reference to a project in the trash/recycle bin
 *
 * Extends ProjectRef with deletion metadata. User can permanently delete or restore.
 */
export interface TrashedProjectRef extends ProjectRef {
  /** ISO timestamp when project was moved to trash */
  trashedAt: string;
  /** Whether project folder was deleted from disk */
  deletedFromDisk?: boolean;
}

/**
 * ChatSessionRef - Minimal reference to a chat session
 *
 * Used for session lists and history. Full session content is stored separately.
 */
export interface ChatSessionRef {
  /** Unique session identifier */
  id: string;
  /** User-given or AI-generated title */
  title: string;
  /** Project that session belongs to */
  projectId: string;
  /** ISO timestamp of creation */
  createdAt: string;
  /** ISO timestamp of last message */
  updatedAt: string;
  /** Whether session is archived */
  archived: boolean;
}

/**
 * GlobalSettings - User preferences and state stored globally in {DATA_DIR}/settings.json
 *
 * This is the main settings file that persists user preferences across sessions.
 * Includes theme, UI state, feature defaults, keyboard shortcuts, AI profiles, and projects.
 * Format: JSON with version field for migration support.
 */
export interface GlobalSettings {
  /** Version number for schema migration */
  version: number;

  // Theme Configuration
  /** Currently selected theme */
  theme: ThemeMode;

  // UI State Preferences
  /** Whether sidebar is currently open */
  sidebarOpen: boolean;
  /** Whether chat history panel is open */
  chatHistoryOpen: boolean;
  /** How much detail to show on kanban cards */
  kanbanCardDetailLevel: KanbanCardDetailLevel;

  // Feature Generation Defaults
  /** Max features to generate concurrently */
  maxConcurrency: number;
  /** Default: skip tests during feature generation */
  defaultSkipTests: boolean;
  /** Default: enable dependency blocking */
  enableDependencyBlocking: boolean;
  /** Default: use git worktrees for feature branches */
  useWorktrees: boolean;
  /** Default: only show AI profiles (hide other settings) */
  showProfilesOnly: boolean;
  /** Default: planning approach (skip/lite/spec/full) */
  defaultPlanningMode: PlanningMode;
  /** Default: require manual approval before generating */
  defaultRequirePlanApproval: boolean;
  /** ID of currently selected AI profile (null = use built-in) */
  defaultAIProfileId: string | null;

  // Audio Preferences
  /** Mute completion notification sound */
  muteDoneSound: boolean;

  // AI Model Selection
  /** Which model to use for feature name/description enhancement */
  enhancementModel: AgentModel;
  /** Which model to use for GitHub issue validation */
  validationModel: AgentModel;

  // Input Configuration
  /** User's keyboard shortcut bindings */
  keyboardShortcuts: KeyboardShortcuts;

  // AI Profiles
  /** User-created AI profiles */
  aiProfiles: AIProfile[];

  // Project Management
  /** List of active projects */
  projects: ProjectRef[];
  /** Projects in trash/recycle bin */
  trashedProjects: TrashedProjectRef[];
  /** History of recently opened project IDs */
  projectHistory: string[];
  /** Current position in project history for navigation */
  projectHistoryIndex: number;

  // File Browser and UI Preferences
  /** Last directory opened in file picker */
  lastProjectDir?: string;
  /** Recently accessed folders for quick access */
  recentFolders: string[];
  /** Whether worktree panel is collapsed in current view */
  worktreePanelCollapsed: boolean;

  // Session Tracking
  /** Maps project path -> last selected session ID in that project */
  lastSelectedSessionByProject: Record<string, string>;

  // Window State (Electron only)
  /** Persisted window bounds for restoring position/size across sessions */
  windowBounds?: WindowBounds;

  // Claude Agent SDK Settings
  /** Auto-load CLAUDE.md files using SDK's settingSources option */
  autoLoadClaudeMd?: boolean;
  /** Enable sandbox mode for bash commands (default: true, disable if issues occur) */
  enableSandboxMode?: boolean;

  // MCP Server Configuration
  /** List of configured MCP servers for agent use */
  mcpServers: MCPServerConfig[];
  /** Auto-approve MCP tool calls without permission prompts (uses bypassPermissions mode) */
  mcpAutoApproveTools?: boolean;
  /** Allow unrestricted tools when MCP servers are enabled (don't filter allowedTools) */
  mcpUnrestrictedTools?: boolean;
}

/**
 * Credentials - API keys stored in {DATA_DIR}/credentials.json
 *
 * Sensitive data stored separately from general settings.
 * Keys should never be exposed in UI or logs.
 */
export interface Credentials {
  /** Version number for schema migration */
  version: number;
  /** API keys for various providers */
  apiKeys: {
    /** Anthropic Claude API key */
    anthropic: string;
    /** Google API key (for embeddings or other services) */
    google: string;
    /** OpenAI API key (for compatibility or alternative providers) */
    openai: string;
  };
}

/**
 * BoardBackgroundSettings - Kanban board appearance customization
 *
 * Controls background images, opacity, borders, and visual effects for the board.
 */
export interface BoardBackgroundSettings {
  /** Path to background image file (null = no image) */
  imagePath: string | null;
  /** Version/timestamp of image for cache busting */
  imageVersion?: number;
  /** Opacity of cards (0-1) */
  cardOpacity: number;
  /** Opacity of columns (0-1) */
  columnOpacity: number;
  /** Show border around columns */
  columnBorderEnabled: boolean;
  /** Apply glassmorphism effect to cards */
  cardGlassmorphism: boolean;
  /** Show border around cards */
  cardBorderEnabled: boolean;
  /** Opacity of card borders (0-1) */
  cardBorderOpacity: number;
  /** Hide scrollbar in board view */
  hideScrollbar: boolean;
}

/**
 * WorktreeInfo - Information about a git worktree
 *
 * Tracks worktree location, branch, and dirty state for project management.
 */
export interface WorktreeInfo {
  /** Absolute path to worktree directory */
  path: string;
  /** Branch checked out in this worktree */
  branch: string;
  /** Whether this is the main worktree */
  isMain: boolean;
  /** Whether worktree has uncommitted changes */
  hasChanges?: boolean;
  /** Number of files with changes */
  changedFilesCount?: number;
}

/**
 * ProjectSettings - Project-specific overrides stored in {projectPath}/.automaker/settings.json
 *
 * Allows per-project customization without affecting global settings.
 * All fields are optional - missing values fall back to global settings.
 */
export interface ProjectSettings {
  /** Version number for schema migration */
  version: number;

  // Theme Configuration (project-specific override)
  /** Project theme (undefined = use global setting) */
  theme?: ThemeMode;

  // Worktree Management
  /** Project-specific worktree preference override */
  useWorktrees?: boolean;
  /** Current worktree being used in this project */
  currentWorktree?: { path: string | null; branch: string };
  /** List of worktrees available in this project */
  worktrees?: WorktreeInfo[];

  // Board Customization
  /** Project-specific board background settings */
  boardBackground?: BoardBackgroundSettings;

  // Session Tracking
  /** Last chat session selected in this project */
  lastSelectedSessionId?: string;

  // Claude Agent SDK Settings
  /** Auto-load CLAUDE.md files using SDK's settingSources option (project override) */
  autoLoadClaudeMd?: boolean;
}

/**
 * Default values and constants
 */

/** Default keyboard shortcut bindings */
export const DEFAULT_KEYBOARD_SHORTCUTS: KeyboardShortcuts = {
  board: 'K',
  agent: 'A',
  spec: 'D',
  context: 'C',
  settings: 'S',
  profiles: 'M',
  terminal: 'T',
  toggleSidebar: '`',
  addFeature: 'N',
  addContextFile: 'N',
  startNext: 'G',
  newSession: 'N',
  openProject: 'O',
  projectPicker: 'P',
  cyclePrevProject: 'Q',
  cycleNextProject: 'E',
  addProfile: 'N',
  splitTerminalRight: 'Alt+D',
  splitTerminalDown: 'Alt+S',
  closeTerminal: 'Alt+W',
};

/** Default global settings used when no settings file exists */
export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  version: 1,
  theme: 'dark',
  sidebarOpen: true,
  chatHistoryOpen: false,
  kanbanCardDetailLevel: 'standard',
  maxConcurrency: 3,
  defaultSkipTests: true,
  enableDependencyBlocking: true,
  useWorktrees: false,
  showProfilesOnly: false,
  defaultPlanningMode: 'skip',
  defaultRequirePlanApproval: false,
  defaultAIProfileId: null,
  muteDoneSound: false,
  enhancementModel: 'sonnet',
  validationModel: 'opus',
  keyboardShortcuts: DEFAULT_KEYBOARD_SHORTCUTS,
  aiProfiles: [],
  projects: [],
  trashedProjects: [],
  projectHistory: [],
  projectHistoryIndex: -1,
  lastProjectDir: undefined,
  recentFolders: [],
  worktreePanelCollapsed: false,
  lastSelectedSessionByProject: {},
  autoLoadClaudeMd: false,
  enableSandboxMode: true,
  mcpServers: [],
  mcpAutoApproveTools: true,
  mcpUnrestrictedTools: true,
};

/** Default credentials (empty strings - user must provide API keys) */
export const DEFAULT_CREDENTIALS: Credentials = {
  version: 1,
  apiKeys: {
    anthropic: '',
    google: '',
    openai: '',
  },
};

/** Default project settings (empty - all settings are optional and fall back to global) */
export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  version: 1,
};

/** Current version of the global settings schema */
export const SETTINGS_VERSION = 1;
/** Current version of the credentials schema */
export const CREDENTIALS_VERSION = 1;
/** Current version of the project settings schema */
export const PROJECT_SETTINGS_VERSION = 1;
