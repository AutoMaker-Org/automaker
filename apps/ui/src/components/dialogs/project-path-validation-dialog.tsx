import { FolderX, RefreshCw, Trash2, AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { HotkeyButton } from '@/components/ui/hotkey-button';
import type { Project } from '@/lib/electron';
import { useFileBrowser } from '@/contexts/file-browser-context';

interface ProjectPathValidationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project | null;
  onRefreshPath: (project: Project, newPath: string) => Promise<void>;
  onRemoveProject: (project: Project) => void;
  onDismiss?: () => void;
}

export function ProjectPathValidationDialog({
  open,
  onOpenChange,
  project,
  onRefreshPath,
  onRemoveProject,
  onDismiss,
}: ProjectPathValidationDialogProps) {
  const { openFileBrowser } = useFileBrowser();

  const handleRefreshPath = async () => {
    if (!project) return;

    const newPath = await openFileBrowser({
      title: 'Select New Project Location',
      description: 'Choose the new directory for this project',
      initialPath: project.path,
    });

    if (!newPath) {
      // User cancelled - stay on dialog
      return;
    }

    await onRefreshPath(project, newPath);
  };

  const handleRemoveProject = () => {
    if (!project) return;
    onRemoveProject(project);
    onOpenChange(false);
  };

  const handleDismiss = () => {
    onDismiss?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md gap-4 shadow-xl border-destructive/20 p-5"
        onInteractOutside={(e) => e.preventDefault()}
        showCloseButton={false}
      >
        <DialogHeader className="space-y-1">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
              <FolderX className="w-4 h-4 text-destructive" />
            </div>
            <DialogTitle className="text-lg">Project Path Not Found</DialogTitle>
          </div>
          <DialogDescription>
            The project directory cannot be found at its saved location.
          </DialogDescription>
        </DialogHeader>

        {project && (
          <div className="space-y-3">
            <div className="bg-muted/30 border rounded-lg p-3 space-y-2">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                <div className="space-y-0.5 min-w-0 flex-1">
                  <p className="font-medium text-sm leading-none truncate">{project.name}</p>
                  <p className="text-xs font-mono text-muted-foreground break-all opacity-80">
                    {project.path}
                  </p>
                </div>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Select the new location if it was moved, or remove it from your list.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2 mt-2">
          <Button variant="ghost" onClick={handleDismiss} size="sm" className="h-9 px-3">
            Dismiss
          </Button>
          <Button
            variant="outline"
            onClick={handleRemoveProject}
            size="sm"
            className="h-9 px-3 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20 hover:border-destructive/30"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Remove
          </Button>
          <HotkeyButton
            variant="default"
            onClick={handleRefreshPath}
            hotkey={{ key: 'Enter', cmdCtrl: true }}
            hotkeyActive={open}
            size="sm"
            className="h-9 px-3"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Locate Project
          </HotkeyButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
