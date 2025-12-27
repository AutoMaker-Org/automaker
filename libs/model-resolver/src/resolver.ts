/**
 * Model resolution utilities for handling model string mapping
 *
 * Provides centralized model resolution logic:
 * - Maps Claude model aliases to full model strings
 * - Maps Z.ai model aliases to full model strings
 * - Provides default models per provider
 * - Handles multiple model sources with priority
 */

import { CLAUDE_MODEL_MAP, ZAI_MODEL_MAP, ALL_MODEL_MAPS, DEFAULT_MODELS } from '@automaker/types';

/**
 * Use case types for model selection
 */
export type ModelUseCase = 'spec' | 'features' | 'suggestions' | 'chat' | 'auto' | 'default';

/**
 * Environment variable names for each use case
 */
const USE_CASE_ENV_VARS: Record<ModelUseCase, string> = {
  spec: 'AUTOMAKER_MODEL_SPEC',
  features: 'AUTOMAKER_MODEL_FEATURES',
  suggestions: 'AUTOMAKER_MODEL_SUGGESTIONS',
  chat: 'AUTOMAKER_MODEL_CHAT',
  auto: 'AUTOMAKER_MODEL_AUTO',
  default: 'AUTOMAKER_MODEL_DEFAULT',
};

/**
 * Provider hint for default model selection
 */
export type ProviderHint = 'claude' | 'zai' | 'auto';

/**
 * Resolve a model key/alias to a full model string
 *
 * @param modelKey - Model key (e.g., "opus", "glm", "claude-opus-4-20250514")
 * @param defaultModel - Fallback model if modelKey is undefined (overrides providerHint)
 * @param providerHint - Provider preference for default selection (claude, zai, or auto)
 * @returns Full model string
 */
export function resolveModelString(
  modelKey?: string,
  defaultModel?: string,
  providerHint: ProviderHint = 'auto'
): string {
  // No model specified - use default based on provider hint
  if (!modelKey) {
    if (defaultModel) {
      return defaultModel;
    }
    // Provider-aware default selection
    switch (providerHint) {
      case 'zai':
        return DEFAULT_MODELS.zai;
      case 'claude':
        return DEFAULT_MODELS.claude;
      case 'auto':
      default:
        return DEFAULT_MODELS.claude; // Default to Claude for backward compatibility
    }
  }

  // Full Claude model string - pass through unchanged
  if (modelKey.includes('claude-')) {
    console.log(`[ModelResolver] Using full Claude model string: ${modelKey}`);
    return modelKey;
  }

  // Full Z.ai model string (glm-*) - pass through unchanged
  if (modelKey.startsWith('glm-')) {
    console.log(`[ModelResolver] Using full GLM model string: ${modelKey}`);
    return modelKey;
  }

  // Look up Claude model alias
  const claudeResolved = CLAUDE_MODEL_MAP[modelKey];
  if (claudeResolved) {
    console.log(
      `[ModelResolver] Resolved Claude model alias: "${modelKey}" -> "${claudeResolved}"`
    );
    return claudeResolved;
  }

  // Look up Z.ai model alias
  const zaiResolved = ZAI_MODEL_MAP[modelKey];
  if (zaiResolved) {
    console.log(`[ModelResolver] Resolved Z.ai model alias: "${modelKey}" -> "${zaiResolved}"`);
    return zaiResolved;
  }

  // Check combined model map (includes both providers)
  const allResolved = ALL_MODEL_MAPS[modelKey];
  if (allResolved) {
    console.log(`[ModelResolver] Resolved model alias: "${modelKey}" -> "${allResolved}"`);
    return allResolved;
  }

  // Unknown model key - use default or provider-aware fallback
  if (defaultModel) {
    console.warn(
      `[ModelResolver] Unknown model key "${modelKey}", using default: "${defaultModel}"`
    );
    return defaultModel;
  }

  // Use provider-aware fallback
  console.warn(`[ModelResolver] Unknown model key "${modelKey}", using provider-aware default`);
  switch (providerHint) {
    case 'zai':
      return DEFAULT_MODELS.zai;
    case 'claude':
      return DEFAULT_MODELS.claude;
    case 'auto':
    default:
      return DEFAULT_MODELS.claude;
  }
}

/**
 * Get the effective model from multiple sources
 * Priority: explicit model > session model > default
 *
 * @param explicitModel - Explicitly provided model (highest priority)
 * @param sessionModel - Model from session (medium priority)
 * @param defaultModel - Fallback default model (lowest priority)
 * @returns Resolved model string
 */
export function getEffectiveModel(
  explicitModel?: string,
  sessionModel?: string,
  defaultModel?: string
): string {
  return resolveModelString(explicitModel || sessionModel, defaultModel);
}

/**
 * Get model for a specific use case from environment variable
 *
 * Checks the appropriate AUTOMAKER_MODEL_* environment variable based on use case.
 * Falls back to AUTOMAKER_MODEL_DEFAULT, then to provider defaults.
 *
 * @param useCase - The use case (spec, features, suggestions, chat, auto, default)
 * @returns Resolved model string from environment or defaults
 */
export function getModelForUseCase(useCase: ModelUseCase = 'default'): string {
  const envVar = USE_CASE_ENV_VARS[useCase];
  const envModel = process.env[envVar];

  if (envModel) {
    console.log(`[ModelResolver] Using model from ${envVar}: ${envModel}`);
    return resolveModelString(envModel);
  }

  // Fall back to AUTOMAKER_MODEL_DEFAULT
  if (useCase !== 'default') {
    const defaultModel = process.env[USE_CASE_ENV_VARS.default];
    if (defaultModel) {
      console.log(`[ModelResolver] Using model from ${USE_CASE_ENV_VARS.default}: ${defaultModel}`);
      return resolveModelString(defaultModel);
    }
  }

  // Final fallback to provider defaults
  const fallback = DEFAULT_MODELS.claude;
  console.log(
    `[ModelResolver] No model env var for use case "${useCase}", using default: ${fallback}`
  );
  return fallback;
}
