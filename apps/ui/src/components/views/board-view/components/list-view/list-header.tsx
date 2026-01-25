import { memo, useCallback } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SortColumn, SortConfig, SortDirection } from '../../hooks/use-list-view-state';

/**
 * Column definition for the list header
 */
interface ColumnDef {
  id: SortColumn;
  label: string;
  /** Whether this column is sortable */
  sortable?: boolean;
  /** Minimum width for the column */
  minWidth?: string;
  /** Width class for the column */
  width?: string;
  /** Alignment of the column content */
  align?: 'left' | 'center' | 'right';
  /** Additional className for the column */
  className?: string;
}

/**
 * Default column definitions for the list view
 */
export const LIST_COLUMNS: ColumnDef[] = [
  {
    id: 'title',
    label: 'Title',
    sortable: true,
    width: 'flex-1',
    minWidth: 'min-w-0',
    align: 'left',
  },
  {
    id: 'priority',
    label: 'Priority',
    sortable: true,
    width: 'w-20',
    minWidth: 'min-w-[60px]',
    align: 'center',
  },
];

export interface ListHeaderProps {
  /** Current sort configuration */
  sortConfig: SortConfig;
  /** Callback when a sortable column is clicked */
  onSortChange: (column: SortColumn) => void;
  /** Whether to show a checkbox column for selection */
  showCheckbox?: boolean;
  /** Whether all items are selected (for checkbox state) */
  allSelected?: boolean;
  /** Whether some but not all items are selected */
  someSelected?: boolean;
  /** Callback when the select all checkbox is clicked */
  onSelectAll?: () => void;
  /** Custom column definitions (defaults to LIST_COLUMNS) */
  columns?: ColumnDef[];
  /** Additional className for the header */
  className?: string;
}

/**
 * SortIcon displays the current sort state for a column
 */
function SortIcon({ column, sortConfig }: { column: SortColumn; sortConfig: SortConfig }) {
  if (sortConfig.column !== column) {
    // Not sorted by this column - show neutral indicator
    return (
      <ChevronsUpDown className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
    );
  }

  // Currently sorted by this column
  if (sortConfig.direction === 'asc') {
    return <ChevronUp className="w-3.5 h-3.5 text-foreground" />;
  }

  return <ChevronDown className="w-3.5 h-3.5 text-foreground" />;
}

/**
 * SortableColumnHeader renders a clickable header cell that triggers sorting
 */
const SortableColumnHeader = memo(function SortableColumnHeader({
  column,
  sortConfig,
  onSortChange,
}: {
  column: ColumnDef;
  sortConfig: SortConfig;
  onSortChange: (column: SortColumn) => void;
}) {
  const handleClick = useCallback(() => {
    onSortChange(column.id);
  }, [column.id, onSortChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSortChange(column.id);
      }
    },
    [column.id, onSortChange]
  );

  const isSorted = sortConfig.column === column.id;
  const sortDirection: SortDirection | undefined = isSorted ? sortConfig.direction : undefined;

  return (
    <div
      role="columnheader"
      aria-sort={isSorted ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        'group flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-muted-foreground',
        'cursor-pointer select-none transition-colors duration-200',
        'hover:text-foreground hover:bg-accent/50 rounded-md',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        column.width,
        column.minWidth,
        column.width !== 'flex-1' && 'shrink-0',
        column.align === 'center' && 'justify-center',
        column.align === 'right' && 'justify-end',
        isSorted && 'text-foreground',
        column.className
      )}
      data-testid={`list-header-${column.id}`}
    >
      <span>{column.label}</span>
      <SortIcon column={column.id} sortConfig={sortConfig} />
    </div>
  );
});

/**
 * StaticColumnHeader renders a non-sortable header cell
 */
const StaticColumnHeader = memo(function StaticColumnHeader({ column }: { column: ColumnDef }) {
  return (
    <div
      role="columnheader"
      className={cn(
        'flex items-center px-3 py-2 text-xs font-medium text-muted-foreground',
        column.width,
        column.minWidth,
        column.width !== 'flex-1' && 'shrink-0',
        column.align === 'center' && 'justify-center',
        column.align === 'right' && 'justify-end',
        column.className
      )}
      data-testid={`list-header-${column.id}`}
    >
      <span>{column.label}</span>
    </div>
  );
});

/**
 * ListHeader displays the header row for the list view table with sortable columns.
 *
 * Features:
 * - Clickable column headers for sorting
 * - Visual sort direction indicators (chevron up/down)
 * - Keyboard accessible (Tab + Enter/Space to sort)
 * - ARIA attributes for screen readers
 * - Optional checkbox column for bulk selection
 * - Customizable column definitions
 *
 * @example
 * ```tsx
 * const { sortConfig, setSortColumn } = useListViewState();
 *
 * <ListHeader
 *   sortConfig={sortConfig}
 *   onSortChange={setSortColumn}
 * />
 * ```
 *
 * @example
 * ```tsx
 * // With selection support
 * <ListHeader
 *   sortConfig={sortConfig}
 *   onSortChange={setSortColumn}
 *   showCheckbox
 *   allSelected={allSelected}
 *   someSelected={someSelected}
 *   onSelectAll={handleSelectAll}
 * />
 * ```
 */
export const ListHeader = memo(function ListHeader({
  sortConfig,
  onSortChange,
  showCheckbox = false,
  allSelected = false,
  someSelected = false,
  onSelectAll,
  columns = LIST_COLUMNS,
  className,
}: ListHeaderProps) {
  return (
    <div
      role="row"
      className={cn(
        'flex items-center w-full border-b border-border bg-muted/30',
        'sticky top-0 z-10 backdrop-blur-sm',
        className
      )}
      data-testid="list-header"
    >
      {/* Checkbox column for selection */}
      {showCheckbox && (
        <div
          role="columnheader"
          className="flex items-center justify-center w-10 px-2 py-2 shrink-0"
        >
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              if (el) {
                el.indeterminate = someSelected && !allSelected;
              }
            }}
            onChange={onSelectAll}
            className={cn(
              'h-4 w-4 rounded border-border text-primary cursor-pointer',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1'
            )}
            aria-label={allSelected ? 'Deselect all' : 'Select all'}
            data-testid="list-header-select-all"
          />
        </div>
      )}

      {/* Column headers */}
      {columns.map((column) =>
        column.sortable !== false ? (
          <SortableColumnHeader
            key={column.id}
            column={column}
            sortConfig={sortConfig}
            onSortChange={onSortChange}
          />
        ) : (
          <StaticColumnHeader key={column.id} column={column} />
        )
      )}

      {/* Actions column (placeholder for row action buttons) */}
      <div
        role="columnheader"
        className="w-[80px] px-3 py-2 text-xs font-medium text-muted-foreground shrink-0"
        aria-label="Actions"
        data-testid="list-header-actions"
      >
        <span className="sr-only">Actions</span>
      </div>
    </div>
  );
});

/**
 * Helper function to get a column definition by ID
 */
export function getColumnById(columnId: SortColumn): ColumnDef | undefined {
  return LIST_COLUMNS.find((col) => col.id === columnId);
}

/**
 * Helper function to get column width class for consistent styling in rows
 */
export function getColumnWidth(columnId: SortColumn): string {
  const column = getColumnById(columnId);
  return cn(column?.width, column?.minWidth);
}

/**
 * Helper function to get column alignment class
 */
export function getColumnAlign(columnId: SortColumn): string {
  const column = getColumnById(columnId);
  if (column?.align === 'center') return 'justify-center text-center';
  if (column?.align === 'right') return 'justify-end text-right';
  return '';
}
