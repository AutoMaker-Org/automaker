/**
 * HTTP API Client for web mode
 *
 * This client provides the same API as the Electron IPC bridge,
 * but communicates with the backend server via HTTP/WebSocket.
 */

import type {
  ElectronAPI,
  FileResult,
  WriteResult,
  ReaddirResult,
  StatResult,
  DialogResult,
  SaveImageResult,
  AutoModeAPI,
  FeaturesAPI,
  SuggestionsAPI,
  SpecRegenerationAPI,
  AutoModeEvent,
  SuggestionsEvent,
  SpecRegenerationEvent,
  FeatureSuggestion,
  SuggestionType,
} from "./electron";
import type { Message, SessionListItem } from "@/types/electron";
import type { Feature } from "@/store/app-store";
import type {
  WorktreeAPI,
  GitAPI,
  ModelDefinition,
  ProviderStatus,
} from "@/types/electron";
import { getGlobalFileBrowser } from "@/contexts/file-browser-context";

// Server URL - configurable via environment variable
const getServerUrl = (): string => {
  if (typeof window !== "undefined") {
    const envUrl = process.env.NEXT_PUBLIC_SERVER_URL;
    if (envUrl) return envUrl;
  }
  return "http://localhost:3008";
};

// Get API key from environment variable
const getApiKey = (): string | null => {
  if (typeof window !== "undefined") {
    return process.env.NEXT_PUBLIC_AUTOMAKER_API_KEY || null;
  }
  return null;
};

type EventType =
  | "agent:stream"
  | "auto-mode:event"
  | "suggestions:event"
  | "spec-regeneration:event";

type EventCallback = (payload: unknown) => void;

/**
 * HTTP API Client that implements ElectronAPI interface
 */
export class HttpApiClient implements ElectronAPI {
  private serverUrl: string;
  private ws: WebSocket | null = null;
  private eventCallbacks: Map<EventType, Set<EventCallback>> = new Map();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isConnecting = false;

  constructor() {
    this.serverUrl = getServerUrl();
    this.connectWebSocket();
  }

  private connectWebSocket(): void {
    if (
      this.isConnecting ||
      (this.ws && this.ws.readyState === WebSocket.OPEN)
    ) {
      return;
    }

    this.isConnecting = true;

    try {
      const wsUrl = this.serverUrl.replace(/^http/, "ws") + "/api/events";
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log("[HttpApiClient] WebSocket connected");
        this.isConnecting = false;
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const callbacks = this.eventCallbacks.get(data.type);
          if (callbacks) {
            callbacks.forEach((cb) => cb(data.payload));
          }
        } catch (error) {
          console.error(
            "[HttpApiClient] Failed to parse WebSocket message:",
            error
          );
        }
      };

      this.ws.onclose = () => {
        console.log("[HttpApiClient] WebSocket disconnected");
        this.isConnecting = false;
        this.ws = null;
        // Attempt to reconnect after 5 seconds
        if (!this.reconnectTimer) {
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connectWebSocket();
          }, 5000);
        }
      };

      this.ws.onerror = (error) => {
        console.error("[HttpApiClient] WebSocket error:", error);
        this.isConnecting = false;
      };
    } catch (error) {
      console.error("[HttpApiClient] Failed to create WebSocket:", error);
      this.isConnecting = false;
    }
  }

  private subscribeToEvent(
    type: EventType,
    callback: EventCallback
  ): () => void {
    if (!this.eventCallbacks.has(type)) {
      this.eventCallbacks.set(type, new Set());
    }
    this.eventCallbacks.get(type)!.add(callback);

    // Ensure WebSocket is connected
    this.connectWebSocket();

    return () => {
      const callbacks = this.eventCallbacks.get(type);
      if (callbacks) {
        callbacks.delete(callback);
      }
    };
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const apiKey = getApiKey();
    if (apiKey) {
      headers["X-API-Key"] = apiKey;
    }
    return headers;
  }

  private async post<T>(endpoint: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.serverUrl}${endpoint}`, {
      method: "POST",
      headers: this.getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });
    return response.json();
  }

  private async get<T>(endpoint: string): Promise<T> {
    const headers = this.getHeaders();
    const response = await fetch(`${this.serverUrl}${endpoint}`, { headers });
    return response.json();
  }

  private async put<T>(endpoint: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.serverUrl}${endpoint}`, {
      method: "PUT",
      headers: this.getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });
    return response.json();
  }

  private async httpDelete<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${this.serverUrl}${endpoint}`, {
      method: "DELETE",
      headers: this.getHeaders(),
    });
    return response.json();
  }

  // Basic operations
  async ping(): Promise<string> {
    const result = await this.get<{ status: string }>("/api/health");
    return result.status === "ok" ? "pong" : "error";
  }

  async openExternalLink(
    url: string
  ): Promise<{ success: boolean; error?: string }> {
    // Open in new tab
    window.open(url, "_blank", "noopener,noreferrer");
    return { success: true };
  }

  // File picker - uses server-side file browser dialog
  async openDirectory(): Promise<DialogResult> {
    const fileBrowser = getGlobalFileBrowser();

    if (!fileBrowser) {
      console.error("File browser not initialized");
      return { canceled: true, filePaths: [] };
    }

    const path = await fileBrowser();

    if (!path) {
      return { canceled: true, filePaths: [] };
    }

    // Validate with server
    const result = await this.post<{
      success: boolean;
      path?: string;
      error?: string;
    }>("/api/fs/validate-path", { filePath: path });

    if (result.success && result.path) {
      return { canceled: false, filePaths: [result.path] };
    }

    console.error("Invalid directory:", result.error);
    return { canceled: true, filePaths: [] };
  }

  async openFile(options?: object): Promise<DialogResult> {
    const fileBrowser = getGlobalFileBrowser();

    if (!fileBrowser) {
      console.error("File browser not initialized");
      return { canceled: true, filePaths: [] };
    }

    // For now, use the same directory browser (could be enhanced for file selection)
    const path = await fileBrowser();

    if (!path) {
      return { canceled: true, filePaths: [] };
    }

    const result = await this.post<{ success: boolean; exists: boolean }>(
      "/api/fs/exists",
      { filePath: path }
    );

    if (result.success && result.exists) {
      return { canceled: false, filePaths: [path] };
    }

    console.error("File not found");
    return { canceled: true, filePaths: [] };
  }

  // File system operations
  async readFile(filePath: string): Promise<FileResult> {
    return this.post("/api/fs/read", { filePath });
  }

  async writeFile(filePath: string, content: string): Promise<WriteResult> {
    return this.post("/api/fs/write", { filePath, content });
  }

  async mkdir(dirPath: string): Promise<WriteResult> {
    return this.post("/api/fs/mkdir", { dirPath });
  }

  async readdir(dirPath: string): Promise<ReaddirResult> {
    return this.post("/api/fs/readdir", { dirPath });
  }

  async exists(filePath: string): Promise<boolean> {
    const result = await this.post<{ success: boolean; exists: boolean }>(
      "/api/fs/exists",
      { filePath }
    );
    return result.exists;
  }

  async stat(filePath: string): Promise<StatResult> {
    return this.post("/api/fs/stat", { filePath });
  }

  async deleteFile(filePath: string): Promise<WriteResult> {
    return this.post("/api/fs/delete", { filePath });
  }

  async trashItem(filePath: string): Promise<WriteResult> {
    // In web mode, trash is just delete
    return this.deleteFile(filePath);
  }

  async getPath(name: string): Promise<string> {
    // Server provides data directory
    if (name === "userData") {
      const result = await this.get<{ dataDir: string }>(
        "/api/health/detailed"
      );
      return result.dataDir || "/data";
    }
    return `/data/${name}`;
  }

  async saveImageToTemp(
    data: string,
    filename: string,
    mimeType: string,
    projectPath?: string
  ): Promise<SaveImageResult> {
    return this.post("/api/fs/save-image", {
      data,
      filename,
      mimeType,
      projectPath,
    });
  }

  async saveBoardBackground(
    data: string,
    filename: string,
    mimeType: string,
    projectPath: string
  ): Promise<{ success: boolean; path?: string; error?: string }> {
    return this.post("/api/fs/save-board-background", {
      data,
      filename,
      mimeType,
      projectPath,
    });
  }

  async deleteBoardBackground(
    projectPath: string
  ): Promise<{ success: boolean; error?: string }> {
    return this.post("/api/fs/delete-board-background", { projectPath });
  }

  // CLI checks - server-side
  async checkClaudeCli(): Promise<{
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
  }> {
    return this.get("/api/setup/claude-status");
  }

  // Model API
  model = {
    getAvailable: async (): Promise<{
      success: boolean;
      models?: ModelDefinition[];
      error?: string;
    }> => {
      return this.get("/api/models/available");
    },
    checkProviders: async (): Promise<{
      success: boolean;
      providers?: Record<string, ProviderStatus>;
      error?: string;
    }> => {
      return this.get("/api/models/providers");
    },
  };

  // Setup API
  setup = {
    getClaudeStatus: (): Promise<{
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
    }> => this.get("/api/setup/claude-status"),

    installClaude: (): Promise<{
      success: boolean;
      message?: string;
      error?: string;
    }> => this.post("/api/setup/install-claude"),

    authClaude: (): Promise<{
      success: boolean;
      token?: string;
      requiresManualAuth?: boolean;
      terminalOpened?: boolean;
      command?: string;
      error?: string;
      message?: string;
      output?: string;
    }> => this.post("/api/setup/auth-claude"),

    storeApiKey: (
      provider: string,
      apiKey: string
    ): Promise<{
      success: boolean;
      error?: string;
    }> => this.post("/api/setup/store-api-key", { provider, apiKey }),

    deleteApiKey: (
      provider: string
    ): Promise<{
      success: boolean;
      error?: string;
      message?: string;
    }> => this.post("/api/setup/delete-api-key", { provider }),

    getApiKeys: (): Promise<{
      success: boolean;
      hasAnthropicKey: boolean;
      hasGoogleKey: boolean;
    }> => this.get("/api/setup/api-keys"),

    getPlatform: (): Promise<{
      success: boolean;
      platform: string;
      arch: string;
      homeDir: string;
      isWindows: boolean;
      isMac: boolean;
      isLinux: boolean;
    }> => this.get("/api/setup/platform"),

    verifyClaudeAuth: (authMethod?: "cli" | "api_key"): Promise<{
      success: boolean;
      authenticated: boolean;
      error?: string;
    }> => this.post("/api/setup/verify-claude-auth", { authMethod }),

    onInstallProgress: (callback: (progress: unknown) => void) => {
      return this.subscribeToEvent("agent:stream", callback);
    },

    onAuthProgress: (callback: (progress: unknown) => void) => {
      return this.subscribeToEvent("agent:stream", callback);
    },
  };

  // Features API
  features: FeaturesAPI = {
    getAll: (projectPath: string) =>
      this.post("/api/features/list", { projectPath }),
    get: (projectPath: string, featureId: string) =>
      this.post("/api/features/get", { projectPath, featureId }),
    create: (projectPath: string, feature: Feature) =>
      this.post("/api/features/create", { projectPath, feature }),
    update: (
      projectPath: string,
      featureId: string,
      updates: Partial<Feature>
    ) => this.post("/api/features/update", { projectPath, featureId, updates }),
    delete: (projectPath: string, featureId: string) =>
      this.post("/api/features/delete", { projectPath, featureId }),
    getAgentOutput: (projectPath: string, featureId: string) =>
      this.post("/api/features/agent-output", { projectPath, featureId }),
  };

  // Auto Mode API
  autoMode: AutoModeAPI = {
    start: (projectPath: string, maxConcurrency?: number) =>
      this.post("/api/auto-mode/start", { projectPath, maxConcurrency }),
    stop: (projectPath: string) =>
      this.post("/api/auto-mode/stop", { projectPath }),
    stopFeature: (featureId: string) =>
      this.post("/api/auto-mode/stop-feature", { featureId }),
    status: (projectPath?: string) =>
      this.post("/api/auto-mode/status", { projectPath }),
    runFeature: (
      projectPath: string,
      featureId: string,
      useWorktrees?: boolean,
      worktreePath?: string
    ) =>
      this.post("/api/auto-mode/run-feature", {
        projectPath,
        featureId,
        useWorktrees,
        worktreePath,
      }),
    verifyFeature: (projectPath: string, featureId: string) =>
      this.post("/api/auto-mode/verify-feature", { projectPath, featureId }),
    resumeFeature: (projectPath: string, featureId: string) =>
      this.post("/api/auto-mode/resume-feature", { projectPath, featureId }),
    contextExists: (projectPath: string, featureId: string) =>
      this.post("/api/auto-mode/context-exists", { projectPath, featureId }),
    analyzeProject: (projectPath: string) =>
      this.post("/api/auto-mode/analyze-project", { projectPath }),
    followUpFeature: (
      projectPath: string,
      featureId: string,
      prompt: string,
      imagePaths?: string[],
      worktreePath?: string
    ) =>
      this.post("/api/auto-mode/follow-up-feature", {
        projectPath,
        featureId,
        prompt,
        imagePaths,
        worktreePath,
      }),
    commitFeature: (projectPath: string, featureId: string, worktreePath?: string) =>
      this.post("/api/auto-mode/commit-feature", { projectPath, featureId, worktreePath }),
    onEvent: (callback: (event: AutoModeEvent) => void) => {
      return this.subscribeToEvent(
        "auto-mode:event",
        callback as EventCallback
      );
    },
  };

  // Worktree API
  worktree: WorktreeAPI = {
    revertFeature: (projectPath: string, featureId: string) =>
      this.post("/api/worktree/revert", { projectPath, featureId }),
    mergeFeature: (projectPath: string, featureId: string, options?: object) =>
      this.post("/api/worktree/merge", { projectPath, featureId, options }),
    getInfo: (projectPath: string, featureId: string) =>
      this.post("/api/worktree/info", { projectPath, featureId }),
    getStatus: (projectPath: string, featureId: string) =>
      this.post("/api/worktree/status", { projectPath, featureId }),
    list: (projectPath: string) =>
      this.post("/api/worktree/list", { projectPath }),
    listAll: (projectPath: string, includeDetails?: boolean) =>
      this.post("/api/worktree/list", { projectPath, includeDetails }),
    create: (projectPath: string, branchName: string, baseBranch?: string) =>
      this.post("/api/worktree/create", { projectPath, branchName, baseBranch }),
    delete: (projectPath: string, worktreePath: string, deleteBranch?: boolean) =>
      this.post("/api/worktree/delete", { projectPath, worktreePath, deleteBranch }),
    commit: (worktreePath: string, message: string) =>
      this.post("/api/worktree/commit", { worktreePath, message }),
    push: (worktreePath: string, force?: boolean) =>
      this.post("/api/worktree/push", { worktreePath, force }),
    createPR: (worktreePath: string, options?: any) =>
      this.post("/api/worktree/create-pr", { worktreePath, ...options }),
    getDiffs: (projectPath: string, featureId: string) =>
      this.post("/api/worktree/diffs", { projectPath, featureId }),
    getFileDiff: (projectPath: string, featureId: string, filePath: string) =>
      this.post("/api/worktree/file-diff", {
        projectPath,
        featureId,
        filePath,
      }),
    pull: (worktreePath: string) =>
      this.post("/api/worktree/pull", { worktreePath }),
    checkoutBranch: (worktreePath: string, branchName: string) =>
      this.post("/api/worktree/checkout-branch", { worktreePath, branchName }),
    listBranches: (worktreePath: string) =>
      this.post("/api/worktree/list-branches", { worktreePath }),
    switchBranch: (worktreePath: string, branchName: string) =>
      this.post("/api/worktree/switch-branch", { worktreePath, branchName }),
    openInEditor: (worktreePath: string) =>
      this.post("/api/worktree/open-in-editor", { worktreePath }),
    initGit: (projectPath: string) =>
      this.post("/api/worktree/init-git", { projectPath }),
    activate: (projectPath: string, worktreePath: string | null) =>
      this.post("/api/worktree/activate", { projectPath, worktreePath }),
    startDevServer: (projectPath: string, worktreePath: string) =>
      this.post("/api/worktree/start-dev", { projectPath, worktreePath }),
    stopDevServer: (worktreePath: string) =>
      this.post("/api/worktree/stop-dev", { worktreePath }),
    listDevServers: () =>
      this.post("/api/worktree/list-dev-servers", {}),
  };

  // Git API
  git: GitAPI = {
    getDiffs: (projectPath: string) =>
      this.post("/api/git/diffs", { projectPath }),
    getFileDiff: (projectPath: string, filePath: string) =>
      this.post("/api/git/file-diff", { projectPath, filePath }),
  };

  // Suggestions API
  suggestions: SuggestionsAPI = {
    generate: (projectPath: string, suggestionType?: SuggestionType) =>
      this.post("/api/suggestions/generate", { projectPath, suggestionType }),
    stop: () => this.post("/api/suggestions/stop"),
    status: () => this.get("/api/suggestions/status"),
    onEvent: (callback: (event: SuggestionsEvent) => void) => {
      return this.subscribeToEvent(
        "suggestions:event",
        callback as EventCallback
      );
    },
  };

  // Spec Regeneration API
  specRegeneration: SpecRegenerationAPI = {
    create: (
      projectPath: string,
      projectOverview: string,
      generateFeatures?: boolean,
      analyzeProject?: boolean,
      maxFeatures?: number
    ) =>
      this.post("/api/spec-regeneration/create", {
        projectPath,
        projectOverview,
        generateFeatures,
        analyzeProject,
        maxFeatures,
      }),
    generate: (
      projectPath: string,
      projectDefinition: string,
      generateFeatures?: boolean,
      analyzeProject?: boolean,
      maxFeatures?: number
    ) =>
      this.post("/api/spec-regeneration/generate", {
        projectPath,
        projectDefinition,
        generateFeatures,
        analyzeProject,
        maxFeatures,
      }),
    generateFeatures: (projectPath: string, maxFeatures?: number) =>
      this.post("/api/spec-regeneration/generate-features", { projectPath, maxFeatures }),
    stop: () => this.post("/api/spec-regeneration/stop"),
    status: () => this.get("/api/spec-regeneration/status"),
    onEvent: (callback: (event: SpecRegenerationEvent) => void) => {
      return this.subscribeToEvent(
        "spec-regeneration:event",
        callback as EventCallback
      );
    },
  };

  // Running Agents API
  runningAgents = {
    getAll: (): Promise<{
      success: boolean;
      runningAgents?: Array<{
        featureId: string;
        projectPath: string;
        projectName: string;
        isAutoMode: boolean;
      }>;
      totalCount?: number;
      autoLoopRunning?: boolean;
      error?: string;
    }> => this.get("/api/running-agents"),
  };

  // Workspace API
  workspace = {
    getConfig: (): Promise<{
      success: boolean;
      configured: boolean;
      workspaceDir?: string;
      error?: string;
    }> => this.get("/api/workspace/config"),

    getDirectories: (): Promise<{
      success: boolean;
      directories?: Array<{ name: string; path: string }>;
      error?: string;
    }> => this.get("/api/workspace/directories"),
  };

  // Agent API
  agent = {
    start: (
      sessionId: string,
      workingDirectory?: string
    ): Promise<{
      success: boolean;
      messages?: Message[];
      error?: string;
    }> => this.post("/api/agent/start", { sessionId, workingDirectory }),

    send: (
      sessionId: string,
      message: string,
      workingDirectory?: string,
      imagePaths?: string[],
      model?: string
    ): Promise<{ success: boolean; error?: string }> =>
      this.post("/api/agent/send", {
        sessionId,
        message,
        workingDirectory,
        imagePaths,
        model,
      }),

    getHistory: (
      sessionId: string
    ): Promise<{
      success: boolean;
      messages?: Message[];
      isRunning?: boolean;
      error?: string;
    }> => this.post("/api/agent/history", { sessionId }),

    stop: (sessionId: string): Promise<{ success: boolean; error?: string }> =>
      this.post("/api/agent/stop", { sessionId }),

    clear: (sessionId: string): Promise<{ success: boolean; error?: string }> =>
      this.post("/api/agent/clear", { sessionId }),

    onStream: (callback: (data: unknown) => void): (() => void) => {
      return this.subscribeToEvent("agent:stream", callback as EventCallback);
    },
  };

  // Templates API
  templates = {
    clone: (
      repoUrl: string,
      projectName: string,
      parentDir: string
    ): Promise<{
      success: boolean;
      projectPath?: string;
      projectName?: string;
      error?: string;
    }> =>
      this.post("/api/templates/clone", { repoUrl, projectName, parentDir }),
  };

  // Sessions API
  sessions = {
    list: (
      includeArchived?: boolean
    ): Promise<{
      success: boolean;
      sessions?: SessionListItem[];
      error?: string;
    }> => this.get(`/api/sessions?includeArchived=${includeArchived || false}`),

    create: (
      name: string,
      projectPath: string,
      workingDirectory?: string
    ): Promise<{
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
    }> => this.post("/api/sessions", { name, projectPath, workingDirectory }),

    update: (
      sessionId: string,
      name?: string,
      tags?: string[]
    ): Promise<{ success: boolean; error?: string }> =>
      this.put(`/api/sessions/${sessionId}`, { name, tags }),

    archive: (
      sessionId: string
    ): Promise<{ success: boolean; error?: string }> =>
      this.post(`/api/sessions/${sessionId}/archive`, {}),

    unarchive: (
      sessionId: string
    ): Promise<{ success: boolean; error?: string }> =>
      this.post(`/api/sessions/${sessionId}/unarchive`, {}),

    delete: (
      sessionId: string
    ): Promise<{ success: boolean; error?: string }> =>
      this.httpDelete(`/api/sessions/${sessionId}`),
  };
}

// Singleton instance
let httpApiClientInstance: HttpApiClient | null = null;

export function getHttpApiClient(): HttpApiClient {
  if (!httpApiClientInstance) {
    httpApiClientInstance = new HttpApiClient();
  }
  return httpApiClientInstance;
}
