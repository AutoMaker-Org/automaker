import { Trash2, Folder } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Project } from "@/lib/electron";

interface DeleteProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project | null;
  onConfirm: (projectId: string) => void;
}

export function DeleteProjectDialog({
  open,
  onOpenChange,
  project,
  onConfirm,
}: DeleteProjectDialogProps) {
  const handleConfirm = () => {
    if (project) {
      onConfirm(project.id);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-popover border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-destructive" />
            Delete Project
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Are you sure you want to move this project to Trash?
          </DialogDescription>
        </DialogHeader>

        {project && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-sidebar-accent/10 border border-sidebar-border">
            <div className="w-10 h-10 rounded-lg bg-sidebar-accent/20 border border-sidebar-border flex items-center justify-center shrink-0">
              <Folder className="w-5 h-5 text-brand-500" />
            </div>
            <div className="min-w-0">
              <p className="font-medium text-foreground truncate">
                {project.name}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {project.path}
              </p>
            </div>
          </div>
        )}

        <p className="text-sm text-muted-foreground">
          The folder will remain on disk until you permanently delete it from
          Trash.
        </p>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            data-testid="confirm-delete-project"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Move to Trash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
