/**
 * Provider utility functions
 *
 * Centralized utilities for determining model providers.
 * When adding new providers, update these functions instead of
 * scattering .startsWith() checks throughout the codebase.
 */

import type { ModelProvider } from './settings.js';
import { CURSOR_MODEL_MAP } from './cursor-models.js';
import { CLAUDE_MODEL_MAP, CODEX_MODEL_MAP } from './model.js';
import { OPENCODE_MODEL_CONFIG_MAP } from './opencode-models.js';

/** Provider prefix constants */
export const PROVIDER_PREFIXES = {
  cursor: 'cursor-',
  codex: 'codex-',
  opencode: 'opencode-',
} as const;

/**
 * Check if a model string represents a Cursor model
 *
 * @param model - Model string to check (e.g., "cursor-composer-1" or "composer-1")
 * @returns true if the model is a Cursor model (excluding Codex-specific models)
 */
export function isCursorModel(model: string | undefined | null): boolean {
  if (!model || typeof model !== 'string') return false;

  // Check for explicit cursor- prefix
  if (model.startsWith(PROVIDER_PREFIXES.cursor)) {
    return true;
  }

  // Check if it's a bare Cursor model ID (excluding Codex-specific models)
  // Codex-specific models should always route to Codex provider, not Cursor
  if (model in CURSOR_MODEL_MAP) {
    return true;
  }

  return false;
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
 * Check if a model string represents a Codex/OpenAI model
 *
 * @param model - Model string to check (e.g., "gpt-5.2", "o1", "codex-gpt-5.2")
 * @returns true if the model is a Codex model
 */
export function isCodexModel(model: string | undefined | null): boolean {
  if (!model || typeof model !== 'string') return false;

  // Check for explicit codex- prefix
  if (model.startsWith(PROVIDER_PREFIXES.codex)) {
    return true;
  }

  // Check if it's a gpt- model (bare gpt models go to Codex, not Cursor)
  if (model.startsWith('gpt-')) {
    return true;
  }

  // Check if it's an o-series model (o1, o3, etc.)
  if (/^o\d/.test(model)) {
    return true;
  }

  // Check if it's in the CODEX_MODEL_MAP
  return model in CODEX_MODEL_MAP;
}

/**
 * Check if a model string represents an OpenCode model
 *
 * OpenCode models can be identified by:
 * - Explicit 'opencode-' prefix (for routing in Automaker)
 * - 'opencode/' prefix (OpenCode free tier models)
 * - 'amazon-bedrock/' prefix (AWS Bedrock models via OpenCode)
 * - Full model ID from OPENCODE_MODEL_CONFIG_MAP
 *
 * @param model - Model string to check (e.g., "opencode-sonnet", "opencode/big-pickle", "amazon-bedrock/anthropic.claude-sonnet-4-5-20250929-v1:0")
 * @returns true if the model is an OpenCode model
 */
export function isOpencodeModel(model: string | undefined | null): boolean {
  if (!model || typeof model !== 'string') return false;

  // Check for explicit opencode- prefix (Automaker routing prefix)
  if (model.startsWith(PROVIDER_PREFIXES.opencode)) {
    return true;
  }

  // Check if it's a known OpenCode model ID
  if (model in OPENCODE_MODEL_CONFIG_MAP) {
    return true;
  }

  // Check for OpenCode native model prefixes
  // - opencode/ = OpenCode free tier models (e.g., opencode/big-pickle)
  // - amazon-bedrock/ = AWS Bedrock models (e.g., amazon-bedrock/anthropic.claude-*)
  if (model.startsWith('opencode/') || model.startsWith('amazon-bedrock/')) {
    return true;
  }

  return false;
}

/**
 * Get the provider for a model string
 *
 * @param model - Model string to check
 * @returns The provider type, defaults to 'claude' for unknown models
 */
export function getModelProvider(model: string | undefined | null): ModelProvider {
  // Check OpenCode first since it uses provider-prefixed formats that could conflict
  if (isOpencodeModel(model)) {
    return 'opencode';
  }
  // Check Codex before Cursor, since Cursor also supports gpt models
  // but bare gpt-* should route to Codex
  if (isCodexModel(model)) {
    return 'codex';
  }
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
 * addProviderPrefix('gpt-5.2', 'codex') // 'codex-gpt-5.2'
 * addProviderPrefix('sonnet', 'claude') // 'sonnet' (Claude doesn't use prefix)
 */
export function addProviderPrefix(model: string, provider: ModelProvider): string {
  if (!model || typeof model !== 'string') return model;

  if (provider === 'cursor') {
    if (!model.startsWith(PROVIDER_PREFIXES.cursor)) {
      return `${PROVIDER_PREFIXES.cursor}${model}`;
    }
  } else if (provider === 'codex') {
    if (!model.startsWith(PROVIDER_PREFIXES.codex)) {
      return `${PROVIDER_PREFIXES.codex}${model}`;
    }
  } else if (provider === 'opencode') {
    if (!model.startsWith(PROVIDER_PREFIXES.opencode)) {
      return `${PROVIDER_PREFIXES.opencode}${model}`;
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
 * - For Codex: can add codex- prefix (but bare gpt-* is also valid)
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

  // For Codex, bare gpt-* and o-series models are valid canonical forms
  // Check if it's in the CODEX_MODEL_MAP
  if (model in CODEX_MODEL_MAP) {
    // If it already starts with gpt- or o, it's canonical
    if (model.startsWith('gpt-') || /^o\d/.test(model)) {
      return model;
    }
    // Otherwise, it might need a prefix (though this is unlikely)
    if (!model.startsWith(PROVIDER_PREFIXES.codex)) {
      return `${PROVIDER_PREFIXES.codex}${model}`;
    }
  }

  return model;
}

/**
 * Validate that a model ID does not contain a provider prefix
 *
 * Providers should receive bare model IDs (e.g., "gpt-5.1-codex-max", "composer-1")
 * without provider prefixes (e.g., NOT "codex-gpt-5.1-codex-max", NOT "cursor-composer-1").
 *
 * This validation ensures the ProviderFactory properly stripped prefixes before
 * passing models to providers.
 *
 * @param model - Model ID to validate
 * @param providerName - Name of the provider for error messages
 * @throws Error if model contains a provider prefix
 *
 * @example
 * validateBareModelId("gpt-5.1-codex-max", "CodexProvider");  // ✅ OK
 * validateBareModelId("codex-gpt-5.1-codex-max", "CodexProvider");  // ❌ Throws error
 */
export function validateBareModelId(model: string, providerName: string): void {
  if (!model || typeof model !== 'string') {
    throw new Error(`[${providerName}] Invalid model ID: expected string, got ${typeof model}`);
  }

  for (const [provider, prefix] of Object.entries(PROVIDER_PREFIXES)) {
    if (model.startsWith(prefix)) {
      throw new Error(
        `[${providerName}] Model ID should not contain provider prefix '${prefix}'. ` +
          `Got: '${model}'. ` +
          `This is likely a bug in ProviderFactory - it should strip the '${provider}' prefix ` +
          `before passing the model to the provider.`
      );
    }
  }
}
