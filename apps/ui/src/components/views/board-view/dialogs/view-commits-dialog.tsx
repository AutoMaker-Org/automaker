import { useCallback, useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  GitCommit,
  User,
  Clock,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
} from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { getHttpApiClient } from '@/lib/http-api-client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface WorktreeInfo {
  path: string;
  branch: string;
  isMain: boolean;
  hasChanges?: boolean;
  changedFilesCount?: number;
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

interface ViewCommitsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  worktree: WorktreeInfo | null;
}

function formatRelativeDate(dateStr: string): string {
  if (!dateStr) return 'unknown date';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return 'unknown date';
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

function CommitEntryItem({
  commit,
  index,
  isLast,
}: {
  commit: CommitInfo;
  index: number;
  isLast: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasFiles = commit.files && commit.files.length > 0;

  return (
    <div
      className={cn('group relative rounded-md transition-colors', index === 0 && 'bg-muted/30')}
    >
      <div className="flex gap-3 py-2.5 px-3 hover:bg-muted/50 transition-colors rounded-md">
        {/* Timeline dot and line */}
        <div className="flex flex-col items-center pt-1.5 shrink-0">
          <div
            className={cn(
              'w-2 h-2 rounded-full border-2',
              index === 0 ? 'border-primary bg-primary' : 'border-muted-foreground/40 bg-background'
            )}
          />
          {!isLast && <div className="w-px flex-1 bg-border mt-1" />}
        </div>

        {/* Commit content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium leading-snug break-words">{commit.subject}</p>
            <CopyHashButton hash={commit.hash} />
          </div>
          {commit.body && (
            <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap break-words line-clamp-3">
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
              <time dateTime={commit.date} title={new Date(commit.date).toLocaleString()}>
                {formatRelativeDate(commit.date)}
              </time>
            </span>
            {hasFiles && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="inline-flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"
              >
                {expanded ? (
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
      {expanded && hasFiles && (
        <div className="border-t px-3 py-2 bg-muted/30">
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
}

const INITIAL_COMMIT_LIMIT = 30;
const LOAD_MORE_INCREMENT = 30;
const MAX_COMMIT_LIMIT = 100;

export function ViewCommitsDialog({ open, onOpenChange, worktree }: ViewCommitsDialogProps) {
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(INITIAL_COMMIT_LIMIT);
  const [hasMore, setHasMore] = useState(false);

  const fetchCommits = useCallback(
    async (fetchLimit: number, isLoadMore = false) => {
      if (isLoadMore) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
        setError(null);
        setCommits([]);
      }

      try {
        const api = getHttpApiClient();
        const result = await api.worktree.getCommitLog(worktree!.path, fetchLimit);

        if (result.success && result.result) {
          // Ensure each commit has a files array (backwards compat if server hasn't been rebuilt)
          const fetchedCommits = result.result.commits.map((c: CommitInfo) => ({
            ...c,
            files: c.files || [],
          }));
          setCommits(fetchedCommits);
          // If we got back exactly as many commits as we requested, there may be more
          setHasMore(fetchedCommits.length === fetchLimit && fetchLimit < MAX_COMMIT_LIMIT);
        } else {
          setError(result.error || 'Failed to load commits');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load commits');
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [worktree]
  );

  useEffect(() => {
    if (!open || !worktree) return;
    setLimit(INITIAL_COMMIT_LIMIT);
    setHasMore(false);
    fetchCommits(INITIAL_COMMIT_LIMIT);
  }, [open, worktree, fetchCommits]);

  const handleLoadMore = () => {
    const newLimit = Math.min(limit + LOAD_MORE_INCREMENT, MAX_COMMIT_LIMIT);
    setLimit(newLimit);
    fetchCommits(newLimit, true);
  };

  if (!worktree) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full h-full max-w-full max-h-full sm:w-[90vw] sm:max-w-[640px] sm:max-h-[100dvh] sm:h-auto sm:rounded-xl rounded-none flex flex-col dialog-fullscreen-mobile">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCommit className="w-5 h-5" />
            Commit History
          </DialogTitle>
          <DialogDescription>
            Recent commits on{' '}
            <code className="font-mono bg-muted px-1 rounded">{worktree.branch}</code>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 sm:min-h-[400px] sm:max-h-[60vh] overflow-y-auto scrollbar-visible -mx-6 -mb-6">
          <div className="h-full px-6 pb-6">
            {isLoading && (
              <div className="flex items-center justify-center py-12">
                <Spinner size="md" />
                <span className="ml-2 text-sm text-muted-foreground">Loading commits...</span>
              </div>
            )}

            {error && (
              <div className="flex items-center justify-center py-12">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            {!isLoading && !error && commits.length === 0 && (
              <div className="flex items-center justify-center py-12">
                <p className="text-sm text-muted-foreground">No commits found</p>
              </div>
            )}

            {!isLoading && !error && commits.length > 0 && (
              <div className="space-y-0.5 mt-2">
                {commits.map((commit, index) => (
                  <CommitEntryItem
                    key={commit.hash}
                    commit={commit}
                    index={index}
                    isLast={index === commits.length - 1 && !hasMore}
                  />
                ))}
                {hasMore && (
                  <div className="flex justify-center pt-3 pb-1">
                    <button
                      onClick={handleLoadMore}
                      disabled={isLoadingMore}
                      className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer px-4 py-2 rounded-md hover:bg-muted/50"
                    >
                      {isLoadingMore ? (
                        <>
                          <Spinner size="sm" />
                          Loading more commits...
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-4 h-4" />
                          Load more commits
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
