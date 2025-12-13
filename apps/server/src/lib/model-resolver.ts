/**
 * Model resolution utilities for handling model string mapping
 *
 * Provides centralized model resolution logic:
 * - Maps Claude model aliases to full model strings
 * - Detects and passes through OpenAI/Codex models
 * - Provides default models per provider
 * - Handles multiple model sources with priority
 */

/**
 * Model alias mapping for Claude models
 */
export const CLAUDE_MODEL_MAP: Record<string, string> = {
  haiku: "claude-haiku-4-5",
  sonnet: "claude-sonnet-4-20250514",
  opus: "claude-opus-4-5-20251101",
} as const;

/**
 * Default models per provider
 */
export const DEFAULT_MODELS = {
  claude: "claude-opus-4-5-20251101",
  openai: "gpt-5.2",
} as const;

/**
 * Resolve a model key/alias to a full model string
 *
 * @param modelKey - Model key (e.g., "opus", "gpt-5.2", "claude-sonnet-4-20250514")
 * @param defaultModel - Fallback model if modelKey is undefined
 * @returns Full model string
 */
export function resolveModelString(
  modelKey?: string,
  defaultModel: string = DEFAULT_MODELS.claude
): string {
  // No model specified - use default
  if (!modelKey) {
    return defaultModel;
  }

  // OpenAI/Codex models - pass through unchanged
  // Only check for gpt-* models (Codex CLI doesn't support o1/o3)
  if (modelKey.startsWith("gpt-")) {
    console.log(`[ModelResolver] Using OpenAI/Codex model: ${modelKey}`);
    return modelKey;
  }

  // Full Claude model string - pass through unchanged
  if (modelKey.includes("claude-")) {
    console.log(`[ModelResolver] Using full Claude model string: ${modelKey}`);
    return modelKey;
  }

  // Look up Claude model alias
  const resolved = CLAUDE_MODEL_MAP[modelKey];
  if (resolved) {
    console.log(`[ModelResolver] Resolved model alias: "${modelKey}" -> "${resolved}"`);
    return resolved;
  }

  // Unknown model key - use default
  console.warn(
    `[ModelResolver] Unknown model key "${modelKey}", using default: "${defaultModel}"`
  );
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
  return resolveModelString(
    explicitModel || sessionModel,
    defaultModel
  );
}
