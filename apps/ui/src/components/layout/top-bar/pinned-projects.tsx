import { useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import type { Project } from '@/lib/electron';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Star, Settings, Trash2 } from 'lucide-react';

interface PinnedProjectsProps {
  pinnedProjects: Project[];
  currentProject: Project | null;
}

export function PinnedProjects({ pinnedProjects, currentProject }: PinnedProjectsProps) {
  const navigate = useNavigate();
  const { setCurrentProject, unpinProject, moveProjectToTrash } = useAppStore();

  const handleProjectClick = useCallback(
    (project: Project) => {
      setCurrentProject(project);
      navigate({ to: '/board' });
    },
    [setCurrentProject, navigate]
  );

  const handleUnpin = useCallback(
    (projectId: string) => {
      unpinProject(projectId);
    },
    [unpinProject]
  );

  const handleProjectSettings = useCallback(
    (project: Project) => {
      setCurrentProject(project);
      navigate({ to: '/settings' });
    },
    [setCurrentProject, navigate]
  );

  const handleRemoveProject = useCallback(
    (projectId: string) => {
      moveProjectToTrash(projectId);
    },
    [moveProjectToTrash]
  );

  if (pinnedProjects.length === 0) {
    return null;
  }

  return (
    <TooltipProvider>
      <div className="flex items-center gap-1">
        {pinnedProjects.map((project) => {
          const isActive = currentProject?.id === project.id;
          // TODO: Get running agent count from store
          const runningCount = 0;

          return (
            <ContextMenu key={project.id}>
              <ContextMenuTrigger>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => handleProjectClick(project)}
                      className={cn(
                        'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium',
                        'transition-all duration-200',
                        'hover:bg-accent/50',
                        isActive && 'bg-accent text-accent-foreground',
                        !isActive && 'text-muted-foreground'
                      )}
                    >
                      <span className="truncate max-w-[120px]">{project.name}</span>
                      {runningCount > 0 && (
                        <span className="flex h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    <div className="font-medium">{project.name}</div>
                    <div className="text-muted-foreground">{project.path}</div>
                    {runningCount > 0 && (
                      <div className="text-green-500 mt-1">
                        {runningCount} agent{runningCount > 1 ? 's' : ''} running
                      </div>
                    )}
                  </TooltipContent>
                </Tooltip>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem onClick={() => handleProjectClick(project)}>Open</ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => handleUnpin(project.id)}>
                  <Star className="h-4 w-4 mr-2" />
                  Unpin from bar
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handleProjectSettings(project)}>
                  <Settings className="h-4 w-4 mr-2" />
                  Project Settings
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                  onClick={() => handleRemoveProject(project.id)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Remove Project
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          );
        })}

        {/* Separator after pinned projects */}
        <div className="h-6 w-px bg-border/60 mx-2" />
      </div>
    </TooltipProvider>
  );
}
