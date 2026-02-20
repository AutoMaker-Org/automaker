import { useState } from 'react';
import {
  GitBranch,
  GitCommit,
  User,
  Clock,
  Plus,
  Minus,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  FileEdit,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GitFileDetailsInfo } from '../use-file-editor-store';

interface GitDetailPanelProps {
  details: GitFileDetailsInfo;
  filePath: string;
  onOpenFile?: (path: string) => void;
}

export function GitDetailPanel({ details, filePath, onOpenFile }: GitDetailPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Don't show anything if there's no meaningful data
  if (!details.branch && !details.lastCommitHash && !details.statusLabel) {
    return null;
  }

  const hasChanges = details.linesAdded > 0 || details.linesRemoved > 0;
  const commitHashShort = details.lastCommitHash ? details.lastCommitHash.substring(0, 7) : '';
  const timeAgo = details.lastCommitTimestamp ? formatTimeAgo(details.lastCommitTimestamp) : '';

  return (
    <div className="border-t border-border bg-muted/20">
      {/* Collapsed summary bar */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-1 text-xs text-muted-foreground hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-3">
          {/* Branch */}
          {details.branch && (
            <span className="flex items-center gap-1">
              <GitBranch className="w-3 h-3" />
              <span className="text-primary font-medium">{details.branch}</span>
            </span>
          )}

          {/* Status label with visual treatment */}
          {details.statusLabel && (
            <span
              className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium uppercase', {
                'bg-yellow-500/15 text-yellow-600': details.statusLabel === 'Modified',
                'bg-green-500/15 text-green-600':
                  details.statusLabel === 'Added' || details.statusLabel === 'Staged',
                'bg-red-500/15 text-red-600': details.statusLabel === 'Deleted',
                'bg-purple-500/15 text-purple-600': details.statusLabel === 'Renamed',
                'bg-gray-500/15 text-gray-500': details.statusLabel === 'Untracked',
                'bg-orange-500/15 text-orange-600':
                  details.statusLabel === 'Conflicted' || details.isConflicted,
                'bg-blue-500/15 text-blue-600': details.statusLabel === 'Staged + Modified',
              })}
            >
              {details.isConflicted && <AlertTriangle className="w-3 h-3 inline mr-0.5" />}
              {details.statusLabel}
            </span>
          )}

          {/* Staged/unstaged two-tone badge */}
          {details.isStaged && details.isUnstaged && (
            <span className="flex items-center gap-0">
              <span className="w-2 h-2 rounded-l bg-green-500" title="Staged changes" />
              <span className="w-2 h-2 rounded-r bg-yellow-500" title="Unstaged changes" />
            </span>
          )}
          {details.isStaged && !details.isUnstaged && (
            <span className="w-2 h-2 rounded bg-green-500" title="Staged" />
          )}
          {!details.isStaged && details.isUnstaged && (
            <span className="w-2 h-2 rounded bg-yellow-500" title="Unstaged" />
          )}

          {/* Diff stats */}
          {hasChanges && (
            <span className="flex items-center gap-1.5">
              <span className="flex items-center gap-0.5 text-green-600">
                <Plus className="w-3 h-3" />
                {details.linesAdded}
              </span>
              <span className="flex items-center gap-0.5 text-red-500">
                <Minus className="w-3 h-3" />
                {details.linesRemoved}
              </span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {commitHashShort && (
            <span className="flex items-center gap-1 text-muted-foreground/70">
              <GitCommit className="w-3 h-3" />
              {commitHashShort}
            </span>
          )}
          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </div>
      </button>

      {/* Expanded details */}
      {isExpanded && (
        <div className="px-3 py-2 border-t border-border/50 space-y-1.5 text-xs text-muted-foreground">
          {/* Last commit info */}
          {details.lastCommitHash && (
            <>
              <div className="flex items-start gap-2">
                <GitCommit className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div className="font-mono text-foreground/80">{commitHashShort}</div>
                  {details.lastCommitMessage && (
                    <div className="text-muted-foreground truncate">
                      {details.lastCommitMessage}
                    </div>
                  )}
                </div>
              </div>

              {details.lastCommitAuthor && (
                <div className="flex items-center gap-2">
                  <User className="w-3.5 h-3.5 shrink-0" />
                  <span>{details.lastCommitAuthor}</span>
                </div>
              )}

              {timeAgo && (
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  <span>{timeAgo}</span>
                </div>
              )}
            </>
          )}

          {/* Conflict warning with action */}
          {details.isConflicted && (
            <div className="flex items-center gap-2 p-2 rounded bg-orange-500/10 border border-orange-500/20 text-orange-600">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span className="flex-1 font-medium">This file has merge conflicts</span>
              {onOpenFile && (
                <button
                  onClick={() => onOpenFile(filePath)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-orange-500/20 hover:bg-orange-500/30 text-orange-700 text-[10px] font-medium transition-colors"
                >
                  <FileEdit className="w-3 h-3" />
                  Resolve
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Format an ISO timestamp as a human-readable relative time */
function formatTimeAgo(isoTimestamp: string): string {
  try {
    const date = new Date(isoTimestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return 'just now';
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 30) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

    return date.toLocaleDateString();
  } catch {
    return '';
  }
}
