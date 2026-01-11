import { memo } from 'react';
import {
  ExternalLink,
  User,
  Loader2,
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
} from 'lucide-react';
import { LinearIssue, StoredLinearValidation } from '@/lib/electron';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { formatDate, getPriorityColor, isValidationStale } from '../utils';

interface LinearIssueRowProps {
  issue: LinearIssue;
  isSelected: boolean;
  isChecked: boolean;
  onClick: () => void;
  onCheckChange: (checked: boolean) => void;
  onOpenExternal: () => void;
  isValidating?: boolean;
  cachedValidation?: StoredLinearValidation | null;
}

export const LinearIssueRow = memo(function LinearIssueRow({
  issue,
  isSelected,
  isChecked,
  onClick,
  onCheckChange,
  onOpenExternal,
  isValidating = false,
  cachedValidation,
}: LinearIssueRowProps) {
  // Determine validation status for badge
  const renderValidationBadge = () => {
    if (isValidating) {
      return (
        <span title="Validating...">
          <Loader2 className="h-3.5 w-3.5 text-muted-foreground animate-spin shrink-0" />
        </span>
      );
    }

    if (!cachedValidation) {
      return null;
    }

    const isStale = isValidationStale(cachedValidation.validatedAt);
    const verdict = cachedValidation.result.verdict;

    if (isStale) {
      return (
        <span title="Validation is stale">
          <Clock className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
        </span>
      );
    }

    switch (verdict) {
      case 'valid':
        return (
          <span title="Valid">
            <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
          </span>
        );
      case 'invalid':
        return (
          <span title="Invalid">
            <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
          </span>
        );
      case 'needs_clarification':
        return (
          <span title="Needs clarification">
            <AlertCircle className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
          </span>
        );
      default:
        return null;
    }
  };
  return (
    <div
      className={cn(
        'group flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-muted/50',
        isSelected && 'bg-muted'
      )}
      onClick={onClick}
    >
      {/* Checkbox */}
      <Checkbox
        checked={isChecked}
        onCheckedChange={(checked) => {
          onCheckChange(checked === true);
        }}
        onClick={(e) => e.stopPropagation()}
        className="shrink-0"
      />

      {/* State indicator */}
      <div
        className="w-3 h-3 rounded-full shrink-0"
        style={{ backgroundColor: issue.state?.color || '#888' }}
        title={issue.state?.name || 'Unknown'}
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {/* Identifier */}
          <span className="text-xs text-muted-foreground font-mono shrink-0">
            {issue.identifier}
          </span>

          {/* Title */}
          <span className="text-sm truncate">{issue.title}</span>

          {/* Priority indicator */}
          {issue.priority > 0 && (
            <span
              className={cn('text-xs font-medium shrink-0', getPriorityColor(issue.priority))}
              title={issue.priorityLabel}
            >
              {issue.priority === 1 && '!!!'}
              {issue.priority === 2 && '!!'}
              {issue.priority === 3 && '!'}
            </span>
          )}

          {/* Validation badge */}
          {renderValidationBadge()}
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
          {/* Assignee */}
          {issue.assignee && (
            <div className="flex items-center gap-1">
              {issue.assignee.avatarUrl ? (
                <img
                  src={issue.assignee.avatarUrl}
                  alt={issue.assignee.displayName}
                  className="w-4 h-4 rounded-full"
                />
              ) : (
                <User className="w-3 h-3" />
              )}
              <span className="truncate max-w-[100px]">{issue.assignee.displayName}</span>
            </div>
          )}

          {/* Labels */}
          {issue.labels.slice(0, 2).map((label) => (
            <span
              key={label.id}
              className="px-1.5 py-0.5 rounded text-[10px] font-medium"
              style={{
                backgroundColor: `${label.color}20`,
                color: label.color,
              }}
            >
              {label.name}
            </span>
          ))}
          {issue.labels.length > 2 && (
            <span className="text-[10px]">+{issue.labels.length - 2}</span>
          )}

          {/* Date */}
          <span className="ml-auto">{formatDate(issue.updatedAt)}</span>
        </div>
      </div>

      {/* External link button */}
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7"
        onClick={(e) => {
          e.stopPropagation();
          onOpenExternal();
        }}
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
});
