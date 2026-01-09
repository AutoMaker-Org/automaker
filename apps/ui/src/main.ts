/**
 * Electron main process (TypeScript)
 *
 * This version spawns the backend server and uses HTTP API for most operations.
 * Only native features (dialogs, shell) use IPC.
 *
 * SECURITY: All file system access uses centralized methods from @automaker/platform.
 */

import path from 'path';
import { spawn, execSync, ChildProcess } from 'child_process';
import crypto from 'crypto';
import http, { Server } from 'http';
import net from 'net';
import { app, BrowserWindow, ipcMain, dialog, shell, screen } from 'electron';
import { createLogger } from '@automaker/utils/logger';
import {
  findNodeExecutable,
  buildEnhancedPath,
  initAllowedPaths,
  isPathAllowed,
  getAllowedRootDirectory,
  // Electron userData operations
  setElectronUserDataPath,
  electronUserDataReadFileSync,
  electronUserDataWriteFileSync,
  electronUserDataExists,
  // Electron app bundle operations
  setElectronAppPaths,
  electronAppExists,
  electronAppReadFileSync,
  electronAppStatSync,
  electronAppStat,
  electronAppReadFile,
  // System path operations
  systemPathExists,
} from '@automaker/platform';

const logger = createLogger('Electron');
const serverLogger = createLogger('Server');

// Development environment
const isDev = !app.isPackaged;
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

// Load environment variables from .env file (development only)
if (isDev) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('dotenv').config({ path: path.join(__dirname, '../.env') });
  } catch (error) {
    logger.warn('dotenv not available:', (error as Error).message);
  }
}

let mainWindow: BrowserWindow | null = null;
let serverProcess: ChildProcess | null = null;
let staticServer: Server | null = null;

// Default ports (can be overridden via env) - will be dynamically assigned if these are in use
// When launched via root init.mjs we pass:
// - PORT (backend)
// - TEST_PORT (vite dev server / static)
const DEFAULT_SERVER_PORT = parseInt(process.env.PORT || '3008', 10);
const DEFAULT_STATIC_PORT = parseInt(process.env.TEST_PORT || '3007', 10);

// Actual ports in use (set during startup)
let serverPort = DEFAULT_SERVER_PORT;
let staticPort = DEFAULT_STATIC_PORT;

/**
 * Check if a port is available
 */
function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => {
      resolve(false);
    });
    server.once('listening', () => {
      server.close(() => {
        resolve(true);
      });
    });
    // Use Node's default binding semantics (matches most dev servers)
    // This avoids false-positives when a port is taken on IPv6/dual-stack.
    server.listen(port);
  });
}

/**
 * Find an available port starting from the preferred port
 * Tries up to 100 ports in sequence
 */
async function findAvailablePort(preferredPort: number): Promise<number> {
  for (let offset = 0; offset < 100; offset++) {
    const port = preferredPort + offset;
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`Could not find an available port starting from ${preferredPort}`);
}

// ============================================
// Window sizing constants for kanban layout
// ============================================
// Calculation: 4 columns × 280px + 3 gaps × 20px + 40px padding = 1220px board content
// With sidebar expanded (288px): 1220 + 288 = 1508px
// Minimum window dimensions - reduced to allow smaller windows since kanban now supports horizontal scrolling
const SIDEBAR_EXPANDED = 288;
const SIDEBAR_COLLAPSED = 64;

const MIN_WIDTH_EXPANDED = 800; // Reduced - horizontal scrolling handles overflow
const MIN_WIDTH_COLLAPSED = 600; // Reduced - horizontal scrolling handles overflow
const MIN_HEIGHT = 500; // Reduced to allow more flexibility
const DEFAULT_WIDTH = 1600;
const DEFAULT_HEIGHT = 950;

// Window bounds interface (matches @automaker/types WindowBounds)
interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  isMaximized: boolean;
}

// Debounce timer for saving window bounds
let saveWindowBoundsTimeout: ReturnType<typeof setTimeout> | null = null;

// API key for CSRF protection
let apiKey: string | null = null;

// Track if we're using an external server (Docker API mode)
let isExternalServerMode = false;

/**
 * Get the relative path to API key file within userData
 */
const API_KEY_FILENAME = '.api-key';

/**
 * Ensure an API key exists - load from file or generate new one.
 * This key is passed to the server for CSRF protection.
 * Uses centralized electronUserData methods for path validation.
 */
function ensureApiKey(): string {
  try {
    if (electronUserDataExists(API_KEY_FILENAME)) {
      const key = electronUserDataReadFileSync(API_KEY_FILENAME).trim();
      if (key) {
        apiKey = key;
        logger.info('Loaded existing API key');
        return apiKey;
      }
    }
  } catch (error) {
    logger.warn('Error reading API key:', error);
  }

  // Generate new key
  apiKey = crypto.randomUUID();
  try {
    electronUserDataWriteFileSync(API_KEY_FILENAME, apiKey, { encoding: 'utf-8', mode: 0o600 });
    logger.info('Generated new API key');
  } catch (error) {
    logger.error('Failed to save API key:', error);
  }
  return apiKey;
}

/**
 * Get icon path - works in both dev and production, cross-platform
 * Uses centralized electronApp methods for path validation.
 */
function getIconPath(): string | null {
  let iconFile: string;
  if (process.platform === 'win32') {
    iconFile = 'icon.ico';
  } else if (process.platform === 'darwin') {
    iconFile = 'logo_larger.png';
  } else {
    iconFile = 'logo_larger.png';
  }

  const iconPath = isDev
    ? path.join(__dirname, '../public', iconFile)
    : path.join(__dirname, '../dist/public', iconFile);

  try {
    if (!electronAppExists(iconPath)) {
      logger.warn('Icon not found at:', iconPath);
      return null;
    }
  } catch (error) {
    logger.warn('Icon check failed:', iconPath, error);
    return null;
  }

  return iconPath;
}

/**
 * Relative path to window bounds settings file within userData
 */
const WINDOW_BOUNDS_FILENAME = 'window-bounds.json';

/**
 * Load saved window bounds from disk
 * Uses centralized electronUserData methods for path validation.
 */
function loadWindowBounds(): WindowBounds | null {
  try {
    if (electronUserDataExists(WINDOW_BOUNDS_FILENAME)) {
      const data = electronUserDataReadFileSync(WINDOW_BOUNDS_FILENAME);
      const bounds = JSON.parse(data) as WindowBounds;
      // Validate the loaded data has required fields
      if (
        typeof bounds.x === 'number' &&
        typeof bounds.y === 'number' &&
        typeof bounds.width === 'number' &&
        typeof bounds.height === 'number'
      ) {
        return bounds;
      }
    }
  } catch (error) {
    logger.warn('Failed to load window bounds:', (error as Error).message);
  }
  return null;
}

/**
 * Save window bounds to disk
 * Uses centralized electronUserData methods for path validation.
 */
function saveWindowBounds(bounds: WindowBounds): void {
  try {
    electronUserDataWriteFileSync(WINDOW_BOUNDS_FILENAME, JSON.stringify(bounds, null, 2));
    logger.info('Window bounds saved');
  } catch (error) {
    logger.warn('Failed to save window bounds:', (error as Error).message);
  }
}

/**
 * Schedule a debounced save of window bounds (500ms delay)
 */
function scheduleSaveWindowBounds(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  if (saveWindowBoundsTimeout) {
    clearTimeout(saveWindowBoundsTimeout);
  }

  saveWindowBoundsTimeout = setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    const isMaximized = mainWindow.isMaximized();
    // Use getNormalBounds() for maximized windows to save pre-maximized size
    const bounds = isMaximized ? mainWindow.getNormalBounds() : mainWindow.getBounds();

    saveWindowBounds({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      isMaximized,
    });
  }, 500);
}

/**
 * Validate that window bounds are visible on at least one display
 * Returns adjusted bounds if needed, or null if completely off-screen
 */
function validateBounds(bounds: WindowBounds): WindowBounds {
  const displays = screen.getAllDisplays();

  // Check if window center is visible on any display
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;

  let isVisible = false;
  for (const display of displays) {
    const { x, y, width, height } = display.workArea;
    if (centerX >= x && centerX <= x + width && centerY >= y && centerY <= y + height) {
      isVisible = true;
      break;
    }
  }

  if (!isVisible) {
    // Window is off-screen, reset to primary display
    const primaryDisplay = screen.getPrimaryDisplay();
    const { x, y, width, height } = primaryDisplay.workArea;

    return {
      x: x + Math.floor((width - bounds.width) / 2),
      y: y + Math.floor((height - bounds.height) / 2),
      width: Math.min(bounds.width, width),
      height: Math.min(bounds.height, height),
      isMaximized: bounds.isMaximized,
    };
  }

  // Ensure minimum dimensions
  return {
    ...bounds,
    width: Math.max(bounds.width, MIN_WIDTH_COLLAPSED),
    height: Math.max(bounds.height, MIN_HEIGHT),
  };
}

/**
 * Start static file server for production builds
 * Uses centralized electronApp methods for serving static files from app bundle.
 */
async function startStaticServer(): Promise<void> {
  const staticPath = path.join(__dirname, '../dist');

  staticServer = http.createServer((request, response) => {
    let filePath = path.join(staticPath, request.url?.split('?')[0] || '/');

    if (filePath.endsWith('/')) {
      filePath = path.join(filePath, 'index.html');
    } else if (!path.extname(filePath)) {
      // For client-side routing, serve index.html for paths without extensions
      const possibleFile = filePath + '.html';
      try {
        if (!electronAppExists(filePath) && !electronAppExists(possibleFile)) {
          filePath = path.join(staticPath, 'index.html');
        } else if (electronAppExists(possibleFile)) {
          filePath = possibleFile;
        }
      } catch {
        filePath = path.join(staticPath, 'index.html');
      }
    }

    electronAppStat(filePath, (err, stats) => {
      if (err || !stats?.isFile()) {
        filePath = path.join(staticPath, 'index.html');
      }

      electronAppReadFile(filePath, (error, content) => {
        if (error || !content) {
          response.writeHead(500);
          response.end('Server Error');
          return;
        }

        const ext = path.extname(filePath);
        const contentTypes: Record<string, string> = {
          '.html': 'text/html',
          '.js': 'application/javascript',
          '.css': 'text/css',
          '.json': 'application/json',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.gif': 'image/gif',
          '.svg': 'image/svg+xml',
          '.ico': 'image/x-icon',
          '.woff': 'font/woff',
          '.woff2': 'font/woff2',
          '.ttf': 'font/ttf',
          '.eot': 'application/vnd.ms-fontobject',
        };

        response.writeHead(200, {
          'Content-Type': contentTypes[ext] || 'application/octet-stream',
        });
        response.end(content);
      });
    });
  });

  return new Promise((resolve, reject) => {
    staticServer!.listen(staticPort, () => {
      logger.info('Static server running at http://localhost:' + staticPort);
      resolve();
    });
    staticServer!.on('error', reject);
  });
}

/**
 * Start the backend server
 * Uses centralized methods for path validation.
 */
async function startServer(): Promise<void> {
  // Find Node.js executable (handles desktop launcher scenarios)
  const nodeResult = findNodeExecutable({
    skipSearch: isDev,
    logger: (msg: string) => logger.info(msg),
  });
  const command = nodeResult.nodePath;

  // Validate that the found Node executable actually exists
  // systemPathExists is used because node-finder returns system paths
  if (command !== 'node') {
    let exists: boolean;
    try {
      exists = systemPathExists(command);
    } catch (error) {
      const originalError = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to verify Node.js executable at: ${command} (source: ${nodeResult.source}). Reason: ${originalError}`
      );
    }
    if (!exists) {
      throw new Error(`Node.js executable not found at: ${command} (source: ${nodeResult.source})`);
    }
  }

  let args: string[];
  let serverPath: string;

  if (isDev) {
    serverPath = path.join(__dirname, '../../server/src/index.ts');

    const serverNodeModules = path.join(__dirname, '../../server/node_modules/tsx');
    const rootNodeModules = path.join(__dirname, '../../../node_modules/tsx');

    let tsxCliPath: string;
    // Check for tsx in app bundle paths
    try {
      if (electronAppExists(path.join(serverNodeModules, 'dist/cli.mjs'))) {
        tsxCliPath = path.join(serverNodeModules, 'dist/cli.mjs');
      } else if (electronAppExists(path.join(rootNodeModules, 'dist/cli.mjs'))) {
        tsxCliPath = path.join(rootNodeModules, 'dist/cli.mjs');
      } else {
        try {
          tsxCliPath = require.resolve('tsx/cli.mjs', {
            paths: [path.join(__dirname, '../../server')],
          });
        } catch {
          throw new Error("Could not find tsx. Please run 'npm install' in the server directory.");
        }
      }
    } catch {
      try {
        tsxCliPath = require.resolve('tsx/cli.mjs', {
          paths: [path.join(__dirname, '../../server')],
        });
      } catch {
        throw new Error("Could not find tsx. Please run 'npm install' in the server directory.");
      }
    }

    args = [tsxCliPath, 'watch', serverPath];
  } else {
    serverPath = path.join(process.resourcesPath, 'server', 'index.js');
    args = [serverPath];

    try {
      if (!electronAppExists(serverPath)) {
        throw new Error(`Server not found at: ${serverPath}`);
      }
    } catch {
      throw new Error(`Server not found at: ${serverPath}`);
    }
  }

  const serverNodeModules = app.isPackaged
    ? path.join(process.resourcesPath, 'server', 'node_modules')
    : path.join(__dirname, '../../server/node_modules');

  // Server root directory - where .env file is located
  // In dev: apps/server (not apps/server/src)
  // In production: resources/server
  const serverRoot = app.isPackaged
    ? path.join(process.resourcesPath, 'server')
    : path.join(__dirname, '../../server');

  // Build enhanced PATH that includes Node.js directory (cross-platform)
  const enhancedPath = buildEnhancedPath(command, process.env.PATH || '');
  if (enhancedPath !== process.env.PATH) {
    logger.info('Enhanced PATH with Node directory:', path.dirname(command));
  }

  const env = {
    ...process.env,
    PATH: enhancedPath,
    PORT: serverPort.toString(),
    DATA_DIR: app.getPath('userData'),
    NODE_PATH: serverNodeModules,
    // Pass API key to server for CSRF protection
    AUTOMAKER_API_KEY: apiKey!,
    // Only set ALLOWED_ROOT_DIRECTORY if explicitly provided in environment
    // If not set, server will allow access to all paths
    ...(process.env.ALLOWED_ROOT_DIRECTORY && {
      ALLOWED_ROOT_DIRECTORY: process.env.ALLOWED_ROOT_DIRECTORY,
    }),
  };

  logger.info('Server will use port', serverPort);

  logger.info('Starting backend server...');
  logger.info('Server path:', serverPath);
  logger.info('Server root (cwd):', serverRoot);
  logger.info('NODE_PATH:', serverNodeModules);

  serverProcess = spawn(command, args, {
    cwd: serverRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serverProcess.stdout?.on('data', (data) => {
    serverLogger.info(data.toString().trim());
  });

  serverProcess.stderr?.on('data', (data) => {
    serverLogger.error(data.toString().trim());
  });

  serverProcess.on('close', (code) => {
    serverLogger.info('Process exited with code', code);
    serverProcess = null;
  });

  serverProcess.on('error', (err) => {
    serverLogger.error('Failed to start server process:', err);
    serverProcess = null;
  });

  await waitForServer();
}

/**
 * Wait for server to be available
 */
async function waitForServer(maxAttempts = 30): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const req = http.get(`http://localhost:${serverPort}/api/health`, (res) => {
          if (res.statusCode === 200) {
            resolve();
          } else {
            reject(new Error(`Status: ${res.statusCode}`));
          }
        });
        req.on('error', reject);
        req.setTimeout(1000, () => {
          req.destroy();
          reject(new Error('Timeout'));
        });
      });
      logger.info('Server is ready');
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  throw new Error('Server failed to start');
}

/**
 * Create the main window
 */
function createWindow(): void {
  const iconPath = getIconPath();

  // Load and validate saved window bounds
  const savedBounds = loadWindowBounds();
  const validBounds = savedBounds ? validateBounds(savedBounds) : null;

  const windowOptions: Electron.BrowserWindowConstructorOptions = {
    width: validBounds?.width ?? DEFAULT_WIDTH,
    height: validBounds?.height ?? DEFAULT_HEIGHT,
    x: validBounds?.x,
    y: validBounds?.y,
    minWidth: MIN_WIDTH_COLLAPSED, // Small minimum - horizontal scrolling handles overflow
    minHeight: MIN_HEIGHT,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0a0a0a',
  };

  if (iconPath) {
    windowOptions.icon = iconPath;
  }

  mainWindow = new BrowserWindow(windowOptions);

  // Restore maximized state if previously maximized
  if (validBounds?.isMaximized) {
    mainWindow.maximize();
  }

  // Load Vite dev server in development or static server in production
  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
  } else if (isDev) {
    // Fallback for dev without Vite server URL
    mainWindow.loadURL(`http://localhost:${staticPort}`);
  } else {
    mainWindow.loadURL(`http://localhost:${staticPort}`);
  }

  if (isDev && process.env.OPEN_DEVTOOLS === 'true') {
    mainWindow.webContents.openDevTools();
  }

  // Save window bounds on close, resize, and move
  mainWindow.on('close', () => {
    // Save immediately before closing (not debounced)
    if (mainWindow && !mainWindow.isDestroyed()) {
      const isMaximized = mainWindow.isMaximized();
      const bounds = isMaximized ? mainWindow.getNormalBounds() : mainWindow.getBounds();

      saveWindowBounds({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        isMaximized,
      });
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.on('resized', () => {
    scheduleSaveWindowBounds();
  });

  mainWindow.on('moved', () => {
    scheduleSaveWindowBounds();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// App lifecycle
app.whenReady().then(async () => {
  // Ensure userData path is consistent across dev/prod so files land in Automaker dir
  try {
    const desiredUserDataPath = path.join(app.getPath('appData'), 'Automaker');
    if (app.getPath('userData') !== desiredUserDataPath) {
      app.setPath('userData', desiredUserDataPath);
      logger.info('userData path set to:', desiredUserDataPath);
    }
  } catch (error) {
    logger.warn('Failed to set userData path:', (error as Error).message);
  }

  // Initialize centralized path helpers for Electron
  // This must be done before any file operations
  setElectronUserDataPath(app.getPath('userData'));

  // In development mode, allow access to the entire project root (for source files, node_modules, etc.)
  // In production, only allow access to the built app directory and resources
  if (isDev) {
    // __dirname is apps/ui/dist-electron, so go up 3 levels to get project root
    const projectRoot = path.join(__dirname, '../../..');
    setElectronAppPaths([__dirname, projectRoot]);
  } else {
    setElectronAppPaths(__dirname, process.resourcesPath);
  }
  logger.info('Initialized path security helpers');

  // Initialize security settings for path validation
  // Set DATA_DIR before initializing so it's available for security checks
  process.env.DATA_DIR = app.getPath('userData');
  // ALLOWED_ROOT_DIRECTORY should already be in process.env if set by user
  // (it will be passed to server process, but we also need it in main process for dialog validation)
  initAllowedPaths();

  if (process.platform === 'darwin' && app.dock) {
    const iconPath = getIconPath();
    if (iconPath) {
      try {
        app.dock.setIcon(iconPath);
      } catch (error) {
        logger.warn('Failed to set dock icon:', (error as Error).message);
      }
    }
  }

  try {
    // Check if we should skip the embedded server (for Docker API mode)
    const skipEmbeddedServer = process.env.SKIP_EMBEDDED_SERVER === 'true';
    isExternalServerMode = skipEmbeddedServer;

    if (skipEmbeddedServer) {
      // Use the default server port (Docker container runs on 3008)
      serverPort = DEFAULT_SERVER_PORT;
      logger.info('SKIP_EMBEDDED_SERVER=true, using external server at port', serverPort);

      // Wait for external server to be ready
      logger.info('Waiting for external server...');
      await waitForServer(60); // Give Docker container more time to start
      logger.info('External server is ready');

      // In external server mode, we don't set an API key here.
      // The renderer will detect external server mode and use session-based
      // auth like web mode, redirecting to /login where the user enters
      // the API key from the Docker container logs.
      logger.info('External server mode: using session-based authentication');
    } else {
      // Generate or load API key for CSRF protection (before starting server)
      ensureApiKey();

      // Find available ports (prevents conflicts with other apps using same ports)
      serverPort = await findAvailablePort(DEFAULT_SERVER_PORT);
      if (serverPort !== DEFAULT_SERVER_PORT) {
        logger.info('Default server port', DEFAULT_SERVER_PORT, 'in use, using port', serverPort);
      }
    }

    staticPort = await findAvailablePort(DEFAULT_STATIC_PORT);
    if (staticPort !== DEFAULT_STATIC_PORT) {
      logger.info('Default static port', DEFAULT_STATIC_PORT, 'in use, using port', staticPort);
    }

    // Start static file server in production
    if (app.isPackaged) {
      await startStaticServer();
    }

    // Start backend server (unless using external server)
    if (!skipEmbeddedServer) {
      await startServer();
    }

    // Create window
    createWindow();
  } catch (error) {
    logger.error('Failed to start:', error);
    const errorMessage = (error as Error).message;
    const isNodeError = errorMessage.includes('Node.js');
    dialog.showErrorBox(
      'Automaker Failed to Start',
      `The application failed to start.\n\n${errorMessage}\n\n${
        isNodeError
          ? 'Please install Node.js from https://nodejs.org or via a package manager (Homebrew, nvm, fnm).'
          : 'Please check the application logs for more details.'
      }`
    );
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // On macOS, keep the app and servers running when all windows are closed
  // (standard macOS behavior). On other platforms, stop servers and quit.
  if (process.platform !== 'darwin') {
    if (serverProcess && serverProcess.pid) {
      logger.info('All windows closed, stopping server...');
      if (process.platform === 'win32') {
        try {
          execSync(`taskkill /f /t /pid ${serverProcess.pid}`, { stdio: 'ignore' });
        } catch (error) {
          logger.error('Failed to kill server process:', (error as Error).message);
        }
      } else {
        serverProcess.kill('SIGTERM');
      }
      serverProcess = null;
    }

    if (staticServer) {
      logger.info('Stopping static server...');
      staticServer.close();
      staticServer = null;
    }

    app.quit();
  }
});

app.on('before-quit', () => {
  if (serverProcess && serverProcess.pid) {
    logger.info('Stopping server...');
    if (process.platform === 'win32') {
      try {
        // Windows: use taskkill with /t to kill entire process tree
        // This prevents orphaned node processes when closing the app
        // Using execSync to ensure process is killed before app exits
        execSync(`taskkill /f /t /pid ${serverProcess.pid}`, { stdio: 'ignore' });
      } catch (error) {
        logger.error('Failed to kill server process:', (error as Error).message);
      }
    } else {
      serverProcess.kill('SIGTERM');
    }
    serverProcess = null;
  }

  if (staticServer) {
    logger.info('Stopping static server...');
    staticServer.close();
    staticServer = null;
  }
});

// ============================================
// IPC Handlers - Only native features
// ============================================

// Native file dialogs
ipcMain.handle('dialog:openDirectory', async () => {
  if (!mainWindow) {
    return { canceled: true, filePaths: [] };
  }
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
  });

  // Validate selected path against ALLOWED_ROOT_DIRECTORY if configured
  if (!result.canceled && result.filePaths.length > 0) {
    const selectedPath = result.filePaths[0];
    if (!isPathAllowed(selectedPath)) {
      const allowedRoot = getAllowedRootDirectory();
      const errorMessage = allowedRoot
        ? `The selected directory is not allowed. Please select a directory within: ${allowedRoot}`
        : 'The selected directory is not allowed.';

      await dialog.showErrorBox('Directory Not Allowed', errorMessage);

      return { canceled: true, filePaths: [] };
    }
  }

  return result;
});

ipcMain.handle('dialog:openFile', async (_, options = {}) => {
  if (!mainWindow) {
    return { canceled: true, filePaths: [] };
  }
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    ...options,
  });
  return result;
});

ipcMain.handle('dialog:saveFile', async (_, options = {}) => {
  if (!mainWindow) {
    return { canceled: true, filePath: undefined };
  }
  const result = await dialog.showSaveDialog(mainWindow, options);
  return result;
});

// Shell operations
ipcMain.handle('shell:openExternal', async (_, url: string) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('shell:openPath', async (_, filePath: string) => {
  try {
    await shell.openPath(filePath);
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

// Open file in editor (VS Code, etc.) with optional line/column
ipcMain.handle(
  'shell:openInEditor',
  async (_, filePath: string, line?: number, column?: number) => {
    try {
      // Build VS Code URL scheme: vscode://file/path:line:column
      // This works on all platforms where VS Code is installed
      // URL encode the path to handle special characters (spaces, brackets, etc.)
      // Handle both Unix (/) and Windows (\) path separators
      const normalizedPath = filePath.replace(/\\/g, '/');
      const encodedPath = normalizedPath.startsWith('/')
        ? '/' + normalizedPath.slice(1).split('/').map(encodeURIComponent).join('/')
        : normalizedPath.split('/').map(encodeURIComponent).join('/');
      let url = `vscode://file${encodedPath}`;
      if (line !== undefined && line > 0) {
        url += `:${line}`;
        if (column !== undefined && column > 0) {
          url += `:${column}`;
        }
      }
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }
);

// App info
ipcMain.handle('app:getPath', async (_, name: Parameters<typeof app.getPath>[0]) => {
  return app.getPath(name);
});

ipcMain.handle('app:getVersion', async () => {
  return app.getVersion();
});

ipcMain.handle('app:isPackaged', async () => {
  return app.isPackaged;
});

// Ping - for connection check
ipcMain.handle('ping', async () => {
  return 'pong';
});

// Get server URL for HTTP client
ipcMain.handle('server:getUrl', async () => {
  return `http://localhost:${serverPort}`;
});

// Get API key for authentication
// Returns null in external server mode to trigger session-based auth
ipcMain.handle('auth:getApiKey', () => {
  if (isExternalServerMode) {
    return null;
  }
  return apiKey;
});

// Check if running in external server mode (Docker API)
// Used by renderer to determine auth flow
ipcMain.handle('auth:isExternalServerMode', () => {
  return isExternalServerMode;
});

// Window management - update minimum width based on sidebar state
// Now uses a fixed small minimum since horizontal scrolling handles overflow
ipcMain.handle('window:updateMinWidth', (_, _sidebarExpanded: boolean) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  // Always use the smaller minimum width - horizontal scrolling handles any overflow
  mainWindow.setMinimumSize(MIN_WIDTH_COLLAPSED, MIN_HEIGHT);
});

// Quit the application (used when user denies sandbox risk confirmation)
ipcMain.handle('app:quit', () => {
  logger.info('Quitting application via IPC request');
  app.quit();
});
