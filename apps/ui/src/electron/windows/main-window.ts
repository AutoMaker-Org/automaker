/**
 * Main window creation and lifecycle
 *
 * Handles creating the main BrowserWindow and its event handlers.
 */

import path from 'path';
import { app, BrowserWindow, shell } from 'electron';
import { createLogger } from '@automaker/utils/logger';
import { MIN_WIDTH_COLLAPSED, MIN_HEIGHT, DEFAULT_WIDTH, DEFAULT_HEIGHT } from '../constants';
import { state } from '../state';
import { getIconPath } from '../utils/icon-manager';
import {
  loadWindowBounds,
  saveWindowBounds,
  validateBounds,
  scheduleSaveWindowBounds,
} from './window-bounds';

const logger = createLogger('MainWindow');

// Development environment
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

/**
 * Create the main window
 */
export function createWindow(): void {
  const isDev = !app.isPackaged;
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
      // __dirname is apps/ui/dist-electron (Vite bundles all into single file)
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    // Hide the default Electron/Chromium menu bar on Linux (File/Edit/View/Help).
    // It still appears on Alt-press so keyboard-only users aren't locked out.
    autoHideMenuBar: true,
    // titleBarStyle is macOS-only; use hiddenInset for native look on macOS
    ...(process.platform === 'darwin' && { titleBarStyle: 'hiddenInset' as const }),
    backgroundColor: '#0a0a0a',
  };

  if (iconPath) {
    windowOptions.icon = iconPath;
  }

  state.mainWindow = new BrowserWindow(windowOptions);

  // Restore maximized state if previously maximized
  if (validBounds?.isMaximized) {
    state.mainWindow.maximize();
  }

  // Load Vite dev server in development or static server in production
  if (VITE_DEV_SERVER_URL) {
    state.mainWindow.loadURL(VITE_DEV_SERVER_URL);
  } else if (isDev) {
    // Fallback for dev without Vite server URL
    state.mainWindow.loadURL(`http://localhost:${state.staticPort}`);
  } else {
    state.mainWindow.loadURL(`http://localhost:${state.staticPort}`);
  }

  if (isDev && process.env.OPEN_DEVTOOLS === 'true') {
    state.mainWindow.webContents.openDevTools();
  }

  // Save window bounds on close, resize, and move
  state.mainWindow.on('close', () => {
    // Save immediately before closing (not debounced)
    if (state.mainWindow && !state.mainWindow.isDestroyed()) {
      const isMaximized = state.mainWindow.isMaximized();
      const bounds = isMaximized
        ? state.mainWindow.getNormalBounds()
        : state.mainWindow.getBounds();

      saveWindowBounds({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        isMaximized,
      });
    }
  });

  state.mainWindow.on('closed', () => {
    state.mainWindow = null;
  });

  state.mainWindow.on('resized', () => {
    scheduleSaveWindowBounds();
  });

  state.mainWindow.on('moved', () => {
    scheduleSaveWindowBounds();
  });

  state.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  logger.info('Main window created');
}
