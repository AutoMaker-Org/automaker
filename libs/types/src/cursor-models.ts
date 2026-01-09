/**
 * Cursor CLI Model IDs
 * Reference: https://cursor.com/docs
 *
 * IMPORTANT: GPT models use 'cursor-' prefix to distinguish from Codex CLI models
 */
export type CursorModelId =
  | 'auto' // Auto-select best model
  | 'composer-1' // Cursor Composer agent model
  | 'sonnet-4.5' // Claude Sonnet 4.5
  | 'sonnet-4.5-thinking' // Claude Sonnet 4.5 with extended thinking
  | 'opus-4.5' // Claude Opus 4.5
  | 'opus-4.5-thinking' // Claude Opus 4.5 with extended thinking
  | 'opus-4.1' // Claude Opus 4.1
  | 'gemini-3-pro' // Gemini 3 Pro
  | 'gemini-3-flash' // Gemini 3 Flash
  | 'cursor-gpt-5.2' // GPT-5.2 via Cursor
  | 'cursor-gpt-5.1' // GPT-5.1 via Cursor
  | 'cursor-gpt-5.2-high' // GPT-5.2 High via Cursor
  | 'cursor-gpt-5.1-high' // GPT-5.1 High via Cursor
  | 'cursor-gpt-5.1-codex' // GPT-5.1 Codex via Cursor
  | 'cursor-gpt-5.1-codex-high' // GPT-5.1 Codex High via Cursor
  | 'cursor-gpt-5.1-codex-max' // GPT-5.1 Codex Max via Cursor
  | 'cursor-gpt-5.1-codex-max-high' // GPT-5.1 Codex Max High via Cursor
  | 'grok'; // Grok

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
 */
export const CURSOR_MODEL_MAP: Record<CursorModelId, CursorModelConfig> = {
  auto: {
    id: 'auto',
    label: 'Auto (Recommended)',
    description: 'Automatically selects the best model for each task',
    hasThinking: false,
    supportsVision: false, // Vision not yet supported by Cursor CLI
  },
  'composer-1': {
    id: 'composer-1',
    label: 'Composer 1',
    description: 'Cursor Composer agent model optimized for multi-file edits',
    hasThinking: false,
    supportsVision: false,
  },
  'sonnet-4.5': {
    id: 'sonnet-4.5',
    label: 'Claude Sonnet 4.5',
    description: 'Anthropic Claude Sonnet 4.5 via Cursor',
    hasThinking: false,
    supportsVision: false, // Model supports vision but Cursor CLI doesn't pass images
  },
  'sonnet-4.5-thinking': {
    id: 'sonnet-4.5-thinking',
    label: 'Claude Sonnet 4.5 (Thinking)',
    description: 'Claude Sonnet 4.5 with extended thinking enabled',
    hasThinking: true,
    supportsVision: false,
  },
  'opus-4.5': {
    id: 'opus-4.5',
    label: 'Claude Opus 4.5',
    description: 'Anthropic Claude Opus 4.5 via Cursor',
    hasThinking: false,
    supportsVision: false,
  },
  'opus-4.5-thinking': {
    id: 'opus-4.5-thinking',
    label: 'Claude Opus 4.5 (Thinking)',
    description: 'Claude Opus 4.5 with extended thinking enabled',
    hasThinking: true,
    supportsVision: false,
  },
  'opus-4.1': {
    id: 'opus-4.1',
    label: 'Claude Opus 4.1',
    description: 'Anthropic Claude Opus 4.1 via Cursor',
    hasThinking: false,
    supportsVision: false,
  },
  'gemini-3-pro': {
    id: 'gemini-3-pro',
    label: 'Gemini 3 Pro',
    description: 'Google Gemini 3 Pro via Cursor',
    hasThinking: false,
    supportsVision: false,
  },
  'gemini-3-flash': {
    id: 'gemini-3-flash',
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
  grok: {
    id: 'grok',
    label: 'Grok',
    description: 'xAI Grok via Cursor',
    hasThinking: false,
    supportsVision: false,
  },
};

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
export type VariantType = 'compute' | 'thinking' | 'capacity';

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
  // Sonnet 4.5 group (thinking mode)
  {
    baseId: 'sonnet-4.5-group',
    label: 'Claude Sonnet 4.5',
    description: 'Anthropic Claude Sonnet 4.5 via Cursor',
    variantType: 'thinking',
    variants: [
      { id: 'sonnet-4.5', label: 'Standard', description: 'Fast responses' },
      {
        id: 'sonnet-4.5-thinking',
        label: 'Thinking',
        description: 'Extended reasoning',
        badge: 'Reasoning',
      },
    ],
  },
  // Opus 4.5 group (thinking mode)
  {
    baseId: 'opus-4.5-group',
    label: 'Claude Opus 4.5',
    description: 'Anthropic Claude Opus 4.5 via Cursor',
    variantType: 'thinking',
    variants: [
      { id: 'opus-4.5', label: 'Standard', description: 'Fast responses' },
      {
        id: 'opus-4.5-thinking',
        label: 'Thinking',
        description: 'Extended reasoning',
        badge: 'Reasoning',
      },
    ],
  },
];

/**
 * Cursor models that are not part of any group (standalone)
 */
export const STANDALONE_CURSOR_MODELS: CursorModelId[] = [
  'auto',
  'composer-1',
  'opus-4.1',
  'gemini-3-pro',
  'gemini-3-flash',
  'grok',
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
