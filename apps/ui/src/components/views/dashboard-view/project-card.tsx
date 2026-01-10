import { useCallback } from 'react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import type { Project } from '@/lib/electron';
import { Card, CardContent } from '@/components/ui/card';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Folder, Star, Settings, Trash2, MoreVertical } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface ProjectCardProps {
  project: Project;
  onClick: () => void;
}

export function ProjectCard({ project, onClick }: ProjectCardProps) {
  const { pinnedProjectIds, pinProject, unpinProject, moveProjectToTrash, getAutoModeState } =
    useAppStore();

  const isPinned = pinnedProjectIds.includes(project.id);
  const autoModeState = getAutoModeState(project.id);
  const runningCount = autoModeState?.runningTasks?.length ?? 0;

  const handleTogglePin = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isPinned) {
        unpinProject(project.id);
      } else {
        pinProject(project.id);
      }
    },
    [isPinned, project.id, pinProject, unpinProject]
  );

  const handleRemove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      moveProjectToTrash(project.id);
    },
    [project.id, moveProjectToTrash]
  );

  const lastOpened = project.lastOpened
    ? formatDistanceToNow(new Date(project.lastOpened), { addSuffix: true })
    : 'Never opened';

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <Card
          className={cn(
            'cursor-pointer transition-all duration-200',
            'hover:bg-accent/50 hover:border-accent-foreground/20',
            'group'
          )}
          onClick={onClick}
        >
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div
                  className={cn(
                    'flex items-center justify-center h-10 w-10 rounded-lg',
                    'bg-primary/10 text-primary'
                  )}
                >
                  <Folder className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium truncate">{project.name}</h3>
                    {isPinned && (
                      <Star className="h-3.5 w-3.5 fill-yellow-500 text-yellow-500 shrink-0" />
                    )}
                    {runningCount > 0 && (
                      <span className="flex items-center gap-1 text-xs text-green-500 shrink-0">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                        {runningCount}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{project.path}</p>
                </div>
              </div>
              <button
                onClick={handleTogglePin}
                className={cn(
                  'p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity',
                  'hover:bg-accent'
                )}
              >
                <Star
                  className={cn(
                    'h-4 w-4',
                    isPinned
                      ? 'fill-yellow-500 text-yellow-500'
                      : 'text-muted-foreground hover:text-yellow-500'
                  )}
                />
              </button>
            </div>
            <div className="mt-3 pt-3 border-t border-border/50">
              <p className="text-xs text-muted-foreground">{lastOpened}</p>
            </div>
          </CardContent>
        </Card>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={onClick}>Open Project</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={handleTogglePin}>
          <Star className="h-4 w-4 mr-2" />
          {isPinned ? 'Unpin from bar' : 'Pin to bar'}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={handleRemove} className="text-destructive focus:text-destructive">
          <Trash2 className="h-4 w-4 mr-2" />
          Remove Project
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
