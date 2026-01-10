import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Loader2, Trash2, AlertTriangle, FileWarning } from 'lucide-react';
import { getElectronAPI } from '@/lib/electron';
import { toast } from 'sonner';

interface WorktreeInfo {
  path: string;
  branch: string;
  isMain: boolean;
  hasChanges?: boolean;
  changedFilesCount?: number;
}

interface DeleteWorktreeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectPath: string;
  worktree: WorktreeInfo | null;
  onDeleted: (
    deletedWorktree: WorktreeInfo,
    deletedBranch: boolean,
    deleteFeatures: boolean
  ) => void;
  /** Number of features assigned to this worktree's branch */
  affectedFeatureCount?: number;
}

export function DeleteWorktreeDialog({
  open,
  onOpenChange,
  projectPath,
  worktree,
  onDeleted,
  affectedFeatureCount = 0,
}: DeleteWorktreeDialogProps) {
  const [deleteBranch, setDeleteBranch] = useState(false);
  const [deleteFeatures, setDeleteFeatures] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Reset checkbox state when dialog closes to prevent accidental data loss
  useEffect(() => {
    if (!open) {
      setDeleteBranch(false);
      setDeleteFeatures(false);
    }
  }, [open]);

  const handleDelete = async () => {
    if (!worktree) return;

    setIsLoading(true);
    try {
      const api = getElectronAPI();
      if (!api?.worktree?.delete) {
        toast.error('Worktree API not available');
        return;
      }
      const result = await api.worktree.delete(projectPath, worktree.path, deleteBranch);

      if (result.success) {
        toast.success(`Worktree deleted`, {
          description: deleteBranch
            ? `Branch "${worktree.branch}" was also deleted`
            : `Branch "${worktree.branch}" was kept`,
        });
        onDeleted(worktree, deleteBranch, deleteFeatures);
        onOpenChange(false); // useEffect will reset checkbox state
      } else {
        toast.error('Failed to delete worktree', {
          description: result.error,
        });
      }
    } catch (err) {
      toast.error('Failed to delete worktree', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!worktree) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-destructive" />
            Delete Worktree
          </DialogTitle>
          <DialogDescription className="space-y-3">
            <span>
              Are you sure you want to delete the worktree for branch{' '}
              <code className="font-mono bg-muted px-1 rounded">{worktree.branch}</code>?
            </span>

            {affectedFeatureCount > 0 && !deleteFeatures && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-orange-500/10 border border-orange-500/20 mt-2">
                <FileWarning className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
                <span className="text-orange-500 text-sm">
                  {affectedFeatureCount} feature{affectedFeatureCount !== 1 ? 's' : ''}{' '}
                  {affectedFeatureCount !== 1 ? 'are' : 'is'} assigned to this branch.{' '}
                  {affectedFeatureCount !== 1 ? 'They' : 'It'} will be unassigned and moved to the
                  main worktree.
                </span>
              </div>
            )}

            {worktree.hasChanges && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-yellow-500/10 border border-yellow-500/20 mt-2">
                <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                <span className="text-yellow-500 text-sm">
                  This worktree has {worktree.changedFilesCount} uncommitted change(s). These will
                  be lost if you proceed.
                </span>
              </div>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="delete-branch"
              checked={deleteBranch}
              onCheckedChange={(checked) => setDeleteBranch(checked === true)}
              disabled={isLoading}
            />
            <Label htmlFor="delete-branch" className="text-sm cursor-pointer">
              Also delete the branch{' '}
              <code className="font-mono bg-muted px-1 rounded">{worktree.branch}</code>
            </Label>
          </div>

          {affectedFeatureCount > 0 && (
            <div className="flex items-center space-x-2">
              <Checkbox
                id="delete-features"
                checked={deleteFeatures}
                onCheckedChange={(checked) => setDeleteFeatures(checked === true)}
                disabled={isLoading}
              />
              <Label htmlFor="delete-features" className="text-sm cursor-pointer text-destructive">
                Delete backlog of this worktree ({affectedFeatureCount} feature
                {affectedFeatureCount !== 1 ? 's' : ''})
              </Label>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
