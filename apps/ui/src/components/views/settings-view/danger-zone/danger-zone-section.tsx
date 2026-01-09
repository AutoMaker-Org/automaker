import { Button } from '@/components/ui/button';
import { Trash2, Folder, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Project } from '../shared/types';

interface DangerZoneSectionProps {
  project: Project | null;
  onDeleteClick: () => void;
}

export function DangerZoneSection({ project, onDeleteClick }: DangerZoneSectionProps) {
  return (
    <div
      className={cn(
        'rounded-2xl overflow-hidden',
        'border border-destructive/30',
        'bg-gradient-to-br from-destructive/5 via-card/70 to-card/80 backdrop-blur-xl',
        'shadow-sm shadow-destructive/5'
      )}
    >
      <div className="p-6 border-b border-destructive/20 bg-gradient-to-r from-destructive/5 via-transparent to-transparent">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-destructive/20 to-destructive/10 flex items-center justify-center border border-destructive/20">
            <AlertTriangle className="w-5 h-5 text-destructive" />
          </div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">Danger Zone</h2>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">Destructive project actions.</p>
      </div>
      <div className="p-6 space-y-4">
        {/* Project Delete */}
        {project ? (
          <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-destructive/5 border border-destructive/10">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-brand-500/15 to-brand-600/10 border border-brand-500/20 flex items-center justify-center shrink-0">
                <Folder className="w-5 h-5 text-brand-500" />
              </div>
              <div className="min-w-0">
                <p className="font-medium text-foreground truncate">{project.name}</p>
                <p className="text-xs text-muted-foreground/70 truncate mt-0.5">{project.path}</p>
              </div>
            </div>
            <Button
              variant="destructive"
              onClick={onDeleteClick}
              data-testid="delete-project-button"
              className={cn(
                'shrink-0',
                'shadow-md shadow-destructive/20 hover:shadow-lg hover:shadow-destructive/25',
                'transition-all duration-200 ease-out',
                'hover:scale-[1.02] active:scale-[0.98]'
              )}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Project
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground/60 text-center py-4">No project selected.</p>
        )}
      </div>
    </div>
  );
}
