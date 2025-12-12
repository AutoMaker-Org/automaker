/**
 * Electron API type definitions
 */

export interface ImageAttachment {
  id: string;
  data: string; // base64 encoded image data
  mimeType: string; // e.g., "image/png", "image/jpeg"
  filename: string;
  size: number; // file size in bytes
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  isError?: boolean;
  images?: ImageAttachment[];
}

export interface ToolUse {
  name: string;
  input: unknown;
}

export type StreamEvent =
  | {
      type: "message";
      sessionId: string;
      message: Message;
    }
  | {
      type: "stream";
      sessionId: string;
      messageId: string;
      content: string;
      isComplete: boolean;
    }
  | {
      type: "tool_use";
      sessionId: string;
      tool: ToolUse;
    }
  | {
      type: "complete";
      sessionId: string;
      messageId?: string;
      content: string;
      toolUses: ToolUse[];
    }
  | {
      type: "error";
      sessionId: string;
      error: string;
      message?: Message;
    };

export interface SessionListItem {
  id: string;
  name: string;
  projectPath: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  isArchived: boolean;
  isDirty?: boolean; // Indicates session has completed work that needs review
  tags: string[];
  preview: string;
}

export interface AgentAPI {
  start: (
    sessionId: string,
    workingDirectory?: string
  ) => Promise<{
    success: boolean;
    messages?: Message[];
    sessionId?: string;
    error?: string;
  }>;

  send: (
    sessionId: string,
    message: string,
    workingDirectory?: string,
    imagePaths?: string[]
  ) => Promise<{
    success: boolean;
    error?: string;
  }>;

  getHistory: (sessionId: string) => Promise<{
    success: boolean;
    messages?: Message[];
    isRunning?: boolean;
    error?: string;
  }>;

  stop: (sessionId: string) => Promise<{
    success: boolean;
    error?: string;
  }>;

  clear: (sessionId: string) => Promise<{
    success: boolean;
    error?: string;
  }>;

  onStream: (callback: (event: StreamEvent) => void) => () => void;
}

export interface SessionsAPI {
  list: (includeArchived?: boolean) => Promise<{
    success: boolean;
    sessions?: SessionListItem[];
    error?: string;
  }>;

  create: (
    name: string,
    projectPath: string,
    workingDirectory?: string
  ) => Promise<{
    success: boolean;
    sessionId?: string;
    session?: unknown;
    error?: string;
  }>;

  update: (
    sessionId: string,
    name?: string,
    tags?: string[]
  ) => Promise<{
    success: boolean;
    error?: string;
  }>;

  archive: (sessionId: string) => Promise<{
    success: boolean;
    error?: string;
  }>;

  unarchive: (sessionId: string) => Promise<{
    success: boolean;
    error?: string;
  }>;

  delete: (sessionId: string) => Promise<{
    success: boolean;
    error?: string;
  }>;

  markClean: (sessionId: string) => Promise<{
    success: boolean;
    error?: string;
  }>;
}

export type AutoModeEvent =
  | {
      type: "auto_mode_feature_start";
      featureId: string;
      projectId?: string;
      projectPath?: string;
      feature: unknown;
    }
  | {
      type: "auto_mode_progress";
      featureId: string;
      projectId?: string;
      projectPath?: string;
      content: string;
    }
  | {
      type: "auto_mode_tool";
      featureId: string;
      projectId?: string;
      projectPath?: string;
      tool: string;
      input: unknown;
    }
  | {
      type: "auto_mode_feature_complete";
      featureId: string;
      projectId?: string;
      projectPath?: string;
      passes: boolean;
      message: string;
    }
  | {
      type: "auto_mode_error";
      error: string;
      featureId?: string;
      projectId?: string;
      projectPath?: string;
    }
  | {
      type: "auto_mode_complete";
      message: string;
      projectId?: string;
      projectPath?: string;
    }
  | {
      type: "auto_mode_phase";
      featureId: string;
      projectId?: string;
      projectPath?: string;
      phase: "planning" | "action" | "verification";
      message: string;
    }
  | {
      type: "auto_mode_ultrathink_preparation";
      featureId: string;
      projectPath?: string;
      warnings: string[];
      recommendations: string[];
      estimatedCost?: number;
      estimatedTime?: string;
    };

export type SpecRegenerationEvent =
  | {
      type: "spec_regeneration_progress";
      content: string;
    }
  | {
      type: "spec_regeneration_tool";
      tool: string;
      input: unknown;
    }
  | {
      type: "spec_regeneration_complete";
      message: string;
    }
  | {
      type: "spec_regeneration_error";
      error: string;
    };

export interface SpecRegenerationAPI {
  create: (
    projectPath: string,
    projectOverview: string,
    generateFeatures?: boolean
  ) => Promise<{
    success: boolean;
    error?: string;
  }>;

  generate: (
    projectPath: string,
    projectDefinition: string
  ) => Promise<{
    success: boolean;
    error?: string;
  }>;

  generateFeatures: (projectPath: string) => Promise<{
    success: boolean;
    error?: string;
  }>;

  stop: () => Promise<{
    success: boolean;
    error?: string;
  }>;

  status: () => Promise<{
    success: boolean;
    isRunning?: boolean;
    currentPhase?: string;
    error?: string;
  }>;

  onEvent: (callback: (event: SpecRegenerationEvent) => void) => () => void;
}

export interface AutoModeAPI {
  start: (
    projectPath: string,
    maxConcurrency?: number
  ) => Promise<{
    success: boolean;
    error?: string;
  }>;

  stop: (projectPath: string) => Promise<{
    success: boolean;
    error?: string;
    runningFeatures?: number;
  }>;

  stopFeature: (featureId: string) => Promise<{
    success: boolean;
    error?: string;
  }>;

  status: (projectPath?: string) => Promise<{
    success: boolean;
    autoLoopRunning?: boolean;
    isRunning?: boolean;
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
  ) => Promise<{
    success: boolean;
    passes?: boolean;
    error?: string;
  }>;

  verifyFeature: (
    projectPath: string,
    featureId: string
  ) => Promise<{
    success: boolean;
    passes?: boolean;
    error?: string;
  }>;

  resumeFeature: (
    projectPath: string,
    featureId: string
  ) => Promise<{
    success: boolean;
    passes?: boolean;
    error?: string;
  }>;

  contextExists: (
    projectPath: string,
    featureId: string
  ) => Promise<{
    success: boolean;
    exists?: boolean;
    error?: string;
  }>;

  analyzeProject: (projectPath: string) => Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }>;

  followUpFeature: (
    projectPath: string,
    featureId: string,
    prompt: string,
    imagePaths?: string[]
  ) => Promise<{
    success: boolean;
    passes?: boolean;
    error?: string;
  }>;

  commitFeature: (
    projectPath: string,
    featureId: string
  ) => Promise<{
    success: boolean;
    error?: string;
  }>;

  onEvent: (callback: (event: AutoModeEvent) => void) => () => void;
}

export interface ElectronAPI {
  ping: () => Promise<string>;
  openExternalLink: (
    url: string
  ) => Promise<{ success: boolean; error?: string }>;

  // Dialog APIs
  openDirectory: () => Promise<{
    canceled: boolean;
    filePaths: string[];
  }>;
  openFile: (options?: unknown) => Promise<{
    canceled: boolean;
    filePaths: string[];
  }>;

  // File system APIs
  readFile: (filePath: string) => Promise<{
    success: boolean;
    content?: string;
    error?: string;
  }>;
  writeFile: (
    filePath: string,
    content: string
  ) => Promise<{
    success: boolean;
    error?: string;
  }>;
  mkdir: (dirPath: string) => Promise<{
    success: boolean;
    error?: string;
  }>;
  readdir: (dirPath: string) => Promise<{
    success: boolean;
    entries?: Array<{
      name: string;
      isDirectory: boolean;
      isFile: boolean;
    }>;
    error?: string;
  }>;
  exists: (filePath: string) => Promise<boolean>;
  stat: (filePath: string) => Promise<{
    success: boolean;
    stats?: {
      isDirectory: boolean;
      isFile: boolean;
      size: number;
      mtime: Date;
    };
    error?: string;
  }>;
  deleteFile: (filePath: string) => Promise<{
    success: boolean;
    error?: string;
  }>;

  // App APIs
  getPath: (name: string) => Promise<string>;
  saveImageToTemp: (
    data: string,
    filename: string,
    mimeType: string,
    projectPath?: string
  ) => Promise<{
    success: boolean;
    path?: string;
    error?: string;
  }>;

  // Agent APIs
  agent: AgentAPI;

  // Session Management APIs
  sessions: SessionsAPI;

  // Auto Mode APIs
  autoMode: AutoModeAPI;

  // Claude CLI Detection API
  checkClaudeCli: () => Promise<{
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

  // Codex CLI Detection API
  checkCodexCli: () => Promise<{
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

  // Model Management APIs
  model: {
    // Get all available models from all providers
    getAvailable: () => Promise<{
      success: boolean;
      models?: ModelDefinition[];
      error?: string;
    }>;

    // Check all provider installation status
    checkProviders: () => Promise<{
      success: boolean;
      providers?: Record<string, ProviderStatus>;
      error?: string;
    }>;
  };

  // OpenAI API
  testOpenAIConnection: (apiKey?: string) => Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }>;

  // Worktree Management APIs
  worktree: WorktreeAPI;

  // Git Operations APIs (for non-worktree operations)
  git: GitAPI;

  // Spec Regeneration APIs
  specRegeneration: SpecRegenerationAPI;
}

export interface WorktreeInfo {
  worktreePath: string;
  branchName: string;
  head?: string;
  baseBranch?: string;
}

export interface WorktreeStatus {
  success: boolean;
  modifiedFiles?: number;
  files?: string[];
  diffStat?: string;
  recentCommits?: string[];
  error?: string;
}

export interface FileStatus {
  status: string;
  path: string;
  statusText: string;
}

export interface FileDiffsResult {
  success: boolean;
  diff?: string;
  files?: FileStatus[];
  hasChanges?: boolean;
  error?: string;
}

export interface FileDiffResult {
  success: boolean;
  diff?: string;
  filePath?: string;
  error?: string;
}

export interface WorktreeAPI {
  // Revert feature changes by removing the worktree
  revertFeature: (
    projectPath: string,
    featureId: string
  ) => Promise<{
    success: boolean;
    removedPath?: string;
    error?: string;
  }>;

  // Merge feature worktree changes back to main branch
  mergeFeature: (
    projectPath: string,
    featureId: string,
    options?: {
      squash?: boolean;
      commitMessage?: string;
      squashMessage?: string;
    }
  ) => Promise<{
    success: boolean;
    mergedBranch?: string;
    error?: string;
  }>;

  // Get worktree info for a feature
  getInfo: (
    projectPath: string,
    featureId: string
  ) => Promise<{
    success: boolean;
    worktreePath?: string;
    branchName?: string;
    head?: string;
    error?: string;
  }>;

  // Get worktree status (changed files, commits)
  getStatus: (
    projectPath: string,
    featureId: string
  ) => Promise<WorktreeStatus>;

  // List all feature worktrees
  list: (projectPath: string) => Promise<{
    success: boolean;
    worktrees?: WorktreeInfo[];
    error?: string;
  }>;

  // Get file diffs for a feature worktree
  getDiffs: (
    projectPath: string,
    featureId: string
  ) => Promise<FileDiffsResult>;

  // Get diff for a specific file in a worktree
  getFileDiff: (
    projectPath: string,
    featureId: string,
    filePath: string
  ) => Promise<FileDiffResult>;
}

export interface GitAPI {
  // Get diffs for the main project (not a worktree)
  getDiffs: (projectPath: string) => Promise<FileDiffsResult>;

  // Get diff for a specific file in the main project
  getFileDiff: (
    projectPath: string,
    filePath: string
  ) => Promise<FileDiffResult>;
}

// Model definition type
export interface ModelDefinition {
  id: string;
  name: string;
  modelString: string;
  provider: "claude" | "codex";
  description?: string;
  tier?: "basic" | "standard" | "premium";
  default?: boolean;
}

// Provider status type
export interface ProviderStatus {
  status: "installed" | "not_installed" | "api_key_only";
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
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
    isElectron: boolean;
  }
}

export {};
