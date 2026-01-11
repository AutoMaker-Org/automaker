import { useState } from 'react';
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
import { GitBranch, Loader2, AlertCircle } from 'lucide-react';
import { getElectronAPI } from '@/lib/electron';
import { toast } from 'sonner';

/**
 * Parse git/worktree error messages and return user-friendly versions
 */
function parseWorktreeError(error: string): { title: string; description?: string } {
  const errorLower = error.toLowerCase();

  // Worktree already exists
  if (errorLower.includes('already exists') && errorLower.includes('worktree')) {
    return {
      title: 'A worktree with this name already exists',
      description: 'Try a different branch name or delete the existing worktree first.',
    };
  }

  // Branch already checked out in another worktree
  if (
    errorLower.includes('already checked out') ||
    errorLower.includes('is already used by worktree')
  ) {
    return {
      title: 'This branch is already in use',
      description: 'The branch is checked out in another worktree. Use a different branch name.',
    };
  }

  // Branch name conflicts with existing branch
  if (errorLower.includes('already exists') && errorLower.includes('branch')) {
    return {
      title: 'A branch with this name already exists',
      description: 'The worktree will use the existing branch, or try a different name.',
    };
  }

  // Not a git repository
  if (errorLower.includes('not a git repository')) {
    return {
      title: 'Not a git repository',
      description: 'Initialize git in this project first with "git init".',
    };
  }

  // Lock file exists (another git operation in progress)
  if (errorLower.includes('.lock') || errorLower.includes('lock file')) {
    return {
      title: 'Another git operation is in progress',
      description: 'Wait for it to complete or remove stale lock files.',
    };
  }

  // Permission denied
  if (errorLower.includes('permission denied') || errorLower.includes('access denied')) {
    return {
      title: 'Permission denied',
      description: 'Check file permissions for the project directory.',
    };
  }

  // Default: return original error but cleaned up
  return {
    title: error.replace(/^(fatal|error):\s*/i, '').split('\n')[0],
  };
}

interface CreatedWorktreeInfo {
  path: string;
  branch: string;
}

interface CreateWorktreeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectPath: string;
  onCreated: (worktree: CreatedWorktreeInfo) => void;
}

export function CreateWorktreeDialog({
  open,
  onOpenChange,
  projectPath,
  onCreated,
}: CreateWorktreeDialogProps) {
  const [branchName, setBranchName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<{ title: string; description?: string } | null>(null);

  const handleCreate = async () => {
    if (!branchName.trim()) {
      setError({ title: 'Branch name is required' });
      return;
    }

    // Validate branch name (git-compatible)
    const validBranchRegex = /^[a-zA-Z0-9._/-]+$/;
    if (!validBranchRegex.test(branchName)) {
      setError({
        title: 'Invalid branch name',
        description: 'Use only letters, numbers, dots, underscores, hyphens, and slashes.',
      });
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const api = getElectronAPI();
      if (!api?.worktree?.create) {
        setError({ title: 'Worktree API not available' });
        return;
      }
      const result = await api.worktree.create(projectPath, branchName);

      if (result.success && result.worktree) {
        toast.success(`Worktree created for branch "${result.worktree.branch}"`, {
          description: result.worktree.isNew ? 'New branch created' : 'Using existing branch',
        });
        onCreated({ path: result.worktree.path, branch: result.worktree.branch });
        onOpenChange(false);
        setBranchName('');
      } else {
        setError(parseWorktreeError(result.error || 'Failed to create worktree'));
      }
    } catch (err) {
      setError(
        parseWorktreeError(err instanceof Error ? err.message : 'Failed to create worktree')
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isLoading && branchName.trim()) {
      handleCreate();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="w-5 h-5" />
            Create New Worktree
          </DialogTitle>
          <DialogDescription>
            Create a new git worktree with its own branch. This allows you to work on multiple
            features in parallel.
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
              onKeyDown={handleKeyDown}
              className="font-mono text-sm"
              autoFocus
            />
            {error && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/20">
                <AlertCircle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-destructive">{error.title}</p>
                  {error.description && (
                    <p className="text-xs text-destructive/80">{error.description}</p>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="text-xs text-muted-foreground space-y-1">
            <p>Examples:</p>
            <ul className="list-disc list-inside pl-2 space-y-0.5">
              <li>
                <code className="bg-muted px-1 rounded">feature/user-auth</code>
              </li>
              <li>
                <code className="bg-muted px-1 rounded">fix/login-bug</code>
              </li>
              <li>
                <code className="bg-muted px-1 rounded">hotfix/security-patch</code>
              </li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={isLoading || !branchName.trim()}>
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <GitBranch className="w-4 h-4 mr-2" />
                Create Worktree
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
