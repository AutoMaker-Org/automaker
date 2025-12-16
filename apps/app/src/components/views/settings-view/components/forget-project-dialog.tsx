import { Folder } from "lucide-react";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import type { Project } from "@/lib/electron";

interface ForgetProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project | null;
  onConfirm: (projectId: string) => void;
}

export function ForgetProjectDialog({
  open,
  onOpenChange,
  project,
  onConfirm,
}: ForgetProjectDialogProps) {
  const handleConfirm = () => {
    if (project) {
      onConfirm(project.id);
    }
  };

  return (
    <DeleteConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={handleConfirm}
      title="Forget Project"
      description="Are you sure you want to forget this project?"
      confirmText="Forget Project"
      testId="forget-project-dialog"
      confirmTestId="confirm-forget-project"
    >
      {project && (
        <>
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

          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              This will remove the project from Automaker&apos;s
              registry, but will NOT delete any files on disk.
            </p>
            <p className="text-sm text-muted-foreground">
              You can add this project back later by opening it
              again.
            </p>
          </div>
        </>
      )}
    </DeleteConfirmDialog>
  );
}
