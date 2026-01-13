import { useCallback, useState, useMemo, useEffect } from 'react';
import {
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Feature } from '@/store/app-store';
import { BacklogRow } from './backlog-row';

/**
 * Sort configuration for columns
 */
export type SortField = 'title' | 'description' | 'category';
export type SortDirection = 'asc' | 'desc';

export interface SortConfig {
  field: SortField;
  direction: SortDirection;
}

/**
 * Props for the BacklogTable component
 */
export interface BacklogTableProps {
  /** Filtered features to display */
  features: Feature[];
  /** Set of selected feature IDs */
  selectedIds: Set<string>;
  /** Toggle selection for a feature */
  toggleSelection: (featureId: string) => void;
  /** Select all visible features */
  selectAll: () => void;
  /** Clear all selections */
  clearSelection: () => void;
  /** Check if a feature is selected */
  isSelected: (featureId: string) => boolean;
  /** Callback when category is changed for a feature */
  onCategoryChange: (featureId: string, category: string) => Promise<void>;
  /** Available categories for autocomplete suggestions */
  availableCategories: string[];
  /** Callback when a row is clicked (optional, for future expansion) */
  onRowClick?: (feature: Feature) => void;
  /** Callback when edit button is clicked */
  onEdit?: (feature: Feature) => void;
  /** Callback when delete button is clicked */
  onDelete?: (feature: Feature) => void;
}

/**
 * Page size options for pagination
 */
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

/**
 * Pagination controls component
 */
function PaginationControls({
  currentPage,
  totalPages,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
}: {
  currentPage: number;
  totalPages: number;
  pageSize: PageSize;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: PageSize) => void;
}) {
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  return (
    <div
      className="flex items-center justify-between px-3 py-2 border-t border-border bg-muted/30"
      data-testid="pagination-controls"
    >
      {/* Items per page selector */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>Rows per page:</span>
        <Select
          value={String(pageSize)}
          onValueChange={(value) => onPageSizeChange(Number(value) as PageSize)}
        >
          <SelectTrigger className="h-8 w-[70px]" data-testid="page-size-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Page info and navigation */}
      <div className="flex items-center gap-4">
        <span className="text-sm text-muted-foreground" data-testid="pagination-info">
          {startItem}-{endItem} of {totalItems}
        </span>

        <div className="flex items-center gap-1">
          {/* First page */}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onPageChange(1)}
            disabled={currentPage === 1}
            aria-label="First page"
            data-testid="pagination-first"
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>

          {/* Previous page */}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            aria-label="Previous page"
            data-testid="pagination-prev"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          {/* Page indicator */}
          <span className="text-sm px-2 min-w-[80px] text-center">
            Page {currentPage} of {totalPages || 1}
          </span>

          {/* Next page */}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
            aria-label="Next page"
            data-testid="pagination-next"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>

          {/* Last page */}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onPageChange(totalPages)}
            disabled={currentPage >= totalPages}
            aria-label="Last page"
            data-testid="pagination-last"
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Sortable column header component
 */
function SortableColumnHeader({
  label,
  field,
  currentSort,
  onSort,
  className,
}: {
  label: string;
  field: SortField;
  currentSort: SortConfig | null;
  onSort: (field: SortField) => void;
  className?: string;
}) {
  const isActive = currentSort?.field === field;
  const direction = isActive ? currentSort.direction : null;

  return (
    <th
      className={cn(
        'px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer select-none',
        'hover:bg-muted/50 transition-colors',
        isActive && 'text-foreground',
        className
      )}
      onClick={() => onSort(field)}
      data-testid={`sort-header-${field}`}
    >
      <div className="flex items-center gap-1">
        <span>{label}</span>
        <div className="flex flex-col -space-y-1">
          <ChevronUp
            className={cn(
              'h-3 w-3 transition-colors',
              direction === 'asc' ? 'text-foreground' : 'text-muted-foreground/40'
            )}
          />
          <ChevronDown
            className={cn(
              'h-3 w-3 transition-colors',
              direction === 'desc' ? 'text-foreground' : 'text-muted-foreground/40'
            )}
          />
        </div>
      </div>
    </th>
  );
}

/**
 * Table header with select all checkbox
 */
function BacklogTableHeader({
  allSelected,
  someSelected,
  onSelectAllChange,
  featureCount,
  sortConfig,
  onSort,
}: {
  allSelected: boolean;
  someSelected: boolean;
  onSelectAllChange: (checked: boolean) => void;
  featureCount: number;
  sortConfig: SortConfig | null;
  onSort: (field: SortField) => void;
}) {
  return (
    <thead className="bg-muted/30 sticky top-0 z-10">
      <tr className="border-b border-border">
        {/* Selection column */}
        <th className="w-12 px-3 py-3 text-left">
          <Checkbox
            checked={allSelected ? true : someSelected ? 'indeterminate' : false}
            onCheckedChange={onSelectAllChange}
            aria-label={allSelected ? 'Deselect all' : 'Select all'}
            data-testid="select-all-checkbox"
          />
        </th>
        {/* Title column - sortable */}
        <SortableColumnHeader
          label="Title"
          field="title"
          currentSort={sortConfig}
          onSort={onSort}
          className="min-w-[200px]"
        />
        {/* Description column - sortable */}
        <SortableColumnHeader
          label="Description"
          field="description"
          currentSort={sortConfig}
          onSort={onSort}
        />
        {/* Category column - sortable */}
        <SortableColumnHeader
          label="Category"
          field="category"
          currentSort={sortConfig}
          onSort={onSort}
          className="w-40"
        />
        {/* Actions column header */}
        <th className="w-40 px-3 py-3 text-right text-xs font-medium text-muted-foreground">
          {featureCount} item{featureCount !== 1 ? 's' : ''}
        </th>
      </tr>
    </thead>
  );
}

/**
 * BacklogTable - A dense table view for displaying and managing backlog items
 *
 * Features:
 * - Select all / individual selection with checkboxes
 * - Title, description (truncated), and category columns
 * - Inline category editing via BacklogRow component
 * - Sticky header for scrollable content
 * - Visual feedback for selected rows
 * - Sortable columns (click to sort by title, description, or category)
 */
export function BacklogTable({
  features,
  selectedIds,
  toggleSelection,
  selectAll,
  clearSelection,
  isSelected,
  onCategoryChange,
  availableCategories,
  onRowClick,
  onEdit,
  onDelete,
}: BacklogTableProps) {
  // Sort state
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(25);

  // Reset to page 1 when features change (filters applied) or sort changes
  useEffect(() => {
    setCurrentPage(1);
  }, [features.length, sortConfig]);

  // Calculate selection state for "select all" checkbox
  const allSelected = features.length > 0 && selectedIds.size === features.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < features.length;

  // Handle select all toggle
  const handleSelectAllChange = useCallback(
    (checked: boolean) => {
      if (checked) {
        selectAll();
      } else {
        clearSelection();
      }
    },
    [selectAll, clearSelection]
  );

  // Handle column sort toggle
  const handleSort = useCallback((field: SortField) => {
    setSortConfig((prev) => {
      if (prev?.field === field) {
        // Toggle direction or clear sort
        if (prev.direction === 'asc') {
          return { field, direction: 'desc' };
        } else {
          return null; // Clear sort on third click
        }
      }
      // New field, start with ascending
      return { field, direction: 'asc' };
    });
  }, []);

  // Sort features based on current sort config
  const sortedFeatures = useMemo(() => {
    if (!sortConfig) return features;

    return [...features].sort((a, b) => {
      let aValue: string;
      let bValue: string;

      switch (sortConfig.field) {
        case 'title':
          aValue = a.title?.toLowerCase() || '';
          bValue = b.title?.toLowerCase() || '';
          break;
        case 'description':
          aValue = a.description?.toLowerCase() || '';
          bValue = b.description?.toLowerCase() || '';
          break;
        case 'category':
          aValue = a.category?.toLowerCase() || '';
          bValue = b.category?.toLowerCase() || '';
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [features, sortConfig]);

  // Pagination calculations
  const totalPages = Math.ceil(sortedFeatures.length / pageSize);

  // Paginate sorted features
  const paginatedFeatures = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return sortedFeatures.slice(startIndex, startIndex + pageSize);
  }, [sortedFeatures, currentPage, pageSize]);

  // Handle page change
  const handlePageChange = useCallback(
    (page: number) => {
      setCurrentPage(Math.max(1, Math.min(page, totalPages)));
    },
    [totalPages]
  );

  // Handle page size change
  const handlePageSizeChange = useCallback((newSize: PageSize) => {
    setPageSize(newSize);
    setCurrentPage(1); // Reset to first page when changing page size
  }, []);

  return (
    <div
      className="flex-1 flex flex-col overflow-hidden rounded-lg border border-border bg-background"
      data-testid="backlog-table"
    >
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <BacklogTableHeader
            allSelected={allSelected}
            someSelected={someSelected}
            onSelectAllChange={handleSelectAllChange}
            featureCount={features.length}
            sortConfig={sortConfig}
            onSort={handleSort}
          />
          <tbody>
            {paginatedFeatures.map((feature) => (
              <BacklogRow
                key={feature.id}
                feature={feature}
                isSelected={isSelected(feature.id)}
                onSelect={() => toggleSelection(feature.id)}
                onCategoryChange={onCategoryChange}
                availableCategories={availableCategories}
                onRowClick={onRowClick}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination controls */}
      <PaginationControls
        currentPage={currentPage}
        totalPages={totalPages}
        pageSize={pageSize}
        totalItems={sortedFeatures.length}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
      />
    </div>
  );
}
