import { useState, useCallback } from 'react';
import { Trash2, Tag, X, CheckSquare, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { createLogger } from '@automaker/utils/logger';

const logger = createLogger('BulkActionsBar');

/**
 * Props for the BulkActionsBar component
 */
interface BulkActionsBarProps {
  /** Number of selected items */
  selectedCount: number;
  /** Total number of items in the current view */
  totalCount: number;
  /** Array of selected feature IDs */
  selectedIds: string[];
  /** Available categories for bulk category change */
  availableCategories: string[];
  /** Callback to perform bulk delete (with concurrency cap of 5) */
  onBulkDelete: (featureIds: string[]) => Promise<void>;
  /** Callback to perform bulk category update */
  onBulkUpdateCategory: (featureIds: string[], category: string) => Promise<void>;
  /** Callback to select all items */
  onSelectAll: () => void;
  /** Callback to clear selection */
  onClearSelection: () => void;
}

/**
 * BulkActionsBar - Floating action bar for bulk operations on selected items
 *
 * Features:
 * - Shows count of selected items
 * - Bulk delete with confirmation (uses parallel API calls with concurrency cap of 5)
 * - Bulk category change via dropdown
 * - Select all / clear selection controls
 * - Loading states for async operations
 */
export function BulkActionsBar({
  selectedCount,
  totalCount,
  selectedIds,
  availableCategories,
  onBulkDelete,
  onBulkUpdateCategory,
  onSelectAll,
  onClearSelection,
}: BulkActionsBarProps) {
  // Loading states for async operations
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdatingCategory, setIsUpdatingCategory] = useState(false);

  const allSelected = selectedCount === totalCount && totalCount > 0;
  const isLoading = isDeleting || isUpdatingCategory;

  /**
   * Handle bulk delete with confirmation
   * Uses parallel API calls with concurrency cap of 5 (implemented in useBacklogManager hook)
   */
  const handleBulkDelete = useCallback(async () => {
    if (isLoading) return;

    // Confirm deletion
    const confirmed = window.confirm(
      `Are you sure you want to delete ${selectedCount} item${selectedCount !== 1 ? 's' : ''}? This action cannot be undone.`
    );

    if (!confirmed) return;

    setIsDeleting(true);
    logger.info(`Starting bulk delete of ${selectedCount} items with concurrency cap of 5`);

    try {
      await onBulkDelete(selectedIds);
      logger.info(`Successfully deleted ${selectedCount} items`);
    } catch (error) {
      logger.error('Bulk delete failed:', error);
      // Error handling is done in the hook, but we could show a toast here
    } finally {
      setIsDeleting(false);
    }
  }, [isLoading, selectedCount, selectedIds, onBulkDelete]);

  /**
   * Handle bulk category change
   */
  const handleCategoryChange = useCallback(
    async (category: string) => {
      if (isLoading || !category) return;

      setIsUpdatingCategory(true);
      logger.info(`Starting bulk category update to "${category}" for ${selectedCount} items`);

      try {
        await onBulkUpdateCategory(selectedIds, category);
        logger.info(`Successfully updated category for ${selectedCount} items`);
      } catch (error) {
        logger.error('Bulk category update failed:', error);
      } finally {
        setIsUpdatingCategory(false);
      }
    },
    [isLoading, selectedCount, selectedIds, onBulkUpdateCategory]
  );

  // Don't render if nothing is selected - MUST be after all hooks are called
  if (selectedCount === 0) return null;

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={cn(
          'fixed bottom-6 left-1/2 -translate-x-1/2 z-50',
          'flex items-center gap-3 px-4 py-3 rounded-xl',
          'bg-background/95 backdrop-blur-sm border border-border shadow-lg',
          'animate-in slide-in-from-bottom-4 fade-in duration-200'
        )}
        role="toolbar"
        aria-label="Bulk actions for selected items"
        data-testid="bulk-actions-bar"
      >
        {/* Selection count */}
        <span className="text-sm font-medium text-foreground">
          {selectedCount} item{selectedCount !== 1 ? 's' : ''} selected
        </span>

        <div className="h-4 w-px bg-border" />

        {/* Bulk actions */}
        <div className="flex items-center gap-2">
          {/* Bulk category change */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="relative">
                <Select
                  onValueChange={handleCategoryChange}
                  disabled={isLoading || availableCategories.length === 0}
                >
                  <SelectTrigger
                    className={cn('h-8 w-[140px] text-sm', isUpdatingCategory && 'opacity-50')}
                    data-testid="bulk-category-select"
                  >
                    {isUpdatingCategory ? (
                      <div className="flex items-center gap-1.5">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Updating...</span>
                      </div>
                    ) : (
                      <>
                        <Tag className="w-3.5 h-3.5 mr-1.5" />
                        <SelectValue placeholder="Set category" />
                      </>
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    {availableCategories.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category || '(Uncategorized)'}
                      </SelectItem>
                    ))}
                    {availableCategories.length === 0 && (
                      <div className="px-2 py-3 text-sm text-muted-foreground text-center">
                        No categories available
                      </div>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </TooltipTrigger>
            <TooltipContent>Change category for selected items</TooltipContent>
          </Tooltip>

          {/* Bulk delete */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleBulkDelete}
                disabled={isLoading}
                className="h-8 gap-1.5"
                data-testid="bulk-delete-button"
              >
                {isDeleting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                <span className="hidden sm:inline">Delete</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete selected items</TooltipContent>
          </Tooltip>
        </div>

        <div className="h-4 w-px bg-border" />

        {/* Selection controls */}
        <div className="flex items-center gap-2">
          {/* Select all button (only show if not all selected) */}
          {!allSelected && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onSelectAll}
                  disabled={isLoading}
                  className="h-8 gap-1.5"
                  data-testid="bulk-select-all-button"
                >
                  <CheckSquare className="w-4 h-4" />
                  <span className="hidden sm:inline">All ({totalCount})</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Select all items</TooltipContent>
            </Tooltip>
          )}

          {/* Clear selection */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearSelection}
                disabled={isLoading}
                className="h-8 gap-1.5 text-muted-foreground hover:text-foreground"
                data-testid="bulk-clear-selection-button"
              >
                <X className="w-4 h-4" />
                <span className="hidden sm:inline">Clear</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Clear selection (Esc)</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  );
}
