/**
 * Provider utility functions
 *
 * Centralized utilities for determining model providers.
 * When adding new providers, update these functions instead of
 * scattering .startsWith() checks throughout the codebase.
 */

import type { ModelProvider } from './settings.js';
import { CURSOR_MODEL_MAP, type CursorModelId } from './cursor-models.js';
import { CLAUDE_MODEL_MAP } from './model.js';

/** Provider prefix constants */
export const PROVIDER_PREFIXES = {
  cursor: 'cursor-',
  // Add new provider prefixes here
} as const;

/**
 * Check if a model string represents a Cursor model
 *
 * @param model - Model string to check (e.g., "cursor-composer-1" or "composer-1")
 * @returns true if the model is a Cursor model
 */
export function isCursorModel(model: string | undefined | null): boolean {
  if (!model || typeof model !== 'string') return false;

  // Check for explicit cursor- prefix
  if (model.startsWith(PROVIDER_PREFIXES.cursor)) {
    return true;
  }

  // Check if it's a bare Cursor model ID
  return model in CURSOR_MODEL_MAP;
}

/**
 * Check if a model string represents a Claude model
 *
 * @param model - Model string to check (e.g., "sonnet", "opus", "claude-sonnet-4-20250514")
 * @returns true if the model is a Claude model
 */
export function isClaudeModel(model: string | undefined | null): boolean {
  if (!model || typeof model !== 'string') return false;

  // Check if it's a Claude model alias (haiku, sonnet, opus)
  if (model in CLAUDE_MODEL_MAP) {
    return true;
  }

  // Check if it contains 'claude-' in the string (full model ID)
  return model.includes('claude-');
}

/**
 * Get the provider for a model string
 *
 * @param model - Model string to check
 * @returns The provider type, defaults to 'claude' for unknown models
 */
export function getModelProvider(model: string | undefined | null): ModelProvider {
  if (isCursorModel(model)) {
    return 'cursor';
  }
  return 'claude';
}

/**
 * Strip the provider prefix from a model string
 *
 * @param model - Model string that may have a provider prefix
 * @returns Model string without provider prefix
 *
 * @example
 * stripProviderPrefix('cursor-composer-1') // 'composer-1'
 * stripProviderPrefix('sonnet') // 'sonnet'
 */
export function stripProviderPrefix(model: string): string {
  if (!model || typeof model !== 'string') return model;

  for (const prefix of Object.values(PROVIDER_PREFIXES)) {
    if (model.startsWith(prefix)) {
      return model.slice(prefix.length);
    }
  }
  return model;
}

/**
 * Add the provider prefix to a model string if not already present
 *
 * @param model - Bare model ID
 * @param provider - Provider to add prefix for
 * @returns Model string with provider prefix
 *
 * @example
 * addProviderPrefix('composer-1', 'cursor') // 'cursor-composer-1'
 * addProviderPrefix('cursor-composer-1', 'cursor') // 'cursor-composer-1' (no change)
 * addProviderPrefix('sonnet', 'claude') // 'sonnet' (Claude doesn't use prefix)
 */
export function addProviderPrefix(model: string, provider: ModelProvider): string {
  if (!model || typeof model !== 'string') return model;

  if (provider === 'cursor') {
    if (!model.startsWith(PROVIDER_PREFIXES.cursor)) {
      return `${PROVIDER_PREFIXES.cursor}${model}`;
    }
  }
  // Claude models don't use prefixes
  return model;
}

/**
 * Get the bare model ID from a model string (without provider prefix)
 *
 * @param model - Model string that may have a provider prefix
 * @returns The bare model ID
 */
export function getBareModelId(model: string): string {
  return stripProviderPrefix(model);
}

/**
 * Normalize a model string to its canonical form
 * - For Cursor: adds cursor- prefix if missing
 * - For Claude: returns as-is
 *
 * @param model - Model string to normalize
 * @returns Normalized model string
 */
export function normalizeModelString(model: string | undefined | null): string {
  if (!model || typeof model !== 'string') return 'sonnet'; // Default

  // If it's a Cursor model without prefix, add the prefix
  if (model in CURSOR_MODEL_MAP && !model.startsWith(PROVIDER_PREFIXES.cursor)) {
    return `${PROVIDER_PREFIXES.cursor}${model}`;
  }

  return model;
}
