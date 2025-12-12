const { contextBridge, ipcRenderer } = require("electron");

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld("electronAPI", {
  // IPC test
  ping: () => ipcRenderer.invoke("ping"),

  // Shell APIs
  openExternalLink: (url) => ipcRenderer.invoke("shell:openExternal", url),

  // Dialog APIs
  openDirectory: () => ipcRenderer.invoke("dialog:openDirectory"),
  openFile: (options) => ipcRenderer.invoke("dialog:openFile", options),

  // File system APIs
  readFile: (filePath) => ipcRenderer.invoke("fs:readFile", filePath),
  writeFile: (filePath, content) =>
    ipcRenderer.invoke("fs:writeFile", filePath, content),
  mkdir: (dirPath) => ipcRenderer.invoke("fs:mkdir", dirPath),
  readdir: (dirPath) => ipcRenderer.invoke("fs:readdir", dirPath),
  exists: (filePath) => ipcRenderer.invoke("fs:exists", filePath),
  stat: (filePath) => ipcRenderer.invoke("fs:stat", filePath),
  deleteFile: (filePath) => ipcRenderer.invoke("fs:deleteFile", filePath),
  trashItem: (filePath) => ipcRenderer.invoke("fs:trashItem", filePath),

  // App APIs
  getPath: (name) => ipcRenderer.invoke("app:getPath", name),
  saveImageToTemp: (data, filename, mimeType, projectPath) =>
    ipcRenderer.invoke("app:saveImageToTemp", {
      data,
      filename,
      mimeType,
      projectPath,
    }),

  // Agent APIs
  agent: {
    // Start or resume a conversation
    start: (sessionId, workingDirectory) =>
      ipcRenderer.invoke("agent:start", { sessionId, workingDirectory }),

    // Send a message to the agent
    send: (sessionId, message, workingDirectory, imagePaths) =>
      ipcRenderer.invoke("agent:send", {
        sessionId,
        message,
        workingDirectory,
        imagePaths,
      }),

    // Get conversation history
    getHistory: (sessionId) =>
      ipcRenderer.invoke("agent:getHistory", { sessionId }),

    // Stop current execution
    stop: (sessionId) => ipcRenderer.invoke("agent:stop", { sessionId }),

    // Clear conversation
    clear: (sessionId) => ipcRenderer.invoke("agent:clear", { sessionId }),

    // Subscribe to streaming events
    onStream: (callback) => {
      const subscription = (_, data) => callback(data);
      ipcRenderer.on("agent:stream", subscription);
      // Return unsubscribe function
      return () => ipcRenderer.removeListener("agent:stream", subscription);
    },
  },

  // Session Management APIs
  sessions: {
    // List all sessions
    list: (includeArchived) =>
      ipcRenderer.invoke("sessions:list", { includeArchived }),

    // Create a new session
    create: (name, projectPath, workingDirectory) =>
      ipcRenderer.invoke("sessions:create", {
        name,
        projectPath,
        workingDirectory,
      }),

    // Update session metadata
    update: (sessionId, name, tags) =>
      ipcRenderer.invoke("sessions:update", { sessionId, name, tags }),

    // Archive a session
    archive: (sessionId) =>
      ipcRenderer.invoke("sessions:archive", { sessionId }),

    // Unarchive a session
    unarchive: (sessionId) =>
      ipcRenderer.invoke("sessions:unarchive", { sessionId }),

    // Delete a session permanently
    delete: (sessionId) => ipcRenderer.invoke("sessions:delete", { sessionId }),
  },

  // Auto Mode API
  autoMode: {
    // Start auto mode for a specific project
    start: (projectPath, maxConcurrency) =>
      ipcRenderer.invoke("auto-mode:start", { projectPath, maxConcurrency }),

    // Stop auto mode for a specific project
    stop: (projectPath) => ipcRenderer.invoke("auto-mode:stop", { projectPath }),

    // Get auto mode status (optionally for a specific project)
    status: (projectPath) => ipcRenderer.invoke("auto-mode:status", { projectPath }),

    // Run a specific feature
    runFeature: (projectPath, featureId, useWorktrees) =>
      ipcRenderer.invoke("auto-mode:run-feature", {
        projectPath,
        featureId,
        useWorktrees,
      }),

    // Verify a specific feature by running its tests
    verifyFeature: (projectPath, featureId) =>
      ipcRenderer.invoke("auto-mode:verify-feature", {
        projectPath,
        featureId,
      }),

    // Resume a specific feature with previous context
    resumeFeature: (projectPath, featureId) =>
      ipcRenderer.invoke("auto-mode:resume-feature", {
        projectPath,
        featureId,
      }),

    // Check if context file exists for a feature
    contextExists: (projectPath, featureId) =>
      ipcRenderer.invoke("auto-mode:context-exists", {
        projectPath,
        featureId,
      }),

    // Analyze a new project - kicks off an agent to analyze codebase
    analyzeProject: (projectPath) =>
      ipcRenderer.invoke("auto-mode:analyze-project", { projectPath }),

    // Stop a specific feature
    stopFeature: (featureId) =>
      ipcRenderer.invoke("auto-mode:stop-feature", { featureId }),

    // Follow-up on a feature with additional prompt
    followUpFeature: (projectPath, featureId, prompt, imagePaths) =>
      ipcRenderer.invoke("auto-mode:follow-up-feature", {
        projectPath,
        featureId,
        prompt,
        imagePaths,
      }),

    // Commit changes for a feature
    commitFeature: (projectPath, featureId) =>
      ipcRenderer.invoke("auto-mode:commit-feature", {
        projectPath,
        featureId,
      }),

    // Listen for auto mode events
    onEvent: (callback) => {
      const subscription = (_, data) => callback(data);
      ipcRenderer.on("auto-mode:event", subscription);

      // Return unsubscribe function
      return () => {
        ipcRenderer.removeListener("auto-mode:event", subscription);
      };
    },
  },

  // Claude CLI Detection API
  checkClaudeCli: () => ipcRenderer.invoke("claude:check-cli"),

  // Codex CLI Detection API
  checkCodexCli: () => ipcRenderer.invoke("codex:check-cli"),

  // Model Management APIs
  model: {
    // Get all available models from all providers
    getAvailable: () => ipcRenderer.invoke("model:get-available"),

    // Check all provider installation status
    checkProviders: () => ipcRenderer.invoke("model:check-providers"),
  },

  // OpenAI API
  testOpenAIConnection: (apiKey) =>
    ipcRenderer.invoke("openai:test-connection", { apiKey }),

  // Worktree Management APIs
  worktree: {
    // Revert feature changes by removing the worktree
    revertFeature: (projectPath, featureId) =>
      ipcRenderer.invoke("worktree:revert-feature", { projectPath, featureId }),

    // Merge feature worktree changes back to main branch
    mergeFeature: (projectPath, featureId, options) =>
      ipcRenderer.invoke("worktree:merge-feature", {
        projectPath,
        featureId,
        options,
      }),

    // Get worktree info for a feature
    getInfo: (projectPath, featureId) =>
      ipcRenderer.invoke("worktree:get-info", { projectPath, featureId }),

    // Get worktree status (changed files, commits)
    getStatus: (projectPath, featureId) =>
      ipcRenderer.invoke("worktree:get-status", { projectPath, featureId }),

    // List all feature worktrees
    list: (projectPath) => ipcRenderer.invoke("worktree:list", { projectPath }),

    // Get file diffs for a feature worktree
    getDiffs: (projectPath, featureId) =>
      ipcRenderer.invoke("worktree:get-diffs", { projectPath, featureId }),

    // Get diff for a specific file in a worktree
    getFileDiff: (projectPath, featureId, filePath) =>
      ipcRenderer.invoke("worktree:get-file-diff", {
        projectPath,
        featureId,
        filePath,
      }),
  },

  // Git Operations APIs (for non-worktree operations)
  git: {
    // Get file diffs for the main project
    getDiffs: (projectPath) =>
      ipcRenderer.invoke("git:get-diffs", { projectPath }),

    // Get diff for a specific file in the main project
    getFileDiff: (projectPath, filePath) =>
      ipcRenderer.invoke("git:get-file-diff", { projectPath, filePath }),
  },

  // Feature Suggestions API
  suggestions: {
    // Generate feature suggestions
    // suggestionType can be: "features", "refactoring", "security", "performance"
    generate: (projectPath, suggestionType = "features") =>
      ipcRenderer.invoke("suggestions:generate", { projectPath, suggestionType }),

    // Stop generating suggestions
    stop: () => ipcRenderer.invoke("suggestions:stop"),

    // Get suggestions status
    status: () => ipcRenderer.invoke("suggestions:status"),

    // Listen for suggestions events
    onEvent: (callback) => {
      const subscription = (_, data) => callback(data);
      ipcRenderer.on("suggestions:event", subscription);

      // Return unsubscribe function
      return () => {
        ipcRenderer.removeListener("suggestions:event", subscription);
      };
    },
  },

  // Spec Regeneration API
  specRegeneration: {
    // Create initial app spec for a new project
    create: (projectPath, projectOverview, generateFeatures = true) =>
      ipcRenderer.invoke("spec-regeneration:create", {
        projectPath,
        projectOverview,
        generateFeatures,
      }),

    // Regenerate the app spec
    generate: (projectPath, projectDefinition) =>
      ipcRenderer.invoke("spec-regeneration:generate", {
        projectPath,
        projectDefinition,
      }),

    // Generate features from existing app_spec.txt
    generateFeatures: (projectPath) =>
      ipcRenderer.invoke("spec-regeneration:generate-features", {
        projectPath,
      }),

    // Stop regenerating spec
    stop: () => ipcRenderer.invoke("spec-regeneration:stop"),

    // Get regeneration status
    status: () => ipcRenderer.invoke("spec-regeneration:status"),

    // Listen for regeneration events
    onEvent: (callback) => {
      const subscription = (_, data) => callback(data);
      ipcRenderer.on("spec-regeneration:event", subscription);

      // Return unsubscribe function
      return () => {
        ipcRenderer.removeListener("spec-regeneration:event", subscription);
      };
    },
  },

  // Setup & CLI Management API
  setup: {
    // Get comprehensive Claude CLI status
    getClaudeStatus: () => ipcRenderer.invoke("setup:claude-status"),

    // Get comprehensive Codex CLI status
    getCodexStatus: () => ipcRenderer.invoke("setup:codex-status"),

    // Install Claude CLI
    installClaude: () => ipcRenderer.invoke("setup:install-claude"),

    // Install Codex CLI
    installCodex: () => ipcRenderer.invoke("setup:install-codex"),

    // Authenticate Claude CLI
    authClaude: () => ipcRenderer.invoke("setup:auth-claude"),

    // Authenticate Codex CLI with optional API key
    authCodex: (apiKey) => ipcRenderer.invoke("setup:auth-codex", { apiKey }),

    // Store API key securely
    storeApiKey: (provider, apiKey) =>
      ipcRenderer.invoke("setup:store-api-key", { provider, apiKey }),

    // Get stored API keys status
    getApiKeys: () => ipcRenderer.invoke("setup:get-api-keys"),

    // Configure Codex MCP server for a project
    configureCodexMcp: (projectPath) =>
      ipcRenderer.invoke("setup:configure-codex-mcp", { projectPath }),

    // Get platform information
    getPlatform: () => ipcRenderer.invoke("setup:get-platform"),

    // Listen for installation progress
    onInstallProgress: (callback) => {
      const subscription = (_, data) => callback(data);
      ipcRenderer.on("setup:install-progress", subscription);
      return () => {
        ipcRenderer.removeListener("setup:install-progress", subscription);
      };
    },

    // Listen for auth progress
    onAuthProgress: (callback) => {
      const subscription = (_, data) => callback(data);
      ipcRenderer.on("setup:auth-progress", subscription);
      return () => {
        ipcRenderer.removeListener("setup:auth-progress", subscription);
      };
    },
  },

  // Features API
  features: {
    // Get all features for a project
    getAll: (projectPath) =>
      ipcRenderer.invoke("features:getAll", { projectPath }),

    // Get a single feature by ID
    get: (projectPath, featureId) =>
      ipcRenderer.invoke("features:get", { projectPath, featureId }),

    // Create a new feature
    create: (projectPath, feature) =>
      ipcRenderer.invoke("features:create", { projectPath, feature }),

    // Update a feature (partial updates supported)
    update: (projectPath, featureId, updates) =>
      ipcRenderer.invoke("features:update", {
        projectPath,
        featureId,
        updates,
      }),

    // Delete a feature and its folder
    delete: (projectPath, featureId) =>
      ipcRenderer.invoke("features:delete", { projectPath, featureId }),

    // Get agent output for a feature
    getAgentOutput: (projectPath, featureId) =>
      ipcRenderer.invoke("features:getAgentOutput", { projectPath, featureId }),
  },

  // Running Agents API
  runningAgents: {
    // Get all running agents across all projects
    getAll: () => ipcRenderer.invoke("running-agents:getAll"),
  },
});

// Also expose a flag to detect if we're in Electron
contextBridge.exposeInMainWorld("isElectron", true);
