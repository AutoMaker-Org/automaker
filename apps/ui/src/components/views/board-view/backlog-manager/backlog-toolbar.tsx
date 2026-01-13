import { useRef, ChangeEvent, useCallback } from 'react';
import { Search, X, Filter, Upload, ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { ImportError } from './hooks/use-backlog-manager';
import { createLogger } from '@automaker/utils/logger';

const logger = createLogger('BacklogToolbar');

/**
 * Props for the BacklogToolbar component
 */
interface BacklogToolbarProps {
  /** Current search query */
  searchQuery: string;
  /** Callback to update search query */
  onSearchChange: (query: string) => void;
  /** Currently selected categories for filtering */
  selectedCategories: string[];
  /** Callback to update selected categories */
  onSelectedCategoriesChange: (categories: string[]) => void;
  /** Available categories for filtering */
  availableCategories: string[];
  /** Callback to create a new feature (for import) */
  createFeature: (feature: Record<string, unknown>) => Promise<unknown>;
  /** Callback to set import errors */
  setImportErrors: (errors: ImportError[]) => void;
  /** Callback to refresh features list */
  refetchFeatures: () => Promise<void>;
  /** Whether import operations are disabled */
  disabled?: boolean;
}

/**
 * BacklogToolbar - Provides search, category filters, and import functionality
 *
 * Features:
 * - Search input filtering by title and description
 * - Multi-select category filter dropdown
 * - Import button using native file picker (.txt and .md files)
 */
export function BacklogToolbar({
  searchQuery,
  onSearchChange,
  selectedCategories,
  onSelectedCategoriesChange,
  availableCategories,
  createFeature,
  setImportErrors,
  refetchFeatures,
  disabled = false,
}: BacklogToolbarProps) {
  // Ref for hidden file input
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Toggle a category in the filter
  const toggleCategory = useCallback(
    (category: string) => {
      if (selectedCategories.includes(category)) {
        onSelectedCategoriesChange(selectedCategories.filter((c) => c !== category));
      } else {
        onSelectedCategoriesChange([...selectedCategories, category]);
      }
    },
    [selectedCategories, onSelectedCategoriesChange]
  );

  // Clear all category filters
  const clearCategoryFilters = useCallback(() => {
    onSelectedCategoriesChange([]);
  }, [onSelectedCategoriesChange]);

  // Handle file selection for import
  const handleFileSelect = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;

      logger.info(`Importing ${files.length} file(s)`);
      const errors: ImportError[] = [];

      for (const file of files) {
        try {
          const description = await file.text(); // Verbatim contents
          let created = false;

          // Attempt 1: empty string title
          try {
            const result = await createFeature({
              title: '',
              description,
              status: 'backlog',
            });
            if (result) {
              created = true;
              logger.info(`Imported file "${file.name}" with empty title`);
            }
          } catch (error) {
            logger.warn(
              `Failed to create feature with empty title for "${file.name}", trying single space`
            );

            // Attempt 2: single space title
            try {
              const result = await createFeature({
                title: ' ',
                description,
                status: 'backlog',
              });
              if (result) {
                created = true;
                logger.info(`Imported file "${file.name}" with single space title`);
              }
            } catch (retryError) {
              // Both attempts failed - record error and skip file
              const errorMessage =
                retryError instanceof Error ? retryError.message : 'Unknown error';
              errors.push({
                filename: file.name,
                error: errorMessage,
              });
              logger.error(`Failed to import file "${file.name}": ${errorMessage}`);
            }
          }

          if (!created && errors.find((e) => e.filename === file.name) === undefined) {
            // Feature creation returned null without throwing
            errors.push({
              filename: file.name,
              error: 'Failed to create feature',
            });
          }
        } catch (readError) {
          // File read failed
          const errorMessage =
            readError instanceof Error ? readError.message : 'Failed to read file';
          errors.push({
            filename: file.name,
            error: errorMessage,
          });
          logger.error(`Failed to read file "${file.name}": ${errorMessage}`);
        }
      }

      // Update import errors state (displayed inline in BacklogManager)
      if (errors.length > 0) {
        setImportErrors(errors);
        logger.warn(`Import completed with ${errors.length} error(s)`);
      } else {
        logger.info(`Successfully imported ${files.length} file(s)`);
      }

      // Reset input to allow re-selecting same files
      e.target.value = '';

      // Refresh features list
      await refetchFeatures();
    },
    [createFeature, setImportErrors, refetchFeatures]
  );

  const hasActiveFilters = selectedCategories.length > 0;

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className="flex items-center gap-3 p-3 bg-secondary/50 rounded-lg border border-border"
        data-testid="backlog-toolbar"
      >
        {/* Search input */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            type="text"
            placeholder="Search by title or description..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 pr-8"
            disabled={disabled}
            data-testid="backlog-search-input"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-sm hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Clear search"
              data-testid="backlog-search-clear"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Separator */}
        <div className="h-6 w-px bg-border" />

        {/* Category filter dropdown */}
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  variant={hasActiveFilters ? 'secondary' : 'outline'}
                  size="sm"
                  disabled={disabled || availableCategories.length === 0}
                  className={cn('gap-1.5', hasActiveFilters && 'ring-1 ring-primary/30')}
                  data-testid="category-filter-button"
                >
                  <Filter className="w-4 h-4" />
                  <span className="hidden sm:inline">Filter</span>
                  {hasActiveFilters && (
                    <span className="ml-0.5 px-1.5 py-0.5 text-xs rounded-full bg-primary/10 text-primary">
                      {selectedCategories.length}
                    </span>
                  )}
                  <ChevronDown className="w-3 h-3 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Filter by category</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>Filter by Category</span>
              {hasActiveFilters && (
                <button
                  onClick={clearCategoryFilters}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Clear all
                </button>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {availableCategories.length === 0 ? (
              <div className="px-2 py-3 text-sm text-muted-foreground text-center">
                No categories available
              </div>
            ) : (
              availableCategories.map((category) => (
                <DropdownMenuCheckboxItem
                  key={category}
                  checked={selectedCategories.includes(category)}
                  onCheckedChange={() => toggleCategory(category)}
                >
                  {category || '(Uncategorized)'}
                </DropdownMenuCheckboxItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Separator */}
        <div className="h-6 w-px bg-border" />

        {/* Import button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
              className="gap-1.5"
              data-testid="import-button"
            >
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">Import</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Import .txt or .md files</TooltipContent>
        </Tooltip>

        {/* Hidden file input for import */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".txt,.md,text/plain,text/markdown"
          onChange={handleFileSelect}
          className="hidden"
          data-testid="import-file-input"
        />
      </div>
    </TooltipProvider>
  );
}
