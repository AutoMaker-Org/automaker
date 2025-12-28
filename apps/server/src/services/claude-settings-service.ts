/**
 * Claude Code Settings Service
 *
 * Manages Claude Code configuration files (.claude/settings.json)
 * and environment variables for the orchestrator.
 *
 * This enables the orchestrator to dynamically adjust its configuration
 * including MCP tools, permissions, and environment variables.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Claude Code Settings structure
 */
export interface ClaudeSettings {
  permissions?: {
    allow?: string[];
    deny?: string[];
    defaultMode?: 'acceptEdits' | 'manual';
  };
  enabledPlugins?: Record<string, boolean>;
  extraKnownMarketplaces?: Record<string, unknown>;
  sandbox?: {
    enabled?: boolean;
    autoAllowBashIfSandboxed?: boolean;
  };
}

/**
 * Environment variables for orchestrator
 */
export interface OrchestratorEnvVars {
  GREPTILE_API_KEY?: string;
  GREPTILE_API_URL?: string;
  EXA_API_KEY?: string;
  ORCHESTRATOR_PROJECT_ID?: string;
  ORCHESTRATOR_PROJECT_NAME?: string;
  ORCHESTRATOR_AUTO_START_TASKS?: string;
  ORCHESTRATOR_AUTO_START_WORKSPACE?: string;
  ORCHESTRATOR_POLL_INTERVAL?: string;
  ORCHESTRATOR_MAX_CONCURRENT_RESEARCH?: string;
  ORCHESTRATOR_GITHUB_REPO?: string;
  ORCHESTRATOR_DEFAULT_BRANCH?: string;
}

/**
 * Settings Service Error
 */
export class ClaudeSettingsError extends Error {
  constructor(
    message: string,
    public code?: string,
    public originalError?: unknown
  ) {
    super(message);
    this.name = 'ClaudeSettingsError';
  }
}

/**
 * Claude Code Settings Service
 */
export class ClaudeSettingsService {
  private settingsPath: string;
  private envPath: string;

  constructor(projectRoot: string) {
    this.settingsPath = join(projectRoot, '.claude/settings.json');
    this.envPath = join(projectRoot, 'apps/server/.env');
  }

  /**
   * Read Claude Code settings
   */
  readSettings(): ClaudeSettings {
    try {
      if (!existsSync(this.settingsPath)) {
        return {};
      }

      const content = readFileSync(this.settingsPath, 'utf-8');
      return JSON.parse(content) as ClaudeSettings;
    } catch (error) {
      throw new ClaudeSettingsError(
        `Failed to read settings: ${(error as Error).message}`,
        'READ_ERROR',
        error
      );
    }
  }

  /**
   * Write Claude Code settings
   */
  writeSettings(settings: ClaudeSettings): void {
    try {
      const content = JSON.stringify(settings, null, 2);
      writeFileSync(this.settingsPath, content, 'utf-8');
    } catch (error) {
      throw new ClaudeSettingsError(
        `Failed to write settings: ${(error as Error).message}`,
        'WRITE_ERROR',
        error
      );
    }
  }

  /**
   * Update specific settings (merge with existing)
   */
  updateSettings(updates: Partial<ClaudeSettings>): ClaudeSettings {
    const current = this.readSettings();
    const merged = this.deepMerge(current, updates);
    this.writeSettings(merged);
    return merged;
  }

  /**
   * Add MCP tool permission
   */
  addMCPPermission(toolName: string): ClaudeSettings {
    const settings = this.readSettings();

    if (!settings.permissions) {
      settings.permissions = { allow: [], defaultMode: 'acceptEdits' };
    }
    if (!settings.permissions.allow) {
      settings.permissions.allow = [];
    }

    // Support wildcards for tool categories
    const permission = toolName.includes('*') ? toolName : `mcp__${toolName}`;

    if (!settings.permissions.allow.includes(permission)) {
      settings.permissions.allow.push(permission);
      this.writeSettings(settings);
    }

    return settings;
  }

  /**
   * Remove MCP tool permission
   */
  removeMCPPermission(toolName: string): ClaudeSettings {
    const settings = this.readSettings();

    if (settings.permissions?.allow) {
      settings.permissions.allow = settings.permissions.allow.filter(
        (p) => p !== toolName && p !== `mcp__${toolName}`
      );
      this.writeSettings(settings);
    }

    return settings;
  }

  /**
   * Enable a plugin
   */
  enablePlugin(pluginId: string): ClaudeSettings {
    const settings = this.readSettings();

    if (!settings.enabledPlugins) {
      settings.enabledPlugins = {};
    }

    settings.enabledPlugins[pluginId] = true;
    this.writeSettings(settings);

    return settings;
  }

  /**
   * Disable a plugin
   */
  disablePlugin(pluginId: string): ClaudeSettings {
    const settings = this.readSettings();

    if (!settings.enabledPlugins) {
      settings.enabledPlugins = {};
    }

    settings.enabledPlugins[pluginId] = false;
    this.writeSettings(settings);

    return settings;
  }

  /**
   * Read orchestrator environment variables
   */
  readEnvVars(): OrchestratorEnvVars {
    const vars: OrchestratorEnvVars = {};

    try {
      if (existsSync(this.envPath)) {
        const content = readFileSync(this.envPath, 'utf-8');
        const lines = content.split('\n');

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
            const [key, ...valueParts] = trimmed.split('=');
            const value = valueParts.join('=');
            if (
              key.startsWith('ORCHESTRATOR_') ||
              key === 'GREPTILE_API_KEY' ||
              key === 'GREPTILE_API_URL' ||
              key === 'EXA_API_KEY'
            ) {
              (vars as Record<string, string>)[key] = value;
            }
          }
        }
      }
    } catch (error) {
      console.warn('[ClaudeSettingsService] Failed to read env vars:', error);
    }

    return vars;
  }

  /**
   * Update orchestrator environment variable
   * Note: This updates the .env file, but process.env needs reload
   */
  updateEnvVar(key: string, value: string): void {
    try {
      let content = '';

      if (existsSync(this.envPath)) {
        content = readFileSync(this.envPath, 'utf-8');
      }

      const lines = content.split('\n');
      let found = false;

      // Update existing line
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim().startsWith(`${key}=`)) {
          lines[i] = `${key}=${value}`;
          found = true;
          break;
        }
      }

      // Add new line if not found
      if (!found) {
        lines.push(`${key}=${value}`);
      }

      writeFileSync(this.envPath, lines.join('\n'), 'utf-8');
    } catch (error) {
      throw new ClaudeSettingsError(
        `Failed to update env var: ${(error as Error).message}`,
        'ENV_UPDATE_ERROR',
        error
      );
    }
  }

  /**
   * Deep merge two objects
   */
  private deepMerge<T>(target: T, source: Partial<T>): T {
    const result = { ...target };

    for (const key in source) {
      const sourceValue = (source as Record<string, unknown>)[key];
      const targetValue = (result as Record<string, unknown>)[key];

      if (sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue)) {
        (result as Record<string, unknown>)[key] = this.deepMerge(
          targetValue as Record<string, unknown>,
          sourceValue as Record<string, unknown>
        );
      } else {
        (result as Record<string, unknown>)[key] = sourceValue;
      }
    }

    return result;
  }

  /**
   * Validate settings
   */
  validateSettings(settings: ClaudeSettings): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (settings.permissions) {
      if (settings.permissions.allow && !Array.isArray(settings.permissions.allow)) {
        errors.push('permissions.allow must be an array');
      }
      if (settings.permissions.deny && !Array.isArray(settings.permissions.deny)) {
        errors.push('permissions.deny must be an array');
      }
      if (
        settings.permissions.defaultMode &&
        !['acceptEdits', 'manual'].includes(settings.permissions.defaultMode)
      ) {
        errors.push('permissions.defaultMode must be "acceptEdits" or "manual"');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get current settings summary
   */
  getSettingsSummary(): {
    permissions: {
      allowCount: number;
      denyCount: number;
      defaultMode: string;
    };
    plugins: {
      enabled: string[];
      disabled: string[];
    };
    sandbox: {
      enabled: boolean;
    };
    envVars: {
      greptileConfigured: boolean;
      exaConfigured: boolean;
      projectName: string;
      githubRepo: string;
    };
  } {
    const settings = this.readSettings();
    const envVars = this.readEnvVars();

    const enabledPlugins: string[] = [];
    const disabledPlugins: string[] = [];

    if (settings.enabledPlugins) {
      for (const [pluginId, enabled] of Object.entries(settings.enabledPlugins)) {
        if (enabled) {
          enabledPlugins.push(pluginId);
        } else {
          disabledPlugins.push(pluginId);
        }
      }
    }

    return {
      permissions: {
        allowCount: settings.permissions?.allow?.length || 0,
        denyCount: settings.permissions?.deny?.length || 0,
        defaultMode: settings.permissions?.defaultMode || 'acceptEdits',
      },
      plugins: {
        enabled: enabledPlugins,
        disabled: disabledPlugins,
      },
      sandbox: {
        enabled: settings.sandbox?.enabled || false,
      },
      envVars: {
        greptileConfigured: !!envVars.GREPTILE_API_KEY,
        exaConfigured: !!envVars.EXA_API_KEY,
        projectName: envVars.ORCHESTRATOR_PROJECT_NAME || 'DevFlow',
        githubRepo: envVars.ORCHESTRATOR_GITHUB_REPO || 'oxtsotsi/DevFlow',
      },
    };
  }
}

/**
 * Global settings service instance
 */
let globalService: ClaudeSettingsService | null = null;

/**
 * Get the global Claude settings service instance
 */
export function getClaudeSettingsService(projectRoot?: string): ClaudeSettingsService {
  if (!globalService) {
    if (!projectRoot) {
      projectRoot = process.cwd();
    }
    globalService = new ClaudeSettingsService(projectRoot);
  }
  return globalService;
}

/**
 * Reset the global settings service instance
 */
export function resetClaudeSettingsService(): void {
  globalService = null;
}
