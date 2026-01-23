import type { ModelAlias } from '@/store/app-store';
import type { ModelProvider, ThinkingLevel, ReasoningEffort } from '@automaker/types';
import {
  CURSOR_MODEL_MAP,
  CODEX_MODEL_MAP,
  OPENCODE_MODELS as OPENCODE_MODEL_CONFIGS,
  GEMINI_MODEL_MAP,
  COPILOT_MODEL_MAP,
} from '@automaker/types';
import { Brain, Zap, Scale, Cpu, Rocket, Sparkles } from 'lucide-react';
import {
  AnthropicIcon,
  CursorIcon,
  OpenAIIcon,
  OpenCodeIcon,
  GeminiIcon,
  CopilotIcon,
} from '@/components/ui/provider-icon';

export type ModelOption = {
  id: string; // All model IDs use canonical prefixed format (e.g., "claude-sonnet", "cursor-auto")
  label: string;
  description: string;
  badge?: string;
  provider: ModelProvider;
  hasThinking?: boolean;
};

/**
 * Claude models with canonical prefixed IDs
 * UI displays short labels but stores full canonical IDs
 */
export const CLAUDE_MODELS: ModelOption[] = [
  {
    id: 'claude-haiku', // Canonical prefixed ID
    label: 'Claude Haiku',
    description: 'Fast and efficient for simple tasks.',
    badge: 'Speed',
    provider: 'claude',
  },
  {
    id: 'claude-sonnet', // Canonical prefixed ID
    label: 'Claude Sonnet',
    description: 'Balanced performance with strong reasoning.',
    badge: 'Balanced',
    provider: 'claude',
  },
  {
    id: 'claude-opus', // Canonical prefixed ID
    label: 'Claude Opus',
    description: 'Most capable model for complex work.',
    badge: 'Premium',
    provider: 'claude',
  },
];

/**
 * Cursor models derived from CURSOR_MODEL_MAP
 * IDs already have 'cursor-' prefix in the canonical format
 */
export const CURSOR_MODELS: ModelOption[] = Object.entries(CURSOR_MODEL_MAP).map(
  ([id, config]) => ({
    id, // Already prefixed in canonical format
    label: config.label,
    description: config.description,
    provider: 'cursor' as ModelProvider,
    hasThinking: config.hasThinking,
  })
);

/**
 * Codex/OpenAI models
 * Official models from https://developers.openai.com/codex/models/
 */
export const CODEX_MODELS: ModelOption[] = [
  {
    id: CODEX_MODEL_MAP.gpt52Codex,
    label: 'GPT-5.2-Codex',
    description: 'Most advanced agentic coding model for complex software engineering.',
    badge: 'Premium',
    provider: 'codex',
    hasThinking: true,
  },
  {
    id: CODEX_MODEL_MAP.gpt51CodexMax,
    label: 'GPT-5.1-Codex-Max',
    description: 'Optimized for long-horizon, agentic coding tasks in Codex.',
    badge: 'Premium',
    provider: 'codex',
    hasThinking: true,
  },
  {
    id: CODEX_MODEL_MAP.gpt51CodexMini,
    label: 'GPT-5.1-Codex-Mini',
    description: 'Smaller, more cost-effective version for faster workflows.',
    badge: 'Speed',
    provider: 'codex',
    hasThinking: false,
  },
  {
    id: CODEX_MODEL_MAP.gpt52,
    label: 'GPT-5.2',
    description: 'Best general agentic model for tasks across industries and domains.',
    badge: 'Balanced',
    provider: 'codex',
    hasThinking: true,
  },
  {
    id: CODEX_MODEL_MAP.gpt51,
    label: 'GPT-5.1',
    description: 'Great for coding and agentic tasks across domains.',
    badge: 'Balanced',
    provider: 'codex',
    hasThinking: true,
  },
];

/**
 * OpenCode models derived from OPENCODE_MODEL_CONFIGS
 */
export const OPENCODE_MODELS: ModelOption[] = OPENCODE_MODEL_CONFIGS.map((config) => ({
  id: config.id,
  label: config.label,
  description: config.description,
  badge: config.tier === 'free' ? 'Free' : config.tier === 'premium' ? 'Premium' : undefined,
  provider: config.provider as ModelProvider,
}));

/**
 * Gemini models derived from GEMINI_MODEL_MAP
 * Model IDs already have 'gemini-' prefix (like Cursor models)
 */
export const GEMINI_MODELS: ModelOption[] = Object.entries(GEMINI_MODEL_MAP).map(
  ([id, config]) => ({
    id, // IDs already have gemini- prefix (e.g., 'gemini-2.5-flash')
    label: config.label,
    description: config.description,
    badge: config.supportsThinking ? 'Thinking' : 'Speed',
    provider: 'gemini' as ModelProvider,
    hasThinking: config.supportsThinking,
  })
);

/**
 * Copilot models derived from COPILOT_MODEL_MAP
 * Model IDs already have 'copilot-' prefix
 */
export const COPILOT_MODELS: ModelOption[] = Object.entries(COPILOT_MODEL_MAP).map(
  ([id, config]) => ({
    id, // IDs already have copilot- prefix (e.g., 'copilot-gpt-4o')
    label: config.label,
    description: config.description,
    badge: config.supportsVision ? 'Vision' : 'Standard',
    provider: 'copilot' as ModelProvider,
    hasThinking: false,
  })
);

/**
 * All available models (Claude + Cursor + Codex + OpenCode + Gemini + Copilot)
 */
export const ALL_MODELS: ModelOption[] = [
  ...CLAUDE_MODELS,
  ...CURSOR_MODELS,
  ...CODEX_MODELS,
  ...OPENCODE_MODELS,
  ...GEMINI_MODELS,
  ...COPILOT_MODELS,
];

export const THINKING_LEVELS: ThinkingLevel[] = ['none', 'low', 'medium', 'high', 'ultrathink'];

export const THINKING_LEVEL_LABELS: Record<ThinkingLevel, string> = {
  none: 'None',
  low: 'Low',
  medium: 'Med',
  high: 'High',
  ultrathink: 'Ultra',
};

/**
 * Reasoning effort levels for Codex/OpenAI models
 * All models support reasoning effort levels
 */
export const REASONING_EFFORT_LEVELS: ReasoningEffort[] = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
];

export const REASONING_EFFORT_LABELS: Record<ReasoningEffort, string> = {
  none: 'None',
  minimal: 'Min',
  low: 'Low',
  medium: 'Med',
  high: 'High',
  xhigh: 'XHigh',
};

// Profile icon mapping
export const PROFILE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Brain,
  Zap,
  Scale,
  Cpu,
  Rocket,
  Sparkles,
  Anthropic: AnthropicIcon,
  Cursor: CursorIcon,
  Codex: OpenAIIcon,
  OpenCode: OpenCodeIcon,
  Gemini: GeminiIcon,
  Copilot: CopilotIcon,
};
