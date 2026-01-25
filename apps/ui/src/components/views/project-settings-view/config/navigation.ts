import type { LucideIcon } from 'lucide-react';
import { User, GitBranch, Palette, AlertTriangle, Workflow } from 'lucide-react';
import type { ProjectSettingsViewId } from '../hooks/use-project-settings-view';

export interface ProjectNavigationItem {
  id: ProjectSettingsViewId;
  label: string;
  icon: LucideIcon;
}

export const PROJECT_SETTINGS_NAV_ITEMS: ProjectNavigationItem[] = [
  { id: 'identity', label: 'Identity', icon: User },
  { id: 'worktrees', label: 'Worktrees', icon: GitBranch },
  { id: 'theme', label: 'Theme', icon: Palette },
  { id: 'claude', label: 'Models', icon: Workflow },
  { id: 'danger', label: 'Danger Zone', icon: AlertTriangle },
];
