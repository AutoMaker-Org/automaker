/**
 * Utility functions for determining default workspace directories
 * Centralizes the logic for determining where projects should be created/opened
 */

import { createLogger } from '@automaker/utils/logger';
import { getHttpApiClient } from './http-api-client';
import { getElectronAPI } from './electron';
import { getItem, setItem } from './storage';
import path from 'path';

const logger = createLogger('WorkspaceConfig');

const LAST_PROJECT_DIR_KEY = 'automaker:lastProjectDir';

/**
 * Gets the default Documents/Automaker directory path
 * @returns Promise resolving to Documents/Automaker path, or null if unavailable
 */
async function getDefaultDocumentsPath(): Promise<string | null> {
  try {
    const api = getElectronAPI();
    const documentsPath = await api.getPath('documents');
    return path.join(documentsPath, 'Automaker');
  } catch (error) {
    logger.error('Failed to get documents path:', error);
    return null;
  }
}

/**
 * Determines the default directory for project creation/opening
 * Priority order:
 * 1. ALLOWED_ROOT_DIRECTORY (if configured)
 * 2. Last used directory from localStorage (if ALLOWED_ROOT_DIRECTORY is not set)
 * 3. Documents/Automaker (if ALLOWED_ROOT_DIRECTORY is not set)
 * 4. DATA_DIR (if ALLOWED_ROOT_DIRECTORY is not set and Documents unavailable)
 * 5. null (no default)
 *
 * @returns Promise resolving to the default directory path, or null if none available
 */
export async function getDefaultWorkspaceDirectory(): Promise<string | null> {
  try {
    const httpClient = getHttpApiClient();
    const result = await httpClient.workspace.getConfig();

    if (result.success) {
      // If ALLOWED_ROOT_DIRECTORY is configured, use it
      if (result.configured && result.workspaceDir) {
        return result.workspaceDir;
      }

      // If ALLOWED_ROOT_DIRECTORY is not set, use priority:
      // 1. Last used directory
      // 2. Documents/Automaker
      // 3. DATA_DIR as fallback
      const lastUsedDir = getItem(LAST_PROJECT_DIR_KEY);

      if (lastUsedDir) {
        return lastUsedDir;
      }

      // Try to get Documents/Automaker
      const documentsPath = await getDefaultDocumentsPath();
      if (documentsPath) {
        return documentsPath;
      }

      // Fallback to DATA_DIR if available
      if (result.defaultDir) {
        return result.defaultDir;
      }
    }

    // If API call failed, still try last used dir and Documents
    const lastUsedDir = getItem(LAST_PROJECT_DIR_KEY);

    if (lastUsedDir) {
      return lastUsedDir;
    }

    const documentsPath = await getDefaultDocumentsPath();
    return documentsPath;
  } catch (error) {
    logger.error('Failed to get default workspace directory:', error);

    // On error, try last used dir and Documents
    const lastUsedDir = getItem(LAST_PROJECT_DIR_KEY);

    if (lastUsedDir) {
      return lastUsedDir;
    }

    const documentsPath = await getDefaultDocumentsPath();
    return documentsPath;
  }
}

/**
 * Saves the last used project directory to localStorage
 * @param path - The directory path to save
 */
export function saveLastProjectDirectory(path: string): void {
  setItem(LAST_PROJECT_DIR_KEY, path);
}
