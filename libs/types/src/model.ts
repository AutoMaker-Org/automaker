/**
 * Model alias mapping for Claude models
 */
export const CLAUDE_MODEL_MAP: Record<string, string> = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-5-20250929',
  opus: 'claude-opus-4-5-20251101',
} as const;

/**
 * Model alias mapping for Z.ai (ZhipuAI) models
 *
 * Note: ZhipuAI's coding API (api/coding/paas/v4) uses different model names.
 * glm-4.6v is the only model that supports vision.
 */
export const ZAI_MODEL_MAP: Record<string, string> = {
  // GLM-4.7 - flagship model
  'glm-4.7': 'glm-4.7',
  // GLM-4.6v - multimodal model with vision support
  'glm-4.6v': 'glm-4.6v',
  // GLM-4.6
  'glm-4.6': 'glm-4.6',
  // GLM-4.5-Air
  'glm-4.5-air': 'glm-4.5-air',
  // Short alias (maps to glm-4.5-air as default)
  glm: 'glm-4.5-air',
} as const;

/**
 * Default models per provider
 */
export const DEFAULT_MODELS = {
  claude: 'claude-opus-4-5-20251101',
  zai: 'glm-4.7',
} as const;

export type ModelAlias = keyof typeof CLAUDE_MODEL_MAP | keyof typeof ZAI_MODEL_MAP;

/**
 * AgentModel - Alias for ModelAlias for backward compatibility
 * Represents available models: "opus" | "sonnet" | "haiku" | "glm"
 */
export type AgentModel = ModelAlias;

/**
 * Combined model map for all providers
 */
export const ALL_MODEL_MAPS = {
  ...CLAUDE_MODEL_MAP,
  ...ZAI_MODEL_MAP,
} as const;
