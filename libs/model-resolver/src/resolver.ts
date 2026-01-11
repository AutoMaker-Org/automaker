/**
 * Model resolution utilities for handling model string mapping
 *
 * Provides centralized model resolution logic:
 * - Maps Claude model aliases to full model strings
 * - Passes through Cursor models unchanged (handled by CursorProvider)
 * - Provides default models per provider
 * - Handles multiple model sources with priority
 */

import {
  CLAUDE_MODEL_MAP,
  CURSOR_MODEL_MAP,
  CODEX_MODEL_MAP,
  DEFAULT_MODELS,
  PROVIDER_PREFIXES,
  isCursorModel,
  isOpencodeModel,
  stripProviderPrefix,
  type PhaseModelEntry,
  type ThinkingLevel,
} from '@automaker/types';

// Pattern definitions for Codex/OpenAI models
const CODEX_MODEL_PREFIXES = ['codex-', 'gpt-'];
const OPENAI_O_SERIES_PATTERN = /^o\d/;
const OPENAI_O_SERIES_ALLOWED_MODELS = new Set<string>();

/**
 * Resolve a model key/alias to a full model string
 *
 * @param modelKey - Model key (e.g., "opus", "cursor-composer-1", "claude-sonnet-4-20250514")
 * @param defaultModel - Fallback model if modelKey is undefined
 * @returns Full model string
 */
export function resolveModelString(
  modelKey?: string,
  defaultModel: string = DEFAULT_MODELS.claude
): string {
  console.log(
    `[ModelResolver] resolveModelString called with modelKey: "${modelKey}", defaultModel: "${defaultModel}"`
  );

  // No model specified - use default
  if (!modelKey) {
    console.log(`[ModelResolver] No model specified, using default: ${defaultModel}`);
    return defaultModel;
  }

  // Cursor model with explicit prefix (e.g., "cursor-composer-1") - pass through unchanged
  // CursorProvider will strip the prefix when calling the CLI
  if (modelKey.startsWith(PROVIDER_PREFIXES.cursor)) {
    const cursorModelId = stripProviderPrefix(modelKey);
    // Verify it's a valid Cursor model
    if (cursorModelId in CURSOR_MODEL_MAP) {
      console.log(
        `[ModelResolver] Using Cursor model: ${modelKey} (valid model ID: ${cursorModelId})`
      );
      return modelKey;
    }
    // Could be a cursor-prefixed model not in our map yet - still pass through
    console.log(`[ModelResolver] Passing through cursor-prefixed model: ${modelKey}`);
    return modelKey;
  }

  // Codex model with explicit prefix (e.g., "codex-gpt-5.1-codex-max") - pass through unchanged
  if (modelKey.startsWith(PROVIDER_PREFIXES.codex)) {
    console.log(`[ModelResolver] Using Codex model: ${modelKey}`);
    return modelKey;
  }

  // OpenCode model - pass through unchanged
  // Supports: opencode/big-pickle, opencode-sonnet, amazon-bedrock/anthropic.claude-*
  if (isOpencodeModel(modelKey)) {
    console.log(`[ModelResolver] Using OpenCode model: ${modelKey}`);
    return modelKey;
  }

  // Full Claude model string - pass through unchanged
  if (modelKey.includes('claude-')) {
    console.log(`[ModelResolver] Using full Claude model string: ${modelKey}`);
    return modelKey;
  }

  // Look up Claude model alias
  const resolved = CLAUDE_MODEL_MAP[modelKey];
  if (resolved) {
    console.log(`[ModelResolver] Resolved Claude model alias: "${modelKey}" -> "${resolved}"`);
    return resolved;
  }

  // OpenAI/Codex models - check for codex- or gpt- prefix
  if (
    CODEX_MODEL_PREFIXES.some((prefix) => modelKey.startsWith(prefix)) ||
    (OPENAI_O_SERIES_PATTERN.test(modelKey) && OPENAI_O_SERIES_ALLOWED_MODELS.has(modelKey))
  ) {
    console.log(`[ModelResolver] Using OpenAI/Codex model: ${modelKey}`);
    return modelKey;
  }

  // Check if it's a bare Cursor model ID (e.g., "composer-1", "auto", "gpt-4o")
  // Note: This is checked AFTER Codex check to prioritize Codex for bare gpt-* models
  if (modelKey in CURSOR_MODEL_MAP) {
    // Return with cursor- prefix so provider routing works correctly
    const prefixedModel = `${PROVIDER_PREFIXES.cursor}${modelKey}`;
    console.log(
      `[ModelResolver] Detected bare Cursor model ID: "${modelKey}" -> "${prefixedModel}"`
    );
    return prefixedModel;
  }

  // Unknown model key - use default
  console.warn(`[ModelResolver] Unknown model key "${modelKey}", using default: "${defaultModel}"`);
  return defaultModel;
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
 * Result of resolving a phase model entry
 */
export interface ResolvedPhaseModel {
  /** Resolved model string (full model ID) */
  model: string;
  /** Optional thinking level for extended thinking */
  thinkingLevel?: ThinkingLevel;
}

/**
 * Resolve a phase model entry to a model string and thinking level
 *
 * Handles both legacy format (string) and new format (PhaseModelEntry object).
 * This centralizes the pattern used across phase model routes.
 *
 * @param phaseModel - Phase model entry (string or PhaseModelEntry object)
 * @param defaultModel - Fallback model if resolution fails
 * @returns Resolved model string and optional thinking level
 *
 * @remarks
 * - For Cursor models, `thinkingLevel` is returned as `undefined` since Cursor
 *   handles thinking internally via model variants (e.g., 'claude-sonnet-4-thinking')
 * - Defensively handles null/undefined from corrupted settings JSON
 *
 * @example
 * ```ts
 * const phaseModel = settings?.phaseModels?.enhancementModel || DEFAULT_PHASE_MODELS.enhancementModel;
 * const { model, thinkingLevel } = resolvePhaseModel(phaseModel);
 * ```
 */
export function resolvePhaseModel(
  phaseModel: string | PhaseModelEntry | null | undefined,
  defaultModel: string = DEFAULT_MODELS.claude
): ResolvedPhaseModel {
  console.log(
    `[ModelResolver] resolvePhaseModel called with:`,
    JSON.stringify(phaseModel),
    `type: ${typeof phaseModel}`
  );

  // Handle null/undefined (defensive against corrupted JSON)
  if (!phaseModel) {
    console.log(`[ModelResolver] phaseModel is null/undefined, using default`);
    return {
      model: resolveModelString(undefined, defaultModel),
      thinkingLevel: undefined,
    };
  }

  // Handle legacy string format
  if (typeof phaseModel === 'string') {
    console.log(`[ModelResolver] phaseModel is string format (legacy): "${phaseModel}"`);
    return {
      model: resolveModelString(phaseModel, defaultModel),
      thinkingLevel: undefined,
    };
  }

  // Handle new PhaseModelEntry object format
  console.log(
    `[ModelResolver] phaseModel is object format: model="${phaseModel.model}", thinkingLevel="${phaseModel.thinkingLevel}"`
  );
  return {
    model: resolveModelString(phaseModel.model, defaultModel),
    thinkingLevel: phaseModel.thinkingLevel,
  };
}
