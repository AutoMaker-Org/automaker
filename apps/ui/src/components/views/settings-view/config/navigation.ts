import React from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Key,
  Bot,
  SquareTerminal,
  Palette,
  Settings2,
  Volume2,
  FlaskConical,
  Trash2,
  Workflow,
  Plug,
  MessageSquareText,
  User,
  Shield,
  Cpu,
} from 'lucide-react';
import { AnthropicIcon, CursorIcon, OpenAIIcon } from '@/components/ui/provider-icon';
import type { SettingsViewId } from '../hooks/use-settings-view';

export interface NavigationItem {
  id: SettingsViewId;
  label: string;
  icon: LucideIcon | React.ComponentType<{ className?: string }>;
  subItems?: NavigationItem[];
}

export interface NavigationGroup {
  label: string;
  items: NavigationItem[];
}

// Global settings - always visible
export const GLOBAL_NAV_ITEMS: NavigationItem[] = [
  { id: 'api-keys', label: 'API Keys', icon: Key },
  {
    id: 'providers',
    label: 'AI Providers',
    icon: Bot,
    subItems: [
      { id: 'claude-provider', label: 'Claude', icon: AnthropicIcon },
      { id: 'cursor-provider', label: 'Cursor', icon: CursorIcon },
      { id: 'codex-provider', label: 'Codex', icon: OpenAIIcon },
      { id: 'opencode-provider', label: 'OpenCode', icon: Cpu },
    ],
  },
  { id: 'mcp-servers', label: 'MCP Servers', icon: Plug },
  { id: 'prompts', label: 'Prompt Customization', icon: MessageSquareText },
  { id: 'model-defaults', label: 'Model Defaults', icon: Workflow },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'terminal', label: 'Terminal', icon: SquareTerminal },
  { id: 'keyboard', label: 'Keyboard Shortcuts', icon: Settings2 },
  { id: 'audio', label: 'Audio', icon: Volume2 },
  { id: 'defaults', label: 'Feature Defaults', icon: FlaskConical },
  { id: 'account', label: 'Account', icon: User },
  { id: 'security', label: 'Security', icon: Shield },
];

// Project-specific settings - only visible when a project is selected
export const PROJECT_NAV_ITEMS: NavigationItem[] = [
  { id: 'danger', label: 'Danger Zone', icon: Trash2 },
];

// Legacy export for backwards compatibility
export const NAV_ITEMS: NavigationItem[] = [...GLOBAL_NAV_ITEMS, ...PROJECT_NAV_ITEMS];
