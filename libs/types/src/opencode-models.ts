/**
 * OpenCode Model IDs
 * Models available via OpenCode CLI (opencode models command)
 */
export type OpencodeModelId =
  // OpenCode Free Tier Models
  | 'opencode/big-pickle'
  | 'opencode/glm-4.7-free'
  | 'opencode/gpt-5-nano'
  | 'opencode/grok-code'
  | 'opencode/minimax-m2.1-free'
  // Amazon Bedrock - Claude Models
  | 'amazon-bedrock/anthropic.claude-sonnet-4-5-20250929-v1:0'
  | 'amazon-bedrock/anthropic.claude-opus-4-5-20251101-v1:0'
  | 'amazon-bedrock/anthropic.claude-haiku-4-5-20251001-v1:0'
  | 'amazon-bedrock/anthropic.claude-sonnet-4-20250514-v1:0'
  | 'amazon-bedrock/anthropic.claude-opus-4-20250514-v1:0'
  | 'amazon-bedrock/anthropic.claude-3-7-sonnet-20250219-v1:0'
  | 'amazon-bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0'
  | 'amazon-bedrock/anthropic.claude-3-opus-20240229-v1:0'
  // Amazon Bedrock - DeepSeek Models
  | 'amazon-bedrock/deepseek.r1-v1:0'
  | 'amazon-bedrock/deepseek.v3-v1:0'
  // Amazon Bedrock - Amazon Nova Models
  | 'amazon-bedrock/amazon.nova-premier-v1:0'
  | 'amazon-bedrock/amazon.nova-pro-v1:0'
  | 'amazon-bedrock/amazon.nova-lite-v1:0'
  // Amazon Bedrock - Meta Llama Models
  | 'amazon-bedrock/meta.llama4-maverick-17b-instruct-v1:0'
  | 'amazon-bedrock/meta.llama3-3-70b-instruct-v1:0'
  // Amazon Bedrock - Mistral Models
  | 'amazon-bedrock/mistral.mistral-large-2402-v1:0'
  // Amazon Bedrock - Qwen Models
  | 'amazon-bedrock/qwen.qwen3-coder-480b-a35b-v1:0'
  | 'amazon-bedrock/qwen.qwen3-235b-a22b-2507-v1:0';

/**
 * Provider type for OpenCode models
 */
export type OpencodeProvider =
  | 'opencode'
  | 'amazon-bedrock-anthropic'
  | 'amazon-bedrock-deepseek'
  | 'amazon-bedrock-amazon'
  | 'amazon-bedrock-meta'
  | 'amazon-bedrock-mistral'
  | 'amazon-bedrock-qwen';

/**
 * Friendly aliases mapped to full model IDs
 */
export const OPENCODE_MODEL_MAP: Record<string, OpencodeModelId> = {
  // OpenCode free tier aliases
  'big-pickle': 'opencode/big-pickle',
  pickle: 'opencode/big-pickle',
  'glm-free': 'opencode/glm-4.7-free',
  'gpt-nano': 'opencode/gpt-5-nano',
  nano: 'opencode/gpt-5-nano',
  'grok-code': 'opencode/grok-code',
  grok: 'opencode/grok-code',
  minimax: 'opencode/minimax-m2.1-free',

  // Claude aliases (via Bedrock)
  'claude-sonnet-4.5': 'amazon-bedrock/anthropic.claude-sonnet-4-5-20250929-v1:0',
  'sonnet-4.5': 'amazon-bedrock/anthropic.claude-sonnet-4-5-20250929-v1:0',
  sonnet: 'amazon-bedrock/anthropic.claude-sonnet-4-5-20250929-v1:0',
  'claude-opus-4.5': 'amazon-bedrock/anthropic.claude-opus-4-5-20251101-v1:0',
  'opus-4.5': 'amazon-bedrock/anthropic.claude-opus-4-5-20251101-v1:0',
  opus: 'amazon-bedrock/anthropic.claude-opus-4-5-20251101-v1:0',
  'claude-haiku-4.5': 'amazon-bedrock/anthropic.claude-haiku-4-5-20251001-v1:0',
  'haiku-4.5': 'amazon-bedrock/anthropic.claude-haiku-4-5-20251001-v1:0',
  haiku: 'amazon-bedrock/anthropic.claude-haiku-4-5-20251001-v1:0',

  // DeepSeek aliases
  'deepseek-r1': 'amazon-bedrock/deepseek.r1-v1:0',
  r1: 'amazon-bedrock/deepseek.r1-v1:0',
  'deepseek-v3': 'amazon-bedrock/deepseek.v3-v1:0',

  // Nova aliases
  'nova-premier': 'amazon-bedrock/amazon.nova-premier-v1:0',
  'nova-pro': 'amazon-bedrock/amazon.nova-pro-v1:0',
  nova: 'amazon-bedrock/amazon.nova-pro-v1:0',

  // Llama aliases
  llama4: 'amazon-bedrock/meta.llama4-maverick-17b-instruct-v1:0',
  'llama-4': 'amazon-bedrock/meta.llama4-maverick-17b-instruct-v1:0',
  llama3: 'amazon-bedrock/meta.llama3-3-70b-instruct-v1:0',

  // Qwen aliases
  qwen: 'amazon-bedrock/qwen.qwen3-coder-480b-a35b-v1:0',
  'qwen-coder': 'amazon-bedrock/qwen.qwen3-coder-480b-a35b-v1:0',
} as const;

/**
 * OpenCode model metadata
 */
export interface OpencodeModelConfig {
  id: OpencodeModelId;
  label: string;
  description: string;
  supportsVision: boolean;
  provider: OpencodeProvider;
  tier: 'free' | 'standard' | 'premium';
}

/**
 * Complete list of OpenCode model configurations
 */
export const OPENCODE_MODELS: OpencodeModelConfig[] = [
  // OpenCode Free Tier Models
  {
    id: 'opencode/big-pickle',
    label: 'Big Pickle',
    description: 'OpenCode free tier model - great for general coding',
    supportsVision: false,
    provider: 'opencode',
    tier: 'free',
  },
  {
    id: 'opencode/glm-4.7-free',
    label: 'GLM 4.7 Free',
    description: 'OpenCode free tier GLM model',
    supportsVision: false,
    provider: 'opencode',
    tier: 'free',
  },
  {
    id: 'opencode/gpt-5-nano',
    label: 'GPT-5 Nano',
    description: 'OpenCode free tier nano model - fast and lightweight',
    supportsVision: false,
    provider: 'opencode',
    tier: 'free',
  },
  {
    id: 'opencode/grok-code',
    label: 'Grok Code',
    description: 'OpenCode free tier Grok model for coding',
    supportsVision: false,
    provider: 'opencode',
    tier: 'free',
  },
  {
    id: 'opencode/minimax-m2.1-free',
    label: 'MiniMax M2.1 Free',
    description: 'OpenCode free tier MiniMax model',
    supportsVision: false,
    provider: 'opencode',
    tier: 'free',
  },

  // Amazon Bedrock - Claude Models
  {
    id: 'amazon-bedrock/anthropic.claude-sonnet-4-5-20250929-v1:0',
    label: 'Claude Sonnet 4.5 (Bedrock)',
    description: 'Latest Claude Sonnet via AWS Bedrock - fast and intelligent (default)',
    supportsVision: true,
    provider: 'amazon-bedrock-anthropic',
    tier: 'premium',
  },
  {
    id: 'amazon-bedrock/anthropic.claude-opus-4-5-20251101-v1:0',
    label: 'Claude Opus 4.5 (Bedrock)',
    description: 'Most capable Claude model via AWS Bedrock',
    supportsVision: true,
    provider: 'amazon-bedrock-anthropic',
    tier: 'premium',
  },
  {
    id: 'amazon-bedrock/anthropic.claude-haiku-4-5-20251001-v1:0',
    label: 'Claude Haiku 4.5 (Bedrock)',
    description: 'Fastest Claude model via AWS Bedrock',
    supportsVision: true,
    provider: 'amazon-bedrock-anthropic',
    tier: 'standard',
  },
  {
    id: 'amazon-bedrock/anthropic.claude-sonnet-4-20250514-v1:0',
    label: 'Claude Sonnet 4 (Bedrock)',
    description: 'Claude Sonnet 4 via AWS Bedrock',
    supportsVision: true,
    provider: 'amazon-bedrock-anthropic',
    tier: 'premium',
  },
  {
    id: 'amazon-bedrock/anthropic.claude-opus-4-20250514-v1:0',
    label: 'Claude Opus 4 (Bedrock)',
    description: 'Claude Opus 4 via AWS Bedrock',
    supportsVision: true,
    provider: 'amazon-bedrock-anthropic',
    tier: 'premium',
  },
  {
    id: 'amazon-bedrock/anthropic.claude-3-7-sonnet-20250219-v1:0',
    label: 'Claude 3.7 Sonnet (Bedrock)',
    description: 'Claude 3.7 Sonnet via AWS Bedrock',
    supportsVision: true,
    provider: 'amazon-bedrock-anthropic',
    tier: 'standard',
  },
  {
    id: 'amazon-bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0',
    label: 'Claude 3.5 Sonnet (Bedrock)',
    description: 'Claude 3.5 Sonnet v2 via AWS Bedrock',
    supportsVision: true,
    provider: 'amazon-bedrock-anthropic',
    tier: 'standard',
  },
  {
    id: 'amazon-bedrock/anthropic.claude-3-opus-20240229-v1:0',
    label: 'Claude 3 Opus (Bedrock)',
    description: 'Claude 3 Opus via AWS Bedrock',
    supportsVision: true,
    provider: 'amazon-bedrock-anthropic',
    tier: 'premium',
  },

  // Amazon Bedrock - DeepSeek Models
  {
    id: 'amazon-bedrock/deepseek.r1-v1:0',
    label: 'DeepSeek R1 (Bedrock)',
    description: 'DeepSeek R1 reasoning model via AWS Bedrock - excellent for coding',
    supportsVision: false,
    provider: 'amazon-bedrock-deepseek',
    tier: 'premium',
  },
  {
    id: 'amazon-bedrock/deepseek.v3-v1:0',
    label: 'DeepSeek V3 (Bedrock)',
    description: 'DeepSeek V3 via AWS Bedrock',
    supportsVision: false,
    provider: 'amazon-bedrock-deepseek',
    tier: 'standard',
  },

  // Amazon Bedrock - Amazon Nova Models
  {
    id: 'amazon-bedrock/amazon.nova-premier-v1:0',
    label: 'Amazon Nova Premier (Bedrock)',
    description: 'Amazon Nova Premier - most capable Nova model',
    supportsVision: true,
    provider: 'amazon-bedrock-amazon',
    tier: 'premium',
  },
  {
    id: 'amazon-bedrock/amazon.nova-pro-v1:0',
    label: 'Amazon Nova Pro (Bedrock)',
    description: 'Amazon Nova Pro - balanced performance',
    supportsVision: true,
    provider: 'amazon-bedrock-amazon',
    tier: 'standard',
  },
  {
    id: 'amazon-bedrock/amazon.nova-lite-v1:0',
    label: 'Amazon Nova Lite (Bedrock)',
    description: 'Amazon Nova Lite - fast and efficient',
    supportsVision: true,
    provider: 'amazon-bedrock-amazon',
    tier: 'standard',
  },

  // Amazon Bedrock - Meta Llama Models
  {
    id: 'amazon-bedrock/meta.llama4-maverick-17b-instruct-v1:0',
    label: 'Llama 4 Maverick 17B (Bedrock)',
    description: 'Meta Llama 4 Maverick via AWS Bedrock',
    supportsVision: false,
    provider: 'amazon-bedrock-meta',
    tier: 'standard',
  },
  {
    id: 'amazon-bedrock/meta.llama3-3-70b-instruct-v1:0',
    label: 'Llama 3.3 70B (Bedrock)',
    description: 'Meta Llama 3.3 70B via AWS Bedrock',
    supportsVision: false,
    provider: 'amazon-bedrock-meta',
    tier: 'standard',
  },

  // Amazon Bedrock - Mistral Models
  {
    id: 'amazon-bedrock/mistral.mistral-large-2402-v1:0',
    label: 'Mistral Large (Bedrock)',
    description: 'Mistral Large via AWS Bedrock',
    supportsVision: false,
    provider: 'amazon-bedrock-mistral',
    tier: 'standard',
  },

  // Amazon Bedrock - Qwen Models
  {
    id: 'amazon-bedrock/qwen.qwen3-coder-480b-a35b-v1:0',
    label: 'Qwen3 Coder 480B (Bedrock)',
    description: 'Qwen3 Coder 480B via AWS Bedrock - excellent for coding',
    supportsVision: false,
    provider: 'amazon-bedrock-qwen',
    tier: 'premium',
  },
  {
    id: 'amazon-bedrock/qwen.qwen3-235b-a22b-2507-v1:0',
    label: 'Qwen3 235B (Bedrock)',
    description: 'Qwen3 235B via AWS Bedrock',
    supportsVision: false,
    provider: 'amazon-bedrock-qwen',
    tier: 'premium',
  },
];

/**
 * Complete model configuration map indexed by model ID
 */
export const OPENCODE_MODEL_CONFIG_MAP: Record<OpencodeModelId, OpencodeModelConfig> =
  OPENCODE_MODELS.reduce(
    (acc, config) => {
      acc[config.id] = config;
      return acc;
    },
    {} as Record<OpencodeModelId, OpencodeModelConfig>
  );

/**
 * Default OpenCode model - Claude Sonnet 4.5 via Bedrock
 */
export const DEFAULT_OPENCODE_MODEL: OpencodeModelId =
  'amazon-bedrock/anthropic.claude-sonnet-4-5-20250929-v1:0';

/**
 * Helper: Get display name for model
 */
export function getOpencodeModelLabel(modelId: OpencodeModelId): string {
  return OPENCODE_MODEL_CONFIG_MAP[modelId]?.label ?? modelId;
}

/**
 * Helper: Get all OpenCode model IDs
 */
export function getAllOpencodeModelIds(): OpencodeModelId[] {
  return OPENCODE_MODELS.map((config) => config.id);
}

/**
 * Helper: Check if OpenCode model supports vision
 */
export function opencodeModelSupportsVision(modelId: OpencodeModelId): boolean {
  return OPENCODE_MODEL_CONFIG_MAP[modelId]?.supportsVision ?? false;
}

/**
 * Helper: Get the provider for a model
 */
export function getOpencodeModelProvider(modelId: OpencodeModelId): OpencodeProvider {
  return OPENCODE_MODEL_CONFIG_MAP[modelId]?.provider ?? 'opencode';
}

/**
 * Helper: Resolve an alias or partial model ID to a full model ID
 */
export function resolveOpencodeModelId(input: string): OpencodeModelId | undefined {
  // Check if it's already a valid model ID
  if (OPENCODE_MODEL_CONFIG_MAP[input as OpencodeModelId]) {
    return input as OpencodeModelId;
  }

  // Check alias map
  const normalized = input.toLowerCase();
  return OPENCODE_MODEL_MAP[normalized];
}

/**
 * Helper: Check if a string is a valid OpenCode model ID
 */
export function isOpencodeModelId(value: string): value is OpencodeModelId {
  return value in OPENCODE_MODEL_CONFIG_MAP;
}

/**
 * Helper: Get models filtered by provider
 */
export function getOpencodeModelsByProvider(provider: OpencodeProvider): OpencodeModelConfig[] {
  return OPENCODE_MODELS.filter((config) => config.provider === provider);
}

/**
 * Helper: Get models filtered by tier
 */
export function getOpencodeModelsByTier(
  tier: 'free' | 'standard' | 'premium'
): OpencodeModelConfig[] {
  return OPENCODE_MODELS.filter((config) => config.tier === tier);
}

/**
 * Helper: Get free tier models
 */
export function getOpencodeFreeModels(): OpencodeModelConfig[] {
  return getOpencodeModelsByTier('free');
}
