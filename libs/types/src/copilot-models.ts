/**
 * GitHub Copilot CLI Model Definitions
 *
 * Defines available models for GitHub Copilot CLI integration.
 * Based on https://github.com/github/copilot
 *
 * The CLI provides runtime model discovery, but we define common models
 * for UI consistency and offline use.
 */

/**
 * Copilot model configuration
 */
export interface CopilotModelConfig {
  label: string;
  description: string;
  supportsVision: boolean;
  supportsTools: boolean;
  contextWindow?: number;
}

/**
 * Available Copilot models via the GitHub Copilot CLI
 *
 * Model IDs use 'copilot-' prefix for consistent provider routing.
 * When passed to the CLI, the prefix is stripped.
 *
 * Note: Actual available models depend on the user's Copilot subscription
 * and can be discovered at runtime via the CLI's listModels() method.
 */
export const COPILOT_MODEL_MAP = {
  // Claude models (Anthropic via GitHub Copilot)
  'copilot-claude-sonnet-4.5': {
    label: 'Claude Sonnet 4.5',
    description: 'Anthropic Claude Sonnet 4.5 via GitHub Copilot.',
    supportsVision: true,
    supportsTools: true,
    contextWindow: 200000,
  },
  'copilot-claude-haiku-4.5': {
    label: 'Claude Haiku 4.5',
    description: 'Fast and efficient Claude Haiku 4.5 via GitHub Copilot.',
    supportsVision: true,
    supportsTools: true,
    contextWindow: 200000,
  },
  'copilot-claude-opus-4.5': {
    label: 'Claude Opus 4.5',
    description: 'Most capable Claude Opus 4.5 via GitHub Copilot.',
    supportsVision: true,
    supportsTools: true,
    contextWindow: 200000,
  },
  'copilot-claude-sonnet-4': {
    label: 'Claude Sonnet 4',
    description: 'Anthropic Claude Sonnet 4 via GitHub Copilot.',
    supportsVision: true,
    supportsTools: true,
    contextWindow: 200000,
  },
  // GPT-5 series (OpenAI via GitHub Copilot)
  'copilot-gpt-5.2-codex': {
    label: 'GPT-5.2 Codex',
    description: 'OpenAI GPT-5.2 Codex for advanced coding tasks.',
    supportsVision: true,
    supportsTools: true,
    contextWindow: 128000,
  },
  'copilot-gpt-5.1-codex-max': {
    label: 'GPT-5.1 Codex Max',
    description: 'Maximum capability GPT-5.1 Codex model.',
    supportsVision: true,
    supportsTools: true,
    contextWindow: 128000,
  },
  'copilot-gpt-5.1-codex': {
    label: 'GPT-5.1 Codex',
    description: 'OpenAI GPT-5.1 Codex for coding tasks.',
    supportsVision: true,
    supportsTools: true,
    contextWindow: 128000,
  },
  'copilot-gpt-5.2': {
    label: 'GPT-5.2',
    description: 'Latest OpenAI GPT-5.2 model.',
    supportsVision: true,
    supportsTools: true,
    contextWindow: 128000,
  },
  'copilot-gpt-5.1': {
    label: 'GPT-5.1',
    description: 'OpenAI GPT-5.1 model.',
    supportsVision: true,
    supportsTools: true,
    contextWindow: 128000,
  },
  'copilot-gpt-5': {
    label: 'GPT-5',
    description: 'OpenAI GPT-5 base model.',
    supportsVision: true,
    supportsTools: true,
    contextWindow: 128000,
  },
  'copilot-gpt-5.1-codex-mini': {
    label: 'GPT-5.1 Codex Mini',
    description: 'Fast and efficient GPT-5.1 Codex Mini.',
    supportsVision: true,
    supportsTools: true,
    contextWindow: 128000,
  },
  'copilot-gpt-5-mini': {
    label: 'GPT-5 Mini',
    description: 'Lightweight GPT-5 Mini model.',
    supportsVision: true,
    supportsTools: true,
    contextWindow: 128000,
  },
  'copilot-gpt-4.1': {
    label: 'GPT-4.1',
    description: 'OpenAI GPT-4.1 model.',
    supportsVision: true,
    supportsTools: true,
    contextWindow: 128000,
  },
  // Gemini models (Google via GitHub Copilot)
  'copilot-gemini-3-pro-preview': {
    label: 'Gemini 3 Pro Preview',
    description: 'Google Gemini 3 Pro Preview via GitHub Copilot.',
    supportsVision: true,
    supportsTools: true,
    contextWindow: 1000000,
  },
} as const satisfies Record<string, CopilotModelConfig>;

/**
 * Copilot model ID type (keys have copilot- prefix)
 */
export type CopilotModelId = keyof typeof COPILOT_MODEL_MAP;

/**
 * Get all Copilot model IDs
 */
export function getAllCopilotModelIds(): CopilotModelId[] {
  return Object.keys(COPILOT_MODEL_MAP) as CopilotModelId[];
}

/**
 * Default Copilot model
 */
export const DEFAULT_COPILOT_MODEL: CopilotModelId = 'copilot-claude-sonnet-4.5';

/**
 * GitHub Copilot authentication status
 */
export interface CopilotAuthStatus {
  authenticated: boolean;
  method: 'oauth' | 'cli' | 'none';
  authType?: string;
  login?: string;
  host?: string;
  statusMessage?: string;
  error?: string;
}

/**
 * Copilot CLI status (used for installation detection)
 */
export interface CopilotCliStatus {
  installed: boolean;
  version?: string;
  path?: string;
  auth?: CopilotAuthStatus;
  error?: string;
}

/**
 * Copilot model info from SDK runtime discovery
 */
export interface CopilotRuntimeModel {
  id: string;
  name: string;
  capabilities?: {
    supportsVision?: boolean;
    maxInputTokens?: number;
    maxOutputTokens?: number;
  };
  policy?: {
    state: 'enabled' | 'disabled' | 'unconfigured';
    terms?: string;
  };
  billing?: {
    multiplier: number;
  };
}
