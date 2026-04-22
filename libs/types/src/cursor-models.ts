/**
 * Cursor CLI Model IDs
 * Reference: https://cursor.com/docs
 *
 * All Cursor model IDs use 'cursor-' prefix for consistent provider routing.
 * This prevents naming collisions (e.g., cursor-gpt-5.2-codex vs codex-gpt-5.2-codex).
 */
export type CursorModelId =
  | 'cursor-auto' // Auto-select best model
  | 'cursor-composer-2' // Cursor Composer 2 agent model
  | 'cursor-composer-2-fast' // Cursor Composer 2 fast agent model
  | 'cursor-sonnet-4.6' // Claude Sonnet 4.6
  | 'cursor-sonnet-4.6-thinking' // Claude Sonnet 4.6 with extended thinking
  | 'cursor-sonnet-4.5' // Claude Sonnet 4.5
  | 'cursor-sonnet-4.5-thinking' // Claude Sonnet 4.5 with extended thinking
  | 'cursor-opus-4.5' // Claude Opus 4.5
  | 'cursor-opus-4.5-thinking' // Claude Opus 4.5 with extended thinking
  | 'cursor-opus-4.1' // Claude Opus 4.1
  | 'cursor-gemini-3-pro' // Gemini 3 Pro
  | 'cursor-gemini-3-flash' // Gemini 3 Flash
  | 'cursor-gpt-5.2' // GPT-5.2 via Cursor
  | 'cursor-gpt-5.1' // GPT-5.1 via Cursor
  | 'cursor-gpt-5.2-high' // GPT-5.2 High via Cursor
  | 'cursor-gpt-5.1-high' // GPT-5.1 High via Cursor
  | 'cursor-gpt-5.1-codex' // GPT-5.1 Codex via Cursor
  | 'cursor-gpt-5.1-codex-high' // GPT-5.1 Codex High via Cursor
  | 'cursor-gpt-5.1-codex-max' // GPT-5.1 Codex Max via Cursor
  | 'cursor-gpt-5.1-codex-max-high' // GPT-5.1 Codex Max High via Cursor
  | 'cursor-gpt-5.2-codex' // GPT-5.2 Codex via Cursor
  | 'cursor-gpt-5.2-codex-high' // GPT-5.2 Codex High via Cursor
  | 'cursor-gpt-5.2-codex-max' // GPT-5.2 Codex Max via Cursor
  | 'cursor-gpt-5.2-codex-max-high' // GPT-5.2 Codex Max High via Cursor
  | 'cursor-grok' // Grok
  | 'cursor-kimi-k2.5'; // Kimi K2.5 via Cursor

/**
 * Legacy Cursor model IDs (without prefix) for migration support
 */
export type LegacyCursorModelId =
  | 'auto'
  /** @deprecated Composer 1 removed; migrates to cursor-composer-2 */
  | 'composer-1'
  | 'composer-2'
  | 'composer-2-fast'
  | 'kimi-k2.5'
  | 'sonnet-4.6'
  | 'sonnet-4.6-thinking'
  | 'sonnet-4.5'
  | 'sonnet-4.5-thinking'
  | 'opus-4.5'
  | 'opus-4.5-thinking'
  | 'opus-4.1'
  | 'gemini-3-pro'
  | 'gemini-3-flash'
  | 'grok';

/**
 * Cursor model metadata
 */
export interface CursorModelConfig {
  id: CursorModelId;
  label: string;
  description: string;
  hasThinking: boolean;
  /** Whether the model supports vision/image inputs (currently not supported by Cursor CLI) */
  supportsVision: boolean;
}

/**
 * Complete model map for Cursor CLI
 * All keys use 'cursor-' prefix for consistent provider routing.
 */
export const CURSOR_MODEL_MAP: Record<CursorModelId, CursorModelConfig> = {
  'cursor-auto': {
    id: 'cursor-auto',
    label: 'Auto (Recommended)',
    description: 'Automatically selects the best model for each task',
    hasThinking: false,
    supportsVision: false, // Vision not yet supported by Cursor CLI
  },
  'cursor-composer-2': {
    id: 'cursor-composer-2',
    label: 'Composer 2',
    description: 'Cursor Composer 2 agent model optimized for thinking and writing code',
    hasThinking: true,
    supportsVision: false, // Cursor CLI does not pass images; matches other Cursor models
  },
  'cursor-composer-2-fast': {
    id: 'cursor-composer-2-fast',
    label: 'Composer 2 Fast',
    description:
      'Cursor Composer 2 fast agent model optimized for thinking and writing code, faster',
    hasThinking: true,
    supportsVision: false, // Cursor CLI does not pass images; matches other Cursor models
  },
  'cursor-sonnet-4.6': {
    id: 'cursor-sonnet-4.6',
    label: 'Claude Sonnet 4.6',
    description: 'Anthropic Claude Sonnet 4.6 via Cursor',
    hasThinking: false,
    supportsVision: false, // Model supports vision but Cursor CLI doesn't pass images
  },
  'cursor-sonnet-4.6-thinking': {
    id: 'cursor-sonnet-4.6-thinking',
    label: 'Claude Sonnet 4.6 (Thinking)',
    description: 'Claude Sonnet 4.6 with extended thinking enabled',
    hasThinking: true,
    supportsVision: false,
  },
  'cursor-sonnet-4.5': {
    id: 'cursor-sonnet-4.5',
    label: 'Claude Sonnet 4.5',
    description: 'Anthropic Claude Sonnet 4.5 via Cursor',
    hasThinking: false,
    supportsVision: false, // Model supports vision but Cursor CLI doesn't pass images
  },
  'cursor-sonnet-4.5-thinking': {
    id: 'cursor-sonnet-4.5-thinking',
    label: 'Claude Sonnet 4.5 (Thinking)',
    description: 'Claude Sonnet 4.5 with extended thinking enabled',
    hasThinking: true,
    supportsVision: false,
  },
  'cursor-opus-4.5': {
    id: 'cursor-opus-4.5',
    label: 'Claude Opus 4.5',
    description: 'Anthropic Claude Opus 4.5 via Cursor',
    hasThinking: false,
    supportsVision: false,
  },
  'cursor-opus-4.5-thinking': {
    id: 'cursor-opus-4.5-thinking',
    label: 'Claude Opus 4.5 (Thinking)',
    description: 'Claude Opus 4.5 with extended thinking enabled',
    hasThinking: true,
    supportsVision: false,
  },
  'cursor-opus-4.1': {
    id: 'cursor-opus-4.1',
    label: 'Claude Opus 4.1',
    description: 'Anthropic Claude Opus 4.1 via Cursor',
    hasThinking: false,
    supportsVision: false,
  },
  'cursor-gemini-3-pro': {
    id: 'cursor-gemini-3-pro',
    label: 'Gemini 3 Pro',
    description: 'Google Gemini 3 Pro via Cursor',
    hasThinking: false,
    supportsVision: false,
  },
  'cursor-gemini-3-flash': {
    id: 'cursor-gemini-3-flash',
    label: 'Gemini 3 Flash',
    description: 'Google Gemini 3 Flash (faster)',
    hasThinking: false,
    supportsVision: false,
  },
  'cursor-gpt-5.2': {
    id: 'cursor-gpt-5.2',
    label: 'GPT-5.2',
    description: 'OpenAI GPT-5.2 via Cursor',
    hasThinking: false,
    supportsVision: false,
  },
  'cursor-gpt-5.1': {
    id: 'cursor-gpt-5.1',
    label: 'GPT-5.1',
    description: 'OpenAI GPT-5.1 via Cursor',
    hasThinking: false,
    supportsVision: false,
  },
  'cursor-gpt-5.2-high': {
    id: 'cursor-gpt-5.2-high',
    label: 'GPT-5.2 High',
    description: 'OpenAI GPT-5.2 with high compute',
    hasThinking: false,
    supportsVision: false,
  },
  'cursor-gpt-5.1-high': {
    id: 'cursor-gpt-5.1-high',
    label: 'GPT-5.1 High',
    description: 'OpenAI GPT-5.1 with high compute',
    hasThinking: false,
    supportsVision: false,
  },
  'cursor-gpt-5.1-codex': {
    id: 'cursor-gpt-5.1-codex',
    label: 'GPT-5.1 Codex',
    description: 'OpenAI GPT-5.1 Codex for code generation',
    hasThinking: false,
    supportsVision: false,
  },
  'cursor-gpt-5.1-codex-high': {
    id: 'cursor-gpt-5.1-codex-high',
    label: 'GPT-5.1 Codex High',
    description: 'OpenAI GPT-5.1 Codex with high compute',
    hasThinking: false,
    supportsVision: false,
  },
  'cursor-gpt-5.1-codex-max': {
    id: 'cursor-gpt-5.1-codex-max',
    label: 'GPT-5.1 Codex Max',
    description: 'OpenAI GPT-5.1 Codex Max capacity',
    hasThinking: false,
    supportsVision: false,
  },
  'cursor-gpt-5.1-codex-max-high': {
    id: 'cursor-gpt-5.1-codex-max-high',
    label: 'GPT-5.1 Codex Max High',
    description: 'OpenAI GPT-5.1 Codex Max with high compute',
    hasThinking: false,
    supportsVision: false,
  },
  'cursor-gpt-5.2-codex': {
    id: 'cursor-gpt-5.2-codex',
    label: 'GPT-5.2 Codex',
    description: 'OpenAI GPT-5.2 Codex for code generation',
    hasThinking: false,
    supportsVision: false,
  },
  'cursor-gpt-5.2-codex-high': {
    id: 'cursor-gpt-5.2-codex-high',
    label: 'GPT-5.2 Codex High',
    description: 'OpenAI GPT-5.2 Codex with high compute',
    hasThinking: false,
    supportsVision: false,
  },
  'cursor-gpt-5.2-codex-max': {
    id: 'cursor-gpt-5.2-codex-max',
    label: 'GPT-5.2 Codex Max',
    description: 'OpenAI GPT-5.2 Codex Max capacity',
    hasThinking: false,
    supportsVision: false,
  },
  'cursor-gpt-5.2-codex-max-high': {
    id: 'cursor-gpt-5.2-codex-max-high',
    label: 'GPT-5.2 Codex Max High',
    description: 'OpenAI GPT-5.2 Codex Max with high compute',
    hasThinking: false,
    supportsVision: false,
  },
  'cursor-grok': {
    id: 'cursor-grok',
    label: 'Grok',
    description: 'xAI Grok via Cursor',
    hasThinking: false,
    supportsVision: false,
  },
  'cursor-kimi-k2.5': {
    id: 'cursor-kimi-k2.5',
    label: 'Kimi K2.5',
    description: 'Kimi K2.5 via Cursor',
    hasThinking: true,
    supportsVision: false, // Cursor CLI does not pass images; matches other Cursor models
  },
};

/**
 * Map from legacy model IDs to canonical prefixed IDs
 */
export const LEGACY_CURSOR_MODEL_MAP: Record<LegacyCursorModelId, CursorModelId> = {
  auto: 'cursor-auto',
  'composer-1': 'cursor-composer-2',
  'composer-2': 'cursor-composer-2',
  'composer-2-fast': 'cursor-composer-2-fast',
  'kimi-k2.5': 'cursor-kimi-k2.5',
  'sonnet-4.6': 'cursor-sonnet-4.6',
  'sonnet-4.6-thinking': 'cursor-sonnet-4.6-thinking',
  'sonnet-4.5': 'cursor-sonnet-4.5',
  'sonnet-4.5-thinking': 'cursor-sonnet-4.5-thinking',
  'opus-4.5': 'cursor-opus-4.5',
  'opus-4.5-thinking': 'cursor-opus-4.5-thinking',
  'opus-4.1': 'cursor-opus-4.1',
  'gemini-3-pro': 'cursor-gemini-3-pro',
  'gemini-3-flash': 'cursor-gemini-3-flash',
  grok: 'cursor-grok',
};

/**
 * Retired Cursor canonical IDs (older releases) → current replacement
 */
export const RETIRED_CURSOR_MODEL_MAP = {
  'cursor-composer-1': 'cursor-composer-2',
} as const satisfies Record<string, CursorModelId>;

/**
 * Helper: Check if model has thinking capability
 */
export function cursorModelHasThinking(modelId: CursorModelId): boolean {
  return CURSOR_MODEL_MAP[modelId]?.hasThinking ?? false;
}

/**
 * Helper: Get display name for model
 */
export function getCursorModelLabel(modelId: CursorModelId): string {
  return CURSOR_MODEL_MAP[modelId]?.label ?? modelId;
}

/**
 * Helper: Get all cursor model IDs
 */
export function getAllCursorModelIds(): CursorModelId[] {
  return Object.keys(CURSOR_MODEL_MAP) as CursorModelId[];
}

// ============================================================================
// Model Grouping System
// Groups related model variants (e.g., gpt-5.2 + gpt-5.2-high) for UI display
// ============================================================================

/**
 * Type of variant options available for grouped models
 */
export type VariantType = 'compute' | 'thinking' | 'capacity' | 'speed';

/**
 * A single variant option within a grouped model
 */
export interface ModelVariant {
  id: CursorModelId;
  label: string;
  description?: string;
  badge?: string;
}

/**
 * A grouped model that contains multiple variant options
 */
export interface GroupedModel {
  baseId: string;
  label: string;
  description: string;
  variantType: VariantType;
  variants: ModelVariant[];
}

/**
 * Configuration for grouping Cursor models with variants
 * All variant IDs use 'cursor-' prefix for consistent provider routing.
 */
export const CURSOR_MODEL_GROUPS: GroupedModel[] = [
  // GPT-5.2 group (compute levels)
  {
    baseId: 'cursor-gpt-5.2-group',
    label: 'GPT-5.2',
    description: 'OpenAI GPT-5.2 via Cursor',
    variantType: 'compute',
    variants: [
      { id: 'cursor-gpt-5.2', label: 'Standard', description: 'Default compute level' },
      {
        id: 'cursor-gpt-5.2-high',
        label: 'High',
        description: 'High compute level',
        badge: 'More tokens',
      },
    ],
  },
  // GPT-5.1 group (compute levels)
  {
    baseId: 'cursor-gpt-5.1-group',
    label: 'GPT-5.1',
    description: 'OpenAI GPT-5.1 via Cursor',
    variantType: 'compute',
    variants: [
      { id: 'cursor-gpt-5.1', label: 'Standard', description: 'Default compute level' },
      {
        id: 'cursor-gpt-5.1-high',
        label: 'High',
        description: 'High compute level',
        badge: 'More tokens',
      },
    ],
  },
  // GPT-5.1 Codex group (capacity + compute matrix)
  {
    baseId: 'cursor-gpt-5.1-codex-group',
    label: 'GPT-5.1 Codex',
    description: 'OpenAI GPT-5.1 Codex for code generation',
    variantType: 'capacity',
    variants: [
      { id: 'cursor-gpt-5.1-codex', label: 'Standard', description: 'Default capacity' },
      {
        id: 'cursor-gpt-5.1-codex-high',
        label: 'High',
        description: 'High compute',
        badge: 'Compute',
      },
      {
        id: 'cursor-gpt-5.1-codex-max',
        label: 'Max',
        description: 'Maximum capacity',
        badge: 'Capacity',
      },
      {
        id: 'cursor-gpt-5.1-codex-max-high',
        label: 'Max High',
        description: 'Max capacity + high compute',
        badge: 'Premium',
      },
    ],
  },
  // GPT-5.2 Codex group (capacity + compute matrix)
  {
    baseId: 'cursor-gpt-5.2-codex-group',
    label: 'GPT-5.2 Codex',
    description: 'OpenAI GPT-5.2 Codex for code generation',
    variantType: 'capacity',
    variants: [
      { id: 'cursor-gpt-5.2-codex', label: 'Standard', description: 'Default capacity' },
      {
        id: 'cursor-gpt-5.2-codex-high',
        label: 'High',
        description: 'High compute',
        badge: 'Compute',
      },
      {
        id: 'cursor-gpt-5.2-codex-max',
        label: 'Max',
        description: 'Maximum capacity',
        badge: 'Capacity',
      },
      {
        id: 'cursor-gpt-5.2-codex-max-high',
        label: 'Max High',
        description: 'Max capacity + high compute',
        badge: 'Premium',
      },
    ],
  },
  // Sonnet 4.6 group (thinking mode)
  {
    baseId: 'cursor-sonnet-4.6-group',
    label: 'Claude Sonnet 4.6',
    description: 'Anthropic Claude Sonnet 4.6 via Cursor',
    variantType: 'thinking',
    variants: [
      { id: 'cursor-sonnet-4.6', label: 'Standard', description: 'Fast responses' },
      {
        id: 'cursor-sonnet-4.6-thinking',
        label: 'Thinking',
        description: 'Extended reasoning',
        badge: 'Reasoning',
      },
    ],
  },
  // Sonnet 4.5 group (thinking mode)
  {
    baseId: 'cursor-sonnet-4.5-group',
    label: 'Claude Sonnet 4.5',
    description: 'Anthropic Claude Sonnet 4.5 via Cursor',
    variantType: 'thinking',
    variants: [
      { id: 'cursor-sonnet-4.5', label: 'Standard', description: 'Fast responses' },
      {
        id: 'cursor-sonnet-4.5-thinking',
        label: 'Thinking',
        description: 'Extended reasoning',
        badge: 'Reasoning',
      },
    ],
  },
  // Opus 4.5 group (thinking mode)
  {
    baseId: 'cursor-opus-4.5-group',
    label: 'Claude Opus 4.5',
    description: 'Anthropic Claude Opus 4.5 via Cursor',
    variantType: 'thinking',
    variants: [
      { id: 'cursor-opus-4.5', label: 'Standard', description: 'Fast responses' },
      {
        id: 'cursor-opus-4.5-thinking',
        label: 'Thinking',
        description: 'Extended reasoning',
        badge: 'Reasoning',
      },
    ],
  },
  // Composer 2 group (Standard vs faster responses)
  {
    baseId: 'cursor-composer-2-group',
    label: 'Composer 2',
    description: 'Cursor Composer 2 agent model optimized for thinking and writing code',
    variantType: 'speed',
    variants: [
      { id: 'cursor-composer-2', label: 'Standard', description: 'Standard responses' },
      { id: 'cursor-composer-2-fast', label: 'Fast', description: 'Faster responses' },
    ],
  },
];

/**
 * Cursor models that are not part of any group (standalone)
 * All IDs use 'cursor-' prefix for consistent provider routing.
 */
export const STANDALONE_CURSOR_MODELS: CursorModelId[] = [
  'cursor-auto',
  'cursor-opus-4.1',
  'cursor-gemini-3-pro',
  'cursor-gemini-3-flash',
  'cursor-grok',
  'cursor-kimi-k2.5',
];

/**
 * Get the group that a model belongs to (if any)
 */
export function getModelGroup(modelId: CursorModelId): GroupedModel | undefined {
  return CURSOR_MODEL_GROUPS.find((group) => group.variants.some((v) => v.id === modelId));
}

/**
 * Check if any variant in a group is the currently selected model
 */
export function isGroupSelected(
  group: GroupedModel,
  currentModelId: CursorModelId | undefined
): boolean {
  if (!currentModelId) return false;
  return group.variants.some((v) => v.id === currentModelId);
}

/**
 * Get the currently selected variant within a group
 */
export function getSelectedVariant(
  group: GroupedModel,
  currentModelId: CursorModelId | undefined
): ModelVariant | undefined {
  if (!currentModelId) return undefined;
  return group.variants.find((v) => v.id === currentModelId);
}

/**
 * Check if a model ID belongs to a group
 */
export function isGroupedCursorModel(modelId: CursorModelId): boolean {
  return CURSOR_MODEL_GROUPS.some((group) => group.variants.some((v) => v.id === modelId));
}
