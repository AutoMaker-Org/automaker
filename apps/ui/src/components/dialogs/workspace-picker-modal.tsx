import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Folder, Loader2, FolderOpen, AlertCircle } from 'lucide-react';
import { getHttpApiClient } from '@/lib/http-api-client';

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
  const { t } = useTranslation('common');
  const [isLoading, setIsLoading] = useState(false);
  const [directories, setDirectories] = useState<WorkspaceDirectory[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadDirectories = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const client = getHttpApiClient();
      const result = await client.workspace.getDirectories();

      if (result.success && result.directories) {
        setDirectories(result.directories);
      } else {
        setError(result.error || 'Failed to load directories');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load directories');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load directories when modal opens
  useEffect(() => {
    if (open) {
      loadDirectories();
    }
  }, [open, loadDirectories]);

  const handleSelect = (dir: WorkspaceDirectory) => {
    onSelect(dir.path, dir.name);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <FolderOpen className="w-5 h-5 text-brand-500" />
            {t('dialogs.workspacePicker.title')}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {t('dialogs.workspacePicker.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4 min-h-[200px]">
          {isLoading && (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
              <p className="text-sm text-muted-foreground">
                {t('dialogs.workspacePicker.loadingProjects')}
              </p>
            </div>
          )}

          {error && !isLoading && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-4">
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-destructive" />
              </div>
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="secondary" size="sm" onClick={loadDirectories} className="mt-2">
                {t('buttons.retry')}
              </Button>
            </div>
          )}

          {!isLoading && !error && directories.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-4">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <Folder className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">
                {t('dialogs.workspacePicker.noProjectsFound')}
              </p>
            </div>
          )}

          {!isLoading && !error && directories.length > 0 && (
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
            {t('buttons.cancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
