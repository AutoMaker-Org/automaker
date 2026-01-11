import type { Project } from '@/lib/electron';
import type React from 'react';

export interface NavSection {
  label?: string;
  items: NavItem[];
}

export interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  shortcut?: string;
  /** Optional count badge to display next to the nav item */
  count?: number;
  /** Whether this nav item is in a loading state (shows spinner) */
  isLoading?: boolean;
}

export interface SortableProjectItemProps {
  project: Project;
  currentProjectId: string | undefined;
  isHighlighted: boolean;
  onSelect: (project: Project) => void;
}

export interface ThemeMenuItemProps {
  option: {
    value: string;
    label: string;
    icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
    color: string;
  };
  onPreviewEnter: (value: string) => void;
  onPreviewLeave: (e: React.PointerEvent) => void;
}
