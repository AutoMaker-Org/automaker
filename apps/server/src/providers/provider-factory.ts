/**
 * Provider Factory - Routes model IDs to the appropriate provider
 *
 * Uses a registry pattern for dynamic provider registration.
 * Providers register themselves on import, making it easy to add new providers.
 */

import { BaseProvider } from './base-provider.js';
import type { InstallationStatus, ModelDefinition } from './types.js';
import { isCursorModel, isCodexModel, isOpencodeModel, type ModelProvider } from '@automaker/types';
import * as fs from 'fs';
import * as path from 'path';

const DISCONNECTED_MARKERS: Record<string, string> = {
  claude: '.claude-disconnected',
  codex: '.codex-disconnected',
  cursor: '.cursor-disconnected',
  opencode: '.opencode-disconnected',
};

/**
 * Check if a provider CLI is disconnected from the app
 */
export function isProviderDisconnected(providerName: string): boolean {
  const markerFile = DISCONNECTED_MARKERS[providerName.toLowerCase()];
  if (!markerFile) return false;

  const markerPath = path.join(process.cwd(), '.automaker', markerFile);
  return fs.existsSync(markerPath);
}

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
   * @param modelId Model identifier (e.g., "claude-opus-4-6", "cursor-gpt-4o", "cursor-auto")
   * @param options Optional settings
   * @param options.throwOnDisconnected Throw error if provider is disconnected (default: true)
   * @returns Provider instance for the model
   * @throws Error if provider is disconnected and throwOnDisconnected is true
   */
  static getProviderForModel(
    modelId: string,
    options: { throwOnDisconnected?: boolean } = {}
  ): BaseProvider {
    const { throwOnDisconnected = true } = options;
    const providerName = this.getProviderForModelName(modelId);

    // Check if provider is disconnected
    if (throwOnDisconnected && isProviderDisconnected(providerName)) {
      throw new Error(
        `${providerName.charAt(0).toUpperCase() + providerName.slice(1)} CLI is disconnected from the app. ` +
          `Please go to Settings > Providers and click "Sign In" to reconnect.`
      );
    }

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
   * Get the provider name for a given model ID (without creating provider instance)
   */
  static getProviderForModelName(modelId: string): string {
    const lowerModel = modelId.toLowerCase();

    // Get all registered providers sorted by priority (descending)
    const registrations = Array.from(providerRegistry.entries()).sort(
      ([, a], [, b]) => (b.priority ?? 0) - (a.priority ?? 0)
    );

    // Check each provider's canHandleModel function
    for (const [name, reg] of registrations) {
      if (reg.canHandleModel?.(lowerModel)) {
        return name;
      }
    }

    // Fallback: Check for explicit prefixes
    for (const [name] of registrations) {
      if (lowerModel.startsWith(`${name}-`)) {
        return name;
      }
    }

    // Default to claude (first registered provider or claude)
    return 'claude';
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

  /**
   * Check if a specific model supports vision/image input
   *
   * @param modelId Model identifier
   * @returns Whether the model supports vision (defaults to true if model not found)
   */
  static modelSupportsVision(modelId: string): boolean {
    const provider = this.getProviderForModel(modelId);
    const models = provider.getAvailableModels();

    // Find the model in the available models list
    for (const model of models) {
      if (
        model.id === modelId ||
        model.modelString === modelId ||
        model.id.endsWith(`-${modelId}`) ||
        model.modelString.endsWith(`-${modelId}`) ||
        model.modelString === modelId.replace(/^(claude|cursor|codex)-/, '') ||
        model.modelString === modelId.replace(/-(claude|cursor|codex)$/, '')
      ) {
        return model.supportsVision ?? true;
      }
    }

    // Also try exact match with model string from provider's model map
    for (const model of models) {
      if (model.modelString === modelId || model.id === modelId) {
        return model.supportsVision ?? true;
      }
    }

    // Default to true (Claude SDK supports vision by default)
    return true;
  }
}

// =============================================================================
// Provider Registrations
// =============================================================================

// Import providers for registration side-effects
import { ClaudeProvider } from './claude-provider.js';
import { CursorProvider } from './cursor-provider.js';
import { CodexProvider } from './codex-provider.js';
import { OpencodeProvider } from './opencode-provider.js';

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

// Register Codex provider
registerProvider('codex', {
  factory: () => new CodexProvider(),
  aliases: ['openai'],
  canHandleModel: (model: string) => isCodexModel(model),
  priority: 5, // Medium priority - check after Cursor but before Claude
});

// Register OpenCode provider
registerProvider('opencode', {
  factory: () => new OpencodeProvider(),
  canHandleModel: (model: string) => isOpencodeModel(model),
  priority: 3, // Between codex (5) and claude (0)
});
