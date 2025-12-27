import type { LucideIcon } from 'lucide-react';
import {
  Key,
  Terminal,
  SquareTerminal,
  Palette,
  Settings2,
  Volume2,
  FlaskConical,
  Trash2,
  Sparkles,
  Wand2,
} from 'lucide-react';
import type { SettingsViewId } from '../hooks/use-settings-view';

export interface NavigationItem {
  id: SettingsViewId;
  label: string;
  icon: LucideIcon;
}

// Navigation items for the settings side panel
export const NAV_ITEMS: NavigationItem[] = [
  { id: 'api-keys', label: 'API Keys', icon: Key },
  { id: 'ai-provider', label: 'AI Provider', icon: Wand2 },
  { id: 'claude', label: 'Claude SDK', icon: Terminal },
  { id: 'ai-enhancement', label: 'AI Enhancement', icon: Sparkles },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'terminal', label: 'Terminal', icon: SquareTerminal },
  { id: 'keyboard', label: 'Keyboard Shortcuts', icon: Settings2 },
  { id: 'audio', label: 'Audio', icon: Volume2 },
  { id: 'defaults', label: 'Feature Defaults', icon: FlaskConical },
  { id: 'danger', label: 'Danger Zone', icon: Trash2 },
];
