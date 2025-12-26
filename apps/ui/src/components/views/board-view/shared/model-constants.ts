import type { AgentModel, ThinkingLevel, ModelProvider } from '@automaker/types';
import { Brain, Zap, Scale, Cpu, Rocket, Sparkles } from 'lucide-react';

export type ModelOption = {
  id: AgentModel;
  label: string;
  description: string;
  badge?: string;
  provider: ModelProvider;
  default?: boolean;
};

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

export const CURSOR_MODELS: ModelOption[] = [
  {
    id: 'cursor-opus-thinking',
    label: 'Cursor Opus 4.5 Thinking',
    description: 'Claude Opus 4.5 with extended thinking via Cursor.',
    badge: 'Premium',
    provider: 'cursor',
    default: true,
  },
  {
    id: 'cursor-sonnet',
    label: 'Cursor Sonnet 4.5',
    description: 'Claude Sonnet 4.5 via Cursor subscription.',
    badge: 'Balanced',
    provider: 'cursor',
  },
  {
    id: 'cursor-gpt5',
    label: 'Cursor GPT-5.2',
    description: 'OpenAI GPT-5.2 via Cursor subscription.',
    badge: 'Premium',
    provider: 'cursor',
  },
  {
    id: 'cursor-composer',
    label: 'Cursor Composer',
    description: 'Cursor Composer model.',
    badge: 'Premium',
    provider: 'cursor',
  },
];

export const ALL_MODELS: ModelOption[] = [...CLAUDE_MODELS, ...CURSOR_MODELS];

/**
 * Maps profile models (Claude-based) to equivalent models for each provider.
 * When a profile is selected, we use this to get the appropriate model for the current provider.
 */
export const PROFILE_MODEL_MAP: Record<ModelProvider, Record<string, AgentModel>> = {
  claude: {
    opus: 'opus',
    sonnet: 'sonnet',
    haiku: 'haiku',
  },
  cursor: {
    opus: 'cursor-opus-thinking',
    sonnet: 'cursor-gpt5',
    haiku: 'cursor-composer',
  },
};

/**
 * Get the equivalent model for a provider based on a profile's base model.
 * Falls back to the original model if no mapping exists.
 */
export function getModelForProvider(profileModel: AgentModel, provider: ModelProvider): AgentModel {
  const mapping = PROFILE_MODEL_MAP[provider];
  if (mapping && mapping[profileModel]) {
    return mapping[profileModel];
  }
  // If it's already a cursor model and provider is cursor, keep it
  if (provider === 'cursor' && profileModel.startsWith('cursor-')) {
    return profileModel;
  }
  // If it's a claude model and provider is claude, keep it
  if (provider === 'claude' && !profileModel.startsWith('cursor-')) {
    return profileModel;
  }
  // Fallback to the original model
  return profileModel;
}

export const THINKING_LEVELS: ThinkingLevel[] = ['none', 'low', 'medium', 'high', 'ultrathink'];

export const THINKING_LEVEL_LABELS: Record<ThinkingLevel, string> = {
  none: 'None',
  low: 'Low',
  medium: 'Med',
  high: 'High',
  ultrathink: 'Ultra',
};

// Profile icon mapping
export const PROFILE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Brain,
  Zap,
  Scale,
  Cpu,
  Rocket,
  Sparkles,
};
