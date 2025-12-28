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

/**
 * Model equivalence mapping for cross-provider fallback
 *
 * Maps each model to its equivalent in the other provider.
 * Used when a provider is disabled but an equivalent model is available.
 *
 * Mapping hierarchy:
 * - Claude Opus (premium) ↔ Zai GLM-4.7 (premium)
 * - Claude Sonnet (balanced) ↔ Zai GLM-4.6v (balanced, with vision)
 * - Claude Haiku (speed) ↔ Zai GLM-4.5-Air (speed)
 *
 * NOTE: GLM-4.6 (non-vision) also exists and maps to Claude Sonnet,
 * but Claude Sonnet maps to GLM-4.6v to preserve vision capability.
 */
export const MODEL_EQUIVALENCE: Record<string, { provider: 'claude' | 'zai'; model: string }> = {
  // Claude models → Zai equivalents
  'claude-opus-4-5-20251101': { provider: 'zai', model: 'glm-4.7' },
  'claude-sonnet-4-5-20250929': { provider: 'zai', model: 'glm-4.6v' },
  'claude-haiku-4-5-20251001': { provider: 'zai', model: 'glm-4.5-air' },
  // Zai models → Claude equivalents
  'glm-4.7': { provider: 'claude', model: 'claude-opus-4-5-20251101' },
  'glm-4.6v': { provider: 'claude', model: 'claude-sonnet-4-5-20250929' },
  'glm-4.6': { provider: 'claude', model: 'claude-sonnet-4-5-20250929' },
  'glm-4.5-air': { provider: 'claude', model: 'claude-haiku-4-5-20251001' },
} as const;

/**
 * Get the provider for a given model string
 *
 * @param model - Model identifier or full model string
 * @returns Provider name ('claude' | 'zai') or undefined if unknown
 */
export function getProviderForModel(model: string): 'claude' | 'zai' | undefined {
  const lowerModel = model.toLowerCase();

  // Check Claude models
  if (
    lowerModel.includes('claude-') ||
    lowerModel === 'haiku' ||
    lowerModel === 'sonnet' ||
    lowerModel === 'opus'
  ) {
    return 'claude';
  }

  // Check Zai models
  if (lowerModel.startsWith('glm-') || lowerModel === 'glm') {
    return 'zai';
  }

  return undefined;
}
