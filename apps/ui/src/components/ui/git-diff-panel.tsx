import { useState, useMemo } from 'react';
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
  AlertCircle,
} from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Button } from './button';
import { useWorktreeDiffs, useGitDiffs } from '@/hooks/queries';
import type { FileStatus } from '@/types/electron';

interface GitDiffPanelProps {
  projectPath: string;
  featureId: string;
  className?: string;
  /** Whether to show the panel in a compact/minimized state initially */
  compact?: boolean;
  /** Whether worktrees are enabled - if false, shows diffs from main project */
  useWorktrees?: boolean;
}

interface ParsedDiffHunk {
  header: string;
  lines: {
    type: 'context' | 'addition' | 'deletion' | 'header';
    content: string;
    lineNumber?: { old?: number; new?: number };
  }[];
}

interface ParsedFileDiff {
  filePath: string;
  hunks: ParsedDiffHunk[];
  isNew?: boolean;
  isDeleted?: boolean;
  isRenamed?: boolean;
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
 * Parse unified diff format into structured data
 */
function parseDiff(diffText: string): ParsedFileDiff[] {
  if (!diffText) return [];

  const files: ParsedFileDiff[] = [];
  const lines = diffText.split('\n');
  let currentFile: ParsedFileDiff | null = null;
  let currentHunk: ParsedDiffHunk | null = null;
  let oldLineNum = 0;
  let newLineNum = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // New file diff
    if (line.startsWith('diff --git')) {
      if (currentFile) {
        if (currentHunk) {
          currentFile.hunks.push(currentHunk);
        }
        files.push(currentFile);
      }
      // Extract file path from diff header
      const match = line.match(/diff --git a\/(.*?) b\/(.*)/);
      currentFile = {
        filePath: match ? match[2] : 'unknown',
        hunks: [],
      };
      currentHunk = null;
      continue;
    }

    // New file indicator
    if (line.startsWith('new file mode')) {
      if (currentFile) currentFile.isNew = true;
      continue;
    }

    // Deleted file indicator
    if (line.startsWith('deleted file mode')) {
      if (currentFile) currentFile.isDeleted = true;
      continue;
    }

    // Renamed file indicator
    if (line.startsWith('rename from') || line.startsWith('rename to')) {
      if (currentFile) currentFile.isRenamed = true;
      continue;
    }

    // Skip index, ---/+++ lines
    if (line.startsWith('index ') || line.startsWith('--- ') || line.startsWith('+++ ')) {
      continue;
    }

    // Hunk header
    if (line.startsWith('@@')) {
      if (currentHunk && currentFile) {
        currentFile.hunks.push(currentHunk);
      }
      // Parse line numbers from @@ -old,count +new,count @@
      const hunkMatch = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      oldLineNum = hunkMatch ? parseInt(hunkMatch[1], 10) : 1;
      newLineNum = hunkMatch ? parseInt(hunkMatch[2], 10) : 1;
      currentHunk = {
        header: line,
        lines: [{ type: 'header', content: line }],
      };
      continue;
    }

    // Diff content lines
    if (currentHunk) {
      if (line.startsWith('+')) {
        currentHunk.lines.push({
          type: 'addition',
          content: line.substring(1),
          lineNumber: { new: newLineNum },
        });
        newLineNum++;
      } else if (line.startsWith('-')) {
        currentHunk.lines.push({
          type: 'deletion',
          content: line.substring(1),
          lineNumber: { old: oldLineNum },
        });
        oldLineNum++;
      } else if (line.startsWith(' ') || line === '') {
        currentHunk.lines.push({
          type: 'context',
          content: line.substring(1) || '',
          lineNumber: { old: oldLineNum, new: newLineNum },
        });
        oldLineNum++;
        newLineNum++;
      }
    }
  }

  // Don't forget the last file and hunk
  if (currentFile) {
    if (currentHunk) {
      currentFile.hunks.push(currentHunk);
    }
    files.push(currentFile);
  }

  return files;
}

function DiffLine({
  type,
  content,
  lineNumber,
}: {
  type: 'context' | 'addition' | 'deletion' | 'header';
  content: string;
  lineNumber?: { old?: number; new?: number };
}) {
  const bgClass = {
    context: 'bg-transparent',
    addition: 'bg-green-500/10',
    deletion: 'bg-red-500/10',
    header: 'bg-blue-500/10',
  };

  const textClass = {
    context: 'text-foreground-secondary',
    addition: 'text-green-400',
    deletion: 'text-red-400',
    header: 'text-blue-400',
  };

  const prefix = {
    context: ' ',
    addition: '+',
    deletion: '-',
    header: '',
  };

  if (type === 'header') {
    return (
      <div className={cn('px-2 py-1 font-mono text-xs', bgClass[type], textClass[type])}>
        {content}
      </div>
    );
  }

  return (
    <div className={cn('flex font-mono text-xs', bgClass[type])}>
      <span className="w-12 flex-shrink-0 text-right pr-2 text-muted-foreground select-none border-r border-border-glass">
        {lineNumber?.old ?? ''}
      </span>
      <span className="w-12 flex-shrink-0 text-right pr-2 text-muted-foreground select-none border-r border-border-glass">
        {lineNumber?.new ?? ''}
      </span>
      <span className={cn('w-4 flex-shrink-0 text-center select-none', textClass[type])}>
        {prefix[type]}
      </span>
      <span className={cn('flex-1 px-2 whitespace-pre-wrap break-all', textClass[type])}>
        {content || '\u00A0'}
      </span>
    </div>
  );
}

function FileDiffSection({
  fileDiff,
  isExpanded,
  onToggle,
}: {
  fileDiff: ParsedFileDiff;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const additions = fileDiff.hunks.reduce(
    (acc, hunk) => acc + hunk.lines.filter((l) => l.type === 'addition').length,
    0
  );
  const deletions = fileDiff.hunks.reduce(
    (acc, hunk) => acc + hunk.lines.filter((l) => l.type === 'deletion').length,
    0
  );

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full px-3 py-2 flex items-center gap-2 text-left bg-card hover:bg-accent/50 transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        )}
        <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <span className="flex-1 text-sm font-mono truncate text-foreground">
          {fileDiff.filePath}
        </span>
        <div className="flex items-center gap-2 flex-shrink-0">
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
        </div>
      </button>
      {isExpanded && (
        <div className="bg-background border-t border-border max-h-[400px] overflow-y-auto scrollbar-visible">
          {fileDiff.hunks.map((hunk, hunkIndex) => (
            <div key={hunkIndex} className="border-b border-border-glass last:border-b-0">
              {hunk.lines.map((line, lineIndex) => (
                <DiffLine
                  key={lineIndex}
                  type={line.type}
                  content={line.content}
                  lineNumber={line.lineNumber}
                />
              ))}
            </div>
          ))}
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
}: GitDiffPanelProps) {
  const [isExpanded, setIsExpanded] = useState(!compact);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

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

  // Extract files and diff content from the data
  const files: FileStatus[] = diffsData?.files ?? [];
  const diffContent = diffsData?.diff ?? '';
  const error = queryError
    ? queryError instanceof Error
      ? queryError.message
      : 'Failed to load diffs'
    : null;

  // Refetch function
  const loadDiffs = useWorktrees ? refetchWorktree : refetchGit;

  const parsedDiffs = useMemo(() => parseDiff(diffContent), [diffContent]);

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

  // Total stats
  const totalAdditions = parsedDiffs.reduce(
    (acc, file) =>
      acc +
      file.hunks.reduce(
        (hAcc, hunk) => hAcc + hunk.lines.filter((l) => l.type === 'addition').length,
        0
      ),
    0
  );
  const totalDeletions = parsedDiffs.reduce(
    (acc, file) =>
      acc +
      file.hunks.reduce(
        (hAcc, hunk) => hAcc + hunk.lines.filter((l) => l.type === 'deletion').length,
        0
      ),
    0
  );

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
              <Button variant="ghost" size="sm" onClick={loadDiffs} className="mt-2">
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
              {/* Summary bar */}
              <div className="p-4 pb-2 border-b border-border-glass">
                <div className="flex items-center justify-between">
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

                      return Object.entries(statusGroups).map(([status, group]) => (
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
                    })()}
                  </div>
                  <div className="flex items-center gap-2">
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
                    <Button variant="ghost" size="sm" onClick={loadDiffs} className="text-xs h-7">
                      <RefreshCw className="w-3 h-3 mr-1" />
                      Refresh
                    </Button>
                  </div>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-4 text-sm mt-2">
                  <span className="text-muted-foreground">
                    {files.length} {files.length === 1 ? 'file' : 'files'} changed
                  </span>
                  {totalAdditions > 0 && (
                    <span className="text-green-400">+{totalAdditions} additions</span>
                  )}
                  {totalDeletions > 0 && (
                    <span className="text-red-400">-{totalDeletions} deletions</span>
                  )}
                </div>
              </div>

              {/* File diffs */}
              <div className="p-4 space-y-3">
                {parsedDiffs.map((fileDiff) => (
                  <FileDiffSection
                    key={fileDiff.filePath}
                    fileDiff={fileDiff}
                    isExpanded={expandedFiles.has(fileDiff.filePath)}
                    onToggle={() => toggleFile(fileDiff.filePath)}
                  />
                ))}
                {/* Fallback for files that have no diff content (shouldn't happen after fix, but safety net) */}
                {files.length > 0 && parsedDiffs.length === 0 && (
                  <div className="space-y-2">
                    {files.map((file) => (
                      <div
                        key={file.path}
                        className="border border-border rounded-lg overflow-hidden"
                      >
                        <div className="w-full px-3 py-2 flex items-center gap-2 text-left bg-card">
                          {getFileIcon(file.status)}
                          <span className="flex-1 text-sm font-mono truncate text-foreground">
                            {file.path}
                          </span>
                          <span
                            className={cn(
                              'text-xs px-1.5 py-0.5 rounded border font-medium',
                              getStatusBadgeColor(file.status)
                            )}
                          >
                            {getStatusDisplayName(file.status)}
                          </span>
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
                    ))}
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
