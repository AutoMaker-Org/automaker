/**
 * Electron main process entry point
 *
 * Handles app lifecycle, initialization, and coordination of modular components.
 *
 * Architecture:
 * - electron/constants.ts      - Window sizing, port defaults, filenames
 * - electron/state.ts          - Shared state container
 * - electron/utils/            - Port and icon utilities
 * - electron/security/         - API key management
 * - electron/windows/          - Window bounds and main window creation
 * - electron/server/           - Backend and static server management
 * - electron/ipc/              - IPC handlers (dialog, shell, app, auth, window, server)
 *
 * SECURITY: All file system access uses centralized methods from @automaker/platform.
 */

import path from 'path';
import { app, BrowserWindow, dialog } from 'electron';
import {
  setElectronUserDataPath,
  setElectronAppPaths,
  initAllowedPaths,
} from '@automaker/platform';
import { createLogger } from '@automaker/utils/logger';
import { DEFAULT_SERVER_PORT, DEFAULT_STATIC_PORT } from './electron/constants';
import { state } from './electron/state';
import { findAvailablePort } from './electron/utils/port-manager';
import { getIconPath } from './electron/utils/icon-manager';
import { ensureApiKey } from './electron/security/api-key-manager';
import { createWindow } from './electron/windows/main-window';
import { startStaticServer, stopStaticServer } from './electron/server/static-server';
import { startServer, waitForServer, stopServer } from './electron/server/backend-server';
import { registerAllHandlers } from './electron/ipc';

const logger = createLogger('Electron');

// Development environment
const isDev = !app.isPackaged;

// Load environment variables from .env file (development only)
if (isDev) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('dotenv').config({ path: path.join(__dirname, '../.env') });
  } catch (error) {
    logger.warn('dotenv not available:', (error as Error).message);
  }
}

// On Linux, auto-detect X11 vs Wayland so the app launches correctly from
// desktop entries where the display protocol isn't guaranteed to be X11.
// Must be set before app.whenReady() — has no effect on macOS/Windows.
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
}

// Register IPC handlers
registerAllHandlers();

// App lifecycle
app.whenReady().then(handleAppReady);
app.on('window-all-closed', handleWindowAllClosed);
app.on('before-quit', handleBeforeQuit);

/**
 * Handle app.whenReady()
 */
async function handleAppReady(): Promise<void> {
  // In production, use Automaker dir in appData for app isolation
  // In development, use project root for shared data between Electron and web mode
  let userDataPathToUse: string;

  if (app.isPackaged) {
    // Production: Ensure userData path is consistent so files land in Automaker dir
    try {
      const desiredUserDataPath = path.join(app.getPath('appData'), 'Automaker');

      if (app.getPath('userData') !== desiredUserDataPath) {
        app.setPath('userData', desiredUserDataPath);
        logger.info('[PRODUCTION] userData path set to:', desiredUserDataPath);
      }

      userDataPathToUse = desiredUserDataPath;
    } catch (error) {
      logger.warn('[PRODUCTION] Failed to set userData path:', (error as Error).message);
      userDataPathToUse = app.getPath('userData');
    }
  } else {
    // Development: Explicitly set userData to project root for shared data between Electron and web
    // This OVERRIDES Electron's default userData path (~/.config/Automaker)
    // __dirname is apps/ui/dist-electron, so go up to get project root
    const projectRoot = path.join(__dirname, '../../..');
    userDataPathToUse = path.join(projectRoot, 'data');

    try {
      app.setPath('userData', userDataPathToUse);
      logger.info('[DEVELOPMENT] userData path explicitly set to:', userDataPathToUse);
    } catch (error) {
      logger.warn(
        '[DEVELOPMENT] Failed to set userData path, using fallback:',
        (error as Error).message
      );
      userDataPathToUse = path.join(projectRoot, 'data');
    }
  }

  // Initialize centralized path helpers for Electron
  // This must be done before any file operations
  setElectronUserDataPath(userDataPathToUse);

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
  // Use the project's shared data directory in development, userData in production
  const mainProcessDataDir = app.isPackaged
    ? app.getPath('userData')
    : path.join(process.cwd(), 'data');
  process.env.DATA_DIR = mainProcessDataDir;
  logger.info('[MAIN_PROCESS_DATA_DIR]', mainProcessDataDir);

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
    state.isExternalServerMode = skipEmbeddedServer;

    if (skipEmbeddedServer) {
      // Use the default server port (Docker container runs on 3008)
      state.serverPort = DEFAULT_SERVER_PORT;
      logger.info('SKIP_EMBEDDED_SERVER=true, using external server at port', state.serverPort);

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
      state.serverPort = await findAvailablePort(DEFAULT_SERVER_PORT);
      if (state.serverPort !== DEFAULT_SERVER_PORT) {
        logger.info(
          'Default server port',
          DEFAULT_SERVER_PORT,
          'in use, using port',
          state.serverPort
        );
      }
    }

    state.staticPort = await findAvailablePort(DEFAULT_STATIC_PORT);
    if (state.staticPort !== DEFAULT_STATIC_PORT) {
      logger.info(
        'Default static port',
        DEFAULT_STATIC_PORT,
        'in use, using port',
        state.staticPort
      );
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
}

/**
 * Handle window-all-closed event
 */
function handleWindowAllClosed(): void {
  // On macOS, keep the app and servers running when all windows are closed
  // (standard macOS behavior). On other platforms, stop servers and quit.
  if (process.platform !== 'darwin') {
    stopServer();
    stopStaticServer();
    app.quit();
  }
}

/**
 * Handle before-quit event
 */
function handleBeforeQuit(): void {
  stopServer();
  stopStaticServer();
}
