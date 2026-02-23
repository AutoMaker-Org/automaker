import { useState, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  File,
  FileText,
  FilePlus,
  FileX,
  FilePen,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  GitBranch,
  GitMerge,
  AlertCircle,
  Plus,
  Minus,
} from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { TruncatedFilePath } from '@/components/ui/truncated-file-path';
import { CodeMirrorDiffView } from '@/components/ui/codemirror-diff-view';
import { Button } from './button';
import { useWorktreeDiffs, useGitDiffs } from '@/hooks/queries';
import { getElectronAPI } from '@/lib/electron';
import { toast } from 'sonner';
import { parseDiff, splitDiffByFile } from '@/lib/diff-utils';
import type { ParsedFileDiff } from '@/lib/diff-utils';
import type { FileStatus, MergeStateInfo } from '@/types/electron';

interface GitDiffPanelProps {
  projectPath: string;
  featureId: string;
  className?: string;
  /** Whether to show the panel in a compact/minimized state initially */
  compact?: boolean;
  /** Whether worktrees are enabled - if false, shows diffs from main project */
  useWorktrees?: boolean;
  /** Whether to show stage/unstage controls for each file */
  enableStaging?: boolean;
  /** The worktree path to use for staging operations (required when enableStaging is true) */
  worktreePath?: string;
}

const getFileIcon = (status: string) => {
  switch (status) {
    case 'A':
    case '?':
      return <FilePlus className="w-4 h-4 text-green-500" />;
    case 'D':
      return <FileX className="w-4 h-4 text-red-500" />;
    case 'M':
    case 'U':
      return <FilePen className="w-4 h-4 text-amber-500" />;
    case 'R':
    case 'C':
      return <File className="w-4 h-4 text-blue-500" />;
    default:
      return <FileText className="w-4 h-4 text-muted-foreground" />;
  }
};

const getStatusBadgeColor = (status: string) => {
  switch (status) {
    case 'A':
    case '?':
      return 'bg-green-500/20 text-green-400 border-green-500/30';
    case 'D':
      return 'bg-red-500/20 text-red-400 border-red-500/30';
    case 'M':
    case 'U':
      return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    case 'R':
    case 'C':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
};

const getStatusDisplayName = (status: string) => {
  switch (status) {
    case 'A':
      return 'Added';
    case '?':
      return 'Untracked';
    case 'D':
      return 'Deleted';
    case 'M':
      return 'Modified';
    case 'U':
      return 'Updated';
    case 'R':
      return 'Renamed';
    case 'C':
      return 'Copied';
    default:
      return 'Changed';
  }
};

/**
 * Determine the staging state of a file based on its indexStatus and workTreeStatus
 */
function getStagingState(file: FileStatus): 'staged' | 'unstaged' | 'partial' {
  const idx = file.indexStatus ?? ' ';
  const wt = file.workTreeStatus ?? ' ';

  // Untracked files
  if (idx === '?' && wt === '?') return 'unstaged';

  const hasIndexChanges = idx !== ' ' && idx !== '?';
  const hasWorkTreeChanges = wt !== ' ' && wt !== '?';

  if (hasIndexChanges && hasWorkTreeChanges) return 'partial';
  if (hasIndexChanges) return 'staged';
  return 'unstaged';
}

function StagingBadge({ state }: { state: 'staged' | 'unstaged' | 'partial' }) {
  if (state === 'staged') {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded border font-medium bg-green-500/15 text-green-400 border-green-500/30">
        Staged
      </span>
    );
  }
  if (state === 'partial') {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded border font-medium bg-amber-500/15 text-amber-400 border-amber-500/30">
        Partial
      </span>
    );
  }
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded border font-medium bg-muted text-muted-foreground border-border">
      Unstaged
    </span>
  );
}

function MergeBadge({ mergeType }: { mergeType?: string }) {
  if (!mergeType) return null;

  const label = (() => {
    switch (mergeType) {
      case 'both-modified':
        return 'Both Modified';
      case 'added-by-us':
        return 'Added by Us';
      case 'added-by-them':
        return 'Added by Them';
      case 'deleted-by-us':
        return 'Deleted by Us';
      case 'deleted-by-them':
        return 'Deleted by Them';
      case 'both-added':
        return 'Both Added';
      case 'both-deleted':
        return 'Both Deleted';
      case 'merged':
        return 'Merged';
      default:
        return 'Merge';
    }
  })();

  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded border font-medium bg-purple-500/15 text-purple-400 border-purple-500/30 inline-flex items-center gap-1">
      <GitMerge className="w-2.5 h-2.5" />
      {label}
    </span>
  );
}

function MergeStateBanner({ mergeState }: { mergeState: MergeStateInfo }) {
  // Completed merge commit (HEAD is a merge)
  if (mergeState.isMergeCommit && !mergeState.isMerging) {
    return (
      <div className="mx-4 mt-3 flex items-start gap-2 p-3 rounded-md bg-purple-500/10 border border-purple-500/20">
        <GitMerge className="w-4 h-4 text-purple-500 mt-0.5 flex-shrink-0" />
        <div className="text-sm">
          <span className="font-medium text-purple-400">Merge commit</span>
          <span className="text-purple-400/80 ml-1">
            &mdash; {mergeState.mergeAffectedFiles.length} file
            {mergeState.mergeAffectedFiles.length !== 1 ? 's' : ''} changed in merge
          </span>
        </div>
      </div>
    );
  }

  // In-progress merge/rebase/cherry-pick
  const operationLabel =
    mergeState.mergeOperationType === 'cherry-pick'
      ? 'Cherry-pick'
      : mergeState.mergeOperationType === 'rebase'
        ? 'Rebase'
        : 'Merge';

  return (
    <div className="mx-4 mt-3 flex items-start gap-2 p-3 rounded-md bg-purple-500/10 border border-purple-500/20">
      <GitMerge className="w-4 h-4 text-purple-500 mt-0.5 flex-shrink-0" />
      <div className="text-sm">
        <span className="font-medium text-purple-400">{operationLabel} in progress</span>
        {mergeState.conflictFiles.length > 0 ? (
          <span className="text-purple-400/80 ml-1">
            &mdash; {mergeState.conflictFiles.length} file
            {mergeState.conflictFiles.length !== 1 ? 's' : ''} with conflicts
          </span>
        ) : mergeState.isCleanMerge ? (
          <span className="text-purple-400/80 ml-1">
            &mdash; Clean merge, {mergeState.mergeAffectedFiles.length} file
            {mergeState.mergeAffectedFiles.length !== 1 ? 's' : ''} affected
          </span>
        ) : null}
      </div>
    </div>
  );
}

function FileDiffSection({
  fileDiff,
  rawDiff,
  isExpanded,
  onToggle,
  fileStatus,
  enableStaging,
  onStage,
  onUnstage,
  isStagingFile,
}: {
  fileDiff: ParsedFileDiff;
  /** Raw unified diff string for this file, used by CodeMirror merge view */
  rawDiff?: string;
  isExpanded: boolean;
  onToggle: () => void;
  fileStatus?: FileStatus;
  enableStaging?: boolean;
  onStage?: (filePath: string) => void;
  onUnstage?: (filePath: string) => void;
  isStagingFile?: boolean;
}) {
  const additions = fileDiff.additions;
  const deletions = fileDiff.deletions;

  const stagingState = fileStatus ? getStagingState(fileStatus) : undefined;

  const isMergeFile = fileStatus?.isMergeAffected;

  return (
    <div
      className={cn(
        'border rounded-lg overflow-hidden',
        isMergeFile ? 'border-purple-500/40' : 'border-border'
      )}
    >
      <div
        className={cn(
          'w-full px-3 py-2 flex flex-col gap-1 text-left transition-colors sm:flex-row sm:items-center sm:gap-2',
          isMergeFile ? 'bg-purple-500/5 hover:bg-purple-500/10' : 'bg-card hover:bg-accent/50'
        )}
      >
        {/* File name row */}
        <button onClick={onToggle} className="flex items-center gap-2 flex-1 min-w-0 text-left">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          )}
          {isMergeFile ? (
            <GitMerge className="w-4 h-4 text-purple-500 flex-shrink-0" />
          ) : fileStatus ? (
            getFileIcon(fileStatus.status)
          ) : (
            <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          )}
          <TruncatedFilePath
            path={fileDiff.filePath}
            className="flex-1 text-sm font-mono text-foreground"
          />
        </button>
        {/* Indicators & staging row */}
        <div className="flex items-center gap-2 flex-shrink-0 pl-6 sm:pl-0">
          {fileStatus?.isMergeAffected && <MergeBadge mergeType={fileStatus.mergeType} />}
          {enableStaging && stagingState && <StagingBadge state={stagingState} />}
          {fileDiff.isNew && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">
              new
            </span>
          )}
          {fileDiff.isDeleted && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">
              deleted
            </span>
          )}
          {fileDiff.isRenamed && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">
              renamed
            </span>
          )}
          {additions > 0 && <span className="text-xs text-green-400">+{additions}</span>}
          {deletions > 0 && <span className="text-xs text-red-400">-{deletions}</span>}
          {enableStaging && onStage && onUnstage && (
            <div className="flex items-center gap-1 ml-1">
              {isStagingFile ? (
                <Spinner size="sm" />
              ) : stagingState === 'staged' || stagingState === 'partial' ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    onUnstage(fileDiff.filePath);
                  }}
                  title="Unstage file"
                >
                  <Minus className="w-3 h-3 mr-1" />
                  Unstage
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    onStage(fileDiff.filePath);
                  }}
                  title="Stage file"
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Stage
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
      {isExpanded && rawDiff && (
        <div className="bg-background border-t border-border">
          <CodeMirrorDiffView fileDiff={rawDiff} filePath={fileDiff.filePath} maxHeight="400px" />
        </div>
      )}
    </div>
  );
}

export function GitDiffPanel({
  projectPath,
  featureId,
  className,
  compact = true,
  useWorktrees = false,
  enableStaging = false,
  worktreePath,
}: GitDiffPanelProps) {
  const [isExpanded, setIsExpanded] = useState(!compact);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [stagingInProgress, setStagingInProgress] = useState<Set<string>>(new Set());

  // Use worktree diffs hook when worktrees are enabled and panel is expanded
  // Pass undefined for featureId when not using worktrees to disable the query
  const {
    data: worktreeDiffsData,
    isLoading: isLoadingWorktree,
    error: worktreeError,
    refetch: refetchWorktree,
  } = useWorktreeDiffs(
    useWorktrees && isExpanded ? projectPath : undefined,
    useWorktrees && isExpanded ? featureId : undefined
  );

  // Use git diffs hook when worktrees are disabled and panel is expanded
  const {
    data: gitDiffsData,
    isLoading: isLoadingGit,
    error: gitError,
    refetch: refetchGit,
  } = useGitDiffs(projectPath, !useWorktrees && isExpanded);

  // Select the appropriate data based on useWorktrees prop
  const diffsData = useWorktrees ? worktreeDiffsData : gitDiffsData;
  const isLoading = useWorktrees ? isLoadingWorktree : isLoadingGit;
  const queryError = useWorktrees ? worktreeError : gitError;

  // Extract files, diff content, and merge state from the data
  const files: FileStatus[] = diffsData?.files ?? [];
  const diffContent = diffsData?.diff ?? '';
  const mergeState: MergeStateInfo | undefined = diffsData?.mergeState;
  const error = queryError
    ? queryError instanceof Error
      ? queryError.message
      : 'Failed to load diffs'
    : null;

  // Refetch function
  const loadDiffs = useWorktrees ? refetchWorktree : refetchGit;

  // Build a map from file path to FileStatus for quick lookup
  const fileStatusMap = useMemo(() => {
    const map = new Map<string, FileStatus>();
    for (const file of files) {
      map.set(file.path, file);
    }
    return map;
  }, [files]);

  const parsedDiffs = useMemo(() => {
    const diffs = parseDiff(diffContent);
    // Sort: merge-affected files first, then preserve original order
    if (mergeState?.isMerging || mergeState?.isMergeCommit) {
      const mergeSet = new Set(mergeState.mergeAffectedFiles);
      diffs.sort((a, b) => {
        const aIsMerge =
          mergeSet.has(a.filePath) || (fileStatusMap.get(a.filePath)?.isMergeAffected ?? false);
        const bIsMerge =
          mergeSet.has(b.filePath) || (fileStatusMap.get(b.filePath)?.isMergeAffected ?? false);
        if (aIsMerge && !bIsMerge) return -1;
        if (!aIsMerge && bIsMerge) return 1;
        return 0;
      });
    }
    return diffs;
  }, [diffContent, mergeState, fileStatusMap]);

  // Build a map from file path to raw diff string for CodeMirror merge view
  const fileDiffMap = useMemo(() => {
    const map = new Map<string, string>();
    const perFileDiffs = splitDiffByFile(diffContent);
    for (const entry of perFileDiffs) {
      map.set(entry.filePath, entry.diff);
    }
    return map;
  }, [diffContent]);

  const toggleFile = (filePath: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      return next;
    });
  };

  const expandAllFiles = () => {
    setExpandedFiles(new Set(parsedDiffs.map((d) => d.filePath)));
  };

  const collapseAllFiles = () => {
    setExpandedFiles(new Set());
  };

  // Shared helper that encapsulates all staging/unstaging logic
  const executeStagingAction = useCallback(
    async (
      action: 'stage' | 'unstage',
      paths: string[],
      successMessage: string,
      failurePrefix: string,
      onStart: () => void,
      onFinally: () => void
    ) => {
      onStart();
      if (!worktreePath && !projectPath) {
        toast.error(failurePrefix, {
          description: 'No project or worktree path configured',
        });
        onFinally();
        return;
      }
      try {
        const api = getElectronAPI();
        let result: { success: boolean; error?: string } | undefined;

        if (useWorktrees && worktreePath) {
          if (!api.worktree?.stageFiles) {
            toast.error(failurePrefix, {
              description: 'Worktree stage API not available',
            });
            return;
          }
          result = await api.worktree.stageFiles(worktreePath, paths, action);
        } else if (!useWorktrees) {
          if (!api.git?.stageFiles) {
            toast.error(failurePrefix, { description: 'Git stage API not available' });
            return;
          }
          result = await api.git.stageFiles(projectPath, paths, action);
        }

        if (!result) {
          toast.error(failurePrefix, { description: 'Stage API not available' });
          return;
        }

        if (!result.success) {
          toast.error(failurePrefix, { description: result.error });
          return;
        }

        // Refetch diffs to reflect the new staging state
        await loadDiffs();
        toast.success(successMessage, paths.length === 1 ? { description: paths[0] } : undefined);
      } catch (err) {
        toast.error(failurePrefix, {
          description: err instanceof Error ? err.message : 'Unknown error',
        });
      } finally {
        onFinally();
      }
    },
    [worktreePath, projectPath, useWorktrees, loadDiffs]
  );

  // Stage/unstage a single file
  const handleStageFile = useCallback(
    async (filePath: string) => {
      if (enableStaging && useWorktrees && !worktreePath) {
        toast.error('Failed to stage file', {
          description: 'worktreePath required when useWorktrees is enabled',
        });
        return;
      }
      await executeStagingAction(
        'stage',
        [filePath],
        'File staged',
        'Failed to stage file',
        () => setStagingInProgress((prev) => new Set(prev).add(filePath)),
        () =>
          setStagingInProgress((prev) => {
            const next = new Set(prev);
            next.delete(filePath);
            return next;
          })
      );
    },
    [worktreePath, useWorktrees, enableStaging, executeStagingAction]
  );

  // Unstage a single file
  const handleUnstageFile = useCallback(
    async (filePath: string) => {
      if (enableStaging && useWorktrees && !worktreePath) {
        toast.error('Failed to unstage file', {
          description: 'worktreePath required when useWorktrees is enabled',
        });
        return;
      }
      await executeStagingAction(
        'unstage',
        [filePath],
        'File unstaged',
        'Failed to unstage file',
        () => setStagingInProgress((prev) => new Set(prev).add(filePath)),
        () =>
          setStagingInProgress((prev) => {
            const next = new Set(prev);
            next.delete(filePath);
            return next;
          })
      );
    },
    [worktreePath, useWorktrees, enableStaging, executeStagingAction]
  );

  const handleStageAll = useCallback(async () => {
    const allPaths = files.map((f) => f.path);
    if (allPaths.length === 0) return;
    if (enableStaging && useWorktrees && !worktreePath) {
      toast.error('Failed to stage all files', {
        description: 'worktreePath required when useWorktrees is enabled',
      });
      return;
    }
    await executeStagingAction(
      'stage',
      allPaths,
      'All files staged',
      'Failed to stage all files',
      () => setStagingInProgress(new Set(allPaths)),
      () => setStagingInProgress(new Set())
    );
  }, [worktreePath, projectPath, useWorktrees, enableStaging, files, executeStagingAction]);

  const handleUnstageAll = useCallback(async () => {
    const stagedFiles = files.filter((f) => {
      const state = getStagingState(f);
      return state === 'staged' || state === 'partial';
    });
    const allPaths = stagedFiles.map((f) => f.path);
    if (allPaths.length === 0) return;
    if (enableStaging && useWorktrees && !worktreePath) {
      toast.error('Failed to unstage all files', {
        description: 'worktreePath required when useWorktrees is enabled',
      });
      return;
    }
    await executeStagingAction(
      'unstage',
      allPaths,
      'All files unstaged',
      'Failed to unstage all files',
      () => setStagingInProgress(new Set(allPaths)),
      () => setStagingInProgress(new Set())
    );
  }, [worktreePath, projectPath, useWorktrees, enableStaging, files, executeStagingAction]);

  // Compute merge summary
  const mergeSummary = useMemo(() => {
    const mergeFiles = files.filter((f) => f.isMergeAffected);
    if (mergeFiles.length === 0) return null;
    return {
      total: mergeFiles.length,
      conflicted: mergeFiles.filter(
        (f) => f.mergeType === 'both-modified' || f.mergeType === 'both-added'
      ).length,
    };
  }, [files]);

  // Compute staging summary
  const stagingSummary = useMemo(() => {
    if (!enableStaging) return null;
    let staged = 0;
    let partial = 0;
    let unstaged = 0;
    for (const file of files) {
      const state = getStagingState(file);
      if (state === 'staged') staged++;
      else if (state === 'unstaged') unstaged++;
      else partial++;
    }
    return { staged, partial, unstaged, total: files.length };
  }, [enableStaging, files]);

  // Total stats (pre-computed by shared parseDiff)
  const totalAdditions = parsedDiffs.reduce((acc, file) => acc + file.additions, 0);
  const totalDeletions = parsedDiffs.reduce((acc, file) => acc + file.deletions, 0);

  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card backdrop-blur-sm overflow-hidden',
        className
      )}
      data-testid="git-diff-panel"
    >
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between bg-card hover:bg-accent/50 transition-colors text-left flex-shrink-0"
        data-testid="git-diff-panel-toggle"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
          <GitBranch className="w-4 h-4 text-brand-500" />
          <span className="font-medium text-sm text-foreground">Git Changes</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {!isExpanded && files.length > 0 && (
            <>
              <span className="text-muted-foreground">
                {files.length} {files.length === 1 ? 'file' : 'files'}
              </span>
              {totalAdditions > 0 && <span className="text-green-400">+{totalAdditions}</span>}
              {totalDeletions > 0 && <span className="text-red-400">-{totalDeletions}</span>}
            </>
          )}
        </div>
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="border-t border-border">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
              <Spinner size="md" />
              <span className="text-sm">Loading changes...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
              <AlertCircle className="w-5 h-5 text-amber-500" />
              <span className="text-sm">{error}</span>
              <Button variant="ghost" size="sm" onClick={() => void loadDiffs()} className="mt-2">
                <RefreshCw className="w-4 h-4 mr-2" />
                Retry
              </Button>
            </div>
          ) : files.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
              <span className="text-sm">No changes detected</span>
            </div>
          ) : (
            <div>
              {/* Merge state banner */}
              {(mergeState?.isMerging || mergeState?.isMergeCommit) && (
                <MergeStateBanner mergeState={mergeState} />
              )}

              {/* Summary bar */}
              <div className="p-4 pb-2 border-b border-border-glass">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-4 flex-wrap">
                    {(() => {
                      // Group files by status
                      const statusGroups = files.reduce(
                        (acc, file) => {
                          const status = file.status;
                          if (!acc[status]) {
                            acc[status] = {
                              count: 0,
                              statusText: getStatusDisplayName(status),
                              files: [],
                            };
                          }
                          acc[status].count += 1;
                          acc[status].files.push(file.path);
                          return acc;
                        },
                        {} as Record<string, { count: number; statusText: string; files: string[] }>
                      );

                      const groups = Object.entries(statusGroups).map(([status, group]) => (
                        <div
                          key={status}
                          className="flex items-center gap-1.5"
                          title={group.files.join('\n')}
                          data-testid={`git-status-group-${status.toLowerCase()}`}
                        >
                          {getFileIcon(status)}
                          <span
                            className={cn(
                              'text-xs px-1.5 py-0.5 rounded border font-medium',
                              getStatusBadgeColor(status)
                            )}
                          >
                            {group.count} {group.statusText}
                          </span>
                        </div>
                      ));

                      // Add merge group indicator if merge files exist
                      if (mergeSummary) {
                        groups.unshift(
                          <div
                            key="merge"
                            className="flex items-center gap-1.5"
                            data-testid="git-status-group-merge"
                          >
                            <GitMerge className="w-4 h-4 text-purple-500" />
                            <span className="text-xs px-1.5 py-0.5 rounded border font-medium bg-purple-500/20 text-purple-400 border-purple-500/30">
                              {mergeSummary.total} Merge
                            </span>
                          </div>
                        );
                      }

                      return groups;
                    })()}
                  </div>
                  <div className="flex items-center gap-1 flex-wrap">
                    {enableStaging && stagingSummary && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleStageAll}
                          className="text-xs h-7"
                          disabled={
                            stagingInProgress.size > 0 ||
                            (stagingSummary.unstaged === 0 && stagingSummary.partial === 0)
                          }
                        >
                          <Plus className="w-3 h-3 mr-1" />
                          Stage All
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleUnstageAll}
                          className="text-xs h-7"
                          disabled={
                            stagingInProgress.size > 0 ||
                            (stagingSummary.staged === 0 && stagingSummary.partial === 0)
                          }
                        >
                          <Minus className="w-3 h-3 mr-1" />
                          Unstage All
                        </Button>
                      </>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={expandAllFiles}
                      className="text-xs h-7"
                    >
                      Expand All
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={collapseAllFiles}
                      className="text-xs h-7"
                    >
                      Collapse All
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void loadDiffs()}
                      className="text-xs h-7"
                    >
                      <RefreshCw className="w-3 h-3 mr-1" />
                      Refresh
                    </Button>
                  </div>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-4 text-sm mt-2 flex-wrap">
                  <span className="text-muted-foreground">
                    {files.length} {files.length === 1 ? 'file' : 'files'} changed
                  </span>
                  {totalAdditions > 0 && (
                    <span className="text-green-400">+{totalAdditions} additions</span>
                  )}
                  {totalDeletions > 0 && (
                    <span className="text-red-400">-{totalDeletions} deletions</span>
                  )}
                  {enableStaging && stagingSummary && (
                    <span className="text-muted-foreground">
                      {stagingSummary.partial > 0
                        ? `(${stagingSummary.staged} staged, ${stagingSummary.partial} partial, ${stagingSummary.unstaged} unstaged)`
                        : `(${stagingSummary.staged} staged, ${stagingSummary.unstaged} unstaged)`}
                    </span>
                  )}
                </div>
              </div>

              {/* File diffs */}
              <div className="p-4 space-y-3">
                {parsedDiffs.map((fileDiff) => (
                  <FileDiffSection
                    key={fileDiff.filePath}
                    fileDiff={fileDiff}
                    rawDiff={fileDiffMap.get(fileDiff.filePath)}
                    isExpanded={expandedFiles.has(fileDiff.filePath)}
                    onToggle={() => toggleFile(fileDiff.filePath)}
                    fileStatus={fileStatusMap.get(fileDiff.filePath)}
                    enableStaging={enableStaging}
                    onStage={enableStaging ? handleStageFile : undefined}
                    onUnstage={enableStaging ? handleUnstageFile : undefined}
                    isStagingFile={stagingInProgress.has(fileDiff.filePath)}
                  />
                ))}
                {/* Fallback for files that have no diff content (shouldn't happen after fix, but safety net) */}
                {files.length > 0 && parsedDiffs.length === 0 && (
                  <div className="space-y-2">
                    {files.map((file) => {
                      const stagingState = getStagingState(file);
                      const isFileMerge = file.isMergeAffected;
                      return (
                        <div
                          key={file.path}
                          className={cn(
                            'border rounded-lg overflow-hidden',
                            isFileMerge ? 'border-purple-500/40' : 'border-border'
                          )}
                        >
                          <div
                            className={cn(
                              'w-full px-3 py-2 flex flex-col gap-1 text-left sm:flex-row sm:items-center sm:gap-2',
                              isFileMerge ? 'bg-purple-500/5 hover:bg-purple-500/10' : 'bg-card'
                            )}
                          >
                            {/* File name row */}
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              {isFileMerge ? (
                                <GitMerge className="w-4 h-4 text-purple-500 flex-shrink-0" />
                              ) : (
                                getFileIcon(file.status)
                              )}
                              <TruncatedFilePath
                                path={file.path}
                                className="flex-1 text-sm font-mono text-foreground"
                              />
                            </div>
                            {/* Indicators & staging row */}
                            <div className="flex items-center gap-2 flex-shrink-0 pl-6 sm:pl-0">
                              {isFileMerge && <MergeBadge mergeType={file.mergeType} />}
                              {enableStaging && <StagingBadge state={stagingState} />}
                              <span
                                className={cn(
                                  'text-xs px-1.5 py-0.5 rounded border font-medium',
                                  getStatusBadgeColor(file.status)
                                )}
                              >
                                {getStatusDisplayName(file.status)}
                              </span>
                              {enableStaging && (
                                <div className="flex items-center gap-1 ml-1">
                                  {stagingInProgress.has(file.path) ? (
                                    <Spinner size="sm" />
                                  ) : stagingState === 'staged' || stagingState === 'partial' ? (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 px-2 text-xs"
                                      onClick={() => void handleUnstageFile(file.path)}
                                      title="Unstage file"
                                    >
                                      <Minus className="w-3 h-3 mr-1" />
                                      Unstage
                                    </Button>
                                  ) : (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 px-2 text-xs"
                                      onClick={() => void handleStageFile(file.path)}
                                      title="Stage file"
                                    >
                                      <Plus className="w-3 h-3 mr-1" />
                                      Stage
                                    </Button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="px-4 py-3 text-sm text-muted-foreground bg-background border-t border-border">
                            {file.status === '?' ? (
                              <span>New file - content preview not available</span>
                            ) : file.status === 'D' ? (
                              <span>File deleted</span>
                            ) : (
                              <span>Diff content not available</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
