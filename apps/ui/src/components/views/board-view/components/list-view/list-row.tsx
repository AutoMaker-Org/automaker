// TODO: Remove @ts-nocheck after fixing BaseFeature's index signature issue
// The `[key: string]: unknown` in BaseFeature causes property access type errors
// @ts-nocheck
import { memo, useCallback, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertCircle, Lock, Hand, Sparkles, FileText } from 'lucide-react';
import type { Feature } from '@/store/app-store';
import { RowActions, type RowActionHandlers } from './row-actions';
import { getColumnWidth, getColumnAlign } from './list-header';

export interface ListRowProps {
  /** The feature to display */
  feature: Feature;
  /** Action handlers for the row */
  handlers: RowActionHandlers;
  /** Whether this feature is the current auto task (agent is running) */
  isCurrentAutoTask?: boolean;
  /** Whether the row is selected */
  isSelected?: boolean;
  /** Whether to show the checkbox for selection */
  showCheckbox?: boolean;
  /** Callback when the row selection is toggled */
  onToggleSelect?: () => void;
  /** Callback when the row is clicked */
  onClick?: () => void;
  /** Blocking dependency feature IDs */
  blockingDependencies?: string[];
  /** Additional className for custom styling */
  className?: string;
}

/**
 * IndicatorBadges shows small indicator icons for special states (error, blocked, manual verification, just finished)
 */
const IndicatorBadges = memo(function IndicatorBadges({
  feature,
  blockingDependencies = [],
  isCurrentAutoTask,
}: {
  feature: Feature;
  blockingDependencies?: string[];
  isCurrentAutoTask?: boolean;
}) {
  const hasError = feature.error && !isCurrentAutoTask;
  const isBlocked =
    blockingDependencies.length > 0 && !feature.error && feature.status === 'backlog';
  const showManualVerification =
    feature.skipTests && !feature.error && feature.status === 'backlog';
  const hasPlan = feature.planSpec?.content;

  // Check if just finished (within 2 minutes) - uses timer to auto-expire
  const [isJustFinished, setIsJustFinished] = useState(false);

  useEffect(() => {
    if (!feature.justFinishedAt || feature.status !== 'waiting_approval' || feature.error) {
      setIsJustFinished(false);
      return;
    }

    const finishedTime = new Date(feature.justFinishedAt).getTime();
    const twoMinutes = 2 * 60 * 1000;
    const elapsed = Date.now() - finishedTime;

    if (elapsed >= twoMinutes) {
      setIsJustFinished(false);
      return;
    }

    // Set as just finished
    setIsJustFinished(true);

    // Set a timeout to clear the "just finished" state when 2 minutes have passed
    const remainingTime = twoMinutes - elapsed;
    const timeoutId = setTimeout(() => {
      setIsJustFinished(false);
    }, remainingTime);

    return () => clearTimeout(timeoutId);
  }, [feature.justFinishedAt, feature.status, feature.error]);

  const badges: Array<{
    key: string;
    icon: typeof AlertCircle;
    tooltip: string;
    colorClass: string;
    bgClass: string;
    borderClass: string;
    animate?: boolean;
  }> = [];

  if (hasError) {
    badges.push({
      key: 'error',
      icon: AlertCircle,
      tooltip: feature.error || 'Error',
      colorClass: 'text-[var(--status-error)]',
      bgClass: 'bg-[var(--status-error)]/15',
      borderClass: 'border-[var(--status-error)]/30',
    });
  }

  if (isBlocked) {
    badges.push({
      key: 'blocked',
      icon: Lock,
      tooltip: `Blocked by ${blockingDependencies.length} incomplete ${blockingDependencies.length === 1 ? 'dependency' : 'dependencies'}`,
      colorClass: 'text-orange-500',
      bgClass: 'bg-orange-500/15',
      borderClass: 'border-orange-500/30',
    });
  }

  if (showManualVerification) {
    badges.push({
      key: 'manual',
      icon: Hand,
      tooltip: 'Manual verification required',
      colorClass: 'text-[var(--status-warning)]',
      bgClass: 'bg-[var(--status-warning)]/15',
      borderClass: 'border-[var(--status-warning)]/30',
    });
  }

  if (hasPlan) {
    badges.push({
      key: 'plan',
      icon: FileText,
      tooltip: 'Has implementation plan',
      colorClass: 'text-[var(--status-info)]',
      bgClass: 'bg-[var(--status-info)]/15',
      borderClass: 'border-[var(--status-info)]/30',
    });
  }

  if (isJustFinished) {
    badges.push({
      key: 'just-finished',
      icon: Sparkles,
      tooltip: 'Agent just finished working on this feature',
      colorClass: 'text-[var(--status-success)]',
      bgClass: 'bg-[var(--status-success)]/15',
      borderClass: 'border-[var(--status-success)]/30',
      animate: true,
    });
  }

  if (badges.length === 0) return null;

  return (
    <div className="flex items-center gap-1 ml-2">
      <TooltipProvider delayDuration={200}>
        {badges.map((badge) => (
          <Tooltip key={badge.key}>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  'inline-flex items-center justify-center w-5 h-5 rounded border',
                  badge.colorClass,
                  badge.bgClass,
                  badge.borderClass,
                  badge.animate && 'animate-pulse'
                )}
                data-testid={`list-row-badge-${badge.key}`}
              >
                <badge.icon className="w-3 h-3" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs max-w-[250px]">
              <p>{badge.tooltip}</p>
            </TooltipContent>
          </Tooltip>
        ))}
      </TooltipProvider>
    </div>
  );
});

/**
 * ListRow displays a single feature row in the list view table.
 *
 * Features:
 * - Displays feature data in columns matching ListHeader
 * - Hover state with highlight and action buttons
 * - Click handler for opening feature details
 * - Animated border for currently running auto task
 * - Status badge with appropriate colors
 * - Priority indicator
 * - Indicator badges for errors, blocked state, manual verification, etc.
 * - Selection checkbox for bulk operations
 *
 * @example
 * ```tsx
 * <ListRow
 *   feature={feature}
 *   handlers={{
 *     onEdit: () => handleEdit(feature.id),
 *     onDelete: () => handleDelete(feature.id),
 *     // ... other handlers
 *   }}
 *   onClick={() => handleViewDetails(feature)}
 * />
 * ```
 */
export const ListRow = memo(function ListRow({
  feature,
  handlers,
  isCurrentAutoTask = false,
  isSelected = false,
  showCheckbox = false,
  onToggleSelect,
  onClick,
  blockingDependencies = [],
  className,
}: ListRowProps) {
  const handleRowClick = useCallback(
    (e: React.MouseEvent) => {
      // Don't trigger row click if clicking on checkbox or actions
      if ((e.target as HTMLElement).closest('[data-testid^="row-actions"]')) {
        return;
      }
      if ((e.target as HTMLElement).closest('input[type="checkbox"]')) {
        return;
      }
      onClick?.();
    },
    [onClick]
  );

  const handleCheckboxChange = useCallback(() => {
    onToggleSelect?.();
  }, [onToggleSelect]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick?.();
      }
    },
    [onClick]
  );

  const hasError = feature.error && !isCurrentAutoTask;

  const rowContent = (
    <div
      role="row"
      tabIndex={onClick ? 0 : undefined}
      onClick={handleRowClick}
      onKeyDown={onClick ? handleKeyDown : undefined}
      className={cn(
        'group flex items-center w-full border-b border-border/50',
        'transition-colors duration-200',
        onClick && 'cursor-pointer',
        'hover:bg-accent/50',
        isSelected && 'bg-accent/70',
        hasError && 'bg-[var(--status-error)]/5 hover:bg-[var(--status-error)]/10',
        className
      )}
      data-testid={`list-row-${feature.id}`}
    >
      {/* Checkbox column */}
      {showCheckbox && (
        <div role="cell" className="flex items-center justify-center w-10 px-2 py-3 shrink-0">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={handleCheckboxChange}
            className={cn(
              'h-4 w-4 rounded border-border text-primary cursor-pointer',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1'
            )}
            aria-label={`Select ${feature.title || feature.description}`}
            data-testid={`list-row-checkbox-${feature.id}`}
          />
        </div>
      )}

      {/* Title column - full width with margin for actions */}
      <div
        role="cell"
        className={cn(
          'flex items-center pl-3 pr-0 py-3 gap-0',
          getColumnWidth('title'),
          getColumnAlign('title')
        )}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center">
            <span
              className={cn(
                'font-medium truncate',
                feature.titleGenerating && 'animate-pulse text-muted-foreground'
              )}
              title={feature.title || feature.description}
            >
              {feature.title || feature.description}
            </span>
            <IndicatorBadges
              feature={feature}
              blockingDependencies={blockingDependencies}
              isCurrentAutoTask={isCurrentAutoTask}
            />
          </div>
          {/* Show description as subtitle if title exists and is different */}
          {feature.title && feature.title !== feature.description && (
            <p
              className="text-xs text-muted-foreground truncate mt-0.5"
              title={feature.description}
            >
              {feature.description}
            </p>
          )}
        </div>
      </div>

      {/* Priority column */}
      <div
        role="cell"
        className={cn(
          'flex items-center pl-0 pr-3 py-3 shrink-0',
          getColumnWidth('priority'),
          getColumnAlign('priority')
        )}
        data-testid={`list-row-priority-${feature.id}`}
      >
        {feature.priority ? (
          <span
            className={cn(
              'inline-flex items-center justify-center w-6 h-6 rounded-md border-[1.5px] font-bold text-xs',
              feature.priority === 1 &&
                'bg-[var(--status-error-bg)] border-[var(--status-error)]/40 text-[var(--status-error)]',
              feature.priority === 2 &&
                'bg-[var(--status-warning-bg)] border-[var(--status-warning)]/40 text-[var(--status-warning)]',
              feature.priority === 3 &&
                'bg-[var(--status-info-bg)] border-[var(--status-info)]/40 text-[var(--status-info)]'
            )}
            title={
              feature.priority === 1
                ? 'High Priority'
                : feature.priority === 2
                  ? 'Medium Priority'
                  : 'Low Priority'
            }
          >
            {feature.priority === 1 ? 'H' : feature.priority === 2 ? 'M' : 'L'}
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">-</span>
        )}
      </div>

      {/* Actions column */}
      <div role="cell" className="flex items-center justify-end px-3 py-3 w-[80px] shrink-0">
        <RowActions feature={feature} handlers={handlers} isCurrentAutoTask={isCurrentAutoTask} />
      </div>
    </div>
  );

  // Wrap with animated border for currently running auto task
  if (isCurrentAutoTask) {
    return <div className="animated-border-wrapper-row">{rowContent}</div>;
  }

  return rowContent;
});

/**
 * Helper function to get feature sort value for a column
 */
export function getFeatureSortValue(
  feature: Feature,
  column: 'title' | 'status' | 'category' | 'priority' | 'createdAt' | 'updatedAt'
): string | number | Date {
  switch (column) {
    case 'title':
      return (feature.title || feature.description).toLowerCase();
    case 'status':
      return feature.status;
    case 'category':
      return (feature.category || '').toLowerCase();
    case 'priority':
      return feature.priority || 999; // No priority sorts last
    case 'createdAt':
      return feature.createdAt ? new Date(feature.createdAt) : new Date(0);
    case 'updatedAt':
      return feature.updatedAt ? new Date(feature.updatedAt) : new Date(0);
    default:
      return '';
  }
}

/**
 * Helper function to sort features by a column
 */
export function sortFeatures(
  features: Feature[],
  column: 'title' | 'status' | 'category' | 'priority' | 'createdAt' | 'updatedAt',
  direction: 'asc' | 'desc'
): Feature[] {
  return [...features].sort((a, b) => {
    const aValue = getFeatureSortValue(a, column);
    const bValue = getFeatureSortValue(b, column);

    let comparison = 0;

    if (aValue instanceof Date && bValue instanceof Date) {
      comparison = aValue.getTime() - bValue.getTime();
    } else if (typeof aValue === 'number' && typeof bValue === 'number') {
      comparison = aValue - bValue;
    } else {
      comparison = String(aValue).localeCompare(String(bValue));
    }

    return direction === 'asc' ? comparison : -comparison;
  });
}
