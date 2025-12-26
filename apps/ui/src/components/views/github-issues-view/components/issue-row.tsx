import {
  Circle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  CheckCircle,
  Sparkles,
  GitPullRequest,
  User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { IssueRowProps } from '../types';
import { isValidationStale } from '../utils';

export function IssueRow({
  issue,
  isSelected,
  onClick,
  onOpenExternal,
  formatDate,
  cachedValidation,
  isValidating,
}: IssueRowProps) {
  // Check if validation exists and calculate staleness
  const validationHoursSince = cachedValidation
    ? (Date.now() - new Date(cachedValidation.validatedAt).getTime()) / (1000 * 60 * 60)
    : null;
  const isValidationStaleValue =
    validationHoursSince !== null && isValidationStale(cachedValidation!.validatedAt);

  // Check if validation is unviewed (exists, not stale, not viewed)
  const hasUnviewedValidation =
    cachedValidation && !cachedValidation.viewedAt && !isValidationStaleValue;

  // Check if validation has been viewed (exists and was viewed)
  const hasViewedValidation =
    cachedValidation && cachedValidation.viewedAt && !isValidationStaleValue;

  return (
    <div
      className={cn(
        'group flex items-start gap-3 p-3 cursor-pointer hover:bg-accent/50 transition-colors',
        isSelected && 'bg-accent'
      )}
      onClick={onClick}
    >
      {issue.state === 'OPEN' ? (
        <Circle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
      ) : (
        <CheckCircle2 className="h-4 w-4 text-purple-500 mt-0.5 flex-shrink-0" />
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{issue.title}</span>
        </div>

        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-xs text-muted-foreground">
            #{issue.number} opened {formatDate(issue.createdAt)} by {issue.author.login}
          </span>
        </div>

        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {/* Labels */}
          {issue.labels.map((label) => (
            <span
              key={label.name}
              className="px-1.5 py-0.5 text-[10px] font-medium rounded-full"
              style={{
                backgroundColor: `#${label.color}20`,
                color: `#${label.color}`,
                border: `1px solid #${label.color}40`,
              }}
            >
              {label.name}
            </span>
          ))}

          {/* Linked PR indicator */}
          {issue.linkedPRs && issue.linkedPRs.length > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-purple-500/10 text-purple-500 border border-purple-500/20">
              <GitPullRequest className="h-3 w-3" />
              {issue.linkedPRs.length} PR{issue.linkedPRs.length > 1 ? 's' : ''}
            </span>
          )}

          {/* Assignee indicator */}
          {issue.assignees && issue.assignees.length > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20">
              <User className="h-3 w-3" />
              {issue.assignees.map((a) => a.login).join(', ')}
            </span>
          )}

          {/* Validating indicator */}
          {isValidating && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-primary/10 text-primary border border-primary/20 animate-in fade-in duration-200">
              <Loader2 className="h-3 w-3 animate-spin" />
              Analyzing...
            </span>
          )}

          {/* Unviewed validation indicator */}
          {!isValidating && hasUnviewedValidation && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20 animate-in fade-in duration-200">
              <Sparkles className="h-3 w-3" />
              Analysis Ready
            </span>
          )}

          {/* Viewed validation indicator */}
          {!isValidating && hasViewedValidation && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-green-500/10 text-green-500 border border-green-500/20">
              <CheckCircle className="h-3 w-3" />
              Validated
            </span>
          )}
        </div>
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="flex-shrink-0 opacity-0 group-hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          onOpenExternal();
        }}
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
