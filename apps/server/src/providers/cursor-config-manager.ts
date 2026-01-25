/**
 * Cursor CLI Configuration Manager
 *
 * Manages Cursor CLI configuration stored in .automaker/cursor-config.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { getAllCursorModelIds, type CursorCliConfig, type CursorModelId } from '@automaker/types';
import { createLogger } from '@automaker/utils';
import { getAutomakerDir } from '@automaker/platform';

// Create logger for this module
const logger = createLogger('CursorConfigManager');

/**
 * Manages Cursor CLI configuration
 * Config location: .automaker/cursor-config.json
 */
export class CursorConfigManager {
  private configPath: string;
  private config: CursorCliConfig;

  constructor(projectPath: string) {
    // Use getAutomakerDir for consistent path resolution
    this.configPath = path.join(getAutomakerDir(projectPath), 'cursor-config.json');
    this.config = this.loadConfig();
  }

  /**
   * Load configuration from disk
   */
  private loadConfig(): CursorCliConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const content = fs.readFileSync(this.configPath, 'utf8');
        const parsed = JSON.parse(content) as CursorCliConfig;
        logger.debug(`Loaded config from ${this.configPath}`);
        return parsed;
      }
    } catch (error) {
      logger.warn('Failed to load config:', error);
    }

    // Return default config with all available models
    return {
      defaultModel: 'cursor-auto',
      models: getAllCursorModelIds(),
    };
  }

  /**
   * Save configuration to disk
   */
  private saveConfig(): void {
    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
      logger.debug('Config saved');
    } catch (error) {
      logger.error('Failed to save config:', error);
      throw error;
    }
  }

  /**
   * Get the full configuration
   */
  getConfig(): CursorCliConfig {
    return { ...this.config };
  }

  /**
   * Get the default model
   */
  getDefaultModel(): CursorModelId {
    return this.config.defaultModel || 'cursor-auto';
  }

  /**
   * Set the default model
   */
  setDefaultModel(model: CursorModelId): void {
    this.config.defaultModel = model;
    this.saveConfig();
    logger.info(`Default model set to: ${model}`);
  }

  /**
   * Get enabled models
   */
  getEnabledModels(): CursorModelId[] {
    return this.config.models || ['cursor-auto'];
  }

  /**
   * Set enabled models
   */
  setEnabledModels(models: CursorModelId[]): void {
    this.config.models = models;
    this.saveConfig();
    logger.info(`Enabled models updated: ${models.join(', ')}`);
  }

  /**
   * Add a model to enabled list
   */
  addModel(model: CursorModelId): void {
    if (!this.config.models) {
      this.config.models = [];
    }
    if (!this.config.models.includes(model)) {
      this.config.models.push(model);
      this.saveConfig();
      logger.info(`Model added: ${model}`);
    }
  }

  /**
   * Remove a model from enabled list
   */
  removeModel(model: CursorModelId): void {
    if (this.config.models) {
      this.config.models = this.config.models.filter((m) => m !== model);
      this.saveConfig();
      logger.info(`Model removed: ${model}`);
    }
  }

  /**
   * Check if a model is enabled
   */
  isModelEnabled(model: CursorModelId): boolean {
    return this.config.models?.includes(model) ?? false;
  }

  /**
   * Get MCP server configurations
   */
  getMcpServers(): string[] {
    return this.config.mcpServers || [];
  }

  /**
   * Set MCP server configurations
   */
  setMcpServers(servers: string[]): void {
    this.config.mcpServers = servers;
    this.saveConfig();
    logger.info(`MCP servers updated: ${servers.join(', ')}`);
  }

  /**
   * Get Cursor rules paths
   */
  getRules(): string[] {
    return this.config.rules || [];
  }

  /**
   * Set Cursor rules paths
   */
  setRules(rules: string[]): void {
    this.config.rules = rules;
    this.saveConfig();
    logger.info(`Rules updated: ${rules.join(', ')}`);
  }

  /**
   * Reset configuration to defaults
   */
  reset(): void {
    this.config = {
      defaultModel: 'cursor-auto',
      models: getAllCursorModelIds(),
    };
    this.saveConfig();
    logger.info('Config reset to defaults');
  }

  /**
   * Check if config file exists
   */
  exists(): boolean {
    return fs.existsSync(this.configPath);
  }

  /**
   * Get the config file path
   */
  getConfigPath(): string {
    return this.configPath;
  }
}
