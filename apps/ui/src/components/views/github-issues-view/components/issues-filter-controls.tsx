import { ChevronDown, Tag, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { IssuesStateFilter } from '../types';
import { ISSUES_STATE_FILTER_OPTIONS } from '../types';

/** Maximum number of labels to display before showing "+N more" in normal layout */
const VISIBLE_LABELS_LIMIT = 3;
/** Maximum number of labels to display before showing "+N more" in compact layout */
const VISIBLE_LABELS_LIMIT_COMPACT = 2;

interface IssuesFilterControlsProps {
  /** Current state filter value */
  stateFilter: IssuesStateFilter;
  /** Currently selected labels */
  selectedLabels: string[];
  /** Available labels to choose from (typically from useIssuesFilter result) */
  availableLabels: string[];
  /** Callback when state filter changes */
  onStateFilterChange: (filter: IssuesStateFilter) => void;
  /** Callback when labels selection changes */
  onLabelsChange: (labels: string[]) => void;
  /** Whether the controls are disabled (e.g., during loading) */
  disabled?: boolean;
  /** Whether to use compact layout (stacked vertically) */
  compact?: boolean;
  /** Additional class name for the container */
  className?: string;
}

/** Human-readable labels for state filter options */
const STATE_FILTER_LABELS: Record<IssuesStateFilter, string> = {
  open: 'Open',
  closed: 'Closed',
  all: 'All',
};

export function IssuesFilterControls({
  stateFilter,
  selectedLabels,
  availableLabels,
  onStateFilterChange,
  onLabelsChange,
  disabled = false,
  compact = false,
  className,
}: IssuesFilterControlsProps) {
  /**
   * Handles toggling a label in the selection.
   * If the label is already selected, it removes it; otherwise, it adds it.
   */
  const handleLabelToggle = (label: string) => {
    const isSelected = selectedLabels.includes(label);
    if (isSelected) {
      onLabelsChange(selectedLabels.filter((l) => l !== label));
    } else {
      onLabelsChange([...selectedLabels, label]);
    }
  };

  /**
   * Clears all selected labels.
   */
  const handleClearLabels = () => {
    onLabelsChange([]);
  };

  const hasSelectedLabels = selectedLabels.length > 0;
  const hasAvailableLabels = availableLabels.length > 0;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/* Filter Controls Row */}
      <div className="flex items-center gap-2">
        {/* State Filter Select */}
        <Select
          value={stateFilter}
          onValueChange={(value) => onStateFilterChange(value as IssuesStateFilter)}
          disabled={disabled}
        >
          <SelectTrigger className={cn('h-8 text-sm', compact ? 'w-[90px]' : 'w-[110px]')}>
            <SelectValue placeholder="State" />
          </SelectTrigger>
          <SelectContent>
            {ISSUES_STATE_FILTER_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {STATE_FILTER_LABELS[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Labels Filter Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild disabled={disabled || !hasAvailableLabels}>
            <Button
              variant="outline"
              size="sm"
              className={cn('h-8 gap-1.5', hasSelectedLabels && 'border-primary/50 bg-primary/5')}
              disabled={disabled || !hasAvailableLabels}
            >
              <Tag className="h-3.5 w-3.5" />
              <span>Labels</span>
              {hasSelectedLabels && (
                <Badge variant="secondary" size="sm" className="ml-1 px-1.5 py-0">
                  {selectedLabels.length}
                </Badge>
              )}
              <ChevronDown className="h-3.5 w-3.5 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56 max-h-64 overflow-y-auto">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>Filter by label</span>
              {hasSelectedLabels && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1.5 text-xs text-muted-foreground hover:text-foreground"
                  onClick={handleClearLabels}
                >
                  <X className="h-3 w-3 mr-0.5" />
                  Clear
                </Button>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {availableLabels.map((label) => (
              <DropdownMenuCheckboxItem
                key={label}
                checked={selectedLabels.includes(label)}
                onCheckedChange={() => handleLabelToggle(label)}
                onSelect={(e) => e.preventDefault()} // Prevent dropdown from closing
              >
                {label}
              </DropdownMenuCheckboxItem>
            ))}
            {!hasAvailableLabels && (
              <div className="px-2 py-1.5 text-sm text-muted-foreground">No labels available</div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Selected Labels Display - shown on separate row */}
      {hasSelectedLabels && (
        <div className="flex items-center gap-1 flex-wrap">
          {selectedLabels
            .slice(0, compact ? VISIBLE_LABELS_LIMIT_COMPACT : VISIBLE_LABELS_LIMIT)
            .map((label) => (
              <Badge
                key={label}
                variant="outline"
                size="sm"
                className="gap-1 cursor-pointer hover:bg-destructive/10 hover:border-destructive/50"
                onClick={() => handleLabelToggle(label)}
              >
                {label}
                <X className="h-2.5 w-2.5" />
              </Badge>
            ))}
          {selectedLabels.length >
            (compact ? VISIBLE_LABELS_LIMIT_COMPACT : VISIBLE_LABELS_LIMIT) && (
            <Badge variant="muted" size="sm">
              +
              {selectedLabels.length -
                (compact ? VISIBLE_LABELS_LIMIT_COMPACT : VISIBLE_LABELS_LIMIT)}{' '}
              more
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
