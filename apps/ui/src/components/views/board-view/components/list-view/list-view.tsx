import { memo, useMemo, useCallback, useState } from 'react';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { getBlockingDependencies } from '@automaker/dependency-resolver';
import type { Feature } from '@/store/app-store';
import type { PipelineConfig, FeatureStatusWithPipeline } from '@automaker/types';
import { ListHeader } from './list-header';
import { ListRow, sortFeatures } from './list-row';
import { createRowActionHandlers, type RowActionHandlers } from './row-actions';
import { getStatusLabel, getStatusOrder } from './status-badge';
import { getColumnsWithPipeline } from '../../constants';
import type { SortConfig, SortColumn } from '../../hooks/use-list-view-state';

/** Empty set constant to avoid creating new instances on each render */
const EMPTY_SET = new Set<string>();

/**
 * Status group configuration for the list view
 */
interface StatusGroup {
  id: FeatureStatusWithPipeline;
  title: string;
  colorClass: string;
  features: Feature[];
}

/**
 * Props for action handlers passed from the parent board view
 */
export interface ListViewActionHandlers {
  onEdit: (feature: Feature) => void;
  onDelete: (featureId: string) => void;
  onViewOutput?: (feature: Feature) => void;
  onVerify?: (feature: Feature) => void;
  onResume?: (feature: Feature) => void;
  onForceStop?: (feature: Feature) => void;
  onManualVerify?: (feature: Feature) => void;
  onFollowUp?: (feature: Feature) => void;
  onImplement?: (feature: Feature) => void;
  onComplete?: (feature: Feature) => void;
  onViewPlan?: (feature: Feature) => void;
  onApprovePlan?: (feature: Feature) => void;
  onSpawnTask?: (feature: Feature) => void;
}

export interface ListViewProps {
  /** Map of column/status ID to features in that column */
  columnFeaturesMap: Record<string, Feature[]>;
  /** All features (for dependency checking) */
  allFeatures: Feature[];
  /** Current sort configuration */
  sortConfig: SortConfig;
  /** Callback when sort column is changed */
  onSortChange: (column: SortColumn) => void;
  /** Action handlers for rows */
  actionHandlers: ListViewActionHandlers;
  /** Set of feature IDs that are currently running */
  runningAutoTasks: string[];
  /** Pipeline configuration for custom statuses */
  pipelineConfig?: PipelineConfig | null;
  /** Callback to add a new feature */
  onAddFeature?: () => void;
  /** Whether selection mode is enabled */
  isSelectionMode?: boolean;
  /** Set of selected feature IDs */
  selectedFeatureIds?: Set<string>;
  /** Callback when a feature's selection is toggled */
  onToggleFeatureSelection?: (featureId: string) => void;
  /** Callback when the row is clicked */
  onRowClick?: (feature: Feature) => void;
  /** Additional className for custom styling */
  className?: string;
}

/**
 * StatusGroupHeader displays the header for a status group with collapse toggle
 */
const StatusGroupHeader = memo(function StatusGroupHeader({
  group,
  isExpanded,
  onToggle,
}: {
  group: StatusGroup;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'flex items-center gap-2 w-full px-3 py-2 text-left',
        'bg-muted/50 hover:bg-muted/70 transition-colors duration-200',
        'border-b border-border/50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'
      )}
      aria-expanded={isExpanded}
      data-testid={`list-group-header-${group.id}`}
    >
      {/* Collapse indicator */}
      <span className="text-muted-foreground">
        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </span>

      {/* Status color indicator */}
      <span
        className={cn('w-2.5 h-2.5 rounded-full shrink-0', group.colorClass)}
        aria-hidden="true"
      />

      {/* Group title */}
      <span className="font-medium text-sm">{group.title}</span>

      {/* Feature count */}
      <span className="text-xs text-muted-foreground">({group.features.length})</span>
    </button>
  );
});

/**
 * EmptyState displays a message when there are no features
 */
const EmptyState = memo(function EmptyState({ onAddFeature }: { onAddFeature?: () => void }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-16 px-4',
        'text-center text-muted-foreground'
      )}
      data-testid="list-view-empty"
    >
      <p className="text-sm mb-4">No features to display</p>
      {onAddFeature && (
        <Button variant="outline" size="sm" onClick={onAddFeature}>
          <Plus className="w-4 h-4 mr-2" />
          Add Feature
        </Button>
      )}
    </div>
  );
});

/**
 * ListView displays features in a table format grouped by status.
 *
 * Features:
 * - Groups features by status (backlog, in_progress, waiting_approval, verified, pipeline steps)
 * - Collapsible status groups
 * - Sortable columns (title, status, category, priority, dates)
 * - Inline row actions with hover state
 * - Selection support for bulk operations
 * - Animated border for currently running features
 * - Keyboard accessible
 *
 * The component receives features grouped by status via columnFeaturesMap
 * and applies the current sort configuration within each group.
 *
 * @example
 * ```tsx
 * const { sortConfig, setSortColumn } = useListViewState();
 * const { columnFeaturesMap } = useBoardColumnFeatures({ features, ... });
 *
 * <ListView
 *   columnFeaturesMap={columnFeaturesMap}
 *   allFeatures={features}
 *   sortConfig={sortConfig}
 *   onSortChange={setSortColumn}
 *   actionHandlers={{
 *     onEdit: handleEdit,
 *     onDelete: handleDelete,
 *     // ...
 *   }}
 *   runningAutoTasks={runningAutoTasks}
 *   pipelineConfig={pipelineConfig}
 *   onAddFeature={handleAddFeature}
 * />
 * ```
 */
export const ListView = memo(function ListView({
  columnFeaturesMap,
  allFeatures,
  sortConfig,
  onSortChange,
  actionHandlers,
  runningAutoTasks,
  pipelineConfig = null,
  onAddFeature,
  isSelectionMode = false,
  selectedFeatureIds = EMPTY_SET,
  onToggleFeatureSelection,
  onRowClick,
  className,
}: ListViewProps) {
  // Track collapsed state for each status group
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Generate status groups from columnFeaturesMap
  const statusGroups = useMemo<StatusGroup[]>(() => {
    const columns = getColumnsWithPipeline(pipelineConfig);
    const groups: StatusGroup[] = [];

    for (const column of columns) {
      const features = columnFeaturesMap[column.id] || [];
      if (features.length > 0) {
        // Sort features within the group according to current sort config
        const sortedFeatures = sortFeatures(features, sortConfig.column, sortConfig.direction);

        groups.push({
          id: column.id as FeatureStatusWithPipeline,
          title: column.title,
          colorClass: column.colorClass,
          features: sortedFeatures,
        });
      }
    }

    // Sort groups by status order
    return groups.sort((a, b) => getStatusOrder(a.id) - getStatusOrder(b.id));
  }, [columnFeaturesMap, pipelineConfig, sortConfig]);

  // Calculate total feature count
  const totalFeatures = useMemo(
    () => statusGroups.reduce((sum, group) => sum + group.features.length, 0),
    [statusGroups]
  );

  // Toggle group collapse state
  const toggleGroup = useCallback((groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  // Create row action handlers for a feature
  const createHandlers = useCallback(
    (feature: Feature): RowActionHandlers => {
      return createRowActionHandlers(feature.id, {
        editFeature: (id) => {
          const f = allFeatures.find((f) => f.id === id);
          if (f) actionHandlers.onEdit(f);
        },
        deleteFeature: (id) => actionHandlers.onDelete(id),
        viewOutput: actionHandlers.onViewOutput
          ? (id) => {
              const f = allFeatures.find((f) => f.id === id);
              if (f) actionHandlers.onViewOutput?.(f);
            }
          : undefined,
        verifyFeature: actionHandlers.onVerify
          ? (id) => {
              const f = allFeatures.find((f) => f.id === id);
              if (f) actionHandlers.onVerify?.(f);
            }
          : undefined,
        resumeFeature: actionHandlers.onResume
          ? (id) => {
              const f = allFeatures.find((f) => f.id === id);
              if (f) actionHandlers.onResume?.(f);
            }
          : undefined,
        forceStop: actionHandlers.onForceStop
          ? (id) => {
              const f = allFeatures.find((f) => f.id === id);
              if (f) actionHandlers.onForceStop?.(f);
            }
          : undefined,
        manualVerify: actionHandlers.onManualVerify
          ? (id) => {
              const f = allFeatures.find((f) => f.id === id);
              if (f) actionHandlers.onManualVerify?.(f);
            }
          : undefined,
        followUp: actionHandlers.onFollowUp
          ? (id) => {
              const f = allFeatures.find((f) => f.id === id);
              if (f) actionHandlers.onFollowUp?.(f);
            }
          : undefined,
        implement: actionHandlers.onImplement
          ? (id) => {
              const f = allFeatures.find((f) => f.id === id);
              if (f) actionHandlers.onImplement?.(f);
            }
          : undefined,
        complete: actionHandlers.onComplete
          ? (id) => {
              const f = allFeatures.find((f) => f.id === id);
              if (f) actionHandlers.onComplete?.(f);
            }
          : undefined,
        viewPlan: actionHandlers.onViewPlan
          ? (id) => {
              const f = allFeatures.find((f) => f.id === id);
              if (f) actionHandlers.onViewPlan?.(f);
            }
          : undefined,
        approvePlan: actionHandlers.onApprovePlan
          ? (id) => {
              const f = allFeatures.find((f) => f.id === id);
              if (f) actionHandlers.onApprovePlan?.(f);
            }
          : undefined,
        spawnTask: actionHandlers.onSpawnTask
          ? (id) => {
              const f = allFeatures.find((f) => f.id === id);
              if (f) actionHandlers.onSpawnTask?.(f);
            }
          : undefined,
      });
    },
    [actionHandlers, allFeatures]
  );

  // Get blocking dependencies for a feature
  const getBlockingDeps = useCallback(
    (feature: Feature): string[] => {
      return getBlockingDependencies(feature, allFeatures);
    },
    [allFeatures]
  );

  // Calculate selection state for header checkbox
  const selectionState = useMemo(() => {
    if (!isSelectionMode || totalFeatures === 0) {
      return { allSelected: false, someSelected: false };
    }
    const selectedCount = selectedFeatureIds.size;
    return {
      allSelected: selectedCount === totalFeatures && selectedCount > 0,
      someSelected: selectedCount > 0 && selectedCount < totalFeatures,
    };
  }, [isSelectionMode, totalFeatures, selectedFeatureIds]);

  // Handle select all toggle
  const handleSelectAll = useCallback(() => {
    if (!onToggleFeatureSelection) return;

    // If all selected, deselect all; otherwise select all
    if (selectionState.allSelected) {
      // Clear all selections
      selectedFeatureIds.forEach((id) => onToggleFeatureSelection(id));
    } else {
      // Select all features that aren't already selected
      for (const group of statusGroups) {
        for (const feature of group.features) {
          if (!selectedFeatureIds.has(feature.id)) {
            onToggleFeatureSelection(feature.id);
          }
        }
      }
    }
  }, [onToggleFeatureSelection, selectionState.allSelected, selectedFeatureIds, statusGroups]);

  // Show empty state if no features
  if (totalFeatures === 0) {
    return (
      <div className={cn('flex flex-col h-full bg-background', className)} data-testid="list-view">
        <EmptyState onAddFeature={onAddFeature} />
      </div>
    );
  }

  return (
    <div
      className={cn('flex flex-col h-full bg-background', className)}
      role="table"
      aria-label="Features list"
      data-testid="list-view"
    >
      {/* Table header */}
      <ListHeader
        sortConfig={sortConfig}
        onSortChange={onSortChange}
        showCheckbox={isSelectionMode}
        allSelected={selectionState.allSelected}
        someSelected={selectionState.someSelected}
        onSelectAll={handleSelectAll}
      />

      {/* Table body with status groups */}
      <div className="flex-1 overflow-y-auto" role="rowgroup">
        {statusGroups.map((group) => {
          const isExpanded = !collapsedGroups.has(group.id);

          return (
            <div
              key={group.id}
              className="border-b border-border/30"
              data-testid={`list-group-${group.id}`}
            >
              {/* Group header */}
              <StatusGroupHeader
                group={group}
                isExpanded={isExpanded}
                onToggle={() => toggleGroup(group.id)}
              />

              {/* Group rows */}
              {isExpanded && (
                <div role="rowgroup">
                  {group.features.map((feature) => (
                    <ListRow
                      key={feature.id}
                      feature={feature}
                      handlers={createHandlers(feature)}
                      isCurrentAutoTask={runningAutoTasks.includes(feature.id)}
                      isSelected={selectedFeatureIds.has(feature.id)}
                      showCheckbox={isSelectionMode}
                      onToggleSelect={() => onToggleFeatureSelection?.(feature.id)}
                      onClick={() => onRowClick?.(feature)}
                      blockingDependencies={getBlockingDeps(feature)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer with Add Feature button */}
      {onAddFeature && (
        <div className="border-t border-border px-4 py-3">
          <Button
            variant="outline"
            size="sm"
            onClick={onAddFeature}
            className="w-full sm:w-auto"
            data-testid="list-view-add-feature"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Feature
          </Button>
        </div>
      )}
    </div>
  );
});

/**
 * Helper to get all features from the columnFeaturesMap as a flat array
 */
export function getFlatFeatures(columnFeaturesMap: Record<string, Feature[]>): Feature[] {
  return Object.values(columnFeaturesMap).flat();
}

/**
 * Helper to count total features across all groups
 */
export function getTotalFeatureCount(columnFeaturesMap: Record<string, Feature[]>): number {
  return Object.values(columnFeaturesMap).reduce((sum, features) => sum + features.length, 0);
}
