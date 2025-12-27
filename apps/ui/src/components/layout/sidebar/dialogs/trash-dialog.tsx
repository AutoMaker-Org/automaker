import { useState } from 'react';
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
            <DialogTitle>Recycle Bin</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Restore projects to the sidebar or delete their folders using your system Trash.
            </DialogDescription>
          </DialogHeader>

          {trashedProjects.length === 0 ? (
            <p className="text-sm text-muted-foreground">Recycle bin is empty.</p>
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
                      Trashed {new Date(project.trashedAt).toLocaleString()}
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
                      Restore
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => onDeleteFromDiskClick(project)}
                      disabled={activeTrashId === project.id}
                      data-testid={`delete-project-disk-${project.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                      {activeTrashId === project.id ? 'Deleting...' : 'Delete from disk'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => deleteTrashedProject(project.id)}
                      data-testid={`remove-project-${project.id}`}
                    >
                      <X className="h-3.5 w-3.5 mr-1.5" />
                      Remove from list
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <DialogFooter className="flex justify-between">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            {trashedProjects.length > 0 && (
              <Button
                variant="outline"
                onClick={onEmptyTrashClick}
                disabled={isEmptyingTrash}
                data-testid="empty-trash"
              >
                {isEmptyingTrash ? 'Clearing...' : 'Empty Recycle Bin'}
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
          title={`Delete "${deleteFromDiskProject.name}" from disk?`}
          description="This sends the folder to your system Trash."
          confirmText="Delete from disk"
          testId="delete-from-disk-confirm-dialog"
          confirmTestId="confirm-delete-from-disk-button"
        />
      )}

      {/* Empty trash confirmation dialog */}
      <ConfirmDialog
        open={showEmptyTrashConfirm}
        onOpenChange={setShowEmptyTrashConfirm}
        onConfirm={onConfirmEmptyTrash}
        title="Empty Recycle Bin"
        description="Clear all projects from recycle bin? This does not delete folders from disk."
        confirmText="Empty"
        confirmVariant="destructive"
        icon={Trash2}
        iconClassName="text-destructive"
      />
    </>
  );
}
