// @ts-nocheck - content section prop typing with feature data extraction
import { memo } from 'react';
import { Feature } from '@/store/app-store';
import { GitBranch, GitPullRequest, ExternalLink, CalendarClock } from 'lucide-react';

interface CardContentSectionsProps {
  feature: Feature;
  useWorktrees: boolean;
}

/** Format next run time for display on card */
function formatNextRunTime(nextRun: string): string {
  const date = new Date(nextRun);
  const now = new Date();
  const diff = date.getTime() - now.getTime();

  if (diff < 0) return 'Due now';
  if (diff < 60 * 1000) return 'In < 1 min';
  if (diff < 60 * 60 * 1000) {
    const minutes = Math.round(diff / (60 * 1000));
    return `In ${minutes} min`;
  }
  if (diff < 24 * 60 * 60 * 1000) {
    const hours = Math.round(diff / (60 * 60 * 1000));
    return `In ${hours}h`;
  }
  if (diff < 7 * 24 * 60 * 60 * 1000) {
    const days = Math.round(diff / (24 * 60 * 60 * 1000));
    return `In ${days}d`;
  }

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export const CardContentSections = memo(function CardContentSections({
  feature,
  useWorktrees,
}: CardContentSectionsProps) {
  return (
    <>
      {/* Target Branch Display */}
      {useWorktrees && feature.branchName && (
        <div className="mb-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <GitBranch className="w-3 h-3 shrink-0" />
          <span className="font-mono truncate" title={feature.branchName}>
            {feature.branchName}
          </span>
        </div>
      )}

      {/* Next Run Time Display for scheduled features */}
      {feature.schedule?.enabled && feature.schedule?.nextRun && (
        <div
          className="mb-2 flex items-center gap-1.5 text-[11px] text-[var(--status-scheduled)]"
          title={`Next run: ${new Date(feature.schedule.nextRun).toLocaleString()}`}
        >
          <CalendarClock className="w-3 h-3 shrink-0" />
          <span>Next: {formatNextRunTime(feature.schedule.nextRun)}</span>
        </div>
      )}

      {/* PR URL Display */}
      {typeof feature.prUrl === 'string' &&
        /^https?:\/\//i.test(feature.prUrl) &&
        (() => {
          const prNumber = feature.prUrl.split('/').pop();
          return (
            <div className="mb-2">
              <a
                href={feature.prUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1.5 text-[11px] text-purple-500 hover:text-purple-400 transition-colors"
                title={feature.prUrl}
                data-testid={`pr-url-${feature.id}`}
              >
                <GitPullRequest className="w-3 h-3 shrink-0" />
                <span className="truncate max-w-[150px]">
                  {prNumber ? `Pull Request #${prNumber}` : 'Pull Request'}
                </span>
                <ExternalLink className="w-2.5 h-2.5 shrink-0" />
              </a>
            </div>
          );
        })()}
    </>
  );
});
