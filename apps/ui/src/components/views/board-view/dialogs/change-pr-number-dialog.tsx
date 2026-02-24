import { useState, useEffect, useCallback } from 'react';
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
import { GitPullRequest } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { getElectronAPI } from '@/lib/electron';
import { toast } from 'sonner';

interface WorktreeInfo {
  path: string;
  branch: string;
  isMain: boolean;
  pr?: {
    number: number;
    url: string;
    title: string;
    state: string;
    createdAt: string;
  };
}

interface ChangePRNumberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  worktree: WorktreeInfo | null;
  projectPath: string | null;
  onChanged: () => void;
}

export function ChangePRNumberDialog({
  open,
  onOpenChange,
  worktree,
  projectPath,
  onChanged,
}: ChangePRNumberDialogProps) {
  const [prNumberInput, setPrNumberInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize with current PR number when dialog opens
  useEffect(() => {
    if (open && worktree?.pr?.number) {
      setPrNumberInput(String(worktree.pr.number));
    } else if (open) {
      setPrNumberInput('');
    }
    setError(null);
  }, [open, worktree]);

  const handleSubmit = useCallback(async () => {
    if (!worktree) return;

    const trimmed = prNumberInput.trim();
    if (!/^\d+$/.test(trimmed)) {
      setError('Please enter a valid positive PR number');
      return;
    }
    const prNumber = Number(trimmed);
    if (prNumber <= 0) {
      setError('Please enter a valid positive PR number');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const api = getElectronAPI();
      if (!api?.worktree?.updatePRNumber) {
        setError('Worktree API not available');
        return;
      }

      const result = await api.worktree.updatePRNumber(
        worktree.path,
        prNumber,
        projectPath || undefined
      );

      if (result.success) {
        const prInfo = result.result?.prInfo;
        toast.success('PR tracking updated', {
          description: prInfo?.title
            ? `Now tracking PR #${prNumber}: ${prInfo.title}`
            : `Now tracking PR #${prNumber}`,
        });
        onOpenChange(false);
        onChanged();
      } else {
        setError(result.error || 'Failed to update PR number');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update PR number');
    } finally {
      setIsLoading(false);
    }
  }, [worktree, prNumberInput, projectPath, onOpenChange, onChanged]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !isLoading) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [isLoading, handleSubmit]
  );

  if (!worktree) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isLoading) {
          onOpenChange(isOpen);
        }
      }}
    >
      <DialogContent className="sm:max-w-[400px]" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitPullRequest className="w-5 h-5" />
            Change Tracked PR Number
          </DialogTitle>
          <DialogDescription>
            Update which pull request number is tracked for{' '}
            <code className="font-mono bg-muted px-1 rounded">{worktree.branch}</code>.
            {worktree.pr && (
              <span className="block mt-1 text-xs">
                Currently tracking PR #{worktree.pr.number}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="py-2 space-y-3">
          <div className="space-y-2">
            <Label htmlFor="pr-number">Pull Request Number</Label>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-sm">#</span>
              <Input
                id="pr-number"
                type="text"
                inputMode="numeric"
                placeholder="e.g. 42"
                value={prNumberInput}
                onChange={(e) => {
                  setPrNumberInput(e.target.value);
                  setError(null);
                }}
                disabled={isLoading}
                autoFocus
                className="flex-1"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Enter the GitHub PR number to associate with this worktree. The PR info will be
              fetched from GitHub if available.
            </p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading || !prNumberInput.trim()}>
            {isLoading ? (
              <>
                <Spinner size="xs" className="mr-2" />
                Updating...
              </>
            ) : (
              <>
                <GitPullRequest className="w-4 h-4 mr-2" />
                Update PR
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
