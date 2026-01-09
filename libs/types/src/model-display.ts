/**
 * Model Display Constants - UI metadata for AI models
 *
 * Provides display labels, descriptions, and metadata for AI models
 * and thinking levels used throughout the application UI.
 */

import type { ModelAlias, ThinkingLevel, ModelProvider } from './settings.js';
import type { ReasoningEffort } from './provider.js';
import type { CursorModelId } from './cursor-models.js';
import type { AgentModel, CodexModelId } from './model.js';
import { CODEX_MODEL_MAP } from './model.js';

/**
 * ModelOption - Display metadata for a model option in the UI
 */
export interface ModelOption {
  /** Model identifier (supports both Claude and Cursor models) */
  id: ModelAlias | CursorModelId;
  /** Display name shown to user */
  label: string;
  /** Descriptive text explaining model capabilities */
  description: string;
  /** Optional badge text (e.g., "Speed", "Balanced", "Premium") */
  badge?: string;
  /** AI provider (supports 'claude' and 'cursor') */
  provider: ModelProvider;
}

/**
 * ThinkingLevelOption - Display metadata for thinking level selection
 */
export interface ThinkingLevelOption {
  /** Thinking level identifier */
  id: ThinkingLevel;
  /** Display label */
  label: string;
}

/**
 * Claude model options with full metadata for UI display
 *
 * Ordered from fastest/cheapest (Haiku) to most capable (Opus).
 */
export const CLAUDE_MODELS: ModelOption[] = [
  {
    id: 'haiku',
    label: 'Claude Haiku',
    description: 'Fast and efficient for simple tasks.',
    badge: 'Speed',
    provider: 'claude',
  },
  {
    id: 'sonnet',
    label: 'Claude Sonnet',
    description: 'Balanced performance with strong reasoning.',
    badge: 'Balanced',
    provider: 'claude',
  },
  {
    id: 'opus',
    label: 'Claude Opus',
    description: 'Most capable model for complex work.',
    badge: 'Premium',
    provider: 'claude',
  },
];

/**
 * Codex model options with full metadata for UI display
 * Official models from https://developers.openai.com/codex/models/
 */
export const CODEX_MODELS: (ModelOption & { hasReasoning?: boolean })[] = [
  {
    id: CODEX_MODEL_MAP.gpt52Codex,
    label: 'GPT-5.2-Codex',
    description: 'Most advanced agentic coding model for complex software engineering.',
    badge: 'Premium',
    provider: 'codex',
    hasReasoning: true,
  },
  {
    id: CODEX_MODEL_MAP.gpt51CodexMax,
    label: 'GPT-5.1-Codex-Max',
    description: 'Optimized for long-horizon, agentic coding tasks in Codex.',
    badge: 'Premium',
    provider: 'codex',
    hasReasoning: true,
  },
  {
    id: CODEX_MODEL_MAP.gpt51CodexMini,
    label: 'GPT-5.1-Codex-Mini',
    description: 'Smaller, more cost-effective version for faster workflows.',
    badge: 'Speed',
    provider: 'codex',
    hasReasoning: false,
  },
  {
    id: CODEX_MODEL_MAP.gpt52,
    label: 'GPT-5.2',
    description: 'Best general agentic model for tasks across industries and domains.',
    badge: 'Balanced',
    provider: 'codex',
    hasReasoning: true,
  },
  {
    id: CODEX_MODEL_MAP.gpt51,
    label: 'GPT-5.1',
    description: 'Great for coding and agentic tasks across domains.',
    badge: 'Balanced',
    provider: 'codex',
    hasReasoning: true,
  },
];

/**
 * Thinking level options with display labels
 *
 * Ordered from least to most intensive reasoning.
 */
export const THINKING_LEVELS: ThinkingLevelOption[] = [
  { id: 'none', label: 'None' },
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
  { id: 'ultrathink', label: 'Ultrathink' },
];

/**
 * Map of thinking levels to short display labels
 *
 * Used for compact UI elements like badges or dropdowns.
 */
export const THINKING_LEVEL_LABELS: Record<ThinkingLevel, string> = {
  none: 'None',
  low: 'Low',
  medium: 'Med',
  high: 'High',
  ultrathink: 'Ultra',
};

/**
 * ReasoningEffortOption - Display metadata for reasoning effort selection (Codex/OpenAI)
 */
export interface ReasoningEffortOption {
  /** Reasoning effort identifier */
  id: ReasoningEffort;
  /** Display label */
  label: string;
  /** Description of what this level does */
  description: string;
}

/**
 * Reasoning effort options for Codex/OpenAI models
 * All models support reasoning effort levels
 */
export const REASONING_EFFORT_LEVELS: ReasoningEffortOption[] = [
  { id: 'none', label: 'None', description: 'No reasoning tokens (GPT-5.1 models only)' },
  { id: 'minimal', label: 'Minimal', description: 'Very quick reasoning' },
  { id: 'low', label: 'Low', description: 'Quick responses for simpler queries' },
  { id: 'medium', label: 'Medium', description: 'Balance between depth and speed (default)' },
  { id: 'high', label: 'High', description: 'Maximizes reasoning depth for critical tasks' },
  { id: 'xhigh', label: 'XHigh', description: 'Highest level for gpt-5.1-codex-max and newer' },
];

/**
 * Map of reasoning effort levels to short display labels
 */
export const REASONING_EFFORT_LABELS: Record<ReasoningEffort, string> = {
  none: 'None',
  minimal: 'Min',
  low: 'Low',
  medium: 'Med',
  high: 'High',
  xhigh: 'XHigh',
};

/**
 * Get display name for a model
 *
 * @param model - Model identifier or full model string
 * @returns Human-readable model name
 *
 * @example
 * ```typescript
 * getModelDisplayName("haiku");  // "Claude Haiku"
 * getModelDisplayName("sonnet"); // "Claude Sonnet"
 * getModelDisplayName("claude-opus-4-20250514"); // "claude-opus-4-20250514"
 * ```
 */
export function getModelDisplayName(model: ModelAlias | string): string {
  const displayNames: Record<string, string> = {
    haiku: 'Claude Haiku',
    sonnet: 'Claude Sonnet',
    opus: 'Claude Opus',
    [CODEX_MODEL_MAP.gpt52Codex]: 'GPT-5.2-Codex',
    [CODEX_MODEL_MAP.gpt51CodexMax]: 'GPT-5.1-Codex-Max',
    [CODEX_MODEL_MAP.gpt51CodexMini]: 'GPT-5.1-Codex-Mini',
    [CODEX_MODEL_MAP.gpt52]: 'GPT-5.2',
    [CODEX_MODEL_MAP.gpt51]: 'GPT-5.1',
  };
  return displayNames[model] || model;
}
