/**
 * Abstract base class for AI model providers
 */

import type {
  ProviderConfig,
  ExecuteOptions,
  ProviderMessage,
  InstallationStatus,
  ValidationResult,
  ModelDefinition,
} from './types.js';

/**
 * Supported provider features
 * Used to check capability compatibility between providers
 *
 * Feature descriptions:
 * - extendedThinking: Claude's extended thinking mode (extended thinking with tokens)
 * - thinking: Zai's thinking mode (GLM thinking/reasoning content)
 * - Both features represent "thinking/reasoning" capability from different providers
 */
export type ProviderFeature =
  | 'tools'
  | 'text'
  | 'vision'
  | 'mcp'
  | 'browser'
  | 'extendedThinking' // Claude: extended thinking
  | 'thinking' // Zai: GLM thinking mode
  | 'structuredOutput';

/**
 * Base provider class that all provider implementations must extend
 */
export abstract class BaseProvider {
  protected config: ProviderConfig;
  protected name: string;

  constructor(config: ProviderConfig = {}) {
    this.config = config;
    this.name = this.getName();
  }

  /**
   * Get the provider name (e.g., "claude", "cursor")
   */
  abstract getName(): string;

  /**
   * Execute a query and stream responses
   * @param options Execution options
   * @returns AsyncGenerator yielding provider messages
   */
  abstract executeQuery(options: ExecuteOptions): AsyncGenerator<ProviderMessage>;

  /**
   * Detect if the provider is installed and configured
   * @returns Installation status
   */
  abstract detectInstallation(): Promise<InstallationStatus>;

  /**
   * Get available models for this provider
   * @returns Array of model definitions
   */
  abstract getAvailableModels(): ModelDefinition[];

  /**
   * Validate the provider configuration
   * @returns Validation result
   */
  validateConfig(): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Base validation (can be overridden)
    if (!this.config) {
      errors.push('Provider config is missing');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Check if the provider supports a specific feature
   * @param feature Feature name (e.g., "vision", "tools", "mcp", "structuredOutput")
   * @returns Whether the feature is supported
   */
  supportsFeature(feature: ProviderFeature | string): boolean {
    // Default implementation - override in subclasses
    const commonFeatures: ProviderFeature[] = ['tools', 'text', 'structuredOutput'];
    return commonFeatures.includes(feature as ProviderFeature);
  }

  /**
   * Get provider configuration
   */
  getConfig(): ProviderConfig {
    return this.config;
  }

  /**
   * Update provider configuration
   */
  setConfig(config: Partial<ProviderConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
