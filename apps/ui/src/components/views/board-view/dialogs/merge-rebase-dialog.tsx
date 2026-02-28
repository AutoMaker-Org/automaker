import { useState, useEffect, useCallback } from 'react';
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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getHttpApiClient } from '@/lib/http-api-client';
import { toast } from 'sonner';
import {
  GitMerge,
  RefreshCw,
  AlertTriangle,
  GitBranch,
  Wrench,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import type { WorktreeInfo, MergeConflictInfo } from '../worktree-panel/types';

export type PullStrategy = 'merge' | 'rebase';

type DialogStep = 'select' | 'executing' | 'conflict' | 'success';

interface ConflictState {
  conflictFiles: string[];
  remoteBranch: string;
  strategy: PullStrategy;
}

interface RemoteBranch {
  name: string;
  fullRef: string;
}

interface RemoteInfo {
  name: string;
  url: string;
  branches: RemoteBranch[];
}

const logger = createLogger('MergeRebaseDialog');

interface MergeRebaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  worktree: WorktreeInfo | null;
  onCreateConflictResolutionFeature?: (conflictInfo: MergeConflictInfo) => void;
}

export function MergeRebaseDialog({
  open,
  onOpenChange,
  worktree,
  onCreateConflictResolutionFeature,
}: MergeRebaseDialogProps) {
  const [remotes, setRemotes] = useState<RemoteInfo[]>([]);
  const [selectedRemote, setSelectedRemote] = useState<string>('');
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [selectedStrategy, setSelectedStrategy] = useState<PullStrategy>('merge');
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<DialogStep>('select');
  const [conflictState, setConflictState] = useState<ConflictState | null>(null);

  // Fetch remotes when dialog opens
  useEffect(() => {
    if (open && worktree) {
      fetchRemotes();
    }
  }, [open, worktree]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setSelectedRemote('');
      setSelectedBranch('');
      setSelectedStrategy('merge');
      setError(null);
      setStep('select');
      setConflictState(null);
    }
  }, [open]);

  // Auto-select default remote and branch when remotes are loaded
  useEffect(() => {
    if (remotes.length > 0 && !selectedRemote) {
      // Default to 'origin' if available, otherwise first remote
      const defaultRemote = remotes.find((r) => r.name === 'origin') || remotes[0];
      setSelectedRemote(defaultRemote.name);

      // Try to select a matching branch name or default to main/master
      if (defaultRemote.branches.length > 0 && worktree) {
        const matchingBranch = defaultRemote.branches.find((b) => b.name === worktree.branch);
        const mainBranch = defaultRemote.branches.find(
          (b) => b.name === 'main' || b.name === 'master'
        );
        const defaultBranch = matchingBranch || mainBranch || defaultRemote.branches[0];
        setSelectedBranch(defaultBranch.fullRef);
      }
    }
  }, [remotes, selectedRemote, worktree]);

  // Update selected branch when remote changes
  useEffect(() => {
    if (selectedRemote && remotes.length > 0 && worktree) {
      const remote = remotes.find((r) => r.name === selectedRemote);
      if (remote && remote.branches.length > 0) {
        // Try to select a matching branch name or default to main/master
        const matchingBranch = remote.branches.find((b) => b.name === worktree.branch);
        const mainBranch = remote.branches.find((b) => b.name === 'main' || b.name === 'master');
        const defaultBranch = matchingBranch || mainBranch || remote.branches[0];
        setSelectedBranch(defaultBranch.fullRef);
      } else {
        setSelectedBranch('');
      }
    }
  }, [selectedRemote, remotes, worktree]);

  const fetchRemotes = async () => {
    if (!worktree) return;

    setIsLoading(true);
    setError(null);

    try {
      const api = getHttpApiClient();
      const result = await api.worktree.listRemotes(worktree.path);

      if (result.success && result.result) {
        setRemotes(result.result.remotes);
        if (result.result.remotes.length === 0) {
          setError('No remotes found in this repository');
        }
      } else {
        setError(result.error || 'Failed to fetch remotes');
      }
    } catch (err) {
      logger.error('Failed to fetch remotes:', err);
      setError('Failed to fetch remotes');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    if (!worktree) return;

    setIsRefreshing(true);
    setError(null);

    try {
      const api = getHttpApiClient();
      const result = await api.worktree.listRemotes(worktree.path);

      if (result.success && result.result) {
        setRemotes(result.result.remotes);
        toast.success('Remotes refreshed');
      } else {
        toast.error(result.error || 'Failed to refresh remotes');
      }
    } catch (err) {
      logger.error('Failed to refresh remotes:', err);
      toast.error('Failed to refresh remotes');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleExecuteOperation = useCallback(async () => {
    if (!worktree || !selectedBranch) return;

    setStep('executing');

    try {
      const api = getHttpApiClient();

      if (selectedStrategy === 'rebase') {
        // Attempt the rebase operation - the rebase service fetches from the remote
        // before rebasing to ensure we have up-to-date refs
        const result = await api.worktree.rebase(worktree.path, selectedBranch, selectedRemote);

        if (result.success) {
          toast.success(`Rebased onto ${selectedBranch}`, {
            description: result.result?.message || 'Rebase completed successfully',
          });
          setStep('success');
          onOpenChange(false);
        } else if (result.hasConflicts) {
          // Rebase had conflicts - show conflict resolution UI
          setConflictState({
            conflictFiles: result.conflictFiles || [],
            remoteBranch: selectedBranch,
            strategy: 'rebase',
          });
          setStep('conflict');
        } else {
          toast.error('Rebase failed', {
            description: result.error || 'Unknown error',
          });
          setStep('select');
        }
      } else {
        // Merge strategy - merge the selected remote branch into the current branch.
        // selectedBranch may be a full ref (e.g. refs/remotes/origin/main); normalize to short name
        // for 'git pull <remote> <branch>'.
        let remoteBranchShortName = selectedBranch;
        const remotePrefix = `refs/remotes/${selectedRemote}/`;
        if (selectedBranch.startsWith(remotePrefix)) {
          remoteBranchShortName = selectedBranch.slice(remotePrefix.length);
        } else if (selectedBranch.startsWith(`${selectedRemote}/`)) {
          remoteBranchShortName = selectedBranch.slice(selectedRemote.length + 1);
        } else if (selectedBranch.startsWith('refs/heads/')) {
          remoteBranchShortName = selectedBranch.slice('refs/heads/'.length);
        } else if (selectedBranch.startsWith('refs/')) {
          remoteBranchShortName = selectedBranch.slice('refs/'.length);
        }
        const result = await api.worktree.pull(
          worktree.path,
          selectedRemote,
          true,
          remoteBranchShortName
        );

        if (result.success && result.result) {
          if (result.result.hasConflicts) {
            // Pull had conflicts
            setConflictState({
              conflictFiles: result.result.conflictFiles || [],
              remoteBranch: selectedBranch,
              strategy: 'merge',
            });
            setStep('conflict');
          } else {
            toast.success(`Merged ${selectedBranch}`, {
              description: result.result.message || 'Merge completed successfully',
            });
            setStep('success');
            onOpenChange(false);
          }
        } else {
          // Check for conflict indicators in error
          const errorMessage = result.error || '';
          const hasConflicts =
            errorMessage.toLowerCase().includes('conflict') || errorMessage.includes('CONFLICT');

          if (hasConflicts) {
            setConflictState({
              conflictFiles: [],
              remoteBranch: selectedBranch,
              strategy: 'merge',
            });
            setStep('conflict');
          } else {
            // Non-conflict failure - show conflict resolution UI so user can choose
            // how to handle it (resolve manually or with AI) rather than auto-creating a task
            setConflictState({
              conflictFiles: [],
              remoteBranch: selectedBranch,
              strategy: 'merge',
            });
            setStep('conflict');
          }
        }
      }
    } catch (err) {
      logger.error('Failed to execute operation:', err);

      // Show conflict resolution UI so user can choose how to handle it
      setConflictState({
        conflictFiles: [],
        remoteBranch: selectedBranch,
        strategy: selectedStrategy,
      });
      setStep('conflict');
    }
  }, [worktree, selectedBranch, selectedStrategy, selectedRemote, onOpenChange]);

  const handleResolveWithAI = useCallback(() => {
    if (!worktree || !conflictState) return;

    if (onCreateConflictResolutionFeature) {
      const conflictInfo: MergeConflictInfo = {
        sourceBranch: conflictState.remoteBranch,
        targetBranch: worktree.branch,
        targetWorktreePath: worktree.path,
        conflictFiles: conflictState.conflictFiles,
        operationType: conflictState.strategy,
      };

      onCreateConflictResolutionFeature(conflictInfo);
    }

    onOpenChange(false);
  }, [worktree, conflictState, onCreateConflictResolutionFeature, onOpenChange]);

  const handleResolveManually = useCallback(() => {
    toast.info('Conflict markers left in place', {
      description: 'Edit the conflicting files to resolve conflicts manually.',
      duration: 6000,
    });
    onOpenChange(false);
  }, [onOpenChange]);

  const selectedRemoteData = remotes.find((r) => r.name === selectedRemote);
  const branches = selectedRemoteData?.branches || [];

  if (!worktree) return null;

  // Conflict resolution UI
  if (step === 'conflict' && conflictState) {
    const isRebase = conflictState.strategy === 'rebase';
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              {isRebase ? 'Rebase' : 'Merge'} Conflicts Detected
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-4">
                <span className="block">
                  {isRebase ? (
                    <>
                      Conflicts detected when rebasing{' '}
                      <code className="font-mono bg-muted px-1 rounded">{worktree.branch}</code>{' '}
                      onto{' '}
                      <code className="font-mono bg-muted px-1 rounded">
                        {conflictState.remoteBranch}
                      </code>
                      . The rebase was aborted and no changes were applied.
                    </>
                  ) : (
                    <>
                      Conflicts detected when merging{' '}
                      <code className="font-mono bg-muted px-1 rounded">
                        {conflictState.remoteBranch}
                      </code>{' '}
                      into{' '}
                      <code className="font-mono bg-muted px-1 rounded">{worktree.branch}</code>.
                    </>
                  )}
                </span>

                {conflictState.conflictFiles.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-sm font-medium text-foreground">
                      Conflicting files ({conflictState.conflictFiles.length}):
                    </span>
                    <div className="border border-border rounded-lg overflow-hidden max-h-[200px] overflow-y-auto scrollbar-visible">
                      {conflictState.conflictFiles.map((file) => (
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
                      <strong>Resolve with AI</strong> &mdash; Creates a task to{' '}
                      {isRebase ? 'rebase and ' : ''}resolve conflicts automatically
                    </li>
                    <li>
                      <strong>Resolve Manually</strong> &mdash;{' '}
                      {isRebase
                        ? 'Leaves the branch unchanged for you to rebase manually'
                        : 'Leaves conflict markers in place for you to edit directly'}
                    </li>
                  </ul>
                </div>
              </div>
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setStep('select');
                setConflictState(null);
              }}
            >
              Back
            </Button>
            <Button variant="outline" onClick={handleResolveManually}>
              <Wrench className="w-4 h-4 mr-2" />
              Resolve Manually
            </Button>
            <Button
              onClick={handleResolveWithAI}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Resolve with AI
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Executing phase
  if (step === 'executing') {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedStrategy === 'rebase' ? (
                <GitBranch className="w-5 h-5 text-blue-500 animate-pulse" />
              ) : (
                <GitMerge className="w-5 h-5 text-purple-500 animate-pulse" />
              )}
              {selectedStrategy === 'rebase' ? 'Rebasing...' : 'Merging...'}
            </DialogTitle>
            <DialogDescription>
              {selectedStrategy === 'rebase'
                ? `Rebasing ${worktree.branch} onto ${selectedBranch}...`
                : `Merging ${selectedBranch} into ${worktree.branch}...`}
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center py-8">
            <Spinner size="md" />
            <span className="ml-3 text-sm text-muted-foreground">This may take a moment...</span>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Selection UI
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="w-5 h-5 text-purple-500" />
            Merge & Rebase
          </DialogTitle>
          <DialogDescription>
            Select a remote branch to merge or rebase with{' '}
            <span className="font-mono text-foreground">
              {worktree?.branch || 'current branch'}
            </span>
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner size="lg" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              <span className="text-sm">{error}</span>
            </div>
            <Button variant="outline" size="sm" onClick={fetchRemotes}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="remote-select">Remote</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="h-6 px-2 text-xs"
                >
                  {isRefreshing ? (
                    <Spinner size="xs" className="mr-1" />
                  ) : (
                    <RefreshCw className="w-3 h-3 mr-1" />
                  )}
                  Refresh
                </Button>
              </div>
              <Select value={selectedRemote} onValueChange={setSelectedRemote}>
                <SelectTrigger id="remote-select">
                  <SelectValue placeholder="Select a remote" />
                </SelectTrigger>
                <SelectContent>
                  {remotes.map((remote) => (
                    <SelectItem
                      key={remote.name}
                      value={remote.name}
                      description={
                        <span className="text-xs text-muted-foreground truncate max-w-[300px]">
                          {remote.url}
                        </span>
                      }
                    >
                      <span className="font-medium">{remote.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="branch-select">Branch</Label>
              <Select
                value={selectedBranch}
                onValueChange={setSelectedBranch}
                disabled={!selectedRemote || branches.length === 0}
              >
                <SelectTrigger id="branch-select">
                  <SelectValue placeholder="Select a branch" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>{selectedRemote} branches</SelectLabel>
                    {branches.map((branch) => (
                      <SelectItem key={branch.fullRef} value={branch.fullRef}>
                        {branch.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {selectedRemote && branches.length === 0 && (
                <p className="text-sm text-muted-foreground">No branches found for this remote</p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="strategy-select">Strategy</Label>
              <Select
                value={selectedStrategy}
                onValueChange={(value) => setSelectedStrategy(value as PullStrategy)}
              >
                <SelectTrigger id="strategy-select">
                  <SelectValue placeholder="Select a strategy" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    value="merge"
                    description={
                      <span className="text-xs text-muted-foreground">
                        Creates a merge commit preserving history
                      </span>
                    }
                  >
                    <span className="flex items-center gap-2">
                      <GitMerge className="w-3.5 h-3.5 text-purple-500" />
                      <span className="font-medium">Merge</span>
                    </span>
                  </SelectItem>
                  <SelectItem
                    value="rebase"
                    description={
                      <span className="text-xs text-muted-foreground">
                        Replays commits on top for linear history
                      </span>
                    }
                  >
                    <span className="flex items-center gap-2">
                      <GitBranch className="w-3.5 h-3.5 text-blue-500" />
                      <span className="font-medium">Rebase</span>
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {selectedBranch && (
              <div className="mt-2 p-3 rounded-md bg-muted/50 border border-border">
                <p className="text-sm text-muted-foreground">
                  This will attempt to{' '}
                  {selectedStrategy === 'rebase' ? (
                    <>
                      rebase <span className="font-mono text-foreground">{worktree?.branch}</span>{' '}
                      onto <span className="font-mono text-foreground">{selectedBranch}</span>
                    </>
                  ) : (
                    <>
                      merge <span className="font-mono text-foreground">{selectedBranch}</span> into{' '}
                      <span className="font-mono text-foreground">{worktree?.branch}</span>
                    </>
                  )}
                  . If conflicts arise, you can choose to resolve them manually or with AI.
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleExecuteOperation}
            disabled={!selectedBranch || isLoading}
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            {selectedStrategy === 'rebase' ? (
              <>
                <GitBranch className="w-4 h-4 mr-2" />
                Rebase
              </>
            ) : (
              <>
                <GitMerge className="w-4 h-4 mr-2" />
                Merge
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
