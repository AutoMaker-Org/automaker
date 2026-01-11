/**
 * Settings Types - Shared types for file-based settings storage
 *
 * Defines the structure for global settings, credentials, and per-project settings
 * that are persisted to disk in JSON format. These types are used by both the server
 * (for file I/O via SettingsService) and the UI (for state management and sync).
 */

import type { ModelAlias, AgentModel, CodexModelId } from './model.js';
import type { CursorModelId } from './cursor-models.js';
import { CURSOR_MODEL_MAP, getAllCursorModelIds } from './cursor-models.js';
import type { OpencodeModelId } from './opencode-models.js';
import { getAllOpencodeModelIds, DEFAULT_OPENCODE_MODEL } from './opencode-models.js';
import type { PromptCustomization } from './prompts.js';
import type { CodexSandboxMode, CodexApprovalPolicy } from './codex.js';
import type { ReasoningEffort } from './provider.js';

// Re-export ModelAlias for convenience
export type { ModelAlias };

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

/** PlanningMode - Planning levels for feature generation workflows */
export type PlanningMode = 'skip' | 'lite' | 'spec' | 'full';

/** ThinkingLevel - Extended thinking levels for Claude models (reasoning intensity) */
export type ThinkingLevel = 'none' | 'low' | 'medium' | 'high' | 'ultrathink';

/**
 * Thinking token budget mapping based on Claude SDK documentation.
 * @see https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking
 *
 * - Minimum budget: 1,024 tokens
 * - Complex tasks starting point: 16,000+ tokens
 * - Above 32,000: Risk of timeouts (batch processing recommended)
 */
export const THINKING_TOKEN_BUDGET: Record<ThinkingLevel, number | undefined> = {
  none: undefined, // Thinking disabled
  low: 1024, // Minimum per docs
  medium: 10000, // Light reasoning
  high: 16000, // Complex tasks (recommended starting point)
  ultrathink: 32000, // Maximum safe (above this risks timeouts)
};

/**
 * Convert thinking level to SDK maxThinkingTokens value
 */
export function getThinkingTokenBudget(level: ThinkingLevel | undefined): number | undefined {
  if (!level || level === 'none') return undefined;
  return THINKING_TOKEN_BUDGET[level];
}

/** ModelProvider - AI model provider for credentials and API key management */
export type ModelProvider = 'claude' | 'cursor' | 'codex' | 'opencode';

const DEFAULT_CODEX_AUTO_LOAD_AGENTS = false;
const DEFAULT_CODEX_SANDBOX_MODE: CodexSandboxMode = 'workspace-write';
const DEFAULT_CODEX_APPROVAL_POLICY: CodexApprovalPolicy = 'on-request';
const DEFAULT_CODEX_ENABLE_WEB_SEARCH = false;
const DEFAULT_CODEX_ENABLE_IMAGES = true;
const DEFAULT_CODEX_ADDITIONAL_DIRS: string[] = [];

/**
 * PhaseModelEntry - Configuration for a single phase model
 *
 * Encapsulates the model selection and optional reasoning/thinking capabilities:
 * - Claude models: Use thinkingLevel for extended thinking
 * - Codex models: Use reasoningEffort for reasoning intensity
 * - Cursor models: Handle thinking internally
 */
export interface PhaseModelEntry {
  /** The model to use (Claude alias, Cursor model ID, or Codex model ID) */
  model: ModelAlias | CursorModelId | CodexModelId;
  /** Extended thinking level (only applies to Claude models, defaults to 'none') */
  thinkingLevel?: ThinkingLevel;
  /** Reasoning effort level (only applies to Codex models, defaults to 'none') */
  reasoningEffort?: ReasoningEffort;
}

/**
 * PhaseModelConfig - Configuration for AI models used in different application phases
 *
 * Allows users to choose which model (Claude or Cursor) to use for each distinct
 * operation in the application. This provides fine-grained control over cost,
 * speed, and quality tradeoffs.
 */
export interface PhaseModelConfig {
  // Quick tasks - recommend fast/cheap models (Haiku, Cursor auto)
  /** Model for enhancing feature names and descriptions */
  enhancementModel: PhaseModelEntry;
  /** Model for generating file context descriptions */
  fileDescriptionModel: PhaseModelEntry;
  /** Model for analyzing and describing context images */
  imageDescriptionModel: PhaseModelEntry;

  // Validation tasks - recommend smart models (Sonnet, Opus)
  /** Model for validating and improving GitHub issues */
  validationModel: PhaseModelEntry;

  // Generation tasks - recommend powerful models (Opus, Sonnet)
  /** Model for generating full application specifications */
  specGenerationModel: PhaseModelEntry;
  /** Model for creating features from specifications */
  featureGenerationModel: PhaseModelEntry;
  /** Model for reorganizing and prioritizing backlog */
  backlogPlanningModel: PhaseModelEntry;
  /** Model for analyzing project structure */
  projectAnalysisModel: PhaseModelEntry;
  /** Model for AI suggestions (feature, refactoring, security, performance) */
  suggestionsModel: PhaseModelEntry;

  // Memory tasks - for learning extraction and memory operations
  /** Model for extracting learnings from completed agent sessions */
  memoryExtractionModel: PhaseModelEntry;
}

/** Keys of PhaseModelConfig for type-safe access */
export type PhaseModelKey = keyof PhaseModelConfig;

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
  /** Split terminal right */
  splitTerminalRight: string;
  /** Split terminal down */
  splitTerminalDown: string;
  /** Close current terminal */
  closeTerminal: string;
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
  /** JSON Schema for the tool's input parameters */
  inputSchema?: Record<string, unknown>;
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
  /** Whether project is pinned to favorites on dashboard */
  isFavorite?: boolean;
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
 * Includes theme, UI state, feature defaults, keyboard shortcuts, and projects.
 * Format: JSON with version field for migration support.
 */
export interface GlobalSettings {
  /** Version number for schema migration */
  version: number;

  // Migration Tracking
  /** Whether localStorage settings have been migrated to API storage (prevents re-migration) */
  localStorageMigrated?: boolean;

  // Onboarding / Setup Wizard
  /** Whether the initial setup wizard has been completed */
  setupComplete: boolean;
  /** Whether this is the first run experience (used by UI onboarding) */
  isFirstRun: boolean;
  /** Whether Claude setup was skipped during onboarding */
  skipClaudeSetup: boolean;

  // Theme Configuration
  /** Currently selected theme */
  theme: ThemeMode;

  // UI State Preferences
  /** Whether sidebar is currently open */
  sidebarOpen: boolean;
  /** Whether chat history panel is open */
  chatHistoryOpen: boolean;

  // Feature Generation Defaults
  /** Max features to generate concurrently */
  maxConcurrency: number;
  /** Default: skip tests during feature generation */
  defaultSkipTests: boolean;
  /** Default: enable dependency blocking */
  enableDependencyBlocking: boolean;
  /** Skip verification requirement in auto-mode (treat 'completed' same as 'verified') */
  skipVerificationInAutoMode: boolean;
  /** Default: use git worktrees for feature branches */
  useWorktrees: boolean;
  /** Default: planning approach (skip/lite/spec/full) */
  defaultPlanningMode: PlanningMode;
  /** Default: require manual approval before generating */
  defaultRequirePlanApproval: boolean;

  // Audio Preferences
  /** Mute completion notification sound */
  muteDoneSound: boolean;

  // AI Model Selection (per-phase configuration)
  /** Phase-specific AI model configuration */
  phaseModels: PhaseModelConfig;

  // Legacy AI Model Selection (deprecated - use phaseModels instead)
  /** @deprecated Use phaseModels.enhancementModel instead */
  enhancementModel: ModelAlias;
  /** @deprecated Use phaseModels.validationModel instead */
  validationModel: ModelAlias;

  // Cursor CLI Settings (global)
  /** Which Cursor models are available in feature modal (empty = all) */
  enabledCursorModels: CursorModelId[];
  /** Default Cursor model selection when switching to Cursor CLI */
  cursorDefaultModel: CursorModelId;

  // OpenCode CLI Settings (global)
  /** Which OpenCode models are available in feature modal (empty = all) */
  enabledOpencodeModels?: OpencodeModelId[];
  /** Default OpenCode model selection when switching to OpenCode CLI */
  opencodeDefaultModel?: OpencodeModelId;

  // Input Configuration
  /** User's keyboard shortcut bindings */
  keyboardShortcuts: KeyboardShortcuts;

  // Project Management
  /** List of active projects */
  projects: ProjectRef[];
  /** Projects in trash/recycle bin */
  trashedProjects: TrashedProjectRef[];
  /** ID of the currently open project (null if none) */
  currentProjectId: string | null;
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
  /** Skip the sandbox environment warning dialog on startup */
  skipSandboxWarning?: boolean;

  // Codex CLI Settings
  /** Auto-load .codex/AGENTS.md instructions into Codex prompts */
  codexAutoLoadAgents?: boolean;
  /** Sandbox mode for Codex CLI command execution */
  codexSandboxMode?: CodexSandboxMode;
  /** Approval policy for Codex CLI tool execution */
  codexApprovalPolicy?: CodexApprovalPolicy;
  /** Enable web search capability for Codex CLI (--search flag) */
  codexEnableWebSearch?: boolean;
  /** Enable image attachment support for Codex CLI (-i flag) */
  codexEnableImages?: boolean;
  /** Additional directories with write access (--add-dir flags) */
  codexAdditionalDirs?: string[];
  /** Last thread ID for session resumption */
  codexThreadId?: string;

  // MCP Server Configuration
  /** List of configured MCP servers for agent use */
  mcpServers: MCPServerConfig[];

  // Editor Configuration
  /** Default editor command for "Open In" action (null = auto-detect: Cursor > VS Code > first available) */
  defaultEditorCommand: string | null;

  // Prompt Customization
  /** Custom prompts for Auto Mode, Agent Runner, Backlog Planning, and Enhancements */
  promptCustomization?: PromptCustomization;

  // Skills Configuration
  /**
   * Enable Skills functionality (loads from .claude/skills/ directories)
   * @default true
   */
  enableSkills?: boolean;

  /**
   * Which directories to load Skills from
   * - 'user': ~/.claude/skills/ (personal skills)
   * - 'project': .claude/skills/ (project-specific skills)
   * @default ['user', 'project']
   */
  skillsSources?: Array<'user' | 'project'>;

  // Subagents Configuration
  /**
   * Enable Custom Subagents functionality (loads from .claude/agents/ directories)
   * @default true
   */
  enableSubagents?: boolean;

  /**
   * Which directories to load Subagents from
   * - 'user': ~/.claude/agents/ (personal agents)
   * - 'project': .claude/agents/ (project-specific agents)
   * @default ['user', 'project']
   */
  subagentsSources?: Array<'user' | 'project'>;

  /**
   * Custom subagent definitions for specialized task delegation (programmatic)
   * Key: agent name (e.g., 'code-reviewer', 'test-runner')
   * Value: agent configuration
   */
  customSubagents?: Record<string, import('./provider.js').AgentDefinition>;
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

  // UI Visibility
  /** Whether the worktree panel row is visible (default: true) */
  worktreePanelVisible?: boolean;

  // Session Tracking
  /** Last chat session selected in this project */
  lastSelectedSessionId?: string;

  // Claude Agent SDK Settings
  /** Auto-load CLAUDE.md files using SDK's settingSources option (project override) */
  autoLoadClaudeMd?: boolean;

  // Subagents Configuration
  /**
   * Project-specific custom subagent definitions for specialized task delegation
   * Merged with global customSubagents, project-level takes precedence
   * Key: agent name (e.g., 'code-reviewer', 'test-runner')
   * Value: agent configuration
   */
  customSubagents?: Record<string, import('./provider.js').AgentDefinition>;
}

/**
 * Default values and constants
 */

/** Default phase model configuration - sensible defaults for each task type */
export const DEFAULT_PHASE_MODELS: PhaseModelConfig = {
  // Quick tasks - use fast models for speed and cost
  enhancementModel: { model: 'sonnet' },
  fileDescriptionModel: { model: 'haiku' },
  imageDescriptionModel: { model: 'haiku' },

  // Validation - use smart models for accuracy
  validationModel: { model: 'sonnet' },

  // Generation - use powerful models for quality
  specGenerationModel: { model: 'opus' },
  featureGenerationModel: { model: 'sonnet' },
  backlogPlanningModel: { model: 'sonnet' },
  projectAnalysisModel: { model: 'sonnet' },
  suggestionsModel: { model: 'sonnet' },

  // Memory - use fast model for learning extraction (cost-effective)
  memoryExtractionModel: { model: 'haiku' },
};

/** Current version of the global settings schema */
export const SETTINGS_VERSION = 4;
/** Current version of the credentials schema */
export const CREDENTIALS_VERSION = 1;
/** Current version of the project settings schema */
export const PROJECT_SETTINGS_VERSION = 1;

/** Default keyboard shortcut bindings */
export const DEFAULT_KEYBOARD_SHORTCUTS: KeyboardShortcuts = {
  board: 'K',
  agent: 'A',
  spec: 'D',
  context: 'C',
  settings: 'S',
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
  splitTerminalRight: 'Alt+D',
  splitTerminalDown: 'Alt+S',
  closeTerminal: 'Alt+W',
};

/** Default global settings used when no settings file exists */
export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  version: SETTINGS_VERSION,
  setupComplete: false,
  isFirstRun: true,
  skipClaudeSetup: false,
  theme: 'dark',
  sidebarOpen: true,
  chatHistoryOpen: false,
  maxConcurrency: 3,
  defaultSkipTests: true,
  enableDependencyBlocking: true,
  skipVerificationInAutoMode: false,
  useWorktrees: true,
  defaultPlanningMode: 'skip',
  defaultRequirePlanApproval: false,
  muteDoneSound: false,
  phaseModels: DEFAULT_PHASE_MODELS,
  enhancementModel: 'sonnet',
  validationModel: 'opus',
  enabledCursorModels: getAllCursorModelIds(),
  cursorDefaultModel: 'auto',
  enabledOpencodeModels: getAllOpencodeModelIds(),
  opencodeDefaultModel: DEFAULT_OPENCODE_MODEL,
  keyboardShortcuts: DEFAULT_KEYBOARD_SHORTCUTS,
  projects: [],
  trashedProjects: [],
  currentProjectId: null,
  projectHistory: [],
  projectHistoryIndex: -1,
  lastProjectDir: undefined,
  recentFolders: [],
  worktreePanelCollapsed: false,
  lastSelectedSessionByProject: {},
  autoLoadClaudeMd: false,
  skipSandboxWarning: false,
  codexAutoLoadAgents: DEFAULT_CODEX_AUTO_LOAD_AGENTS,
  codexSandboxMode: DEFAULT_CODEX_SANDBOX_MODE,
  codexApprovalPolicy: DEFAULT_CODEX_APPROVAL_POLICY,
  codexEnableWebSearch: DEFAULT_CODEX_ENABLE_WEB_SEARCH,
  codexEnableImages: DEFAULT_CODEX_ENABLE_IMAGES,
  codexAdditionalDirs: DEFAULT_CODEX_ADDITIONAL_DIRS,
  codexThreadId: undefined,
  mcpServers: [],
  defaultEditorCommand: null,
  enableSkills: true,
  skillsSources: ['user', 'project'],
  enableSubagents: true,
  subagentsSources: ['user', 'project'],
};

/** Default credentials (empty strings - user must provide API keys) */
export const DEFAULT_CREDENTIALS: Credentials = {
  version: CREDENTIALS_VERSION,
  apiKeys: {
    anthropic: '',
    google: '',
    openai: '',
  },
};

/** Default project settings (empty - all settings are optional and fall back to global) */
export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  version: PROJECT_SETTINGS_VERSION,
};
