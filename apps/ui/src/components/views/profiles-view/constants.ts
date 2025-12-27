import { Brain, Zap, Scale, Cpu, Rocket, Sparkles } from 'lucide-react';
import type { AgentModel, ThinkingLevel } from '@/store/app-store';

// Icon mapping for profiles
export const PROFILE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Brain,
  Zap,
  Scale,
  Cpu,
  Rocket,
  Sparkles,
};

// Available icons for selection
export const ICON_OPTIONS = [
  { name: 'Brain', icon: Brain },
  { name: 'Zap', icon: Zap },
  { name: 'Scale', icon: Scale },
  { name: 'Cpu', icon: Cpu },
  { name: 'Rocket', icon: Rocket },
  { name: 'Sparkles', icon: Sparkles },
];

// Model options for the form
export const CLAUDE_MODELS: { id: AgentModel; label: string }[] = [
  { id: 'haiku', label: 'Claude Haiku' },
  { id: 'sonnet', label: 'Claude Sonnet' },
  { id: 'opus', label: 'Claude Opus' },
];

export const ZAI_MODELS: { id: AgentModel; label: string }[] = [
  { id: 'glm-4.7', label: 'GLM-4.7' },
  { id: 'glm-4.6v', label: 'GLM-4.6v' },
  { id: 'glm-4.6', label: 'GLM-4.6' },
  { id: 'glm-4.5-air', label: 'GLM-4.5-Air' },
];

export const ALL_MODELS: { id: AgentModel; label: string }[] = [...CLAUDE_MODELS, ...ZAI_MODELS];

export const THINKING_LEVELS: { id: ThinkingLevel; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
  { id: 'ultrathink', label: 'Ultrathink' },
];
