import { CircleDot, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import type { IssuesStateFilter } from '../types';
import { IssuesFilterControls } from './issues-filter-controls';

interface IssuesListHeaderProps {
  openCount: number;
  closedCount: number;
  /** Total open issues count (unfiltered) - used to show "X of Y" when filtered */
  totalOpenCount?: number;
  /** Total closed issues count (unfiltered) - used to show "X of Y" when filtered */
  totalClosedCount?: number;
  /** Whether any filter is currently active */
  hasActiveFilter?: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  /** Whether the list is in compact mode (e.g., when detail panel is open) */
  compact?: boolean;
  /** Optional filter state and handlers - when provided, filter controls are rendered */
  filterProps?: {
    stateFilter: IssuesStateFilter;
    selectedLabels: string[];
    availableLabels: string[];
    onStateFilterChange: (filter: IssuesStateFilter) => void;
    onLabelsChange: (labels: string[]) => void;
  };
}

export function IssuesListHeader({
  openCount,
  closedCount,
  totalOpenCount,
  totalClosedCount,
  hasActiveFilter = false,
  refreshing,
  onRefresh,
  compact = false,
  filterProps,
}: IssuesListHeaderProps) {
  const totalIssues = openCount + closedCount;

  // Format the counts subtitle based on filter state
  const getCountsSubtitle = () => {
    if (totalIssues === 0) {
      return hasActiveFilter ? 'No matching issues' : 'No issues found';
    }

    // When filters are active and we have total counts, show "X of Y" format
    if (hasActiveFilter && totalOpenCount !== undefined && totalClosedCount !== undefined) {
      const openText =
        openCount === totalOpenCount
          ? `${openCount} open`
          : `${openCount} of ${totalOpenCount} open`;
      const closedText =
        closedCount === totalClosedCount
          ? `${closedCount} closed`
          : `${closedCount} of ${totalClosedCount} closed`;
      return `${openText}, ${closedText}`;
    }

    // Default format when no filters active
    return `${openCount} open, ${closedCount} closed`;
  };

  return (
    <div className="border-b border-border">
      {/* Top row: Title and refresh button */}
      <div className="flex items-center justify-between p-4 pb-2">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-green-500/10">
            <CircleDot className="h-5 w-5 text-green-500" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Issues</h1>
            <p className="text-xs text-muted-foreground">{getCountsSubtitle()}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? <Spinner size="sm" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </div>

      {/* Filter controls row (optional) */}
      {filterProps && (
        <div className="px-4 pb-3 pt-1">
          <IssuesFilterControls
            stateFilter={filterProps.stateFilter}
            selectedLabels={filterProps.selectedLabels}
            availableLabels={filterProps.availableLabels}
            onStateFilterChange={filterProps.onStateFilterChange}
            onLabelsChange={filterProps.onLabelsChange}
            disabled={refreshing}
            compact={compact}
          />
        </div>
      )}
    </div>
  );
}
