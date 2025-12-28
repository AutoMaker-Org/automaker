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
 * - thinking: Unified thinking/reasoning capability (Claude extended thinking, Zai GLM thinking mode)
 */
export type ProviderFeature =
  | 'tools'
  | 'text'
  | 'vision'
  | 'mcp'
  | 'browser'
  | 'thinking' // Unified thinking capability for both Claude and Zai
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
   * Check if provider supports a specific feature
   * @param feature Feature name (e.g., "vision", "tools", "mcp", "structuredOutput")
   * @returns Whether of feature is supported
   */
  supportsFeature(feature: ProviderFeature | string): boolean {
    // Normalize legacy feature names for backward compatibility
    const normalizedFeature = BaseProvider.normalizeFeatureName(feature);

    // Default implementation - override in subclasses
    const commonFeatures: ProviderFeature[] = ['tools', 'text'];
    return commonFeatures.includes(normalizedFeature);
  }

  /**
   * Normalize legacy feature names to current canonical names
   * Provides backward compatibility for code using 'extendedThinking'
   */
  public static normalizeFeatureName(feature: ProviderFeature | string): ProviderFeature {
    if (feature === 'extendedThinking') return 'thinking';
    return feature as ProviderFeature;
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

  /**
   * Normalize legacy provider names to current canonical names
   * Provides backward compatibility for code using 'anthropic' provider name
   */
  public static normalizeProviderName(provider: string): string {
    if (provider === 'anthropic') return 'claude';
    return provider;
  }
}
