// Type definitions for Electron IPC API

export interface FileEntry {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
}

export interface FileStats {
  isDirectory: boolean;
  isFile: boolean;
  size: number;
  mtime: Date;
}

export interface DialogResult {
  canceled: boolean;
  filePaths: string[];
}

export interface FileResult {
  success: boolean;
  content?: string;
  error?: string;
}

export interface WriteResult {
  success: boolean;
  error?: string;
}

export interface ReaddirResult {
  success: boolean;
  entries?: FileEntry[];
  error?: string;
}

export interface StatResult {
  success: boolean;
  stats?: FileStats;
  error?: string;
}

// Re-export types from electron.d.ts for external use
export type {
  AutoModeEvent,
  ModelDefinition,
  ProviderStatus,
  WorktreeAPI,
  GitAPI,
  WorktreeInfo,
  WorktreeStatus,
  FileDiffsResult,
  FileDiffResult,
  FileStatus,
} from "@/types/electron";

// Feature type - Import from app-store
import type { Feature } from "@/store/app-store";

// Running Agent type
export interface RunningAgent {
  featureId: string;
  projectPath: string;
  projectName: string;
  isAutoMode: boolean;
}

export interface RunningAgentsResult {
  success: boolean;
  runningAgents?: RunningAgent[];
  totalCount?: number;
  autoLoopRunning?: boolean;
  error?: string;
}

export interface RunningAgentsAPI {
  getAll: () => Promise<RunningAgentsResult>;
}

// Feature Suggestions types
export interface FeatureSuggestion {
  id: string;
  category: string;
  description: string;
  steps: string[];
  priority: number;
  reasoning: string;
}

export interface SuggestionsEvent {
  type:
    | "suggestions_progress"
    | "suggestions_tool"
    | "suggestions_complete"
    | "suggestions_error";
  content?: string;
  tool?: string;
  input?: unknown;
  suggestions?: FeatureSuggestion[];
  error?: string;
}

export type SuggestionType =
  | "features"
  | "refactoring"
  | "security"
  | "performance";

export interface SuggestionsAPI {
  generate: (
    projectPath: string,
    suggestionType?: SuggestionType
  ) => Promise<{ success: boolean; error?: string }>;
  stop: () => Promise<{ success: boolean; error?: string }>;
  status: () => Promise<{
    success: boolean;
    isRunning?: boolean;
    error?: string;
  }>;
  onEvent: (callback: (event: SuggestionsEvent) => void) => () => void;
}

// Spec Regeneration types
export type SpecRegenerationEvent =
  | { type: "spec_regeneration_progress"; content: string }
  | { type: "spec_regeneration_tool"; tool: string; input: unknown }
  | { type: "spec_regeneration_complete"; message: string }
  | { type: "spec_regeneration_error"; error: string };

export interface SpecRegenerationAPI {
  create: (
    projectPath: string,
    projectOverview: string,
    generateFeatures?: boolean
  ) => Promise<{ success: boolean; error?: string }>;
  generate: (
    projectPath: string,
    projectDefinition: string
  ) => Promise<{ success: boolean; error?: string }>;
  generateFeatures: (projectPath: string) => Promise<{
    success: boolean;
    error?: string;
  }>;
  stop: () => Promise<{ success: boolean; error?: string }>;
  status: () => Promise<{
    success: boolean;
    isRunning?: boolean;
    currentPhase?: string;
    error?: string;
  }>;
  onEvent: (callback: (event: SpecRegenerationEvent) => void) => () => void;
}

// Features API types
export interface FeaturesAPI {
  getAll: (
    projectPath: string
  ) => Promise<{ success: boolean; features?: Feature[]; error?: string }>;
  get: (
    projectPath: string,
    featureId: string
  ) => Promise<{ success: boolean; feature?: Feature; error?: string }>;
  create: (
    projectPath: string,
    feature: Feature
  ) => Promise<{ success: boolean; feature?: Feature; error?: string }>;
  update: (
    projectPath: string,
    featureId: string,
    updates: Partial<Feature>
  ) => Promise<{ success: boolean; feature?: Feature; error?: string }>;
  delete: (
    projectPath: string,
    featureId: string
  ) => Promise<{ success: boolean; error?: string }>;
  getAgentOutput: (
    projectPath: string,
    featureId: string
  ) => Promise<{ success: boolean; content?: string | null; error?: string }>;
}

export interface AutoModeAPI {
  start: (
    projectPath: string,
    maxConcurrency?: number
  ) => Promise<{ success: boolean; error?: string }>;
  stop: (
    projectPath: string
  ) => Promise<{ success: boolean; error?: string; runningFeatures?: number }>;
  stopFeature: (
    featureId: string
  ) => Promise<{ success: boolean; error?: string }>;
  status: (projectPath?: string) => Promise<{
    success: boolean;
    isRunning?: boolean;
    autoLoopRunning?: boolean; // Backend uses this name instead of isRunning
    currentFeatureId?: string | null;
    runningFeatures?: string[];
    runningProjects?: string[];
    runningCount?: number;
    error?: string;
  }>;
  runFeature: (
    projectPath: string,
    featureId: string,
    useWorktrees?: boolean
  ) => Promise<{ success: boolean; passes?: boolean; error?: string }>;
  verifyFeature: (
    projectPath: string,
    featureId: string
  ) => Promise<{ success: boolean; passes?: boolean; error?: string }>;
  resumeFeature: (
    projectPath: string,
    featureId: string
  ) => Promise<{ success: boolean; passes?: boolean; error?: string }>;
  contextExists: (
    projectPath: string,
    featureId: string
  ) => Promise<{ success: boolean; exists?: boolean; error?: string }>;
  analyzeProject: (
    projectPath: string
  ) => Promise<{ success: boolean; message?: string; error?: string }>;
  followUpFeature: (
    projectPath: string,
    featureId: string,
    prompt: string,
    imagePaths?: string[]
  ) => Promise<{ success: boolean; passes?: boolean; error?: string }>;
  commitFeature: (
    projectPath: string,
    featureId: string
  ) => Promise<{ success: boolean; error?: string }>;
  onEvent: (callback: (event: AutoModeEvent) => void) => () => void;
}

export interface SaveImageResult {
  success: boolean;
  path?: string;
  error?: string;
}

export interface ElectronAPI {
  ping: () => Promise<string>;
  openExternalLink: (
    url: string
  ) => Promise<{ success: boolean; error?: string }>;
  openDirectory: () => Promise<DialogResult>;
  openFile: (options?: object) => Promise<DialogResult>;
  readFile: (filePath: string) => Promise<FileResult>;
  writeFile: (filePath: string, content: string) => Promise<WriteResult>;
  mkdir: (dirPath: string) => Promise<WriteResult>;
  readdir: (dirPath: string) => Promise<ReaddirResult>;
  exists: (filePath: string) => Promise<boolean>;
  stat: (filePath: string) => Promise<StatResult>;
  deleteFile: (filePath: string) => Promise<WriteResult>;
  trashItem?: (filePath: string) => Promise<WriteResult>;
  getPath: (name: string) => Promise<string>;
  saveImageToTemp?: (
    data: string,
    filename: string,
    mimeType: string,
    projectPath?: string
  ) => Promise<SaveImageResult>;
  checkClaudeCli?: () => Promise<{
    success: boolean;
    status?: string;
    method?: string;
    version?: string;
    path?: string;
    recommendation?: string;
    installCommands?: {
      macos?: string;
      windows?: string;
      linux?: string;
      npm?: string;
    };
    error?: string;
  }>;
  checkCodexCli?: () => Promise<{
    success: boolean;
    status?: string;
    method?: string;
    version?: string;
    path?: string;
    hasApiKey?: boolean;
    recommendation?: string;
    installCommands?: {
      macos?: string;
      windows?: string;
      linux?: string;
      npm?: string;
    };
    error?: string;
  }>;
  model?: {
    getAvailable: () => Promise<{
      success: boolean;
      models?: ModelDefinition[];
      error?: string;
    }>;
    checkProviders: () => Promise<{
      success: boolean;
      providers?: Record<string, ProviderStatus>;
      error?: string;
    }>;
  };
  testOpenAIConnection?: (apiKey?: string) => Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }>;
  worktree?: WorktreeAPI;
  git?: GitAPI;
  suggestions?: SuggestionsAPI;
  specRegeneration?: SpecRegenerationAPI;
  autoMode?: AutoModeAPI;
  features?: FeaturesAPI;
  runningAgents?: RunningAgentsAPI;
  setup?: {
    getClaudeStatus: () => Promise<{
      success: boolean;
      status?: string;
      installed?: boolean;
      method?: string;
      version?: string;
      path?: string;
      auth?: {
        authenticated: boolean;
        method: string;
        hasCredentialsFile?: boolean;
        hasToken?: boolean;
        hasStoredOAuthToken?: boolean;
        hasStoredApiKey?: boolean;
        hasEnvApiKey?: boolean;
        hasEnvOAuthToken?: boolean;
      };
      error?: string;
    }>;
    getCodexStatus: () => Promise<{
      success: boolean;
      status?: string;
      method?: string;
      version?: string;
      path?: string;
      auth?: {
        authenticated: boolean;
        method: string; // Can be: "cli_verified", "cli_tokens", "auth_file", "env_var", "none"
        hasAuthFile: boolean;
        hasEnvKey: boolean;
        hasStoredApiKey?: boolean;
        hasEnvApiKey?: boolean;
      };
      error?: string;
    }>;
    installClaude: () => Promise<{
      success: boolean;
      message?: string;
      error?: string;
    }>;
    installCodex: () => Promise<{
      success: boolean;
      message?: string;
      error?: string;
    }>;
    authClaude: () => Promise<{
      success: boolean;
      token?: string;
      requiresManualAuth?: boolean;
      terminalOpened?: boolean;
      command?: string;
      error?: string;
      message?: string;
      output?: string;
    }>;
    authCodex: (apiKey?: string) => Promise<{
      success: boolean;
      requiresManualAuth?: boolean;
      command?: string;
      error?: string;
    }>;
    storeApiKey: (
      provider: string,
      apiKey: string
    ) => Promise<{ success: boolean; error?: string }>;
    getApiKeys: () => Promise<{
      success: boolean;
      hasAnthropicKey: boolean;
      hasOpenAIKey: boolean;
      hasGoogleKey: boolean;
    }>;
    configureCodexMcp: (
      projectPath: string
    ) => Promise<{ success: boolean; configPath?: string; error?: string }>;
    getPlatform: () => Promise<{
      success: boolean;
      platform: string;
      arch: string;
      homeDir: string;
      isWindows: boolean;
      isMac: boolean;
      isLinux: boolean;
    }>;
    onInstallProgress?: (callback: (progress: any) => void) => () => void;
    onAuthProgress?: (callback: (progress: any) => void) => () => void;
  };
}

// Import types needed for ElectronAPI
import type {
  AutoModeEvent,
  ModelDefinition,
  ProviderStatus,
  WorktreeAPI,
  GitAPI,
} from "@/types/electron";

// Note: Window interface is declared in @/types/electron.d.ts
// Do not redeclare here to avoid type conflicts

// Check if we're in Electron
export const isElectron = (): boolean => {
  return typeof window !== "undefined" && window.isElectron === true;
};

// Local storage keys for project management
const STORAGE_KEYS = {
  PROJECTS: "automaker_projects",
  CURRENT_PROJECT: "automaker_current_project",
  TRASHED_PROJECTS: "automaker_trashed_projects",
} as const;

// Utility functions for project management

export interface Project {
  id: string;
  name: string;
  path: string;
  lastOpened?: string;
  theme?: string; // Per-project theme override (uses ThemeMode from app-store)
}

export interface TrashedProject extends Project {
  trashedAt: string;
  deletedFromDisk?: boolean;
}

export const getStoredProjects = (): Project[] => {
  if (typeof window === "undefined") return [];
  const stored = localStorage.getItem(STORAGE_KEYS.PROJECTS);
  return stored ? JSON.parse(stored) : [];
};

export const saveProjects = (projects: Project[]): void => {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(projects));
};

export const getCurrentProject = (): Project | null => {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(STORAGE_KEYS.CURRENT_PROJECT);
  return stored ? JSON.parse(stored) : null;
};

export const setCurrentProject = (project: Project | null): void => {
  if (typeof window === "undefined") return;
  if (project) {
    localStorage.setItem(STORAGE_KEYS.CURRENT_PROJECT, JSON.stringify(project));
  } else {
    localStorage.removeItem(STORAGE_KEYS.CURRENT_PROJECT);
  }
};

export const addProject = (project: Project): void => {
  const projects = getStoredProjects();
  const existing = projects.findIndex((p) => p.path === project.path);
  if (existing >= 0) {
    projects[existing] = { ...project, lastOpened: new Date().toISOString() };
  } else {
    projects.push({ ...project, lastOpened: new Date().toISOString() });
  }
  saveProjects(projects);
};

export const removeProject = (projectId: string): void => {
  const projects = getStoredProjects().filter((p) => p.id !== projectId);
  saveProjects(projects);
};

export const getStoredTrashedProjects = (): TrashedProject[] => {
  if (typeof window === "undefined") return [];
  const stored = localStorage.getItem(STORAGE_KEYS.TRASHED_PROJECTS);
  return stored ? JSON.parse(stored) : [];
};

export const saveTrashedProjects = (projects: TrashedProject[]): void => {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.TRASHED_PROJECTS, JSON.stringify(projects));
};
