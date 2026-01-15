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
  GitBranch,
  Globe,
} from 'lucide-react';
import { AnthropicIcon, CursorIcon, OpenAIIcon, OpenCodeIcon } from '@/components/ui/provider-icon';
import type { SettingsViewId } from '../hooks/use-settings-view';

export interface NavigationItem {
  id: SettingsViewId;
  labelKey: string; // Translation key for the label
  icon: LucideIcon | React.ComponentType<{ className?: string }>;
  subItems?: NavigationItem[];
}

export interface NavigationGroup {
  labelKey: string; // Translation key for the group label
  items: NavigationItem[];
}

// Global settings organized into groups
export const GLOBAL_NAV_GROUPS: NavigationGroup[] = [
  {
    labelKey: 'navigation.modelPrompts',
    items: [
      { id: 'defaults', labelKey: 'navigation.featureDefaults', icon: FlaskConical },
      { id: 'model-defaults', labelKey: 'navigation.modelDefaults', icon: Workflow },
      { id: 'worktrees', labelKey: 'navigation.worktrees', icon: GitBranch },
      { id: 'prompts', labelKey: 'navigation.promptCustomization', icon: MessageSquareText },
      { id: 'api-keys', labelKey: 'navigation.apiKeys', icon: Key },
      {
        id: 'providers',
        labelKey: 'navigation.aiProviders',
        icon: Bot,
        subItems: [
          { id: 'claude-provider', labelKey: 'navigation.claude', icon: AnthropicIcon },
          { id: 'cursor-provider', labelKey: 'navigation.cursor', icon: CursorIcon },
          { id: 'codex-provider', labelKey: 'navigation.codex', icon: OpenAIIcon },
          { id: 'opencode-provider', labelKey: 'navigation.opencode', icon: OpenCodeIcon },
        ],
      },
      { id: 'mcp-servers', labelKey: 'navigation.mcpServers', icon: Plug },
    ],
  },
  {
    labelKey: 'navigation.interface',
    items: [
      { id: 'appearance', labelKey: 'navigation.appearance', icon: Palette },
      { id: 'language', labelKey: 'navigation.language', icon: Globe },
      { id: 'terminal', labelKey: 'navigation.terminal', icon: SquareTerminal },
      { id: 'keyboard', labelKey: 'navigation.keyboardShortcuts', icon: Settings2 },
      { id: 'audio', labelKey: 'navigation.audio', icon: Volume2 },
    ],
  },
  {
    labelKey: 'navigation.accountSecurity',
    items: [
      { id: 'account', labelKey: 'navigation.account', icon: User },
      { id: 'security', labelKey: 'navigation.security', icon: Shield },
    ],
  },
];

// Flat list of all global nav items for backwards compatibility
export const GLOBAL_NAV_ITEMS: NavigationItem[] = GLOBAL_NAV_GROUPS.flatMap((group) => group.items);

// Project-specific settings - only visible when a project is selected
export const PROJECT_NAV_ITEMS: NavigationItem[] = [
  { id: 'danger', labelKey: 'navigation.dangerZone', icon: Trash2 },
];

// Legacy export for backwards compatibility
export const NAV_ITEMS: NavigationItem[] = [...GLOBAL_NAV_ITEMS, ...PROJECT_NAV_ITEMS];
