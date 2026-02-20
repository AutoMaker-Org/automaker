import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Download,
  AlertTriangle,
  Archive,
  CheckCircle2,
  XCircle,
  FileWarning,
  Wrench,
  Sparkles,
  GitMerge,
  GitCommitHorizontal,
  FileText,
  Settings,
} from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Checkbox } from '@/components/ui/checkbox';
import { getElectronAPI } from '@/lib/electron';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import type { MergeConflictInfo } from '../worktree-panel/types';

interface WorktreeInfo {
  path: string;
  branch: string;
  isMain: boolean;
  hasChanges?: boolean;
  changedFilesCount?: number;
}

type PullPhase =
  | 'checking' // Initial check for local changes
  | 'local-changes' // Local changes detected, asking user what to do
  | 'pulling' // Actively pulling (with or without stash)
  | 'success' // Pull completed successfully
  | 'merge-complete' // Pull resulted in a merge (not fast-forward, no conflicts)
  | 'conflict' // Merge conflicts detected
  | 'error'; // Something went wrong

interface PullResult {
  branch?: string;
  remote?: string;
  pulled?: boolean;
  message?: string;
  hasLocalChanges?: boolean;
  localChangedFiles?: string[];
  hasConflicts?: boolean;
  conflictSource?: 'pull' | 'stash';
  conflictFiles?: string[];
  stashed?: boolean;
  stashRestored?: boolean;
  stashRecoveryFailed?: boolean;
  isMerge?: boolean;
  isFastForward?: boolean;
  mergeAffectedFiles?: string[];
}

interface GitPullDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  worktree: WorktreeInfo | null;
  remote?: string;
  onPulled?: () => void;
  onCreateConflictResolutionFeature?: (conflictInfo: MergeConflictInfo) => void;
  /** Called when user chooses to commit the merge — opens the commit dialog */
  onCommitMerge?: (worktree: { path: string; branch: string; isMain: boolean }) => void;
}

export function GitPullDialog({
  open,
  onOpenChange,
  worktree,
  remote,
  onPulled,
  onCreateConflictResolutionFeature,
  onCommitMerge,
}: GitPullDialogProps) {
  const [phase, setPhase] = useState<PullPhase>('checking');
  const [pullResult, setPullResult] = useState<PullResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [rememberChoice, setRememberChoice] = useState(false);
  const [showMergeFiles, setShowMergeFiles] = useState(false);

  const mergePostAction = useAppStore((s) => s.mergePostAction);
  const setMergePostAction = useAppStore((s) => s.setMergePostAction);

  /**
   * Determine the appropriate phase after a successful pull.
   * If the pull resulted in a merge (not fast-forward) and no conflicts,
   * check user preference before deciding whether to show merge prompt.
   */
  const handleSuccessfulPull = useCallback(
    (result: PullResult) => {
      setPullResult(result);

      if (result.isMerge && !result.hasConflicts) {
        // Merge happened — check user preference
        if (mergePostAction === 'commit') {
          // User preference: auto-commit
          setPhase('success');
          onPulled?.();
          // Auto-trigger commit dialog
          if (worktree && onCommitMerge) {
            onCommitMerge(worktree);
            onOpenChange(false);
          }
        } else if (mergePostAction === 'manual') {
          // User preference: manual review
          setPhase('success');
          onPulled?.();
        } else {
          // No preference — show merge prompt; onPulled will be called from the
          // user-action handlers (handleCommitMerge / handleMergeManually) once
          // the user makes their choice, consistent with the conflict phase.
          setPhase('merge-complete');
        }
      } else {
        setPhase('success');
        onPulled?.();
      }
    },
    [mergePostAction, worktree, onCommitMerge, onPulled, onOpenChange]
  );

  const checkForLocalChanges = useCallback(async () => {
    if (!worktree) return;

    setPhase('checking');
    try {
      const api = getElectronAPI();
      if (!api?.worktree?.pull) {
        setErrorMessage('Pull API not available');
        setPhase('error');
        return;
      }

      // Call pull without stashIfNeeded to just check status
      const result = await api.worktree.pull(worktree.path, remote);

      if (!result.success) {
        setErrorMessage(result.error || 'Failed to pull');
        setPhase('error');
        return;
      }

      if (result.result?.hasLocalChanges) {
        // Local changes detected - ask user what to do
        setPullResult(result.result);
        setPhase('local-changes');
      } else if (result.result?.pulled !== undefined) {
        // No local changes, pull went through (or already up to date)
        handleSuccessfulPull(result.result);
      } else {
        // Unexpected response: success but no recognizable fields
        setPullResult(result.result ?? null);
        setErrorMessage('Unexpected pull response');
        setPhase('error');
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to check for changes');
      setPhase('error');
    }
  }, [worktree, remote, handleSuccessfulPull]);

  // Keep a ref to the latest checkForLocalChanges to break the circular dependency
  // between the "reset/start" effect and the callback chain. Without this, any
  // change in onPulled (passed from the parent) would recreate handleSuccessfulPull
  // → checkForLocalChanges → re-trigger the effect while the dialog is already open,
  // causing the pull flow to restart unintentionally.
  const checkForLocalChangesRef = useRef(checkForLocalChanges);
  useEffect(() => {
    checkForLocalChangesRef.current = checkForLocalChanges;
  });

  // Reset state when dialog opens and start the initial pull check.
  // Depends only on `open` and `worktree` — NOT on `checkForLocalChanges` —
  // so that parent callback re-creations don't restart the pull flow mid-flight.
  useEffect(() => {
    if (open && worktree) {
      setPhase('checking');
      setPullResult(null);
      setErrorMessage(null);
      setRememberChoice(false);
      setShowMergeFiles(false);
      // Start the initial check using the ref so we always call the latest version
      // without making it a dependency of this effect.
      checkForLocalChangesRef.current();
    }
  }, [open, worktree]);

  const handlePullWithStash = useCallback(async () => {
    if (!worktree) return;

    setPhase('pulling');
    try {
      const api = getElectronAPI();
      if (!api?.worktree?.pull) {
        setErrorMessage('Pull API not available');
        setPhase('error');
        return;
      }

      // Call pull with stashIfNeeded
      const result = await api.worktree.pull(worktree.path, remote, true);

      if (!result.success) {
        setErrorMessage(result.error || 'Failed to pull');
        setPhase('error');
        return;
      }

      setPullResult(result.result || null);

      if (result.result?.hasConflicts) {
        setPhase('conflict');
      } else if (result.result?.pulled) {
        handleSuccessfulPull(result.result);
      } else {
        // Unrecognized response: no pulled flag and no conflicts
        console.warn('handlePullWithStash: unrecognized response', result.result);
        setErrorMessage('Unexpected pull response');
        setPhase('error');
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to pull');
      setPhase('error');
    }
  }, [worktree, remote, handleSuccessfulPull]);

  const handleResolveWithAI = useCallback(() => {
    if (!worktree || !pullResult || !onCreateConflictResolutionFeature) return;

    const effectiveRemote = pullResult.remote || remote;
    const branch = pullResult.branch ?? worktree.branch;
    const conflictInfo: MergeConflictInfo = {
      sourceBranch: `${effectiveRemote || 'origin'}/${branch}`,
      targetBranch: branch,
      targetWorktreePath: worktree.path,
      conflictFiles: pullResult.conflictFiles || [],
      operationType: 'merge',
    };

    onCreateConflictResolutionFeature(conflictInfo);
    onOpenChange(false);
  }, [worktree, pullResult, remote, onCreateConflictResolutionFeature, onOpenChange]);

  const handleCommitMerge = useCallback(() => {
    if (!worktree || !onCommitMerge) {
      // No handler available — show feedback and bail without persisting preference
      toast.error('Commit merge is not available', {
        description: 'The commit merge action is not configured for this context.',
        duration: 4000,
      });
      return;
    }
    if (rememberChoice) {
      setMergePostAction('commit');
    }
    onPulled?.();
    onCommitMerge(worktree);
    onOpenChange(false);
  }, [rememberChoice, setMergePostAction, worktree, onCommitMerge, onPulled, onOpenChange]);

  const handleMergeManually = useCallback(() => {
    if (rememberChoice) {
      setMergePostAction('manual');
    }
    toast.info('Merge left for manual review', {
      description: 'Review the merged files and commit when ready.',
      duration: 5000,
    });
    onPulled?.();
    onOpenChange(false);
  }, [rememberChoice, setMergePostAction, onPulled, onOpenChange]);

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  if (!worktree) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        {/* Checking Phase */}
        {phase === 'checking' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Download className="w-5 h-5" />
                Pull Changes
              </DialogTitle>
              <DialogDescription>
                Checking for local changes on{' '}
                <code className="font-mono bg-muted px-1 rounded">{worktree.branch}</code>...
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center justify-center py-8">
              <Spinner size="md" />
              <span className="ml-3 text-sm text-muted-foreground">
                Fetching remote and checking status...
              </span>
            </div>
          </>
        )}

        {/* Local Changes Detected Phase */}
        {phase === 'local-changes' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                Local Changes Detected
              </DialogTitle>
              <DialogDescription asChild>
                <div className="space-y-3">
                  <span className="block">
                    You have uncommitted changes on{' '}
                    <code className="font-mono bg-muted px-1 rounded">{worktree.branch}</code> that
                    need to be handled before pulling.
                  </span>

                  {pullResult?.localChangedFiles && pullResult.localChangedFiles.length > 0 && (
                    <div className="border border-border rounded-lg overflow-hidden max-h-[200px] overflow-y-auto scrollbar-visible">
                      {pullResult.localChangedFiles.map((file) => (
                        <div
                          key={file}
                          className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono border-b border-border last:border-b-0 hover:bg-accent/30"
                        >
                          <FileWarning className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                          <span className="truncate">{file}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </DialogDescription>
            </DialogHeader>

            <div className="flex items-start gap-2 p-3 rounded-md bg-blue-500/10 border border-blue-500/20">
              <Archive className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
              <span className="text-blue-500 text-sm">
                Your changes will be automatically stashed before pulling and restored afterward. If
                restoring causes conflicts, you&apos;ll be able to resolve them.
              </span>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handlePullWithStash}>
                <Archive className="w-4 h-4 mr-2" />
                Stash & Pull
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Pulling Phase */}
        {phase === 'pulling' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Download className="w-5 h-5 animate-pulse" />
                Pulling Changes
              </DialogTitle>
              <DialogDescription>
                {pullResult?.hasLocalChanges
                  ? 'Stashing changes, pulling from remote, and restoring your changes...'
                  : 'Pulling latest changes from remote...'}
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center justify-center py-8">
              <Spinner size="md" />
              <span className="ml-3 text-sm text-muted-foreground">This may take a moment...</span>
            </div>
          </>
        )}

        {/* Success Phase */}
        {phase === 'success' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                Pull Complete
              </DialogTitle>
              <DialogDescription asChild>
                <div className="space-y-2">
                  <span className="block">
                    {pullResult?.message || 'Changes pulled successfully'}
                  </span>

                  {pullResult?.stashed &&
                    pullResult?.stashRestored &&
                    !pullResult?.stashRecoveryFailed && (
                      <div className="flex items-start gap-2 p-3 rounded-md bg-green-500/10 border border-green-500/20">
                        <Archive className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <span className="text-green-600 dark:text-green-400 text-sm">
                          Your stashed changes have been restored successfully.
                        </span>
                      </div>
                    )}

                  {pullResult?.stashed &&
                    (!pullResult?.stashRestored || pullResult?.stashRecoveryFailed) && (
                      <div className="flex items-start gap-2 p-3 rounded-md bg-amber-500/10 border border-amber-500/20">
                        <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                        <span className="text-amber-600 dark:text-amber-400 text-sm">
                          {pullResult?.message ??
                            'Stash could not be restored. Your changes remain in the stash.'}
                        </span>
                      </div>
                    )}
                </div>
              </DialogDescription>
            </DialogHeader>

            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </>
        )}

        {/* Merge Complete Phase — post-merge prompt */}
        {phase === 'merge-complete' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <GitMerge className="w-5 h-5 text-purple-500" />
                Merge Complete
              </DialogTitle>
              <DialogDescription asChild>
                <div className="space-y-3">
                  <span className="block">
                    Pull resulted in a merge on{' '}
                    <code className="font-mono bg-muted px-1 rounded">{worktree.branch}</code>
                    {pullResult?.mergeAffectedFiles && pullResult.mergeAffectedFiles.length > 0 && (
                      <span>
                        {' '}
                        affecting {pullResult.mergeAffectedFiles.length} file
                        {pullResult.mergeAffectedFiles.length !== 1 ? 's' : ''}
                      </span>
                    )}
                    . How would you like to proceed?
                  </span>

                  {pullResult?.mergeAffectedFiles && pullResult.mergeAffectedFiles.length > 0 && (
                    <div>
                      <button
                        onClick={() => setShowMergeFiles(!showMergeFiles)}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
                      >
                        <FileText className="w-3 h-3" />
                        {showMergeFiles ? 'Hide' : 'Show'} affected files (
                        {pullResult.mergeAffectedFiles.length})
                      </button>
                      {showMergeFiles && (
                        <div className="mt-1.5 border border-border rounded-lg overflow-hidden max-h-[150px] overflow-y-auto scrollbar-visible">
                          {pullResult.mergeAffectedFiles.map((file) => (
                            <div
                              key={file}
                              className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono border-b border-border last:border-b-0 hover:bg-accent/30"
                            >
                              <GitMerge className="w-3 h-3 text-purple-500 flex-shrink-0" />
                              <span className="truncate">{file}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {pullResult?.stashed &&
                    pullResult?.stashRestored &&
                    !pullResult?.stashRecoveryFailed && (
                      <div className="flex items-start gap-2 p-3 rounded-md bg-green-500/10 border border-green-500/20">
                        <Archive className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <span className="text-green-600 dark:text-green-400 text-sm">
                          Your stashed changes have been restored successfully.
                        </span>
                      </div>
                    )}

                  <div className="mt-2 p-3 rounded-md bg-muted/50 border border-border">
                    <p className="text-sm text-muted-foreground font-medium mb-2">
                      Choose how to proceed:
                    </p>
                    <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                      <li>
                        <strong>Commit Merge</strong> &mdash; Open the commit dialog with a merge
                        commit message
                      </li>
                      <li>
                        <strong>Review Manually</strong> &mdash; Leave the working tree as-is for
                        manual review
                      </li>
                    </ul>
                  </div>
                </div>
              </DialogDescription>
            </DialogHeader>

            {/* Remember choice option */}
            <div className="flex items-center gap-2 px-1">
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <Checkbox
                  checked={rememberChoice}
                  onCheckedChange={(checked) => setRememberChoice(checked === true)}
                  className="rounded border-border"
                />
                <Settings className="w-3 h-3" />
                Remember my choice for future merges
              </label>
              {(rememberChoice || mergePostAction) && (
                <span className="text-xs text-muted-foreground ml-auto flex items-center gap-2">
                  <span className="opacity-70">
                    Current:{' '}
                    {mergePostAction === 'commit'
                      ? 'auto-commit'
                      : mergePostAction === 'manual'
                        ? 'manual review'
                        : 'ask every time'}
                  </span>
                  <button
                    onClick={() => {
                      setMergePostAction(null);
                      setRememberChoice(false);
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Reset preference
                  </button>
                </span>
              )}
            </div>

            <DialogFooter className={cn('flex-col sm:flex-row gap-2')}>
              <Button variant="outline" onClick={handleMergeManually} className="w-full sm:w-auto">
                <FileText className="w-4 h-4 mr-2" />
                Review Manually
              </Button>
              {worktree && onCommitMerge && (
                <Button
                  onClick={handleCommitMerge}
                  className="w-full sm:w-auto bg-purple-600 hover:bg-purple-700 text-white"
                >
                  <GitCommitHorizontal className="w-4 h-4 mr-2" />
                  Commit Merge
                </Button>
              )}
            </DialogFooter>
          </>
        )}

        {/* Conflict Phase */}
        {phase === 'conflict' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-orange-500" />
                Merge Conflicts Detected
              </DialogTitle>
              <DialogDescription asChild>
                <div className="space-y-3">
                  <span className="block">
                    {pullResult?.conflictSource === 'stash'
                      ? 'Pull succeeded but reapplying your stashed changes resulted in merge conflicts.'
                      : 'The pull resulted in merge conflicts that need to be resolved.'}
                  </span>

                  {pullResult?.conflictFiles && pullResult.conflictFiles.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-sm font-medium text-foreground">
                        Conflicting files ({pullResult.conflictFiles.length}):
                      </span>
                      <div className="border border-border rounded-lg overflow-hidden max-h-[200px] overflow-y-auto scrollbar-visible">
                        {pullResult.conflictFiles.map((file) => (
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
                        <strong>Resolve with AI</strong> &mdash; Creates a task to analyze and
                        resolve conflicts automatically
                      </li>
                      <li>
                        <strong>Resolve Manually</strong> &mdash; Leaves conflict markers in place
                        for you to edit directly
                      </li>
                    </ul>
                  </div>
                </div>
              </DialogDescription>
            </DialogHeader>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  toast.info('Conflict markers left in place', {
                    description: 'Edit the conflicting files to resolve conflicts manually.',
                    duration: 6000,
                  });
                  onPulled?.();
                  handleClose();
                }}
              >
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
          </>
        )}

        {/* Error Phase */}
        {phase === 'error' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <XCircle className="w-5 h-5 text-destructive" />
                Pull Failed
              </DialogTitle>
              <DialogDescription asChild>
                <div className="space-y-2">
                  <span className="block">
                    Failed to pull changes for{' '}
                    <code className="font-mono bg-muted px-1 rounded">{worktree.branch}</code>.
                  </span>

                  {errorMessage && (
                    <div
                      className={cn(
                        'flex items-start gap-2 p-3 rounded-md',
                        'bg-destructive/10 border border-destructive/20'
                      )}
                    >
                      <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                      <span className="text-destructive text-sm break-words">{errorMessage}</span>
                    </div>
                  )}
                </div>
              </DialogDescription>
            </DialogHeader>

            <DialogFooter>
              <Button variant="ghost" onClick={handleClose}>
                Close
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setErrorMessage(null);
                  checkForLocalChanges();
                }}
              >
                Retry
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
