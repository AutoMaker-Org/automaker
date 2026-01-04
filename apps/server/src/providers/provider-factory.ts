/**
 * Provider Factory - Routes model IDs to the appropriate provider
 *
 * Uses a registry pattern for dynamic provider registration.
 * Providers register themselves on import, making it easy to add new providers.
 */

import { BaseProvider } from './base-provider.js';
import type { InstallationStatus, ModelDefinition } from './types.js';
import { isCursorModel, type ModelProvider } from '@automaker/types';

/**
 * Provider registration entry
 */
interface ProviderRegistration {
  /** Factory function to create provider instance */
  factory: () => BaseProvider;
  /** Aliases for this provider (e.g., 'anthropic' for 'claude') */
  aliases?: string[];
  /** Function to check if this provider can handle a model ID */
  canHandleModel?: (modelId: string) => boolean;
  /** Priority for model matching (higher = checked first) */
  priority?: number;
}

/**
 * Provider registry - stores registered providers
 */
const providerRegistry = new Map<string, ProviderRegistration>();

/**
 * Register a provider with the factory
 *
 * @param name Provider name (e.g., 'claude', 'cursor')
 * @param registration Provider registration config
 */
export function registerProvider(name: string, registration: ProviderRegistration): void {
  providerRegistry.set(name.toLowerCase(), registration);
}

export class ProviderFactory {
  /**
   * Determine which provider to use for a given model
   *
   * @param model Model identifier
   * @returns Provider name (ModelProvider type)
   */
  static getProviderNameForModel(model: string): ModelProvider {
    const lowerModel = model.toLowerCase();

    // Get all registered providers sorted by priority (descending)
    const registrations = Array.from(providerRegistry.entries()).sort(
      ([, a], [, b]) => (b.priority ?? 0) - (a.priority ?? 0)
    );

    // Check each provider's canHandleModel function
    for (const [name, reg] of registrations) {
      if (reg.canHandleModel?.(lowerModel)) {
        return name as ModelProvider;
      }
    }

    // Fallback: Check for explicit prefixes
    for (const [name] of registrations) {
      if (lowerModel.startsWith(`${name}-`)) {
        return name as ModelProvider;
      }
    }

    // Default to claude (first registered provider or claude)
    return 'claude';
  }

  /**
   * Get the appropriate provider for a given model ID
   *
   * @param modelId Model identifier (e.g., "claude-opus-4-5-20251101", "cursor-gpt-4o", "cursor-auto")
   * @returns Provider instance for the model
   */
  static getProviderForModel(modelId: string): BaseProvider {
    const providerName = this.getProviderNameForModel(modelId);
    const provider = this.getProviderByName(providerName);

    if (!provider) {
      // Fallback to claude if provider not found
      const claudeReg = providerRegistry.get('claude');
      if (claudeReg) {
        return claudeReg.factory();
      }
      throw new Error(`No provider found for model: ${modelId}`);
    }

    return provider;
  }

  /**
   * Get all available providers
   */
  static getAllProviders(): BaseProvider[] {
    return Array.from(providerRegistry.values()).map((reg) => reg.factory());
  }

  /**
   * Check installation status for all providers
   *
   * @returns Map of provider name to installation status
   */
  static async checkAllProviders(): Promise<Record<string, InstallationStatus>> {
    const statuses: Record<string, InstallationStatus> = {};

    for (const [name, reg] of providerRegistry.entries()) {
      const provider = reg.factory();
      const status = await provider.detectInstallation();
      statuses[name] = status;
    }

    return statuses;
  }

  /**
   * Get provider by name (for direct access if needed)
   *
   * @param name Provider name (e.g., "claude", "cursor") or alias (e.g., "anthropic")
   * @returns Provider instance or null if not found
   */
  static getProviderByName(name: string): BaseProvider | null {
    const lowerName = name.toLowerCase();

    // Direct lookup
    const directReg = providerRegistry.get(lowerName);
    if (directReg) {
      return directReg.factory();
    }

    // Check aliases
    for (const [, reg] of providerRegistry.entries()) {
      if (reg.aliases?.includes(lowerName)) {
        return reg.factory();
      }
    }

    return null;
  }

  /**
   * Get all available models from all providers
   */
  static getAllAvailableModels(): ModelDefinition[] {
    const providers = this.getAllProviders();
    return providers.flatMap((p) => p.getAvailableModels());
  }

  /**
   * Get list of registered provider names
   */
  static getRegisteredProviderNames(): string[] {
    return Array.from(providerRegistry.keys());
  }
}

// =============================================================================
// Provider Registrations
// =============================================================================

// Import providers for registration side-effects
import { ClaudeProvider } from './claude-provider.js';
import { CursorProvider } from './cursor-provider.js';

// Register Claude provider
registerProvider('claude', {
  factory: () => new ClaudeProvider(),
  aliases: ['anthropic'],
  canHandleModel: (model: string) => {
    return (
      model.startsWith('claude-') || ['opus', 'sonnet', 'haiku'].some((n) => model.includes(n))
    );
  },
  priority: 0, // Default priority
});

// Register Cursor provider
registerProvider('cursor', {
  factory: () => new CursorProvider(),
  canHandleModel: (model: string) => isCursorModel(model),
  priority: 10, // Higher priority - check Cursor models first
});
