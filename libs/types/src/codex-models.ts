/**
 * Codex CLI Model IDs
 * Based on OpenAI Codex CLI official models
 * Reference: https://developers.openai.com/codex/models/
 *
 * IMPORTANT: All Codex models use 'codex-' prefix to distinguish from Cursor CLI models
 */
export type CodexModelId =
  | 'codex-gpt-5.3-codex'
  | 'codex-gpt-5.2-codex'
  | 'codex-gpt-5.1-codex-max'
  | 'codex-gpt-5.1-codex-mini'
  | 'codex-gpt-5.2'
  | 'codex-gpt-5.1';

/**
 * Codex model metadata
 */
export interface CodexModelConfig {
  id: CodexModelId;
  label: string;
  description: string;
  hasThinking: boolean;
  /** Whether the model supports vision/image inputs */
  supportsVision: boolean;
}

/**
 * Complete model map for Codex CLI
 * All keys use 'codex-' prefix to distinguish from Cursor CLI models
 */
export const CODEX_MODEL_CONFIG_MAP: Record<CodexModelId, CodexModelConfig> = {
  'codex-gpt-5.3-codex': {
    id: 'codex-gpt-5.3-codex',
    label: 'GPT-5.3-Codex',
    description: 'Latest frontier agentic coding model',
    hasThinking: true,
    supportsVision: true,
  },
  'codex-gpt-5.2-codex': {
    id: 'codex-gpt-5.2-codex',
    label: 'GPT-5.2-Codex',
    description: 'Frontier agentic coding model',
    hasThinking: true,
    supportsVision: true,
  },
  'codex-gpt-5.1-codex-max': {
    id: 'codex-gpt-5.1-codex-max',
    label: 'GPT-5.1-Codex-Max',
    description: 'Codex-optimized flagship for deep and fast reasoning',
    hasThinking: true,
    supportsVision: true,
  },
  'codex-gpt-5.1-codex-mini': {
    id: 'codex-gpt-5.1-codex-mini',
    label: 'GPT-5.1-Codex-Mini',
    description: 'Optimized for codex. Cheaper, faster, but less capable',
    hasThinking: false,
    supportsVision: true,
  },
  'codex-gpt-5.2': {
    id: 'codex-gpt-5.2',
    label: 'GPT-5.2 (Codex)',
    description: 'Latest frontier model with improvements across knowledge, reasoning and coding',
    hasThinking: true,
    supportsVision: true,
  },
  'codex-gpt-5.1': {
    id: 'codex-gpt-5.1',
    label: 'GPT-5.1 (Codex)',
    description: 'Great for coding and agentic tasks across domains via Codex',
    hasThinking: true,
    supportsVision: true,
  },
};

/**
 * Helper: Check if model has thinking capability
 */
export function codexModelHasThinking(modelId: CodexModelId): boolean {
  return CODEX_MODEL_CONFIG_MAP[modelId]?.hasThinking ?? false;
}

/**
 * Helper: Get display name for model
 */
export function getCodexModelLabel(modelId: CodexModelId): string {
  return CODEX_MODEL_CONFIG_MAP[modelId]?.label ?? modelId;
}

/**
 * Helper: Get all Codex model IDs
 */
export function getAllCodexModelIds(): CodexModelId[] {
  return Object.keys(CODEX_MODEL_CONFIG_MAP) as CodexModelId[];
}

/**
 * Helper: Check if Codex model supports vision
 */
export function codexModelSupportsVision(modelId: CodexModelId): boolean {
  return CODEX_MODEL_CONFIG_MAP[modelId]?.supportsVision ?? true;
}
