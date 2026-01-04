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
  auto: 'auto',
  'claude-sonnet': 'claude-sonnet',
} as const;

/**
 * Model alias mapping for OpenCode models
 */
export const OPENCODE_MODEL_MAP: Record<string, string> = {
  'glm4.7': 'glm4.7',
  'glm-4.7': 'glm-4.7',
} as const;

/**
 * Model alias mapping for Codex models
 */
export const CODEX_MODEL_MAP: Record<string, string> = {
  'gpt-5.2-codex': 'gpt-5.2-codex',
  'gpt-5.2': 'gpt-5.2',
  'gpt-5.1-codex-max': 'gpt-5.1-codex-max',
  'gpt-5.1-codex': 'gpt-5.1-codex',
  'gpt-5.1-codex-mini': 'gpt-5.1-codex-mini',
  'gpt-5.1': 'gpt-5.1',
  'gpt-5-codex': 'gpt-5-codex',
  'gpt-5-codex-mini': 'gpt-5-codex-mini',
  'gpt-5': 'gpt-5',
  codex: 'codex',
  o1: 'o1',
  o3: 'o3',
} as const;

/**
 * Default models per provider
 */
export const DEFAULT_MODELS = {
  claude: 'claude-opus-4-5-20251101',
  cursor: 'auto',
  opencode: 'glm4.7',
  codex: 'gpt-5.2-codex',
} as const;

export type ClaudeModelAlias = keyof typeof CLAUDE_MODEL_MAP;
export type CursorModelAlias = keyof typeof CURSOR_MODEL_MAP;
export type OpenCodeModelAlias = keyof typeof OPENCODE_MODEL_MAP;
export type CodexModelAlias = keyof typeof CODEX_MODEL_MAP;

export type ModelAlias = ClaudeModelAlias | CursorModelAlias | OpenCodeModelAlias | CodexModelAlias;

export type ModelId =
  | (typeof CLAUDE_MODEL_MAP)[keyof typeof CLAUDE_MODEL_MAP]
  | (typeof CURSOR_MODEL_MAP)[keyof typeof CURSOR_MODEL_MAP]
  | (typeof OPENCODE_MODEL_MAP)[keyof typeof OPENCODE_MODEL_MAP]
  | (typeof CODEX_MODEL_MAP)[keyof typeof CODEX_MODEL_MAP];

/**
 * AgentModel - Alias for ModelAlias for backward compatibility
 * Represents available model aliases across providers
 */
export type AgentModel = ModelAlias | ModelId;
