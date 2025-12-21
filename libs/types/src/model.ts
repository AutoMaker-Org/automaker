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
} as const;

export type ModelAlias = keyof typeof CLAUDE_MODEL_MAP;

/**
 * AgentModel - Alias for ModelAlias for backward compatibility
 * Represents available Claude models: "opus" | "sonnet" | "haiku"
 */
export type AgentModel = ModelAlias;
