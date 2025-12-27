import type { AgentModel, ThinkingLevel } from '@/store/app-store';
import { Brain, Zap, Scale, Cpu, Rocket, Sparkles } from 'lucide-react';

export type ModelOption = {
  id: AgentModel;
  label: string;
  description: string;
  badge?: string;
  provider: 'claude' | 'zai';
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

export const ZAI_MODELS: ModelOption[] = [
  {
    id: 'glm-4.7',
    label: 'GLM-4.7',
    description: 'Flagship model with strong reasoning.',
    badge: 'Premium',
    provider: 'zai',
  },
  {
    id: 'glm-4.6v',
    label: 'GLM-4.6v',
    description: 'Multimodal model with vision support.',
    badge: 'Vision',
    provider: 'zai',
  },
  {
    id: 'glm-4.6',
    label: 'GLM-4.6',
    description: 'Balanced performance with good reasoning.',
    badge: 'Balanced',
    provider: 'zai',
  },
  {
    id: 'glm-4.5-air',
    label: 'GLM-4.5-Air',
    description: 'Fast and efficient for simple tasks.',
    badge: 'Speed',
    provider: 'zai',
  },
];

export const ALL_MODELS: ModelOption[] = [...CLAUDE_MODELS, ...ZAI_MODELS];

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
