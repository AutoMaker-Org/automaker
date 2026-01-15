import { Plus, FolderOpen, Recycle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { formatShortcut } from '@/store/app-store';
import type { TrashedProject } from '@/lib/electron';

interface ProjectActionsProps {
  setShowNewProjectModal: (show: boolean) => void;
  handleOpenFolder: () => void;
  setShowTrashDialog: (show: boolean) => void;
  trashedProjects: TrashedProject[];
  shortcuts: {
    openProject: string;
  };
}

export function ProjectActions({
  setShowNewProjectModal,
  handleOpenFolder,
  setShowTrashDialog,
  trashedProjects,
  shortcuts,
}: ProjectActionsProps) {
  const { t } = useTranslation('common');

  return (
    <div className="flex items-center gap-2.5 titlebar-no-drag px-3 mt-5">
      <button
        onClick={() => setShowNewProjectModal(true)}
        className={cn(
          'group flex items-center justify-center flex-1 px-3 py-2.5 rounded-xl',
          'relative overflow-hidden',
          'text-muted-foreground hover:text-foreground',
          // Glass background with gradient on hover
          'bg-accent/20 hover:bg-gradient-to-br hover:from-brand-500/15 hover:to-brand-600/10',
          'border border-border/40 hover:border-brand-500/30',
          // Premium shadow
          'shadow-sm hover:shadow-md hover:shadow-brand-500/5',
          'transition-all duration-200 ease-out',
          'hover:scale-[1.02] active:scale-[0.97]'
        )}
        title={t('sidebar.newProject')}
        data-testid="new-project-button"
      >
        <Plus className="w-4 h-4 shrink-0 transition-transform duration-200 group-hover:rotate-90 group-hover:text-brand-500" />
        <span className="ml-2 text-sm font-medium block whitespace-nowrap">{t('sidebar.new')}</span>
      </button>
      <button
        onClick={handleOpenFolder}
        className={cn(
          'group flex items-center justify-center flex-1 px-3 py-2.5 rounded-xl',
          'relative overflow-hidden',
          'text-muted-foreground hover:text-foreground',
          // Glass background
          'bg-accent/20 hover:bg-accent/40',
          'border border-border/40 hover:border-border/60',
          'shadow-sm hover:shadow-md',
          'transition-all duration-200 ease-out',
          'hover:scale-[1.02] active:scale-[0.97]'
        )}
        title={`${t('sidebar.openFolder')} (${shortcuts.openProject})`}
        data-testid="open-project-button"
      >
        <FolderOpen className="w-4 h-4 shrink-0 transition-transform duration-200 group-hover:scale-110" />
        <span className="flex items-center justify-center min-w-5 h-5 px-1.5 text-[10px] font-mono rounded-md bg-muted/80 text-muted-foreground ml-2">
          {formatShortcut(shortcuts.openProject, true)}
        </span>
      </button>
      <button
        onClick={() => setShowTrashDialog(true)}
        className={cn(
          'group flex items-center justify-center px-3 h-[42px] rounded-xl',
          'relative',
          'text-muted-foreground hover:text-destructive',
          // Subtle background that turns red on hover
          'bg-accent/20 hover:bg-destructive/15',
          'border border-border/40 hover:border-destructive/40',
          'shadow-sm hover:shadow-md hover:shadow-destructive/10',
          'transition-all duration-200 ease-out',
          'hover:scale-[1.02] active:scale-[0.97]'
        )}
        title={t('sidebar.recycleBin')}
        data-testid="trash-button"
      >
        <Recycle className="size-4 shrink-0 transition-transform duration-200 group-hover:rotate-12" />
        {trashedProjects.length > 0 && (
          <span className="absolute -top-1.5 -right-1.5 z-10 flex items-center justify-center min-w-4 h-4 px-1 text-[9px] font-bold rounded-full bg-red-500 text-white shadow-md ring-1 ring-red-600/50">
            {trashedProjects.length > 9 ? '9+' : trashedProjects.length}
          </span>
        )}
      </button>
    </div>
  );
}
