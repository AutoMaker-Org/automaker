/**
 * Model alias mapping for Claude models
 */
export const CLAUDE_MODEL_MAP: Record<string, string> = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-5-20250929',
  opus: 'claude-opus-4-5-20251101',
} as const;

/**
 * Codex model identifiers
 */
export const CODEX_MODEL_MAP = {
  gpt52: 'gpt-5.2',
  gpt51CodexMax: 'gpt-5.1-codex-max',
  gpt51Codex: 'gpt-5.1-codex',
  gpt51CodexMini: 'gpt-5.1-codex-mini',
  gpt51: 'gpt-5.1',
} as const;

export const CODEX_MODEL_IDS = Object.values(CODEX_MODEL_MAP);

/**
 * Default models per provider
 */
export const DEFAULT_MODELS = {
  claude: 'claude-opus-4-5-20251101',
  cursor: 'auto', // Cursor's recommended default
  codex: CODEX_MODEL_MAP.gpt52,
} as const;

export type ModelAlias = keyof typeof CLAUDE_MODEL_MAP;
export type CodexModelId = (typeof CODEX_MODEL_MAP)[keyof typeof CODEX_MODEL_MAP];

/**
 * AgentModel - Alias for ModelAlias for backward compatibility
 * Represents available models across providers
 */
export type AgentModel = ModelAlias | CodexModelId;
