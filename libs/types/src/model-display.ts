/**
 * Model Display Constants - UI metadata for AI models
 *
 * Provides display labels, descriptions, and metadata for AI models
 * and thinking levels used throughout the application UI.
 */

import type { ModelAlias, AgentModel, ThinkingLevel, ModelProvider } from './settings.js';
import type { CursorModelId } from './cursor-models.js';
import type { CodexModelId } from './model.js';
import { CODEX_MODEL_MAP } from './model.js';

/**
 * ModelOption - Display metadata for a model option in the UI
 */
export interface ModelOption {
  /** Model identifier (supports Claude, Cursor, and Codex models) */
  id: ModelAlias | CursorModelId | CodexModelId;
  /** Display name shown to user */
  label: string;
  /** Descriptive text explaining model capabilities */
  description: string;
  /** Optional badge text (e.g., "Speed", "Balanced", "Premium") */
  badge?: string;
  /** AI provider (supports 'claude', 'cursor', and 'codex') */
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
 */
export const CODEX_MODELS: ModelOption[] = [
  {
    id: CODEX_MODEL_MAP.gpt52,
    label: 'Codex GPT-5.2',
    description: 'Latest Codex model with strong reasoning and tools.',
    badge: 'Premium',
    provider: 'codex',
  },
  {
    id: CODEX_MODEL_MAP.gpt51CodexMax,
    label: 'Codex GPT-5.1 Max',
    description: 'Maximum capability Codex model.',
    badge: 'Premium',
    provider: 'codex',
  },
  {
    id: CODEX_MODEL_MAP.gpt51Codex,
    label: 'Codex GPT-5.1',
    description: 'Balanced Codex model for general coding tasks.',
    badge: 'Balanced',
    provider: 'codex',
  },
  {
    id: CODEX_MODEL_MAP.gpt51CodexMini,
    label: 'Codex GPT-5.1 Mini',
    description: 'Lightweight Codex model for fast edits.',
    badge: 'Speed',
    provider: 'codex',
  },
  {
    id: CODEX_MODEL_MAP.gpt51,
    label: 'GPT-5.1',
    description: 'General-purpose GPT model with strong tools support.',
    badge: 'Standard',
    provider: 'codex',
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
    [CODEX_MODEL_MAP.gpt52]: 'Codex GPT-5.2',
    [CODEX_MODEL_MAP.gpt51CodexMax]: 'Codex GPT-5.1 Max',
    [CODEX_MODEL_MAP.gpt51Codex]: 'Codex GPT-5.1',
    [CODEX_MODEL_MAP.gpt51CodexMini]: 'Codex GPT-5.1 Mini',
    [CODEX_MODEL_MAP.gpt51]: 'GPT-5.1',
  };
  return displayNames[model] || model;
}
