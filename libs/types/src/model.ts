/**
 * Model alias mapping for Claude models
 */
export const CLAUDE_MODEL_MAP: Record<string, string> = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-5-20250929',
  opus: 'claude-opus-4-5-20251101',
} as const;

/**
 * Model alias mapping for Cursor models
 */
export const CURSOR_MODEL_MAP: Record<string, string> = {
  'cursor-opus-thinking': 'cursor-opus-4.5-thinking',
  'cursor-sonnet': 'cursor-sonnet-4.5',
  'cursor-gpt5': 'cursor-gpt-5.2',
  'cursor-composer': 'cursor-composer',
} as const;

/**
 * Combined model map for all providers
 */
export const ALL_MODEL_MAP: Record<string, string> = {
  ...CLAUDE_MODEL_MAP,
  ...CURSOR_MODEL_MAP,
} as const;

/**
 * Default models per provider
 */
export const DEFAULT_MODELS = {
  claude: 'claude-opus-4-5-20251101',
  cursor: 'cursor-opus-4.5-thinking',
} as const;

export type ClaudeModelAlias = keyof typeof CLAUDE_MODEL_MAP;
export type CursorModelAlias = keyof typeof CURSOR_MODEL_MAP;
export type ModelAlias = ClaudeModelAlias | CursorModelAlias;

/**
 * AgentModel - Represents all available models across providers
 * Claude models: "opus" | "sonnet" | "haiku"
 * Cursor models: "cursor-opus-thinking" | "cursor-sonnet" | "cursor-gpt5" | "cursor-composer"
 */
export type AgentModel = ModelAlias;
