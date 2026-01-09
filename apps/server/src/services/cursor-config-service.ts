/**
 * Cursor Config Service
 *
 * Manages Cursor CLI permissions configuration files:
 * - Global: ~/.cursor/cli-config.json
 * - Project: <project>/.cursor/cli.json
 *
 * Based on: https://cursor.com/docs/cli/reference/configuration
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { createLogger } from '@automaker/utils';
import type {
  CursorCliConfigFile,
  CursorCliPermissions,
  CursorPermissionProfile,
} from '@automaker/types';
import {
  CURSOR_STRICT_PROFILE,
  CURSOR_DEVELOPMENT_PROFILE,
  CURSOR_PERMISSION_PROFILES,
} from '@automaker/types';

const logger = createLogger('CursorConfigService');

/**
 * Get the path to the global Cursor CLI config
 */
export function getGlobalConfigPath(): string {
  // Windows: $env:USERPROFILE\.cursor\cli-config.json
  // macOS/Linux: ~/.cursor/cli-config.json
  // XDG_CONFIG_HOME override on Linux: $XDG_CONFIG_HOME/cursor/cli-config.json
  const xdgConfig = process.env.XDG_CONFIG_HOME;
  const cursorConfigDir = process.env.CURSOR_CONFIG_DIR;

  if (cursorConfigDir) {
    return path.join(cursorConfigDir, 'cli-config.json');
  }

  if (process.platform === 'linux' && xdgConfig) {
    return path.join(xdgConfig, 'cursor', 'cli-config.json');
  }

  return path.join(os.homedir(), '.cursor', 'cli-config.json');
}

/**
 * Get the path to a project's Cursor CLI config
 */
export function getProjectConfigPath(projectPath: string): string {
  return path.join(projectPath, '.cursor', 'cli.json');
}

/**
 * Read the global Cursor CLI config
 */
export async function readGlobalConfig(): Promise<CursorCliConfigFile | null> {
  const configPath = getGlobalConfigPath();

  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(content) as CursorCliConfigFile;
    logger.debug('Read global Cursor config from:', configPath);
    return config;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      logger.debug('Global Cursor config not found at:', configPath);
      return null;
    }
    logger.error('Failed to read global Cursor config:', error);
    throw error;
  }
}

/**
 * Write the global Cursor CLI config
 */
export async function writeGlobalConfig(config: CursorCliConfigFile): Promise<void> {
  const configPath = getGlobalConfigPath();
  const configDir = path.dirname(configPath);

  // Ensure directory exists
  await fs.mkdir(configDir, { recursive: true });

  // Write config
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));
  logger.info('Wrote global Cursor config to:', configPath);
}

/**
 * Read a project's Cursor CLI config
 */
export async function readProjectConfig(projectPath: string): Promise<CursorCliConfigFile | null> {
  const configPath = getProjectConfigPath(projectPath);

  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(content) as CursorCliConfigFile;
    logger.debug('Read project Cursor config from:', configPath);
    return config;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      logger.debug('Project Cursor config not found at:', configPath);
      return null;
    }
    logger.error('Failed to read project Cursor config:', error);
    throw error;
  }
}

/**
 * Write a project's Cursor CLI config
 *
 * Note: Project-level config ONLY supports permissions.
 * The version field and other settings are global-only.
 * See: https://cursor.com/docs/cli/reference/configuration
 */
export async function writeProjectConfig(
  projectPath: string,
  config: CursorCliConfigFile
): Promise<void> {
  const configPath = getProjectConfigPath(projectPath);
  const configDir = path.dirname(configPath);

  // Ensure .cursor directory exists
  await fs.mkdir(configDir, { recursive: true });

  // Write config (project config ONLY supports permissions - no version field!)
  const projectConfig = {
    permissions: config.permissions,
  };

  await fs.writeFile(configPath, JSON.stringify(projectConfig, null, 2));
  logger.info('Wrote project Cursor config to:', configPath);
}

/**
 * Delete a project's Cursor CLI config
 */
export async function deleteProjectConfig(projectPath: string): Promise<void> {
  const configPath = getProjectConfigPath(projectPath);

  try {
    await fs.unlink(configPath);
    logger.info('Deleted project Cursor config:', configPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

/**
 * Get the effective permissions for a project
 * Project config takes precedence over global config
 */
export async function getEffectivePermissions(
  projectPath?: string
): Promise<CursorCliPermissions | null> {
  // Try project config first
  if (projectPath) {
    const projectConfig = await readProjectConfig(projectPath);
    if (projectConfig?.permissions) {
      return projectConfig.permissions;
    }
  }

  // Fall back to global config
  const globalConfig = await readGlobalConfig();
  return globalConfig?.permissions || null;
}

/**
 * Apply a predefined permission profile to a project
 */
export async function applyProfileToProject(
  projectPath: string,
  profileId: CursorPermissionProfile
): Promise<void> {
  const profile = CURSOR_PERMISSION_PROFILES.find((p) => p.id === profileId);

  if (!profile) {
    throw new Error(`Unknown permission profile: ${profileId}`);
  }

  await writeProjectConfig(projectPath, {
    version: 1,
    permissions: profile.permissions,
  });

  logger.info(`Applied "${profile.name}" profile to project:`, projectPath);
}

/**
 * Apply a predefined permission profile globally
 */
export async function applyProfileGlobally(profileId: CursorPermissionProfile): Promise<void> {
  const profile = CURSOR_PERMISSION_PROFILES.find((p) => p.id === profileId);

  if (!profile) {
    throw new Error(`Unknown permission profile: ${profileId}`);
  }

  // Read existing global config to preserve other settings
  const existingConfig = await readGlobalConfig();

  await writeGlobalConfig({
    version: 1,
    ...existingConfig,
    permissions: profile.permissions,
  });

  logger.info(`Applied "${profile.name}" profile globally`);
}

/**
 * Detect which profile matches the current permissions
 */
export function detectProfile(
  permissions: CursorCliPermissions | null
): CursorPermissionProfile | null {
  if (!permissions) {
    return null;
  }

  // Check if permissions match a predefined profile
  for (const profile of CURSOR_PERMISSION_PROFILES) {
    const allowMatch =
      JSON.stringify(profile.permissions.allow.sort()) === JSON.stringify(permissions.allow.sort());
    const denyMatch =
      JSON.stringify(profile.permissions.deny.sort()) === JSON.stringify(permissions.deny.sort());

    if (allowMatch && denyMatch) {
      return profile.id;
    }
  }

  return 'custom';
}

/**
 * Generate example config file content
 */
export function generateExampleConfig(profileId: CursorPermissionProfile = 'development'): string {
  const profile =
    CURSOR_PERMISSION_PROFILES.find((p) => p.id === profileId) || CURSOR_DEVELOPMENT_PROFILE;

  const config: CursorCliConfigFile = {
    version: 1,
    permissions: profile.permissions,
  };

  return JSON.stringify(config, null, 2);
}

/**
 * Check if a project has Cursor CLI config
 */
export async function hasProjectConfig(projectPath: string): Promise<boolean> {
  const configPath = getProjectConfigPath(projectPath);

  try {
    await fs.access(configPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get all available permission profiles
 */
export function getAvailableProfiles() {
  return CURSOR_PERMISSION_PROFILES;
}

// Export profile constants for convenience
export { CURSOR_STRICT_PROFILE, CURSOR_DEVELOPMENT_PROFILE };
