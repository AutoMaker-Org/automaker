/**
 * Provider Factory - Routes model IDs to the appropriate provider
 *
 * This factory implements model-based routing using a registry pattern.
 * New providers can be registered dynamically, making the system extensible.
 *
 * To add a new provider:
 * 1. Import the provider class
 * 2. Call ProviderFactory.registerProvider() with the registration config
 */

import { BaseProvider } from './base-provider.js';
import { ClaudeProvider } from './claude-provider.js';
import { ZaiProvider } from './zai-provider.js';
import type { InstallationStatus, ProviderConfig } from './types.js';

/**
 * Provider registration configuration
 */
export interface ProviderRegistration {
  /** Provider class to instantiate */
  providerClass: new (config?: ProviderConfig) => BaseProvider;
  /** Model prefixes that route to this provider (e.g., ['claude-', 'glm-']) */
  modelPrefixes: string[];
  /** Model aliases that route to this provider (e.g., ['opus', 'sonnet']) */
  aliases: string[];
  /** Provider name aliases (e.g., 'anthropic' for Claude) */
  providerAliases?: string[];
}

export class ProviderFactory {
  /**
   * Registry of all registered providers
   */
  private static registry = new Map<string, ProviderRegistration>();

  /**
   * Register a provider with the factory
   *
   * @param name Unique provider name (e.g., 'claude', 'zai')
   * @param registration Provider registration configuration
   */
  static registerProvider(name: string, registration: ProviderRegistration): void {
    this.registry.set(name.toLowerCase(), registration);
  }

  /**
   * Unregister a provider
   *
   * @param name Provider name to unregister
   */
  static unregisterProvider(name: string): void {
    this.registry.delete(name.toLowerCase());
  }

  /**
   * Get the appropriate provider for a given model ID
   *
   * @param modelId Model identifier (e.g., "claude-opus-4-5-20251101", "glm-4.7")
   * @param config Optional provider configuration (including API keys)
   * @returns Provider instance for the model
   */
  static getProviderForModel(modelId: string, config?: ProviderConfig): BaseProvider {
    const lowerModel = modelId.toLowerCase();

    // Check model prefixes first
    for (const [name, registration] of this.registry) {
      if (
        registration.modelPrefixes.some((prefix) => lowerModel.startsWith(prefix)) ||
        registration.aliases.includes(lowerModel)
      ) {
        return new registration.providerClass(config);
      }
    }

    // Default to Claude for unknown models
    console.warn(
      `[ProviderFactory] Unknown model "${modelId}", defaulting to Claude (registered providers: ${Array.from(this.registry.keys()).join(', ')})`
    );
    return new ClaudeProvider(config);
  }

  /**
   * Get all available providers
   */
  static getAllProviders(): BaseProvider[] {
    return Array.from(this.registry.values()).map(({ providerClass }) => new providerClass());
  }

  /**
   * Check installation status for all providers
   *
   * @returns Map of provider name to installation status
   */
  static async checkAllProviders(): Promise<Record<string, InstallationStatus>> {
    const providers = this.getAllProviders();
    const statuses: Record<string, InstallationStatus> = {};

    for (const provider of providers) {
      const name = provider.getName();
      const status = await provider.detectInstallation();
      statuses[name] = status;
    }

    return statuses;
  }

  /**
   * Get provider by name (for direct access if needed)
   *
   * @param name Provider name (e.g., "claude", "zai")
   * @returns Provider instance or null if not found
   */
  static getProviderByName(name: string, config?: ProviderConfig): BaseProvider | null {
    const lowerName = name.toLowerCase();

    // Check registered providers
    for (const [providerName, registration] of this.registry) {
      if (providerName === lowerName || registration.providerAliases?.includes(lowerName)) {
        return new registration.providerClass(config);
      }
    }

    return null;
  }

  /**
   * Get all available models from all providers
   */
  static getAllAvailableModels() {
    const providers = this.getAllProviders();
    const allModels = [];

    for (const provider of providers) {
      const models = provider.getAvailableModels();
      allModels.push(...models);
    }

    return allModels;
  }
}

// Auto-register built-in providers on module load
ProviderFactory.registerProvider('claude', {
  providerClass: ClaudeProvider,
  modelPrefixes: ['claude-'],
  aliases: ['haiku', 'sonnet', 'opus'],
  providerAliases: ['anthropic'],
});

ProviderFactory.registerProvider('zai', {
  providerClass: ZaiProvider,
  modelPrefixes: ['glm-'],
  aliases: ['glm'],
  providerAliases: ['zhipuai', 'zhipu'],
});
