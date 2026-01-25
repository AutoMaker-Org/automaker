import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Folder, FolderOpen, AlertCircle } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { useWorkspaceDirectories } from '@/hooks/queries';

interface WorkspaceDirectory {
  name: string;
  path: string;
}

interface WorkspacePickerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (path: string, name: string) => void;
}

export function WorkspacePickerModal({ open, onOpenChange, onSelect }: WorkspacePickerModalProps) {
  // React Query hook - only fetch when modal is open
  const { data: directories = [], isLoading, error, refetch } = useWorkspaceDirectories(open);

  const handleSelect = (dir: WorkspaceDirectory) => {
    onSelect(dir.path, dir.name);
  };

  const errorMessage = error instanceof Error ? error.message : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <FolderOpen className="w-5 h-5 text-brand-500" />
            Select Project
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Choose a project from your workspace directory
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4 min-h-[200px]">
          {isLoading && (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <Spinner size="xl" />
              <p className="text-sm text-muted-foreground">Loading projects...</p>
            </div>
          )}

          {errorMessage && !isLoading && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-4">
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-destructive" />
              </div>
              <p className="text-sm text-destructive">{errorMessage}</p>
              <Button variant="secondary" size="sm" onClick={() => refetch()} className="mt-2">
                Try Again
              </Button>
            </div>
          )}

          {!isLoading && !errorMessage && directories.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-4">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <Folder className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">
                No projects found in workspace directory
              </p>
            </div>
          )}

          {!isLoading && !errorMessage && directories.length > 0 && (
            <div className="space-y-2">
              {directories.map((dir) => (
                <button
                  key={dir.path}
                  onClick={() => handleSelect(dir)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-card/70 hover:border-brand-500/50 transition-all duration-200 text-left group"
                  data-testid={`workspace-dir-${dir.name}`}
                >
                  <div className="w-10 h-10 rounded-lg bg-muted border border-border flex items-center justify-center group-hover:border-brand-500/50 transition-colors shrink-0">
                    <Folder className="w-5 h-5 text-muted-foreground group-hover:text-brand-500 transition-colors" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate group-hover:text-brand-500 transition-colors">
                      {dir.name}
                    </p>
                    <p className="text-xs text-muted-foreground/70 truncate">{dir.path}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:text-foreground hover:bg-accent"
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
