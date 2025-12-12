import type { LucideIcon } from "lucide-react";
import {
  Key,
  Terminal,
  Atom,
  Palette,
  LayoutGrid,
  Settings2,
  FlaskConical,
  Trash2,
} from "lucide-react";

export interface NavigationItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

// Navigation items for the settings side panel
export const NAV_ITEMS: NavigationItem[] = [
  { id: "api-keys", label: "API Keys", icon: Key },
  { id: "claude", label: "Claude", icon: Terminal },
  { id: "codex", label: "Codex", icon: Atom },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "kanban", label: "Kanban Display", icon: LayoutGrid },
  { id: "keyboard", label: "Keyboard Shortcuts", icon: Settings2 },
  { id: "defaults", label: "Feature Defaults", icon: FlaskConical },
  { id: "danger", label: "Danger Zone", icon: Trash2 },
];
