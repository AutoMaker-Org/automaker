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
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  GitCommit,
  AlertTriangle,
  Wrench,
  User,
  Clock,
  Copy,
  Check,
  Cherry,
  ChevronDown,
  ChevronRight,
  FileText,
} from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { getHttpApiClient } from '@/lib/http-api-client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { WorktreeInfo, MergeConflictInfo } from '../worktree-panel/types';

export interface CherryPickConflictInfo {
  commitHashes: string[];
  targetBranch: string;
  targetWorktreePath: string;
}

interface RemoteInfo {
  name: string;
  url: string;
  branches: Array<{
    name: string;
    fullRef: string;
  }>;
}

interface CommitInfo {
  hash: string;
  shortHash: string;
  author: string;
  authorEmail: string;
  date: string;
  subject: string;
  body: string;
  files: string[];
}

interface CherryPickDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  worktree: WorktreeInfo | null;
  onCherryPicked: () => void;
  onCreateConflictResolutionFeature?: (conflictInfo: MergeConflictInfo) => void;
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffSecs < 60) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffWeeks < 5) return `${diffWeeks}w ago`;
  if (diffMonths < 12) return `${diffMonths}mo ago`;
  return date.toLocaleDateString();
}

function CopyHashButton({ hash }: { hash: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy hash');
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 font-mono text-[11px] bg-muted hover:bg-muted/80 px-1.5 py-0.5 rounded cursor-pointer transition-colors"
      title={`Copy full hash: ${hash}`}
    >
      {copied ? (
        <Check className="w-2.5 h-2.5 text-green-500" />
      ) : (
        <Copy className="w-2.5 h-2.5 text-muted-foreground" />
      )}
      <span className="text-muted-foreground">{hash.slice(0, 7)}</span>
    </button>
  );
}

type Step = 'select-branch' | 'select-commits' | 'conflict';

export function CherryPickDialog({
  open,
  onOpenChange,
  worktree,
  onCherryPicked,
  onCreateConflictResolutionFeature,
}: CherryPickDialogProps) {
  // Step management
  const [step, setStep] = useState<Step>('select-branch');

  // Branch selection state
  const [remotes, setRemotes] = useState<RemoteInfo[]>([]);
  const [localBranches, setLocalBranches] = useState<string[]>([]);
  const [selectedRemote, setSelectedRemote] = useState<string>('');
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [loadingBranches, setLoadingBranches] = useState(false);

  // Commits state
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [selectedCommitHashes, setSelectedCommitHashes] = useState<Set<string>>(new Set());
  const [expandedCommits, setExpandedCommits] = useState<Set<string>>(new Set());
  const [loadingCommits, setLoadingCommits] = useState(false);
  const [loadingMoreCommits, setLoadingMoreCommits] = useState(false);
  const [commitsError, setCommitsError] = useState<string | null>(null);
  const [commitLimit, setCommitLimit] = useState(30);
  const [hasMoreCommits, setHasMoreCommits] = useState(false);

  // Ref to track the latest fetchCommits request and ignore stale responses
  const fetchCommitsRequestRef = useRef(0);

  // Cherry-pick state
  const [isCherryPicking, setIsCherryPicking] = useState(false);

  // Conflict state
  const [conflictInfo, setConflictInfo] = useState<CherryPickConflictInfo | null>(null);

  // All available branch options for the current remote selection
  const branchOptions =
    selectedRemote === '__local__'
      ? localBranches.filter((b) => b !== worktree?.branch)
      : (remotes.find((r) => r.name === selectedRemote)?.branches || []).map((b) => b.fullRef);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setStep('select-branch');
      setSelectedRemote('');
      setSelectedBranch('');
      setCommits([]);
      setSelectedCommitHashes(new Set());
      setExpandedCommits(new Set());
      setConflictInfo(null);
      setCommitsError(null);
      setCommitLimit(30);
      setHasMoreCommits(false);
      setLoadingBranches(false);
    }
  }, [open]);

  // Fetch remotes and local branches when dialog opens
  useEffect(() => {
    if (!open || !worktree) return;

    let mounted = true;

    const fetchBranchData = async () => {
      setLoadingBranches(true);
      try {
        const api = getHttpApiClient();

        // Fetch remotes and local branches in parallel
        const [remotesResult, branchesResult] = await Promise.all([
          api.worktree.listRemotes(worktree.path),
          api.worktree.listBranches(worktree.path, false),
        ]);

        if (!mounted) return;

        if (remotesResult.success && remotesResult.result) {
          setRemotes(remotesResult.result.remotes);
          // Default to first remote if available, otherwise local
          if (remotesResult.result.remotes.length > 0) {
            setSelectedRemote(remotesResult.result.remotes[0].name);
          } else {
            setSelectedRemote('__local__');
          }
        }

        if (branchesResult.success && branchesResult.result) {
          const branches = branchesResult.result.branches
            .filter(
              (b: { isRemote: boolean; name: string }) => !b.isRemote && b.name !== worktree.branch
            )
            .map((b: { name: string }) => b.name);
          setLocalBranches(branches);
        }
      } catch (err) {
        if (!mounted) return;
        console.error('Failed to fetch branch data:', err);
      } finally {
        if (mounted) {
          setLoadingBranches(false);
        }
      }
    };

    fetchBranchData();

    return () => {
      mounted = false;
    };
  }, [open, worktree]);

  // Fetch commits when branch is selected
  const fetchCommits = useCallback(
    async (limit: number = 30, append: boolean = false) => {
      if (!worktree || !selectedBranch) return;

      // Increment the request counter and capture the current request ID
      const requestId = ++fetchCommitsRequestRef.current;

      if (append) {
        setLoadingMoreCommits(true);
      } else {
        setLoadingCommits(true);
        setCommitsError(null);
        setCommits([]);
        setSelectedCommitHashes(new Set());
      }

      try {
        const api = getHttpApiClient();
        const result = await api.worktree.getBranchCommitLog(worktree.path, selectedBranch, limit);

        // Ignore stale responses from superseded requests
        if (requestId !== fetchCommitsRequestRef.current) return;

        if (result.success && result.result) {
          setCommits(result.result.commits);
          // If we got exactly the limit, there may be more commits
          setHasMoreCommits(result.result.commits.length >= limit);
        } else if (!append) {
          setCommitsError(result.error || 'Failed to load commits');
        }
      } catch (err) {
        // Ignore stale responses from superseded requests
        if (requestId !== fetchCommitsRequestRef.current) return;
        if (!append) {
          setCommitsError(err instanceof Error ? err.message : 'Failed to load commits');
        }
      } finally {
        // Only update loading state if this is still the current request
        if (requestId === fetchCommitsRequestRef.current) {
          setLoadingCommits(false);
          setLoadingMoreCommits(false);
        }
      }
    },
    [worktree, selectedBranch]
  );

  // Handle proceeding from branch selection to commit selection
  const handleProceedToCommits = useCallback(() => {
    if (!selectedBranch) return;
    setStep('select-commits');
    fetchCommits(commitLimit);
  }, [selectedBranch, fetchCommits, commitLimit]);

  // Handle loading more commits
  const handleLoadMore = useCallback(() => {
    const newLimit = Math.min(commitLimit + 30, 100);
    setCommitLimit(newLimit);
    fetchCommits(newLimit, true);
  }, [commitLimit, fetchCommits]);

  // Toggle commit selection
  const toggleCommitSelection = useCallback((hash: string) => {
    setSelectedCommitHashes((prev) => {
      const next = new Set(prev);
      if (next.has(hash)) {
        next.delete(hash);
      } else {
        next.add(hash);
      }
      return next;
    });
  }, []);

  // Toggle commit file list expansion
  const toggleCommitExpanded = useCallback((hash: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedCommits((prev) => {
      const next = new Set(prev);
      if (next.has(hash)) {
        next.delete(hash);
      } else {
        next.add(hash);
      }
      return next;
    });
  }, []);

  // Handle cherry-pick execution
  const handleCherryPick = useCallback(async () => {
    if (!worktree || selectedCommitHashes.size === 0) return;

    setIsCherryPicking(true);
    try {
      const api = getHttpApiClient();
      // Order commits from oldest to newest (reverse of display order)
      // so they're applied in chronological order
      const orderedHashes = commits
        .filter((c) => selectedCommitHashes.has(c.hash))
        .reverse()
        .map((c) => c.hash);

      const result = await api.worktree.cherryPick(worktree.path, orderedHashes);

      if (result.success) {
        toast.success(`Cherry-picked ${orderedHashes.length} commit(s)`, {
          description: `Successfully applied to ${worktree.branch}`,
        });
        onCherryPicked();
        onOpenChange(false);
      } else {
        // Check for conflicts
        const errorMessage = result.error || '';
        const hasConflicts = errorMessage.toLowerCase().includes('conflict') || result.hasConflicts;

        if (hasConflicts && onCreateConflictResolutionFeature) {
          setConflictInfo({
            commitHashes: orderedHashes,
            targetBranch: worktree.branch,
            targetWorktreePath: worktree.path,
          });
          setStep('conflict');
          toast.error('Cherry-pick conflicts detected', {
            description: 'The cherry-pick was aborted due to conflicts. No changes were applied.',
          });
        } else {
          toast.error('Cherry-pick failed', {
            description: result.error,
          });
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      const hasConflicts =
        errorMessage.toLowerCase().includes('conflict') ||
        errorMessage.toLowerCase().includes('cherry-pick failed');

      if (hasConflicts && onCreateConflictResolutionFeature) {
        const orderedHashes = commits
          .filter((c) => selectedCommitHashes.has(c.hash))
          .reverse()
          .map((c) => c.hash);
        setConflictInfo({
          commitHashes: orderedHashes,
          targetBranch: worktree.branch,
          targetWorktreePath: worktree.path,
        });
        setStep('conflict');
        toast.error('Cherry-pick conflicts detected', {
          description: 'The cherry-pick was aborted due to conflicts. No changes were applied.',
        });
      } else {
        toast.error('Cherry-pick failed', {
          description: errorMessage,
        });
      }
    } finally {
      setIsCherryPicking(false);
    }
  }, [
    worktree,
    selectedCommitHashes,
    commits,
    onCherryPicked,
    onOpenChange,
    onCreateConflictResolutionFeature,
  ]);

  // Handle creating a conflict resolution feature
  const handleCreateConflictResolutionFeature = useCallback(() => {
    if (conflictInfo && onCreateConflictResolutionFeature) {
      onCreateConflictResolutionFeature({
        sourceBranch: selectedBranch,
        targetBranch: conflictInfo.targetBranch,
        targetWorktreePath: conflictInfo.targetWorktreePath,
        operationType: 'cherry-pick',
      });
      onOpenChange(false);
    }
  }, [conflictInfo, selectedBranch, onCreateConflictResolutionFeature, onOpenChange]);

  if (!worktree) return null;

  // Conflict resolution UI
  if (step === 'conflict' && conflictInfo) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              Cherry-Pick Conflicts Detected
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-4">
                <span className="block">
                  There are conflicts when cherry-picking commits from{' '}
                  <code className="font-mono bg-muted px-1 rounded">{selectedBranch}</code> into{' '}
                  <code className="font-mono bg-muted px-1 rounded">
                    {conflictInfo.targetBranch}
                  </code>
                  .
                </span>

                <div className="flex items-start gap-2 p-3 rounded-md bg-orange-500/10 border border-orange-500/20">
                  <AlertTriangle className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
                  <span className="text-orange-500 text-sm">
                    The cherry-pick could not be completed automatically. You can create a feature
                    task to resolve the conflicts in the{' '}
                    <code className="font-mono bg-muted px-0.5 rounded">
                      {conflictInfo.targetBranch}
                    </code>{' '}
                    branch.
                  </span>
                </div>

                <div className="mt-2 p-3 rounded-md bg-muted/50 border border-border">
                  <p className="text-sm text-muted-foreground">
                    This will create a high-priority feature task that will:
                  </p>
                  <ul className="text-sm text-muted-foreground mt-2 list-disc list-inside space-y-1">
                    <li>
                      Cherry-pick the selected commit(s) from{' '}
                      <code className="font-mono bg-muted px-0.5 rounded">{selectedBranch}</code>
                    </li>
                    <li>Resolve any cherry-pick conflicts</li>
                    <li>Ensure the code compiles and tests pass</li>
                  </ul>
                </div>
              </div>
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setStep('select-commits')}>
              Back
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateConflictResolutionFeature}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              <Wrench className="w-4 h-4 mr-2" />
              Create Resolve Conflicts Feature
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Step 2: Select commits
  if (step === 'select-commits') {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-full h-full max-w-full max-h-full sm:w-[90vw] sm:max-w-[640px] sm:max-h-[100dvh] sm:h-auto sm:rounded-xl rounded-none flex flex-col dialog-fullscreen-mobile">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Cherry className="w-5 h-5 text-foreground" />
              Cherry Pick Commits
            </DialogTitle>
            <DialogDescription>
              Select commits from{' '}
              <code className="font-mono bg-muted px-1 rounded">{selectedBranch}</code> to apply to{' '}
              <code className="font-mono bg-muted px-1 rounded">{worktree.branch}</code>
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 sm:min-h-[400px] sm:max-h-[60vh] overflow-y-auto scrollbar-visible -mx-6 -mb-6">
            <div className="h-full px-6 pb-6">
              {loadingCommits && (
                <div className="flex items-center justify-center py-12">
                  <Spinner size="md" />
                  <span className="ml-2 text-sm text-muted-foreground">Loading commits...</span>
                </div>
              )}

              {commitsError && (
                <div className="flex items-center justify-center py-12">
                  <p className="text-sm text-destructive">{commitsError}</p>
                </div>
              )}

              {!loadingCommits && !commitsError && commits.length === 0 && (
                <div className="flex items-center justify-center py-12">
                  <p className="text-sm text-muted-foreground">No commits found on this branch</p>
                </div>
              )}

              {!loadingCommits && !commitsError && commits.length > 0 && (
                <div className="space-y-0.5 mt-2">
                  {commits.map((commit, index) => {
                    const isSelected = selectedCommitHashes.has(commit.hash);
                    const isExpanded = expandedCommits.has(commit.hash);
                    const hasFiles = commit.files && commit.files.length > 0;
                    return (
                      <div
                        key={commit.hash}
                        className={cn(
                          'group relative rounded-md transition-colors',
                          isSelected
                            ? 'bg-primary/10 border border-primary/30'
                            : 'border border-transparent',
                          index === 0 && !isSelected && 'bg-muted/30'
                        )}
                      >
                        <div
                          onClick={() => toggleCommitSelection(commit.hash)}
                          className={cn(
                            'flex gap-3 py-2.5 px-3 cursor-pointer rounded-md transition-colors',
                            !isSelected && 'hover:bg-muted/50'
                          )}
                        >
                          {/* Checkbox */}
                          <div className="flex items-start pt-1 shrink-0">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleCommitSelection(commit.hash)}
                              onClick={(e) => e.stopPropagation()}
                              className="mt-0.5"
                            />
                          </div>

                          {/* Commit content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-medium leading-snug break-words">
                                {commit.subject}
                              </p>
                              <CopyHashButton hash={commit.hash} />
                            </div>
                            {commit.body && (
                              <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap break-words line-clamp-2">
                                {commit.body}
                              </p>
                            )}
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-muted-foreground">
                              <span className="inline-flex items-center gap-1">
                                <User className="w-3 h-3" />
                                {commit.author}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                <time
                                  dateTime={commit.date}
                                  title={new Date(commit.date).toLocaleString()}
                                >
                                  {formatRelativeDate(commit.date)}
                                </time>
                              </span>
                              {hasFiles && (
                                <button
                                  onClick={(e) => toggleCommitExpanded(commit.hash, e)}
                                  className="inline-flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="w-3 h-3" />
                                  ) : (
                                    <ChevronRight className="w-3 h-3" />
                                  )}
                                  <FileText className="w-3 h-3" />
                                  {commit.files.length} file{commit.files.length !== 1 ? 's' : ''}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Expanded file list */}
                        {isExpanded && hasFiles && (
                          <div className="border-t mx-3 px-3 py-2 bg-muted/30 rounded-b-md ml-8">
                            <div className="space-y-0.5">
                              {commit.files.map((file) => (
                                <div
                                  key={file}
                                  className="flex items-center gap-2 text-xs text-muted-foreground py-0.5"
                                >
                                  <FileText className="w-3 h-3 shrink-0" />
                                  <span className="font-mono break-all">{file}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Load More button */}
                  {hasMoreCommits && commitLimit < 100 && (
                    <div className="flex justify-center pt-3 pb-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleLoadMore();
                        }}
                        disabled={loadingMoreCommits}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        {loadingMoreCommits ? (
                          <>
                            <Spinner size="sm" className="mr-2" />
                            Loading...
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-3.5 h-3.5 mr-1.5" />
                            Load More Commits
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="mt-4 pt-4 border-t">
            <Button
              variant="ghost"
              onClick={() => {
                setStep('select-branch');
                setSelectedBranch('');
              }}
            >
              Back
            </Button>
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isCherryPicking}>
              Cancel
            </Button>
            <Button
              onClick={handleCherryPick}
              disabled={selectedCommitHashes.size === 0 || isCherryPicking}
            >
              {isCherryPicking ? (
                <>
                  <Spinner size="sm" variant="foreground" className="mr-2" />
                  Cherry Picking...
                </>
              ) : (
                <>
                  <Cherry className="w-4 h-4 mr-2" />
                  Cherry Pick
                  {selectedCommitHashes.size > 0 ? ` (${selectedCommitHashes.size})` : ''}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Step 1: Select branch (and optionally remote)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cherry className="w-5 h-5 text-foreground" />
            Cherry Pick
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-4">
              <span className="block">
                Select a branch to cherry-pick commits from into{' '}
                <code className="font-mono bg-muted px-1 rounded">{worktree.branch}</code>
              </span>

              {loadingBranches ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Spinner size="sm" />
                  Loading branches...
                </div>
              ) : (
                <>
                  {/* Remote selector - only show if there are remotes */}
                  {remotes.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-sm text-foreground">Source</Label>
                      <Select
                        value={selectedRemote}
                        onValueChange={(value) => {
                          setSelectedRemote(value);
                          setSelectedBranch('');
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select source..." />
                        </SelectTrigger>
                        <SelectContent className="text-foreground">
                          <SelectItem value="__local__">Local Branches</SelectItem>
                          {remotes.map((remote) => (
                            <SelectItem key={remote.name} value={remote.name}>
                              {remote.name} ({remote.url})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Branch selector */}
                  <div className="space-y-2">
                    <Label className="text-sm text-foreground">Branch</Label>
                    {branchOptions.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No other branches available</p>
                    ) : (
                      <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select a branch..." />
                        </SelectTrigger>
                        <SelectContent className="text-foreground">
                          {branchOptions.map((branch) => (
                            <SelectItem key={branch} value={branch}>
                              {branch}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleProceedToCommits} disabled={!selectedBranch || loadingBranches}>
            <GitCommit className="w-4 h-4 mr-2" />
            View Commits
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
