import { memo } from 'react';
import { Search, X } from 'lucide-react';
import { LinearTeam, LinearProject, LinearIssueFilters } from '@/lib/electron';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DEFAULT_PRESETS, FilterPreset } from '../types';
import { cn } from '@/lib/utils';

interface LinearFiltersProps {
  teams: LinearTeam[];
  selectedTeam: LinearTeam | null;
  onTeamChange: (team: LinearTeam | null) => void;
  projects: LinearProject[];
  selectedProject: LinearProject | null;
  onProjectChange: (project: LinearProject | null) => void;
  filters: LinearIssueFilters;
  onFiltersChange: (filters: Partial<LinearIssueFilters>) => void;
  onResetFilters: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export const LinearFilters = memo(function LinearFilters({
  teams,
  selectedTeam,
  onTeamChange,
  projects,
  selectedProject,
  onProjectChange,
  filters,
  onFiltersChange,
  onResetFilters,
  searchQuery,
  onSearchChange,
}: LinearFiltersProps) {
  const hasActiveFilters =
    filters.myIssuesOnly ||
    (filters.stateType && filters.stateType.length > 0) ||
    (filters.priority && filters.priority.length > 0) ||
    searchQuery;

  const activePreset = DEFAULT_PRESETS.find((preset) => {
    if (preset.id === 'my-issues' && filters.myIssuesOnly) return true;
    if (
      preset.id === 'unstarted' &&
      filters.stateType?.includes('unstarted') &&
      filters.stateType?.includes('backlog')
    )
      return true;
    if (preset.id === 'in-progress' && filters.stateType?.includes('started')) return true;
    if (
      preset.id === 'high-priority' &&
      filters.priority?.includes(1) &&
      filters.priority?.includes(2)
    )
      return true;
    return false;
  });

  const handlePresetClick = (preset: FilterPreset) => {
    if (activePreset?.id === preset.id) {
      onResetFilters();
    } else {
      onResetFilters();
      onFiltersChange(preset.filters);
    }
  };

  return (
    <div className="space-y-3 p-4 border-b border-border">
      {/* Team and Project selectors */}
      <div className="flex gap-2">
        {/* Team selector */}
        <Select
          value={selectedTeam?.id || ''}
          onValueChange={(value) => {
            const team = teams.find((t) => t.id === value) || null;
            onTeamChange(team);
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select team" />
          </SelectTrigger>
          <SelectContent>
            {teams.map((team) => (
              <SelectItem key={team.id} value={team.id}>
                <div className="flex items-center gap-2">
                  {team.color && (
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: team.color }} />
                  )}
                  <span>{team.name}</span>
                  <span className="text-muted-foreground text-xs">{team.key}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Project selector */}
        <Select
          value={selectedProject?.id || 'all'}
          onValueChange={(value) => {
            if (value === 'all') {
              onProjectChange(null);
            } else {
              const project = projects.find((p) => p.id === value) || null;
              onProjectChange(project);
            }
          }}
          disabled={!selectedTeam}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All projects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All projects</SelectItem>
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search issues..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9 pr-9"
        />
        {searchQuery && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
            onClick={() => onSearchChange('')}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Filter presets */}
      <div className="flex flex-wrap gap-2">
        {DEFAULT_PRESETS.map((preset) => (
          <Button
            key={preset.id}
            variant={activePreset?.id === preset.id ? 'default' : 'outline'}
            size="sm"
            className={cn('h-7 text-xs', activePreset?.id === preset.id && 'bg-primary')}
            onClick={() => handlePresetClick(preset)}
          >
            {preset.icon} {preset.name}
          </Button>
        ))}

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onResetFilters}>
            <X className="h-3 w-3 mr-1" />
            Clear
          </Button>
        )}
      </div>
    </div>
  );
});
