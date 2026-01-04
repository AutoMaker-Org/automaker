/**
 * Provider Factory - Routes model IDs to the appropriate provider
 *
 * This factory implements model-based routing to automatically select
 * the correct provider based on the model string. This makes adding
 * new providers (Cursor, OpenCode, etc.) trivial - just add one line.
 */

import { BaseProvider } from './base-provider.js';
import { ClaudeProvider } from './claude-provider.js';
import { CursorProvider } from './cursor-provider.js';
import { OpenCodeProvider } from './opencode-provider.js';
import { CodexProvider } from './codex-provider.js';
import type { InstallationStatus } from './types.js';
import { CURSOR_MODEL_MAP, OPENCODE_MODEL_MAP, CODEX_MODEL_MAP } from '@automaker/types';

// Default provider setting - can be 'claude', 'cursor', 'opencode', or 'codex'
let defaultProvider: 'claude' | 'cursor' | 'opencode' | 'codex' = 'claude';

const CURSOR_MODEL_IDS = new Set(
  Object.values(CURSOR_MODEL_MAP).map((model) => model.toLowerCase())
);
const OPENCODE_MODEL_IDS = new Set(
  Object.values(OPENCODE_MODEL_MAP).map((model) => model.toLowerCase())
);
const CODEX_MODEL_IDS = new Set(Object.values(CODEX_MODEL_MAP).map((model) => model.toLowerCase()));

export class ProviderFactory {
  /**
   * Set the default provider to use when model doesn't specify one
   */
  static setDefaultProvider(provider: 'claude' | 'cursor' | 'opencode' | 'codex'): void {
    defaultProvider = provider;
    console.log(`[ProviderFactory] Default provider set to: ${provider}`);
  }

  /**
   * Get the current default provider
   */
  static getDefaultProvider(): 'claude' | 'cursor' | 'opencode' | 'codex' {
    return defaultProvider;
  }

  /**
   * Get the appropriate provider for a given model ID
   *
   * @param modelId Model identifier (e.g., "claude-opus-4-5-20251101", "gpt-5", "auto")
   * @returns Provider instance for the model
   */
  static getProviderForModel(modelId: string): BaseProvider {
    const lowerModel = modelId.toLowerCase();

    // Cursor models (cursor-*, auto)
    if (
      CURSOR_MODEL_IDS.has(lowerModel) ||
      lowerModel.startsWith('cursor-') ||
      lowerModel === 'auto'
    ) {
      return new CursorProvider();
    }

    // OpenCode models (glm-*, glm/*, opencode/*)
    if (
      OPENCODE_MODEL_IDS.has(lowerModel) ||
      lowerModel.startsWith('glm') ||
      lowerModel.startsWith('opencode/') ||
      lowerModel === 'opencode'
    ) {
      return new OpenCodeProvider();
    }

    // Claude models (claude-*, opus, sonnet, haiku)
    if (lowerModel.startsWith('claude-') || ['haiku', 'sonnet', 'opus'].includes(lowerModel)) {
      return new ClaudeProvider();
    }

    // Codex models (gpt-*, o1/o3, codex)
    if (
      CODEX_MODEL_IDS.has(lowerModel) ||
      lowerModel.startsWith('gpt-') ||
      /^o\d/.test(lowerModel) ||
      lowerModel === 'codex'
    ) {
      return new CodexProvider();
    }

    // Use default provider for unknown models
    console.log(`[ProviderFactory] Using default provider (${defaultProvider}) for "${modelId}"`);
    switch (defaultProvider) {
      case 'cursor':
        return new CursorProvider();
      case 'opencode':
        return new OpenCodeProvider();
      case 'codex':
        return new CodexProvider();
      case 'claude':
      default:
        return new ClaudeProvider();
    }
  }

  /**
   * Get all available providers
   */
  static getAllProviders(): BaseProvider[] {
    return [
      new ClaudeProvider(),
      new CursorProvider(),
      new OpenCodeProvider(),
      new CodexProvider(),
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

      case 'cursor':
        return new CursorProvider();
      case 'opencode':
      case 'open-code':
        return new OpenCodeProvider();
      case 'codex':
      case 'openai':
        return new CodexProvider();

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
