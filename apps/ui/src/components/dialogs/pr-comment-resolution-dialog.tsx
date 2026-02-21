/**
 * PR Comment Resolution Dialog
 *
 * A dialog that displays PR review comments with multi-selection support,
 * allowing users to create feature tasks to address comments individually
 * or as a group.
 */

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  MessageSquare,
  FileCode,
  User,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ChevronDown,
  ArrowUpDown,
  EyeOff,
  Eye,
  Maximize2,
  Check,
  Undo2,
  RefreshCw,
} from 'lucide-react';
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
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Markdown } from '@/components/ui/markdown';
import { cn, modelSupportsThinking, generateUUID } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import { useGitHubPRReviewComments } from '@/hooks/queries';
import { useCreateFeature, useResolveReviewThread } from '@/hooks/mutations';
import { toast } from 'sonner';
import type { PRReviewComment } from '@/lib/electron';
import type { Feature } from '@/store/app-store';
import type { PhaseModelEntry } from '@automaker/types';
import { supportsReasoningEffort, isAdaptiveThinkingModel } from '@automaker/types';
import { resolveModelString } from '@automaker/model-resolver';
import { PhaseModelSelector } from '@/components/views/settings-view/model-defaults';

// ============================================
// Types
// ============================================

type AddressMode = 'together' | 'individually';
type SortOrder = 'newest' | 'oldest';

/** Minimal PR info needed by the dialog - works with both GitHubPR and WorktreePRInfo */
export interface PRCommentResolutionPRInfo {
  number: number;
  title: string;
  /** The branch name (headRefName) associated with this PR, used to assign features to the correct worktree */
  headRefName?: string;
}

interface PRCommentResolutionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pr: PRCommentResolutionPRInfo;
}

// ============================================
// Utility Functions
// ============================================

/** Generate a feature ID */
function generateFeatureId(): string {
  return generateUUID();
}

/** Format a date string for display */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Format a time string for display */
function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/** Format the file location string */
function formatFileLocation(comment: PRReviewComment): string | null {
  if (!comment.path) return null;
  if (comment.line) return `${comment.path}:${comment.line}`;
  return comment.path;
}

// ============================================
// Prompt Generation
// ============================================

/** Generate a feature title for a single comment */
function generateSingleCommentTitle(
  pr: PRCommentResolutionPRInfo,
  comment: PRReviewComment
): string {
  const location = comment.path
    ? ` on ${comment.path}${comment.line ? `:${comment.line}` : ''}`
    : '';
  return `Address PR #${pr.number} comment by @${comment.author}${location}`;
}

/** Generate a feature title for multiple comments addressed together */
function generateGroupTitle(pr: PRCommentResolutionPRInfo, comments: PRReviewComment[]): string {
  return `Address ${comments.length} review comment${comments.length > 1 ? 's' : ''} on PR #${pr.number}`;
}

/** Generate a feature description for a single comment */
function generateSingleCommentDescription(
  pr: PRCommentResolutionPRInfo,
  comment: PRReviewComment
): string {
  const fileContext = comment.path
    ? `**File:** \`${comment.path}\`${comment.line ? ` (line ${comment.line})` : ''}\n`
    : '';

  return `## PR Review Comment Resolution

**Pull Request:** #${pr.number} - ${pr.title}
**Comment Author:** @${comment.author}
${fileContext}
### Review Comment

> ${comment.body.split('\n').join('\n> ')}

### Instructions

Please address the review comment above. The comment was left ${comment.isReviewComment ? 'as an inline code review' : 'as a general PR'} comment${comment.path ? ` on file \`${comment.path}\`` : ''}${comment.line ? ` at line ${comment.line}` : ''}.

Review the code in context and make the necessary changes to resolve this feedback. Ensure the changes:
1. Directly address the reviewer's concern
2. Follow the existing code patterns and conventions
3. Do not introduce regressions
`;
}

/** Generate a feature description for multiple comments addressed together */
function generateGroupDescription(
  pr: PRCommentResolutionPRInfo,
  comments: PRReviewComment[]
): string {
  const commentSections = comments
    .map((comment, index) => {
      const fileContext = comment.path
        ? `**File:** \`${comment.path}\`${comment.line ? ` (line ${comment.line})` : ''}\n`
        : '';

      return `### Comment ${index + 1} - by @${comment.author}
${fileContext}
> ${comment.body.split('\n').join('\n> ')}
`;
    })
    .join('\n---\n\n');

  return `## PR Review Comments Resolution

**Pull Request:** #${pr.number} - ${pr.title}
**Number of comments:** ${comments.length}

Please address all of the following review comments from this pull request.

---

${commentSections}

### Instructions

Please address all the review comments listed above. For each comment:
1. Review the code in context at the specified file and line
2. Make the necessary changes to resolve the reviewer's feedback
3. Ensure changes follow existing code patterns and conventions
4. Do not introduce regressions
`;
}

// ============================================
// Comment Row Component
// ============================================

interface CommentRowProps {
  comment: PRReviewComment;
  isSelected: boolean;
  onToggle: () => void;
  onExpandDetail: () => void;
  onResolve?: (comment: PRReviewComment, resolve: boolean) => void;
  isResolvingThread?: boolean;
}

function CommentRow({
  comment,
  isSelected,
  onToggle,
  onExpandDetail,
  onResolve,
  isResolvingThread,
}: CommentRowProps) {
  const fileLocation = formatFileLocation(comment);
  const [isExpanded, setIsExpanded] = useState(false);

  // Determine if the comment body is long enough to need expansion
  const PREVIEW_CHAR_LIMIT = 200;
  const needsExpansion = comment.body.length > PREVIEW_CHAR_LIMIT || comment.body.includes('\n');

  const handleExpandToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded((prev) => !prev);
  }, []);

  const handleExpandDetail = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onExpandDetail();
    },
    [onExpandDetail]
  );

  const handleResolveClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (onResolve) {
        onResolve(comment, !comment.isResolved);
      }
    },
    [comment, onResolve]
  );

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 rounded-lg border border-border transition-colors cursor-pointer',
        isSelected ? 'bg-accent/50 border-primary/30' : 'hover:bg-accent/30'
      )}
      onClick={onToggle}
    >
      <Checkbox
        checked={isSelected}
        onCheckedChange={() => onToggle()}
        className="mt-0.5"
        onClick={(e) => e.stopPropagation()}
      />

      <div className="flex-1 min-w-0">
        {/* Header: disclosure triangle + author + file location + tags */}
        <div className="flex items-start gap-1.5 flex-wrap mb-1">
          {/* Disclosure triangle - always shown, toggles expand/collapse */}
          {needsExpansion ? (
            <button
              type="button"
              onClick={handleExpandToggle}
              className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground transition-colors"
              title={isExpanded ? 'Collapse comment' : 'Expand comment'}
            >
              {isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 -rotate-90" />
              )}
            </button>
          ) : (
            <span className="mt-0.5 shrink-0 w-3.5 h-3.5" />
          )}

          <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              {comment.avatarUrl ? (
                <img
                  src={comment.avatarUrl}
                  alt={comment.author}
                  className="h-5 w-5 rounded-full"
                />
              ) : (
                <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center">
                  <User className="h-3 w-3 text-muted-foreground" />
                </div>
              )}
              <span className="text-sm font-medium">@{comment.author}</span>
            </div>

            {fileLocation && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <FileCode className="h-3 w-3" />
                <span className="font-mono">{fileLocation}</span>
              </div>
            )}

            {comment.isOutdated && (
              <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-yellow-500/10 text-yellow-500">
                Outdated
              </span>
            )}

            {comment.isReviewComment && (
              <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-blue-500/10 text-blue-500">
                Review
              </span>
            )}

            {comment.isResolved && (
              <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-green-500/10 text-green-600 dark:text-green-500">
                Resolved
              </span>
            )}

            {/* Resolve / Unresolve button - only for review comments with a threadId */}
            {comment.isReviewComment && comment.threadId && onResolve && (
              <button
                type="button"
                onClick={handleResolveClick}
                disabled={isResolvingThread}
                className={cn(
                  'shrink-0 transition-colors p-0.5 rounded flex items-center gap-1 text-[10px] font-medium',
                  comment.isResolved
                    ? 'text-green-600 dark:text-green-500 hover:text-muted-foreground hover:bg-muted'
                    : 'text-muted-foreground hover:text-green-600 dark:hover:text-green-500 hover:bg-muted',
                  isResolvingThread && 'opacity-50 cursor-not-allowed'
                )}
                title={comment.isResolved ? 'Unresolve this thread' : 'Resolve this thread'}
              >
                {isResolvingThread ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : comment.isResolved ? (
                  <Undo2 className="h-3.5 w-3.5" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
              </button>
            )}

            {/* Expand detail button */}
            <button
              type="button"
              onClick={handleExpandDetail}
              className="ml-auto shrink-0 text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded hover:bg-muted"
              title="View full comment details"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Comment body - collapsible, rendered as markdown */}
        {isExpanded ? (
          <div className="pl-5" onClick={(e) => e.stopPropagation()}>
            <Markdown className="text-sm [&_p]:text-muted-foreground [&_li]:text-muted-foreground">
              {comment.body}
            </Markdown>
          </div>
        ) : (
          <div className="pl-5 line-clamp-2">
            <Markdown className="text-sm [&_p]:text-muted-foreground [&_li]:text-muted-foreground [&_p]:my-0 [&_ul]:my-0 [&_ol]:my-0 [&_h1]:text-sm [&_h2]:text-sm [&_h3]:text-sm [&_h4]:text-sm [&_h1]:my-0 [&_h2]:my-0 [&_h3]:my-0 [&_h4]:my-0 [&_pre]:my-0 [&_blockquote]:my-0">
              {comment.body}
            </Markdown>
          </div>
        )}

        {/* Date row */}
        <div className="flex items-center mt-1 pl-5">
          <div className="flex flex-col">
            <div className="text-xs text-muted-foreground">{formatDate(comment.createdAt)}</div>
            <div className="text-xs text-muted-foreground/70">{formatTime(comment.createdAt)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Comment Detail Dialog Component
// ============================================

interface CommentDetailDialogProps {
  comment: PRReviewComment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function CommentDetailDialog({ comment, open, onOpenChange }: CommentDetailDialogProps) {
  if (!comment) return null;

  const fileLocation = formatFileLocation(comment);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-blue-500" />
            Comment Details
          </DialogTitle>
          <DialogDescription>
            Full view of the review comment with rendered content.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6">
          <div className="space-y-4 pb-2">
            {/* Author & metadata section */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                {comment.avatarUrl ? (
                  <img
                    src={comment.avatarUrl}
                    alt={comment.author}
                    className="h-8 w-8 rounded-full"
                  />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
                <div>
                  <span className="text-sm font-semibold">@{comment.author}</span>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(comment.createdAt)} at {formatTime(comment.createdAt)}
                  </div>
                </div>
              </div>

              {/* Badges */}
              <div className="flex items-center gap-1.5 ml-auto">
                {comment.isOutdated && (
                  <span className="px-2 py-0.5 text-xs font-medium rounded bg-yellow-500/10 text-yellow-500">
                    Outdated
                  </span>
                )}
                {comment.isReviewComment && (
                  <span className="px-2 py-0.5 text-xs font-medium rounded bg-blue-500/10 text-blue-500">
                    Review
                  </span>
                )}
                {comment.isResolved && (
                  <span className="px-2 py-0.5 text-xs font-medium rounded bg-green-500/10 text-green-600 dark:text-green-500">
                    Resolved
                  </span>
                )}
              </div>
            </div>

            {/* File location */}
            {fileLocation && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/50 border border-border">
                <FileCode className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-mono text-muted-foreground">{fileLocation}</span>
              </div>
            )}

            {/* Diff hunk */}
            {comment.diffHunk && (
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="px-3 py-1.5 bg-muted/50 border-b border-border">
                  <span className="text-xs font-medium text-muted-foreground">Code Context</span>
                </div>
                <pre className="p-3 text-xs font-mono overflow-x-auto bg-card text-foreground-secondary leading-relaxed">
                  {comment.diffHunk}
                </pre>
              </div>
            )}

            {/* Comment body - rendered as markdown */}
            <div className="rounded-lg border border-border p-4">
              <Markdown className="text-sm">{comment.body}</Markdown>
            </div>

            {/* Additional metadata */}
            {(comment.updatedAt || comment.commitId || comment.side) && (
              <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                {comment.updatedAt && comment.updatedAt !== comment.createdAt && (
                  <span>Updated: {formatDate(comment.updatedAt)}</span>
                )}
                {comment.commitId && (
                  <span className="font-mono">Commit: {comment.commitId.slice(0, 7)}</span>
                )}
                {comment.side && <span>Side: {comment.side}</span>}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================
// Error State Component
// ============================================

interface CreationErrorStateProps {
  errors: Array<{ comment: PRReviewComment; error: string }>;
  onDismiss: () => void;
}

function CreationErrorState({ errors, onDismiss }: CreationErrorStateProps) {
  return (
    <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
      <div className="flex items-center gap-2 mb-2">
        <AlertCircle className="h-4 w-4 text-destructive" />
        <span className="text-sm font-medium text-destructive">
          Failed to create {errors.length} feature{errors.length > 1 ? 's' : ''}
        </span>
      </div>
      <ul className="text-xs text-muted-foreground space-y-1 ml-6">
        {errors.map((err, i) => (
          <li key={i}>
            <span className="font-medium">@{err.comment.author}</span>
            {err.comment.path && <span> on {err.comment.path}</span>}: {err.error}
          </li>
        ))}
      </ul>
      <Button variant="ghost" size="sm" className="mt-2" onClick={onDismiss}>
        Dismiss
      </Button>
    </div>
  );
}

// ============================================
// Main Dialog Component
// ============================================

export function PRCommentResolutionDialog({
  open,
  onOpenChange,
  pr,
}: PRCommentResolutionDialogProps) {
  const { currentProject, defaultFeatureModel } = useAppStore();

  // Use project-level default feature model if set, otherwise fall back to global
  const effectiveDefaultFeatureModel = currentProject?.defaultFeatureModel ?? defaultFeatureModel;

  // State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [addressMode, setAddressMode] = useState<AddressMode>('together');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
  const [showResolved, setShowResolved] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [creationErrors, setCreationErrors] = useState<
    Array<{ comment: PRReviewComment; error: string }>
  >([]);
  const [detailComment, setDetailComment] = useState<PRReviewComment | null>(null);

  // Per-thread resolving state - tracks which threads are currently being resolved/unresolved
  const [resolvingThreads, setResolvingThreads] = useState<Set<string>>(new Set());

  // Model selection state
  const [modelEntry, setModelEntry] = useState<PhaseModelEntry>({ model: 'claude-sonnet' });

  // Track previous open state to detect when dialog opens
  const wasOpenRef = useRef(false);

  const handleModelChange = useCallback((entry: PhaseModelEntry) => {
    // Normalize thinking level when switching between adaptive and non-adaptive models
    const isNewModelAdaptive =
      typeof entry.model === 'string' && isAdaptiveThinkingModel(entry.model);
    const currentLevel = entry.thinkingLevel || 'none';

    if (isNewModelAdaptive && currentLevel !== 'none' && currentLevel !== 'adaptive') {
      // Switching TO an adaptive model with a manual level -> auto-switch to 'adaptive'
      setModelEntry({ ...entry, thinkingLevel: 'adaptive' });
    } else if (!isNewModelAdaptive && currentLevel === 'adaptive') {
      // Switching FROM an adaptive model with adaptive -> auto-switch to 'high'
      setModelEntry({ ...entry, thinkingLevel: 'high' });
    } else {
      setModelEntry(entry);
    }
  }, []);

  // Fetch PR review comments
  const {
    data,
    isLoading: loading,
    isFetching: refreshing,
    error,
    refetch,
  } = useGitHubPRReviewComments(currentProject?.path, open ? pr.number : undefined);

  // Sync model defaults and refresh comments when dialog opens (transitions from closed to open)
  useEffect(() => {
    const justOpened = open && !wasOpenRef.current;
    wasOpenRef.current = open;

    if (justOpened) {
      setModelEntry(effectiveDefaultFeatureModel);
      // Force refresh PR comments from GitHub when dialog opens
      refetch();
    }
  }, [open, effectiveDefaultFeatureModel, refetch]);

  const allComments = useMemo(() => {
    const raw = data?.comments ?? [];
    // Sort based on current sort order
    return [...raw].sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
    });
  }, [data, sortOrder]);

  // Count resolved and unresolved comments for filter display
  const resolvedCount = useMemo(
    () => allComments.filter((c) => c.isResolved).length,
    [allComments]
  );
  const hasResolvedComments = resolvedCount > 0;

  const comments = useMemo(() => {
    if (showResolved) return allComments;
    return allComments.filter((c) => !c.isResolved);
  }, [allComments, showResolved]);

  // Feature creation mutation
  const createFeature = useCreateFeature(currentProject?.path ?? '');

  // Resolve/unresolve thread mutation
  const resolveThread = useResolveReviewThread(currentProject?.path ?? '', pr.number);

  // Derived state
  const allSelected = comments.length > 0 && comments.every((c) => selectedIds.has(c.id));
  const someSelected = selectedIds.size > 0 && !allSelected;
  const noneSelected = selectedIds.size === 0;

  // ============================================
  // Handlers
  // ============================================

  const handleToggleComment = useCallback((commentId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(commentId)) {
        next.delete(commentId);
      } else {
        next.add(commentId);
      }
      return next;
    });
  }, []);

  const handleResolveComment = useCallback(
    (comment: PRReviewComment, resolve: boolean) => {
      if (!comment.threadId) return;
      const threadId = comment.threadId;
      setResolvingThreads((prev) => {
        const next = new Set(prev);
        next.add(threadId);
        return next;
      });
      resolveThread.mutate(
        { threadId, resolve },
        {
          onSettled: () => {
            setResolvingThreads((prev) => {
              const next = new Set(prev);
              next.delete(threadId);
              return next;
            });
          },
        }
      );
    },
    [resolveThread]
  );

  const handleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(comments.map((c) => c.id)));
    }
  }, [allSelected, comments]);

  const handleModeChange = useCallback((checked: boolean) => {
    setAddressMode(checked ? 'individually' : 'together');
  }, []);

  const handleSortToggle = useCallback(() => {
    setSortOrder((prev) => (prev === 'newest' ? 'oldest' : 'newest'));
  }, []);

  const handleShowResolvedToggle = useCallback(() => {
    setShowResolved((prev) => {
      const nextShowResolved = !prev;
      // When hiding resolved comments, remove any selected resolved comment IDs
      if (!nextShowResolved) {
        setSelectedIds((prevIds) => {
          const resolvedIds = new Set(allComments.filter((c) => c.isResolved).map((c) => c.id));
          const next = new Set(prevIds);
          for (const id of resolvedIds) {
            next.delete(id);
          }
          return next.size !== prevIds.size ? next : prevIds;
        });
      }
      return nextShowResolved;
    });
  }, [allComments]);

  const handleSubmit = useCallback(async () => {
    if (noneSelected || !currentProject?.path) return;

    const selectedComments = comments.filter((c) => selectedIds.has(c.id));

    // Resolve model settings from the current model entry
    const selectedModel = resolveModelString(modelEntry.model);
    const normalizedThinking = modelSupportsThinking(selectedModel)
      ? modelEntry.thinkingLevel || 'none'
      : 'none';
    const normalizedReasoning = supportsReasoningEffort(selectedModel)
      ? modelEntry.reasoningEffort || 'none'
      : 'none';

    setIsCreating(true);
    setCreationErrors([]);

    try {
      if (addressMode === 'together') {
        // Create a single feature for all selected comments
        const feature: Feature = {
          id: generateFeatureId(),
          title: generateGroupTitle(pr, selectedComments),
          category: 'bug-fix',
          description: generateGroupDescription(pr, selectedComments),
          steps: [],
          status: 'backlog',
          model: selectedModel,
          thinkingLevel: normalizedThinking,
          reasoningEffort: normalizedReasoning,
          // Associate feature with the PR's branch so it appears on the correct worktree
          ...(pr.headRefName ? { branchName: pr.headRefName } : {}),
        };

        await createFeature.mutateAsync(feature);
        toast.success('Feature created', {
          description: `Created feature to address ${selectedComments.length} PR comment${selectedComments.length > 1 ? 's' : ''}`,
        });
        onOpenChange(false);
      } else {
        // Create one feature per selected comment
        const errors: Array<{ comment: PRReviewComment; error: string }> = [];
        let successCount = 0;

        for (const comment of selectedComments) {
          try {
            const feature: Feature = {
              id: generateFeatureId(),
              title: generateSingleCommentTitle(pr, comment),
              category: 'bug-fix',
              description: generateSingleCommentDescription(pr, comment),
              steps: [],
              status: 'backlog',
              model: selectedModel,
              thinkingLevel: normalizedThinking,
              reasoningEffort: normalizedReasoning,
              // Associate feature with the PR's branch so it appears on the correct worktree
              ...(pr.headRefName ? { branchName: pr.headRefName } : {}),
            };

            await createFeature.mutateAsync(feature);
            successCount++;
          } catch (err) {
            errors.push({
              comment,
              error: err instanceof Error ? err.message : 'Unknown error',
            });
          }
        }

        if (errors.length > 0) {
          setCreationErrors(errors);
          if (successCount > 0) {
            toast.warning(`Created ${successCount} feature${successCount > 1 ? 's' : ''}`, {
              description: `${errors.length} failed to create`,
            });
          }
        } else {
          toast.success(`Created ${successCount} feature${successCount > 1 ? 's' : ''}`, {
            description: `Each PR comment will be addressed individually`,
          });
          onOpenChange(false);
        }
      }
    } catch (err) {
      toast.error('Failed to create feature', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setIsCreating(false);
    }
  }, [
    noneSelected,
    currentProject?.path,
    comments,
    selectedIds,
    addressMode,
    pr,
    createFeature,
    onOpenChange,
    modelEntry,
  ]);

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) {
        // Reset state when closing
        setSelectedIds(new Set());
        setAddressMode('together');
        setSortOrder('newest');
        setShowResolved(false);
        setCreationErrors([]);
        setDetailComment(null);
        setResolvingThreads(new Set());
        setModelEntry(effectiveDefaultFeatureModel);
      }
      onOpenChange(newOpen);
    },
    [onOpenChange, effectiveDefaultFeatureModel]
  );

  // ============================================
  // Render
  // ============================================

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-blue-500" />
              Manage PR Review Comments
            </DialogTitle>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 shrink-0"
              onClick={() => refetch()}
              disabled={refreshing}
              title="Refresh comments"
            >
              <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
            </Button>
          </div>
          <DialogDescription>
            Select comments from PR #{pr.number} to create feature tasks that address them.
          </DialogDescription>
        </DialogHeader>

        {/* Content Area */}
        <div className="flex-1 min-h-0 flex flex-col gap-4 overflow-hidden">
          {/* Loading State */}
          {loading && (
            <div className="flex-1 flex items-center justify-center py-12">
              <Spinner size="lg" />
            </div>
          )}

          {/* Error State */}
          {error && !loading && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="p-3 rounded-full bg-destructive/10 mb-3">
                <AlertCircle className="h-8 w-8 text-destructive" />
              </div>
              <h3 className="text-sm font-medium mb-1">Failed to Load Comments</h3>
              <p className="text-xs text-muted-foreground mb-3">
                {error instanceof Error ? error.message : 'Unknown error'}
              </p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Try Again
              </Button>
            </div>
          )}

          {/* Comments List (controls + items) - shown whenever there are any comments */}
          {!loading && !error && allComments.length > 0 && (
            <>
              {/* Controls Bar */}
              <div className="flex items-center justify-between gap-4 px-1">
                {/* Select All - only interactive when there are visible comments */}
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                    onCheckedChange={handleSelectAll}
                    disabled={comments.length === 0}
                  />
                  <Label
                    className={cn(
                      'text-sm',
                      comments.length > 0 ? 'cursor-pointer' : 'text-muted-foreground'
                    )}
                    onClick={comments.length > 0 ? handleSelectAll : undefined}
                  >
                    {allSelected
                      ? 'Deselect all'
                      : `Select all (${comments.length}${!showResolved && hasResolvedComments ? ` of ${allComments.length}` : ''})`}
                  </Label>
                </div>

                <div className="flex items-center gap-3">
                  {/* Show/Hide Resolved Filter Toggle - always visible */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      'h-7 px-2 text-xs gap-1',
                      showResolved && 'text-foreground',
                      !hasResolvedComments && 'opacity-50'
                    )}
                    onClick={handleShowResolvedToggle}
                    disabled={!hasResolvedComments}
                    title={
                      !hasResolvedComments
                        ? 'No resolved comments'
                        : showResolved
                          ? `Showing all comments — click to hide ${resolvedCount} resolved`
                          : `Hiding ${resolvedCount} resolved — click to show all`
                    }
                  >
                    {showResolved ? (
                      <>
                        <Eye className="h-3 w-3" />
                        Hide resolved
                      </>
                    ) : (
                      <>
                        <EyeOff className="h-3 w-3" />
                        Show resolved
                      </>
                    )}
                    {hasResolvedComments && (
                      <span className="ml-0.5 px-1 py-0 text-[10px] font-medium rounded bg-muted text-muted-foreground">
                        {resolvedCount}
                      </span>
                    )}
                  </Button>

                  {/* Sort Toggle Button */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs gap-1"
                    onClick={handleSortToggle}
                    title={
                      sortOrder === 'newest'
                        ? 'Showing newest first — click for oldest first'
                        : 'Showing oldest first — click for newest first'
                    }
                  >
                    <ArrowUpDown className="h-3 w-3" />
                    {sortOrder === 'newest' ? 'Newest first' : 'Oldest first'}
                  </Button>

                  {/* Mode Toggle */}
                  <div className="flex items-center gap-2">
                    <Label
                      className={cn(
                        'text-xs cursor-pointer',
                        addressMode === 'together' ? 'text-foreground' : 'text-muted-foreground'
                      )}
                    >
                      Together
                    </Label>
                    <Switch
                      checked={addressMode === 'individually'}
                      onCheckedChange={handleModeChange}
                    />
                    <Label
                      className={cn(
                        'text-xs cursor-pointer',
                        addressMode === 'individually' ? 'text-foreground' : 'text-muted-foreground'
                      )}
                    >
                      Individually
                    </Label>
                  </div>
                </div>
              </div>

              {/* Empty State - all comments filtered out (all resolved, filter hiding them) */}
              {comments.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="p-3 rounded-full bg-muted/50 mb-3">
                    <CheckCircle2 className="h-8 w-8 text-green-500" />
                  </div>
                  <h3 className="text-sm font-medium mb-1">All Comments Resolved</h3>
                  <p className="text-xs text-muted-foreground mb-3">
                    All {resolvedCount} comment{resolvedCount !== 1 ? 's' : ''} on this pull request{' '}
                    {resolvedCount !== 1 ? 'have' : 'has'} been resolved.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleShowResolvedToggle}
                    className="text-xs"
                  >
                    <Eye className="h-3 w-3 mr-1.5" />
                    Show resolved comments
                  </Button>
                </div>
              )}

              {/* Selection Info */}
              {!noneSelected && comments.length > 0 && (
                <div className="text-xs text-muted-foreground px-1">
                  {selectedIds.size} comment{selectedIds.size > 1 ? 's' : ''} selected
                  {addressMode === 'together'
                    ? ' - will create 1 feature'
                    : ` - will create ${selectedIds.size} feature${selectedIds.size > 1 ? 's' : ''}`}
                </div>
              )}

              {/* Scrollable Comments */}
              {comments.length > 0 && (
                <div className="flex-1 overflow-auto space-y-2 min-h-0 pr-1">
                  {comments.map((comment) => (
                    <CommentRow
                      key={comment.id}
                      comment={comment}
                      isSelected={selectedIds.has(comment.id)}
                      onToggle={() => handleToggleComment(comment.id)}
                      onExpandDetail={() => setDetailComment(comment)}
                      onResolve={handleResolveComment}
                      isResolvingThread={
                        !!comment.threadId && resolvingThreads.has(comment.threadId)
                      }
                    />
                  ))}
                </div>
              )}

              {/* Creation Errors */}
              {creationErrors.length > 0 && (
                <CreationErrorState
                  errors={creationErrors}
                  onDismiss={() => setCreationErrors([])}
                />
              )}
            </>
          )}

          {/* Empty State - no comments at all */}
          {!loading && !error && allComments.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="p-3 rounded-full bg-muted/50 mb-3">
                <CheckCircle2 className="h-8 w-8 text-green-500" />
              </div>
              <h3 className="text-sm font-medium mb-1">No Open Comments</h3>
              <p className="text-xs text-muted-foreground">
                This pull request has no comments to address.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="mt-4">
          <div className="flex items-center justify-between gap-2 w-full flex-wrap">
            {/* Cancel button - left side */}
            <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isCreating}>
              Cancel
            </Button>

            {/* Model selector + Create button - right side */}
            <div className="flex items-center gap-2">
              {!loading && !error && allComments.length > 0 && (
                <PhaseModelSelector
                  value={modelEntry}
                  onChange={handleModelChange}
                  compact
                  align="end"
                />
              )}
              <Button
                onClick={handleSubmit}
                disabled={noneSelected || isCreating || loading || comments.length === 0}
              >
                {isCreating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    Create Feature
                    {addressMode === 'individually' && selectedIds.size > 1 ? 's' : ''}
                    {!noneSelected && (
                      <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-primary-foreground/20 rounded">
                        {addressMode === 'together' ? '1' : selectedIds.size}
                      </span>
                    )}
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>

      {/* Comment Detail Dialog - opened when user clicks expand on a comment */}
      <CommentDetailDialog
        comment={detailComment}
        open={!!detailComment}
        onOpenChange={(open) => {
          if (!open) setDetailComment(null);
        }}
      />
    </Dialog>
  );
}
