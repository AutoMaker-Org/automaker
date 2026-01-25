/**
 * Electron API type definitions
 */

import type { ClaudeUsageResponse, CodexUsageResponse } from '@/store/app-store';

export interface ImageAttachment {
  id?: string; // Optional - may not be present in messages loaded from server
  data: string; // base64 encoded image data
  mimeType: string; // e.g., "image/png", "image/jpeg"
  filename: string;
  size?: number; // file size in bytes - optional for messages from server
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
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
      type: 'message';
      sessionId: string;
      message: Message;
    }
  | {
      type: 'stream';
      sessionId: string;
      messageId: string;
      content: string;
      isComplete: boolean;
    }
  | {
      type: 'tool_use';
      sessionId: string;
      tool: ToolUse;
    }
  | {
      type: 'complete';
      sessionId: string;
      messageId?: string;
      content: string;
      toolUses: ToolUse[];
    }
  | {
      type: 'error';
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
    imagePaths?: string[],
    model?: string,
    thinkingLevel?: string
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
      type: 'auto_mode_started';
      message: string;
      projectPath?: string;
      branchName?: string | null;
    }
  | {
      type: 'auto_mode_stopped';
      message: string;
      projectPath?: string;
      branchName?: string | null;
    }
  | {
      type: 'auto_mode_idle';
      message: string;
      projectPath?: string;
      branchName?: string | null;
    }
  | {
      type: 'auto_mode_feature_start';
      featureId: string;
      projectId?: string;
      projectPath?: string;
      branchName?: string | null;
      feature: unknown;
    }
  | {
      type: 'auto_mode_progress';
      featureId: string;
      projectId?: string;
      projectPath?: string;
      branchName?: string | null;
      content: string;
    }
  | {
      type: 'auto_mode_tool';
      featureId: string;
      projectId?: string;
      projectPath?: string;
      branchName?: string | null;
      tool: string;
      input: unknown;
    }
  | {
      type: 'auto_mode_feature_complete';
      featureId: string;
      projectId?: string;
      projectPath?: string;
      branchName?: string | null;
      passes: boolean;
      message: string;
    }
  | {
      type: 'pipeline_step_started';
      featureId: string;
      projectPath?: string;
      branchName?: string | null;
      stepId: string;
      stepName: string;
      stepIndex: number;
      totalSteps: number;
    }
  | {
      type: 'pipeline_step_complete';
      featureId: string;
      projectPath?: string;
      branchName?: string | null;
      stepId: string;
      stepName: string;
      stepIndex: number;
      totalSteps: number;
    }
  | {
      type: 'auto_mode_error';
      error: string;
      errorType?: 'authentication' | 'cancellation' | 'abort' | 'execution';
      featureId?: string;
      projectId?: string;
      projectPath?: string;
      branchName?: string | null;
    }
  | {
      type: 'auto_mode_phase';
      featureId: string;
      projectId?: string;
      projectPath?: string;
      branchName?: string | null;
      phase: 'planning' | 'action' | 'verification';
      message: string;
    }
  | {
      type: 'auto_mode_ultrathink_preparation';
      featureId: string;
      projectPath?: string;
      branchName?: string | null;
      warnings: string[];
      recommendations: string[];
      estimatedCost?: number;
      estimatedTime?: string;
    }
  | {
      type: 'plan_approval_required';
      featureId: string;
      projectPath?: string;
      branchName?: string | null;
      planContent: string;
      planningMode: 'lite' | 'spec' | 'full';
      planVersion?: number;
    }
  | {
      type: 'plan_auto_approved';
      featureId: string;
      projectPath?: string;
      branchName?: string | null;
      planContent: string;
      planningMode: 'lite' | 'spec' | 'full';
    }
  | {
      type: 'plan_approved';
      featureId: string;
      projectPath?: string;
      branchName?: string | null;
      hasEdits: boolean;
      planVersion?: number;
    }
  | {
      type: 'plan_rejected';
      featureId: string;
      projectPath?: string;
      branchName?: string | null;
      feedback?: string;
    }
  | {
      type: 'plan_revision_requested';
      featureId: string;
      projectPath?: string;
      branchName?: string | null;
      feedback?: string;
      hasEdits?: boolean;
      planVersion?: number;
    }
  | {
      type: 'planning_started';
      featureId: string;
      branchName?: string | null;
      mode: 'lite' | 'spec' | 'full';
      message: string;
    }
  | {
      type: 'auto_mode_task_started';
      featureId: string;
      projectPath?: string;
      taskId: string;
      taskDescription: string;
      taskIndex: number;
      tasksTotal: number;
    }
  | {
      type: 'auto_mode_task_complete';
      featureId: string;
      projectPath?: string;
      taskId: string;
      tasksCompleted: number;
      tasksTotal: number;
    }
  | {
      type: 'auto_mode_phase_complete';
      featureId: string;
      projectPath?: string;
      phaseNumber: number;
    }
  | {
      type: 'auto_mode_resuming_features';
      message: string;
      projectPath?: string;
      featureIds: string[];
      features: Array<{
        id: string;
        title?: string;
        status?: string;
      }>;
    };

export type SpecRegenerationEvent =
  | {
      type: 'spec_regeneration_progress';
      content: string;
      projectPath: string;
    }
  | {
      type: 'spec_regeneration_tool';
      tool: string;
      input: unknown;
      projectPath: string;
    }
  | {
      type: 'spec_regeneration_complete';
      message: string;
      projectPath: string;
    }
  | {
      type: 'spec_regeneration_error';
      error: string;
      projectPath: string;
    };

export interface SpecRegenerationAPI {
  create: (
    projectPath: string,
    projectOverview: string,
    generateFeatures?: boolean,
    analyzeProject?: boolean,
    maxFeatures?: number
  ) => Promise<{
    success: boolean;
    error?: string;
  }>;

  generate: (
    projectPath: string,
    projectDefinition: string,
    generateFeatures?: boolean,
    analyzeProject?: boolean,
    maxFeatures?: number
  ) => Promise<{
    success: boolean;
    error?: string;
  }>;

  generateFeatures: (
    projectPath: string,
    maxFeatures?: number
  ) => Promise<{
    success: boolean;
    error?: string;
  }>;

  sync: (projectPath: string) => Promise<{
    success: boolean;
    error?: string;
  }>;

  stop: (projectPath?: string) => Promise<{
    success: boolean;
    error?: string;
  }>;

  status: (projectPath?: string) => Promise<{
    success: boolean;
    isRunning?: boolean;
    currentPhase?: string;
    projectPath?: string;
    error?: string;
  }>;

  onEvent: (callback: (event: SpecRegenerationEvent) => void) => () => void;
}

export interface AutoModeAPI {
  start: (
    projectPath: string,
    branchName?: string | null,
    maxConcurrency?: number
  ) => Promise<{
    success: boolean;
    message?: string;
    alreadyRunning?: boolean;
    branchName?: string | null;
    error?: string;
  }>;

  stop: (
    projectPath: string,
    branchName?: string | null
  ) => Promise<{
    success: boolean;
    message?: string;
    wasRunning?: boolean;
    runningFeaturesCount?: number;
    branchName?: string | null;
    error?: string;
  }>;

  stopFeature: (featureId: string) => Promise<{
    success: boolean;
    error?: string;
  }>;

  status: (
    projectPath?: string,
    branchName?: string | null
  ) => Promise<{
    success: boolean;
    isRunning?: boolean;
    isAutoLoopRunning?: boolean;
    currentFeatureId?: string | null;
    runningFeatures?: string[];
    runningProjects?: string[];
    runningCount?: number;
    maxConcurrency?: number;
    branchName?: string | null;
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
    featureId: string,
    useWorktrees?: boolean
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
    imagePaths?: string[],
    useWorktrees?: boolean
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

  approvePlan: (
    projectPath: string,
    featureId: string,
    approved: boolean,
    editedPlan?: string,
    feedback?: string
  ) => Promise<{
    success: boolean;
    error?: string;
  }>;

  onEvent: (callback: (event: AutoModeEvent) => void) => () => void;
}

export interface ElectronAPI {
  // Platform info (exposed from preload)
  platform?: 'darwin' | 'win32' | 'linux';
  isElectron?: boolean;

  ping: () => Promise<string>;
  getApiKey?: () => Promise<string | null>;
  quit?: () => Promise<void>;
  openExternalLink: (url: string) => Promise<{ success: boolean; error?: string }>;

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

  // Claude Usage API
  claude: {
    getUsage: () => Promise<ClaudeUsageResponse>;
  };

  // Codex Usage API
  codex: {
    getUsage: () => Promise<CodexUsageResponse>;
  };

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
  // Merge worktree branch into a target branch (defaults to 'main') and optionally clean up
  mergeFeature: (
    projectPath: string,
    branchName: string,
    worktreePath: string,
    targetBranch?: string,
    options?: {
      squash?: boolean;
      message?: string;
      deleteWorktreeAndBranch?: boolean;
    }
  ) => Promise<{
    success: boolean;
    mergedBranch?: string;
    targetBranch?: string;
    deleted?: {
      worktreeDeleted: boolean;
      branchDeleted: boolean;
    };
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
  getStatus: (projectPath: string, featureId: string) => Promise<WorktreeStatus>;

  // List all feature worktrees
  list: (projectPath: string) => Promise<{
    success: boolean;
    worktrees?: WorktreeInfo[];
    error?: string;
  }>;

  // List all worktrees with details (for worktree selector)
  listAll: (
    projectPath: string,
    includeDetails?: boolean,
    forceRefreshGitHub?: boolean
  ) => Promise<{
    success: boolean;
    worktrees?: Array<{
      path: string;
      branch: string;
      isMain: boolean;
      isCurrent: boolean; // Is this the currently checked out branch?
      hasWorktree: boolean; // Does this branch have an active worktree?
      hasChanges?: boolean;
      changedFilesCount?: number;
      pr?: {
        number: number;
        url: string;
        title: string;
        state: string;
        createdAt: string;
      };
    }>;
    removedWorktrees?: Array<{
      path: string;
      branch: string;
    }>;
    error?: string;
  }>;

  // Create a new worktree
  create: (
    projectPath: string,
    branchName: string,
    baseBranch?: string
  ) => Promise<{
    success: boolean;
    worktree?: {
      path: string;
      branch: string;
      isNew: boolean;
    };
    error?: string;
  }>;

  // Delete a worktree
  delete: (
    projectPath: string,
    worktreePath: string,
    deleteBranch?: boolean
  ) => Promise<{
    success: boolean;
    deleted?: {
      worktreePath: string;
      branch: string | null;
    };
    error?: string;
  }>;

  // Commit changes in a worktree
  commit: (
    worktreePath: string,
    message: string
  ) => Promise<{
    success: boolean;
    result?: {
      committed: boolean;
      commitHash?: string;
      branch?: string;
      message?: string;
    };
    error?: string;
  }>;

  // Generate an AI commit message from git diff
  generateCommitMessage: (worktreePath: string) => Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }>;

  // Push a worktree branch to remote
  push: (
    worktreePath: string,
    force?: boolean,
    remote?: string
  ) => Promise<{
    success: boolean;
    result?: {
      branch: string;
      pushed: boolean;
      message: string;
    };
    error?: string;
    code?: 'NOT_GIT_REPO' | 'NO_COMMITS';
  }>;

  // Create a pull request from a worktree
  createPR: (
    worktreePath: string,
    options?: {
      projectPath?: string;
      commitMessage?: string;
      prTitle?: string;
      prBody?: string;
      baseBranch?: string;
      draft?: boolean;
    }
  ) => Promise<{
    success: boolean;
    result?: {
      branch: string;
      committed: boolean;
      commitHash?: string;
      pushed: boolean;
      prUrl?: string;
      prNumber?: number;
      prCreated: boolean;
      prAlreadyExisted?: boolean;
      prError?: string;
      browserUrl?: string;
      ghCliAvailable?: boolean;
    };
    error?: string;
  }>;

  // Get file diffs for a feature worktree
  getDiffs: (projectPath: string, featureId: string) => Promise<FileDiffsResult>;

  // Get diff for a specific file in a worktree
  getFileDiff: (
    projectPath: string,
    featureId: string,
    filePath: string
  ) => Promise<FileDiffResult>;

  // Pull latest changes from remote
  pull: (worktreePath: string) => Promise<{
    success: boolean;
    result?: {
      branch: string;
      pulled: boolean;
      message: string;
    };
    error?: string;
    code?: 'NOT_GIT_REPO' | 'NO_COMMITS';
  }>;

  // Create and checkout a new branch
  checkoutBranch: (
    worktreePath: string,
    branchName: string
  ) => Promise<{
    success: boolean;
    result?: {
      previousBranch: string;
      newBranch: string;
      message: string;
    };
    error?: string;
    code?: 'NOT_GIT_REPO' | 'NO_COMMITS';
  }>;

  // List branches (local and optionally remote)
  listBranches: (
    worktreePath: string,
    includeRemote?: boolean
  ) => Promise<{
    success: boolean;
    result?: {
      currentBranch: string;
      branches: Array<{
        name: string;
        isCurrent: boolean;
        isRemote: boolean;
      }>;
      aheadCount: number;
      behindCount: number;
      hasRemoteBranch: boolean;
    };
    error?: string;
    code?: 'NOT_GIT_REPO' | 'NO_COMMITS'; // Error codes for git status issues
  }>;

  // Switch to an existing branch
  switchBranch: (
    worktreePath: string,
    branchName: string
  ) => Promise<{
    success: boolean;
    result?: {
      previousBranch: string;
      currentBranch: string;
      message: string;
    };
    error?: string;
    code?: 'NOT_GIT_REPO' | 'NO_COMMITS' | 'UNCOMMITTED_CHANGES';
  }>;

  // List all remotes and their branches
  listRemotes: (worktreePath: string) => Promise<{
    success: boolean;
    result?: {
      remotes: Array<{
        name: string;
        url: string;
        branches: Array<{
          name: string;
          fullRef: string;
        }>;
      }>;
    };
    error?: string;
    code?: 'NOT_GIT_REPO' | 'NO_COMMITS';
  }>;

  // Open a worktree directory in the editor
  openInEditor: (
    worktreePath: string,
    editorCommand?: string
  ) => Promise<{
    success: boolean;
    result?: {
      message: string;
      editorName?: string;
    };
    error?: string;
  }>;

  // Get the default code editor name
  getDefaultEditor: () => Promise<{
    success: boolean;
    result?: {
      editorName: string;
      editorCommand: string;
    };
    error?: string;
  }>;

  // Get all available code editors
  getAvailableEditors: () => Promise<{
    success: boolean;
    result?: {
      editors: Array<{
        name: string;
        command: string;
      }>;
    };
    error?: string;
  }>;

  // Refresh editor cache and re-detect available editors
  refreshEditors: () => Promise<{
    success: boolean;
    result?: {
      editors: Array<{
        name: string;
        command: string;
      }>;
      message: string;
    };
    error?: string;
  }>;

  // Get available external terminals
  getAvailableTerminals: () => Promise<{
    success: boolean;
    result?: {
      terminals: Array<{
        id: string;
        name: string;
        command: string;
      }>;
    };
    error?: string;
  }>;

  // Get default external terminal
  getDefaultTerminal: () => Promise<{
    success: boolean;
    result?: {
      terminalId: string;
      terminalName: string;
      terminalCommand: string;
    } | null;
    error?: string;
  }>;

  // Refresh terminal cache and re-detect available terminals
  refreshTerminals: () => Promise<{
    success: boolean;
    result?: {
      terminals: Array<{
        id: string;
        name: string;
        command: string;
      }>;
      message: string;
    };
    error?: string;
  }>;

  // Open worktree in an external terminal
  openInExternalTerminal: (
    worktreePath: string,
    terminalId?: string
  ) => Promise<{
    success: boolean;
    result?: {
      message: string;
      terminalName: string;
    };
    error?: string;
  }>;

  // Initialize git repository in a project
  initGit: (projectPath: string) => Promise<{
    success: boolean;
    result?: {
      initialized: boolean;
      message: string;
    };
    error?: string;
  }>;

  // Start a dev server for a worktree
  startDevServer: (
    projectPath: string,
    worktreePath: string
  ) => Promise<{
    success: boolean;
    result?: {
      worktreePath: string;
      port: number;
      url: string;
      message: string;
    };
    error?: string;
  }>;

  // Stop a dev server for a worktree
  stopDevServer: (worktreePath: string) => Promise<{
    success: boolean;
    result?: {
      worktreePath: string;
      message: string;
    };
    error?: string;
  }>;

  // List all running dev servers
  listDevServers: () => Promise<{
    success: boolean;
    result?: {
      servers: Array<{
        worktreePath: string;
        port: number;
        url: string;
      }>;
    };
    error?: string;
  }>;

  // Get buffered logs for a dev server
  getDevServerLogs: (worktreePath: string) => Promise<{
    success: boolean;
    result?: {
      worktreePath: string;
      port: number;
      url: string;
      logs: string;
      startedAt: string;
    };
    error?: string;
  }>;

  // Subscribe to dev server log events (started, output, stopped)
  onDevServerLogEvent: (
    callback: (
      event:
        | {
            type: 'dev-server:started';
            payload: { worktreePath: string; port: number; url: string; timestamp: string };
          }
        | {
            type: 'dev-server:output';
            payload: { worktreePath: string; content: string; timestamp: string };
          }
        | {
            type: 'dev-server:stopped';
            payload: {
              worktreePath: string;
              port: number;
              exitCode: number | null;
              error?: string;
              timestamp: string;
            };
          }
    ) => void
  ) => () => void;

  // Get PR info and comments for a branch
  getPRInfo: (
    worktreePath: string,
    branchName: string
  ) => Promise<{
    success: boolean;
    result?: {
      hasPR: boolean;
      ghCliAvailable: boolean;
      prInfo?: {
        number: number;
        title: string;
        url: string;
        state: string;
        author: string;
        body: string;
        comments: Array<{
          id: number;
          author: string;
          body: string;
          createdAt: string;
          isReviewComment: boolean;
        }>;
        reviewComments: Array<{
          id: number;
          author: string;
          body: string;
          path?: string;
          line?: number;
          createdAt: string;
          isReviewComment: boolean;
        }>;
      };
      error?: string;
    };
    error?: string;
  }>;

  // Get init script content for a project
  getInitScript: (projectPath: string) => Promise<{
    success: boolean;
    exists: boolean;
    content: string;
    path: string;
    error?: string;
  }>;

  // Set init script content for a project
  setInitScript: (
    projectPath: string,
    content: string
  ) => Promise<{
    success: boolean;
    path?: string;
    error?: string;
  }>;

  // Delete init script for a project
  deleteInitScript: (projectPath: string) => Promise<{
    success: boolean;
    error?: string;
  }>;

  // Run (or re-run) init script for a worktree
  runInitScript: (
    projectPath: string,
    worktreePath: string,
    branch: string
  ) => Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }>;

  // Subscribe to init script events
  onInitScriptEvent: (
    callback: (event: {
      type: 'worktree:init-started' | 'worktree:init-output' | 'worktree:init-completed';
      payload: unknown;
    }) => void
  ) => () => void;

  // Discard changes for a worktree
  discardChanges: (worktreePath: string) => Promise<{
    success: boolean;
    result?: {
      discarded: boolean;
      filesDiscarded: number;
      filesRemaining: number;
      branch: string;
      message: string;
    };
    error?: string;
  }>;
}

export interface GitAPI {
  // Get diffs for the main project (not a worktree)
  getDiffs: (projectPath: string) => Promise<FileDiffsResult>;

  // Get diff for a specific file in the main project
  getFileDiff: (projectPath: string, filePath: string) => Promise<FileDiffResult>;
}

// Model definition type
export interface ModelDefinition {
  id: string;
  name: string;
  modelString: string;
  provider: 'claude';
  description?: string;
  tier?: 'basic' | 'standard' | 'premium';
  default?: boolean;
}

// Provider status type
export interface ProviderStatus {
  status: 'installed' | 'not_installed' | 'api_key_only';
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
