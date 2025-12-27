/**
 * Provider Factory - Routes model IDs to the appropriate provider
 *
 * This factory implements model-based routing to automatically select
 * the correct provider based on the model string. This makes adding
 * new providers (Cursor, OpenCode, etc.) trivial - just add one line.
 */

import { BaseProvider } from './base-provider.js';
import { ClaudeProvider } from './claude-provider.js';
import { ZaiProvider } from './zai-provider.js';
import type { InstallationStatus, ProviderConfig } from './types.js';

export class ProviderFactory {
  /**
   * Get the appropriate provider for a given model ID
   *
   * @param modelId Model identifier (e.g., "claude-opus-4-5-20251101", "gpt-5.2", "cursor-fast")
   * @param config Optional provider configuration (including API keys)
   * @returns Provider instance for the model
   */
  static getProviderForModel(modelId: string, config?: ProviderConfig): BaseProvider {
    const lowerModel = modelId.toLowerCase();

    // z.ai models (glm-4, glm-4.7, etc.)
    if (lowerModel.startsWith('glm-')) {
      const provider = new ZaiProvider(config);
      return provider;
    }

    // Claude models (claude-*, opus, sonnet, haiku)
    if (lowerModel.startsWith('claude-') || ['haiku', 'sonnet', 'opus'].includes(lowerModel)) {
      const provider = new ClaudeProvider(config);
      return provider;
    }

    // Future providers:
    // if (lowerModel.startsWith("cursor-")) {
    //   return new CursorProvider();
    // }
    // if (lowerModel.startsWith("opencode-")) {
    //   return new OpenCodeProvider();
    // }

    // Default to Claude for unknown models
    console.warn(`[ProviderFactory] Unknown model prefix for "${modelId}", defaulting to Claude`);
    const provider = new ClaudeProvider(config);
    return provider;
  }

  /**
   * Get all available providers
   */
  static getAllProviders(): BaseProvider[] {
    return [
      new ClaudeProvider(),
      new ZaiProvider(),
      // Future providers...
    ];
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
   * @param name Provider name (e.g., "claude", "cursor")
   * @returns Provider instance or null if not found
   */
  static getProviderByName(name: string): BaseProvider | null {
    const lowerName = name.toLowerCase();

    switch (lowerName) {
      case 'claude':
      case 'anthropic':
        return new ClaudeProvider();

      case 'zai':
      case 'glm':
        return new ZaiProvider();

      // Future providers:
      // case "cursor":
      //   return new CursorProvider();
      // case "opencode":
      //   return new OpenCodeProvider();

      default:
        return null;
    }
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
