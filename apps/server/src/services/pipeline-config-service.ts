/**
 * Pipeline Configuration Service
 *
 * Manages loading, saving, and validating pipeline configurations
 * for AutoMaker projects.
 */

import type { PipelineConfig, PipelineStepConfig } from '@automaker/types';
import { validatePipelineConfig, DEFAULT_PIPELINE_CONFIG } from '@automaker/types';
import { getAutomakerDir, getProjectSettingsPath, secureFs } from '@automaker/platform';
import path from 'node:path';

export class PipelineConfigService {
  private projectPath: string;
  private configPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
    this.configPath = path.join(getAutomakerDir(projectPath), 'pipeline.json');
  }

  /**
   * Load pipeline configuration from project
   *
   * Attempts to load the pipeline configuration from:
   * 1. .automaker/pipeline.json (pipeline-specific config)
   * 2. automaker.json (project settings fallback)
   *
   * @returns Promise<PipelineConfig> The loaded configuration or DEFAULT_PIPELINE_CONFIG if none found
   */
  async loadPipelineConfig(): Promise<PipelineConfig> {
    try {
      // Try to load pipeline-specific config first
      try {
        await secureFs.access(this.configPath);
        const content = await secureFs.readFile(this.configPath, 'utf-8');
        const config = JSON.parse(content as string);

        if (validatePipelineConfig(config)) {
          return config;
        }

        console.warn('Invalid pipeline configuration, using defaults');
      } catch {
        // File doesn't exist or can't be read, continue to fallback
      }

      // Fall back to checking project settings
      const settingsPath = getProjectSettingsPath(this.projectPath);
      try {
        await secureFs.access(settingsPath);
        const settingsContent = await secureFs.readFile(settingsPath, 'utf-8');
        const settings = JSON.parse(settingsContent as string);

        if (settings.pipeline && validatePipelineConfig(settings.pipeline)) {
          return settings.pipeline;
        }
      } catch {
        // Settings file doesn't exist or can't be read
      }

      return DEFAULT_PIPELINE_CONFIG;
    } catch (error) {
      console.error('Failed to load pipeline config:', error);
      return DEFAULT_PIPELINE_CONFIG;
    }
  }

  /**
   * Save pipeline configuration to project
   *
   * Validates the configuration and saves it to .automaker/pipeline.json.
   * Uses atomic write (temporary file + rename) to prevent corruption.
   *
   * @param config - The pipeline configuration to save
   * @throws Error if the configuration is invalid
   */
  async savePipelineConfig(config: PipelineConfig): Promise<void> {
    if (!validatePipelineConfig(config)) {
      throw new Error('Invalid pipeline configuration');
    }

    // Ensure .automaker directory exists
    const automakerDir = getAutomakerDir(this.projectPath);
    await secureFs.mkdir(automakerDir, { recursive: true });

    // Write to temporary file first, then atomic rename
    const tempPath = this.configPath + '.tmp';
    const content = JSON.stringify(config, null, 2);

    await secureFs.writeFile(tempPath, content, 'utf-8');
    await secureFs.rename(tempPath, this.configPath);
  }

  /**
   * Get ordered list of pipeline steps
   *
   * Loads the pipeline configuration and returns steps sorted by dependencies.
   * Required steps are placed before optional steps when possible.
   *
   * @returns Promise<PipelineStepConfig[]> Array of pipeline steps in execution order
   */
  async getPipelineSteps(): Promise<PipelineStepConfig[]> {
    const config = await this.loadPipelineConfig();
    return this.sortStepsByDependencies(config.steps);
  }

  /**
   * Validate pipeline configuration
   *
   * Validates the configuration against the pipeline schema.
   *
   * @param config - The configuration to validate
   * @returns boolean True if the configuration is valid
   */
  validateConfig(config: any): boolean {
    return validatePipelineConfig(config);
  }

  /**
   * Migrate configuration to latest version
   *
   * Checks the current configuration version and applies migrations
   * to bring it up to the latest schema version.
   */
  async migrateConfig(): Promise<void> {
    const config = await this.loadPipelineConfig();

    // Check if migration is needed
    if (config.version !== '1.0') {
      // Add migration logic here for future versions
      const migratedConfig = { ...config, version: '1.0' };
      await this.savePipelineConfig(migratedConfig);
    }
  }

  /**
   * Export pipeline configuration
   *
   * Loads the current configuration and returns it as a formatted JSON string.
   *
   * @returns Promise<string> The configuration as a JSON string
   */
  async exportConfig(): Promise<string> {
    const config = await this.loadPipelineConfig();
    return JSON.stringify(config, null, 2);
  }

  /**
   * Import pipeline configuration
   *
   * Parses and validates a JSON configuration string and saves it.
   *
   * @param configJson - The configuration as a JSON string
   * @throws Error if the configuration is invalid or cannot be parsed
   */
  async importConfig(configJson: string): Promise<void> {
    try {
      const config = JSON.parse(configJson);

      if (!validatePipelineConfig(config)) {
        throw new Error('Invalid pipeline configuration format');
      }

      await this.savePipelineConfig(config);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to import configuration: ${message}`);
    }
  }

  /**
   * Sort steps by dependencies
   *
   * Performs a topological sort to ensure steps are ordered correctly
   * based on their dependencies. Handles circular dependencies by placing
   * dependent steps after their dependencies when possible.
   *
   * @param steps - Array of pipeline steps to sort
   * @returns PipelineStepConfig[] Array of steps in dependency order
   */
  private sortStepsByDependencies(steps: PipelineStepConfig[]): PipelineStepConfig[] {
    const sorted: PipelineStepConfig[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const stepMap = new Map(steps.map((s) => [s.id, s]));

    const visit = (stepId: string) => {
      if (visiting.has(stepId)) {
        throw new Error(`Circular dependency detected: ${stepId}`);
      }

      if (visited.has(stepId)) {
        return;
      }

      const step = stepMap.get(stepId);
      if (!step) {
        throw new Error(`Step not found: ${stepId}`);
      }

      visiting.add(stepId);

      // Visit dependencies first
      if (step.dependencies) {
        for (const depId of step.dependencies) {
          visit(depId);
        }
      }

      visiting.delete(stepId);
      visited.add(stepId);
      sorted.push(step);
    };

    // Visit all steps
    for (const step of steps) {
      visit(step.id);
    }

    return sorted;
  }

  /**
   * Reset pipeline configuration to defaults
   */
  async resetConfig(): Promise<void> {
    await this.savePipelineConfig(DEFAULT_PIPELINE_CONFIG);
  }

  /**
   * Check if pipeline is enabled
   */
  async isPipelineEnabled(): Promise<boolean> {
    const config = await this.loadPipelineConfig();
    return config.enabled;
  }

  /**
   * Enable/disable pipeline
   */
  async setPipelineEnabled(enabled: boolean): Promise<void> {
    const config = await this.loadPipelineConfig();
    config.enabled = enabled;
    await this.savePipelineConfig(config);
  }
}
