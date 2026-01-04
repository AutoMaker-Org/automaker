import { useState, useEffect } from 'react';
import { createLogger } from '@automaker/utils/logger';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getElectronAPI } from '@/lib/electron';
import { toast } from 'sonner';
import { GitBranchPlus, Loader2 } from 'lucide-react';

interface WorktreeInfo {
  path: string;
  branch: string;
  isMain: boolean;
  hasChanges?: boolean;
  changedFilesCount?: number;
}

const logger = createLogger('CreateBranchDialog');

interface CreateBranchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  worktree: WorktreeInfo | null;
  onCreated: () => void;
}

export function CreateBranchDialog({
  open,
  onOpenChange,
  worktree,
  onCreated,
}: CreateBranchDialogProps) {
  const [branchName, setBranchName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open) {
      setBranchName('');
      setError(null);
    }
  }, [open]);

  const handleCreate = async () => {
    if (!worktree || !branchName.trim()) return;

    // Basic validation
    const invalidChars = /[\s~^:?*[\]\\]/;
    if (invalidChars.test(branchName)) {
      setError('Branch name contains invalid characters');
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const api = getElectronAPI();
      if (!api?.worktree?.checkoutBranch) {
        toast.error('Branch API not available');
        return;
      }

      const result = await api.worktree.checkoutBranch(worktree.path, branchName.trim());

      if (result.success && result.result) {
        toast.success(result.result.message);
        onCreated();
        onOpenChange(false);
      } else {
        setError(result.error || 'Failed to create branch');
      }
    } catch (err) {
      logger.error('Create branch failed:', err);
      setError('Failed to create branch');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranchPlus className="w-5 h-5" />
            Create New Branch
          </DialogTitle>
          <DialogDescription>
            Create a new branch from{' '}
            <span className="font-mono text-foreground">
              {worktree?.branch || 'current branch'}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="branch-name">Branch Name</Label>
            <Input
              id="branch-name"
              placeholder="feature/my-new-feature"
              value={branchName}
              onChange={(e) => {
                setBranchName(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && branchName.trim() && !isCreating) {
                  handleCreate();
                }
              }}
              disabled={isCreating}
              autoFocus
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isCreating}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!branchName.trim() || isCreating}>
            {isCreating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Branch'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
