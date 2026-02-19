import { useEffect, useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Archive,
  ChevronDown,
  ChevronRight,
  Clock,
  FileText,
  GitBranch,
  Play,
  Trash2,
} from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { getHttpApiClient } from '@/lib/http-api-client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { StashApplyConflictDialog } from './stash-apply-conflict-dialog';
import type { StashApplyConflictInfo } from '../worktree-panel/types';

interface WorktreeInfo {
  path: string;
  branch: string;
  isMain: boolean;
  hasChanges?: boolean;
  changedFilesCount?: number;
}

interface StashEntry {
  index: number;
  message: string;
  branch: string;
  date: string;
  files: string[];
}

interface ViewStashesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  worktree: WorktreeInfo | null;
  onStashApplied?: () => void;
  onStashApplyConflict?: (conflictInfo: StashApplyConflictInfo) => void;
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return 'Unknown date';
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

function StashEntryItem({
  stash,
  onApply,
  onPop,
  onDrop,
  isApplying,
  isDropping,
}: {
  stash: StashEntry;
  onApply: (index: number) => void;
  onPop: (index: number) => void;
  onDrop: (index: number) => void;
  isApplying: boolean;
  isDropping: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const isBusy = isApplying || isDropping;
  const hasFiles = stash.files && stash.files.length > 0;

  // Clean up the stash message for display
  const displayMessage =
    stash.message.replace(/^(WIP on|On) [^:]+:\s*[a-f0-9]+\s*/, '').trim() || stash.message;

  return (
    <div
      className={cn(
        'group relative rounded-md border bg-card transition-colors',
        'hover:border-primary/30'
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-3 p-3">
        {/* Stash icon (static) */}
        <div className="flex items-center pt-0.5 text-muted-foreground">
          <Archive className="w-3.5 h-3.5" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium leading-snug break-words">{displayMessage}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1 font-mono bg-muted px-1.5 py-0.5 rounded text-[10px]">
                  stash@{'{' + stash.index + '}'}
                </span>
                {stash.branch && (
                  <span className="inline-flex items-center gap-1">
                    <GitBranch className="w-3 h-3" />
                    {stash.branch}
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <time
                    dateTime={stash.date}
                    title={
                      !isNaN(new Date(stash.date).getTime())
                        ? new Date(stash.date).toLocaleString()
                        : stash.date
                    }
                  >
                    {formatRelativeDate(stash.date)}
                  </time>
                </span>
                {hasFiles && (
                  <button
                    onClick={() => setExpanded(!expanded)}
                    className="inline-flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"
                    aria-expanded={expanded}
                    aria-label={`${expanded ? 'Collapse' : 'Expand'} file list, ${stash.files.length} file${stash.files.length !== 1 ? 's' : ''}`}
                  >
                    {expanded ? (
                      <ChevronDown className="w-3 h-3" />
                    ) : (
                      <ChevronRight className="w-3 h-3" />
                    )}
                    <FileText className="w-3 h-3" />
                    {stash.files.length} file{stash.files.length !== 1 ? 's' : ''}
                  </button>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1 shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs px-2"
                onClick={() => onApply(stash.index)}
                disabled={isBusy}
                title="Apply stash (keep in stash list)"
              >
                {isApplying ? <Spinner size="xs" /> : <Play className="w-3 h-3 mr-1" />}
                Apply
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs px-2"
                onClick={() => onPop(stash.index)}
                disabled={isBusy}
                title="Pop stash (apply and remove from stash list)"
              >
                {isApplying ? <Spinner size="xs" /> : 'Pop'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                onClick={() => onDrop(stash.index)}
                disabled={isBusy}
                title="Delete this stash"
              >
                {isDropping ? <Spinner size="xs" /> : <Trash2 className="w-3 h-3" />}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Expanded file list */}
      {expanded && hasFiles && (
        <div className="border-t px-3 py-2 bg-muted/30">
          <div className="space-y-0.5">
            {stash.files.map((file) => (
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
}

export function ViewStashesDialog({
  open,
  onOpenChange,
  worktree,
  onStashApplied,
  onStashApplyConflict,
}: ViewStashesDialogProps) {
  const [stashes, setStashes] = useState<StashEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applyingIndex, setApplyingIndex] = useState<number | null>(null);
  const [droppingIndex, setDroppingIndex] = useState<number | null>(null);
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);
  const [conflictInfo, setConflictInfo] = useState<StashApplyConflictInfo | null>(null);

  const fetchStashes = useCallback(async () => {
    if (!worktree) return;

    setIsLoading(true);
    setError(null);

    try {
      const api = getHttpApiClient();
      const result = await api.worktree.stashList(worktree.path);

      if (result.success && result.result) {
        setStashes(result.result.stashes);
      } else {
        setError(result.error || 'Failed to load stashes');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stashes');
    } finally {
      setIsLoading(false);
    }
  }, [worktree]);

  useEffect(() => {
    if (open && worktree) {
      fetchStashes();
    }
    if (!open) {
      setStashes([]);
      setError(null);
    }
  }, [open, worktree, fetchStashes]);

  const handleApply = async (stashIndex: number) => {
    if (!worktree) return;

    setApplyingIndex(stashIndex);
    try {
      const api = getHttpApiClient();
      const result = await api.worktree.stashApply(worktree.path, stashIndex, false);

      if (result.success && result.result) {
        if (result.result.hasConflicts) {
          const info: StashApplyConflictInfo = {
            worktreePath: worktree.path,
            branchName: worktree.branch,
            stashRef: `stash@{${stashIndex}}`,
            operation: 'apply',
            conflictFiles: result.result.conflictFiles || [],
          };
          setConflictInfo(info);
          setConflictDialogOpen(true);
          onStashApplied?.();
        } else {
          toast.success('Stash applied');
          onStashApplied?.();
        }
      } else {
        toast.error('Failed to apply stash', {
          description: result.error || 'Unknown error',
        });
      }
    } catch (err) {
      toast.error('Failed to apply stash', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setApplyingIndex(null);
    }
  };

  const handlePop = async (stashIndex: number) => {
    if (!worktree) return;

    setApplyingIndex(stashIndex);
    try {
      const api = getHttpApiClient();
      const result = await api.worktree.stashApply(worktree.path, stashIndex, true);

      if (result.success && result.result) {
        if (result.result.hasConflicts) {
          const info: StashApplyConflictInfo = {
            worktreePath: worktree.path,
            branchName: worktree.branch,
            stashRef: `stash@{${stashIndex}}`,
            operation: 'pop',
            conflictFiles: result.result.conflictFiles || [],
          };
          setConflictInfo(info);
          setConflictDialogOpen(true);
        } else {
          toast.success('Stash popped', {
            description: 'Changes applied and stash removed.',
          });
        }
        // Refresh the stash list since the stash was removed
        await fetchStashes();
        onStashApplied?.();
      } else {
        toast.error('Failed to pop stash', {
          description: result.error || 'Unknown error',
        });
      }
    } catch (err) {
      toast.error('Failed to pop stash', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setApplyingIndex(null);
    }
  };

  const handleDrop = async (stashIndex: number) => {
    if (!worktree) return;

    setDroppingIndex(stashIndex);
    try {
      const api = getHttpApiClient();
      const result = await api.worktree.stashDrop(worktree.path, stashIndex);

      if (result.success) {
        toast.success('Stash deleted');
        // Refresh the stash list
        await fetchStashes();
      } else {
        toast.error('Failed to delete stash', {
          description: result.error || 'Unknown error',
        });
      }
    } catch (err) {
      toast.error('Failed to delete stash', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setDroppingIndex(null);
    }
  };

  if (!worktree) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full h-full max-w-full max-h-full sm:w-[90vw] sm:max-w-[640px] sm:max-h-[100dvh] sm:h-auto sm:rounded-xl rounded-none flex flex-col dialog-fullscreen-mobile">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Archive className="w-5 h-5" />
            Stashes
          </DialogTitle>
          <DialogDescription>
            Stashed changes in{' '}
            <code className="font-mono bg-muted px-1 rounded">{worktree.branch}</code>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 sm:min-h-[300px] sm:max-h-[60vh] overflow-y-auto scrollbar-visible -mx-6 -mb-6">
          <div className="h-full px-6 pb-6">
            {isLoading && (
              <div className="flex items-center justify-center py-12">
                <Spinner size="md" />
                <span className="ml-2 text-sm text-muted-foreground">Loading stashes...</span>
              </div>
            )}

            {error && (
              <div className="flex items-center justify-center py-12">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            {!isLoading && !error && stashes.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <Archive className="w-8 h-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">No stashes found</p>
                <p className="text-xs text-muted-foreground">
                  Use &quot;Stash Changes&quot; to save your uncommitted changes
                </p>
              </div>
            )}

            {!isLoading && !error && stashes.length > 0 && (
              <div className="space-y-2 mt-2">
                {stashes.map((stash) => (
                  <StashEntryItem
                    key={stash.index}
                    stash={stash}
                    onApply={handleApply}
                    onPop={handlePop}
                    onDrop={handleDrop}
                    isApplying={applyingIndex === stash.index}
                    isDropping={droppingIndex === stash.index}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>

      {/* Stash Apply Conflict Resolution Dialog */}
      <StashApplyConflictDialog
        open={conflictDialogOpen}
        onOpenChange={setConflictDialogOpen}
        conflictInfo={conflictInfo}
        onResolveWithAI={onStashApplyConflict}
      />
    </Dialog>
  );
}
