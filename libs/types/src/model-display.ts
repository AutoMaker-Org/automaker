/**
 * Model Display Constants - UI metadata for AI models
 *
 * Provides display labels, descriptions, and metadata for AI models
 * and thinking levels used throughout the application UI.
 */

import type { ModelAlias, ThinkingLevel, ModelProvider } from './settings.js';
import type { CursorModelId } from './cursor-models.js';

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
  };
  return displayNames[model] || model;
}
