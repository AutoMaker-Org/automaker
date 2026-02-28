import { memo, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { COLUMNS, isPipelineStatus } from '../../constants';
import type { FeatureStatusWithPipeline, PipelineConfig } from '@automaker/types';

/**
 * Status display configuration
 */
interface StatusDisplay {
  label: string;
  colorClass: string;
  bgClass: string;
  borderClass: string;
}

/**
 * Base status display configurations using CSS variables
 */
const BASE_STATUS_DISPLAY: Record<string, StatusDisplay> = {
  backlog: {
    label: 'Backlog',
    colorClass: 'text-[var(--status-backlog)]',
    bgClass: 'bg-[var(--status-backlog)]/15',
    borderClass: 'border-[var(--status-backlog)]/30',
  },
  merge_conflict: {
    label: 'Merge Conflict',
    colorClass: 'text-[var(--status-warning)]',
    bgClass: 'bg-[var(--status-warning)]/15',
    borderClass: 'border-[var(--status-warning)]/30',
  },
  in_progress: {
    label: 'In Progress',
    colorClass: 'text-[var(--status-in-progress)]',
    bgClass: 'bg-[var(--status-in-progress)]/15',
    borderClass: 'border-[var(--status-in-progress)]/30',
  },
  waiting_approval: {
    label: 'Waiting Approval',
    colorClass: 'text-[var(--status-waiting)]',
    bgClass: 'bg-[var(--status-waiting)]/15',
    borderClass: 'border-[var(--status-waiting)]/30',
  },
  verified: {
    label: 'Verified',
    colorClass: 'text-[var(--status-success)]',
    bgClass: 'bg-[var(--status-success)]/15',
    borderClass: 'border-[var(--status-success)]/30',
  },
};

/**
 * Get display configuration for a pipeline status
 */
function getPipelineStatusDisplay(
  status: string,
  pipelineConfig: PipelineConfig | null
): StatusDisplay | null {
  if (!isPipelineStatus(status) || !pipelineConfig?.steps) {
    return null;
  }

  const stepId = status.replace('pipeline_', '');
  const step = pipelineConfig.steps.find((s) => s.id === stepId);

  if (!step) {
    return null;
  }

  // Extract the color variable from the colorClass (e.g., "bg-[var(--status-in-progress)]")
  // and use it for the badge styling
  const colorVar = step.colorClass?.match(/var\(([^)]+)\)/)?.[1] || '--status-in-progress';

  return {
    label: step.name || 'Pipeline Step',
    colorClass: `text-[var(${colorVar})]`,
    bgClass: `bg-[var(${colorVar})]/15`,
    borderClass: `border-[var(${colorVar})]/30`,
  };
}

/**
 * Get the display configuration for a status
 */
function getStatusDisplay(
  status: FeatureStatusWithPipeline,
  pipelineConfig: PipelineConfig | null
): StatusDisplay {
  // Check for pipeline status first
  if (isPipelineStatus(status)) {
    const pipelineDisplay = getPipelineStatusDisplay(status, pipelineConfig);
    if (pipelineDisplay) {
      return pipelineDisplay;
    }
    // Fallback for unknown pipeline status
    return {
      label: status.replace('pipeline_', '').replace(/_/g, ' '),
      colorClass: 'text-[var(--status-in-progress)]',
      bgClass: 'bg-[var(--status-in-progress)]/15',
      borderClass: 'border-[var(--status-in-progress)]/30',
    };
  }

  // Check base status
  const baseDisplay = BASE_STATUS_DISPLAY[status];
  if (baseDisplay) {
    return baseDisplay;
  }

  // Try to find from COLUMNS constant
  const column = COLUMNS.find((c) => c.id === status);
  if (column) {
    return {
      label: column.title,
      colorClass: 'text-muted-foreground',
      bgClass: 'bg-muted/50',
      borderClass: 'border-border/50',
    };
  }

  // Fallback for unknown status
  return {
    label: status.replace(/_/g, ' '),
    colorClass: 'text-muted-foreground',
    bgClass: 'bg-muted/50',
    borderClass: 'border-border/50',
  };
}

export interface StatusBadgeProps {
  /** The status to display */
  status: FeatureStatusWithPipeline;
  /** Optional pipeline configuration for custom pipeline steps */
  pipelineConfig?: PipelineConfig | null;
  /** Size variant for the badge */
  size?: 'sm' | 'default' | 'lg';
  /** Additional className for custom styling */
  className?: string;
}

/**
 * StatusBadge displays a feature status as a colored chip/badge for use in the list view table.
 *
 * Features:
 * - Displays status with appropriate color based on status type
 * - Supports base statuses (backlog, in_progress, waiting_approval, verified)
 * - Supports pipeline statuses with custom colors from pipeline configuration
 * - Size variants (sm, default, lg)
 * - Uses CSS variables for consistent theming
 *
 * @example
 * ```tsx
 * // Basic usage
 * <StatusBadge status="backlog" />
 *
 * // With pipeline configuration
 * <StatusBadge status="pipeline_review" pipelineConfig={pipelineConfig} />
 *
 * // Small size
 * <StatusBadge status="verified" size="sm" />
 * ```
 */
export const StatusBadge = memo(function StatusBadge({
  status,
  pipelineConfig = null,
  size = 'default',
  className,
}: StatusBadgeProps) {
  const display = useMemo(() => getStatusDisplay(status, pipelineConfig), [status, pipelineConfig]);

  const sizeClasses = {
    sm: 'px-1.5 py-0.5 text-[10px]',
    default: 'px-2 py-0.5 text-xs',
    lg: 'px-2.5 py-1 text-sm',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border font-medium whitespace-nowrap',
        'transition-colors duration-200',
        sizeClasses[size],
        display.colorClass,
        display.bgClass,
        display.borderClass,
        className
      )}
      data-testid={`status-badge-${status}`}
    >
      {display.label}
    </span>
  );
});

/**
 * Helper function to get the status label without rendering the badge
 * Useful for sorting or filtering operations
 */
export function getStatusLabel(
  status: FeatureStatusWithPipeline,
  pipelineConfig: PipelineConfig | null = null
): string {
  return getStatusDisplay(status, pipelineConfig).label;
}

/**
 * Helper function to get the status order for sorting
 * Returns a numeric value representing the status position in the workflow
 */
export function getStatusOrder(status: FeatureStatusWithPipeline): number {
  const baseOrder: Record<string, number> = {
    backlog: 0,
    merge_conflict: 0,
    in_progress: 1,
    waiting_approval: 2,
    verified: 3,
  };

  if (isPipelineStatus(status)) {
    // Pipeline statuses come after in_progress but before waiting_approval
    return 1.5;
  }

  return baseOrder[status] ?? 0;
}
