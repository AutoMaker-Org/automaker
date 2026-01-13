import { RefreshCw, ArrowLeft, AlertCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Feature } from '@/store/app-store';
import { useBacklogManager, ImportError } from './hooks/use-backlog-manager';
import { BacklogToolbar } from './backlog-toolbar';
import { BacklogTable } from './backlog-table';
import { BulkActionsBar } from './bulk-actions-bar';

/**
 * Props for the BacklogManager component
 */
interface BacklogManagerProps {
  /** Current project information */
  currentProject: { path: string; id: string; name?: string } | null;
  /** Callback to exit backlog manager and return to Kanban view */
  onExitBacklogManager: () => void;
  /** Callback when edit button is clicked on a feature */
  onEdit?: (feature: Feature) => void;
  /** Callback when delete button is clicked on a feature */
  onDelete?: (featureId: string) => void;
}

/**
 * Inline error banner for displaying import failures
 */
function ImportErrorsBanner({
  errors,
  onDismiss,
}: {
  errors: ImportError[];
  onDismiss: () => void;
}) {
  if (errors.length === 0) return null;

  return (
    <div
      className={cn(
        'flex items-start gap-3 px-4 py-3 rounded-lg',
        'bg-destructive/10 border border-destructive/20',
        'animate-in slide-in-from-top-2 fade-in duration-200'
      )}
      role="alert"
      data-testid="import-errors-banner"
    >
      <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-destructive">
          Failed to import {errors.length} file{errors.length !== 1 ? 's' : ''}
        </p>
        <ul className="mt-1 space-y-0.5">
          {errors.map((err, index) => (
            <li
              key={`${err.filename}-${index}`}
              className="text-sm text-destructive/80 truncate"
              title={`${err.filename}: ${err.error}`}
            >
              <span className="font-medium">{err.filename}</span>: {err.error}
            </li>
          ))}
        </ul>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onDismiss}
        className="shrink-0 text-destructive/70 hover:text-destructive hover:bg-destructive/10"
        aria-label="Dismiss import errors"
        data-testid="dismiss-import-errors"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

/**
 * Empty state component when there are no backlog items
 */
function EmptyBacklogState() {
  return (
    <div
      className="flex-1 flex flex-col items-center justify-center text-center p-6"
      data-testid="empty-backlog-state"
    >
      <div className="p-4 rounded-full bg-muted/50 mb-4">
        <RefreshCw className="h-12 w-12 text-muted-foreground/50" />
      </div>
      <h2 className="text-lg font-medium mb-2">No backlog items</h2>
      <p className="text-muted-foreground max-w-md">
        Your backlog is empty. Import files or add features from the Kanban board to get started.
      </p>
    </div>
  );
}

/**
 * BacklogManager - A table-based view for managing backlog items
 *
 * Provides efficient bulk operations like:
 * - Import TXT files
 * - Bulk category changes
 * - Bulk delete with concurrency-limited API calls
 * - Search and filter by category
 */
export function BacklogManager({
  currentProject,
  onExitBacklogManager,
  onEdit,
  onDelete,
}: BacklogManagerProps) {
  const backlogManager = useBacklogManager({ currentProject });

  const {
    // Backlog features
    filteredFeatures,
    isLoading,

    // Selection
    selectedIds,
    selectedCount,
    toggleSelection,
    selectAll,
    clearSelection,
    isSelected,

    // Search
    searchQuery,
    setSearchQuery,

    // Category filter
    selectedCategories,
    setSelectedCategories,
    availableCategories,

    // Import errors - the key feature of T004
    importErrors,
    setImportErrors,
    clearImportErrors,

    // Bulk operations - T008 feature
    bulkDelete,
    bulkUpdateCategory,

    // Feature operations
    createFeature,
    updateFeature,

    // Refresh
    refetchFeatures,
  } = backlogManager;

  // Handler for inline category editing in BacklogRow
  const handleCategoryChange = async (featureId: string, category: string) => {
    await updateFeature(featureId, { category });
  };

  // Show loading state
  if (isLoading) {
    return (
      <div
        className="flex-1 flex items-center justify-center"
        data-testid="backlog-manager-loading"
      >
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden" data-testid="backlog-manager">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onExitBacklogManager}
            className="gap-1.5"
            data-testid="back-to-kanban-button"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Kanban
          </Button>
          <div className="h-4 w-px bg-border" />
          <h1 className="text-lg font-semibold">Backlog Manager</h1>
          <span className="text-sm text-muted-foreground">
            ({filteredFeatures.length} item{filteredFeatures.length !== 1 ? 's' : ''})
          </span>
        </div>

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={refetchFeatures}
          disabled={isLoading}
          aria-label="Refresh backlog"
          data-testid="refresh-backlog-button"
        >
          <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
        </Button>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden p-4 gap-4">
        {/* Import errors banner */}
        <ImportErrorsBanner errors={importErrors} onDismiss={clearImportErrors} />

        {/* Toolbar with search, filters, import */}
        <BacklogToolbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          selectedCategories={selectedCategories}
          onSelectedCategoriesChange={setSelectedCategories}
          availableCategories={availableCategories}
          createFeature={createFeature}
          setImportErrors={setImportErrors}
          refetchFeatures={refetchFeatures}
        />

        {/* Table or empty state */}
        {filteredFeatures.length === 0 ? (
          <EmptyBacklogState />
        ) : (
          <BacklogTable
            features={filteredFeatures}
            selectedIds={selectedIds}
            toggleSelection={toggleSelection}
            selectAll={selectAll}
            clearSelection={clearSelection}
            isSelected={isSelected}
            onCategoryChange={handleCategoryChange}
            availableCategories={availableCategories}
            onEdit={onEdit}
            onDelete={onDelete ? (feature) => onDelete(feature.id) : undefined}
          />
        )}

        {/* Bulk actions bar for selected items */}
        <BulkActionsBar
          selectedCount={selectedCount}
          totalCount={filteredFeatures.length}
          selectedIds={Array.from(selectedIds)}
          availableCategories={availableCategories}
          onBulkDelete={bulkDelete}
          onBulkUpdateCategory={bulkUpdateCategory}
          onSelectAll={selectAll}
          onClearSelection={clearSelection}
        />
      </div>
    </div>
  );
}
