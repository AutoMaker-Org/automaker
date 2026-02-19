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
import { GitMerge, AlertTriangle, Trash2, Wrench, Sparkles, XCircle } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { getElectronAPI } from '@/lib/electron';
import { toast } from 'sonner';
import { BranchAutocomplete } from '@/components/ui/branch-autocomplete';
import type { WorktreeInfo, BranchInfo, MergeConflictInfo } from '../worktree-panel/types';

export type { MergeConflictInfo } from '../worktree-panel/types';

interface MergeWorktreeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectPath: string;
  worktree: WorktreeInfo | null;
  /** Called when integration is successful. integratedWorktree indicates the integrated worktree and deletedBranch indicates if the branch was also deleted. */
  onIntegrated: (integratedWorktree: WorktreeInfo, deletedBranch: boolean) => void;
  onCreateConflictResolutionFeature?: (conflictInfo: MergeConflictInfo) => void;
}

export function MergeWorktreeDialog({
  open,
  onOpenChange,
  projectPath,
  worktree,
  onIntegrated,
  onCreateConflictResolutionFeature,
}: MergeWorktreeDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [targetBranch, setTargetBranch] = useState('main');
  const [availableBranches, setAvailableBranches] = useState<string[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [deleteWorktreeAndBranch, setDeleteWorktreeAndBranch] = useState(false);
  const [mergeConflict, setMergeConflict] = useState<MergeConflictInfo | null>(null);

  // Fetch available branches when dialog opens
  useEffect(() => {
    if (open && worktree && projectPath) {
      setLoadingBranches(true);
      const api = getElectronAPI();
      if (api?.worktree?.listBranches) {
        api.worktree
          .listBranches(projectPath, false)
          .then((result) => {
            if (result.success && result.result?.branches) {
              // Filter out the source branch (can't merge into itself) and remote branches
              const branches = result.result.branches
                .filter((b: BranchInfo) => !b.isRemote && b.name !== worktree.branch)
                .map((b: BranchInfo) => b.name);
              setAvailableBranches(branches);
            }
          })
          .catch((err) => {
            console.error('Failed to fetch branches:', err);
          })
          .finally(() => {
            setLoadingBranches(false);
          });
      } else {
        setLoadingBranches(false);
      }
    }
  }, [open, worktree, projectPath]);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setIsLoading(false);
      setTargetBranch('main');
      setDeleteWorktreeAndBranch(false);
      setMergeConflict(null);
    }
  }, [open]);

  const handleMerge = async () => {
    if (!worktree) return;

    setIsLoading(true);
    try {
      const api = getElectronAPI();
      if (!api?.worktree?.mergeFeature) {
        toast.error('Worktree API not available');
        return;
      }

      // Pass branchName, worktreePath, targetBranch, and options to the API
      const result = await api.worktree.mergeFeature(
        projectPath,
        worktree.branch,
        worktree.path,
        targetBranch,
        { deleteWorktreeAndBranch }
      );

      if (result.success) {
        const description = deleteWorktreeAndBranch
          ? `Branch "${worktree.branch}" has been integrated into "${targetBranch}" and the worktree and branch were deleted`
          : `Branch "${worktree.branch}" has been integrated into "${targetBranch}"`;
        toast.success(`Branch integrated into ${targetBranch}`, { description });
        onIntegrated(worktree, deleteWorktreeAndBranch);
        onOpenChange(false);
      } else {
        // Check if the error indicates merge conflicts
        const errorMessage = result.error || '';
        const hasConflicts =
          errorMessage.toLowerCase().includes('conflict') ||
          errorMessage.toLowerCase().includes('merge failed') ||
          errorMessage.includes('CONFLICT') ||
          result.hasConflicts;

        if (hasConflicts) {
          // Set merge conflict state to show the conflict resolution UI
          setMergeConflict({
            sourceBranch: worktree.branch,
            targetBranch: targetBranch,
            targetWorktreePath: projectPath, // The merge happens in the target branch's worktree
            conflictFiles: result.conflictFiles || [],
            operationType: 'merge',
          });
          toast.error('Integrate conflicts detected', {
            description: 'Choose how to resolve the conflicts below.',
          });
        } else {
          toast.error('Failed to integrate branch', {
            description: result.error,
          });
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      // Check if the error indicates merge conflicts
      const hasConflicts =
        errorMessage.toLowerCase().includes('conflict') ||
        errorMessage.toLowerCase().includes('merge failed') ||
        errorMessage.includes('CONFLICT');

      if (hasConflicts) {
        setMergeConflict({
          sourceBranch: worktree.branch,
          targetBranch: targetBranch,
          targetWorktreePath: projectPath,
          conflictFiles: [],
          operationType: 'merge',
        });
        toast.error('Integrate conflicts detected', {
          description: 'Choose how to resolve the conflicts below.',
        });
      } else {
        toast.error('Failed to integrate branch', {
          description: errorMessage,
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResolveWithAI = () => {
    if (mergeConflict && onCreateConflictResolutionFeature) {
      onCreateConflictResolutionFeature(mergeConflict);
      onOpenChange(false);
    }
  };

  const handleResolveManually = () => {
    toast.info('Conflict markers left in place', {
      description: 'Edit the conflicting files to resolve conflicts manually.',
      duration: 6000,
    });
    onOpenChange(false);
  };

  if (!worktree) return null;

  // Show conflict resolution UI if there are merge conflicts
  if (mergeConflict) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              Integrate Conflicts Detected
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-4">
                <span className="block">
                  There are conflicts when integrating{' '}
                  <code className="font-mono bg-muted px-1 rounded">
                    {mergeConflict.sourceBranch}
                  </code>{' '}
                  into{' '}
                  <code className="font-mono bg-muted px-1 rounded">
                    {mergeConflict.targetBranch}
                  </code>
                  .
                </span>

                {mergeConflict.conflictFiles && mergeConflict.conflictFiles.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-sm font-medium text-foreground">
                      Conflicting files ({mergeConflict.conflictFiles.length}):
                    </span>
                    <div className="border border-border rounded-lg overflow-hidden max-h-[200px] overflow-y-auto scrollbar-visible">
                      {mergeConflict.conflictFiles.map((file) => (
                        <div
                          key={file}
                          className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono border-b border-border last:border-b-0 hover:bg-accent/30"
                        >
                          <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                          <span className="truncate">{file}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-2 p-3 rounded-md bg-muted/50 border border-border">
                  <p className="text-sm text-muted-foreground font-medium mb-2">
                    Choose how to resolve:
                  </p>
                  <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                    <li>
                      <strong>Resolve with AI</strong> &mdash; Creates a task to analyze and resolve
                      conflicts automatically
                    </li>
                    <li>
                      <strong>Resolve Manually</strong> &mdash; Leaves conflict markers in place for
                      you to edit directly
                    </li>
                  </ul>
                </div>
              </div>
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setMergeConflict(null)}>
              Back
            </Button>
            <Button variant="outline" onClick={handleResolveManually}>
              <Wrench className="w-4 h-4 mr-2" />
              Resolve Manually
            </Button>
            {onCreateConflictResolutionFeature && (
              <Button
                onClick={handleResolveWithAI}
                className="bg-purple-600 hover:bg-purple-700 text-white"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Resolve with AI
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="w-5 h-5 text-green-600" />
            Integrate Branch
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-4">
              <span className="block">
                Integrate <code className="font-mono bg-muted px-1 rounded">{worktree.branch}</code>{' '}
                into:
              </span>

              <div className="space-y-2">
                <Label htmlFor="target-branch" className="text-sm text-foreground">
                  Target Branch
                </Label>
                {loadingBranches ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Spinner size="sm" />
                    Loading branches...
                  </div>
                ) : (
                  <BranchAutocomplete
                    value={targetBranch}
                    onChange={setTargetBranch}
                    branches={availableBranches}
                    placeholder="Select target branch..."
                    data-testid="merge-target-branch"
                  />
                )}
              </div>

              {worktree.hasChanges && (
                <div className="flex items-start gap-2 p-3 rounded-md bg-yellow-500/10 border border-yellow-500/20">
                  <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                  <span className="text-yellow-500 text-sm">
                    This worktree has {worktree.changedFilesCount} uncommitted change(s). Please
                    commit or discard them before integrating.
                  </span>
                </div>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center space-x-2 py-2">
          <Checkbox
            id="delete-worktree-branch"
            checked={deleteWorktreeAndBranch}
            onCheckedChange={(checked) => setDeleteWorktreeAndBranch(checked === true)}
          />
          <Label
            htmlFor="delete-worktree-branch"
            className="text-sm cursor-pointer flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5 text-destructive" />
            Delete worktree and branch after integrating
          </Label>
        </div>

        {deleteWorktreeAndBranch && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-orange-500/10 border border-orange-500/20">
            <AlertTriangle className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
            <span className="text-orange-500 text-sm">
              The worktree and branch will be permanently deleted. Any features assigned to this
              branch will be unassigned.
            </span>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleMerge}
            disabled={worktree.hasChanges || !targetBranch || loadingBranches || isLoading}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {isLoading ? (
              <>
                <Spinner size="sm" variant="foreground" className="mr-2" />
                Integrating...
              </>
            ) : (
              <>
                <GitMerge className="w-4 h-4 mr-2" />
                Integrate
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
