/**
 * Model alias mapping for Claude models
 */
import type { CursorModelId } from './cursor-models.js';
import type { OpencodeModelId } from './opencode-models.js';

/**
 * Canonical Claude model IDs with provider prefix
 * Used for internal storage and consistent provider routing.
 */
export type ClaudeCanonicalId = 'claude-haiku' | 'claude-sonnet' | 'claude-opus';

/**
 * Canonical Claude model map - maps prefixed IDs to full model strings
 * Use these IDs for internal storage and routing.
 */
export const CLAUDE_CANONICAL_MAP: Record<ClaudeCanonicalId, string> = {
  'claude-haiku': 'claude-haiku-4-5-20251001',
  'claude-sonnet': 'claude-sonnet-4-5-20250929',
  'claude-opus': 'claude-opus-4-5-20251101',
} as const;

/**
 * Legacy Claude model aliases (short names) for backward compatibility
 * These map to the same full model strings as the canonical map.
 * @deprecated Use CLAUDE_CANONICAL_MAP for new code
 */
export const CLAUDE_MODEL_MAP: Record<string, string> = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-5-20250929',
  opus: 'claude-opus-4-5-20251101',
} as const;

/**
 * Map from legacy aliases to canonical IDs
 */
export const LEGACY_CLAUDE_ALIAS_MAP: Record<string, ClaudeCanonicalId> = {
  haiku: 'claude-haiku',
  sonnet: 'claude-sonnet',
  opus: 'claude-opus',
} as const;

/**
 * Codex/OpenAI model identifiers
 * Based on OpenAI Codex CLI official models
 * See: https://developers.openai.com/codex/models/
 *
 * IMPORTANT: All Codex models use 'codex-' prefix to distinguish from Cursor CLI models
 */
export const CODEX_MODEL_MAP = {
  // Recommended Codex-specific models
  /** Most advanced agentic coding model for complex software engineering (default for ChatGPT users) */
  gpt52Codex: 'codex-gpt-5.2-codex',
  /** Optimized for long-horizon, agentic coding tasks in Codex */
  gpt51CodexMax: 'codex-gpt-5.1-codex-max',
  /** Smaller, more cost-effective version for faster workflows */
  gpt51CodexMini: 'codex-gpt-5.1-codex-mini',

  // General-purpose GPT models (also available in Codex)
  /** Best general agentic model for tasks across industries and domains */
  gpt52: 'codex-gpt-5.2',
  /** Great for coding and agentic tasks across domains */
  gpt51: 'codex-gpt-5.1',
} as const;

export const CODEX_MODEL_IDS = Object.values(CODEX_MODEL_MAP);

/**
 * Models that support reasoning effort configuration
 * These models can use reasoning.effort parameter
 */
export const REASONING_CAPABLE_MODELS = new Set([
  CODEX_MODEL_MAP.gpt52Codex,
  CODEX_MODEL_MAP.gpt51CodexMax,
  CODEX_MODEL_MAP.gpt52,
  CODEX_MODEL_MAP.gpt51,
]);

/**
 * Check if a model supports reasoning effort configuration
 */
export function supportsReasoningEffort(modelId: string): boolean {
  return REASONING_CAPABLE_MODELS.has(modelId as any);
}

/**
 * Get all Codex model IDs as an array
 */
export function getAllCodexModelIds(): CodexModelId[] {
  return CODEX_MODEL_IDS as CodexModelId[];
}

/**
 * Default models per provider
 * Uses canonical prefixed IDs for consistent routing.
 */
export const DEFAULT_MODELS = {
  claude: 'claude-opus-4-5-20251101',
  cursor: 'cursor-auto', // Cursor's recommended default (with prefix)
  codex: CODEX_MODEL_MAP.gpt52Codex, // GPT-5.2-Codex is the most advanced agentic coding model
} as const;

export type ModelAlias = keyof typeof CLAUDE_MODEL_MAP;
export type CodexModelId = (typeof CODEX_MODEL_MAP)[keyof typeof CODEX_MODEL_MAP];

/**
 * AgentModel - Alias for ModelAlias for backward compatibility
 * Represents available models across providers
 */
export type AgentModel = ModelAlias | CodexModelId;

/**
 * Dynamic provider model IDs discovered at runtime (provider/model format)
 */
export type DynamicModelId = `${string}/${string}`;

/**
 * Provider-prefixed model IDs used for routing
 */
export type PrefixedCursorModelId = `cursor-${string}`;
export type PrefixedOpencodeModelId = `opencode-${string}`;

/**
 * ModelId - Unified model identifier across providers
 */
export type ModelId =
  | ModelAlias
  | CodexModelId
  | CursorModelId
  | OpencodeModelId
  | DynamicModelId
  | PrefixedCursorModelId
  | PrefixedOpencodeModelId;
