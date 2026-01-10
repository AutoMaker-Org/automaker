import { useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import type { Project } from '@/lib/electron';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, Star, Plus, FolderOpen, Check } from 'lucide-react';

interface ProjectSwitcherProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  currentProject: Project | null;
  projects: Project[];
  pinnedProjectIds: string[];
  onNewProject: () => void;
  onOpenFolder: () => void;
  showCurrentProjectName?: boolean;
}

export function ProjectSwitcher({
  isOpen,
  onOpenChange,
  currentProject,
  projects,
  pinnedProjectIds,
  onNewProject,
  onOpenFolder,
  showCurrentProjectName = true,
}: ProjectSwitcherProps) {
  const navigate = useNavigate();
  const { setCurrentProject, pinProject, unpinProject } = useAppStore();

  const pinnedProjects = projects.filter((p) => pinnedProjectIds.includes(p.id));
  const unpinnedProjects = projects.filter((p) => !pinnedProjectIds.includes(p.id));

  const handleSelectProject = useCallback(
    (project: Project) => {
      setCurrentProject(project);
      navigate({ to: '/board' });
      onOpenChange(false);
    },
    [setCurrentProject, navigate, onOpenChange]
  );

  const handleTogglePin = useCallback(
    (e: React.MouseEvent, projectId: string) => {
      e.stopPropagation();
      if (pinnedProjectIds.includes(projectId)) {
        unpinProject(projectId);
      } else {
        pinProject(projectId);
      }
    },
    [pinnedProjectIds, pinProject, unpinProject]
  );

  const handleNewProject = useCallback(() => {
    onOpenChange(false);
    onNewProject();
  }, [onOpenChange, onNewProject]);

  const handleOpenFolder = useCallback(() => {
    onOpenChange(false);
    onOpenFolder();
  }, [onOpenChange, onOpenFolder]);

  const handleAllProjects = useCallback(() => {
    onOpenChange(false);
    navigate({ to: '/dashboard' });
  }, [onOpenChange, navigate]);

  // TODO: Get running agent counts from store
  const getRunningCount = (projectId: string) => 0;

  // Determine if we should show the current project name in the trigger
  // Don't show if it's already visible as a pinned project
  const currentProjectIsPinned = currentProject && pinnedProjectIds.includes(currentProject.id);
  const shouldShowProjectName = showCurrentProjectName && currentProject && !currentProjectIsPinned;

  return (
    <DropdownMenu open={isOpen} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium',
            'transition-all duration-200',
            'hover:bg-accent/50',
            'text-foreground'
          )}
        >
          {shouldShowProjectName && (
            <span className="truncate max-w-[200px]">{currentProject.name}</span>
          )}
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {/* Pinned Projects */}
        {pinnedProjects.length > 0 && (
          <>
            <DropdownMenuLabel className="text-xs text-muted-foreground">Pinned</DropdownMenuLabel>
            {pinnedProjects.map((project) => {
              const isActive = currentProject?.id === project.id;
              const runningCount = getRunningCount(project.id);

              return (
                <DropdownMenuItem
                  key={project.id}
                  onClick={() => handleSelectProject(project)}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {isActive && <Check className="h-4 w-4 text-primary shrink-0" />}
                    <span className={cn('truncate', !isActive && 'ml-6')}>{project.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {runningCount > 0 && (
                      <span className="text-xs text-green-500 flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                        {runningCount}
                      </span>
                    )}
                    <button
                      onClick={(e) => handleTogglePin(e, project.id)}
                      className="p-0.5 hover:bg-accent rounded"
                    >
                      <Star className="h-3.5 w-3.5 fill-yellow-500 text-yellow-500" />
                    </button>
                  </div>
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
          </>
        )}

        {/* Other Projects */}
        {unpinnedProjects.length > 0 && (
          <>
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Other Projects
            </DropdownMenuLabel>
            {unpinnedProjects.map((project) => {
              const isActive = currentProject?.id === project.id;
              const runningCount = getRunningCount(project.id);

              return (
                <DropdownMenuItem
                  key={project.id}
                  onClick={() => handleSelectProject(project)}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {isActive && <Check className="h-4 w-4 text-primary shrink-0" />}
                    <span className={cn('truncate', !isActive && 'ml-6')}>{project.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {runningCount > 0 && (
                      <span className="text-xs text-green-500 flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                        {runningCount}
                      </span>
                    )}
                    <button
                      onClick={(e) => handleTogglePin(e, project.id)}
                      className="p-0.5 hover:bg-accent rounded"
                    >
                      <Star className="h-3.5 w-3.5 text-muted-foreground hover:text-yellow-500" />
                    </button>
                  </div>
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
          </>
        )}

        {/* Actions */}
        <DropdownMenuItem onClick={handleNewProject}>
          <Plus className="h-4 w-4 mr-2" />
          New Project
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleOpenFolder}>
          <FolderOpen className="h-4 w-4 mr-2" />
          Open Folder
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleAllProjects}>
          <FolderOpen className="h-4 w-4 mr-2" />
          All Projects
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
