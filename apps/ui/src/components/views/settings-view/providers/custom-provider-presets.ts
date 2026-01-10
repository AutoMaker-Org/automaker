/**
 * Custom Endpoint Provider Presets
 *
 * Pre-configured settings for common Anthropic-compatible API providers.
 * These presets provide quick setup for popular providers while still
 * allowing manual configuration for any custom endpoint.
 */

import type { CustomEndpointConfig } from '../shared/types';

export interface CustomEndpointPreset {
  name: string;
  value: 'zhipu' | 'minimax' | 'manual';
  baseUrl: string;
  defaultModel: string;
  description: string;
  docs?: string;
}

export const CUSTOM_ENDPOINT_PRESETS: CustomEndpointPreset[] = [
  {
    name: 'Zhipu AI',
    value: 'zhipu',
    baseUrl: 'https://api.z.ai/api/anthropic',
    defaultModel: 'glm-4.7',
    description: 'GLM Models by Zhipu AI a chinese frontier lab',
    docs: 'https://docs.z.ai/devpack/overview',
  },
  {
    name: 'MiniMax',
    value: 'minimax',
    baseUrl: 'https://api.minimax.io/anthropic',
    defaultModel: 'minimax-m2.1',
    description: 'Minimax models fast and powerful',
    docs: 'https://platform.minimax.io/docs/coding-plan/intro',
  },
  {
    name: 'Custom Endpoint',
    value: 'manual',
    baseUrl: '',
    defaultModel: '',
    description: 'Configure any Anthropic-compatible API endpoint manually',
  },
];

/**
 * Get preset configuration by value
 */
export function getPreset(value: 'zhipu' | 'minimax' | 'manual'): CustomEndpointPreset | undefined {
  return CUSTOM_ENDPOINT_PRESETS.find((preset) => preset.value === value);
}

/**
 * Create a CustomEndpointConfig from a preset
 */
export function createConfigFromPreset(
  preset: CustomEndpointPreset,
  apiKey: string
): CustomEndpointConfig {
  return {
    provider: preset.value,
    baseUrl: preset.baseUrl,
    apiKey,
    model: preset.defaultModel,
  };
}

/**
 * Validate if a model ID looks valid for a provider
 */
export function isValidModelId(model: string, provider: 'zhipu' | 'minimax' | 'manual'): boolean {
  if (!model || model.trim().length === 0) {
    return false;
  }

  // Basic validation - model IDs should be alphanumeric with hyphens, dots, etc.
  const modelIdPattern = /^[a-zA-Z0-9._-]+$/;
  return modelIdPattern.test(model.trim());
}

/**
 * Get available model suggestions for a provider
 */
export function getModelSuggestions(provider: 'zhipu' | 'minimax' | 'manual'): string[] {
  switch (provider) {
    case 'zhipu':
      return ['glm-4.7', 'glm-4.6', 'glm-4.5', 'glm-4.5-air'];
    case 'minimax':
      return ['minimax-m2.1', 'minimax-m2'];
    case 'manual':
      return [];
    default:
      return [];
  }
}

/**
 * Determine which provider/endpoint to use based on the model name
 */
export function getProviderForModel(modelName: string): 'zhipu' | 'minimax' | 'manual' | null {
  // Strip the custom- prefix if present
  const bareModel = modelName.startsWith('custom-') ? modelName.slice(7) : modelName;

  // Check Zhipu models (GLM family)
  if (bareModel.startsWith('glm-') || bareModel.includes('glm')) {
    return 'zhipu';
  }

  // Check MiniMax models
  if (bareModel.startsWith('minimax-') || bareModel.includes('minimax')) {
    return 'minimax';
  }

  return null;
}

/**
 * Get the correct endpoint configuration based on the selected model
 * Returns the appropriate baseUrl for the model's provider
 */
export function getEndpointForModel(
  modelName: string
): { baseUrl: string; provider: string } | null {
  const provider = getProviderForModel(modelName);

  if (!provider || provider === 'manual') {
    return null;
  }

  const preset = getPreset(provider);
  if (!preset) {
    return null;
  }

  return {
    baseUrl: preset.baseUrl,
    provider: preset.value,
  };
}
