/**
 * Settings Service - Handles reading/writing settings to JSON files
 *
 * Provides persistent storage for:
 * - Global settings (DATA_DIR/settings.json)
 * - Credentials (DATA_DIR/credentials.json)
 * - Per-project settings ({projectPath}/.automaker/settings.json)
 */

import { createLogger } from '@automaker/utils';
import * as secureFs from '../lib/secure-fs.js';

import {
  getGlobalSettingsPath,
  getCredentialsPath,
  getProjectSettingsPath,
  ensureDataDir,
  ensureAutomakerDir,
} from '@automaker/platform';
import type {
  GlobalSettings,
  Credentials,
  ProjectSettings,
  KeyboardShortcuts,
  AIProfile,
  ProjectRef,
  TrashedProjectRef,
  BoardBackgroundSettings,
  WorktreeInfo,
} from '../types/settings.js';
import {
  DEFAULT_GLOBAL_SETTINGS,
  DEFAULT_CREDENTIALS,
  DEFAULT_PROJECT_SETTINGS,
  SETTINGS_VERSION,
  CREDENTIALS_VERSION,
  PROJECT_SETTINGS_VERSION,
} from '../types/settings.js';

const logger = createLogger('SettingsService');

/**
 * Atomic file write - write to temp file then rename
 */
async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
  const tempPath = `${filePath}.tmp.${Date.now()}`;
  const content = JSON.stringify(data, null, 2);

  try {
    await secureFs.writeFile(tempPath, content, 'utf-8');
    await secureFs.rename(tempPath, filePath);
  } catch (error) {
    // Clean up temp file if it exists
    try {
      await secureFs.unlink(tempPath);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * Safely read JSON file with fallback to default
 */
async function readJsonFile<T>(filePath: string, defaultValue: T): Promise<T> {
  try {
    const content = (await secureFs.readFile(filePath, 'utf-8')) as string;
    return JSON.parse(content) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return defaultValue;
    }
    logger.error(`Error reading ${filePath}:`, error);
    return defaultValue;
  }
}

/**
 * Check if a file exists
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await secureFs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * SettingsService - Manages persistent storage of user settings and credentials
 *
 * Handles reading and writing settings to JSON files with atomic operations
 * for reliability. Provides three levels of settings:
 * - Global settings: shared preferences in {dataDir}/settings.json
 * - Credentials: sensitive API keys in {dataDir}/credentials.json
 * - Project settings: per-project overrides in {projectPath}/.automaker/settings.json
 *
 * All operations are atomic (write to temp file, then rename) to prevent corruption.
 * Missing files are treated as empty and return defaults on read.
 * Updates use deep merge for nested objects like keyboardShortcuts and apiKeys.
 */
export class SettingsService {
  private dataDir: string;

  /**
   * Create a new SettingsService instance
   *
   * @param dataDir - Absolute path to global data directory (e.g., ~/.automaker)
   */
  constructor(dataDir: string) {
    this.dataDir = dataDir;
  }

  // ============================================================================
  // Global Settings
  // ============================================================================

  /**
   * Get global settings with defaults applied for any missing fields
   *
   * Reads from {dataDir}/settings.json. If file doesn't exist, returns defaults.
   * Missing fields are filled in from DEFAULT_GLOBAL_SETTINGS for forward/backward
   * compatibility during schema migrations.
   *
   * @returns Promise resolving to complete GlobalSettings object
   */
  async getGlobalSettings(): Promise<GlobalSettings> {
    const settingsPath = getGlobalSettingsPath(this.dataDir);
    const settings = await readJsonFile<GlobalSettings>(settingsPath, DEFAULT_GLOBAL_SETTINGS);

    // Apply any missing defaults (for backwards compatibility)
    return {
      ...DEFAULT_GLOBAL_SETTINGS,
      ...settings,
      keyboardShortcuts: {
        ...DEFAULT_GLOBAL_SETTINGS.keyboardShortcuts,
        ...settings.keyboardShortcuts,
      },
    };
  }

  /**
   * Update global settings with partial changes
   *
   * Performs a deep merge: nested objects like keyboardShortcuts are merged,
   * not replaced. Updates are written atomically. Creates dataDir if needed.
   *
   * @param updates - Partial GlobalSettings to merge (only provided fields are updated)
   * @returns Promise resolving to complete updated GlobalSettings
   */
  async updateGlobalSettings(updates: Partial<GlobalSettings>): Promise<GlobalSettings> {
    await ensureDataDir(this.dataDir);
    const settingsPath = getGlobalSettingsPath(this.dataDir);

    const current = await this.getGlobalSettings();
    const updated: GlobalSettings = {
      ...current,
      ...updates,
      version: SETTINGS_VERSION,
    };

    // Deep merge keyboard shortcuts if provided
    if (updates.keyboardShortcuts) {
      updated.keyboardShortcuts = {
        ...current.keyboardShortcuts,
        ...updates.keyboardShortcuts,
      };
    }

    await atomicWriteJson(settingsPath, updated);
    logger.info('Global settings updated');

    return updated;
  }

  /**
   * Check if global settings file exists
   *
   * Used to determine if user has previously configured settings.
   *
   * @returns Promise resolving to true if {dataDir}/settings.json exists
   */
  async hasGlobalSettings(): Promise<boolean> {
    const settingsPath = getGlobalSettingsPath(this.dataDir);
    return fileExists(settingsPath);
  }

  // ============================================================================
  // Credentials
  // ============================================================================

  /**
   * Get credentials with defaults applied
   *
   * Reads from {dataDir}/credentials.json. If file doesn't exist, returns
   * defaults (empty API keys). Used primarily by backend for API authentication.
   * UI should use getMaskedCredentials() instead.
   *
   * @returns Promise resolving to complete Credentials object
   */
  async getCredentials(): Promise<Credentials> {
    const credentialsPath = getCredentialsPath(this.dataDir);
    const credentials = await readJsonFile<Credentials>(credentialsPath, DEFAULT_CREDENTIALS);

    return {
      ...DEFAULT_CREDENTIALS,
      ...credentials,
      apiKeys: {
        ...DEFAULT_CREDENTIALS.apiKeys,
        ...credentials.apiKeys,
      },
    };
  }

  /**
   * Update credentials with partial changes
   *
   * Updates individual API keys. Uses deep merge for apiKeys object.
   * Creates dataDir if needed. Credentials are written atomically.
   * WARNING: Use only in secure contexts - keys are unencrypted.
   *
   * @param updates - Partial Credentials (usually just apiKeys)
   * @returns Promise resolving to complete updated Credentials object
   */
  async updateCredentials(updates: Partial<Credentials>): Promise<Credentials> {
    await ensureDataDir(this.dataDir);
    const credentialsPath = getCredentialsPath(this.dataDir);

    const current = await this.getCredentials();
    const updated: Credentials = {
      ...current,
      ...updates,
      version: CREDENTIALS_VERSION,
    };

    // Deep merge api keys if provided
    if (updates.apiKeys) {
      updated.apiKeys = {
        ...current.apiKeys,
        ...updates.apiKeys,
      };
    }

    await atomicWriteJson(credentialsPath, updated);
    logger.info('Credentials updated');

    return updated;
  }

  /**
   * Get masked credentials safe for UI display
   *
   * Returns API keys masked for security (first 4 and last 4 chars visible).
   * Use this for showing credential status in UI without exposing full keys.
   * Each key includes a 'configured' boolean and masked string representation.
   *
   * @returns Promise resolving to masked credentials object with each provider's status
   */
  async getMaskedCredentials(): Promise<{
    anthropic: { configured: boolean; masked: string };
    google: { configured: boolean; masked: string };
    openai: { configured: boolean; masked: string };
    zai: { configured: boolean; masked: string };
  }> {
    const credentials = await this.getCredentials();

    const maskKey = (key: string): string => {
      if (!key || key.length < 8) return '';
      return `${key.substring(0, 4)}...${key.substring(key.length - 4)}`;
    };

    return {
      anthropic: {
        configured: !!credentials.apiKeys.anthropic,
        masked: maskKey(credentials.apiKeys.anthropic),
      },
      google: {
        configured: !!credentials.apiKeys.google,
        masked: maskKey(credentials.apiKeys.google),
      },
      openai: {
        configured: !!credentials.apiKeys.openai,
        masked: maskKey(credentials.apiKeys.openai),
      },
      zai: {
        configured: !!credentials.apiKeys.zai,
        masked: maskKey(credentials.apiKeys.zai),
      },
    };
  }

  /**
   * Check if credentials file exists
   *
   * Used to determine if user has configured any API keys.
   *
   * @returns Promise resolving to true if {dataDir}/credentials.json exists
   */
  async hasCredentials(): Promise<boolean> {
    const credentialsPath = getCredentialsPath(this.dataDir);
    return fileExists(credentialsPath);
  }

  // ============================================================================
  // Project Settings
  // ============================================================================

  /**
   * Get project-specific settings with defaults applied
   *
   * Reads from {projectPath}/.automaker/settings.json. If file doesn't exist,
   * returns defaults. Project settings are optional - missing values fall back
   * to global settings on the UI side.
   *
   * @param projectPath - Absolute path to project directory
   * @returns Promise resolving to complete ProjectSettings object
   */
  async getProjectSettings(projectPath: string): Promise<ProjectSettings> {
    const settingsPath = getProjectSettingsPath(projectPath);
    const settings = await readJsonFile<ProjectSettings>(settingsPath, DEFAULT_PROJECT_SETTINGS);

    return {
      ...DEFAULT_PROJECT_SETTINGS,
      ...settings,
    };
  }

  /**
   * Update project-specific settings with partial changes
   *
   * Performs a deep merge on boardBackground. Creates .automaker directory
   * in project if needed. Updates are written atomically.
   *
   * @param projectPath - Absolute path to project directory
   * @param updates - Partial ProjectSettings to merge
   * @returns Promise resolving to complete updated ProjectSettings
   */
  async updateProjectSettings(
    projectPath: string,
    updates: Partial<ProjectSettings>
  ): Promise<ProjectSettings> {
    await ensureAutomakerDir(projectPath);
    const settingsPath = getProjectSettingsPath(projectPath);

    const current = await this.getProjectSettings(projectPath);
    const updated: ProjectSettings = {
      ...current,
      ...updates,
      version: PROJECT_SETTINGS_VERSION,
    };

    // Deep merge board background if provided
    if (updates.boardBackground) {
      updated.boardBackground = {
        ...current.boardBackground,
        ...updates.boardBackground,
      };
    }

    await atomicWriteJson(settingsPath, updated);
    logger.info(`Project settings updated for ${projectPath}`);

    return updated;
  }

  /**
   * Check if project settings file exists
   *
   * @param projectPath - Absolute path to project directory
   * @returns Promise resolving to true if {projectPath}/.automaker/settings.json exists
   */
  async hasProjectSettings(projectPath: string): Promise<boolean> {
    const settingsPath = getProjectSettingsPath(projectPath);
    return fileExists(settingsPath);
  }

  // ============================================================================
  // Migration
  // ============================================================================

  /**
   * Migrate settings from localStorage to file-based storage
   *
   * Called during onboarding when UI detects localStorage data but no settings files.
   * Extracts global settings, credentials, and per-project settings from various
   * localStorage keys and writes them to the new file-based storage.
   * Collects errors but continues on partial failures.
   *
   * @param localStorageData - Object containing localStorage key/value pairs to migrate
   * @returns Promise resolving to migration result with success status and error list
   */
  async migrateFromLocalStorage(localStorageData: {
    'automaker-storage'?: string;
    'automaker-setup'?: string;
    'worktree-panel-collapsed'?: string;
    'file-browser-recent-folders'?: string;
    'automaker:lastProjectDir'?: string;
  }): Promise<{
    success: boolean;
    migratedGlobalSettings: boolean;
    migratedCredentials: boolean;
    migratedProjectCount: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let migratedGlobalSettings = false;
    let migratedCredentials = false;
    let migratedProjectCount = 0;

    try {
      // Parse the main automaker-storage
      let appState: Record<string, unknown> = {};
      if (localStorageData['automaker-storage']) {
        try {
          const parsed = JSON.parse(localStorageData['automaker-storage']);
          appState = parsed.state || parsed;
        } catch (e) {
          errors.push(`Failed to parse automaker-storage: ${e}`);
        }
      }

      // Extract global settings
      const globalSettings: Partial<GlobalSettings> = {
        theme: (appState.theme as GlobalSettings['theme']) || 'dark',
        sidebarOpen: appState.sidebarOpen !== undefined ? (appState.sidebarOpen as boolean) : true,
        chatHistoryOpen: (appState.chatHistoryOpen as boolean) || false,
        kanbanCardDetailLevel:
          (appState.kanbanCardDetailLevel as GlobalSettings['kanbanCardDetailLevel']) || 'standard',
        maxConcurrency: (appState.maxConcurrency as number) || 3,
        defaultSkipTests:
          appState.defaultSkipTests !== undefined ? (appState.defaultSkipTests as boolean) : true,
        enableDependencyBlocking:
          appState.enableDependencyBlocking !== undefined
            ? (appState.enableDependencyBlocking as boolean)
            : true,
        useWorktrees: (appState.useWorktrees as boolean) || false,
        showProfilesOnly: (appState.showProfilesOnly as boolean) || false,
        defaultPlanningMode:
          (appState.defaultPlanningMode as GlobalSettings['defaultPlanningMode']) || 'skip',
        defaultRequirePlanApproval: (appState.defaultRequirePlanApproval as boolean) || false,
        defaultAIProfileId: (appState.defaultAIProfileId as string | null) || null,
        muteDoneSound: (appState.muteDoneSound as boolean) || false,
        enhancementModel:
          (appState.enhancementModel as GlobalSettings['enhancementModel']) || 'sonnet',
        keyboardShortcuts:
          (appState.keyboardShortcuts as KeyboardShortcuts) ||
          DEFAULT_GLOBAL_SETTINGS.keyboardShortcuts,
        aiProfiles: (appState.aiProfiles as AIProfile[]) || [],
        projects: (appState.projects as ProjectRef[]) || [],
        trashedProjects: (appState.trashedProjects as TrashedProjectRef[]) || [],
        projectHistory: (appState.projectHistory as string[]) || [],
        projectHistoryIndex: (appState.projectHistoryIndex as number) || -1,
        lastSelectedSessionByProject:
          (appState.lastSelectedSessionByProject as Record<string, string>) || {},
      };

      // Add direct localStorage values
      if (localStorageData['automaker:lastProjectDir']) {
        globalSettings.lastProjectDir = localStorageData['automaker:lastProjectDir'];
      }

      if (localStorageData['file-browser-recent-folders']) {
        try {
          globalSettings.recentFolders = JSON.parse(
            localStorageData['file-browser-recent-folders']
          );
        } catch {
          globalSettings.recentFolders = [];
        }
      }

      if (localStorageData['worktree-panel-collapsed']) {
        globalSettings.worktreePanelCollapsed =
          localStorageData['worktree-panel-collapsed'] === 'true';
      }

      // Save global settings
      await this.updateGlobalSettings(globalSettings);
      migratedGlobalSettings = true;
      logger.info('Migrated global settings from localStorage');

      // Extract and save credentials
      if (appState.apiKeys) {
        const apiKeys = appState.apiKeys as {
          anthropic?: string;
          google?: string;
          openai?: string;
          zai?: string;
        };
        await this.updateCredentials({
          apiKeys: {
            anthropic: apiKeys.anthropic || '',
            google: apiKeys.google || '',
            openai: apiKeys.openai || '',
            zai: apiKeys.zai || '',
          },
        });
        migratedCredentials = true;
        logger.info('Migrated credentials from localStorage');
      }

      // Migrate per-project settings
      const boardBackgroundByProject = appState.boardBackgroundByProject as
        | Record<string, BoardBackgroundSettings>
        | undefined;
      const currentWorktreeByProject = appState.currentWorktreeByProject as
        | Record<string, { path: string | null; branch: string }>
        | undefined;
      const worktreesByProject = appState.worktreesByProject as
        | Record<string, WorktreeInfo[]>
        | undefined;

      // Get unique project paths that have per-project settings
      const projectPaths = new Set<string>();
      if (boardBackgroundByProject) {
        Object.keys(boardBackgroundByProject).forEach((p) => projectPaths.add(p));
      }
      if (currentWorktreeByProject) {
        Object.keys(currentWorktreeByProject).forEach((p) => projectPaths.add(p));
      }
      if (worktreesByProject) {
        Object.keys(worktreesByProject).forEach((p) => projectPaths.add(p));
      }

      // Also check projects list for theme settings
      const projects = (appState.projects as ProjectRef[]) || [];
      for (const project of projects) {
        if (project.theme) {
          projectPaths.add(project.path);
        }
      }

      // Migrate each project's settings
      for (const projectPath of projectPaths) {
        try {
          const projectSettings: Partial<ProjectSettings> = {};

          // Get theme from project object
          const project = projects.find((p) => p.path === projectPath);
          if (project?.theme) {
            projectSettings.theme = project.theme as ProjectSettings['theme'];
          }

          if (boardBackgroundByProject?.[projectPath]) {
            projectSettings.boardBackground = boardBackgroundByProject[projectPath];
          }

          if (currentWorktreeByProject?.[projectPath]) {
            projectSettings.currentWorktree = currentWorktreeByProject[projectPath];
          }

          if (worktreesByProject?.[projectPath]) {
            projectSettings.worktrees = worktreesByProject[projectPath];
          }

          if (Object.keys(projectSettings).length > 0) {
            await this.updateProjectSettings(projectPath, projectSettings);
            migratedProjectCount++;
          }
        } catch (e) {
          errors.push(`Failed to migrate project settings for ${projectPath}: ${e}`);
        }
      }

      logger.info(`Migration complete: ${migratedProjectCount} projects migrated`);

      return {
        success: errors.length === 0,
        migratedGlobalSettings,
        migratedCredentials,
        migratedProjectCount,
        errors,
      };
    } catch (error) {
      logger.error('Migration failed:', error);
      errors.push(`Migration failed: ${error}`);
      return {
        success: false,
        migratedGlobalSettings,
        migratedCredentials,
        migratedProjectCount,
        errors,
      };
    }
  }

  /**
   * Get the data directory path
   *
   * Returns the absolute path to the directory where global settings and
   * credentials are stored. Useful for logging, debugging, and validation.
   *
   * @returns Absolute path to data directory
   */
  getDataDir(): string {
    return this.dataDir;
  }
}
