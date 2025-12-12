import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Project, TrashedProject } from "@/lib/electron";

export type ViewMode =
  | "welcome"
  | "setup"
  | "spec"
  | "board"
  | "agent"
  | "settings"
  | "tools"
  | "interview"
  | "context"
  | "profiles"
  | "running-agents";

export type ThemeMode =
  | "light"
  | "dark"
  | "system"
  | "retro"
  | "dracula"
  | "nord"
  | "monokai"
  | "tokyonight"
  | "solarized"
  | "gruvbox"
  | "catppuccin"
  | "onedark"
  | "synthwave";

export type KanbanCardDetailLevel = "minimal" | "standard" | "detailed";

export interface ApiKeys {
  anthropic: string;
  google: string;
  openai: string;
}

// Keyboard Shortcut with optional modifiers
export interface ShortcutKey {
  key: string;           // The main key (e.g., "K", "N", "1")
  shift?: boolean;       // Shift key modifier
  cmdCtrl?: boolean;     // Cmd on Mac, Ctrl on Windows/Linux
  alt?: boolean;         // Alt/Option key modifier
}

// Helper to parse shortcut string to ShortcutKey object
export function parseShortcut(shortcut: string): ShortcutKey {
  const parts = shortcut.split("+").map(p => p.trim());
  const result: ShortcutKey = { key: parts[parts.length - 1] };

  // Normalize common OS-specific modifiers (Cmd/Ctrl/Win/Super symbols) into cmdCtrl
  for (let i = 0; i < parts.length - 1; i++) {
    const modifier = parts[i].toLowerCase();
    if (modifier === "shift") result.shift = true;
    else if (modifier === "cmd" || modifier === "ctrl" || modifier === "win" || modifier === "super" || modifier === "⌘" || modifier === "^" || modifier === "⊞" || modifier === "◆") result.cmdCtrl = true;
    else if (modifier === "alt" || modifier === "opt" || modifier === "option" || modifier === "⌥") result.alt = true;
  }

  return result;
}

// Helper to format ShortcutKey to display string
export function formatShortcut(shortcut: string, forDisplay = false): string {
  const parsed = parseShortcut(shortcut);
  const parts: string[] = [];

  // Prefer User-Agent Client Hints when available; fall back to legacy
  const platform: 'darwin' | 'win32' | 'linux' = (() => {
    if (typeof navigator === 'undefined') return 'linux';

    const uaPlatform = (navigator as Navigator & { userAgentData?: { platform?: string } })
      .userAgentData?.platform?.toLowerCase?.();
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
    parts.push(forDisplay ? (platform === 'darwin' ? '⌥' : 'Alt') : (platform === 'darwin' ? 'Opt' : 'Alt'));
  }

  // Shift
  if (parsed.shift) {
    parts.push(forDisplay ? '⇧' : 'Shift');
  }

  parts.push(parsed.key.toUpperCase());

  // Add spacing when displaying symbols
  return parts.join(forDisplay ? " " : "+");
}

// Keyboard Shortcuts - stored as strings like "K", "Shift+N", "Cmd+K"
export interface KeyboardShortcuts {
  // Navigation shortcuts
  board: string;
  agent: string;
  spec: string;
  context: string;
  tools: string;
  settings: string;
  profiles: string;

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
}

// Default keyboard shortcuts
export const DEFAULT_KEYBOARD_SHORTCUTS: KeyboardShortcuts = {
  // Navigation
  board: "K",
  agent: "A",
  spec: "D",
  context: "C",
  tools: "T",
  settings: "S",
  profiles: "M",
  
  // UI
  toggleSidebar: "`",
  
  // Actions
  // Note: Some shortcuts share the same key (e.g., "N" for addFeature, newSession, addProfile)
  // This is intentional as they are context-specific and only active in their respective views
  addFeature: "N",        // Only active in board view
  addContextFile: "F",    // Only active in context view
  startNext: "G",         // Only active in board view
  newSession: "N",        // Only active in agent view
  openProject: "O",       // Global shortcut
  projectPicker: "P",     // Global shortcut
  cyclePrevProject: "Q",  // Global shortcut
  cycleNextProject: "E",  // Global shortcut
  addProfile: "N",        // Only active in profiles view
};

export interface ImageAttachment {
  id: string;
  data: string; // base64 encoded image data
  mimeType: string; // e.g., "image/png", "image/jpeg"
  filename: string;
  size: number; // file size in bytes
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  images?: ImageAttachment[];
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

export interface FeatureImage {
  id: string;
  data: string; // base64 encoded
  mimeType: string;
  filename: string;
  size: number;
}

export interface FeatureImagePath {
  id: string;
  path: string; // Path to the temp file
  filename: string;
  mimeType: string;
}

// Available models for feature execution
// Claude models
export type ClaudeModel = "opus" | "sonnet" | "haiku";
// OpenAI/Codex models
export type OpenAIModel =
  | "gpt-5.1-codex-max"
  | "gpt-5.1-codex"
  | "gpt-5.1-codex-mini"
  | "gpt-5.1";
// Combined model type
export type AgentModel = ClaudeModel | OpenAIModel;

// Model provider type
export type ModelProvider = "claude" | "codex";

// Thinking level (budget_tokens) options
export type ThinkingLevel = "none" | "low" | "medium" | "high" | "ultrathink";

// AI Provider Profile - user-defined presets for model configurations
export interface AIProfile {
  id: string;
  name: string;
  description: string;
  model: AgentModel;
  thinkingLevel: ThinkingLevel;
  provider: ModelProvider;
  isBuiltIn: boolean; // Built-in profiles cannot be deleted
  icon?: string; // Optional icon name from lucide
}

export interface Feature {
  id: string;
  category: string;
  description: string;
  steps: string[];
  status: "backlog" | "in_progress" | "waiting_approval" | "verified";
  images?: FeatureImage[];
  imagePaths?: FeatureImagePath[]; // Paths to temp files for agent context
  startedAt?: string; // ISO timestamp for when the card moved to in_progress
  skipTests?: boolean; // When true, skip TDD approach and require manual verification
  summary?: string; // Summary of what was done/modified by the agent
  model?: AgentModel; // Model to use for this feature (defaults to opus)
  thinkingLevel?: ThinkingLevel; // Thinking level for extended thinking (defaults to none)
  error?: string; // Error message if the agent errored during processing
  // Worktree info - set when a feature is being worked on in an isolated git worktree
  worktreePath?: string; // Path to the worktree directory
  branchName?: string; // Name of the feature branch
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
  autoModeByProject: Record<string, {
    isRunning: boolean;
    runningTasks: string[]; // Feature IDs being worked on
  }>;
  autoModeActivityLog: AutoModeActivity[];
  maxConcurrency: number; // Maximum number of concurrent agent tasks

  // Kanban Card Display Settings
  kanbanCardDetailLevel: KanbanCardDetailLevel; // Level of detail shown on kanban cards

  // Feature Default Settings
  defaultSkipTests: boolean; // Default value for skip tests when creating new features

  // Worktree Settings
  useWorktrees: boolean; // Whether to use git worktree isolation for features (default: false)

  // AI Profiles
  aiProfiles: AIProfile[];

  // Profile Display Settings
  showProfilesOnly: boolean; // When true, hide model tweaking options and show only profile selection

  // Keyboard Shortcuts
  keyboardShortcuts: KeyboardShortcuts; // User-defined keyboard shortcuts

  // Audio Settings
  muteDoneSound: boolean; // When true, mute the notification sound when agents complete (default: false)

  // Project Analysis
  projectAnalysis: ProjectAnalysis | null;
  isAnalyzing: boolean;
}

export interface AutoModeActivity {
  id: string;
  featureId: string;
  timestamp: Date;
  type:
    | "start"
    | "progress"
    | "tool"
    | "complete"
    | "error"
    | "planning"
    | "action"
    | "verification";
  message: string;
  tool?: string;
  passes?: boolean;
  phase?: "planning" | "action" | "verification";
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
  getEffectiveTheme: () => ThemeMode; // Get the effective theme (project or global)

  // Feature actions
  setFeatures: (features: Feature[]) => void;
  updateFeature: (id: string, updates: Partial<Feature>) => void;
  addFeature: (
    feature: Omit<Feature, "id"> & Partial<Pick<Feature, "id">>
  ) => Feature;
  removeFeature: (id: string) => void;
  moveFeature: (id: string, newStatus: Feature["status"]) => void;

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
  getAutoModeState: (projectId: string) => { isRunning: boolean; runningTasks: string[] };
  addAutoModeActivity: (
    activity: Omit<AutoModeActivity, "id" | "timestamp">
  ) => void;
  clearAutoModeActivity: () => void;
  setMaxConcurrency: (max: number) => void;

  // Kanban Card Settings actions
  setKanbanCardDetailLevel: (level: KanbanCardDetailLevel) => void;

  // Feature Default Settings actions
  setDefaultSkipTests: (skip: boolean) => void;

  // Worktree Settings actions
  setUseWorktrees: (enabled: boolean) => void;

  // Profile Display Settings actions
  setShowProfilesOnly: (enabled: boolean) => void;

  // Keyboard Shortcuts actions
  setKeyboardShortcut: (key: keyof KeyboardShortcuts, value: string) => void;
  setKeyboardShortcuts: (shortcuts: Partial<KeyboardShortcuts>) => void;
  resetKeyboardShortcuts: () => void;

  // Audio Settings actions
  setMuteDoneSound: (muted: boolean) => void;

  // AI Profile actions
  addAIProfile: (profile: Omit<AIProfile, "id">) => void;
  updateAIProfile: (id: string, updates: Partial<AIProfile>) => void;
  removeAIProfile: (id: string) => void;
  reorderAIProfiles: (oldIndex: number, newIndex: number) => void;

  // Project Analysis actions
  setProjectAnalysis: (analysis: ProjectAnalysis | null) => void;
  setIsAnalyzing: (analyzing: boolean) => void;
  clearAnalysis: () => void;

  // Agent Session actions
  setLastSelectedSession: (projectPath: string, sessionId: string | null) => void;
  getLastSelectedSession: (projectPath: string) => string | null;

  // Reset
  reset: () => void;
}

// Default built-in AI profiles
const DEFAULT_AI_PROFILES: AIProfile[] = [
  {
    id: "profile-heavy-task",
    name: "Heavy Task",
    description: "Claude Opus with Ultrathink for complex architecture, migrations, or deep debugging.",
    model: "opus",
    thinkingLevel: "ultrathink",
    provider: "claude",
    isBuiltIn: true,
    icon: "Brain",
  },
  {
    id: "profile-balanced",
    name: "Balanced",
    description: "Claude Sonnet with medium thinking for typical development tasks.",
    model: "sonnet",
    thinkingLevel: "medium",
    provider: "claude",
    isBuiltIn: true,
    icon: "Scale",
  },
  {
    id: "profile-quick-edit",
    name: "Quick Edit",
    description: "Claude Haiku for fast, simple edits and minor fixes.",
    model: "haiku",
    thinkingLevel: "none",
    provider: "claude",
    isBuiltIn: true,
    icon: "Zap",
  },
  {
    id: "profile-codex-power",
    name: "Codex Power",
    description: "GPT-5.1 Codex Max for deep coding tasks via OpenAI CLI.",
    model: "gpt-5.1-codex-max",
    thinkingLevel: "none",
    provider: "codex",
    isBuiltIn: true,
    icon: "Cpu",
  },
  {
    id: "profile-codex-fast",
    name: "Codex Fast",
    description: "GPT-5.1 Codex Mini for lightweight and quick edits.",
    model: "gpt-5.1-codex-mini",
    thinkingLevel: "none",
    provider: "codex",
    isBuiltIn: true,
    icon: "Rocket",
  },
];

const initialState: AppState = {
  projects: [],
  currentProject: null,
  trashedProjects: [],
  projectHistory: [],
  projectHistoryIndex: -1,
  currentView: "welcome",
  sidebarOpen: true,
  lastSelectedSessionByProject: {},
  theme: "dark",
  features: [],
  appSpec: "",
  ipcConnected: false,
  apiKeys: {
    anthropic: "",
    google: "",
    openai: "",
  },
  chatSessions: [],
  currentChatSession: null,
  chatHistoryOpen: false,
  autoModeByProject: {},
  autoModeActivityLog: [],
  maxConcurrency: 3, // Default to 3 concurrent agents
  kanbanCardDetailLevel: "standard", // Default to standard detail level
  defaultSkipTests: true, // Default to manual verification (tests disabled)
  useWorktrees: false, // Default to disabled (worktree feature is experimental)
  showProfilesOnly: false, // Default to showing all options (not profiles only)
  keyboardShortcuts: DEFAULT_KEYBOARD_SHORTCUTS, // Default keyboard shortcuts
  muteDoneSound: false, // Default to sound enabled (not muted)
  aiProfiles: DEFAULT_AI_PROFILES,
  projectAnalysis: null,
  isAnalyzing: false,
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
            projects: [
              ...projects,
              { ...project, lastOpened: new Date().toISOString() },
            ],
          });
        }
      },

      removeProject: (projectId) => {
        set({ projects: get().projects.filter((p) => p.id !== projectId) });
      },

      moveProjectToTrash: (projectId) => {
        const project = get().projects.find((p) => p.id === projectId);
        if (!project) return;

        const remainingProjects = get().projects.filter(
          (p) => p.id !== projectId
        );
        const existingTrash = get().trashedProjects.filter(
          (p) => p.id !== projectId
        );
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
          currentView: isCurrent ? "welcome" : get().currentView,
        });
      },

      restoreTrashedProject: (projectId) => {
        const trashed = get().trashedProjects.find((p) => p.id === projectId);
        if (!trashed) return;

        const remainingTrash = get().trashedProjects.filter(
          (p) => p.id !== projectId
        );
        const existingProjects = get().projects;
        const samePathProject = existingProjects.find(
          (p) => p.path === trashed.path
        );
        const projectsWithoutId = existingProjects.filter(
          (p) => p.id !== projectId
        );

        // If a project with the same path already exists, keep it and just remove from trash
        if (samePathProject) {
          set({
            trashedProjects: remainingTrash,
            currentProject: samePathProject,
            currentView: "board",
          });
          return;
        }

        const restoredProject: Project = {
          id: trashed.id,
          name: trashed.name,
          path: trashed.path,
          lastOpened: new Date().toISOString(),
        };

        set({
          trashedProjects: remainingTrash,
          projects: [...projectsWithoutId, restoredProject],
          currentProject: restoredProject,
          currentView: "board",
        });
      },

      deleteTrashedProject: (projectId) => {
        set({
          trashedProjects: get().trashedProjects.filter(
            (p) => p.id !== projectId
          ),
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
          set({ currentView: "board" });
          // Add to project history (MRU order)
          const currentHistory = get().projectHistory;
          // Remove this project if it's already in history
          const filteredHistory = currentHistory.filter((id) => id !== project.id);
          // Add to the front (most recent)
          const newHistory = [project.id, ...filteredHistory];
          // Reset history index to 0 (current project)
          set({ projectHistory: newHistory, projectHistoryIndex: 0 });
        } else {
          set({ currentView: "welcome" });
        }
      },

      cyclePrevProject: () => {
        const { projectHistory, projectHistoryIndex, projects } = get();

        // Filter history to only include valid projects
        const validHistory = projectHistory.filter((id) =>
          projects.some((p) => p.id === id)
        );

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
            currentView: "board"
          });
        }
      },

      cycleNextProject: () => {
        const { projectHistory, projectHistoryIndex, projects } = get();

        // Filter history to only include valid projects
        const validHistory = projectHistory.filter((id) =>
          projects.some((p) => p.id === id)
        );

        if (validHistory.length <= 1) return; // Need at least 2 valid projects to cycle

        // Find current position in valid history
        const currentProjectId = get().currentProject?.id;
        let currentIndex = currentProjectId
          ? validHistory.indexOf(currentProjectId)
          : projectHistoryIndex;

        // If current project not found in valid history, start from 0
        if (currentIndex === -1) currentIndex = 0;

        // Move to the previous index (going forward = lower index), wrapping around
        const newIndex = currentIndex <= 0
          ? validHistory.length - 1
          : currentIndex - 1;
        const targetProjectId = validHistory[newIndex];
        const targetProject = projects.find((p) => p.id === targetProjectId);

        if (targetProject) {
          // Update history to only include valid projects and set new index
          set({
            currentProject: targetProject,
            projectHistory: validHistory,
            projectHistoryIndex: newIndex,
            currentView: "board"
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
          p.id === projectId
            ? { ...p, theme: theme === null ? undefined : theme }
            : p
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
        const currentProject = get().currentProject;
        // If current project has a theme set, use it
        if (currentProject?.theme) {
          return currentProject.theme as ThemeMode;
        }
        // Otherwise fall back to global theme
        return get().theme;
      },

      // Feature actions
      setFeatures: (features) => set({ features }),

      updateFeature: (id, updates) => {
        set({
          features: get().features.map((f) =>
            f.id === id ? { ...f, ...updates } : f
          ),
        });
      },

      addFeature: (feature) => {
        const id =
          feature.id ||
          `feature-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const featureWithId = { ...feature, id } as Feature;
        set({ features: [...get().features, featureWithId] });
        return featureWithId;
      },

      removeFeature: (id) => {
        set({ features: get().features.filter((f) => f.id !== id) });
      },

      moveFeature: (id, newStatus) => {
        set({
          features: get().features.map((f) =>
            f.id === id ? { ...f, status: newStatus } : f
          ),
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
          throw new Error("No project selected");
        }

        const now = new Date();
        const session: ChatSession = {
          id: `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          title:
            title ||
            `Chat ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
          projectId: currentProject.id,
          messages: [
            {
              id: "welcome",
              role: "assistant",
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
            session.id === sessionId
              ? { ...session, ...updates, updatedAt: new Date() }
              : session
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
          currentChatSession:
            currentSession?.id === sessionId ? null : currentSession,
        });
      },

      setChatHistoryOpen: (open) => set({ chatHistoryOpen: open }),

      toggleChatHistory: () => set({ chatHistoryOpen: !get().chatHistoryOpen }),

      // Auto Mode actions (per-project)
      setAutoModeRunning: (projectId, running) => {
        const current = get().autoModeByProject;
        const projectState = current[projectId] || { isRunning: false, runningTasks: [] };
        set({
          autoModeByProject: {
            ...current,
            [projectId]: { ...projectState, isRunning: running },
          },
        });
      },

      addRunningTask: (projectId, taskId) => {
        const current = get().autoModeByProject;
        const projectState = current[projectId] || { isRunning: false, runningTasks: [] };
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
        const projectState = current[projectId] || { isRunning: false, runningTasks: [] };
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
        const projectState = current[projectId] || { isRunning: false, runningTasks: [] };
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
        const id = `activity-${Date.now()}-${Math.random()
          .toString(36)
          .substr(2, 9)}`;
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
      setKanbanCardDetailLevel: (level) =>
        set({ kanbanCardDetailLevel: level }),

      // Feature Default Settings actions
      setDefaultSkipTests: (skip) => set({ defaultSkipTests: skip }),

      // Worktree Settings actions
      setUseWorktrees: (enabled) => set({ useWorktrees: enabled }),

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

      // AI Profile actions
      addAIProfile: (profile) => {
        const id = `profile-${Date.now()}-${Math.random()
          .toString(36)
          .substr(2, 9)}`;
        set({ aiProfiles: [...get().aiProfiles, { ...profile, id }] });
      },

      updateAIProfile: (id, updates) => {
        set({
          aiProfiles: get().aiProfiles.map((p) =>
            p.id === id ? { ...p, ...updates } : p
          ),
        });
      },

      removeAIProfile: (id) => {
        // Only allow removing non-built-in profiles
        const profile = get().aiProfiles.find((p) => p.id === id);
        if (profile && !profile.isBuiltIn) {
          set({ aiProfiles: get().aiProfiles.filter((p) => p.id !== id) });
        }
      },

      reorderAIProfiles: (oldIndex, newIndex) => {
        const profiles = [...get().aiProfiles];
        const [movedProfile] = profiles.splice(oldIndex, 1);
        profiles.splice(newIndex, 0, movedProfile);
        set({ aiProfiles: profiles });
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
          const { [projectPath]: _, ...rest } = current;
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
      // Reset
      reset: () => set(initialState),
    }),
    {
      name: "automaker-storage",
      partialize: (state) => ({
        projects: state.projects,
        currentProject: state.currentProject,
        trashedProjects: state.trashedProjects,
        projectHistory: state.projectHistory,
        projectHistoryIndex: state.projectHistoryIndex,
        currentView: state.currentView,
        theme: state.theme,
        sidebarOpen: state.sidebarOpen,
        apiKeys: state.apiKeys,
        chatSessions: state.chatSessions,
        chatHistoryOpen: state.chatHistoryOpen,
        maxConcurrency: state.maxConcurrency,
        autoModeByProject: state.autoModeByProject,
        kanbanCardDetailLevel: state.kanbanCardDetailLevel,
        defaultSkipTests: state.defaultSkipTests,
        useWorktrees: state.useWorktrees,
        showProfilesOnly: state.showProfilesOnly,
        keyboardShortcuts: state.keyboardShortcuts,
        muteDoneSound: state.muteDoneSound,
        aiProfiles: state.aiProfiles,
        lastSelectedSessionByProject: state.lastSelectedSessionByProject,
      }),
    }
  )
);
