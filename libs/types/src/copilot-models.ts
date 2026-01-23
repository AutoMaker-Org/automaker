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
  // GPT-4 models (commonly available via Copilot)
  'copilot-gpt-4o': {
    label: 'GPT-4o',
    description: 'OpenAI GPT-4o via GitHub Copilot. Fast and capable multimodal model.',
    supportsVision: true,
    supportsTools: true,
    contextWindow: 128000,
  },
  'copilot-gpt-4o-mini': {
    label: 'GPT-4o Mini',
    description: 'Smaller, faster GPT-4o variant for quick tasks.',
    supportsVision: true,
    supportsTools: true,
    contextWindow: 128000,
  },
  'copilot-gpt-4-turbo': {
    label: 'GPT-4 Turbo',
    description: 'GPT-4 Turbo with vision capabilities.',
    supportsVision: true,
    supportsTools: true,
    contextWindow: 128000,
  },
  // Claude models (available in Copilot Enterprise)
  'copilot-claude-3.5-sonnet': {
    label: 'Claude 3.5 Sonnet',
    description: 'Anthropic Claude 3.5 Sonnet via Copilot Enterprise.',
    supportsVision: true,
    supportsTools: true,
    contextWindow: 200000,
  },
  'copilot-claude-3-opus': {
    label: 'Claude 3 Opus',
    description: 'Anthropic Claude 3 Opus via Copilot Enterprise.',
    supportsVision: true,
    supportsTools: true,
    contextWindow: 200000,
  },
  // o1 series reasoning models
  'copilot-o1': {
    label: 'o1',
    description: 'OpenAI o1 reasoning model for complex tasks.',
    supportsVision: false,
    supportsTools: true,
    contextWindow: 200000,
  },
  'copilot-o1-mini': {
    label: 'o1 Mini',
    description: 'Faster o1 variant for reasoning tasks.',
    supportsVision: false,
    supportsTools: true,
    contextWindow: 128000,
  },
  'copilot-o1-preview': {
    label: 'o1 Preview',
    description: 'Preview version of o1 reasoning model.',
    supportsVision: false,
    supportsTools: true,
    contextWindow: 128000,
  },
  // o3 series (newest reasoning models)
  'copilot-o3': {
    label: 'o3',
    description: 'OpenAI o3 advanced reasoning model.',
    supportsVision: false,
    supportsTools: true,
    contextWindow: 200000,
  },
  'copilot-o3-mini': {
    label: 'o3 Mini',
    description: 'Faster o3 variant for reasoning tasks.',
    supportsVision: false,
    supportsTools: true,
    contextWindow: 128000,
  },
  // Gemini models (if available via Copilot)
  'copilot-gemini-2.0-flash': {
    label: 'Gemini 2.0 Flash',
    description: 'Google Gemini 2.0 Flash via Copilot.',
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
export const DEFAULT_COPILOT_MODEL: CopilotModelId = 'copilot-gpt-4o';

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
