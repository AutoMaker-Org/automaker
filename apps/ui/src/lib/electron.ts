// Type definitions for Electron IPC API
import type { SessionListItem, Message } from '@/types/electron';
import type { ClaudeUsageResponse, CodexUsageResponse } from '@/store/app-store';
import type {
  IssueValidationVerdict,
  IssueValidationConfidence,
  IssueComplexity,
  IssueValidationInput,
  IssueValidationResult,
  IssueValidationResponse,
  IssueValidationEvent,
  StoredValidation,
  AgentModel,
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
} from '@automaker/types';
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
    count?: number
  ) => Promise<{ success: boolean; suggestions?: AnalysisSuggestion[]; error?: string }>;

  // Convert to feature
  convertToFeature: (
    projectPath: string,
    ideaId: string,
    options?: ConvertToFeatureOptions
  ) => Promise<{ success: boolean; feature?: any; featureId?: string; error?: string }>;

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
  onStream: (callback: (event: any) => void) => () => void;
  onAnalysisEvent: (callback: (event: any) => void) => () => void;
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

// Feature type - Import from app-store
import type { Feature } from '@/store/app-store';

// Running Agent type
export interface RunningAgent {
  featureId: string;
  projectPath: string;
  projectName: string;
  isAutoMode: boolean;
  title?: string;
  description?: string;
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
    model?: AgentModel
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

// Feature Suggestions types
export interface FeatureSuggestion {
  id: string;
  category: string;
  description: string;
  priority: number;
  reasoning: string;
}

export interface SuggestionsEvent {
  type: 'suggestions_progress' | 'suggestions_tool' | 'suggestions_complete' | 'suggestions_error';
  content?: string;
  tool?: string;
  input?: unknown;
  suggestions?: FeatureSuggestion[];
  error?: string;
}

export type SuggestionType = 'features' | 'refactoring' | 'security' | 'performance';

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
    description: string
  ) => Promise<{ success: boolean; title?: string; error?: string }>;
}

export interface AutoModeAPI {
  start: (
    projectPath: string,
    maxConcurrency?: number
  ) => Promise<{ success: boolean; error?: string }>;
  stop: (
    projectPath: string
  ) => Promise<{ success: boolean; error?: string; runningFeatures?: number }>;
  stopFeature: (featureId: string) => Promise<{ success: boolean; error?: string }>;
  status: (projectPath?: string) => Promise<{
    success: boolean;
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
    worktreePath?: string
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
  suggestions?: SuggestionsAPI;
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
      thinkingLevel?: string
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
    status: () => Promise<{ success: boolean; isRunning?: boolean; error?: string }>;
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
    onEvent: (callback: (data: unknown) => void) => () => void;
  };
  // Setup API surface is implemented by the main process and mirrored by HttpApiClient.
  // Keep this intentionally loose to avoid tight coupling between front-end and server types.
  setup?: any;
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
const mockFeatures = [
  {
    category: 'Core',
    description: 'Sample Feature',
    steps: ['Step 1', 'Step 2'],
    passes: false,
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

  const w = window as any;

  if (w.isElectron === true) {
    return true;
  }

  return !!w.electronAPI?.isElectron;
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
  (window as any).__checkApiMode = () => {
    console.log('Current API mode:', getCurrentApiMode());
    console.log('isElectron():', isElectron());
  };
}

// Mock API for development/fallback when no backend is available
const getMockElectronAPI = (): ElectronAPI => {
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

    // Mock Suggestions API
    suggestions: createMockSuggestionsAPI(),

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
  };
};

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
  storeApiKey: (provider: string, apiKey: string) => Promise<{ success: boolean; error?: string }>;
  getApiKeys: () => Promise<{
    success: boolean;
    hasAnthropicKey: boolean;
    hasGoogleKey: boolean;
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
  onInstallProgress?: (callback: (progress: any) => void) => () => void;
  onAuthProgress?: (callback: (progress: any) => void) => () => void;
}

// Mock Setup API implementation
function createMockSetupAPI(): SetupAPI {
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

    storeApiKey: async (provider: string, apiKey: string) => {
      console.log('[Mock] Storing API key for:', provider);
      // In mock mode, we just pretend to store it (it's already in the app store)
      return { success: true };
    },

    getApiKeys: async () => {
      console.log('[Mock] Getting API keys');
      return {
        success: true,
        hasAnthropicKey: false,
        hasGoogleKey: false,
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

    onInstallProgress: (callback) => {
      // Mock progress events
      return () => {};
    },

    onAuthProgress: (callback) => {
      // Mock auth events
      return () => {};
    },
  };
}

// Mock Worktree API implementation
function createMockWorktreeAPI(): WorktreeAPI {
  return {
    mergeFeature: async (projectPath: string, featureId: string, options?: object) => {
      console.log('[Mock] Merging feature:', {
        projectPath,
        featureId,
        options,
      });
      return { success: true, mergedBranch: `feature/${featureId}` };
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

    listAll: async (projectPath: string, includeDetails?: boolean) => {
      console.log('[Mock] Listing all worktrees:', {
        projectPath,
        includeDetails,
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

    commit: async (worktreePath: string, message: string) => {
      console.log('[Mock] Committing changes:', { worktreePath, message });
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

    push: async (worktreePath: string, force?: boolean) => {
      console.log('[Mock] Pushing worktree:', { worktreePath, force });
      return {
        success: true,
        result: {
          branch: 'feature-branch',
          pushed: true,
          message: 'Successfully pushed to origin/feature-branch',
        },
      };
    },

    createPR: async (worktreePath: string, options?: any) => {
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

    pull: async (worktreePath: string) => {
      console.log('[Mock] Pulling latest changes for:', worktreePath);
      return {
        success: true,
        result: {
          branch: 'main',
          pulled: true,
          message: 'Pulled latest changes',
        },
      };
    },

    checkoutBranch: async (worktreePath: string, branchName: string) => {
      console.log('[Mock] Creating and checking out branch:', {
        worktreePath,
        branchName,
      });
      return {
        success: true,
        result: {
          previousBranch: 'main',
          newBranch: branchName,
          message: `Created and checked out branch '${branchName}'`,
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

    onInitScriptEvent: (callback) => {
      console.log('[Mock] Subscribing to init script events');
      // Return unsubscribe function
      return () => {
        console.log('[Mock] Unsubscribing from init script events');
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
  };
}

// Mock Auto Mode state and implementation
let mockAutoModeRunning = false;
let mockRunningFeatures = new Set<string>(); // Track multiple concurrent feature verifications
let mockAutoModeCallbacks: ((event: AutoModeEvent) => void)[] = [];
let mockAutoModeTimeouts = new Map<string, NodeJS.Timeout>(); // Track timeouts per feature

function createMockAutoModeAPI(): AutoModeAPI {
  return {
    start: async (projectPath: string, maxConcurrency?: number) => {
      if (mockAutoModeRunning) {
        return { success: false, error: 'Auto mode is already running' };
      }

      mockAutoModeRunning = true;
      console.log(`[Mock] Auto mode started with maxConcurrency: ${maxConcurrency || 3}`);
      const featureId = 'auto-mode-0';
      mockRunningFeatures.add(featureId);

      // Simulate auto mode with Plan-Act-Verify phases
      simulateAutoModeLoop(projectPath, featureId);

      return { success: true };
    },

    stop: async (_projectPath: string) => {
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

    resumeFeature: async (projectPath: string, featureId: string, useWorktrees?: boolean) => {
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
      worktreePath?: string
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

// Mock Suggestions state and implementation
let mockSuggestionsRunning = false;
let mockSuggestionsCallbacks: ((event: SuggestionsEvent) => void)[] = [];
let mockSuggestionsTimeout: NodeJS.Timeout | null = null;

function createMockSuggestionsAPI(): SuggestionsAPI {
  return {
    generate: async (projectPath: string, suggestionType: SuggestionType = 'features') => {
      if (mockSuggestionsRunning) {
        return {
          success: false,
          error: 'Suggestions generation is already running',
        };
      }

      mockSuggestionsRunning = true;
      console.log(`[Mock] Generating ${suggestionType} suggestions for: ${projectPath}`);

      // Simulate async suggestion generation
      simulateSuggestionsGeneration(suggestionType);

      return { success: true };
    },

    stop: async () => {
      mockSuggestionsRunning = false;
      if (mockSuggestionsTimeout) {
        clearTimeout(mockSuggestionsTimeout);
        mockSuggestionsTimeout = null;
      }
      return { success: true };
    },

    status: async () => {
      return {
        success: true,
        isRunning: mockSuggestionsRunning,
      };
    },

    onEvent: (callback: (event: SuggestionsEvent) => void) => {
      mockSuggestionsCallbacks.push(callback);
      return () => {
        mockSuggestionsCallbacks = mockSuggestionsCallbacks.filter((cb) => cb !== callback);
      };
    },
  };
}

function emitSuggestionsEvent(event: SuggestionsEvent) {
  mockSuggestionsCallbacks.forEach((cb) => cb(event));
}

async function simulateSuggestionsGeneration(suggestionType: SuggestionType = 'features') {
  const typeLabels: Record<SuggestionType, string> = {
    features: 'feature suggestions',
    refactoring: 'refactoring opportunities',
    security: 'security vulnerabilities',
    performance: 'performance issues',
  };

  // Emit progress events
  emitSuggestionsEvent({
    type: 'suggestions_progress',
    content: `Starting project analysis for ${typeLabels[suggestionType]}...\n`,
  });

  await new Promise((resolve) => {
    mockSuggestionsTimeout = setTimeout(resolve, 500);
  });
  if (!mockSuggestionsRunning) return;

  emitSuggestionsEvent({
    type: 'suggestions_tool',
    tool: 'Glob',
    input: { pattern: '**/*.{ts,tsx,js,jsx}' },
  });

  await new Promise((resolve) => {
    mockSuggestionsTimeout = setTimeout(resolve, 500);
  });
  if (!mockSuggestionsRunning) return;

  emitSuggestionsEvent({
    type: 'suggestions_progress',
    content: 'Analyzing codebase structure...\n',
  });

  await new Promise((resolve) => {
    mockSuggestionsTimeout = setTimeout(resolve, 500);
  });
  if (!mockSuggestionsRunning) return;

  emitSuggestionsEvent({
    type: 'suggestions_progress',
    content: `Identifying ${typeLabels[suggestionType]}...\n`,
  });

  await new Promise((resolve) => {
    mockSuggestionsTimeout = setTimeout(resolve, 500);
  });
  if (!mockSuggestionsRunning) return;

  // Generate mock suggestions based on type
  let mockSuggestions: FeatureSuggestion[];

  switch (suggestionType) {
    case 'refactoring':
      mockSuggestions = [
        {
          id: `suggestion-${Date.now()}-0`,
          category: 'Code Smell',
          description: 'Extract duplicate validation logic into reusable utility',
          priority: 1,
          reasoning: 'Reduces code duplication and improves maintainability',
        },
        {
          id: `suggestion-${Date.now()}-1`,
          category: 'Complexity',
          description: 'Break down large handleSubmit function into smaller functions',
          priority: 2,
          reasoning: 'Function is too long and handles multiple responsibilities',
        },
        {
          id: `suggestion-${Date.now()}-2`,
          category: 'Architecture',
          description: 'Move business logic out of React components into hooks',
          priority: 3,
          reasoning: 'Improves separation of concerns and testability',
        },
      ];
      break;

    case 'security':
      mockSuggestions = [
        {
          id: `suggestion-${Date.now()}-0`,
          category: 'High',
          description: 'Sanitize user input before rendering to prevent XSS',
          priority: 1,
          reasoning: 'User input is rendered without proper sanitization',
        },
        {
          id: `suggestion-${Date.now()}-1`,
          category: 'Medium',
          description: 'Add rate limiting to authentication endpoints',
          priority: 2,
          reasoning: 'Prevents brute force attacks on authentication',
        },
        {
          id: `suggestion-${Date.now()}-2`,
          category: 'Low',
          description: 'Remove sensitive information from error messages',
          priority: 3,
          reasoning: 'Error messages may leak implementation details',
        },
      ];
      break;

    case 'performance':
      mockSuggestions = [
        {
          id: `suggestion-${Date.now()}-0`,
          category: 'Rendering',
          description: 'Add React.memo to prevent unnecessary re-renders',
          priority: 1,
          reasoning: "Components re-render even when props haven't changed",
        },
        {
          id: `suggestion-${Date.now()}-1`,
          category: 'Bundle Size',
          description: 'Implement code splitting for route components',
          priority: 2,
          reasoning: 'Initial bundle is larger than necessary',
        },
        {
          id: `suggestion-${Date.now()}-2`,
          category: 'Caching',
          description: 'Add memoization for expensive computations',
          priority: 3,
          reasoning: 'Expensive computations run on every render',
        },
      ];
      break;

    default: // "features"
      mockSuggestions = [
        {
          id: `suggestion-${Date.now()}-0`,
          category: 'User Experience',
          description: 'Add dark mode toggle with system preference detection',
          priority: 1,
          reasoning: 'Dark mode is a standard feature that improves accessibility and user comfort',
        },
        {
          id: `suggestion-${Date.now()}-1`,
          category: 'Performance',
          description: 'Implement lazy loading for heavy components',
          priority: 2,
          reasoning: 'Improves initial load time and reduces bundle size',
        },
        {
          id: `suggestion-${Date.now()}-2`,
          category: 'Accessibility',
          description: 'Add keyboard navigation support throughout the app',
          priority: 3,
          reasoning: 'Improves accessibility for users who rely on keyboard navigation',
        },
      ];
  }

  emitSuggestionsEvent({
    type: 'suggestions_complete',
    suggestions: mockSuggestions,
  });

  mockSuggestionsRunning = false;
  mockSuggestionsTimeout = null;
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
  generateFeatures = true
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
      const testFeatures = (window as any).__mockFeatures;
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

    generateTitle: async (description: string) => {
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
    validateIssue: async (projectPath: string, issue: IssueValidationInput, model?: AgentModel) => {
      console.log('[Mock] Starting async validation:', { projectPath, issue, model });

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
              model: model || 'sonnet',
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
  isFavorite?: boolean; // Pin project to top of dashboard
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
