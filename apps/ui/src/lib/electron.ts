// Type definitions for Electron IPC API
import type { SessionListItem, Message } from '@/types/electron';
import type {
  ClaudeUsageResponse,
  CodexUsageResponse,
  ZaiUsageResponse,
  GeminiUsageResponse,
} from '@/store/app-store';
import type {
  IssueValidationVerdict,
  IssueValidationConfidence,
  IssueComplexity,
  IssueValidationInput,
  IssueValidationResult,
  IssueValidationResponse,
  IssueValidationEvent,
  StoredValidation,
  ModelId,
  ThinkingLevel,
  ReasoningEffort,
  GitHubComment,
  IssueCommentsResult,
  Idea,
  IdeaCategory,
  IdeationSession,
  IdeationMessage,
  IdeationPrompt,
  PromptCategory,
  ProjectAnalysisResult,
  AnalysisSuggestion,
  StartSessionOptions,
  CreateIdeaInput,
  UpdateIdeaInput,
  ConvertToFeatureOptions,
  IdeationContextSources,
  Feature,
  IdeationStreamEvent,
  IdeationAnalysisEvent,
} from '@automaker/types';
import { DEFAULT_MAX_CONCURRENCY } from '@automaker/types';
import { getJSON, setJSON, removeItem } from './storage';

// Re-export issue validation types for use in components
export type {
  IssueValidationVerdict,
  IssueValidationConfidence,
  IssueComplexity,
  IssueValidationInput,
  IssueValidationResult,
  IssueValidationResponse,
  IssueValidationEvent,
  StoredValidation,
  GitHubComment,
  IssueCommentsResult,
};

// Re-export ideation types
export type {
  Idea,
  IdeaCategory,
  IdeationSession,
  IdeationMessage,
  IdeationPrompt,
  PromptCategory,
  ProjectAnalysisResult,
  AnalysisSuggestion,
  StartSessionOptions,
  CreateIdeaInput,
  UpdateIdeaInput,
  ConvertToFeatureOptions,
};

// Ideation API interface
export interface IdeationAPI {
  // Session management
  startSession: (
    projectPath: string,
    options?: StartSessionOptions
  ) => Promise<{ success: boolean; session?: IdeationSession; error?: string }>;
  getSession: (
    projectPath: string,
    sessionId: string
  ) => Promise<{
    success: boolean;
    session?: IdeationSession;
    messages?: IdeationMessage[];
    error?: string;
  }>;
  sendMessage: (
    sessionId: string,
    message: string,
    options?: { imagePaths?: string[]; model?: string }
  ) => Promise<{ success: boolean; error?: string }>;
  stopSession: (sessionId: string) => Promise<{ success: boolean; error?: string }>;

  // Ideas CRUD
  listIdeas: (projectPath: string) => Promise<{ success: boolean; ideas?: Idea[]; error?: string }>;
  createIdea: (
    projectPath: string,
    idea: CreateIdeaInput
  ) => Promise<{ success: boolean; idea?: Idea; error?: string }>;
  getIdea: (
    projectPath: string,
    ideaId: string
  ) => Promise<{ success: boolean; idea?: Idea; error?: string }>;
  updateIdea: (
    projectPath: string,
    ideaId: string,
    updates: UpdateIdeaInput
  ) => Promise<{ success: boolean; idea?: Idea; error?: string }>;
  deleteIdea: (
    projectPath: string,
    ideaId: string
  ) => Promise<{ success: boolean; error?: string }>;

  // Project analysis
  analyzeProject: (
    projectPath: string
  ) => Promise<{ success: boolean; analysis?: ProjectAnalysisResult; error?: string }>;

  // Generate suggestions from a prompt
  generateSuggestions: (
    projectPath: string,
    promptId: string,
    category: IdeaCategory,
    count?: number,
    contextSources?: IdeationContextSources
  ) => Promise<{ success: boolean; suggestions?: AnalysisSuggestion[]; error?: string }>;

  // Convert to feature
  convertToFeature: (
    projectPath: string,
    ideaId: string,
    options?: ConvertToFeatureOptions
  ) => Promise<{ success: boolean; feature?: Feature; featureId?: string; error?: string }>;

  // Add suggestion directly to board as feature
  addSuggestionToBoard: (
    projectPath: string,
    suggestion: AnalysisSuggestion
  ) => Promise<{ success: boolean; featureId?: string; error?: string }>;

  // Get guided prompts (single source of truth from backend)
  getPrompts: () => Promise<{
    success: boolean;
    prompts?: IdeationPrompt[];
    categories?: PromptCategory[];
    error?: string;
  }>;

  // Event subscriptions
  onStream: (callback: (event: IdeationStreamEvent) => void) => () => void;
  onAnalysisEvent: (callback: (event: IdeationAnalysisEvent) => void) => () => void;
}

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

// Options for creating a pull request
export interface CreatePROptions {
  projectPath?: string;
  commitMessage?: string;
  prTitle?: string;
  prBody?: string;
  baseBranch?: string;
  draft?: boolean;
  remote?: string;
  /** Remote to create the PR against (e.g. upstream). If not specified, inferred from repo setup. */
  targetRemote?: string;
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
} from '@/types/electron';

// Import types for internal use in this file
import type {
  AutoModeEvent,
  WorktreeAPI,
  GitAPI,
  ModelDefinition,
  ProviderStatus,
} from '@/types/electron';

// Import HTTP API client (ES module)
import { getHttpApiClient, getServerUrlSync } from './http-api-client';

// Running Agent type
export interface RunningAgent {
  featureId: string;
  projectPath: string;
  projectName: string;
  isAutoMode: boolean;
  title?: string;
  description?: string;
  branchName?: string;
}

export interface RunningAgentsResult {
  success: boolean;
  runningAgents?: RunningAgent[];
  totalCount?: number;
  error?: string;
}

export interface RunningAgentsAPI {
  getAll: () => Promise<RunningAgentsResult>;
}

// GitHub types
export interface GitHubLabel {
  name: string;
  color: string;
}

export interface GitHubAuthor {
  login: string;
  avatarUrl?: string;
}

export interface GitHubAssignee {
  login: string;
  avatarUrl?: string;
}

export interface LinkedPullRequest {
  number: number;
  title: string;
  state: string;
  url: string;
}

export interface GitHubIssue {
  number: number;
  title: string;
  state: string;
  author: GitHubAuthor;
  createdAt: string;
  labels: GitHubLabel[];
  url: string;
  body: string;
  assignees: GitHubAssignee[];
  linkedPRs?: LinkedPullRequest[];
}

export interface GitHubPR {
  number: number;
  title: string;
  state: string;
  author: GitHubAuthor;
  createdAt: string;
  labels: GitHubLabel[];
  url: string;
  isDraft: boolean;
  headRefName: string;
  reviewDecision: string | null;
  mergeable: string;
  body: string;
}

export interface GitHubRemoteStatus {
  hasGitHubRemote: boolean;
  remoteUrl: string | null;
  owner: string | null;
  repo: string | null;
}

export interface GitHubAPI {
  checkRemote: (projectPath: string) => Promise<{
    success: boolean;
    hasGitHubRemote?: boolean;
    remoteUrl?: string | null;
    owner?: string | null;
    repo?: string | null;
    error?: string;
  }>;
  listIssues: (projectPath: string) => Promise<{
    success: boolean;
    openIssues?: GitHubIssue[];
    closedIssues?: GitHubIssue[];
    error?: string;
  }>;
  listPRs: (projectPath: string) => Promise<{
    success: boolean;
    openPRs?: GitHubPR[];
    mergedPRs?: GitHubPR[];
    error?: string;
  }>;
  /** Start async validation of a GitHub issue */
  validateIssue: (
    projectPath: string,
    issue: IssueValidationInput,
    model?: ModelId,
    thinkingLevel?: ThinkingLevel,
    reasoningEffort?: ReasoningEffort
  ) => Promise<{ success: boolean; message?: string; issueNumber?: number; error?: string }>;
  /** Check validation status for an issue or all issues */
  getValidationStatus: (
    projectPath: string,
    issueNumber?: number
  ) => Promise<{
    success: boolean;
    isRunning?: boolean;
    startedAt?: string;
    runningIssues?: number[];
    error?: string;
  }>;
  /** Stop a running validation */
  stopValidation: (
    projectPath: string,
    issueNumber: number
  ) => Promise<{ success: boolean; message?: string; error?: string }>;
  /** Get stored validations for a project */
  getValidations: (
    projectPath: string,
    issueNumber?: number
  ) => Promise<{
    success: boolean;
    validation?: StoredValidation | null;
    validations?: StoredValidation[];
    isStale?: boolean;
    error?: string;
  }>;
  /** Mark a validation as viewed by the user */
  markValidationViewed: (
    projectPath: string,
    issueNumber: number
  ) => Promise<{ success: boolean; error?: string }>;
  /** Subscribe to validation events */
  onValidationEvent: (callback: (event: IssueValidationEvent) => void) => () => void;
  /** Fetch comments for a specific issue */
  getIssueComments: (
    projectPath: string,
    issueNumber: number,
    cursor?: string
  ) => Promise<{
    success: boolean;
    comments?: GitHubComment[];
    totalCount?: number;
    hasNextPage?: boolean;
    endCursor?: string;
    error?: string;
  }>;
}

// Spec Regeneration types
export type SpecRegenerationEvent =
  | { type: 'spec_regeneration_progress'; content: string; projectPath: string }
  | {
      type: 'spec_regeneration_tool';
      tool: string;
      input: unknown;
      projectPath: string;
    }
  | { type: 'spec_regeneration_complete'; message: string; projectPath: string }
  | { type: 'spec_regeneration_error'; error: string; projectPath: string };

export interface SpecRegenerationAPI {
  create: (
    projectPath: string,
    projectOverview: string,
    generateFeatures?: boolean,
    analyzeProject?: boolean,
    maxFeatures?: number
  ) => Promise<{ success: boolean; error?: string }>;
  generate: (
    projectPath: string,
    projectDefinition: string,
    generateFeatures?: boolean,
    analyzeProject?: boolean,
    maxFeatures?: number
  ) => Promise<{ success: boolean; error?: string }>;
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
  stop: (projectPath?: string) => Promise<{ success: boolean; error?: string }>;
  status: (projectPath?: string) => Promise<{
    success: boolean;
    isRunning?: boolean;
    currentPhase?: string;
    projectPath?: string;
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
    updates: Partial<Feature>,
    descriptionHistorySource?: 'enhance' | 'edit',
    enhancementMode?: 'improve' | 'technical' | 'simplify' | 'acceptance' | 'ux-reviewer',
    preEnhancementDescription?: string
  ) => Promise<{ success: boolean; feature?: Feature; error?: string }>;
  delete: (projectPath: string, featureId: string) => Promise<{ success: boolean; error?: string }>;
  getAgentOutput: (
    projectPath: string,
    featureId: string
  ) => Promise<{ success: boolean; content?: string | null; error?: string }>;
  generateTitle: (
    description: string,
    projectPath?: string
  ) => Promise<{ success: boolean; title?: string; error?: string }>;
}

export interface AutoModeAPI {
  start: (
    projectPath: string,
    branchName?: string | null,
    maxConcurrency?: number
  ) => Promise<{ success: boolean; error?: string }>;
  stop: (
    projectPath: string,
    branchName?: string | null
  ) => Promise<{ success: boolean; error?: string; runningFeatures?: number }>;
  stopFeature: (featureId: string) => Promise<{ success: boolean; error?: string }>;
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
    error?: string;
  }>;
  runFeature: (
    projectPath: string,
    featureId: string,
    useWorktrees?: boolean,
    worktreePath?: string
  ) => Promise<{ success: boolean; passes?: boolean; error?: string }>;
  verifyFeature: (
    projectPath: string,
    featureId: string
  ) => Promise<{ success: boolean; passes?: boolean; error?: string }>;
  resumeFeature: (
    projectPath: string,
    featureId: string,
    useWorktrees?: boolean
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
    imagePaths?: string[],
    useWorktrees?: boolean
  ) => Promise<{ success: boolean; passes?: boolean; error?: string }>;
  commitFeature: (
    projectPath: string,
    featureId: string,
    worktreePath?: string
  ) => Promise<{ success: boolean; error?: string }>;
  approvePlan: (
    projectPath: string,
    featureId: string,
    approved: boolean,
    editedPlan?: string,
    feedback?: string
  ) => Promise<{ success: boolean; error?: string }>;
  resumeInterrupted: (
    projectPath: string
  ) => Promise<{ success: boolean; message?: string; error?: string }>;
  onEvent: (callback: (event: AutoModeEvent) => void) => () => void;
}

export interface SaveImageResult {
  success: boolean;
  path?: string;
  error?: string;
}

// Notifications API interface
import type {
  Notification,
  StoredEvent,
  StoredEventSummary,
  EventHistoryFilter,
  EventReplayResult,
} from '@automaker/types';

export interface NotificationsAPI {
  list: (projectPath: string) => Promise<{
    success: boolean;
    notifications?: Notification[];
    error?: string;
  }>;
  getUnreadCount: (projectPath: string) => Promise<{
    success: boolean;
    count?: number;
    error?: string;
  }>;
  markAsRead: (
    projectPath: string,
    notificationId?: string
  ) => Promise<{
    success: boolean;
    notification?: Notification;
    count?: number;
    error?: string;
  }>;
  dismiss: (
    projectPath: string,
    notificationId?: string
  ) => Promise<{
    success: boolean;
    dismissed?: boolean;
    count?: number;
    error?: string;
  }>;
}

// Event History API interface
export interface EventHistoryAPI {
  list: (
    projectPath: string,
    filter?: EventHistoryFilter
  ) => Promise<{
    success: boolean;
    events?: StoredEventSummary[];
    total?: number;
    error?: string;
  }>;
  get: (
    projectPath: string,
    eventId: string
  ) => Promise<{
    success: boolean;
    event?: StoredEvent;
    error?: string;
  }>;
  delete: (
    projectPath: string,
    eventId: string
  ) => Promise<{
    success: boolean;
    error?: string;
  }>;
  clear: (projectPath: string) => Promise<{
    success: boolean;
    cleared?: number;
    error?: string;
  }>;
  replay: (
    projectPath: string,
    eventId: string,
    hookIds?: string[]
  ) => Promise<{
    success: boolean;
    result?: EventReplayResult;
    error?: string;
  }>;
}

export interface ElectronAPI {
  ping: () => Promise<string>;
  getApiKey?: () => Promise<string | null>;
  quit?: () => Promise<void>;
  openExternalLink: (url: string) => Promise<{ success: boolean; error?: string }>;
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
  openInEditor?: (
    filePath: string,
    line?: number,
    column?: number
  ) => Promise<{ success: boolean; error?: string }>;
  saveImageToTemp?: (
    data: string,
    filename: string,
    mimeType: string,
    projectPath?: string
  ) => Promise<SaveImageResult>;
  isElectron?: boolean;
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
  worktree?: WorktreeAPI;
  git?: GitAPI;
  specRegeneration?: SpecRegenerationAPI;
  autoMode?: AutoModeAPI;
  features?: FeaturesAPI;
  runningAgents?: RunningAgentsAPI;
  github?: GitHubAPI;
  enhancePrompt?: {
    enhance: (
      originalText: string,
      enhancementMode: string,
      model?: string,
      thinkingLevel?: string,
      projectPath?: string
    ) => Promise<{
      success: boolean;
      enhancedText?: string;
      error?: string;
    }>;
  };
  templates?: {
    clone: (
      repoUrl: string,
      projectName: string,
      parentDir: string
    ) => Promise<{ success: boolean; projectPath?: string; error?: string }>;
  };
  backlogPlan?: {
    generate: (
      projectPath: string,
      prompt: string,
      model?: string
    ) => Promise<{ success: boolean; error?: string }>;
    stop: () => Promise<{ success: boolean; error?: string }>;
    status: (projectPath: string) => Promise<{
      success: boolean;
      isRunning?: boolean;
      savedPlan?: {
        savedAt: string;
        prompt: string;
        model?: string;
        result: {
          changes: Array<{
            type: 'add' | 'update' | 'delete';
            featureId?: string;
            feature?: Record<string, unknown>;
            reason: string;
          }>;
          summary: string;
          dependencyUpdates: Array<{
            featureId: string;
            removedDependencies: string[];
            addedDependencies: string[];
          }>;
        };
      } | null;
      error?: string;
    }>;
    apply: (
      projectPath: string,
      plan: {
        changes: Array<{
          type: 'add' | 'update' | 'delete';
          featureId?: string;
          feature?: Record<string, unknown>;
          reason: string;
        }>;
        summary: string;
        dependencyUpdates: Array<{
          featureId: string;
          removedDependencies: string[];
          addedDependencies: string[];
        }>;
      },
      branchName?: string
    ) => Promise<{ success: boolean; appliedChanges?: string[]; error?: string }>;
    clear: (projectPath: string) => Promise<{ success: boolean; error?: string }>;
    onEvent: (callback: (data: unknown) => void) => () => void;
  };
  // Setup API surface is implemented by the main process and mirrored by HttpApiClient.
  // Keep this intentionally loose to avoid tight coupling between front-end and server types.
  setup?: SetupAPI;
  agent?: {
    start: (
      sessionId: string,
      workingDirectory?: string
    ) => Promise<{
      success: boolean;
      messages?: Message[];
      error?: string;
    }>;
    send: (
      sessionId: string,
      message: string,
      workingDirectory?: string,
      imagePaths?: string[],
      model?: string
    ) => Promise<{ success: boolean; error?: string }>;
    getHistory: (sessionId: string) => Promise<{
      success: boolean;
      messages?: Message[];
      isRunning?: boolean;
      error?: string;
    }>;
    stop: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
    clear: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
    queueList: (sessionId: string) => Promise<{
      success: boolean;
      queue?: Array<{
        id: string;
        message: string;
        imagePaths?: string[];
        model?: string;
        thinkingLevel?: string;
        addedAt: string;
      }>;
      error?: string;
    }>;
    onStream: (callback: (data: unknown) => void) => () => void;
  };
  sessions?: {
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
      session?: {
        id: string;
        name: string;
        projectPath: string;
        workingDirectory?: string;
        createdAt: string;
        updatedAt: string;
      };
      error?: string;
    }>;
    update: (
      sessionId: string,
      name?: string,
      tags?: string[]
    ) => Promise<{ success: boolean; error?: string }>;
    archive: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
    unarchive: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
    delete: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
  };
  claude?: {
    getUsage: () => Promise<ClaudeUsageResponse>;
  };
  context?: {
    describeImage: (imagePath: string) => Promise<{
      success: boolean;
      description?: string;
      error?: string;
    }>;
    describeFile: (filePath: string) => Promise<{
      success: boolean;
      description?: string;
      error?: string;
    }>;
  };
  ideation?: IdeationAPI;
  notifications?: NotificationsAPI;
  eventHistory?: EventHistoryAPI;
  codex?: {
    getUsage: () => Promise<CodexUsageResponse>;
    getModels: (refresh?: boolean) => Promise<{
      success: boolean;
      models?: Array<{
        id: string;
        label: string;
        description: string;
        hasThinking: boolean;
        supportsVision: boolean;
        tier: 'premium' | 'standard' | 'basic';
        isDefault: boolean;
      }>;
      cachedAt?: number;
      error?: string;
    }>;
  };
  zai?: {
    getUsage: () => Promise<ZaiUsageResponse>;
    verify: (apiKey: string) => Promise<{
      success: boolean;
      authenticated: boolean;
      message?: string;
      error?: string;
    }>;
  };
  gemini?: {
    getUsage: () => Promise<GeminiUsageResponse>;
  };
  settings?: {
    getStatus: () => Promise<{
      success: boolean;
      hasGlobalSettings: boolean;
      hasCredentials: boolean;
      dataDir: string;
      needsMigration: boolean;
    }>;
    getGlobal: () => Promise<{
      success: boolean;
      settings?: Record<string, unknown>;
      error?: string;
    }>;
    updateGlobal: (updates: Record<string, unknown>) => Promise<{
      success: boolean;
      settings?: Record<string, unknown>;
      error?: string;
    }>;
    getCredentials: () => Promise<{
      success: boolean;
      credentials?: {
        anthropic: { configured: boolean; masked: string };
        google: { configured: boolean; masked: string };
        openai: { configured: boolean; masked: string };
      };
      error?: string;
    }>;
    updateCredentials: (updates: {
      apiKeys?: { anthropic?: string; google?: string; openai?: string };
    }) => Promise<{
      success: boolean;
      credentials?: {
        anthropic: { configured: boolean; masked: string };
        google: { configured: boolean; masked: string };
        openai: { configured: boolean; masked: string };
      };
      error?: string;
    }>;
    getProject: (projectPath: string) => Promise<{
      success: boolean;
      settings?: Record<string, unknown>;
      error?: string;
    }>;
    updateProject: (
      projectPath: string,
      updates: Record<string, unknown>
    ) => Promise<{
      success: boolean;
      settings?: Record<string, unknown>;
      error?: string;
    }>;
    migrate: (data: Record<string, string>) => Promise<{
      success: boolean;
      migratedGlobalSettings: boolean;
      migratedCredentials: boolean;
      migratedProjectCount: number;
      errors: string[];
    }>;
    discoverAgents: (
      projectPath?: string,
      sources?: Array<'user' | 'project'>
    ) => Promise<{
      success: boolean;
      agents?: Array<{
        name: string;
        definition: {
          description: string;
          prompt: string;
          tools?: string[];
          model?: 'sonnet' | 'opus' | 'haiku' | 'inherit';
        };
        source: 'user' | 'project';
        filePath: string;
      }>;
      error?: string;
    }>;
  };
}

// Note: Window interface is declared in @/types/electron.d.ts
// Do not redeclare here to avoid type conflicts

// Mock data for web development
const mockFeatures: Feature[] = [
  {
    id: 'mock-feature-1',
    title: 'Sample Feature',
    category: 'Core',
    description: 'Sample Feature',
    status: 'backlog',
    steps: ['Step 1', 'Step 2'],
    passes: false,
    createdAt: new Date().toISOString(),
  },
];

// Local storage keys
const STORAGE_KEYS = {
  PROJECTS: 'automaker_projects',
  CURRENT_PROJECT: 'automaker_current_project',
  TRASHED_PROJECTS: 'automaker_trashed_projects',
} as const;

// Mock file system using localStorage
const mockFileSystem: Record<string, string> = {};

// Check if we're in Electron (for UI indicators only)
export const isElectron = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }

  if (window.isElectron === true) {
    return true;
  }

  return !!window.electronAPI?.isElectron;
};

// Check if backend server is available
let serverAvailable: boolean | null = null;
let serverCheckPromise: Promise<boolean> | null = null;

export const checkServerAvailable = async (): Promise<boolean> => {
  if (serverAvailable !== null) return serverAvailable;
  if (serverCheckPromise) return serverCheckPromise;

  serverCheckPromise = (async () => {
    try {
      const serverUrl = import.meta.env.VITE_SERVER_URL || getServerUrlSync();
      const response = await fetch(`${serverUrl}/api/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000),
      });
      serverAvailable = response.ok;
    } catch {
      serverAvailable = false;
    }
    return serverAvailable;
  })();

  return serverCheckPromise;
};

// Reset server check (useful for retrying connection)
export const resetServerCheck = (): void => {
  serverAvailable = null;
  serverCheckPromise = null;
};

// Cached HTTP client instance
let httpClientInstance: ElectronAPI | null = null;

/**
 * Get the HTTP API client
 *
 * All API calls go through HTTP to the backend server.
 * This is the only transport mode supported.
 */
export const getElectronAPI = (): ElectronAPI => {
  if (typeof window === 'undefined') {
    throw new Error('Cannot get API during SSR');
  }

  if (!httpClientInstance) {
    httpClientInstance = getHttpApiClient();
  }
  return httpClientInstance!;
};

// Async version (same as sync since HTTP client is synchronously instantiated)
export const getElectronAPIAsync = async (): Promise<ElectronAPI> => {
  return getElectronAPI();
};

// Check if backend is connected (for showing connection status in UI)
export const isBackendConnected = async (): Promise<boolean> => {
  return await checkServerAvailable();
};

/**
 * Get the current API mode being used
 * Always returns "http" since that's the only mode now
 */
export const getCurrentApiMode = (): 'http' => {
  return 'http';
};

// Debug helpers
if (typeof window !== 'undefined') {
  window.__checkApiMode = () => {
    console.log('Current API mode:', getCurrentApiMode());
    console.log('isElectron():', isElectron());
  };
}

// Mock API for development/fallback when no backend is available
const _getMockElectronAPI = (): ElectronAPI => {
  return {
    ping: async () => 'pong (mock)',

    openExternalLink: async (url: string) => {
      // In web mode, open in a new tab
      window.open(url, '_blank', 'noopener,noreferrer');
      return { success: true };
    },

    openDirectory: async () => {
      // In web mode, we'll use a prompt to simulate directory selection
      const path = prompt('Enter project directory path:', '/Users/demo/project');
      return {
        canceled: !path,
        filePaths: path ? [path] : [],
      };
    },

    openFile: async () => {
      const path = prompt('Enter file path:');
      return {
        canceled: !path,
        filePaths: path ? [path] : [],
      };
    },

    readFile: async (filePath: string) => {
      // Check mock file system first
      if (mockFileSystem[filePath] !== undefined) {
        return { success: true, content: mockFileSystem[filePath] };
      }
      // Return mock data based on file type
      // Note: Features are now stored in .automaker/features/{id}/feature.json
      if (filePath.endsWith('categories.json')) {
        // Return empty array for categories when file doesn't exist yet
        return { success: true, content: '[]' };
      }
      if (filePath.endsWith('app_spec.txt')) {
        return {
          success: true,
          content:
            '<project_specification>\n  <project_name>Demo Project</project_name>\n</project_specification>',
        };
      }
      // For any file in mock features directory, check mock file system
      if (filePath.includes('.automaker/features/')) {
        if (mockFileSystem[filePath] !== undefined) {
          return { success: true, content: mockFileSystem[filePath] };
        }
        // Return empty string for agent-output.md if it doesn't exist
        if (filePath.endsWith('/agent-output.md')) {
          return { success: true, content: '' };
        }
      }
      return { success: false, error: 'File not found (mock)' };
    },

    writeFile: async (filePath: string, content: string) => {
      mockFileSystem[filePath] = content;
      return { success: true };
    },

    mkdir: async () => {
      return { success: true };
    },

    readdir: async (dirPath: string) => {
      // Return mock directory structure based on path
      if (dirPath) {
        // Check if this is the context directory - return files from mock file system
        if (dirPath.includes('.automaker/context')) {
          const contextFiles = Object.keys(mockFileSystem)
            .filter((path) => path.startsWith(dirPath) && path !== dirPath)
            .map((path) => {
              const name = path.substring(dirPath.length + 1); // +1 for the trailing slash
              return {
                name,
                isDirectory: false,
                isFile: true,
              };
            })
            .filter((entry) => !entry.name.includes('/')); // Only direct children
          return { success: true, entries: contextFiles };
        }
        // Root level
        if (
          !dirPath.includes('/src') &&
          !dirPath.includes('/tests') &&
          !dirPath.includes('/public') &&
          !dirPath.includes('.automaker')
        ) {
          return {
            success: true,
            entries: [
              { name: 'src', isDirectory: true, isFile: false },
              { name: 'tests', isDirectory: true, isFile: false },
              { name: 'public', isDirectory: true, isFile: false },
              { name: '.automaker', isDirectory: true, isFile: false },
              { name: 'package.json', isDirectory: false, isFile: true },
              { name: 'tsconfig.json', isDirectory: false, isFile: true },
              { name: 'app_spec.txt', isDirectory: false, isFile: true },
              { name: 'features', isDirectory: true, isFile: false },
              { name: 'README.md', isDirectory: false, isFile: true },
            ],
          };
        }
        // src directory
        if (dirPath.endsWith('/src')) {
          return {
            success: true,
            entries: [
              { name: 'components', isDirectory: true, isFile: false },
              { name: 'lib', isDirectory: true, isFile: false },
              { name: 'app', isDirectory: true, isFile: false },
              { name: 'index.ts', isDirectory: false, isFile: true },
              { name: 'utils.ts', isDirectory: false, isFile: true },
            ],
          };
        }
        // src/components directory
        if (dirPath.endsWith('/components')) {
          return {
            success: true,
            entries: [
              { name: 'Button.tsx', isDirectory: false, isFile: true },
              { name: 'Card.tsx', isDirectory: false, isFile: true },
              { name: 'Header.tsx', isDirectory: false, isFile: true },
              { name: 'Footer.tsx', isDirectory: false, isFile: true },
            ],
          };
        }
        // src/lib directory
        if (dirPath.endsWith('/lib')) {
          return {
            success: true,
            entries: [
              { name: 'api.ts', isDirectory: false, isFile: true },
              { name: 'helpers.ts', isDirectory: false, isFile: true },
            ],
          };
        }
        // src/app directory
        if (dirPath.endsWith('/app')) {
          return {
            success: true,
            entries: [
              { name: 'page.tsx', isDirectory: false, isFile: true },
              { name: 'layout.tsx', isDirectory: false, isFile: true },
              { name: 'globals.css', isDirectory: false, isFile: true },
            ],
          };
        }
        // tests directory
        if (dirPath.endsWith('/tests')) {
          return {
            success: true,
            entries: [
              { name: 'unit.test.ts', isDirectory: false, isFile: true },
              { name: 'e2e.spec.ts', isDirectory: false, isFile: true },
            ],
          };
        }
        // public directory
        if (dirPath.endsWith('/public')) {
          return {
            success: true,
            entries: [
              { name: 'favicon.ico', isDirectory: false, isFile: true },
              { name: 'logo.svg', isDirectory: false, isFile: true },
            ],
          };
        }
        // Default empty for other paths
        return { success: true, entries: [] };
      }
      return { success: true, entries: [] };
    },

    exists: async (filePath: string) => {
      // Check if file exists in mock file system (including newly created files)
      if (mockFileSystem[filePath] !== undefined) {
        return true;
      }
      // Note: Features are now stored in .automaker/features/{id}/feature.json
      if (filePath.endsWith('app_spec.txt') && !filePath.includes('.automaker')) {
        return true;
      }
      return false;
    },

    stat: async () => {
      return {
        success: true,
        stats: {
          isDirectory: false,
          isFile: true,
          size: 1024,
          mtime: new Date(),
        },
      };
    },

    deleteFile: async (filePath: string) => {
      delete mockFileSystem[filePath];
      return { success: true };
    },

    trashItem: async () => {
      return { success: true };
    },

    getPath: async (name: string) => {
      if (name === 'userData') {
        return '/mock/userData';
      }
      return `/mock/${name}`;
    },

    // Save image to temp directory
    saveImageToTemp: async (
      data: string,
      filename: string,
      mimeType: string,
      projectPath?: string
    ) => {
      // Generate a mock temp file path - use projectPath if provided
      const timestamp = Date.now();
      const safeName = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
      const tempFilePath = projectPath
        ? `${projectPath}/.automaker/images/${timestamp}_${safeName}`
        : `/tmp/automaker-images/${timestamp}_${safeName}`;

      // Store the image data in mock file system for testing
      mockFileSystem[tempFilePath] = data;

      console.log('[Mock] Saved image to temp:', tempFilePath);
      return { success: true, path: tempFilePath };
    },

    checkClaudeCli: async () => ({
      success: false,
      status: 'not_installed',
      recommendation: 'Claude CLI checks are unavailable in the web preview.',
    }),

    model: {
      getAvailable: async () => ({ success: true, models: [] }),
      checkProviders: async () => ({ success: true, providers: {} }),
    },

    // Mock Setup API
    setup: createMockSetupAPI(),

    // Mock Auto Mode API
    autoMode: createMockAutoModeAPI(),

    // Mock Worktree API
    worktree: createMockWorktreeAPI(),

    // Mock Git API (for non-worktree operations)
    git: createMockGitAPI(),

    // Mock Spec Regeneration API
    specRegeneration: createMockSpecRegenerationAPI(),

    // Mock Features API
    features: createMockFeaturesAPI(),

    // Mock Running Agents API
    runningAgents: createMockRunningAgentsAPI(),

    // Mock GitHub API
    github: createMockGitHubAPI(),

    // Mock Claude API
    claude: {
      getUsage: async () => {
        console.log('[Mock] Getting Claude usage');
        return {
          sessionTokensUsed: 0,
          sessionLimit: 0,
          sessionPercentage: 15,
          sessionResetTime: new Date(Date.now() + 3600000).toISOString(),
          sessionResetText: 'Resets in 1h',
          weeklyTokensUsed: 0,
          weeklyLimit: 0,
          weeklyPercentage: 5,
          weeklyResetTime: new Date(Date.now() + 86400000 * 2).toISOString(),
          weeklyResetText: 'Resets Dec 23',
          sonnetWeeklyTokensUsed: 0,
          sonnetWeeklyPercentage: 1,
          sonnetResetText: 'Resets Dec 27',
          costUsed: null,
          costLimit: null,
          costCurrency: null,
          lastUpdated: new Date().toISOString(),
          userTimezone: 'UTC',
        };
      },
    },

    // Mock z.ai API
    zai: {
      getUsage: async () => {
        console.log('[Mock] Getting z.ai usage');
        return {
          quotaLimits: {
            tokens: {
              limitType: 'TOKENS_LIMIT',
              limit: 1000000,
              used: 250000,
              remaining: 750000,
              usedPercent: 25,
              nextResetTime: Date.now() + 86400000,
            },
            time: {
              limitType: 'TIME_LIMIT',
              limit: 3600,
              used: 900,
              remaining: 2700,
              usedPercent: 25,
              nextResetTime: Date.now() + 3600000,
            },
            planType: 'standard',
          },
          lastUpdated: new Date().toISOString(),
        };
      },
      verify: async (apiKey: string) => {
        console.log('[Mock] Verifying z.ai API key');
        // Mock successful verification if key is provided
        if (apiKey && apiKey.trim().length > 0) {
          return {
            success: true,
            authenticated: true,
            message: 'Connection successful! z.ai API responded.',
          };
        }
        return {
          success: false,
          authenticated: false,
          error: 'Please provide an API key to test.',
        };
      },
    },

    // Mock Gemini API
    gemini: {
      getUsage: async () => {
        console.log('[Mock] Getting Gemini usage');
        return {
          authenticated: true,
          authMethod: 'cli_login',
          usedPercent: 0,
          remainingPercent: 100,
          lastUpdated: new Date().toISOString(),
        };
      },
    },
  };
};

// Install progress event type used by useCliInstallation hook
interface InstallProgressEvent {
  cli?: string;
  data?: string;
  type?: string;
}

// Setup API interface
interface SetupAPI {
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
      hasCliAuth?: boolean;
      hasRecentActivity?: boolean;
    };
    error?: string;
  }>;
  installClaude: () => Promise<{
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
  deauthClaude?: () => Promise<{
    success: boolean;
    requiresManualDeauth?: boolean;
    command?: string;
    message?: string;
    error?: string;
  }>;
  storeApiKey: (provider: string, apiKey: string) => Promise<{ success: boolean; error?: string }>;
  saveApiKey?: (provider: string, apiKey: string) => Promise<{ success: boolean; error?: string }>;
  getApiKeys: () => Promise<{
    success: boolean;
    hasAnthropicKey: boolean;
    hasGoogleKey: boolean;
    hasOpenaiKey: boolean;
  }>;
  deleteApiKey: (
    provider: string
  ) => Promise<{ success: boolean; error?: string; message?: string }>;
  getPlatform: () => Promise<{
    success: boolean;
    platform: string;
    arch: string;
    homeDir: string;
    isWindows: boolean;
    isMac: boolean;
    isLinux: boolean;
  }>;
  verifyClaudeAuth: (authMethod?: 'cli' | 'api_key') => Promise<{
    success: boolean;
    authenticated: boolean;
    authType?: 'oauth' | 'api_key' | 'cli';
    error?: string;
  }>;
  getGhStatus?: () => Promise<{
    success: boolean;
    installed: boolean;
    authenticated: boolean;
    version: string | null;
    path: string | null;
    user: string | null;
    error?: string;
  }>;
  // Cursor CLI methods
  getCursorStatus?: () => Promise<{
    success: boolean;
    installed?: boolean;
    version?: string | null;
    path?: string | null;
    auth?: {
      authenticated: boolean;
      method: string;
    };
    installCommand?: string;
    loginCommand?: string;
    error?: string;
  }>;
  authCursor?: () => Promise<{
    success: boolean;
    token?: string;
    requiresManualAuth?: boolean;
    terminalOpened?: boolean;
    command?: string;
    message?: string;
    output?: string;
  }>;
  deauthCursor?: () => Promise<{
    success: boolean;
    requiresManualDeauth?: boolean;
    command?: string;
    message?: string;
    error?: string;
  }>;
  // Codex CLI methods
  getCodexStatus?: () => Promise<{
    success: boolean;
    status?: string;
    installed?: boolean;
    method?: string;
    version?: string;
    path?: string;
    auth?: {
      authenticated: boolean;
      method: string;
      hasAuthFile?: boolean;
      hasOAuthToken?: boolean;
      hasApiKey?: boolean;
      hasStoredApiKey?: boolean;
      hasEnvApiKey?: boolean;
    };
    error?: string;
  }>;
  installCodex?: () => Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }>;
  authCodex?: () => Promise<{
    success: boolean;
    token?: string;
    requiresManualAuth?: boolean;
    terminalOpened?: boolean;
    command?: string;
    error?: string;
    message?: string;
    output?: string;
  }>;
  deauthCodex?: () => Promise<{
    success: boolean;
    requiresManualDeauth?: boolean;
    command?: string;
    message?: string;
    error?: string;
  }>;
  verifyCodexAuth?: (
    authMethod: 'cli' | 'api_key',
    apiKey?: string
  ) => Promise<{
    success: boolean;
    authenticated: boolean;
    error?: string;
  }>;
  // OpenCode CLI methods
  getOpencodeStatus?: () => Promise<{
    success: boolean;
    status?: string;
    installed?: boolean;
    method?: string;
    version?: string;
    path?: string;
    recommendation?: string;
    installCommands?: {
      macos?: string;
      linux?: string;
      npm?: string;
    };
    auth?: {
      authenticated: boolean;
      method: string;
      hasAuthFile?: boolean;
      hasOAuthToken?: boolean;
      hasApiKey?: boolean;
      hasStoredApiKey?: boolean;
      hasEnvApiKey?: boolean;
    };
    error?: string;
  }>;
  authOpencode?: () => Promise<{
    success: boolean;
    token?: string;
    requiresManualAuth?: boolean;
    terminalOpened?: boolean;
    command?: string;
    message?: string;
    output?: string;
  }>;
  deauthOpencode?: () => Promise<{
    success: boolean;
    requiresManualDeauth?: boolean;
    command?: string;
    message?: string;
    error?: string;
  }>;
  getOpencodeModels?: (refresh?: boolean) => Promise<{
    success: boolean;
    models?: Array<{
      id: string;
      name: string;
      modelString: string;
      provider: string;
      description: string;
      supportsTools: boolean;
      supportsVision: boolean;
      tier: string;
      default?: boolean;
    }>;
    count?: number;
    cached?: boolean;
    error?: string;
  }>;
  refreshOpencodeModels?: () => Promise<{
    success: boolean;
    models?: Array<{
      id: string;
      name: string;
      modelString: string;
      provider: string;
      description: string;
      supportsTools: boolean;
      supportsVision: boolean;
      tier: string;
      default?: boolean;
    }>;
    count?: number;
    error?: string;
  }>;
  getOpencodeProviders?: () => Promise<{
    success: boolean;
    providers?: Array<{
      id: string;
      name: string;
      authenticated: boolean;
      authMethod?: 'oauth' | 'api_key';
    }>;
    authenticated?: Array<{
      id: string;
      name: string;
      authenticated: boolean;
      authMethod?: 'oauth' | 'api_key';
    }>;
    error?: string;
  }>;
  clearOpencodeCache?: () => Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }>;
  // Gemini CLI methods
  getGeminiStatus?: () => Promise<{
    success: boolean;
    status?: string;
    installed?: boolean;
    method?: string;
    version?: string;
    path?: string;
    recommendation?: string;
    installCommands?: {
      macos?: string;
      linux?: string;
      npm?: string;
    };
    auth?: {
      authenticated: boolean;
      method: string;
      hasApiKey?: boolean;
      hasEnvApiKey?: boolean;
      error?: string;
    };
    loginCommand?: string;
    installCommand?: string;
    error?: string;
  }>;
  authGemini?: () => Promise<{
    success: boolean;
    requiresManualAuth?: boolean;
    command?: string;
    message?: string;
    error?: string;
  }>;
  deauthGemini?: () => Promise<{
    success: boolean;
    requiresManualDeauth?: boolean;
    command?: string;
    message?: string;
    error?: string;
  }>;
  // Copilot SDK methods
  getCopilotStatus?: () => Promise<{
    success: boolean;
    status?: string;
    installed?: boolean;
    method?: string;
    version?: string;
    path?: string;
    recommendation?: string;
    auth?: {
      authenticated: boolean;
      method: string;
      login?: string;
      host?: string;
      error?: string;
    };
    loginCommand?: string;
    installCommand?: string;
    error?: string;
  }>;
  onInstallProgress?: (
    callback: (progress: InstallProgressEvent) => void
  ) => (() => void) | undefined;
  onAuthProgress?: (callback: (progress: InstallProgressEvent) => void) => (() => void) | undefined;
}

// Mock Setup API implementation
function createMockSetupAPI(): SetupAPI {
  const mockStoreApiKey = async (provider: string, _apiKey: string) => {
    console.log('[Mock] Storing API key for:', provider);
    return { success: true };
  };

  return {
    getClaudeStatus: async () => {
      console.log('[Mock] Getting Claude status');
      return {
        success: true,
        status: 'not_installed',
        installed: false,
        auth: {
          authenticated: false,
          method: 'none',
          hasCredentialsFile: false,
          hasToken: false,
          hasCliAuth: false,
          hasRecentActivity: false,
        },
      };
    },

    installClaude: async () => {
      console.log('[Mock] Installing Claude CLI');
      // Simulate installation delay
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return {
        success: false,
        error:
          'CLI installation is only available in the Electron app. Please run the command manually.',
      };
    },

    authClaude: async () => {
      console.log('[Mock] Auth Claude CLI');
      return {
        success: true,
        requiresManualAuth: true,
        command: 'claude login',
      };
    },

    deauthClaude: async () => {
      console.log('[Mock] Deauth Claude CLI');
      return {
        success: true,
        requiresManualDeauth: true,
        command: 'claude logout',
      };
    },

    storeApiKey: mockStoreApiKey,
    saveApiKey: mockStoreApiKey,

    getApiKeys: async () => {
      console.log('[Mock] Getting API keys');
      return {
        success: true,
        hasAnthropicKey: false,
        hasGoogleKey: false,
        hasOpenaiKey: false,
      };
    },

    deleteApiKey: async (provider: string) => {
      console.log('[Mock] Deleting API key for:', provider);
      return { success: true, message: `API key for ${provider} deleted` };
    },

    getPlatform: async () => {
      return {
        success: true,
        platform: 'darwin',
        arch: 'arm64',
        homeDir: '/Users/mock',
        isWindows: false,
        isMac: true,
        isLinux: false,
      };
    },

    verifyClaudeAuth: async (authMethod?: 'cli' | 'api_key') => {
      console.log('[Mock] Verifying Claude auth with method:', authMethod);
      // Mock always returns not authenticated
      return {
        success: true,
        authenticated: false,
        error: 'Mock environment - authentication not available',
      };
    },

    getGhStatus: async () => {
      console.log('[Mock] Getting GitHub CLI status');
      return {
        success: true,
        installed: false,
        authenticated: false,
        version: null,
        path: null,
        user: null,
      };
    },

    // Cursor CLI mock methods
    getCursorStatus: async () => {
      console.log('[Mock] Getting Cursor status');
      return {
        success: true,
        installed: false,
        version: null,
        path: null,
        auth: { authenticated: false, method: 'none' },
      };
    },

    authCursor: async () => {
      console.log('[Mock] Auth Cursor CLI');
      return {
        success: true,
        requiresManualAuth: true,
        command: 'cursor --login',
      };
    },

    deauthCursor: async () => {
      console.log('[Mock] Deauth Cursor CLI');
      return {
        success: true,
        requiresManualDeauth: true,
        command: 'cursor --logout',
      };
    },

    // Codex CLI mock methods
    getCodexStatus: async () => {
      console.log('[Mock] Getting Codex status');
      return {
        success: true,
        status: 'not_installed',
        installed: false,
        auth: { authenticated: false, method: 'none' },
      };
    },

    installCodex: async () => {
      console.log('[Mock] Installing Codex CLI');
      return {
        success: false,
        error: 'CLI installation is only available in the Electron app.',
      };
    },

    authCodex: async () => {
      console.log('[Mock] Auth Codex CLI');
      return {
        success: true,
        requiresManualAuth: true,
        command: 'codex login',
      };
    },

    deauthCodex: async () => {
      console.log('[Mock] Deauth Codex CLI');
      return {
        success: true,
        requiresManualDeauth: true,
        command: 'codex logout',
      };
    },

    verifyCodexAuth: async (authMethod: 'cli' | 'api_key') => {
      console.log('[Mock] Verifying Codex auth with method:', authMethod);
      return {
        success: true,
        authenticated: false,
        error: 'Mock environment - authentication not available',
      };
    },

    // OpenCode CLI mock methods
    getOpencodeStatus: async () => {
      console.log('[Mock] Getting OpenCode status');
      return {
        success: true,
        status: 'not_installed',
        installed: false,
        auth: { authenticated: false, method: 'none' },
      };
    },

    authOpencode: async () => {
      console.log('[Mock] Auth OpenCode CLI');
      return {
        success: true,
        requiresManualAuth: true,
        command: 'opencode auth login',
      };
    },

    deauthOpencode: async () => {
      console.log('[Mock] Deauth OpenCode CLI');
      return {
        success: true,
        requiresManualDeauth: true,
        command: 'opencode auth logout',
      };
    },

    getOpencodeModels: async () => {
      console.log('[Mock] Getting OpenCode models');
      return {
        success: true,
        models: [],
        count: 0,
        cached: false,
      };
    },

    refreshOpencodeModels: async () => {
      console.log('[Mock] Refreshing OpenCode models');
      return {
        success: true,
        models: [],
        count: 0,
      };
    },

    getOpencodeProviders: async () => {
      console.log('[Mock] Getting OpenCode providers');
      return {
        success: true,
        providers: [],
        authenticated: [],
      };
    },

    clearOpencodeCache: async () => {
      console.log('[Mock] Clearing OpenCode cache');
      return {
        success: true,
        message: 'Cache cleared',
      };
    },

    // Gemini CLI mock methods
    getGeminiStatus: async () => {
      console.log('[Mock] Getting Gemini status');
      return {
        success: true,
        status: 'not_installed',
        installed: false,
        auth: { authenticated: false, method: 'none' },
      };
    },

    authGemini: async () => {
      console.log('[Mock] Auth Gemini CLI');
      return {
        success: true,
        requiresManualAuth: true,
        command: 'gemini auth login',
      };
    },

    deauthGemini: async () => {
      console.log('[Mock] Deauth Gemini CLI');
      return {
        success: true,
        requiresManualDeauth: true,
        command: 'gemini auth logout',
      };
    },

    // Copilot SDK mock methods
    getCopilotStatus: async () => {
      console.log('[Mock] Getting Copilot status');
      return {
        success: true,
        status: 'not_installed',
        installed: false,
        auth: { authenticated: false, method: 'none' },
      };
    },

    onInstallProgress: (_callback) => {
      // Mock progress events
      return () => {};
    },

    onAuthProgress: (_callback) => {
      // Mock auth events
      return () => {};
    },
  };
}

// Mock Worktree API implementation
function createMockWorktreeAPI(): WorktreeAPI {
  return {
    mergeFeature: async (
      projectPath: string,
      branchName: string,
      worktreePath: string,
      targetBranch?: string,
      options?: object
    ) => {
      const target = targetBranch || 'main';
      console.log('[Mock] Merging feature:', {
        projectPath,
        branchName,
        worktreePath,
        targetBranch: target,
        options,
      });
      return { success: true, mergedBranch: branchName, targetBranch: target };
    },

    getInfo: async (projectPath: string, featureId: string) => {
      console.log('[Mock] Getting worktree info:', { projectPath, featureId });
      return {
        success: true,
        worktreePath: `/mock/worktrees/${featureId}`,
        branchName: `feature/${featureId}`,
        head: 'abc1234',
      };
    },

    getStatus: async (projectPath: string, featureId: string) => {
      console.log('[Mock] Getting worktree status:', {
        projectPath,
        featureId,
      });
      return {
        success: true,
        modifiedFiles: 3,
        files: ['src/feature.ts', 'tests/feature.spec.ts', 'README.md'],
        diffStat: ' 3 files changed, 50 insertions(+), 10 deletions(-)',
        recentCommits: ['abc1234 feat: implement feature', 'def5678 test: add tests for feature'],
      };
    },

    list: async (projectPath: string) => {
      console.log('[Mock] Listing worktrees:', { projectPath });
      return { success: true, worktrees: [] };
    },

    listAll: async (
      projectPath: string,
      includeDetails?: boolean,
      forceRefreshGitHub?: boolean
    ) => {
      console.log('[Mock] Listing all worktrees:', {
        projectPath,
        includeDetails,
        forceRefreshGitHub,
      });
      return {
        success: true,
        worktrees: [
          {
            path: projectPath,
            branch: 'main',
            isMain: true,
            isCurrent: true,
            hasWorktree: true,
            hasChanges: false,
            changedFilesCount: 0,
          },
        ],
      };
    },

    create: async (projectPath: string, branchName: string, baseBranch?: string) => {
      console.log('[Mock] Creating worktree:', {
        projectPath,
        branchName,
        baseBranch,
      });
      return {
        success: true,
        worktree: {
          path: `${projectPath}/.worktrees/${branchName}`,
          branch: branchName,
          isNew: true,
        },
      };
    },

    delete: async (projectPath: string, worktreePath: string, deleteBranch?: boolean) => {
      console.log('[Mock] Deleting worktree:', {
        projectPath,
        worktreePath,
        deleteBranch,
      });
      return {
        success: true,
        deleted: {
          worktreePath,
          branch: deleteBranch ? 'feature-branch' : null,
        },
      };
    },

    commit: async (worktreePath: string, message: string, files?: string[]) => {
      console.log('[Mock] Committing changes:', { worktreePath, message, files });
      return {
        success: true,
        result: {
          committed: true,
          commitHash: 'abc123',
          branch: 'feature-branch',
          message,
        },
      };
    },

    generateCommitMessage: async (worktreePath: string) => {
      console.log('[Mock] Generating commit message for:', worktreePath);
      return {
        success: true,
        message: 'feat: Add mock commit message generation',
      };
    },

    generatePRDescription: async (worktreePath: string, baseBranch?: string) => {
      console.log('[Mock] Generating PR description for:', { worktreePath, baseBranch });
      return {
        success: true,
        title: 'Add new feature implementation',
        body: '## Summary\n- Added new feature\n\n## Changes\n- Implementation details here',
      };
    },

    push: async (worktreePath: string, force?: boolean, remote?: string) => {
      const targetRemote = remote || 'origin';
      console.log('[Mock] Pushing worktree:', { worktreePath, force, remote: targetRemote });
      return {
        success: true,
        result: {
          branch: 'feature-branch',
          pushed: true,
          message: `Successfully pushed to ${targetRemote}/feature-branch`,
        },
      };
    },

    createPR: async (worktreePath: string, options?: CreatePROptions) => {
      console.log('[Mock] Creating PR:', { worktreePath, options });
      return {
        success: true,
        result: {
          branch: 'feature-branch',
          committed: true,
          commitHash: 'abc123',
          pushed: true,
          prUrl: 'https://github.com/example/repo/pull/1',
          prCreated: true,
        },
      };
    },

    getDiffs: async (projectPath: string, featureId: string) => {
      console.log('[Mock] Getting file diffs:', { projectPath, featureId });
      return {
        success: true,
        diff: "diff --git a/src/feature.ts b/src/feature.ts\n+++ new file\n@@ -0,0 +1,10 @@\n+export function feature() {\n+  return 'hello';\n+}",
        files: [
          { status: 'A', path: 'src/feature.ts', statusText: 'Added' },
          { status: 'M', path: 'README.md', statusText: 'Modified' },
        ],
        hasChanges: true,
      };
    },

    getFileDiff: async (projectPath: string, featureId: string, filePath: string) => {
      console.log('[Mock] Getting file diff:', {
        projectPath,
        featureId,
        filePath,
      });
      return {
        success: true,
        diff: `diff --git a/${filePath} b/${filePath}\n+++ new file\n@@ -0,0 +1,5 @@\n+// New content`,
        filePath,
      };
    },

    stageFiles: async (worktreePath: string, files: string[], operation: 'stage' | 'unstage') => {
      console.log('[Mock] Stage files:', { worktreePath, files, operation });
      return {
        success: true,
        result: {
          operation,
          filesCount: files.length,
        },
      };
    },

    pull: async (worktreePath: string, remote?: string, stashIfNeeded?: boolean) => {
      const targetRemote = remote || 'origin';
      console.log('[Mock] Pulling latest changes for:', {
        worktreePath,
        remote: targetRemote,
        stashIfNeeded,
      });
      return {
        success: true,
        result: {
          branch: 'main',
          pulled: true,
          message: `Pulled latest changes from ${targetRemote}`,
          hasLocalChanges: false,
          hasConflicts: false,
          stashed: false,
          stashRestored: false,
        },
      };
    },

    checkoutBranch: async (
      worktreePath: string,
      branchName: string,
      baseBranch?: string,
      stashChanges?: boolean,
      _includeUntracked?: boolean
    ) => {
      console.log('[Mock] Creating and checking out branch:', {
        worktreePath,
        branchName,
        baseBranch,
        stashChanges,
      });
      return {
        success: true,
        result: {
          previousBranch: 'main',
          newBranch: branchName,
          message: `Created and checked out branch '${branchName}'`,
          hasConflicts: false,
          stashedChanges: stashChanges ?? false,
        },
      };
    },

    checkChanges: async (worktreePath: string) => {
      console.log('[Mock] Checking for uncommitted changes:', worktreePath);
      return {
        success: true,
        result: {
          hasChanges: false,
          staged: [],
          unstaged: [],
          untracked: [],
          totalFiles: 0,
        },
      };
    },

    listBranches: async (worktreePath: string) => {
      console.log('[Mock] Listing branches for:', worktreePath);
      return {
        success: true,
        result: {
          currentBranch: 'main',
          branches: [
            { name: 'main', isCurrent: true, isRemote: false },
            { name: 'develop', isCurrent: false, isRemote: false },
            { name: 'feature/example', isCurrent: false, isRemote: false },
          ],
          aheadCount: 2,
          behindCount: 0,
          hasRemoteBranch: true,
          hasAnyRemotes: true,
        },
      };
    },

    switchBranch: async (worktreePath: string, branchName: string) => {
      console.log('[Mock] Switching to branch:', { worktreePath, branchName });
      return {
        success: true,
        result: {
          previousBranch: 'main',
          currentBranch: branchName,
          message: `Switched to branch '${branchName}'`,
          hasConflicts: false,
          stashedChanges: false,
        },
      };
    },

    listRemotes: async (worktreePath: string) => {
      console.log('[Mock] Listing remotes for:', worktreePath);
      return {
        success: true,
        result: {
          remotes: [
            {
              name: 'origin',
              url: 'git@github.com:example/repo.git',
              branches: [
                { name: 'main', fullRef: 'origin/main' },
                { name: 'develop', fullRef: 'origin/develop' },
                { name: 'feature/example', fullRef: 'origin/feature/example' },
              ],
            },
          ],
        },
      };
    },

    addRemote: async (worktreePath: string, remoteName: string, remoteUrl: string) => {
      console.log('[Mock] Adding remote:', { worktreePath, remoteName, remoteUrl });
      return {
        success: true,
        result: {
          remoteName,
          remoteUrl,
          fetched: true,
          message: `Added remote '${remoteName}' (${remoteUrl})`,
        },
      };
    },

    openInEditor: async (worktreePath: string, editorCommand?: string) => {
      const ANTIGRAVITY_EDITOR_COMMAND = 'antigravity';
      const ANTIGRAVITY_LEGACY_COMMAND = 'agy';
      // Map editor commands to display names
      const editorNameMap: Record<string, string> = {
        cursor: 'Cursor',
        code: 'VS Code',
        zed: 'Zed',
        subl: 'Sublime Text',
        windsurf: 'Windsurf',
        trae: 'Trae',
        rider: 'Rider',
        webstorm: 'WebStorm',
        xed: 'Xcode',
        studio: 'Android Studio',
        [ANTIGRAVITY_EDITOR_COMMAND]: 'Antigravity',
        [ANTIGRAVITY_LEGACY_COMMAND]: 'Antigravity',
        open: 'Finder',
        explorer: 'Explorer',
        'xdg-open': 'File Manager',
      };
      const editorName = editorCommand ? (editorNameMap[editorCommand] ?? 'Editor') : 'VS Code';
      console.log('[Mock] Opening in editor:', worktreePath, 'using:', editorName);
      return {
        success: true,
        result: {
          message: `Opened ${worktreePath} in ${editorName}`,
          editorName,
        },
      };
    },

    getDefaultEditor: async () => {
      console.log('[Mock] Getting default editor');
      return {
        success: true,
        result: {
          editorName: 'VS Code',
          editorCommand: 'code',
        },
      };
    },

    getAvailableEditors: async () => {
      console.log('[Mock] Getting available editors');
      return {
        success: true,
        result: {
          editors: [
            { name: 'VS Code', command: 'code' },
            { name: 'Finder', command: 'open' },
          ],
        },
      };
    },
    refreshEditors: async () => {
      console.log('[Mock] Refreshing available editors');
      return {
        success: true,
        result: {
          editors: [
            { name: 'VS Code', command: 'code' },
            { name: 'Finder', command: 'open' },
          ],
          message: 'Found 2 available editors',
        },
      };
    },

    getAvailableTerminals: async () => {
      console.log('[Mock] Getting available terminals');
      return {
        success: true,
        result: {
          terminals: [
            { id: 'iterm2', name: 'iTerm2', command: 'open -a iTerm' },
            { id: 'terminal-macos', name: 'Terminal', command: 'open -a Terminal' },
          ],
        },
      };
    },

    getDefaultTerminal: async () => {
      console.log('[Mock] Getting default terminal');
      return {
        success: true,
        result: {
          terminalId: 'iterm2',
          terminalName: 'iTerm2',
          terminalCommand: 'open -a iTerm',
        },
      };
    },

    refreshTerminals: async () => {
      console.log('[Mock] Refreshing available terminals');
      return {
        success: true,
        result: {
          terminals: [
            { id: 'iterm2', name: 'iTerm2', command: 'open -a iTerm' },
            { id: 'terminal-macos', name: 'Terminal', command: 'open -a Terminal' },
          ],
          message: 'Found 2 available terminals',
        },
      };
    },

    openInExternalTerminal: async (worktreePath: string, terminalId?: string) => {
      console.log('[Mock] Opening in external terminal:', worktreePath, terminalId);
      return {
        success: true,
        result: {
          message: `Opened ${worktreePath} in ${terminalId ?? 'default terminal'}`,
          terminalName: terminalId ?? 'Terminal',
        },
      };
    },

    initGit: async (projectPath: string) => {
      console.log('[Mock] Initializing git:', projectPath);
      return {
        success: true,
        result: {
          initialized: true,
          message: `Initialized git repository in ${projectPath}`,
        },
      };
    },

    startDevServer: async (projectPath: string, worktreePath: string) => {
      console.log('[Mock] Starting dev server:', { projectPath, worktreePath });
      return {
        success: true,
        result: {
          worktreePath,
          port: 3001,
          url: 'http://localhost:3001',
          message: 'Dev server started on port 3001',
        },
      };
    },

    stopDevServer: async (worktreePath: string) => {
      console.log('[Mock] Stopping dev server:', worktreePath);
      return {
        success: true,
        result: {
          worktreePath,
          message: 'Dev server stopped',
        },
      };
    },

    listDevServers: async () => {
      console.log('[Mock] Listing dev servers');
      return {
        success: true,
        result: {
          servers: [],
        },
      };
    },

    getDevServerLogs: async (worktreePath: string) => {
      console.log('[Mock] Getting dev server logs:', { worktreePath });
      return {
        success: false,
        error: 'No dev server running for this worktree',
      };
    },

    onDevServerLogEvent: (_callback) => {
      console.log('[Mock] Subscribing to dev server log events');
      // Return unsubscribe function
      return () => {
        console.log('[Mock] Unsubscribing from dev server log events');
      };
    },

    getPRInfo: async (worktreePath: string, branchName: string) => {
      console.log('[Mock] Getting PR info:', { worktreePath, branchName });
      return {
        success: true,
        result: {
          hasPR: false,
          ghCliAvailable: false,
        },
      };
    },

    getInitScript: async (projectPath: string) => {
      console.log('[Mock] Getting init script:', { projectPath });
      return {
        success: true,
        exists: false,
        content: '',
        path: `${projectPath}/.automaker/worktree-init.sh`,
      };
    },

    setInitScript: async (projectPath: string, content: string) => {
      console.log('[Mock] Setting init script:', { projectPath, content });
      return {
        success: true,
        path: `${projectPath}/.automaker/worktree-init.sh`,
      };
    },

    deleteInitScript: async (projectPath: string) => {
      console.log('[Mock] Deleting init script:', { projectPath });
      return {
        success: true,
      };
    },

    runInitScript: async (projectPath: string, worktreePath: string, branch: string) => {
      console.log('[Mock] Running init script:', { projectPath, worktreePath, branch });
      return {
        success: true,
        message: 'Init script started (mock)',
      };
    },

    onInitScriptEvent: (_callback) => {
      console.log('[Mock] Subscribing to init script events');
      // Return unsubscribe function
      return () => {
        console.log('[Mock] Unsubscribing from init script events');
      };
    },

    discardChanges: async (worktreePath: string, files?: string[]) => {
      console.log('[Mock] Discarding changes:', { worktreePath, files });
      return {
        success: true,
        result: {
          discarded: true,
          filesDiscarded: 0,
          filesRemaining: 0,
          branch: 'main',
          message: 'Mock: Changes discarded successfully',
        },
      };
    },

    // Test runner methods
    startTests: async (
      worktreePath: string,
      options?: { projectPath?: string; testFile?: string }
    ) => {
      console.log('[Mock] Starting tests:', { worktreePath, options });
      return {
        success: true,
        result: {
          sessionId: 'mock-session-123',
          worktreePath,
          command: 'npm run test',
          status: 'running' as const,
          testFile: options?.testFile,
          message: 'Tests started (mock)',
        },
      };
    },

    stopTests: async (sessionId: string) => {
      console.log('[Mock] Stopping tests:', { sessionId });
      return {
        success: true,
        result: {
          sessionId,
          message: 'Tests stopped (mock)',
        },
      };
    },

    getTestLogs: async (worktreePath?: string, sessionId?: string) => {
      console.log('[Mock] Getting test logs:', { worktreePath, sessionId });
      return {
        success: false,
        error: 'No test sessions found (mock)',
      };
    },

    onTestRunnerEvent: (_callback) => {
      console.log('[Mock] Subscribing to test runner events');
      // Return unsubscribe function
      return () => {
        console.log('[Mock] Unsubscribing from test runner events');
      };
    },

    getCommitLog: async (worktreePath: string, limit?: number) => {
      console.log('[Mock] Getting commit log:', { worktreePath, limit });
      return {
        success: true,
        result: {
          branch: 'main',
          commits: [
            {
              hash: 'abc1234567890',
              shortHash: 'abc1234',
              author: 'Mock User',
              authorEmail: 'mock@example.com',
              date: new Date().toISOString(),
              subject: 'Mock commit message',
              body: '',
              files: ['src/index.ts', 'package.json'],
            },
          ],
          total: 1,
        },
      };
    },
    stashPush: async (worktreePath: string, message?: string, files?: string[]) => {
      console.log('[Mock] Stash push:', { worktreePath, message, files });
      return {
        success: true,
        result: {
          stashed: true,
          branch: 'main',
          message: message || 'WIP on main',
        },
      };
    },
    stashList: async (worktreePath: string) => {
      console.log('[Mock] Stash list:', { worktreePath });
      return {
        success: true,
        result: {
          stashes: [],
          total: 0,
        },
      };
    },
    stashApply: async (worktreePath: string, stashIndex: number, pop?: boolean) => {
      console.log('[Mock] Stash apply:', { worktreePath, stashIndex, pop });
      return {
        success: true,
        result: {
          applied: true,
          hasConflicts: false,
          conflictFiles: [] as string[],
          operation: pop ? ('pop' as const) : ('apply' as const),
          stashIndex,
          message: `Stash ${pop ? 'popped' : 'applied'} successfully`,
        },
      };
    },
    stashDrop: async (worktreePath: string, stashIndex: number) => {
      console.log('[Mock] Stash drop:', { worktreePath, stashIndex });
      return {
        success: true,
        result: {
          dropped: true,
          stashIndex,
          message: `Stash stash@{${stashIndex}} dropped successfully`,
        },
      };
    },
    cherryPick: async (
      worktreePath: string,
      commitHashes: string[],
      options?: { noCommit?: boolean }
    ) => {
      console.log('[Mock] Cherry-pick:', { worktreePath, commitHashes, options });
      return {
        success: true,
        result: {
          cherryPicked: true,
          commitHashes,
          branch: 'main',
          message: `Cherry-picked ${commitHashes.length} commit(s) successfully`,
        },
      };
    },
    getBranchCommitLog: async (worktreePath: string, branchName?: string, limit?: number) => {
      console.log('[Mock] Get branch commit log:', { worktreePath, branchName, limit });
      return {
        success: true,
        result: {
          branch: branchName || 'main',
          commits: [],
          total: 0,
        },
      };
    },
    rebase: async (worktreePath: string, ontoBranch: string) => {
      console.log('[Mock] Rebase:', { worktreePath, ontoBranch });
      return {
        success: true,
        result: {
          branch: 'current-branch',
          ontoBranch,
          message: `Successfully rebased onto ${ontoBranch}`,
        },
      };
    },

    abortOperation: async (worktreePath: string) => {
      console.log('[Mock] Abort operation:', { worktreePath });
      return {
        success: true,
        result: {
          operation: 'merge',
          message: 'Merge aborted successfully',
        },
      };
    },

    continueOperation: async (worktreePath: string) => {
      console.log('[Mock] Continue operation:', { worktreePath });
      return {
        success: true,
        result: {
          operation: 'merge',
          message: 'Merge continued successfully',
        },
      };
    },
  };
}

// Mock Git API implementation (for non-worktree operations)
function createMockGitAPI(): GitAPI {
  return {
    getDiffs: async (projectPath: string) => {
      console.log('[Mock] Getting git diffs for project:', { projectPath });
      return {
        success: true,
        diff: "diff --git a/src/feature.ts b/src/feature.ts\n+++ new file\n@@ -0,0 +1,10 @@\n+export function feature() {\n+  return 'hello';\n+}",
        files: [
          { status: 'A', path: 'src/feature.ts', statusText: 'Added' },
          { status: 'M', path: 'README.md', statusText: 'Modified' },
        ],
        hasChanges: true,
      };
    },

    getFileDiff: async (projectPath: string, filePath: string) => {
      console.log('[Mock] Getting git file diff:', { projectPath, filePath });
      return {
        success: true,
        diff: `diff --git a/${filePath} b/${filePath}\n+++ new file\n@@ -0,0 +1,5 @@\n+// New content`,
        filePath,
      };
    },

    stageFiles: async (projectPath: string, files: string[], operation: 'stage' | 'unstage') => {
      console.log('[Mock] Git stage files:', { projectPath, files, operation });
      return {
        success: true,
        result: {
          operation,
          filesCount: files.length,
        },
      };
    },
  };
}

// Mock Auto Mode state and implementation
let mockAutoModeRunning = false;
let mockRunningFeatures = new Set<string>(); // Track multiple concurrent feature verifications
let mockAutoModeCallbacks: ((event: AutoModeEvent) => void)[] = [];
let mockAutoModeTimeouts = new Map<string, NodeJS.Timeout>(); // Track timeouts per feature

function createMockAutoModeAPI(): AutoModeAPI {
  return {
    start: async (projectPath: string, branchName?: string | null, maxConcurrency?: number) => {
      if (mockAutoModeRunning) {
        return { success: false, error: 'Auto mode is already running' };
      }

      mockAutoModeRunning = true;
      console.log(
        `[Mock] Auto mode started with branchName: ${branchName}, maxConcurrency: ${maxConcurrency || DEFAULT_MAX_CONCURRENCY}`
      );
      const featureId = 'auto-mode-0';
      mockRunningFeatures.add(featureId);

      // Simulate auto mode with Plan-Act-Verify phases
      simulateAutoModeLoop(projectPath, featureId);

      return { success: true };
    },

    stop: async (_projectPath: string, _branchName?: string | null) => {
      mockAutoModeRunning = false;
      const runningCount = mockRunningFeatures.size;
      mockRunningFeatures.clear();
      // Clear all timeouts
      mockAutoModeTimeouts.forEach((timeout) => clearTimeout(timeout));
      mockAutoModeTimeouts.clear();
      return { success: true, runningFeatures: runningCount };
    },

    stopFeature: async (featureId: string) => {
      if (!mockRunningFeatures.has(featureId)) {
        return { success: false, error: `Feature ${featureId} is not running` };
      }

      // Clear the timeout for this specific feature
      const timeout = mockAutoModeTimeouts.get(featureId);
      if (timeout) {
        clearTimeout(timeout);
        mockAutoModeTimeouts.delete(featureId);
      }

      // Remove from running features
      mockRunningFeatures.delete(featureId);

      // Emit a stopped event
      emitAutoModeEvent({
        type: 'auto_mode_feature_complete',
        featureId,
        passes: false,
        message: 'Feature stopped by user',
      });

      return { success: true };
    },

    status: async (_projectPath?: string) => {
      return {
        success: true,
        isRunning: mockAutoModeRunning,
        currentFeatureId: mockAutoModeRunning ? 'feature-0' : null,
        runningFeatures: Array.from(mockRunningFeatures),
        runningCount: mockRunningFeatures.size,
      };
    },

    runFeature: async (
      projectPath: string,
      featureId: string,
      useWorktrees?: boolean,
      worktreePath?: string
    ) => {
      if (mockRunningFeatures.has(featureId)) {
        return {
          success: false,
          error: `Feature ${featureId} is already running`,
        };
      }

      console.log(
        `[Mock] Running feature ${featureId} with useWorktrees: ${useWorktrees}, worktreePath: ${worktreePath}`
      );
      mockRunningFeatures.add(featureId);
      simulateAutoModeLoop(projectPath, featureId);

      return { success: true, passes: true };
    },

    verifyFeature: async (projectPath: string, featureId: string) => {
      if (mockRunningFeatures.has(featureId)) {
        return {
          success: false,
          error: `Feature ${featureId} is already running`,
        };
      }

      mockRunningFeatures.add(featureId);
      simulateAutoModeLoop(projectPath, featureId);

      return { success: true, passes: true };
    },

    resumeFeature: async (projectPath: string, featureId: string, _useWorktrees?: boolean) => {
      if (mockRunningFeatures.has(featureId)) {
        return {
          success: false,
          error: `Feature ${featureId} is already running`,
        };
      }

      mockRunningFeatures.add(featureId);
      simulateAutoModeLoop(projectPath, featureId);

      return { success: true, passes: true };
    },

    contextExists: async (projectPath: string, featureId: string) => {
      // Mock implementation - simulate that context exists for some features
      // Now checks for agent-output.md in the feature's folder
      const exists =
        mockFileSystem[`${projectPath}/.automaker/features/${featureId}/agent-output.md`] !==
        undefined;
      return { success: true, exists };
    },

    analyzeProject: async (projectPath: string) => {
      // Simulate project analysis
      const analysisId = `project-analysis-${Date.now()}`;
      mockRunningFeatures.add(analysisId);

      // Emit start event
      emitAutoModeEvent({
        type: 'auto_mode_feature_start',
        featureId: analysisId,
        feature: {
          id: analysisId,
          category: 'Project Analysis',
          description: 'Analyzing project structure and tech stack',
        },
      });

      // Simulate analysis phases
      await delay(300, analysisId);
      if (!mockRunningFeatures.has(analysisId))
        return { success: false, message: 'Analysis aborted' };

      emitAutoModeEvent({
        type: 'auto_mode_phase',
        featureId: analysisId,
        phase: 'planning',
        message: 'Scanning project structure...',
      });

      emitAutoModeEvent({
        type: 'auto_mode_progress',
        featureId: analysisId,
        content: 'Starting project analysis...\n',
      });

      await delay(500, analysisId);
      if (!mockRunningFeatures.has(analysisId))
        return { success: false, message: 'Analysis aborted' };

      emitAutoModeEvent({
        type: 'auto_mode_tool',
        featureId: analysisId,
        tool: 'Glob',
        input: { pattern: '**/*' },
      });

      await delay(300, analysisId);
      if (!mockRunningFeatures.has(analysisId))
        return { success: false, message: 'Analysis aborted' };

      emitAutoModeEvent({
        type: 'auto_mode_progress',
        featureId: analysisId,
        content: 'Detected tech stack: Next.js, TypeScript, Tailwind CSS\n',
      });

      await delay(300, analysisId);
      if (!mockRunningFeatures.has(analysisId))
        return { success: false, message: 'Analysis aborted' };

      // Write mock app_spec.txt
      mockFileSystem[`${projectPath}/.automaker/app_spec.txt`] = `<project_specification>
  <project_name>Demo Project</project_name>

  <overview>
    A demo project analyzed by the Automaker AI agent.
  </overview>

  <technology_stack>
    <frontend>
      <framework>Next.js</framework>
      <language>TypeScript</language>
      <styling>Tailwind CSS</styling>
    </frontend>
  </technology_stack>

  <core_capabilities>
    - Web application
    - Component-based architecture
  </core_capabilities>

  <implemented_features>
    - Basic page structure
    - Component library
  </implemented_features>
</project_specification>`;

      // Note: Features are now stored in .automaker/features/{id}/feature.json

      emitAutoModeEvent({
        type: 'auto_mode_phase',
        featureId: analysisId,
        phase: 'verification',
        message: 'Project analysis complete',
      });

      emitAutoModeEvent({
        type: 'auto_mode_feature_complete',
        featureId: analysisId,
        passes: true,
        message: 'Project analyzed successfully',
      });

      mockRunningFeatures.delete(analysisId);
      mockAutoModeTimeouts.delete(analysisId);

      return { success: true, message: 'Project analyzed successfully' };
    },

    followUpFeature: async (
      projectPath: string,
      featureId: string,
      prompt: string,
      imagePaths?: string[],
      _useWorktrees?: boolean
    ) => {
      if (mockRunningFeatures.has(featureId)) {
        return {
          success: false,
          error: `Feature ${featureId} is already running`,
        };
      }

      console.log('[Mock] Follow-up feature:', {
        featureId,
        prompt,
        imagePaths,
      });

      mockRunningFeatures.add(featureId);

      // Simulate follow-up work (similar to run but with additional context)
      // Note: We don't await this - it runs in the background like the real implementation
      simulateAutoModeLoop(projectPath, featureId);

      // Return immediately so the modal can close (matches real implementation)
      return { success: true };
    },

    commitFeature: async (projectPath: string, featureId: string, worktreePath?: string) => {
      console.log('[Mock] Committing feature:', {
        projectPath,
        featureId,
        worktreePath,
      });

      // Simulate commit operation
      emitAutoModeEvent({
        type: 'auto_mode_feature_start',
        featureId,
        feature: {
          id: featureId,
          category: 'Commit',
          description: 'Committing changes',
        },
      });

      await delay(300, featureId);

      emitAutoModeEvent({
        type: 'auto_mode_phase',
        featureId,
        phase: 'action',
        message: 'Committing changes to git...',
      });

      await delay(500, featureId);

      emitAutoModeEvent({
        type: 'auto_mode_feature_complete',
        featureId,
        passes: true,
        message: 'Changes committed successfully',
      });

      return { success: true };
    },

    approvePlan: async (
      projectPath: string,
      featureId: string,
      approved: boolean,
      editedPlan?: string,
      feedback?: string
    ) => {
      console.log('[Mock] Plan approval:', {
        projectPath,
        featureId,
        approved,
        editedPlan: editedPlan ? '[edited]' : undefined,
        feedback,
      });
      return { success: true };
    },

    resumeInterrupted: async (projectPath: string) => {
      console.log('[Mock] Resume interrupted features for:', projectPath);
      return { success: true, message: 'Mock: no interrupted features' };
    },

    onEvent: (callback: (event: AutoModeEvent) => void) => {
      mockAutoModeCallbacks.push(callback);
      return () => {
        mockAutoModeCallbacks = mockAutoModeCallbacks.filter((cb) => cb !== callback);
      };
    },
  };
}

function emitAutoModeEvent(event: AutoModeEvent) {
  mockAutoModeCallbacks.forEach((cb) => cb(event));
}

async function simulateAutoModeLoop(projectPath: string, featureId: string) {
  const mockFeature = {
    id: featureId,
    category: 'Core',
    description: 'Sample Feature',
    steps: ['Step 1', 'Step 2'],
    passes: false,
  };

  // Start feature
  emitAutoModeEvent({
    type: 'auto_mode_feature_start',
    featureId,
    feature: mockFeature,
  });

  await delay(300, featureId);
  if (!mockRunningFeatures.has(featureId)) return;

  // Phase 1: PLANNING
  emitAutoModeEvent({
    type: 'auto_mode_phase',
    featureId,
    phase: 'planning',
    message: `Planning implementation for: ${mockFeature.description}`,
  });

  emitAutoModeEvent({
    type: 'auto_mode_progress',
    featureId,
    content: 'Analyzing codebase structure and creating implementation plan...',
  });

  await delay(500, featureId);
  if (!mockRunningFeatures.has(featureId)) return;

  // Phase 2: ACTION
  emitAutoModeEvent({
    type: 'auto_mode_phase',
    featureId,
    phase: 'action',
    message: `Executing implementation for: ${mockFeature.description}`,
  });

  emitAutoModeEvent({
    type: 'auto_mode_progress',
    featureId,
    content: 'Starting code implementation...',
  });

  await delay(300, featureId);
  if (!mockRunningFeatures.has(featureId)) return;

  // Simulate tool use
  emitAutoModeEvent({
    type: 'auto_mode_tool',
    featureId,
    tool: 'Read',
    input: { file: 'package.json' },
  });

  await delay(300, featureId);
  if (!mockRunningFeatures.has(featureId)) return;

  emitAutoModeEvent({
    type: 'auto_mode_tool',
    featureId,
    tool: 'Write',
    input: { file: 'src/feature.ts', content: '// Feature code' },
  });

  await delay(500, featureId);
  if (!mockRunningFeatures.has(featureId)) return;

  // Phase 3: VERIFICATION
  emitAutoModeEvent({
    type: 'auto_mode_phase',
    featureId,
    phase: 'verification',
    message: `Verifying implementation for: ${mockFeature.description}`,
  });

  emitAutoModeEvent({
    type: 'auto_mode_progress',
    featureId,
    content: 'Verifying implementation and checking test results...',
  });

  await delay(500, featureId);
  if (!mockRunningFeatures.has(featureId)) return;

  emitAutoModeEvent({
    type: 'auto_mode_progress',
    featureId,
    content: '✓ Verification successful: All tests passed',
  });

  // Feature complete
  emitAutoModeEvent({
    type: 'auto_mode_feature_complete',
    featureId,
    passes: true,
    message: 'Feature implemented successfully',
  });

  // Delete context file when feature is verified (matches real auto-mode-service behavior)
  // Now uses features/{id}/agent-output.md path
  const contextFilePath = `${projectPath}/.automaker/features/${featureId}/agent-output.md`;
  delete mockFileSystem[contextFilePath];

  // Clean up this feature from running set
  mockRunningFeatures.delete(featureId);
  mockAutoModeTimeouts.delete(featureId);
}

function delay(ms: number, featureId: string): Promise<void> {
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, ms);
    mockAutoModeTimeouts.set(featureId, timeout);
  });
}

// Mock Spec Regeneration state and implementation
let mockSpecRegenerationRunning = false;
let mockSpecRegenerationPhase = '';
let mockSpecRegenerationCallbacks: ((event: SpecRegenerationEvent) => void)[] = [];
let mockSpecRegenerationTimeout: NodeJS.Timeout | null = null;

function createMockSpecRegenerationAPI(): SpecRegenerationAPI {
  return {
    create: async (
      projectPath: string,
      projectOverview: string,
      generateFeatures = true,
      _analyzeProject?: boolean,
      maxFeatures?: number
    ) => {
      if (mockSpecRegenerationRunning) {
        return { success: false, error: 'Spec creation is already running' };
      }

      mockSpecRegenerationRunning = true;
      console.log(
        `[Mock] Creating initial spec for: ${projectPath}, generateFeatures: ${generateFeatures}, maxFeatures: ${maxFeatures}`
      );

      // Simulate async spec creation
      simulateSpecCreation(projectPath, projectOverview, generateFeatures);

      return { success: true };
    },

    generate: async (
      projectPath: string,
      projectDefinition: string,
      generateFeatures = false,
      _analyzeProject?: boolean,
      maxFeatures?: number
    ) => {
      if (mockSpecRegenerationRunning) {
        return {
          success: false,
          error: 'Spec regeneration is already running',
        };
      }

      mockSpecRegenerationRunning = true;
      console.log(
        `[Mock] Regenerating spec for: ${projectPath}, generateFeatures: ${generateFeatures}, maxFeatures: ${maxFeatures}`
      );

      // Simulate async spec regeneration
      simulateSpecRegeneration(projectPath, projectDefinition, generateFeatures);

      return { success: true };
    },

    generateFeatures: async (projectPath: string, maxFeatures?: number) => {
      if (mockSpecRegenerationRunning) {
        return {
          success: false,
          error: 'Feature generation is already running',
        };
      }

      mockSpecRegenerationRunning = true;
      console.log(
        `[Mock] Generating features from existing spec for: ${projectPath}, maxFeatures: ${maxFeatures}`
      );

      // Simulate async feature generation
      simulateFeatureGeneration(projectPath);

      return { success: true };
    },

    sync: async (projectPath: string) => {
      if (mockSpecRegenerationRunning) {
        return {
          success: false,
          error: 'Spec sync is already running',
        };
      }

      mockSpecRegenerationRunning = true;
      console.log(`[Mock] Syncing spec for: ${projectPath}`);

      // Simulate async spec sync (similar to feature generation but simpler)
      setTimeout(() => {
        emitSpecRegenerationEvent({
          type: 'spec_regeneration_complete',
          message: 'Spec synchronized successfully',
          projectPath,
        });
        mockSpecRegenerationRunning = false;
      }, 1000);

      return { success: true };
    },

    stop: async (_projectPath?: string) => {
      mockSpecRegenerationRunning = false;
      mockSpecRegenerationPhase = '';
      if (mockSpecRegenerationTimeout) {
        clearTimeout(mockSpecRegenerationTimeout);
        mockSpecRegenerationTimeout = null;
      }
      return { success: true };
    },

    status: async (_projectPath?: string) => {
      return {
        success: true,
        isRunning: mockSpecRegenerationRunning,
        currentPhase: mockSpecRegenerationPhase,
      };
    },

    onEvent: (callback: (event: SpecRegenerationEvent) => void) => {
      mockSpecRegenerationCallbacks.push(callback);
      return () => {
        mockSpecRegenerationCallbacks = mockSpecRegenerationCallbacks.filter(
          (cb) => cb !== callback
        );
      };
    },
  };
}

function emitSpecRegenerationEvent(event: SpecRegenerationEvent) {
  mockSpecRegenerationCallbacks.forEach((cb) => cb(event));
}

async function simulateSpecCreation(
  projectPath: string,
  projectOverview: string,
  _generateFeatures = true
) {
  mockSpecRegenerationPhase = 'initialization';
  emitSpecRegenerationEvent({
    type: 'spec_regeneration_progress',
    content: '[Phase: initialization] Starting project analysis...\n',
    projectPath: projectPath,
  });

  await new Promise((resolve) => {
    mockSpecRegenerationTimeout = setTimeout(resolve, 500);
  });
  if (!mockSpecRegenerationRunning) return;

  mockSpecRegenerationPhase = 'setup';
  emitSpecRegenerationEvent({
    type: 'spec_regeneration_tool',
    tool: 'Glob',
    input: { pattern: '**/*.{json,ts,tsx}' },
    projectPath: projectPath,
  });

  await new Promise((resolve) => {
    mockSpecRegenerationTimeout = setTimeout(resolve, 500);
  });
  if (!mockSpecRegenerationRunning) return;

  mockSpecRegenerationPhase = 'analysis';
  emitSpecRegenerationEvent({
    type: 'spec_regeneration_progress',
    content: '[Phase: analysis] Detecting tech stack...\n',
    projectPath: projectPath,
  });

  await new Promise((resolve) => {
    mockSpecRegenerationTimeout = setTimeout(resolve, 500);
  });
  if (!mockSpecRegenerationRunning) return;

  // Write mock app_spec.txt
  mockFileSystem[`${projectPath}/.automaker/app_spec.txt`] = `<project_specification>
  <project_name>Demo Project</project_name>

  <overview>
    ${projectOverview}
  </overview>

  <technology_stack>
    <frontend>
      <framework>Next.js</framework>
      <ui_library>React</ui_library>
      <styling>Tailwind CSS</styling>
    </frontend>
  </technology_stack>

  <core_capabilities>
    <feature_1>Core functionality based on overview</feature_1>
  </core_capabilities>

  <implementation_roadmap>
    <phase_1_foundation>Setup and basic structure</phase_1_foundation>
    <phase_2_core_logic>Core features implementation</phase_2_core_logic>
  </implementation_roadmap>
</project_specification>`;

  // Note: Features are now stored in .automaker/features/{id}/feature.json
  // The generateFeatures parameter is kept for API compatibility but features
  // should be created through the features API

  mockSpecRegenerationPhase = 'complete';
  emitSpecRegenerationEvent({
    type: 'spec_regeneration_complete',
    message: 'All tasks completed!',
    projectPath: projectPath,
  });

  mockSpecRegenerationRunning = false;
  mockSpecRegenerationPhase = '';
  mockSpecRegenerationTimeout = null;
}

async function simulateSpecRegeneration(
  projectPath: string,
  projectDefinition: string,
  generateFeatures = false
) {
  mockSpecRegenerationPhase = 'initialization';
  emitSpecRegenerationEvent({
    type: 'spec_regeneration_progress',
    content: '[Phase: initialization] Starting spec regeneration...\n',
    projectPath: projectPath,
  });

  await new Promise((resolve) => {
    mockSpecRegenerationTimeout = setTimeout(resolve, 500);
  });
  if (!mockSpecRegenerationRunning) return;

  mockSpecRegenerationPhase = 'analysis';
  emitSpecRegenerationEvent({
    type: 'spec_regeneration_progress',
    content: '[Phase: analysis] Analyzing codebase...\n',
    projectPath: projectPath,
  });

  await new Promise((resolve) => {
    mockSpecRegenerationTimeout = setTimeout(resolve, 500);
  });
  if (!mockSpecRegenerationRunning) return;

  // Write regenerated spec
  mockFileSystem[`${projectPath}/.automaker/app_spec.txt`] = `<project_specification>
  <project_name>Regenerated Project</project_name>

  <overview>
    ${projectDefinition}
  </overview>

  <technology_stack>
    <frontend>
      <framework>Next.js</framework>
      <ui_library>React</ui_library>
      <styling>Tailwind CSS</styling>
    </frontend>
  </technology_stack>

  <core_capabilities>
    <feature_1>Regenerated features based on definition</feature_1>
  </core_capabilities>
</project_specification>`;

  if (generateFeatures) {
    mockSpecRegenerationPhase = 'spec_complete';
    emitSpecRegenerationEvent({
      type: 'spec_regeneration_progress',
      content: '[Phase: spec_complete] Spec regenerated! Generating features...\n',
      projectPath: projectPath,
    });

    await new Promise((resolve) => {
      mockSpecRegenerationTimeout = setTimeout(resolve, 500);
    });
    if (!mockSpecRegenerationRunning) return;

    // Simulate feature generation
    await simulateFeatureGeneration(projectPath);
    if (!mockSpecRegenerationRunning) return;
  }

  mockSpecRegenerationPhase = 'complete';
  emitSpecRegenerationEvent({
    type: 'spec_regeneration_complete',
    message: 'All tasks completed!',
    projectPath: projectPath,
  });

  mockSpecRegenerationRunning = false;
  mockSpecRegenerationPhase = '';
  mockSpecRegenerationTimeout = null;
}

async function simulateFeatureGeneration(projectPath: string) {
  mockSpecRegenerationPhase = 'initialization';
  emitSpecRegenerationEvent({
    type: 'spec_regeneration_progress',
    content: '[Phase: initialization] Starting feature generation from existing app_spec.txt...\n',
    projectPath: projectPath,
  });

  await new Promise((resolve) => {
    mockSpecRegenerationTimeout = setTimeout(resolve, 500);
  });
  if (!mockSpecRegenerationRunning) return;

  emitSpecRegenerationEvent({
    type: 'spec_regeneration_progress',
    content: '[Phase: feature_generation] Reading implementation roadmap...\n',
    projectPath: projectPath,
  });

  await new Promise((resolve) => {
    mockSpecRegenerationTimeout = setTimeout(resolve, 500);
  });
  if (!mockSpecRegenerationRunning) return;

  mockSpecRegenerationPhase = 'feature_generation';
  emitSpecRegenerationEvent({
    type: 'spec_regeneration_progress',
    content: '[Phase: feature_generation] Creating features from roadmap...\n',
    projectPath: projectPath,
  });

  await new Promise((resolve) => {
    mockSpecRegenerationTimeout = setTimeout(resolve, 1000);
  });
  if (!mockSpecRegenerationRunning) return;

  mockSpecRegenerationPhase = 'complete';
  emitSpecRegenerationEvent({
    type: 'spec_regeneration_progress',
    content: '[Phase: complete] All tasks completed!\n',
    projectPath: projectPath,
  });

  emitSpecRegenerationEvent({
    type: 'spec_regeneration_complete',
    message: 'All tasks completed!',
    projectPath: projectPath,
  });

  mockSpecRegenerationRunning = false;
  mockSpecRegenerationPhase = '';
  mockSpecRegenerationTimeout = null;
}

// Mock Features API implementation
function createMockFeaturesAPI(): FeaturesAPI {
  // Store features in mock file system using features/{id}/feature.json pattern
  return {
    getAll: async (projectPath: string) => {
      console.log('[Mock] Getting all features for:', projectPath);

      // Check if test has set mock features via global variable
      const testFeatures = window.__mockFeatures;
      if (testFeatures !== undefined) {
        return { success: true, features: testFeatures };
      }

      // Try to read from mock file system
      const featuresDir = `${projectPath}/.automaker/features`;
      const features: Feature[] = [];

      // Simulate reading feature folders
      const featureKeys = Object.keys(mockFileSystem).filter(
        (key) => key.startsWith(featuresDir) && key.endsWith('/feature.json')
      );

      for (const key of featureKeys) {
        try {
          const content = mockFileSystem[key];
          if (content) {
            const feature = JSON.parse(content);
            features.push(feature);
          }
        } catch (error) {
          console.error('[Mock] Failed to parse feature:', error);
        }
      }

      // Fallback to mock features if no features found
      if (features.length === 0) {
        return { success: true, features: mockFeatures };
      }

      return { success: true, features };
    },

    get: async (projectPath: string, featureId: string) => {
      console.log('[Mock] Getting feature:', { projectPath, featureId });
      const featurePath = `${projectPath}/.automaker/features/${featureId}/feature.json`;
      const content = mockFileSystem[featurePath];
      if (content) {
        return { success: true, feature: JSON.parse(content) };
      }
      return { success: false, error: 'Feature not found' };
    },

    create: async (projectPath: string, feature: Feature) => {
      console.log('[Mock] Creating feature:', {
        projectPath,
        featureId: feature.id,
      });
      const featurePath = `${projectPath}/.automaker/features/${feature.id}/feature.json`;
      mockFileSystem[featurePath] = JSON.stringify(feature, null, 2);
      return { success: true, feature };
    },

    update: async (projectPath: string, featureId: string, updates: Partial<Feature>) => {
      console.log('[Mock] Updating feature:', {
        projectPath,
        featureId,
        updates,
      });
      const featurePath = `${projectPath}/.automaker/features/${featureId}/feature.json`;
      const existing = mockFileSystem[featurePath];
      if (!existing) {
        return { success: false, error: 'Feature not found' };
      }
      const feature = { ...JSON.parse(existing), ...updates };
      mockFileSystem[featurePath] = JSON.stringify(feature, null, 2);
      return { success: true, feature };
    },

    delete: async (projectPath: string, featureId: string) => {
      console.log('[Mock] Deleting feature:', { projectPath, featureId });
      const featurePath = `${projectPath}/.automaker/features/${featureId}/feature.json`;
      delete mockFileSystem[featurePath];
      // Also delete agent-output.md if it exists
      const agentOutputPath = `${projectPath}/.automaker/features/${featureId}/agent-output.md`;
      delete mockFileSystem[agentOutputPath];
      return { success: true };
    },

    getAgentOutput: async (projectPath: string, featureId: string) => {
      console.log('[Mock] Getting agent output:', { projectPath, featureId });
      const agentOutputPath = `${projectPath}/.automaker/features/${featureId}/agent-output.md`;
      const content = mockFileSystem[agentOutputPath];
      return { success: true, content: content || null };
    },

    generateTitle: async (description: string, _projectPath?: string) => {
      console.log('[Mock] Generating title for:', description.substring(0, 50));
      // Mock title generation - just take first few words
      const words = description.split(/\s+/).slice(0, 6).join(' ');
      const title = words.length > 40 ? words.substring(0, 40) + '...' : words;
      return { success: true, title: `Add ${title}` };
    },
  };
}

// Mock Running Agents API implementation
function createMockRunningAgentsAPI(): RunningAgentsAPI {
  return {
    getAll: async () => {
      console.log('[Mock] Getting all running agents');
      // Return running agents from mock auto mode state
      const runningAgents: RunningAgent[] = Array.from(mockRunningFeatures).map((featureId) => ({
        featureId,
        projectPath: '/mock/project',
        projectName: 'Mock Project',
        isAutoMode: mockAutoModeRunning,
        title: `Mock Feature Title for ${featureId}`,
        description: 'This is a mock feature description for testing purposes.',
      }));
      return {
        success: true,
        runningAgents,
        totalCount: runningAgents.length,
      };
    },
  };
}

// Mock GitHub API implementation
let mockValidationCallbacks: ((event: IssueValidationEvent) => void)[] = [];

function createMockGitHubAPI(): GitHubAPI {
  return {
    checkRemote: async (projectPath: string) => {
      console.log('[Mock] Checking GitHub remote for:', projectPath);
      return {
        success: true,
        hasGitHubRemote: false,
        remoteUrl: null,
        owner: null,
        repo: null,
      };
    },
    listIssues: async (projectPath: string) => {
      console.log('[Mock] Listing GitHub issues for:', projectPath);
      return {
        success: true,
        openIssues: [],
        closedIssues: [],
      };
    },
    listPRs: async (projectPath: string) => {
      console.log('[Mock] Listing GitHub PRs for:', projectPath);
      return {
        success: true,
        openPRs: [],
        mergedPRs: [],
      };
    },
    validateIssue: async (
      projectPath: string,
      issue: IssueValidationInput,
      model?: ModelId,
      thinkingLevel?: ThinkingLevel,
      reasoningEffort?: ReasoningEffort
    ) => {
      console.log('[Mock] Starting async validation:', {
        projectPath,
        issue,
        model,
        thinkingLevel,
        reasoningEffort,
      });

      // Simulate async validation in background
      setTimeout(() => {
        mockValidationCallbacks.forEach((cb) =>
          cb({
            type: 'issue_validation_start',
            issueNumber: issue.issueNumber,
            issueTitle: issue.issueTitle,
            projectPath,
          })
        );

        setTimeout(() => {
          mockValidationCallbacks.forEach((cb) =>
            cb({
              type: 'issue_validation_complete',
              issueNumber: issue.issueNumber,
              issueTitle: issue.issueTitle,
              result: {
                verdict: 'valid' as const,
                confidence: 'medium' as const,
                reasoning:
                  'This is a mock validation. In production, Claude SDK would analyze the codebase to validate this issue.',
                relatedFiles: ['src/components/example.tsx'],
                estimatedComplexity: 'moderate' as const,
              },
              projectPath,
              model: model || 'claude-sonnet',
            })
          );
        }, 2000);
      }, 100);

      return {
        success: true,
        message: `Validation started for issue #${issue.issueNumber}`,
        issueNumber: issue.issueNumber,
      };
    },
    getValidationStatus: async (projectPath: string, issueNumber?: number) => {
      console.log('[Mock] Getting validation status:', { projectPath, issueNumber });
      return {
        success: true,
        isRunning: false,
        runningIssues: [],
      };
    },
    stopValidation: async (projectPath: string, issueNumber: number) => {
      console.log('[Mock] Stopping validation:', { projectPath, issueNumber });
      return {
        success: true,
        message: `Validation for issue #${issueNumber} stopped`,
      };
    },
    getValidations: async (projectPath: string, issueNumber?: number) => {
      console.log('[Mock] Getting validations:', { projectPath, issueNumber });
      return {
        success: true,
        validations: [],
      };
    },
    markValidationViewed: async (projectPath: string, issueNumber: number) => {
      console.log('[Mock] Marking validation as viewed:', { projectPath, issueNumber });
      return {
        success: true,
      };
    },
    onValidationEvent: (callback: (event: IssueValidationEvent) => void) => {
      mockValidationCallbacks.push(callback);
      return () => {
        mockValidationCallbacks = mockValidationCallbacks.filter((cb) => cb !== callback);
      };
    },
    getIssueComments: async (projectPath: string, issueNumber: number, cursor?: string) => {
      console.log('[Mock] Getting issue comments:', { projectPath, issueNumber, cursor });
      return {
        success: true,
        comments: [],
        totalCount: 0,
        hasNextPage: false,
      };
    },
  };
}

// Utility functions for project management

export interface Project {
  id: string;
  name: string;
  path: string;
  lastOpened?: string;
  theme?: string; // Per-project theme override (uses ThemeMode from app-store)
  fontFamilySans?: string; // Per-project UI/sans font override
  fontFamilyMono?: string; // Per-project code/mono font override
  isFavorite?: boolean; // Pin project to top of dashboard
  icon?: string; // Lucide icon name for project identification
  customIconPath?: string; // Path to custom uploaded icon image in .automaker/images/
  /**
   * Override the active Claude API profile for this project.
   * - undefined: Use global setting (activeClaudeApiProfileId)
   * - null: Explicitly use Direct Anthropic API (no profile)
   * - string: Use specific profile by ID
   * @deprecated Use phaseModelOverrides instead for per-phase model selection
   */
  activeClaudeApiProfileId?: string | null;
  /**
   * Per-phase model overrides for this project.
   * Keys are phase names (e.g., 'enhancementModel'), values are PhaseModelEntry.
   * If a phase is not present, the global setting is used.
   */
  phaseModelOverrides?: Partial<import('@automaker/types').PhaseModelConfig>;
  /**
   * Override the default model for new feature cards in this project.
   * If not specified, falls back to the global defaultFeatureModel setting.
   */
  defaultFeatureModel?: import('@automaker/types').PhaseModelEntry;
}

export interface TrashedProject extends Project {
  trashedAt: string;
  deletedFromDisk?: boolean;
}

export const getStoredProjects = (): Project[] => {
  return getJSON<Project[]>(STORAGE_KEYS.PROJECTS) ?? [];
};

export const saveProjects = (projects: Project[]): void => {
  setJSON(STORAGE_KEYS.PROJECTS, projects);
};

export const getCurrentProject = (): Project | null => {
  return getJSON<Project>(STORAGE_KEYS.CURRENT_PROJECT);
};

export const setCurrentProject = (project: Project | null): void => {
  if (project) {
    setJSON(STORAGE_KEYS.CURRENT_PROJECT, project);
  } else {
    removeItem(STORAGE_KEYS.CURRENT_PROJECT);
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
  return getJSON<TrashedProject[]>(STORAGE_KEYS.TRASHED_PROJECTS) ?? [];
};

export const saveTrashedProjects = (projects: TrashedProject[]): void => {
  setJSON(STORAGE_KEYS.TRASHED_PROJECTS, projects);
};
