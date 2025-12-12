const path = require("path");

// Load environment variables from .env file
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const fs = require("fs/promises");
const agentService = require("./agent-service");
const autoModeService = require("./auto-mode-service");
const worktreeManager = require("./services/worktree-manager");
const featureSuggestionsService = require("./services/feature-suggestions-service");
const specRegenerationService = require("./services/spec-regeneration-service");

let mainWindow = null;

// Get icon path - works in both dev and production
function getIconPath() {
  // In dev: __dirname is electron/, so ../public/logo.png
  // In production: public folder is included in the app bundle
  return app.isPackaged
    ? path.join(process.resourcesPath, "app", "public", "logo.png")
    : path.join(__dirname, "../public/logo.png");
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    icon: getIconPath(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: "hiddenInset",
    backgroundColor: "#0a0a0a",
  });

  // Load Next.js dev server in development or production build
  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL("http://localhost:3007");
    // Open DevTools if OPEN_DEVTOOLS environment variable is set
    if (process.env.OPEN_DEVTOOLS === "true") {
      mainWindow.webContents.openDevTools();
    }
  } else {
    mainWindow.loadFile(path.join(__dirname, "../.next/server/app/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  // Set app icon (dock icon on macOS)
  if (process.platform === "darwin" && app.dock) {
    app.dock.setIcon(getIconPath());
  }

  // Initialize agent service
  const appDataPath = app.getPath("userData");
  await agentService.initialize(appDataPath);

  // Pre-load allowed paths from agent history to prevent breaking "Recent Projects"
  try {
    const sessions = await agentService.listSessions({ includeArchived: true });
    sessions.forEach((session) => {
      if (session.projectPath) {
        addAllowedPath(session.projectPath);
      }
    });
  } catch (error) {
    console.error("Failed to load sessions for security whitelist:", error);
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Track allowed paths for file operations (security)
const allowedPaths = new Set();

/**
 * Add a path to the allowed list
 */
function addAllowedPath(pathToAdd) {
  if (!pathToAdd) return;
  allowedPaths.add(path.resolve(pathToAdd));
}

/**
 * Check if a file path is allowed (must be within an allowed directory)
 */
function isPathAllowed(filePath) {
  const resolvedPath = path.resolve(filePath);

  // Allow access to app data directory (for logs, temp images etc)
  const appDataPath = app.getPath("userData");
  if (resolvedPath.startsWith(appDataPath)) return true;

  // Check against all allowed project paths
  for (const allowedPath of allowedPaths) {
    // Check if path starts with allowed directory
    // Ensure we don't match "/foo/bar" against "/foo/b"
    if (
      resolvedPath === allowedPath ||
      resolvedPath.startsWith(allowedPath + path.sep)
    ) {
      return true;
    }
  }

  return false;
}

// IPC Handlers

// Dialog handlers
ipcMain.handle("dialog:openDirectory", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory", "createDirectory"],
  });

  if (!result.canceled && result.filePaths.length > 0) {
    result.filePaths.forEach((p) => addAllowedPath(p));
  }

  return result;
});

ipcMain.handle("dialog:openFile", async (_, options = {}) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    ...options,
  });

  if (!result.canceled && result.filePaths.length > 0) {
    // Allow reading the specific file selected
    result.filePaths.forEach((p) => addAllowedPath(p));
  }

  return result;
});

// File system handlers
ipcMain.handle("fs:readFile", async (_, filePath) => {
  try {
    // Security check
    if (!isPathAllowed(filePath)) {
      return {
        success: false,
        error: "Access denied: Path is outside allowed project directories",
      };
    }

    const content = await fs.readFile(filePath, "utf-8");
    return { success: true, content };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("fs:writeFile", async (_, filePath, content) => {
  try {
    // Security check
    if (!isPathAllowed(filePath)) {
      return {
        success: false,
        error: "Access denied: Path is outside allowed project directories",
      };
    }

    await fs.writeFile(filePath, content, "utf-8");
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("fs:mkdir", async (_, dirPath) => {
  try {
    // Security check
    if (!isPathAllowed(dirPath)) {
      return {
        success: false,
        error: "Access denied: Path is outside allowed project directories",
      };
    }

    await fs.mkdir(dirPath, { recursive: true });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("fs:readdir", async (_, dirPath) => {
  try {
    // Security check
    if (!isPathAllowed(dirPath)) {
      return {
        success: false,
        error: "Access denied: Path is outside allowed project directories",
      };
    }

    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const result = entries.map((entry) => ({
      name: entry.name,
      isDirectory: entry.isDirectory(),
      isFile: entry.isFile(),
    }));
    return { success: true, entries: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("fs:exists", async (_, filePath) => {
  try {
    // Exists check is generally safe, but we can restrict it too for strict privacy
    if (!isPathAllowed(filePath)) {
      return false;
    }

    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle("fs:stat", async (_, filePath) => {
  try {
    // Security check
    if (!isPathAllowed(filePath)) {
      return {
        success: false,
        error: "Access denied: Path is outside allowed project directories",
      };
    }

    const stats = await fs.stat(filePath);
    return {
      success: true,
      stats: {
        isDirectory: stats.isDirectory(),
        isFile: stats.isFile(),
        size: stats.size,
        mtime: stats.mtime,
      },
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("fs:deleteFile", async (_, filePath) => {
  try {
    // Security check
    if (!isPathAllowed(filePath)) {
      return {
        success: false,
        error: "Access denied: Path is outside allowed project directories",
      };
    }

    await fs.unlink(filePath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("fs:trashItem", async (_, targetPath) => {
  try {
    // Security check
    if (!isPathAllowed(targetPath)) {
      return {
        success: false,
        error: "Access denied: Path is outside allowed project directories",
      };
    }

    await shell.trashItem(targetPath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// App data path
ipcMain.handle("app:getPath", (_, name) => {
  return app.getPath(name);
});

// Save image to .automaker/images directory
ipcMain.handle(
  "app:saveImageToTemp",
  async (_, { data, filename, mimeType, projectPath }) => {
    try {
      // Use .automaker/images directory instead of /tmp
      // If projectPath is provided, use it; otherwise fall back to app data directory
      let imagesDir;
      if (projectPath) {
        imagesDir = path.join(projectPath, ".automaker", "images");
      } else {
        // Fallback for cases where project isn't loaded yet
        const appDataPath = app.getPath("userData");
        imagesDir = path.join(appDataPath, "images");
      }

      await fs.mkdir(imagesDir, { recursive: true });

      // Generate unique filename with unique ID
      const uniqueId = `${Date.now()}-${Math.random()
        .toString(36)
        .substring(2, 11)}`;
      const safeName = filename.replace(/[^a-zA-Z0-9.-]/g, "_");
      const imageFilePath = path.join(imagesDir, `${uniqueId}_${safeName}`);

      // Remove data URL prefix if present (data:image/png;base64,...)
      const base64Data = data.includes(",") ? data.split(",")[1] : data;

      // Write image to file
      await fs.writeFile(imageFilePath, base64Data, "base64");

      return { success: true, path: imageFilePath };
    } catch (error) {
      console.error("[IPC] Failed to save image:", error);
      return { success: false, error: error.message };
    }
  }
);

// IPC ping for testing communication
ipcMain.handle("ping", () => {
  return "pong";
});

// Open external link in default browser
ipcMain.handle("shell:openExternal", async (_, url) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    console.error("[IPC] shell:openExternal error:", error);
    return { success: false, error: error.message };
  }
});

// ============================================================================
// Agent IPC Handlers
// ============================================================================

/**
 * Start or resume a conversation session
 */
ipcMain.handle("agent:start", async (_, { sessionId, workingDirectory }) => {
  try {
    return await agentService.startConversation({
      sessionId,
      workingDirectory,
    });
  } catch (error) {
    console.error("[IPC] agent:start error:", error);
    return { success: false, error: error.message };
  }
});

/**
 * Send a message to the agent - returns immediately, streams via events
 */
ipcMain.handle(
  "agent:send",
  async (event, { sessionId, message, workingDirectory, imagePaths }) => {
    try {
      // Create a function to send updates to the renderer
      const sendToRenderer = (data) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("agent:stream", {
            sessionId,
            ...data,
          });
        }
      };

      // Start processing (runs in background)
      agentService
        .sendMessage({
          sessionId,
          message,
          workingDirectory,
          imagePaths,
          sendToRenderer,
        })
        .catch((error) => {
          console.error("[IPC] agent:send background error:", error);
          sendToRenderer({
            type: "error",
            error: error.message,
          });
        });

      // Return immediately
      return { success: true };
    } catch (error) {
      console.error("[IPC] agent:send error:", error);
      return { success: false, error: error.message };
    }
  }
);

/**
 * Get conversation history
 */
ipcMain.handle("agent:getHistory", (_, { sessionId }) => {
  try {
    return agentService.getHistory(sessionId);
  } catch (error) {
    console.error("[IPC] agent:getHistory error:", error);
    return { success: false, error: error.message };
  }
});

/**
 * Stop current agent execution
 */
ipcMain.handle("agent:stop", async (_, { sessionId }) => {
  try {
    return await agentService.stopExecution(sessionId);
  } catch (error) {
    console.error("[IPC] agent:stop error:", error);
    return { success: false, error: error.message };
  }
});

/**
 * Clear conversation history
 */
ipcMain.handle("agent:clear", async (_, { sessionId }) => {
  try {
    return await agentService.clearSession(sessionId);
  } catch (error) {
    console.error("[IPC] agent:clear error:", error);
    return { success: false, error: error.message };
  }
});

// ============================================================================
// Session Management IPC Handlers
// ============================================================================

/**
 * List all sessions
 */
ipcMain.handle("sessions:list", async (_, { includeArchived }) => {
  try {
    const sessions = await agentService.listSessions({ includeArchived });
    return { success: true, sessions };
  } catch (error) {
    console.error("[IPC] sessions:list error:", error);
    return { success: false, error: error.message };
  }
});

/**
 * Create a new session
 */
ipcMain.handle(
  "sessions:create",
  async (_, { name, projectPath, workingDirectory }) => {
    try {
      // Add project path to allowed paths
      addAllowedPath(projectPath);
      if (workingDirectory) addAllowedPath(workingDirectory);

      return await agentService.createSession({
        name,
        projectPath,
        workingDirectory,
      });
    } catch (error) {
      console.error("[IPC] sessions:create error:", error);
      return { success: false, error: error.message };
    }
  }
);

/**
 * Update session metadata
 */
ipcMain.handle("sessions:update", async (_, { sessionId, name, tags }) => {
  try {
    return await agentService.updateSession({ sessionId, name, tags });
  } catch (error) {
    console.error("[IPC] sessions:update error:", error);
    return { success: false, error: error.message };
  }
});

/**
 * Archive a session
 */
ipcMain.handle("sessions:archive", async (_, { sessionId }) => {
  try {
    return await agentService.archiveSession(sessionId);
  } catch (error) {
    console.error("[IPC] sessions:archive error:", error);
    return { success: false, error: error.message };
  }
});

/**
 * Unarchive a session
 */
ipcMain.handle("sessions:unarchive", async (_, { sessionId }) => {
  try {
    return await agentService.unarchiveSession(sessionId);
  } catch (error) {
    console.error("[IPC] sessions:unarchive error:", error);
    return { success: false, error: error.message };
  }
});

/**
 * Delete a session permanently
 */
ipcMain.handle("sessions:delete", async (_, { sessionId }) => {
  try {
    return await agentService.deleteSession(sessionId);
  } catch (error) {
    console.error("[IPC] sessions:delete error:", error);
    return { success: false, error: error.message };
  }
});

// ============================================================================
// Auto Mode IPC Handlers
// ============================================================================

/**
 * Start auto mode - autonomous feature implementation
 */
ipcMain.handle(
  "auto-mode:start",
  async (_, { projectPath, maxConcurrency }) => {
    try {
      // Add project path to allowed paths
      addAllowedPath(projectPath);

      const sendToRenderer = (data) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("auto-mode:event", data);
        }
      };

      return await autoModeService.start({
        projectPath,
        sendToRenderer,
        maxConcurrency,
      });
    } catch (error) {
      console.error("[IPC] auto-mode:start error:", error);
      return { success: false, error: error.message };
    }
  }
);

/**
 * Stop auto mode for a specific project
 */
ipcMain.handle("auto-mode:stop", async (_, { projectPath }) => {
  try {
    return await autoModeService.stop({ projectPath });
  } catch (error) {
    console.error("[IPC] auto-mode:stop error:", error);
    return { success: false, error: error.message };
  }
});

/**
 * Get auto mode status (optionally for a specific project)
 */
ipcMain.handle("auto-mode:status", (_, { projectPath } = {}) => {
  try {
    return { success: true, ...autoModeService.getStatus({ projectPath }) };
  } catch (error) {
    console.error("[IPC] auto-mode:status error:", error);
    return { success: false, error: error.message };
  }
});

/**
 * Run a specific feature
 */
ipcMain.handle(
  "auto-mode:run-feature",
  async (_, { projectPath, featureId, useWorktrees = false }) => {
    try {
      const sendToRenderer = (data) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("auto-mode:event", data);
        }
      };

      return await autoModeService.runFeature({
        projectPath,
        featureId,
        sendToRenderer,
        useWorktrees,
      });
    } catch (error) {
      console.error("[IPC] auto-mode:run-feature error:", error);
      return { success: false, error: error.message };
    }
  }
);

/**
 * Verify a specific feature by running its tests
 */
ipcMain.handle(
  "auto-mode:verify-feature",
  async (_, { projectPath, featureId }) => {
    try {
      const sendToRenderer = (data) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("auto-mode:event", data);
        }
      };

      return await autoModeService.verifyFeature({
        projectPath,
        featureId,
        sendToRenderer,
      });
    } catch (error) {
      console.error("[IPC] auto-mode:verify-feature error:", error);
      return { success: false, error: error.message };
    }
  }
);

/**
 * Resume a specific feature with previous context
 */
ipcMain.handle(
  "auto-mode:resume-feature",
  async (_, { projectPath, featureId }) => {
    try {
      const sendToRenderer = (data) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("auto-mode:event", data);
        }
      };

      return await autoModeService.resumeFeature({
        projectPath,
        featureId,
        sendToRenderer,
      });
    } catch (error) {
      console.error("[IPC] auto-mode:resume-feature error:", error);
      return { success: false, error: error.message };
    }
  }
);

/**
 * Check if a context file exists for a feature
 */
ipcMain.handle(
  "auto-mode:context-exists",
  async (_, { projectPath, featureId }) => {
    try {
      const contextPath = path.join(
        projectPath,
        ".automaker",
        "context",
        `${featureId}.md`
      );
      try {
        await fs.access(contextPath);
        return { success: true, exists: true };
      } catch {
        return { success: true, exists: false };
      }
    } catch (error) {
      console.error("[IPC] auto-mode:context-exists error:", error);
      return { success: false, error: error.message };
    }
  }
);

/**
 * Analyze a new project - kicks off an agent to analyze the codebase
 * and update the app_spec.txt with tech stack and implemented features
 */
ipcMain.handle("auto-mode:analyze-project", async (_, { projectPath }) => {
  try {
    // Add project path to allowed paths
    addAllowedPath(projectPath);

    const sendToRenderer = (data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("auto-mode:event", data);
      }
    };

    return await autoModeService.analyzeProject({
      projectPath,
      sendToRenderer,
    });
  } catch (error) {
    console.error("[IPC] auto-mode:analyze-project error:", error);
    return { success: false, error: error.message };
  }
});

/**
 * Stop a specific feature
 */
ipcMain.handle("auto-mode:stop-feature", async (_, { featureId }) => {
  try {
    return await autoModeService.stopFeature({ featureId });
  } catch (error) {
    console.error("[IPC] auto-mode:stop-feature error:", error);
    return { success: false, error: error.message };
  }
});

/**
 * Follow-up on a feature with additional prompt
 */
ipcMain.handle(
  "auto-mode:follow-up-feature",
  async (_, { projectPath, featureId, prompt, imagePaths }) => {
    try {
      const sendToRenderer = (data) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("auto-mode:event", data);
        }
      };

      return await autoModeService.followUpFeature({
        projectPath,
        featureId,
        prompt,
        imagePaths,
        sendToRenderer,
      });
    } catch (error) {
      console.error("[IPC] auto-mode:follow-up-feature error:", error);
      return { success: false, error: error.message };
    }
  }
);

/**
 * Commit changes for a feature (no further work, just commit)
 */
ipcMain.handle(
  "auto-mode:commit-feature",
  async (_, { projectPath, featureId }) => {
    try {
      const sendToRenderer = (data) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("auto-mode:event", data);
        }
      };

      return await autoModeService.commitFeature({
        projectPath,
        featureId,
        sendToRenderer,
      });
    } catch (error) {
      console.error("[IPC] auto-mode:commit-feature error:", error);
      return { success: false, error: error.message };
    }
  }
);

// ============================================================================
// Claude CLI Detection IPC Handlers
// ============================================================================

/**
 * Check Claude Code CLI installation status
 */
ipcMain.handle("claude:check-cli", async () => {
  try {
    const claudeCliDetector = require("./services/claude-cli-detector");
    const path = require("path");
    const credentialsPath = path.join(
      app.getPath("userData"),
      "credentials.json"
    );
    const fullStatus = claudeCliDetector.getFullStatus(credentialsPath);

    // Return in format expected by settings view (status: "installed" | "not_installed")
    return {
      success: true,
      status: fullStatus.installed ? "installed" : "not_installed",
      method: fullStatus.auth?.method || null,
      version: fullStatus.version || null,
      path: fullStatus.path || null,
      authenticated: fullStatus.auth?.authenticated || false,
      recommendation: fullStatus.installed
        ? null
        : "Install Claude Code CLI for optimal performance with ultrathink.",
      installCommands: fullStatus.installed
        ? null
        : claudeCliDetector.getInstallCommands(),
    };
  } catch (error) {
    console.error("[IPC] claude:check-cli error:", error);
    return { success: false, error: error.message };
  }
});

// ============================================================================
// Codex CLI Detection IPC Handlers
// ============================================================================

/**
 * Check Codex CLI installation status
 */
ipcMain.handle("codex:check-cli", async () => {
  try {
    const codexCliDetector = require("./services/codex-cli-detector");
    const info = codexCliDetector.getInstallationInfo();
    return { success: true, ...info };
  } catch (error) {
    console.error("[IPC] codex:check-cli error:", error);
    return { success: false, error: error.message };
  }
});

/**
 * Get all available models from all providers
 */
ipcMain.handle("model:get-available", async () => {
  try {
    const { ModelProviderFactory } = require("./services/model-provider");
    const models = ModelProviderFactory.getAllModels();
    return { success: true, models };
  } catch (error) {
    console.error("[IPC] model:get-available error:", error);
    return { success: false, error: error.message };
  }
});

/**
 * Check all provider installation status
 */
ipcMain.handle("model:check-providers", async () => {
  try {
    const { ModelProviderFactory } = require("./services/model-provider");
    const status = await ModelProviderFactory.checkAllProviders();
    return { success: true, providers: status };
  } catch (error) {
    console.error("[IPC] model:check-providers error:", error);
    return { success: false, error: error.message };
  }
});

// ============================================================================
// MCP Server IPC Handlers
// ============================================================================

/**
 * Handle MCP server callback for updating feature status
 * This can be called by the MCP server script via HTTP or other communication mechanism
 * Note: The MCP server script runs as a separate process, so it can't directly use Electron IPC.
 * For now, the MCP server calls featureLoader.updateFeatureStatus directly.
 * This handler is here for future extensibility (e.g., HTTP endpoint bridge).
 */
ipcMain.handle(
  "mcp:update-feature-status",
  async (_, { featureId, status, projectPath, summary }) => {
    try {
      const featureLoader = require("./services/feature-loader");
      await featureLoader.updateFeatureStatus(featureId, status, projectPath, {
        summary,
      });

      // Notify renderer if window is available
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("mcp:feature-status-updated", {
          featureId,
          status,
          projectPath,
          summary,
        });
      }

      return { success: true };
    } catch (error) {
      console.error("[IPC] mcp:update-feature-status error:", error);
      return { success: false, error: error.message };
    }
  }
);

// ============================================================================
// Feature Suggestions IPC Handlers
// ============================================================================

// Track running suggestions analysis
let suggestionsExecution = null;

/**
 * Generate feature suggestions by analyzing the project
 * @param {string} projectPath - The path to the project
 * @param {string} suggestionType - Type of suggestions: "features", "refactoring", "security", "performance"
 */
ipcMain.handle(
  "suggestions:generate",
  async (_, { projectPath, suggestionType = "features" }) => {
    try {
      // Check if already running
      if (suggestionsExecution && suggestionsExecution.isActive()) {
        return {
          success: false,
          error: "Suggestions generation is already running",
        };
      }

      // Create execution context
      suggestionsExecution = {
        abortController: null,
        query: null,
        isActive: () => suggestionsExecution !== null,
      };

      const sendToRenderer = (data) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("suggestions:event", data);
        }
      };

      // Start generating suggestions (runs in background)
      featureSuggestionsService
        .generateSuggestions(
          projectPath,
          sendToRenderer,
          suggestionsExecution,
          suggestionType
        )
        .catch((error) => {
          console.error("[IPC] suggestions:generate background error:", error);
          sendToRenderer({
            type: "suggestions_error",
            error: error.message,
          });
        })
        .finally(() => {
          suggestionsExecution = null;
        });

      // Return immediately
      return { success: true };
    } catch (error) {
      console.error("[IPC] suggestions:generate error:", error);
      suggestionsExecution = null;
      return { success: false, error: error.message };
    }
  }
);

/**
 * Stop the current suggestions generation
 */
ipcMain.handle("suggestions:stop", async () => {
  try {
    if (suggestionsExecution && suggestionsExecution.abortController) {
      suggestionsExecution.abortController.abort();
    }
    suggestionsExecution = null;
    return { success: true };
  } catch (error) {
    console.error("[IPC] suggestions:stop error:", error);
    return { success: false, error: error.message };
  }
});

/**
 * Get suggestions generation status
 */
ipcMain.handle("suggestions:status", () => {
  return {
    success: true,
    isRunning: suggestionsExecution !== null && suggestionsExecution.isActive(),
  };
});

// ============================================================================
// OpenAI API Handlers
// ============================================================================

/**
 * Test OpenAI API connection
 */
ipcMain.handle("openai:test-connection", async (_, { apiKey }) => {
  try {
    // Simple test using fetch to OpenAI API
    const response = await fetch("https://api.openai.com/v1/models", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey || process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
    });

    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        message: `Connected successfully. Found ${
          data.data?.length || 0
        } models.`,
      };
    } else {
      const error = await response.json();
      return {
        success: false,
        error: error.error?.message || "Failed to connect to OpenAI API",
      };
    }
  } catch (error) {
    console.error("[IPC] openai:test-connection error:", error);
    return { success: false, error: error.message };
  }
});

// ============================================================================
// Worktree Management IPC Handlers
// ============================================================================

/**
 * Revert feature changes by removing the worktree
 * This effectively discards all changes made by the agent
 */
ipcMain.handle(
  "worktree:revert-feature",
  async (_, { projectPath, featureId }) => {
    try {
      const sendToRenderer = (data) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("auto-mode:event", data);
        }
      };

      return await autoModeService.revertFeature({
        projectPath,
        featureId,
        sendToRenderer,
      });
    } catch (error) {
      console.error("[IPC] worktree:revert-feature error:", error);
      return { success: false, error: error.message };
    }
  }
);

// ============================================================================
// Spec Regeneration IPC Handlers
// ============================================================================

// Track running spec regeneration
let specRegenerationExecution = null;

/**
 * Regenerate the app spec based on project definition
 */
ipcMain.handle(
  "spec-regeneration:generate",
  async (_, { projectPath, projectDefinition }) => {
    try {
      // Add project path to allowed paths
      addAllowedPath(projectPath);

      // Check if already running
      if (specRegenerationExecution && specRegenerationExecution.isActive()) {
        return {
          success: false,
          error: "Spec regeneration is already running",
        };
      }

      // Create execution context
      specRegenerationExecution = {
        abortController: null,
        query: null,
        isActive: () => specRegenerationExecution !== null,
      };

      const sendToRenderer = (data) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("spec-regeneration:event", data);
        }
      };

      // Start regenerating spec (runs in background)
      specRegenerationService
        .regenerateSpec(
          projectPath,
          projectDefinition,
          sendToRenderer,
          specRegenerationExecution
        )
        .catch((error) => {
          console.error(
            "[IPC] spec-regeneration:generate background error:",
            error
          );
          sendToRenderer({
            type: "spec_regeneration_error",
            error: error.message,
          });
        })
        .finally(() => {
          specRegenerationExecution = null;
        });

      // Return immediately
      return { success: true };
    } catch (error) {
      console.error("[IPC] spec-regeneration:generate error:", error);
      specRegenerationExecution = null;
      return { success: false, error: error.message };
    }
  }
);

/**
 * Stop the current spec regeneration
 */
ipcMain.handle("spec-regeneration:stop", async () => {
  try {
    if (
      specRegenerationExecution &&
      specRegenerationExecution.abortController
    ) {
      specRegenerationExecution.abortController.abort();
    }
    specRegenerationExecution = null;
    return { success: true };
  } catch (error) {
    console.error("[IPC] spec-regeneration:stop error:", error);
    return { success: false, error: error.message };
  }
});

/**
 * Get spec regeneration status
 */
ipcMain.handle("spec-regeneration:status", () => {
  return {
    success: true,
    isRunning:
      specRegenerationExecution !== null &&
      specRegenerationExecution.isActive(),
    currentPhase: specRegenerationService.getCurrentPhase(),
  };
});

/**
 * Create initial app spec for a new project
 */
ipcMain.handle(
  "spec-regeneration:create",
  async (_, { projectPath, projectOverview, generateFeatures = true }) => {
    try {
      // Add project path to allowed paths
      addAllowedPath(projectPath);

      // Check if already running
      if (specRegenerationExecution && specRegenerationExecution.isActive()) {
        return { success: false, error: "Spec creation is already running" };
      }

      // Create execution context
      specRegenerationExecution = {
        abortController: null,
        query: null,
        isActive: () => specRegenerationExecution !== null,
      };

      const sendToRenderer = (data) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("spec-regeneration:event", data);
        }
      };

      // Start creating spec (runs in background)
      specRegenerationService
        .createInitialSpec(
          projectPath,
          projectOverview,
          sendToRenderer,
          specRegenerationExecution,
          generateFeatures
        )
        .catch((error) => {
          console.error(
            "[IPC] spec-regeneration:create background error:",
            error
          );
          sendToRenderer({
            type: "spec_regeneration_error",
            error: error.message,
          });
        })
        .finally(() => {
          specRegenerationExecution = null;
        });

      // Return immediately
      return { success: true };
    } catch (error) {
      console.error("[IPC] spec-regeneration:create error:", error);
      specRegenerationExecution = null;
      return { success: false, error: error.message };
    }
  }
);

/**
 * Generate features from existing app_spec.txt
 * This allows users to generate features retroactively without regenerating the spec
 */
ipcMain.handle(
  "spec-regeneration:generate-features",
  async (_, { projectPath }) => {
    try {
      // Add project path to allowed paths
      addAllowedPath(projectPath);

      // Check if already running
      if (specRegenerationExecution && specRegenerationExecution.isActive()) {
        return {
          success: false,
          error: "Spec regeneration is already running",
        };
      }

      // Create execution context
      specRegenerationExecution = {
        abortController: null,
        query: null,
        isActive: () => specRegenerationExecution !== null,
      };

      const sendToRenderer = (data) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("spec-regeneration:event", data);
        }
      };

      // Start generating features (runs in background)
      specRegenerationService
        .generateFeaturesOnly(
          projectPath,
          sendToRenderer,
          specRegenerationExecution
        )
        .catch((error) => {
          console.error(
            "[IPC] spec-regeneration:generate-features background error:",
            error
          );
          sendToRenderer({
            type: "spec_regeneration_error",
            error: error.message,
          });
        })
        .finally(() => {
          specRegenerationExecution = null;
        });

      // Return immediately
      return { success: true };
    } catch (error) {
      console.error("[IPC] spec-regeneration:generate-features error:", error);
      specRegenerationExecution = null;
      return { success: false, error: error.message };
    }
  }
);

/**
 * Merge feature worktree changes back to main branch
 */
ipcMain.handle(
  "worktree:merge-feature",
  async (_, { projectPath, featureId, options }) => {
    try {
      const sendToRenderer = (data) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("auto-mode:event", data);
        }
      };

      return await autoModeService.mergeFeature({
        projectPath,
        featureId,
        options,
        sendToRenderer,
      });
    } catch (error) {
      console.error("[IPC] worktree:merge-feature error:", error);
      return { success: false, error: error.message };
    }
  }
);
/**
 * Get worktree info for a feature
 */
ipcMain.handle("worktree:get-info", async (_, { projectPath, featureId }) => {
  try {
    return await autoModeService.getWorktreeInfo({ projectPath, featureId });
  } catch (error) {
    console.error("[IPC] worktree:get-info error:", error);
    return { success: false, error: error.message };
  }
});

/**
 * Get worktree status (changed files, commits)
 */
ipcMain.handle("worktree:get-status", async (_, { projectPath, featureId }) => {
  try {
    return await autoModeService.getWorktreeStatus({ projectPath, featureId });
  } catch (error) {
    console.error("[IPC] worktree:get-status error:", error);
    return { success: false, error: error.message };
  }
});

/**
 * List all feature worktrees
 */
ipcMain.handle("worktree:list", async (_, { projectPath }) => {
  try {
    return await autoModeService.listWorktrees({ projectPath });
  } catch (error) {
    console.error("[IPC] worktree:list error:", error);
    return { success: false, error: error.message };
  }
});

/**
 * Get file diffs for a worktree
 */
ipcMain.handle("worktree:get-diffs", async (_, { projectPath, featureId }) => {
  try {
    return await autoModeService.getFileDiffs({ projectPath, featureId });
  } catch (error) {
    console.error("[IPC] worktree:get-diffs error:", error);
    return { success: false, error: error.message };
  }
});

/**
 * Get diff for a specific file in a worktree
 */
ipcMain.handle(
  "worktree:get-file-diff",
  async (_, { projectPath, featureId, filePath }) => {
    try {
      return await autoModeService.getFileDiff({
        projectPath,
        featureId,
        filePath,
      });
    } catch (error) {
      console.error("[IPC] worktree:get-file-diff error:", error);
      return { success: false, error: error.message };
    }
  }
);

/**
 * Get file diffs for the main project (non-worktree)
 */
ipcMain.handle("git:get-diffs", async (_, { projectPath }) => {
  try {
    return await worktreeManager.getFileDiffs(projectPath);
  } catch (error) {
    console.error("[IPC] git:get-diffs error:", error);
    return { success: false, error: error.message };
  }
});

/**
 * Get diff for a specific file in the main project (non-worktree)
 */
ipcMain.handle("git:get-file-diff", async (_, { projectPath, filePath }) => {
  try {
    return await worktreeManager.getFileDiff(projectPath, filePath);
  } catch (error) {
    console.error("[IPC] git:get-file-diff error:", error);
    return { success: false, error: error.message };
  }
});

// ============================================================================
// Setup & CLI Management IPC Handlers
// ============================================================================

/**
 * Get comprehensive Claude CLI status including auth
 */
ipcMain.handle("setup:claude-status", async () => {
  try {
    const claudeCliDetector = require("./services/claude-cli-detector");
    const credentialsPath = path.join(
      app.getPath("userData"),
      "credentials.json"
    );
    const result = claudeCliDetector.getFullStatus(credentialsPath);
    return result;
  } catch (error) {
    console.error("[IPC] setup:claude-status error:", error);
    return { success: false, error: error.message };
  }
});

/**
 * Get comprehensive Codex CLI status including auth
 */
ipcMain.handle("setup:codex-status", async () => {
  try {
    const codexCliDetector = require("./services/codex-cli-detector");
    const info = codexCliDetector.getFullStatus();
    return { success: true, ...info };
  } catch (error) {
    console.error("[IPC] setup:codex-status error:", error);
    return { success: false, error: error.message };
  }
});

/**
 * Install Claude CLI
 */
ipcMain.handle("setup:install-claude", async (event) => {
  try {
    const claudeCliDetector = require("./services/claude-cli-detector");

    const sendProgress = (progress) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("setup:install-progress", {
          cli: "claude",
          ...progress,
        });
      }
    };

    const result = await claudeCliDetector.installCli(sendProgress);
    return { success: true, ...result };
  } catch (error) {
    console.error("[IPC] setup:install-claude error:", error);
    return { success: false, error: error.message || error.error };
  }
});

/**
 * Install Codex CLI
 */
ipcMain.handle("setup:install-codex", async (event) => {
  try {
    const codexCliDetector = require("./services/codex-cli-detector");

    const sendProgress = (progress) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("setup:install-progress", {
          cli: "codex",
          ...progress,
        });
      }
    };

    const result = await codexCliDetector.installCli(sendProgress);
    return { success: true, ...result };
  } catch (error) {
    console.error("[IPC] setup:install-codex error:", error);
    return { success: false, error: error.message || error.error };
  }
});

/**
 * Authenticate Claude CLI (manual auth required)
 */
ipcMain.handle("setup:auth-claude", async (event) => {
  try {
    const claudeCliDetector = require("./services/claude-cli-detector");

    const sendProgress = (progress) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("setup:auth-progress", {
          cli: "claude",
          ...progress,
        });
      }
    };

    const result = await claudeCliDetector.runSetupToken(sendProgress);
    return { success: true, ...result };
  } catch (error) {
    console.error("[IPC] setup:auth-claude error:", error);
    return { success: false, error: error.message || error.error };
  }
});

/**
 * Authenticate Codex CLI with optional API key
 */
ipcMain.handle("setup:auth-codex", async (event, { apiKey }) => {
  try {
    const codexCliDetector = require("./services/codex-cli-detector");

    const sendProgress = (progress) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("setup:auth-progress", {
          cli: "codex",
          ...progress,
        });
      }
    };

    const result = await codexCliDetector.authenticate(apiKey, sendProgress);
    return { success: true, ...result };
  } catch (error) {
    console.error("[IPC] setup:auth-codex error:", error);
    return { success: false, error: error.message || error.error };
  }
});

/**
 * Store API key or OAuth token securely (using app's userData)
 * @param {string} provider - Provider name (anthropic, openai, google, anthropic_oauth_token)
 * @param {string} apiKey - The API key or OAuth token to store
 */
ipcMain.handle("setup:store-api-key", async (_, { provider, apiKey }) => {
  try {
    const configPath = path.join(app.getPath("userData"), "credentials.json");
    let credentials = {};

    // Read existing credentials
    try {
      const content = await fs.readFile(configPath, "utf-8");
      credentials = JSON.parse(content);
    } catch (e) {
      // File doesn't exist, start fresh
    }

    // Store the new key/token
    credentials[provider] = apiKey;

    // Write back
    await fs.writeFile(
      configPath,
      JSON.stringify(credentials, null, 2),
      "utf-8"
    );

    return { success: true };
  } catch (error) {
    console.error("[IPC] setup:store-api-key error:", error);
    return { success: false, error: error.message };
  }
});

/**
 * Get stored API keys and tokens
 */
ipcMain.handle("setup:get-api-keys", async () => {
  try {
    const configPath = path.join(app.getPath("userData"), "credentials.json");

    try {
      const content = await fs.readFile(configPath, "utf-8");
      const credentials = JSON.parse(content);

      // Return which keys/tokens exist (not the actual values for security)
      return {
        success: true,
        hasAnthropicKey: !!credentials.anthropic,
        hasAnthropicOAuthToken: !!credentials.anthropic_oauth_token,
        hasOpenAIKey: !!credentials.openai,
        hasGoogleKey: !!credentials.google,
      };
    } catch (e) {
      return {
        success: true,
        hasAnthropicKey: false,
        hasAnthropicOAuthToken: false,
        hasOpenAIKey: false,
        hasGoogleKey: false,
      };
    }
  } catch (error) {
    console.error("[IPC] setup:get-api-keys error:", error);
    return { success: false, error: error.message };
  }
});

/**
 * Configure Codex MCP server for a project
 */
ipcMain.handle("setup:configure-codex-mcp", async (_, { projectPath }) => {
  try {
    const codexConfigManager = require("./services/codex-config-manager");
    const mcpServerPath = path.join(
      __dirname,
      "services",
      "mcp-server-factory.js"
    );

    const configPath = await codexConfigManager.configureMcpServer(
      projectPath,
      mcpServerPath
    );

    return { success: true, configPath };
  } catch (error) {
    console.error("[IPC] setup:configure-codex-mcp error:", error);
    return { success: false, error: error.message };
  }
});

/**
 * Get platform information
 */
ipcMain.handle("setup:get-platform", async () => {
  const os = require("os");
  return {
    success: true,
    platform: process.platform,
    arch: process.arch,
    homeDir: os.homedir(),
    isWindows: process.platform === "win32",
    isMac: process.platform === "darwin",
    isLinux: process.platform === "linux",
  };
});

// ============================================================================
// Features IPC Handlers
// ============================================================================

/**
 * Get all features for a project
 */
ipcMain.handle("features:getAll", async (_, { projectPath }) => {
  try {
    // Security check
    if (!isPathAllowed(projectPath)) {
      return {
        success: false,
        error: "Access denied: Path is outside allowed project directories",
      };
    }

    const featureLoader = require("./services/feature-loader");
    const features = await featureLoader.getAll(projectPath);
    return { success: true, features };
  } catch (error) {
    console.error("[IPC] features:getAll error:", error);
    return { success: false, error: error.message };
  }
});

/**
 * Get a single feature by ID
 */
ipcMain.handle("features:get", async (_, { projectPath, featureId }) => {
  try {
    // Security check
    if (!isPathAllowed(projectPath)) {
      return {
        success: false,
        error: "Access denied: Path is outside allowed project directories",
      };
    }

    const featureLoader = require("./services/feature-loader");
    const feature = await featureLoader.get(projectPath, featureId);
    if (!feature) {
      return { success: false, error: "Feature not found" };
    }
    return { success: true, feature };
  } catch (error) {
    console.error("[IPC] features:get error:", error);
    return { success: false, error: error.message };
  }
});

/**
 * Create a new feature
 */
ipcMain.handle("features:create", async (_, { projectPath, feature }) => {
  try {
    // Security check
    if (!isPathAllowed(projectPath)) {
      return {
        success: false,
        error: "Access denied: Path is outside allowed project directories",
      };
    }

    const featureLoader = require("./services/feature-loader");
    const createdFeature = await featureLoader.create(projectPath, feature);
    return { success: true, feature: createdFeature };
  } catch (error) {
    console.error("[IPC] features:create error:", error);
    return { success: false, error: error.message };
  }
});

/**
 * Update a feature (partial updates supported)
 */
ipcMain.handle(
  "features:update",
  async (_, { projectPath, featureId, updates }) => {
    try {
      // Security check
      if (!isPathAllowed(projectPath)) {
        return {
          success: false,
          error: "Access denied: Path is outside allowed project directories",
        };
      }

      const featureLoader = require("./services/feature-loader");
      const updatedFeature = await featureLoader.update(
        projectPath,
        featureId,
        updates
      );
      return { success: true, feature: updatedFeature };
    } catch (error) {
      console.error("[IPC] features:update error:", error);
      return { success: false, error: error.message };
    }
  }
);

/**
 * Delete a feature and its folder
 */
ipcMain.handle("features:delete", async (_, { projectPath, featureId }) => {
  try {
    // Security check
    if (!isPathAllowed(projectPath)) {
      return {
        success: false,
        error: "Access denied: Path is outside allowed project directories",
      };
    }

    const featureLoader = require("./services/feature-loader");
    await featureLoader.delete(projectPath, featureId);
    return { success: true };
  } catch (error) {
    console.error("[IPC] features:delete error:", error);
    return { success: false, error: error.message };
  }
});

/**
 * Get agent output for a feature
 */
ipcMain.handle(
  "features:getAgentOutput",
  async (_, { projectPath, featureId }) => {
    try {
      // Security check
      if (!isPathAllowed(projectPath)) {
        return {
          success: false,
          error: "Access denied: Path is outside allowed project directories",
        };
      }

      const featureLoader = require("./services/feature-loader");
      const content = await featureLoader.getAgentOutput(
        projectPath,
        featureId
      );
      return { success: true, content };
    } catch (error) {
      console.error("[IPC] features:getAgentOutput error:", error);
      return { success: false, error: error.message };
    }
  }
);

// ============================================================================
// Running Agents IPC Handlers
// ============================================================================

/**
 * Get all currently running agents across all projects
 */
ipcMain.handle("running-agents:getAll", () => {
  try {
    const status = autoModeService.getStatus();
    const allStatuses = autoModeService.getAllProjectStatuses();

    // Build a list of running agents with their details
    const runningAgents = [];

    for (const [projectPath, projectStatus] of Object.entries(allStatuses)) {
      for (const featureId of projectStatus.runningFeatures) {
        runningAgents.push({
          featureId,
          projectPath,
          projectName: projectPath.split(/[/\\]/).pop() || projectPath,
          isAutoMode: projectStatus.isRunning,
        });
      }
    }

    return {
      success: true,
      runningAgents,
      totalCount: status.runningCount,
      autoLoopRunning: status.autoLoopRunning,
    };
  } catch (error) {
    console.error("[IPC] running-agents:getAll error:", error);
    return { success: false, error: error.message };
  }
});
