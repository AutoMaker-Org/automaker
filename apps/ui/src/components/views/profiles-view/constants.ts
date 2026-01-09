import { Brain, Zap, Scale, Cpu, Rocket, Sparkles } from 'lucide-react';
import type { ModelAlias, ThinkingLevel } from '@/store/app-store';
import { AnthropicIcon, CursorIcon, OpenAIIcon } from '@/components/ui/provider-icon';

// Icon mapping for profiles
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
};

// Available icons for selection
export const ICON_OPTIONS = [
  { name: 'Brain', icon: Brain },
  { name: 'Zap', icon: Zap },
  { name: 'Scale', icon: Scale },
  { name: 'Cpu', icon: Cpu },
  { name: 'Rocket', icon: Rocket },
  { name: 'Sparkles', icon: Sparkles },
  { name: 'Anthropic', icon: AnthropicIcon },
  { name: 'Cursor', icon: CursorIcon },
  { name: 'Codex', icon: OpenAIIcon },
];

// Model options for the form
export const CLAUDE_MODELS: { id: ModelAlias; label: string }[] = [
  { id: 'haiku', label: 'Claude Haiku' },
  { id: 'sonnet', label: 'Claude Sonnet' },
  { id: 'opus', label: 'Claude Opus' },
];

export const THINKING_LEVELS: { id: ThinkingLevel; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
  { id: 'ultrathink', label: 'Ultrathink' },
];
