import type { AgentModel, ThinkingLevel, ModelProvider } from '@/store/app-store';
import { Brain, Zap, Scale, Cpu, Rocket, Sparkles, Wand2, Code2, Terminal } from 'lucide-react';

export type ModelOption = {
  id: AgentModel;
  label: string;
  description: string;
  badge?: string;
  provider: ModelProvider;
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
    id: 'auto',
    label: 'Auto',
    description: 'Automatically selects the best model.',
    badge: 'Recommended',
    provider: 'cursor',
  },
  {
    id: 'claude-sonnet',
    label: 'Claude Sonnet',
    description: 'Claude Sonnet via Cursor.',
    badge: 'Balanced',
    provider: 'cursor',
  },
];

export const OPENCODE_MODELS: ModelOption[] = [
  {
    id: 'glm4.7',
    label: 'GLM 4.7',
    description: 'Free OpenCode model with solid general capabilities.',
    badge: 'Free',
    provider: 'opencode',
  },
];

export const CODEX_MODELS: ModelOption[] = [
  {
    id: 'gpt-5.2-codex',
    label: 'GPT-5.2 Codex',
    description: 'Most advanced Codex model for agentic coding.',
    badge: 'Premium',
    provider: 'codex',
  },
  {
    id: 'gpt-5.2',
    label: 'GPT-5.2',
    description: 'Latest general model supported in Codex.',
    badge: 'Premium',
    provider: 'codex',
  },
  {
    id: 'gpt-5.1-codex-max',
    label: 'GPT-5.1 Codex Max',
    description: 'Maximum capability Codex model.',
    badge: 'Premium',
    provider: 'codex',
  },
  {
    id: 'gpt-5.1-codex',
    label: 'GPT-5.1 Codex',
    description: 'Standard Codex model for long-running tasks.',
    badge: 'Balanced',
    provider: 'codex',
  },
  {
    id: 'gpt-5.1-codex-mini',
    label: 'GPT-5.1 Codex Mini',
    description: 'Lightweight Codex model for quick tasks.',
    badge: 'Speed',
    provider: 'codex',
  },
  {
    id: 'gpt-5.1',
    label: 'GPT-5.1',
    description: 'General-purpose GPT-5.1 for Codex CLI.',
    badge: 'Standard',
    provider: 'codex',
  },
  {
    id: 'gpt-5-codex',
    label: 'GPT-5 Codex',
    description: 'Legacy Codex model superseded by GPT-5.1 Codex.',
    badge: 'Legacy',
    provider: 'codex',
  },
  {
    id: 'gpt-5-codex-mini',
    label: 'GPT-5 Codex Mini',
    description: 'Legacy lightweight Codex model.',
    badge: 'Legacy',
    provider: 'codex',
  },
  {
    id: 'gpt-5',
    label: 'GPT-5',
    description: 'Legacy general model for Codex CLI.',
    badge: 'Legacy',
    provider: 'codex',
  },
];

// Combined models for provider selection
export const ALL_MODELS: ModelOption[] = [
  ...CURSOR_MODELS,
  ...CODEX_MODELS,
  ...OPENCODE_MODELS,
  ...CLAUDE_MODELS,
];

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
  Wand2,
};

// Provider icon mapping
export const PROVIDER_ICONS: Record<ModelProvider, React.ComponentType<{ className?: string }>> = {
  claude: Brain,
  cursor: Wand2,
  opencode: Code2,
  codex: Terminal,
};
