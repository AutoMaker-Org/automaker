import type { Project, TrashedProject } from '@/lib/electron';
import type {
  ModelAlias,
  PlanningMode,
  ModelProvider,
  CursorModelId,
  CodexModelId,
  OpencodeModelId,
  GeminiModelId,
  CopilotModelId,
  PhaseModelConfig,
  PhaseModelKey,
  PhaseModelEntry,
  MCPServerConfig,
  PipelineConfig,
  PipelineStep,
  PromptCustomization,
  ModelDefinition,
  ServerLogLevel,
  EventHook,
  ClaudeApiProfile,
  ClaudeCompatibleProvider,
  SidebarStyle,
  ThinkingLevel,
  ReasoningEffort,
} from '@automaker/types';

import type {
  ViewMode,
  ThemeMode,
  BoardViewMode,
  KeyboardShortcuts,
  BackgroundSettings,
} from './ui-types';
import type { ApiKeys } from './settings-types';
import type { ChatMessage, ChatSession } from './chat-types';
import type { TerminalState, TerminalPanelContent, PersistedTerminalState } from './terminal-types';
import type { Feature, ProjectAnalysis } from './project-types';
import type { ClaudeUsage, CodexUsage, ZaiUsage, GeminiUsage } from './usage-types';

/** State for worktree init script execution */
export interface InitScriptState {
  status: 'idle' | 'running' | 'success' | 'failed';
  branch: string;
  output: string[];
  error?: string;
}

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
  sidebarStyle: SidebarStyle; // 'unified' (modern) or 'discord' (classic two-sidebar layout)
  collapsedNavSections: Record<string, boolean>; // Collapsed state of nav sections (key: section label)
  mobileSidebarHidden: boolean; // Completely hides sidebar on mobile

  // Agent Session state (per-project, keyed by project path)
  lastSelectedSessionByProject: Record<string, string>; // projectPath -> sessionId

  // Theme
  theme: ThemeMode;

  // Fonts (global defaults)
  fontFamilySans: string | null; // null = use default Geist Sans
  fontFamilyMono: string | null; // null = use default Geist Mono

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

  // Auto Mode (per-worktree state, keyed by "${projectId}::${branchName ?? '__main__'}")
  autoModeByWorktree: Record<
    string,
    {
      isRunning: boolean;
      runningTasks: string[]; // Feature IDs being worked on
      branchName: string | null; // null = main worktree
      maxConcurrency?: number; // Maximum concurrent features for this worktree (defaults to 3)
    }
  >;
  autoModeActivityLog: AutoModeActivity[];
  maxConcurrency: number; // Legacy: Maximum number of concurrent agent tasks (deprecated, use per-worktree maxConcurrency)

  // Kanban Card Display Settings
  boardViewMode: BoardViewMode; // Whether to show kanban or dependency graph view

  // Feature Default Settings
  defaultSkipTests: boolean; // Default value for skip tests when creating new features
  enableDependencyBlocking: boolean; // When true, show blocked badges and warnings for features with incomplete dependencies (default: true)
  skipVerificationInAutoMode: boolean; // When true, auto-mode grabs features even if dependencies are not verified (only checks they're not running)
  enableAiCommitMessages: boolean; // When true, auto-generate commit messages using AI when opening commit dialog
  mergePostAction: 'commit' | 'manual' | null; // User's preferred action after a clean merge (null = ask every time)
  planUseSelectedWorktreeBranch: boolean; // When true, Plan dialog creates features on the currently selected worktree branch
  addFeatureUseSelectedWorktreeBranch: boolean; // When true, Add Feature dialog defaults to custom mode with selected worktree branch

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
      isCurrent: boolean;
      hasWorktree: boolean;
      hasChanges?: boolean;
      changedFilesCount?: number;
    }>
  >;

  // Keyboard Shortcuts
  keyboardShortcuts: KeyboardShortcuts; // User-defined keyboard shortcuts

  // Audio Settings
  muteDoneSound: boolean; // When true, mute the notification sound when agents complete (default: false)

  // Splash Screen Settings
  disableSplashScreen: boolean; // When true, skip showing the splash screen overlay on startup

  // Server Log Level Settings
  serverLogLevel: ServerLogLevel; // Log level for the API server (error, warn, info, debug)
  enableRequestLogging: boolean; // Enable HTTP request logging (Morgan)

  // Developer Tools Settings
  showQueryDevtools: boolean; // Show React Query DevTools panel (only in development mode)

  // Enhancement Model Settings
  enhancementModel: ModelAlias; // Model used for feature enhancement (default: sonnet)

  // Validation Model Settings
  validationModel: ModelAlias; // Model used for GitHub issue validation (default: opus)

  // Phase Model Settings - per-phase AI model configuration
  phaseModels: PhaseModelConfig;
  favoriteModels: string[];

  // Default thinking/reasoning levels for two-stage model selector primary button
  defaultThinkingLevel: ThinkingLevel;
  defaultReasoningEffort: ReasoningEffort;

  // Default max turns for agent execution (1-2000)
  defaultMaxTurns: number;

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
  codexAdditionalDirs: string[]; // Additional directories with write access (--add-dir flags)
  codexThreadId: string | undefined; // Last thread ID for session resumption

  // OpenCode CLI Settings (global)
  // Static OpenCode settings are persisted via SETTINGS_FIELDS_TO_SYNC
  enabledOpencodeModels: OpencodeModelId[]; // Which static OpenCode models are available
  opencodeDefaultModel: OpencodeModelId; // Default OpenCode model selection
  // Dynamic models are session-only (not persisted) because they're discovered at runtime
  // from `opencode models` CLI and depend on current provider authentication state
  dynamicOpencodeModels: ModelDefinition[]; // Dynamically discovered models from OpenCode CLI
  enabledDynamicModelIds: string[]; // Which dynamic models are enabled
  cachedOpencodeProviders: Array<{
    id: string;
    name: string;
    authenticated: boolean;
    authMethod?: string;
  }>; // Cached providers
  opencodeModelsLoading: boolean; // Whether OpenCode models are being fetched
  opencodeModelsError: string | null; // Error message if fetch failed
  opencodeModelsLastFetched: number | null; // Timestamp of last successful fetch
  opencodeModelsLastFailedAt: number | null; // Timestamp of last failed fetch

  // Gemini CLI Settings (global)
  enabledGeminiModels: GeminiModelId[]; // Which Gemini models are available in feature modal
  geminiDefaultModel: GeminiModelId; // Default Gemini model selection

  // Copilot SDK Settings (global)
  enabledCopilotModels: CopilotModelId[]; // Which Copilot models are available in feature modal
  copilotDefaultModel: CopilotModelId; // Default Copilot model selection

  // Provider Visibility Settings
  disabledProviders: ModelProvider[]; // Providers that are disabled and hidden from dropdowns

  // Claude Agent SDK Settings
  autoLoadClaudeMd: boolean; // Auto-load CLAUDE.md files using SDK's settingSources option
  skipSandboxWarning: boolean; // Skip the sandbox environment warning dialog on startup

  // MCP Servers
  mcpServers: MCPServerConfig[]; // List of configured MCP servers for agent use

  // Editor Configuration
  defaultEditorCommand: string | null; // Default editor for "Open In" action

  // File Editor Settings
  editorFontSize: number; // Font size for file editor (default: 13)
  editorFontFamily: string; // Font family for file editor (default: 'default' = use theme mono font)
  editorAutoSave: boolean; // Enable auto-save for file editor (default: false)
  editorAutoSaveDelay: number; // Auto-save delay in milliseconds (default: 1000)

  // Terminal Configuration
  defaultTerminalId: string | null; // Default external terminal for "Open In Terminal" action (null = integrated)

  // Skills Configuration
  enableSkills: boolean; // Enable Skills functionality (loads from .claude/skills/ directories)
  skillsSources: Array<'user' | 'project'>; // Which directories to load Skills from

  // Subagents Configuration
  enableSubagents: boolean; // Enable Custom Subagents functionality (loads from .claude/agents/ directories)
  subagentsSources: Array<'user' | 'project'>; // Which directories to load Subagents from

  // Prompt Customization
  promptCustomization: PromptCustomization; // Custom prompts for Auto Mode, Agent, Backlog Plan, Enhancement

  // Event Hooks
  eventHooks: EventHook[]; // Event hooks for custom commands or webhooks

  // Claude-Compatible Providers (new system)
  claudeCompatibleProviders: ClaudeCompatibleProvider[]; // Providers that expose models to dropdowns

  // Claude API Profiles (deprecated - kept for backward compatibility)
  claudeApiProfiles: ClaudeApiProfile[]; // Claude-compatible API endpoint profiles
  activeClaudeApiProfileId: string | null; // Active profile ID (null = use direct Anthropic API)

  // Project Analysis
  projectAnalysis: ProjectAnalysis | null;
  isAnalyzing: boolean;

  // Board Background Settings (per-project, keyed by project path)
  boardBackgroundByProject: Record<string, BackgroundSettings>;

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
  defaultFeatureModel: PhaseModelEntry;

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

  // z.ai Usage Tracking
  zaiUsage: ZaiUsage | null;
  zaiUsageLastUpdated: number | null;

  // Gemini Usage Tracking
  geminiUsage: GeminiUsage | null;
  geminiUsageLastUpdated: number | null;

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
  codexModelsLastFailedAt: number | null;

  // Pipeline Configuration (per-project, keyed by project path)
  pipelineConfigByProject: Record<string, PipelineConfig>;

  // Worktree Panel Visibility (per-project, keyed by project path)
  // Whether the worktree panel row is visible (default: true)
  worktreePanelVisibleByProject: Record<string, boolean>;

  // Init Script Indicator Visibility (per-project, keyed by project path)
  // Whether to show the floating init script indicator panel (default: true)
  showInitScriptIndicatorByProject: Record<string, boolean>;

  // Default Delete Branch With Worktree (per-project, keyed by project path)
  // Whether to default the "delete branch" checkbox when deleting a worktree (default: false)
  defaultDeleteBranchByProject: Record<string, boolean>;

  // Auto-dismiss Init Script Indicator (per-project, keyed by project path)
  // Whether to auto-dismiss the indicator after completion (default: true)
  autoDismissInitScriptIndicatorByProject: Record<string, boolean>;

  // Use Worktrees Override (per-project, keyed by project path)
  // undefined = use global setting, true/false = project-specific override
  useWorktreesByProject: Record<string, boolean | undefined>;

  // Worktree Copy Files (per-project, keyed by project path)
  // List of relative file paths to copy from project root into new worktrees
  worktreeCopyFilesByProject: Record<string, string[]>;

  // UI State (previously in localStorage, now synced via API)
  /** Whether worktree panel is collapsed in board view */
  worktreePanelCollapsed: boolean;
  /** Last directory opened in file picker */
  lastProjectDir: string;
  /** Recently accessed folders for quick access */
  recentFolders: string[];

  // Init Script State (keyed by "projectPath::branch" to support concurrent scripts)
  initScriptState: Record<string, InitScriptState>;
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
  setProjectIcon: (projectId: string, icon: string | null) => void; // Set project icon (null to clear)
  setProjectCustomIcon: (projectId: string, customIconPath: string | null) => void; // Set custom project icon image path (null to clear)
  setProjectName: (projectId: string, name: string) => void; // Update project name

  // View actions
  setCurrentView: (view: ViewMode) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarStyle: (style: SidebarStyle) => void;
  setCollapsedNavSections: (sections: Record<string, boolean>) => void;
  toggleNavSection: (sectionLabel: string) => void;
  toggleMobileSidebarHidden: () => void;
  setMobileSidebarHidden: (hidden: boolean) => void;

  // Theme actions
  setTheme: (theme: ThemeMode) => void;
  setProjectTheme: (projectId: string, theme: ThemeMode | null) => void; // Set per-project theme (null to clear)
  getEffectiveTheme: () => ThemeMode; // Get the effective theme (project, global, or preview if set)
  setPreviewTheme: (theme: ThemeMode | null) => void; // Set preview theme for hover preview (null to clear)

  // Font actions (global + per-project override)
  setFontSans: (fontFamily: string | null) => void; // Set global UI/sans font (null to clear)
  setFontMono: (fontFamily: string | null) => void; // Set global code/mono font (null to clear)
  setProjectFontSans: (projectId: string, fontFamily: string | null) => void; // Set per-project UI/sans font override (null = use global)
  setProjectFontMono: (projectId: string, fontFamily: string | null) => void; // Set per-project code/mono font override (null = use global)
  getEffectiveFontSans: () => string | null; // Get effective UI font (project override -> global -> null for default)
  getEffectiveFontMono: () => string | null; // Get effective code font (project override -> global -> null for default)

  // Claude API Profile actions (per-project override)
  /** @deprecated Use setProjectPhaseModelOverride instead */
  setProjectClaudeApiProfile: (projectId: string, profileId: string | null | undefined) => void; // Set per-project Claude API profile (undefined = use global, null = direct API, string = specific profile)

  // Project Phase Model Overrides
  setProjectPhaseModelOverride: (
    projectId: string,
    phase: PhaseModelKey,
    entry: PhaseModelEntry | null // null = use global
  ) => void;
  clearAllProjectPhaseModelOverrides: (projectId: string) => void;

  // Project Default Feature Model Override
  setProjectDefaultFeatureModel: (
    projectId: string,
    entry: PhaseModelEntry | null // null = use global
  ) => void;

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

  // Auto Mode actions (per-worktree)
  setAutoModeRunning: (
    projectId: string,
    branchName: string | null,
    running: boolean,
    maxConcurrency?: number,
    runningTasks?: string[]
  ) => void;
  addRunningTask: (projectId: string, branchName: string | null, taskId: string) => void;
  removeRunningTask: (projectId: string, branchName: string | null, taskId: string) => void;
  clearRunningTasks: (projectId: string, branchName: string | null) => void;
  getAutoModeState: (
    projectId: string,
    branchName: string | null
  ) => {
    isRunning: boolean;
    runningTasks: string[];
    branchName: string | null;
    maxConcurrency?: number;
  };
  /** Helper to generate worktree key from projectId and branchName */
  getWorktreeKey: (projectId: string, branchName: string | null) => string;
  addAutoModeActivity: (activity: Omit<AutoModeActivity, 'id' | 'timestamp'>) => void;
  clearAutoModeActivity: () => void;
  setMaxConcurrency: (max: number) => void; // Legacy: kept for backward compatibility
  getMaxConcurrencyForWorktree: (projectId: string, branchName: string | null) => number;
  setMaxConcurrencyForWorktree: (
    projectId: string,
    branchName: string | null,
    maxConcurrency: number
  ) => void;

  // Kanban Card Settings actions
  setBoardViewMode: (mode: BoardViewMode) => void;

  // Feature Default Settings actions
  setDefaultSkipTests: (skip: boolean) => void;
  setEnableDependencyBlocking: (enabled: boolean) => void;
  setSkipVerificationInAutoMode: (enabled: boolean) => Promise<void>;
  setEnableAiCommitMessages: (enabled: boolean) => Promise<void>;
  setMergePostAction: (action: 'commit' | 'manual' | null) => Promise<void>;
  setPlanUseSelectedWorktreeBranch: (enabled: boolean) => Promise<void>;
  setAddFeatureUseSelectedWorktreeBranch: (enabled: boolean) => Promise<void>;

  // Worktree Settings actions
  setUseWorktrees: (enabled: boolean) => void;
  setCurrentWorktree: (projectPath: string, worktreePath: string | null, branch: string) => void;
  setWorktrees: (
    projectPath: string,
    worktrees: Array<{
      path: string;
      branch: string;
      isMain: boolean;
      isCurrent: boolean;
      hasWorktree: boolean;
      hasChanges?: boolean;
      changedFilesCount?: number;
    }>
  ) => void;
  getCurrentWorktree: (projectPath: string) => { path: string | null; branch: string } | null;
  getWorktrees: (projectPath: string) => Array<{
    path: string;
    branch: string;
    isMain: boolean;
    isCurrent: boolean;
    hasWorktree: boolean;
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

  // Splash Screen actions
  setDisableSplashScreen: (disabled: boolean) => void;

  // Server Log Level actions
  setServerLogLevel: (level: ServerLogLevel) => void;
  setEnableRequestLogging: (enabled: boolean) => void;

  // Developer Tools actions
  setShowQueryDevtools: (show: boolean) => void;

  // Enhancement Model actions
  setEnhancementModel: (model: ModelAlias) => void;

  // Validation Model actions
  setValidationModel: (model: ModelAlias) => void;

  // Phase Model actions
  setPhaseModel: (phase: PhaseModelKey, entry: PhaseModelEntry) => Promise<void>;
  setPhaseModels: (models: Partial<PhaseModelConfig>) => Promise<void>;
  resetPhaseModels: () => Promise<void>;
  toggleFavoriteModel: (modelId: string) => void;
  setDefaultThinkingLevel: (level: ThinkingLevel) => void;
  setDefaultReasoningEffort: (effort: ReasoningEffort) => void;
  setDefaultMaxTurns: (maxTurns: number) => void;

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
  setDynamicOpencodeModels: (models: ModelDefinition[]) => void;
  setEnabledDynamicModelIds: (ids: string[]) => void;
  toggleDynamicModel: (modelId: string, enabled: boolean) => void;
  setCachedOpencodeProviders: (
    providers: Array<{ id: string; name: string; authenticated: boolean; authMethod?: string }>
  ) => void;

  // Gemini CLI Settings actions
  setEnabledGeminiModels: (models: GeminiModelId[]) => void;
  setGeminiDefaultModel: (model: GeminiModelId) => void;
  toggleGeminiModel: (model: GeminiModelId, enabled: boolean) => void;

  // Copilot SDK Settings actions
  setEnabledCopilotModels: (models: CopilotModelId[]) => void;
  setCopilotDefaultModel: (model: CopilotModelId) => void;
  toggleCopilotModel: (model: CopilotModelId, enabled: boolean) => void;

  // Provider Visibility Settings actions
  setDisabledProviders: (providers: ModelProvider[]) => void;
  toggleProviderDisabled: (provider: ModelProvider, disabled: boolean) => void;
  isProviderDisabled: (provider: ModelProvider) => boolean;

  // Claude Agent SDK Settings actions
  setAutoLoadClaudeMd: (enabled: boolean) => Promise<void>;
  setSkipSandboxWarning: (skip: boolean) => Promise<void>;

  // Editor Configuration actions
  setDefaultEditorCommand: (command: string | null) => void;

  // File Editor Settings actions
  setEditorFontSize: (size: number) => void;
  setEditorFontFamily: (fontFamily: string) => void;
  setEditorAutoSave: (enabled: boolean) => void;
  setEditorAutoSaveDelay: (delay: number) => void;

  // Terminal Configuration actions
  setDefaultTerminalId: (terminalId: string | null) => void;

  // Prompt Customization actions
  setPromptCustomization: (customization: PromptCustomization) => Promise<void>;

  // Event Hook actions
  setEventHooks: (hooks: EventHook[]) => void;

  // Claude-Compatible Provider actions (new system)
  addClaudeCompatibleProvider: (provider: ClaudeCompatibleProvider) => Promise<void>;
  updateClaudeCompatibleProvider: (
    id: string,
    updates: Partial<ClaudeCompatibleProvider>
  ) => Promise<void>;
  deleteClaudeCompatibleProvider: (id: string) => Promise<void>;
  setClaudeCompatibleProviders: (providers: ClaudeCompatibleProvider[]) => Promise<void>;
  toggleClaudeCompatibleProviderEnabled: (id: string) => Promise<void>;

  // Claude API Profile actions (deprecated - kept for backward compatibility)
  addClaudeApiProfile: (profile: ClaudeApiProfile) => Promise<void>;
  updateClaudeApiProfile: (id: string, updates: Partial<ClaudeApiProfile>) => Promise<void>;
  deleteClaudeApiProfile: (id: string) => Promise<void>;
  setActiveClaudeApiProfile: (id: string | null) => Promise<void>;
  setClaudeApiProfiles: (profiles: ClaudeApiProfile[]) => Promise<void>;

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
    targetSessionId?: string,
    branchName?: string
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
  setOpenTerminalMode: (mode: 'newTab' | 'split') => void;
  setTerminalBackgroundColor: (color: string | null) => void;
  setTerminalForegroundColor: (color: string | null) => void;
  addTerminalTab: (name?: string) => string;
  removeTerminalTab: (tabId: string) => void;
  setActiveTerminalTab: (tabId: string) => void;
  renameTerminalTab: (tabId: string, name: string) => void;
  reorderTerminalTabs: (fromTabId: string, toTabId: string) => void;
  moveTerminalToTab: (sessionId: string, targetTabId: string | 'new') => void;
  addTerminalToTab: (
    sessionId: string,
    tabId: string,
    direction?: 'horizontal' | 'vertical',
    branchName?: string
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
  setDefaultFeatureModel: (entry: PhaseModelEntry) => void;

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

  // Init Script Indicator Visibility actions (per-project)
  setShowInitScriptIndicator: (projectPath: string, visible: boolean) => void;
  getShowInitScriptIndicator: (projectPath: string) => boolean;

  // Default Delete Branch actions (per-project)
  setDefaultDeleteBranch: (projectPath: string, deleteBranch: boolean) => void;
  getDefaultDeleteBranch: (projectPath: string) => boolean;

  // Auto-dismiss Init Script Indicator actions (per-project)
  setAutoDismissInitScriptIndicator: (projectPath: string, autoDismiss: boolean) => void;
  getAutoDismissInitScriptIndicator: (projectPath: string) => boolean;

  // Use Worktrees Override actions (per-project)
  setProjectUseWorktrees: (projectPath: string, useWorktrees: boolean | null) => void; // null = use global
  getProjectUseWorktrees: (projectPath: string) => boolean | undefined; // undefined = using global
  getEffectiveUseWorktrees: (projectPath: string) => boolean; // Returns actual value (project or global fallback)

  // Worktree Copy Files actions (per-project)
  setWorktreeCopyFiles: (projectPath: string, files: string[]) => void;
  getWorktreeCopyFiles: (projectPath: string) => string[];

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

  // z.ai Usage Tracking actions
  setZaiUsage: (usage: ZaiUsage | null) => void;

  // Gemini Usage Tracking actions
  setGeminiUsage: (usage: GeminiUsage | null, lastUpdated?: number) => void;

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

  // OpenCode Models actions
  fetchOpencodeModels: (forceRefresh?: boolean) => Promise<void>;

  // Init Script State actions (keyed by projectPath::branch to support concurrent scripts)
  setInitScriptState: (
    projectPath: string,
    branch: string,
    state: Partial<InitScriptState>
  ) => void;
  appendInitScriptOutput: (projectPath: string, branch: string, content: string) => void;
  clearInitScriptState: (projectPath: string, branch: string) => void;
  getInitScriptState: (projectPath: string, branch: string) => InitScriptState | null;
  getInitScriptStatesForProject: (
    projectPath: string
  ) => Array<{ key: string; state: InitScriptState }>;

  // Reset
  reset: () => void;
}
