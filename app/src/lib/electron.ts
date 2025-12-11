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

// Import types for internal use in this file
import type {
  AutoModeEvent,
  WorktreeAPI,
  GitAPI,
  ModelDefinition,
  ProviderStatus,
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
  stop: () => Promise<{ success: boolean; error?: string }>;
  status: () => Promise<{
    success: boolean;
    isRunning?: boolean;
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

// Code Review types
export interface ReviewIssue {
  severity: "error" | "warning" | "info";
  message: string;
  file?: string;
  line?: number;
  column?: number;
  code?: string;
}

export interface ReviewCheck {
  name: string;
  passed: boolean;
  duration?: number;
  issues: ReviewIssue[];
}

export interface ReviewResults {
  overallPass: boolean;
  timestamp: string;
  checks: ReviewCheck[];
}

export type CodeReviewEvent =
  | { type: "review_start"; featureId: string; projectPath: string }
  | { type: "review_progress"; featureId: string; check: string; message: string }
  | { type: "review_complete"; featureId: string; results: ReviewResults }
  | { type: "review_error"; featureId: string; error: string };

export interface CodeReviewAPI {
  runReview: (
    projectPath: string,
    featureId: string,
    options?: {
      checks?: ("typescript" | "build" | "patterns")[];
      agent?: string;
    }
  ) => Promise<{
    success: boolean;
    results?: ReviewResults;
    error?: string;
  }>;
  runReviewWithFixes: (
    projectPath: string,
    featureId: string,
    options?: {
      checks?: ("typescript" | "build" | "patterns")[];
      agent?: string;
    }
  ) => Promise<{
    success: boolean;
    results?: ReviewResults;
    attempts?: number;
    maxAttemptsReached?: boolean;
    error?: string;
  }>;
  getFeatureDiff: (
    projectPath: string,
    featureId: string
  ) => Promise<{
    success: boolean;
    diff?: string;
    files?: string[];
  }>;
  onEvent: (callback: (event: CodeReviewEvent) => void) => () => void;
  stop?: (featureId: string) => Promise<{ success: boolean; error?: string }>;
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
  codeReview?: CodeReviewAPI;
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
      requiresManualAuth?: boolean;
      command?: string;
      error?: string;
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

// Note: Window interface is declared in @/types/electron.d.ts
// Do not redeclare here to avoid type conflicts

// Mock data for web development
const mockFeatures = [
  {
    category: "Core",
    description: "Sample Feature",
    steps: ["Step 1", "Step 2"],
    passes: false,
  },
];

// Local storage keys
const STORAGE_KEYS = {
  PROJECTS: "automaker_projects",
  CURRENT_PROJECT: "automaker_current_project",
  TRASHED_PROJECTS: "automaker_trashed_projects",
} as const;

// Mock file system using localStorage
const mockFileSystem: Record<string, string> = {};

// Check if we're in Electron
export const isElectron = (): boolean => {
  return typeof window !== "undefined" && window.isElectron === true;
};

// Get the Electron API or a mock for web development
export const getElectronAPI = (): ElectronAPI => {
  if (isElectron() && window.electronAPI) {
    return window.electronAPI;
  }

  // Return mock API for web development
  return {
    ping: async () => "pong (mock)",

    openExternalLink: async (url: string) => {
      // In web mode, open in a new tab
      window.open(url, "_blank", "noopener,noreferrer");
      return { success: true };
    },

    openDirectory: async () => {
      // In web mode, we'll use a prompt to simulate directory selection
      const path = prompt(
        "Enter project directory path:",
        "/Users/demo/project"
      );
      return {
        canceled: !path,
        filePaths: path ? [path] : [],
      };
    },

    openFile: async () => {
      const path = prompt("Enter file path:");
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
      if (filePath.endsWith("categories.json")) {
        // Return empty array for categories when file doesn't exist yet
        return { success: true, content: "[]" };
      }
      if (filePath.endsWith("app_spec.txt")) {
        return {
          success: true,
          content:
            "<project_specification>\n  <project_name>Demo Project</project_name>\n</project_specification>",
        };
      }
      // For any file in mock features directory, check mock file system
      if (filePath.includes(".automaker/features/")) {
        if (mockFileSystem[filePath] !== undefined) {
          return { success: true, content: mockFileSystem[filePath] };
        }
        // Return empty string for agent-output.md if it doesn't exist
        if (filePath.endsWith("/agent-output.md")) {
          return { success: true, content: "" };
        }
      }
      return { success: false, error: "File not found (mock)" };
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
        if (dirPath.includes(".automaker/context")) {
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
            .filter((entry) => !entry.name.includes("/")); // Only direct children
          return { success: true, entries: contextFiles };
        }
        // Root level
        if (
          !dirPath.includes("/src") &&
          !dirPath.includes("/tests") &&
          !dirPath.includes("/public") &&
          !dirPath.includes(".automaker")
        ) {
          return {
            success: true,
            entries: [
              { name: "src", isDirectory: true, isFile: false },
              { name: "tests", isDirectory: true, isFile: false },
              { name: "public", isDirectory: true, isFile: false },
              { name: ".automaker", isDirectory: true, isFile: false },
              { name: "package.json", isDirectory: false, isFile: true },
              { name: "tsconfig.json", isDirectory: false, isFile: true },
              { name: "app_spec.txt", isDirectory: false, isFile: true },
              { name: "features", isDirectory: true, isFile: false },
              { name: "README.md", isDirectory: false, isFile: true },
            ],
          };
        }
        // src directory
        if (dirPath.endsWith("/src")) {
          return {
            success: true,
            entries: [
              { name: "components", isDirectory: true, isFile: false },
              { name: "lib", isDirectory: true, isFile: false },
              { name: "app", isDirectory: true, isFile: false },
              { name: "index.ts", isDirectory: false, isFile: true },
              { name: "utils.ts", isDirectory: false, isFile: true },
            ],
          };
        }
        // src/components directory
        if (dirPath.endsWith("/components")) {
          return {
            success: true,
            entries: [
              { name: "Button.tsx", isDirectory: false, isFile: true },
              { name: "Card.tsx", isDirectory: false, isFile: true },
              { name: "Header.tsx", isDirectory: false, isFile: true },
              { name: "Footer.tsx", isDirectory: false, isFile: true },
            ],
          };
        }
        // src/lib directory
        if (dirPath.endsWith("/lib")) {
          return {
            success: true,
            entries: [
              { name: "api.ts", isDirectory: false, isFile: true },
              { name: "helpers.ts", isDirectory: false, isFile: true },
            ],
          };
        }
        // src/app directory
        if (dirPath.endsWith("/app")) {
          return {
            success: true,
            entries: [
              { name: "page.tsx", isDirectory: false, isFile: true },
              { name: "layout.tsx", isDirectory: false, isFile: true },
              { name: "globals.css", isDirectory: false, isFile: true },
            ],
          };
        }
        // tests directory
        if (dirPath.endsWith("/tests")) {
          return {
            success: true,
            entries: [
              { name: "unit.test.ts", isDirectory: false, isFile: true },
              { name: "e2e.spec.ts", isDirectory: false, isFile: true },
            ],
          };
        }
        // public directory
        if (dirPath.endsWith("/public")) {
          return {
            success: true,
            entries: [
              { name: "favicon.ico", isDirectory: false, isFile: true },
              { name: "logo.svg", isDirectory: false, isFile: true },
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
      if (
        filePath.endsWith("app_spec.txt") &&
        !filePath.includes(".automaker")
      ) {
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
      if (name === "userData") {
        return "/mock/userData";
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
      const safeName = filename.replace(/[^a-zA-Z0-9.-]/g, "_");
      const tempFilePath = projectPath
        ? `${projectPath}/.automaker/images/${timestamp}_${safeName}`
        : `/tmp/automaker-images/${timestamp}_${safeName}`;

      // Store the image data in mock file system for testing
      mockFileSystem[tempFilePath] = data;

      console.log("[Mock] Saved image to temp:", tempFilePath);
      return { success: true, path: tempFilePath };
    },

    checkClaudeCli: async () => ({
      success: false,
      status: "not_installed",
      recommendation: "Claude CLI checks are unavailable in the web preview.",
    }),

    checkCodexCli: async () => ({
      success: false,
      status: "not_installed",
      recommendation: "Codex CLI checks are unavailable in the web preview.",
    }),

    model: {
      getAvailable: async () => ({ success: true, models: [] }),
      checkProviders: async () => ({ success: true, providers: {} }),
    },

    testOpenAIConnection: async () => ({
      success: false,
      error: "OpenAI connection test is only available in the Electron app.",
    }),

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

    // Mock Code Review API
    codeReview: createMockCodeReviewAPI(),
  };
};

// Setup API interface
interface SetupAPI {
  getClaudeStatus: () => Promise<{
    success: boolean;
    status?: string;
    method?: string;
    version?: string;
    path?: string;
    auth?: {
      authenticated: boolean;
      method: string;
      hasCredentialsFile: boolean;
      hasToken: boolean;
      hasStoredOAuthToken?: boolean;
      hasStoredApiKey?: boolean;
      hasEnvApiKey?: boolean;
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
    requiresManualAuth?: boolean;
    command?: string;
    error?: string;
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
}

// Mock Setup API implementation
function createMockSetupAPI(): SetupAPI {
  return {
    getClaudeStatus: async () => {
      console.log("[Mock] Getting Claude status");
      return {
        success: true,
        status: "not_installed",
        auth: {
          authenticated: false,
          method: "none",
          hasCredentialsFile: false,
          hasToken: false,
        },
      };
    },

    getCodexStatus: async () => {
      console.log("[Mock] Getting Codex status");
      return {
        success: true,
        status: "not_installed",
        auth: {
          authenticated: false,
          method: "none",
          hasAuthFile: false,
          hasEnvKey: false,
        },
      };
    },

    installClaude: async () => {
      console.log("[Mock] Installing Claude CLI");
      // Simulate installation delay
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return {
        success: false,
        error:
          "CLI installation is only available in the Electron app. Please run the command manually.",
      };
    },

    installCodex: async () => {
      console.log("[Mock] Installing Codex CLI");
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return {
        success: false,
        error:
          "CLI installation is only available in the Electron app. Please run the command manually.",
      };
    },

    authClaude: async () => {
      console.log("[Mock] Auth Claude CLI");
      return {
        success: true,
        requiresManualAuth: true,
        command: "claude login",
      };
    },

    authCodex: async (apiKey?: string) => {
      console.log("[Mock] Auth Codex CLI", { hasApiKey: !!apiKey });
      if (apiKey) {
        return { success: true };
      }
      return {
        success: true,
        requiresManualAuth: true,
        command: "codex auth login",
      };
    },

    storeApiKey: async (provider: string, apiKey: string) => {
      console.log("[Mock] Storing API key for:", provider);
      // In mock mode, we just pretend to store it (it's already in the app store)
      return { success: true };
    },

    getApiKeys: async () => {
      console.log("[Mock] Getting API keys");
      return {
        success: true,
        hasAnthropicKey: false,
        hasOpenAIKey: false,
        hasGoogleKey: false,
      };
    },

    configureCodexMcp: async (projectPath: string) => {
      console.log("[Mock] Configuring Codex MCP for:", projectPath);
      return {
        success: true,
        configPath: `${projectPath}/.codex/config.toml`,
      };
    },

    getPlatform: async () => {
      return {
        success: true,
        platform: "darwin",
        arch: "arm64",
        homeDir: "/Users/mock",
        isWindows: false,
        isMac: true,
        isLinux: false,
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
    revertFeature: async (projectPath: string, featureId: string) => {
      console.log("[Mock] Reverting feature:", { projectPath, featureId });
      return { success: true, removedPath: `/mock/worktree/${featureId}` };
    },

    mergeFeature: async (
      projectPath: string,
      featureId: string,
      options?: object
    ) => {
      console.log("[Mock] Merging feature:", {
        projectPath,
        featureId,
        options,
      });
      return { success: true, mergedBranch: `feature/${featureId}` };
    },

    getInfo: async (projectPath: string, featureId: string) => {
      console.log("[Mock] Getting worktree info:", { projectPath, featureId });
      return {
        success: true,
        worktreePath: `/mock/worktrees/${featureId}`,
        branchName: `feature/${featureId}`,
        head: "abc1234",
      };
    },

    getStatus: async (projectPath: string, featureId: string) => {
      console.log("[Mock] Getting worktree status:", {
        projectPath,
        featureId,
      });
      return {
        success: true,
        modifiedFiles: 3,
        files: ["src/feature.ts", "tests/feature.spec.ts", "README.md"],
        diffStat: " 3 files changed, 50 insertions(+), 10 deletions(-)",
        recentCommits: [
          "abc1234 feat: implement feature",
          "def5678 test: add tests for feature",
        ],
      };
    },

    list: async (projectPath: string) => {
      console.log("[Mock] Listing worktrees:", { projectPath });
      return { success: true, worktrees: [] };
    },

    getDiffs: async (projectPath: string, featureId: string) => {
      console.log("[Mock] Getting file diffs:", { projectPath, featureId });
      return {
        success: true,
        diff: "diff --git a/src/feature.ts b/src/feature.ts\n+++ new file\n@@ -0,0 +1,10 @@\n+export function feature() {\n+  return 'hello';\n+}",
        files: [
          { status: "A", path: "src/feature.ts", statusText: "Added" },
          { status: "M", path: "README.md", statusText: "Modified" },
        ],
        hasChanges: true,
      };
    },

    getFileDiff: async (
      projectPath: string,
      featureId: string,
      filePath: string
    ) => {
      console.log("[Mock] Getting file diff:", {
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
  };
}

// Mock Git API implementation (for non-worktree operations)
function createMockGitAPI(): GitAPI {
  return {
    getDiffs: async (projectPath: string) => {
      console.log("[Mock] Getting git diffs for project:", { projectPath });
      return {
        success: true,
        diff: "diff --git a/src/feature.ts b/src/feature.ts\n+++ new file\n@@ -0,0 +1,10 @@\n+export function feature() {\n+  return 'hello';\n+}",
        files: [
          { status: "A", path: "src/feature.ts", statusText: "Added" },
          { status: "M", path: "README.md", statusText: "Modified" },
        ],
        hasChanges: true,
      };
    },

    getFileDiff: async (projectPath: string, filePath: string) => {
      console.log("[Mock] Getting git file diff:", { projectPath, filePath });
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
        return { success: false, error: "Auto mode is already running" };
      }

      mockAutoModeRunning = true;
      console.log(
        `[Mock] Auto mode started with maxConcurrency: ${maxConcurrency || 3}`
      );
      const featureId = "auto-mode-0";
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
        type: "auto_mode_feature_complete",
        featureId,
        passes: false,
        message: "Feature stopped by user",
      });

      return { success: true };
    },

    status: async (_projectPath?: string) => {
      return {
        success: true,
        isRunning: mockAutoModeRunning,
        autoLoopRunning: mockAutoModeRunning,
        currentFeatureId: mockAutoModeRunning ? "feature-0" : null,
        runningFeatures: Array.from(mockRunningFeatures),
        runningCount: mockRunningFeatures.size,
      };
    },

    runFeature: async (
      projectPath: string,
      featureId: string,
      useWorktrees?: boolean
    ) => {
      if (mockRunningFeatures.has(featureId)) {
        return {
          success: false,
          error: `Feature ${featureId} is already running`,
        };
      }

      console.log(
        `[Mock] Running feature ${featureId} with useWorktrees: ${useWorktrees}`
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

    resumeFeature: async (projectPath: string, featureId: string) => {
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
        mockFileSystem[
          `${projectPath}/.automaker/features/${featureId}/agent-output.md`
        ] !== undefined;
      return { success: true, exists };
    },

    analyzeProject: async (projectPath: string) => {
      // Simulate project analysis
      const analysisId = `project-analysis-${Date.now()}`;
      mockRunningFeatures.add(analysisId);

      // Emit start event
      emitAutoModeEvent({
        type: "auto_mode_feature_start",
        featureId: analysisId,
        feature: {
          id: analysisId,
          category: "Project Analysis",
          description: "Analyzing project structure and tech stack",
        },
      });

      // Simulate analysis phases
      await delay(300, analysisId);
      if (!mockRunningFeatures.has(analysisId))
        return { success: false, message: "Analysis aborted" };

      emitAutoModeEvent({
        type: "auto_mode_phase",
        featureId: analysisId,
        phase: "planning",
        message: "Scanning project structure...",
      });

      emitAutoModeEvent({
        type: "auto_mode_progress",
        featureId: analysisId,
        content: "Starting project analysis...\n",
      });

      await delay(500, analysisId);
      if (!mockRunningFeatures.has(analysisId))
        return { success: false, message: "Analysis aborted" };

      emitAutoModeEvent({
        type: "auto_mode_tool",
        featureId: analysisId,
        tool: "Glob",
        input: { pattern: "**/*" },
      });

      await delay(300, analysisId);
      if (!mockRunningFeatures.has(analysisId))
        return { success: false, message: "Analysis aborted" };

      emitAutoModeEvent({
        type: "auto_mode_progress",
        featureId: analysisId,
        content: "Detected tech stack: Next.js, TypeScript, Tailwind CSS\n",
      });

      await delay(300, analysisId);
      if (!mockRunningFeatures.has(analysisId))
        return { success: false, message: "Analysis aborted" };

      // Write mock app_spec.txt
      mockFileSystem[
        `${projectPath}/.automaker/app_spec.txt`
      ] = `<project_specification>
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
        type: "auto_mode_phase",
        featureId: analysisId,
        phase: "verification",
        message: "Project analysis complete",
      });

      emitAutoModeEvent({
        type: "auto_mode_feature_complete",
        featureId: analysisId,
        passes: true,
        message: "Project analyzed successfully",
      });

      mockRunningFeatures.delete(analysisId);
      mockAutoModeTimeouts.delete(analysisId);

      return { success: true, message: "Project analyzed successfully" };
    },

    followUpFeature: async (
      projectPath: string,
      featureId: string,
      prompt: string,
      imagePaths?: string[]
    ) => {
      if (mockRunningFeatures.has(featureId)) {
        return {
          success: false,
          error: `Feature ${featureId} is already running`,
        };
      }

      console.log("[Mock] Follow-up feature:", {
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

    commitFeature: async (projectPath: string, featureId: string) => {
      console.log("[Mock] Committing feature:", { projectPath, featureId });

      // Simulate commit operation
      emitAutoModeEvent({
        type: "auto_mode_feature_start",
        featureId,
        feature: {
          id: featureId,
          category: "Commit",
          description: "Committing changes",
        },
      });

      await delay(300, featureId);

      emitAutoModeEvent({
        type: "auto_mode_phase",
        featureId,
        phase: "action",
        message: "Committing changes to git...",
      });

      await delay(500, featureId);

      emitAutoModeEvent({
        type: "auto_mode_feature_complete",
        featureId,
        passes: true,
        message: "Changes committed successfully",
      });

      return { success: true };
    },

    onEvent: (callback: (event: AutoModeEvent) => void) => {
      mockAutoModeCallbacks.push(callback);
      return () => {
        mockAutoModeCallbacks = mockAutoModeCallbacks.filter(
          (cb) => cb !== callback
        );
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
    category: "Core",
    description: "Sample Feature",
    steps: ["Step 1", "Step 2"],
    passes: false,
  };

  // Start feature
  emitAutoModeEvent({
    type: "auto_mode_feature_start",
    featureId,
    feature: mockFeature,
  });

  await delay(300, featureId);
  if (!mockRunningFeatures.has(featureId)) return;

  // Phase 1: PLANNING
  emitAutoModeEvent({
    type: "auto_mode_phase",
    featureId,
    phase: "planning",
    message: `Planning implementation for: ${mockFeature.description}`,
  });

  emitAutoModeEvent({
    type: "auto_mode_progress",
    featureId,
    content: "Analyzing codebase structure and creating implementation plan...",
  });

  await delay(500, featureId);
  if (!mockRunningFeatures.has(featureId)) return;

  // Phase 2: ACTION
  emitAutoModeEvent({
    type: "auto_mode_phase",
    featureId,
    phase: "action",
    message: `Executing implementation for: ${mockFeature.description}`,
  });

  emitAutoModeEvent({
    type: "auto_mode_progress",
    featureId,
    content: "Starting code implementation...",
  });

  await delay(300, featureId);
  if (!mockRunningFeatures.has(featureId)) return;

  // Simulate tool use
  emitAutoModeEvent({
    type: "auto_mode_tool",
    featureId,
    tool: "Read",
    input: { file: "package.json" },
  });

  await delay(300, featureId);
  if (!mockRunningFeatures.has(featureId)) return;

  emitAutoModeEvent({
    type: "auto_mode_tool",
    featureId,
    tool: "Write",
    input: { file: "src/feature.ts", content: "// Feature code" },
  });

  await delay(500, featureId);
  if (!mockRunningFeatures.has(featureId)) return;

  // Phase 3: VERIFICATION
  emitAutoModeEvent({
    type: "auto_mode_phase",
    featureId,
    phase: "verification",
    message: `Verifying implementation for: ${mockFeature.description}`,
  });

  emitAutoModeEvent({
    type: "auto_mode_progress",
    featureId,
    content: "Verifying implementation and checking test results...",
  });

  await delay(500, featureId);
  if (!mockRunningFeatures.has(featureId)) return;

  emitAutoModeEvent({
    type: "auto_mode_progress",
    featureId,
    content: "✓ Verification successful: All tests passed",
  });

  // Feature complete
  emitAutoModeEvent({
    type: "auto_mode_feature_complete",
    featureId,
    passes: true,
    message: "Feature implemented successfully",
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
    generate: async (
      projectPath: string,
      suggestionType: SuggestionType = "features"
    ) => {
      if (mockSuggestionsRunning) {
        return {
          success: false,
          error: "Suggestions generation is already running",
        };
      }

      mockSuggestionsRunning = true;
      console.log(
        `[Mock] Generating ${suggestionType} suggestions for: ${projectPath}`
      );

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
        mockSuggestionsCallbacks = mockSuggestionsCallbacks.filter(
          (cb) => cb !== callback
        );
      };
    },
  };
}

function emitSuggestionsEvent(event: SuggestionsEvent) {
  mockSuggestionsCallbacks.forEach((cb) => cb(event));
}

async function simulateSuggestionsGeneration(
  suggestionType: SuggestionType = "features"
) {
  const typeLabels: Record<SuggestionType, string> = {
    features: "feature suggestions",
    refactoring: "refactoring opportunities",
    security: "security vulnerabilities",
    performance: "performance issues",
  };

  // Emit progress events
  emitSuggestionsEvent({
    type: "suggestions_progress",
    content: `Starting project analysis for ${typeLabels[suggestionType]}...\n`,
  });

  await new Promise((resolve) => {
    mockSuggestionsTimeout = setTimeout(resolve, 500);
  });
  if (!mockSuggestionsRunning) return;

  emitSuggestionsEvent({
    type: "suggestions_tool",
    tool: "Glob",
    input: { pattern: "**/*.{ts,tsx,js,jsx}" },
  });

  await new Promise((resolve) => {
    mockSuggestionsTimeout = setTimeout(resolve, 500);
  });
  if (!mockSuggestionsRunning) return;

  emitSuggestionsEvent({
    type: "suggestions_progress",
    content: "Analyzing codebase structure...\n",
  });

  await new Promise((resolve) => {
    mockSuggestionsTimeout = setTimeout(resolve, 500);
  });
  if (!mockSuggestionsRunning) return;

  emitSuggestionsEvent({
    type: "suggestions_progress",
    content: `Identifying ${typeLabels[suggestionType]}...\n`,
  });

  await new Promise((resolve) => {
    mockSuggestionsTimeout = setTimeout(resolve, 500);
  });
  if (!mockSuggestionsRunning) return;

  // Generate mock suggestions based on type
  let mockSuggestions: FeatureSuggestion[];

  switch (suggestionType) {
    case "refactoring":
      mockSuggestions = [
        {
          id: `suggestion-${Date.now()}-0`,
          category: "Code Smell",
          description:
            "Extract duplicate validation logic into reusable utility",
          steps: [
            "Identify all files with similar validation patterns",
            "Create a validation utilities module",
            "Replace duplicate code with utility calls",
            "Add unit tests for the new utilities",
          ],
          priority: 1,
          reasoning: "Reduces code duplication and improves maintainability",
        },
        {
          id: `suggestion-${Date.now()}-1`,
          category: "Complexity",
          description:
            "Break down large handleSubmit function into smaller functions",
          steps: [
            "Identify the handleSubmit function in form components",
            "Extract validation logic into separate function",
            "Extract API call logic into separate function",
            "Extract success/error handling into separate functions",
          ],
          priority: 2,
          reasoning:
            "Function is too long and handles multiple responsibilities",
        },
        {
          id: `suggestion-${Date.now()}-2`,
          category: "Architecture",
          description: "Move business logic out of React components into hooks",
          steps: [
            "Identify business logic in component files",
            "Create custom hooks for reusable logic",
            "Update components to use the new hooks",
            "Add tests for the extracted hooks",
          ],
          priority: 3,
          reasoning: "Improves separation of concerns and testability",
        },
      ];
      break;

    case "security":
      mockSuggestions = [
        {
          id: `suggestion-${Date.now()}-0`,
          category: "High",
          description: "Sanitize user input before rendering to prevent XSS",
          steps: [
            "Audit all places where user input is rendered",
            "Implement input sanitization using DOMPurify",
            "Add Content-Security-Policy headers",
            "Test with common XSS payloads",
          ],
          priority: 1,
          reasoning: "User input is rendered without proper sanitization",
        },
        {
          id: `suggestion-${Date.now()}-1`,
          category: "Medium",
          description: "Add rate limiting to authentication endpoints",
          steps: [
            "Implement rate limiting middleware",
            "Configure limits for login attempts",
            "Add account lockout after failed attempts",
            "Log suspicious activity",
          ],
          priority: 2,
          reasoning: "Prevents brute force attacks on authentication",
        },
        {
          id: `suggestion-${Date.now()}-2`,
          category: "Low",
          description: "Remove sensitive information from error messages",
          steps: [
            "Audit error handling in API routes",
            "Create generic error messages for production",
            "Log detailed errors server-side only",
            "Implement proper error boundaries",
          ],
          priority: 3,
          reasoning: "Error messages may leak implementation details",
        },
      ];
      break;

    case "performance":
      mockSuggestions = [
        {
          id: `suggestion-${Date.now()}-0`,
          category: "Rendering",
          description: "Add React.memo to prevent unnecessary re-renders",
          steps: [
            "Profile component renders with React DevTools",
            "Identify components that re-render unnecessarily",
            "Wrap pure components with React.memo",
            "Use useCallback for event handlers passed as props",
          ],
          priority: 1,
          reasoning: "Components re-render even when props haven't changed",
        },
        {
          id: `suggestion-${Date.now()}-1`,
          category: "Bundle Size",
          description: "Implement code splitting for route components",
          steps: [
            "Use React.lazy for route components",
            "Add Suspense boundaries with loading states",
            "Analyze bundle with webpack-bundle-analyzer",
            "Consider dynamic imports for heavy libraries",
          ],
          priority: 2,
          reasoning: "Initial bundle is larger than necessary",
        },
        {
          id: `suggestion-${Date.now()}-2`,
          category: "Caching",
          description: "Add memoization for expensive computations",
          steps: [
            "Identify expensive calculations in render",
            "Use useMemo for derived data",
            "Consider using react-query for server state",
            "Add caching headers for static assets",
          ],
          priority: 3,
          reasoning: "Expensive computations run on every render",
        },
      ];
      break;

    default: // "features"
      mockSuggestions = [
        {
          id: `suggestion-${Date.now()}-0`,
          category: "User Experience",
          description: "Add dark mode toggle with system preference detection",
          steps: [
            "Create a ThemeProvider context to manage theme state",
            "Add a toggle component in the settings or header",
            "Implement CSS variables for theme colors",
            "Add localStorage persistence for user preference",
          ],
          priority: 1,
          reasoning:
            "Dark mode is a standard feature that improves accessibility and user comfort",
        },
        {
          id: `suggestion-${Date.now()}-1`,
          category: "Performance",
          description: "Implement lazy loading for heavy components",
          steps: [
            "Identify components that are heavy or rarely used",
            "Use React.lazy() and Suspense for code splitting",
            "Add loading states for lazy-loaded components",
          ],
          priority: 2,
          reasoning: "Improves initial load time and reduces bundle size",
        },
        {
          id: `suggestion-${Date.now()}-2`,
          category: "Accessibility",
          description: "Add keyboard navigation support throughout the app",
          steps: [
            "Implement focus management for modals and dialogs",
            "Add keyboard shortcuts for common actions",
            "Ensure all interactive elements are focusable",
            "Add ARIA labels and roles where needed",
          ],
          priority: 3,
          reasoning:
            "Improves accessibility for users who rely on keyboard navigation",
        },
      ];
  }

  emitSuggestionsEvent({
    type: "suggestions_complete",
    suggestions: mockSuggestions,
  });

  mockSuggestionsRunning = false;
  mockSuggestionsTimeout = null;
}

// Mock Spec Regeneration state and implementation
let mockSpecRegenerationRunning = false;
let mockSpecRegenerationCallbacks: ((event: SpecRegenerationEvent) => void)[] =
  [];
let mockSpecRegenerationTimeout: NodeJS.Timeout | null = null;

function createMockSpecRegenerationAPI(): SpecRegenerationAPI {
  return {
    create: async (
      projectPath: string,
      projectOverview: string,
      generateFeatures = true
    ) => {
      if (mockSpecRegenerationRunning) {
        return { success: false, error: "Spec creation is already running" };
      }

      mockSpecRegenerationRunning = true;
      console.log(
        `[Mock] Creating initial spec for: ${projectPath}, generateFeatures: ${generateFeatures}`
      );

      // Simulate async spec creation
      simulateSpecCreation(projectPath, projectOverview, generateFeatures);

      return { success: true };
    },

    generate: async (projectPath: string, projectDefinition: string) => {
      if (mockSpecRegenerationRunning) {
        return {
          success: false,
          error: "Spec regeneration is already running",
        };
      }

      mockSpecRegenerationRunning = true;
      console.log(`[Mock] Regenerating spec for: ${projectPath}`);

      // Simulate async spec regeneration
      simulateSpecRegeneration(projectPath, projectDefinition);

      return { success: true };
    },

    stop: async () => {
      mockSpecRegenerationRunning = false;
      if (mockSpecRegenerationTimeout) {
        clearTimeout(mockSpecRegenerationTimeout);
        mockSpecRegenerationTimeout = null;
      }
      return { success: true };
    },

    status: async () => {
      return {
        success: true,
        isRunning: mockSpecRegenerationRunning,
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
  emitSpecRegenerationEvent({
    type: "spec_regeneration_progress",
    content: "Starting project analysis...\n",
  });

  await new Promise((resolve) => {
    mockSpecRegenerationTimeout = setTimeout(resolve, 500);
  });
  if (!mockSpecRegenerationRunning) return;

  emitSpecRegenerationEvent({
    type: "spec_regeneration_tool",
    tool: "Glob",
    input: { pattern: "**/*.{json,ts,tsx}" },
  });

  await new Promise((resolve) => {
    mockSpecRegenerationTimeout = setTimeout(resolve, 500);
  });
  if (!mockSpecRegenerationRunning) return;

  emitSpecRegenerationEvent({
    type: "spec_regeneration_progress",
    content: "Detecting tech stack...\n",
  });

  await new Promise((resolve) => {
    mockSpecRegenerationTimeout = setTimeout(resolve, 500);
  });
  if (!mockSpecRegenerationRunning) return;

  // Write mock app_spec.txt
  mockFileSystem[
    `${projectPath}/.automaker/app_spec.txt`
  ] = `<project_specification>
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

  emitSpecRegenerationEvent({
    type: "spec_regeneration_complete",
    message: "Initial spec creation complete!",
  });

  mockSpecRegenerationRunning = false;
  mockSpecRegenerationTimeout = null;
}

async function simulateSpecRegeneration(
  projectPath: string,
  projectDefinition: string
) {
  emitSpecRegenerationEvent({
    type: "spec_regeneration_progress",
    content: "Starting spec regeneration...\n",
  });

  await new Promise((resolve) => {
    mockSpecRegenerationTimeout = setTimeout(resolve, 500);
  });
  if (!mockSpecRegenerationRunning) return;

  emitSpecRegenerationEvent({
    type: "spec_regeneration_progress",
    content: "Analyzing codebase...\n",
  });

  await new Promise((resolve) => {
    mockSpecRegenerationTimeout = setTimeout(resolve, 500);
  });
  if (!mockSpecRegenerationRunning) return;

  // Write regenerated spec
  mockFileSystem[
    `${projectPath}/.automaker/app_spec.txt`
  ] = `<project_specification>
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

  emitSpecRegenerationEvent({
    type: "spec_regeneration_complete",
    message: "Spec regeneration complete!",
  });

  mockSpecRegenerationRunning = false;
  mockSpecRegenerationTimeout = null;
}

// Mock Features API implementation
function createMockFeaturesAPI(): FeaturesAPI {
  // Store features in mock file system using features/{id}/feature.json pattern
  return {
    getAll: async (projectPath: string) => {
      console.log("[Mock] Getting all features for:", projectPath);

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
        (key) => key.startsWith(featuresDir) && key.endsWith("/feature.json")
      );

      for (const key of featureKeys) {
        try {
          const content = mockFileSystem[key];
          if (content) {
            const feature = JSON.parse(content);
            features.push(feature);
          }
        } catch (error) {
          console.error("[Mock] Failed to parse feature:", error);
        }
      }

      // Fallback to mock features if no features found
      if (features.length === 0) {
        return { success: true, features: mockFeatures };
      }

      return { success: true, features };
    },

    get: async (projectPath: string, featureId: string) => {
      console.log("[Mock] Getting feature:", { projectPath, featureId });
      const featurePath = `${projectPath}/.automaker/features/${featureId}/feature.json`;
      const content = mockFileSystem[featurePath];
      if (content) {
        return { success: true, feature: JSON.parse(content) };
      }
      return { success: false, error: "Feature not found" };
    },

    create: async (projectPath: string, feature: Feature) => {
      console.log("[Mock] Creating feature:", {
        projectPath,
        featureId: feature.id,
      });
      const featurePath = `${projectPath}/.automaker/features/${feature.id}/feature.json`;
      mockFileSystem[featurePath] = JSON.stringify(feature, null, 2);
      return { success: true, feature };
    },

    update: async (
      projectPath: string,
      featureId: string,
      updates: Partial<Feature>
    ) => {
      console.log("[Mock] Updating feature:", {
        projectPath,
        featureId,
        updates,
      });
      const featurePath = `${projectPath}/.automaker/features/${featureId}/feature.json`;
      const existing = mockFileSystem[featurePath];
      if (!existing) {
        return { success: false, error: "Feature not found" };
      }
      const feature = { ...JSON.parse(existing), ...updates };
      mockFileSystem[featurePath] = JSON.stringify(feature, null, 2);
      return { success: true, feature };
    },

    delete: async (projectPath: string, featureId: string) => {
      console.log("[Mock] Deleting feature:", { projectPath, featureId });
      const featurePath = `${projectPath}/.automaker/features/${featureId}/feature.json`;
      delete mockFileSystem[featurePath];
      // Also delete agent-output.md if it exists
      const agentOutputPath = `${projectPath}/.automaker/features/${featureId}/agent-output.md`;
      delete mockFileSystem[agentOutputPath];
      return { success: true };
    },

    getAgentOutput: async (projectPath: string, featureId: string) => {
      console.log("[Mock] Getting agent output:", { projectPath, featureId });
      const agentOutputPath = `${projectPath}/.automaker/features/${featureId}/agent-output.md`;
      const content = mockFileSystem[agentOutputPath];
      return { success: true, content: content || null };
    },
  };
}

// Mock Running Agents API implementation
function createMockRunningAgentsAPI(): RunningAgentsAPI {
  return {
    getAll: async () => {
      console.log("[Mock] Getting all running agents");
      // Return running agents from mock auto mode state
      const runningAgents: RunningAgent[] = Array.from(mockRunningFeatures).map(
        (featureId) => ({
          featureId,
          projectPath: "/mock/project",
          projectName: "Mock Project",
          isAutoMode: mockAutoModeRunning,
        })
      );
      return {
        success: true,
        runningAgents,
        totalCount: runningAgents.length,
        autoLoopRunning: mockAutoModeRunning,
      };
    },
  };
}

// Mock Code Review API implementation
function createMockCodeReviewAPI(): CodeReviewAPI {
  return {
    runReview: async (projectPath, featureId, options) => {
      console.log("[Mock] Running code review:", { projectPath, featureId, options });
      // Simulate a review
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return {
        success: true,
        results: {
          overallPass: true,
          timestamp: new Date().toISOString(),
          checks: [
            {
              name: "typescript",
              passed: true,
              duration: 500,
              issues: [],
            },
            {
              name: "build",
              passed: true,
              duration: 300,
              issues: [],
            },
            {
              name: "patterns",
              passed: true,
              duration: 200,
              issues: [
                {
                  severity: "info" as const,
                  message: "Consider adding error handling to async functions",
                  file: "src/example.ts",
                  line: 10,
                  code: "missing-error-handling",
                },
              ],
            },
          ],
        },
      };
    },
    runReviewWithFixes: async (projectPath, featureId, options) => {
      console.log("[Mock] Running code review with fixes:", { projectPath, featureId, options });
      // Simulate a review that passes after 1 attempt
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return {
        success: true,
        results: {
          overallPass: true,
          timestamp: new Date().toISOString(),
          checks: [
            {
              name: "typescript",
              passed: true,
              duration: 500,
              issues: [],
            },
            {
              name: "build",
              passed: true,
              duration: 300,
              issues: [],
            },
            {
              name: "patterns",
              passed: true,
              duration: 200,
              issues: [],
            },
          ],
        },
        attempts: 1,
        maxAttemptsReached: false,
      };
    },
    getFeatureDiff: async (projectPath, featureId) => {
      console.log("[Mock] Getting feature diff:", { projectPath, featureId });
      return {
        success: true,
        diff: "Mock diff content",
        files: ["src/example.ts"],
      };
    },
    onEvent: (callback) => {
      console.log("[Mock] Registering code review event listener");
      return () => {
        console.log("[Mock] Unregistering code review event listener");
      };
    },
    stop: async (featureId) => {
      console.log("[Mock] Stopping code review:", featureId);
      return { success: true };
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
