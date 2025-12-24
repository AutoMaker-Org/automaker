import { cn } from '@/lib/utils';
import type { BeadsIssue } from '@automaker/types';
import { TYPE_COLORS, PRIORITY_COLORS, PRIORITY_LABELS } from '../constants';

interface TypeBadgeProps {
  type: BeadsIssue['type'];
  className?: string;
}

/**
 * Renders a compact badge that displays the issue type with its associated colors.
 *
 * @param type - The issue type text to display; color styling is derived from TYPE_COLORS with a fallback to the `task` color.
 * @param className - Optional additional CSS classes to apply to the badge container.
 * @returns A span element styled as a small badge showing the provided `type`.
 */
export function TypeBadge({ type, className }: TypeBadgeProps) {
  const colors = TYPE_COLORS[type] || TYPE_COLORS.task;

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border',
        colors,
        className
      )}
    >
      {type}
    </span>
  );
}

interface PriorityIndicatorProps {
  priority: BeadsIssue['priority'];
  className?: string;
}

/**
 * Render a compact priority indicator with a colored dot and uppercase label.
 *
 * Displays a small colored dot and the priority label (uppercase). The displayed
 * color and label are derived from the provided `priority` using the module's
 * priority mappings. Additional CSS classes can be appended via `className`.
 *
 * @param priority - Issue priority key used to select the label and colors
 * @param className - Optional additional class names to apply to the container
 * @returns A JSX element showing the colored dot and priority label
 */
export function PriorityIndicator({ priority, className }: PriorityIndicatorProps) {
  const label = PRIORITY_LABELS[priority];
  const colors = PRIORITY_COLORS[priority];

  return (
    <div className={cn('inline-flex items-center gap-1', className)}>
      <div className={cn('w-2 h-2 rounded-full', colors)} title={`Priority: ${label}`} />
      <span className={cn('text-xs font-semibold uppercase', colors)}>{label}</span>
    </div>
  );
}

interface BlockingBadgeProps {
  count: number;
  className?: string;
}

/**
 * Render a compact "Blocks N" badge for an issue when it blocks other issues.
 *
 * Renders nothing when `count` is 0.
 *
 * @param count - Number of issues this issue blocks; when `0` the component returns `null`
 * @param className - Optional additional CSS class names to apply to the badge
 * @returns A `span` element displaying "Blocks {count}", or `null` if `count` is `0`
 */
export function BlockingBadge({ count, className }: BlockingBadgeProps) {
  if (count === 0) return null;

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium',
        'bg-orange-500/10 text-orange-700 dark:text-orange-400 border border-orange-500/20',
        className
      )}
      title={`This issue blocks ${count} other ${count === 1 ? 'issue' : 'issues'}`}
    >
      Blocks {count}
    </span>
  );
}

interface BlockedBadgeProps {
  count: number;
  className?: string;
}

/**
 * Render a compact "Blocked by N" badge when an issue is blocked by one or more other issues.
 *
 * The component returns `null` when `count` is zero.
 *
 * @param count - Number of issues blocking this issue; determines the displayed count and whether the badge is rendered
 * @param className - Additional CSS classes to apply to the badge container
 * @returns A span element displaying "Blocked by {count}" when `count` > 0, `null` otherwise
 */
export function BlockedBadge({ count, className }: BlockedBadgeProps) {
  if (count === 0) return null;

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium',
        'bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/20',
        className
      )}
      title={`This issue is blocked by ${count} ${count === 1 ? 'issue' : 'issues'}`}
    >
      Blocked by {count}
    </span>
  );
}

interface LabelsListProps {
  labels: string[];
  className?: string;
}

/**
 * Render a wrapped list of label chips from an array of strings.
 *
 * @param labels - Array of label text to display; if empty or missing, nothing is rendered
 * @param className - Optional additional CSS class names applied to the container
 * @returns A container of styled label chips for each string in `labels`, or `null` when `labels` is empty
 */
export function LabelsList({ labels, className }: LabelsListProps) {
  if (!labels || labels.length === 0) return null;

  return (
    <div className={cn('flex flex-wrap gap-1', className)}>
      {labels.map((label) => (
        <span
          key={label}
          className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-gray-500/10 text-gray-700 dark:text-gray-400 border border-gray-500/20"
        >
          {label}
        </span>
      ))}
    </div>
  );
}