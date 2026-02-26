/**
 * Icon management utilities
 *
 * Functions for getting the application icon path.
 */

import path from 'path';
import { app } from 'electron';
import { electronAppExists } from '@automaker/platform';
import { createLogger } from '@automaker/utils/logger';

const logger = createLogger('IconManager');

/**
 * Get icon path - works in both dev and production, cross-platform
 * Uses centralized electronApp methods for path validation.
 */
export function getIconPath(): string | null {
  const isDev = !app.isPackaged;

  let iconFile: string;
  if (process.platform === 'win32') {
    iconFile = 'icon.ico';
  } else {
    iconFile = 'logo_larger.png';
  }

  // __dirname is apps/ui/dist-electron (Vite bundles all into single file)
  let iconPath: string;
  if (isDev) {
    iconPath = path.join(__dirname, '../public', iconFile);
  } else if (process.platform === 'linux') {
    // On Linux, use the icon copied to resourcesPath via extraResources.
    // This places it outside app.asar so the window manager can read it
    // directly, and matches the absolute path used in the .desktop entry.
    iconPath = path.join(process.resourcesPath, iconFile);
  } else {
    // macOS / Windows: icon is inside the asar; Electron handles it natively.
    iconPath = path.join(__dirname, '../dist', iconFile);
  }

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
