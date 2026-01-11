import type { LinearTeam, LinearProject, LinearIssueFilters } from '@/lib/electron';

export interface LinearViewState {
  selectedTeam: LinearTeam | null;
  selectedProject: LinearProject | null;
  filters: LinearIssueFilters;
  selectedIssues: Set<string>;
}

export interface FilterPreset {
  id: string;
  name: string;
  icon?: string;
  filters: Partial<LinearIssueFilters>;
}

export const DEFAULT_PRESETS: FilterPreset[] = [
  {
    id: 'my-issues',
    name: 'My Issues',
    icon: '🙋',
    filters: { myIssuesOnly: true },
  },
  {
    id: 'unstarted',
    name: 'Unstarted',
    icon: '📋',
    filters: { stateType: ['unstarted', 'backlog'] },
  },
  {
    id: 'in-progress',
    name: 'In Progress',
    icon: '🔄',
    filters: { stateType: ['started'] },
  },
  {
    id: 'high-priority',
    name: 'High Priority',
    icon: '🔥',
    filters: { priority: [1, 2] },
  },
];
