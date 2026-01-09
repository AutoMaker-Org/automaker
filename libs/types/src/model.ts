/**
 * Model alias mapping for Claude models
 */
export const CLAUDE_MODEL_MAP: Record<string, string> = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-5-20250929',
  opus: 'claude-opus-4-5-20251101',
} as const;

/**
 * Codex/OpenAI model identifiers
 * Based on OpenAI Codex CLI official models
 * See: https://developers.openai.com/codex/models/
 *
 * IMPORTANT: All Codex models use 'codex-' prefix to distinguish from Cursor CLI models
 */
export const CODEX_MODEL_MAP = {
  // Recommended Codex-specific models
  /** Most advanced agentic coding model for complex software engineering (default for ChatGPT users) */
  gpt52Codex: 'codex-gpt-5.2-codex',
  /** Optimized for long-horizon, agentic coding tasks in Codex */
  gpt51CodexMax: 'codex-gpt-5.1-codex-max',
  /** Smaller, more cost-effective version for faster workflows */
  gpt51CodexMini: 'codex-gpt-5.1-codex-mini',

  // General-purpose GPT models (also available in Codex)
  /** Best general agentic model for tasks across industries and domains */
  gpt52: 'codex-gpt-5.2',
  /** Great for coding and agentic tasks across domains */
  gpt51: 'codex-gpt-5.1',
} as const;

export const CODEX_MODEL_IDS = Object.values(CODEX_MODEL_MAP);

/**
 * Models that support reasoning effort configuration
 * These models can use reasoning.effort parameter
 */
export const REASONING_CAPABLE_MODELS = new Set([
  CODEX_MODEL_MAP.gpt52Codex,
  CODEX_MODEL_MAP.gpt51CodexMax,
  CODEX_MODEL_MAP.gpt52,
  CODEX_MODEL_MAP.gpt51,
]);

/**
 * Check if a model supports reasoning effort configuration
 */
export function supportsReasoningEffort(modelId: string): boolean {
  return REASONING_CAPABLE_MODELS.has(modelId as any);
}

/**
 * Get all Codex model IDs as an array
 */
export function getAllCodexModelIds(): CodexModelId[] {
  return CODEX_MODEL_IDS as CodexModelId[];
}

/**
 * Default models per provider
 */
export const DEFAULT_MODELS = {
  claude: 'claude-opus-4-5-20251101',
  cursor: 'auto', // Cursor's recommended default
  codex: CODEX_MODEL_MAP.gpt52Codex, // GPT-5.2-Codex is the most advanced agentic coding model
} as const;

export type ModelAlias = keyof typeof CLAUDE_MODEL_MAP;
export type CodexModelId = (typeof CODEX_MODEL_MAP)[keyof typeof CODEX_MODEL_MAP];

/**
 * AgentModel - Alias for ModelAlias for backward compatibility
 * Represents available models across providers
 */
export type AgentModel = ModelAlias | CodexModelId;
