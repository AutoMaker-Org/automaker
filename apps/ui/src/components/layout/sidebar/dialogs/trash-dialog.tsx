import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Trash2, Undo2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import type { TrashedProject } from '@/lib/electron';

interface TrashDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trashedProjects: TrashedProject[];
  activeTrashId: string | null;
  handleRestoreProject: (id: string) => void;
  handleDeleteProjectFromDisk: (project: TrashedProject) => void;
  deleteTrashedProject: (id: string) => void;
  handleEmptyTrash: () => void;
  isEmptyingTrash: boolean;
}

export function TrashDialog({
  open,
  onOpenChange,
  trashedProjects,
  activeTrashId,
  handleRestoreProject,
  handleDeleteProjectFromDisk,
  deleteTrashedProject,
  handleEmptyTrash,
  isEmptyingTrash,
}: TrashDialogProps) {
  const { t } = useTranslation('common');

  // Confirmation dialog state (managed internally to avoid prop drilling)
  const [deleteFromDiskProject, setDeleteFromDiskProject] = useState<TrashedProject | null>(null);
  const [showEmptyTrashConfirm, setShowEmptyTrashConfirm] = useState(false);

  // Reset confirmation dialog state when main dialog closes
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setDeleteFromDiskProject(null);
      setShowEmptyTrashConfirm(false);
    }
    onOpenChange(isOpen);
  };

  const onDeleteFromDiskClick = (project: TrashedProject) => {
    setDeleteFromDiskProject(project);
  };

  const onConfirmDeleteFromDisk = () => {
    if (deleteFromDiskProject) {
      handleDeleteProjectFromDisk(deleteFromDiskProject);
      setDeleteFromDiskProject(null);
    }
  };

  const onEmptyTrashClick = () => {
    setShowEmptyTrashConfirm(true);
  };

  const onConfirmEmptyTrash = () => {
    handleEmptyTrash();
    setShowEmptyTrashConfirm(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="bg-popover/95 backdrop-blur-xl border-border max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('trash.title')}</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {t('trash.description')}
            </DialogDescription>
          </DialogHeader>

          {trashedProjects.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('trash.empty')}</p>
          ) : (
            <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
              {trashedProjects.map((project) => (
                <div
                  key={project.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card/50 p-4"
                >
                  <div className="space-y-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{project.name}</p>
                    <p className="text-xs text-muted-foreground break-all">{project.path}</p>
                    <p className="text-[11px] text-muted-foreground/80">
                      {t('trash.trashed')} {new Date(project.trashedAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleRestoreProject(project.id)}
                      data-testid={`restore-project-${project.id}`}
                    >
                      <Undo2 className="h-3.5 w-3.5 mr-1.5" />
                      {t('trash.restore')}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => onDeleteFromDiskClick(project)}
                      disabled={activeTrashId === project.id}
                      data-testid={`delete-project-disk-${project.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                      {activeTrashId === project.id
                        ? t('trash.deleting')
                        : t('trash.deleteFromDisk')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => deleteTrashedProject(project.id)}
                      data-testid={`remove-project-${project.id}`}
                    >
                      <X className="h-3.5 w-3.5 mr-1.5" />
                      {t('trash.removeFromList')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <DialogFooter className="flex justify-between">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t('buttons.close')}
            </Button>
            {trashedProjects.length > 0 && (
              <Button
                variant="outline"
                onClick={onEmptyTrashClick}
                disabled={isEmptyingTrash}
                data-testid="empty-trash"
              >
                {isEmptyingTrash ? t('trash.clearing') : t('trash.emptyRecycleBin')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete from disk confirmation dialog */}
      {deleteFromDiskProject && (
        <DeleteConfirmDialog
          open
          onOpenChange={(isOpen) => !isOpen && setDeleteFromDiskProject(null)}
          onConfirm={onConfirmDeleteFromDisk}
          title={t('trash.confirmDeleteTitle', { name: deleteFromDiskProject.name })}
          description={t('trash.confirmDeleteDescription')}
          confirmText={t('trash.confirmDeleteButton')}
          testId="delete-from-disk-confirm-dialog"
          confirmTestId="confirm-delete-from-disk-button"
        />
      )}

      {/* Empty trash confirmation dialog */}
      <ConfirmDialog
        open={showEmptyTrashConfirm}
        onOpenChange={setShowEmptyTrashConfirm}
        onConfirm={onConfirmEmptyTrash}
        title={t('trash.emptyTrashTitle')}
        description={t('trash.emptyTrashDescription')}
        confirmText={t('trash.emptyButton')}
        confirmVariant="destructive"
        icon={Trash2}
        iconClassName="text-destructive"
      />
    </>
  );
}
