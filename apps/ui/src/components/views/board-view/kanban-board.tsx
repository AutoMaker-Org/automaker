import {
  useMemo,
  useRef,
  useState,
  useCallback,
  useEffect,
  type RefObject,
  type ReactNode,
} from 'react';
import { DragOverlay } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Button } from '@/components/ui/button';
import { KanbanColumn, KanbanCard, EmptyStateCard } from './components';
import { Feature, useAppStore, formatShortcut } from '@/store/app-store';
import { Archive, Settings2, CheckSquare, GripVertical, Plus } from 'lucide-react';
import { useResponsiveKanban } from '@/hooks/use-responsive-kanban';
import { getColumnsWithPipeline, type ColumnId } from './constants';
import type { PipelineConfig } from '@automaker/types';
import { cn } from '@/lib/utils';
interface KanbanBoardProps {
  activeFeature: Feature | null;
  getColumnFeatures: (columnId: ColumnId) => Feature[];
  backgroundImageStyle: React.CSSProperties;
  backgroundSettings: {
    columnOpacity: number;
    columnBorderEnabled: boolean;
    hideScrollbar: boolean;
    cardOpacity: number;
    cardGlassmorphism: boolean;
    cardBorderEnabled: boolean;
    cardBorderOpacity: number;
  };
  onEdit: (feature: Feature) => void;
  onDelete: (featureId: string) => void;
  onViewOutput: (feature: Feature) => void;
  onVerify: (feature: Feature) => void;
  onResume: (feature: Feature) => void;
  onForceStop: (feature: Feature) => void;
  onManualVerify: (feature: Feature) => void;
  onMoveBackToInProgress: (feature: Feature) => void;
  onFollowUp: (feature: Feature) => void;
  onComplete: (feature: Feature) => void;
  onImplement: (feature: Feature) => void;
  onViewPlan: (feature: Feature) => void;
  onApprovePlan: (feature: Feature) => void;
  onSpawnTask?: (feature: Feature) => void;
  featuresWithContext: Set<string>;
  runningAutoTasks: string[];
  onArchiveAllVerified: () => void;
  onAddFeature: () => void;
  onShowCompletedModal: () => void;
  completedCount: number;
  pipelineConfig: PipelineConfig | null;
  onOpenPipelineSettings?: () => void;
  // Selection mode props
  isSelectionMode?: boolean;
  selectionTarget?: 'backlog' | 'waiting_approval' | null;
  selectedFeatureIds?: Set<string>;
  onToggleFeatureSelection?: (featureId: string) => void;
  onToggleSelectionMode?: (target?: 'backlog' | 'waiting_approval') => void;
  // Empty state action props
  onAiSuggest?: () => void;
  /** Whether currently dragging (hides empty states during drag) */
  isDragging?: boolean;
  /** Whether the board is in read-only mode */
  isReadOnly?: boolean;
  /** Additional className for custom styling (e.g., transition classes) */
  className?: string;
}

const KANBAN_VIRTUALIZATION_THRESHOLD = 40;
const KANBAN_CARD_ESTIMATED_HEIGHT_PX = 220;
const KANBAN_CARD_GAP_PX = 10;
const KANBAN_OVERSCAN_COUNT = 6;
const VIRTUALIZATION_MEASURE_EPSILON_PX = 1;
const REDUCED_CARD_OPACITY_PERCENT = 85;

type VirtualListItem = { id: string };

interface VirtualListState<Item extends VirtualListItem> {
  contentRef: RefObject<HTMLDivElement>;
  onScroll: (event: UIEvent<HTMLDivElement>) => void;
  itemIds: string[];
  visibleItems: Item[];
  totalHeight: number;
  offsetTop: number;
  startIndex: number;
  shouldVirtualize: boolean;
  registerItem: (id: string) => (node: HTMLDivElement | null) => void;
}

interface VirtualizedListProps<Item extends VirtualListItem> {
  items: Item[];
  isDragging: boolean;
  estimatedItemHeight: number;
  itemGap: number;
  overscan: number;
  virtualizationThreshold: number;
  children: (state: VirtualListState<Item>) => ReactNode;
}

function findIndexForOffset(itemEnds: number[], offset: number): number {
  let low = 0;
  let high = itemEnds.length - 1;
  let result = itemEnds.length;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (itemEnds[mid] >= offset) {
      result = mid;
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  return Math.min(result, itemEnds.length - 1);
}

// Virtualize long columns while keeping full DOM during drag interactions.
function VirtualizedList<Item extends VirtualListItem>({
  items,
  isDragging,
  estimatedItemHeight,
  itemGap,
  overscan,
  virtualizationThreshold,
  children,
}: VirtualizedListProps<Item>) {
  const contentRef = useRef<HTMLDivElement>(null);
  const measurementsRef = useRef<Map<string, number>>(new Map());
  const scrollRafRef = useRef<number | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [measureVersion, setMeasureVersion] = useState(0);

  const itemIds = useMemo(() => items.map((item) => item.id), [items]);
  const shouldVirtualize = !isDragging && items.length >= virtualizationThreshold;

  const itemSizes = useMemo(() => {
    return items.map((item) => {
      const measured = measurementsRef.current.get(item.id);
      const resolvedHeight = measured ?? estimatedItemHeight;
      return resolvedHeight + itemGap;
    });
  }, [items, estimatedItemHeight, itemGap, measureVersion]);

  const itemStarts = useMemo(() => {
    let offset = 0;
    return itemSizes.map((size) => {
      const start = offset;
      offset += size;
      return start;
    });
  }, [itemSizes]);

  const itemEnds = useMemo(() => {
    return itemStarts.map((start, index) => start + itemSizes[index]);
  }, [itemStarts, itemSizes]);

  const totalHeight = itemEnds.length > 0 ? itemEnds[itemEnds.length - 1] : 0;

  const { startIndex, endIndex, offsetTop } = useMemo(() => {
    if (!shouldVirtualize || items.length === 0) {
      return { startIndex: 0, endIndex: items.length, offsetTop: 0 };
    }

    const firstVisible = findIndexForOffset(itemEnds, scrollTop);
    const lastVisible = findIndexForOffset(itemEnds, scrollTop + viewportHeight);
    const overscannedStart = Math.max(0, firstVisible - overscan);
    const overscannedEnd = Math.min(items.length, lastVisible + overscan + 1);

    return {
      startIndex: overscannedStart,
      endIndex: overscannedEnd,
      offsetTop: itemStarts[overscannedStart] ?? 0,
    };
  }, [shouldVirtualize, items.length, itemEnds, itemStarts, overscan, scrollTop, viewportHeight]);

  const visibleItems = shouldVirtualize ? items.slice(startIndex, endIndex) : items;

  const onScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    if (scrollRafRef.current !== null) {
      cancelAnimationFrame(scrollRafRef.current);
    }
    scrollRafRef.current = requestAnimationFrame(() => {
      setScrollTop(target.scrollTop);
      scrollRafRef.current = null;
    });
  }, []);

  const registerItem = useCallback(
    (id: string) => (node: HTMLDivElement | null) => {
      if (!node || !shouldVirtualize) return;
      const measuredHeight = node.getBoundingClientRect().height;
      const previousHeight = measurementsRef.current.get(id);
      if (
        previousHeight === undefined ||
        Math.abs(previousHeight - measuredHeight) > VIRTUALIZATION_MEASURE_EPSILON_PX
      ) {
        measurementsRef.current.set(id, measuredHeight);
        setMeasureVersion((value) => value + 1);
      }
    },
    [shouldVirtualize]
  );

  useEffect(() => {
    const container = contentRef.current;
    if (!container || typeof window === 'undefined') return;

    const updateHeight = () => {
      setViewportHeight(container.clientHeight);
    };

    updateHeight();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateHeight);
      return () => window.removeEventListener('resize', updateHeight);
    }

    const observer = new ResizeObserver(() => updateHeight());
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!shouldVirtualize) return;
    const currentIds = new Set(items.map((item) => item.id));
    for (const id of measurementsRef.current.keys()) {
      if (!currentIds.has(id)) {
        measurementsRef.current.delete(id);
      }
    }
  }, [items, shouldVirtualize]);

  useEffect(() => {
    return () => {
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
      }
    };
  }, []);

  return (
    <>
      {children({
        contentRef,
        onScroll,
        itemIds,
        visibleItems,
        totalHeight,
        offsetTop,
        startIndex,
        shouldVirtualize,
        registerItem,
      })}
    </>
  );
}

export function KanbanBoard({
  activeFeature,
  getColumnFeatures,
  backgroundImageStyle,
  backgroundSettings,
  onEdit,
  onDelete,
  onViewOutput,
  onVerify,
  onResume,
  onForceStop,
  onManualVerify,
  onMoveBackToInProgress,
  onFollowUp,
  onComplete,
  onImplement,
  onViewPlan,
  onApprovePlan,
  onSpawnTask,
  featuresWithContext,
  runningAutoTasks,
  onArchiveAllVerified,
  onAddFeature,
  onShowCompletedModal,
  completedCount,
  pipelineConfig,
  onOpenPipelineSettings,
  isSelectionMode = false,
  selectionTarget = null,
  selectedFeatureIds = new Set(),
  onToggleFeatureSelection,
  onToggleSelectionMode,
  onAiSuggest,
  isDragging = false,
  isReadOnly = false,
  className,
}: KanbanBoardProps) {
  // Generate columns including pipeline steps
  const columns = useMemo(() => getColumnsWithPipeline(pipelineConfig), [pipelineConfig]);

  // Get the keyboard shortcut for adding features
  const keyboardShortcuts = useAppStore((state) => state.keyboardShortcuts);
  const addFeatureShortcut = keyboardShortcuts.addFeature || 'N';

  // Use responsive column widths based on window size
  // containerStyle handles centering and ensures columns fit without horizontal scroll in Electron
  const { columnWidth, containerStyle } = useResponsiveKanban(columns.length);

  return (
    <div
      className={cn(
        'flex-1 overflow-x-auto px-5 pt-4 pb-4 relative',
        'transition-opacity duration-200',
        className
      )}
      style={backgroundImageStyle}
    >
      <div className="h-full py-1" style={containerStyle}>
        {columns.map((column) => {
          const columnFeatures = getColumnFeatures(column.id as ColumnId);
          return (
            <VirtualizedList
              key={column.id}
              items={columnFeatures}
              isDragging={isDragging}
              estimatedItemHeight={KANBAN_CARD_ESTIMATED_HEIGHT_PX}
              itemGap={KANBAN_CARD_GAP_PX}
              overscan={KANBAN_OVERSCAN_COUNT}
              virtualizationThreshold={KANBAN_VIRTUALIZATION_THRESHOLD}
            >
              {({
                contentRef,
                onScroll,
                itemIds,
                visibleItems,
                totalHeight,
                offsetTop,
                startIndex,
                shouldVirtualize,
                registerItem,
              }) => (
                <KanbanColumn
                  id={column.id}
                  title={column.title}
                  colorClass={column.colorClass}
                  count={columnFeatures.length}
                  width={columnWidth}
                  opacity={backgroundSettings.columnOpacity}
                  showBorder={backgroundSettings.columnBorderEnabled}
                  hideScrollbar={backgroundSettings.hideScrollbar}
                  contentRef={contentRef}
                  onScroll={shouldVirtualize ? onScroll : undefined}
                  disableItemSpacing={shouldVirtualize}
                  contentClassName="perf-contain"
                  headerAction={
                    column.id === 'verified' ? (
                      <div className="flex items-center gap-1">
                        {columnFeatures.length > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={onArchiveAllVerified}
                            data-testid="archive-all-verified-button"
                          >
                            <Archive className="w-3 h-3 mr-1" />
                            Complete All
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 relative"
                          onClick={onShowCompletedModal}
                          title={`Completed Features (${completedCount})`}
                          data-testid="completed-features-button"
                        >
                          <Archive className="w-3.5 h-3.5 text-muted-foreground" />
                          {completedCount > 0 && (
                            <span className="absolute -top-1 -right-1 bg-brand-500 text-white text-[8px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center">
                              {completedCount > 99 ? '99+' : completedCount}
                            </span>
                          )}
                        </Button>
                      </div>
                    ) : column.id === 'backlog' ? (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="default"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={onAddFeature}
                          title="Add Feature"
                          data-testid="add-feature-button"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={`h-6 px-2 text-xs ${selectionTarget === 'backlog' ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground'}`}
                          onClick={() => onToggleSelectionMode?.('backlog')}
                          title={
                            selectionTarget === 'backlog'
                              ? 'Switch to Drag Mode'
                              : 'Select Multiple'
                          }
                          data-testid="selection-mode-button"
                        >
                          {selectionTarget === 'backlog' ? (
                            <>
                              <GripVertical className="w-3.5 h-3.5 mr-1" />
                              Drag
                            </>
                          ) : (
                            <>
                              <CheckSquare className="w-3.5 h-3.5 mr-1" />
                              Select
                            </>
                          )}
                        </Button>
                      </div>
                    ) : column.id === 'waiting_approval' ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className={`h-6 px-2 text-xs ${selectionTarget === 'waiting_approval' ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground'}`}
                        onClick={() => onToggleSelectionMode?.('waiting_approval')}
                        title={
                          selectionTarget === 'waiting_approval'
                            ? 'Switch to Drag Mode'
                            : 'Select Multiple'
                        }
                        data-testid="waiting-approval-selection-mode-button"
                      >
                        {selectionTarget === 'waiting_approval' ? (
                          <>
                            <GripVertical className="w-3.5 h-3.5 mr-1" />
                            Drag
                          </>
                        ) : (
                          <>
                            <CheckSquare className="w-3.5 h-3.5 mr-1" />
                            Select
                          </>
                        )}
                      </Button>
                    ) : column.id === 'in_progress' ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                        onClick={onOpenPipelineSettings}
                        title="Pipeline Settings"
                        data-testid="pipeline-settings-button"
                      >
                        <Settings2 className="w-3.5 h-3.5" />
                      </Button>
                    ) : column.isPipelineStep ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                        onClick={onOpenPipelineSettings}
                        title="Edit Pipeline Step"
                        data-testid="edit-pipeline-step-button"
                      >
                        <Settings2 className="w-3.5 h-3.5" />
                      </Button>
                    ) : undefined
                  }
                  footerAction={
                    column.id === 'backlog' ? (
                      <Button
                        variant="default"
                        size="sm"
                        className="w-full h-9 text-sm"
                        onClick={onAddFeature}
                        data-testid="add-feature-floating-button"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Add Feature
                        <span className="ml-auto pl-2 text-[10px] font-mono opacity-70 bg-black/20 px-1.5 py-0.5 rounded">
                          {formatShortcut(addFeatureShortcut, true)}
                        </span>
                      </Button>
                    ) : undefined
                  }
                >
                  {(() => {
                    const reduceEffects = shouldVirtualize;
                    const effectiveCardOpacity = reduceEffects
                      ? Math.min(backgroundSettings.cardOpacity, REDUCED_CARD_OPACITY_PERCENT)
                      : backgroundSettings.cardOpacity;
                    const effectiveGlassmorphism =
                      backgroundSettings.cardGlassmorphism && !reduceEffects;

                    return (
                      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
                        {/* Empty state card when column has no features */}
                        {columnFeatures.length === 0 && !isDragging && (
                          <EmptyStateCard
                            columnId={column.id}
                            columnTitle={column.title}
                            addFeatureShortcut={addFeatureShortcut}
                            isReadOnly={isReadOnly}
                            onAiSuggest={column.id === 'backlog' ? onAiSuggest : undefined}
                            opacity={effectiveCardOpacity}
                            glassmorphism={effectiveGlassmorphism}
                            customConfig={
                              column.isPipelineStep
                                ? {
                                    title: `${column.title} Empty`,
                                    description: `Features will appear here during the ${column.title.toLowerCase()} phase of the pipeline.`,
                                  }
                                : undefined
                            }
                          />
                        )}
                        {shouldVirtualize ? (
                          <div className="relative" style={{ height: totalHeight }}>
                            <div
                              className="absolute left-0 right-0"
                              style={{ transform: `translateY(${offsetTop}px)` }}
                            >
                              {visibleItems.map((feature, index) => {
                                const absoluteIndex = startIndex + index;
                                let shortcutKey: string | undefined;
                                if (column.id === 'in_progress' && absoluteIndex < 10) {
                                  shortcutKey =
                                    absoluteIndex === 9 ? '0' : String(absoluteIndex + 1);
                                }
                                return (
                                  <div
                                    key={feature.id}
                                    ref={registerItem(feature.id)}
                                    style={{ marginBottom: `${KANBAN_CARD_GAP_PX}px` }}
                                  >
                                    <KanbanCard
                                      feature={feature}
                                      onEdit={() => onEdit(feature)}
                                      onDelete={() => onDelete(feature.id)}
                                      onViewOutput={() => onViewOutput(feature)}
                                      onVerify={() => onVerify(feature)}
                                      onResume={() => onResume(feature)}
                                      onForceStop={() => onForceStop(feature)}
                                      onManualVerify={() => onManualVerify(feature)}
                                      onMoveBackToInProgress={() => onMoveBackToInProgress(feature)}
                                      onFollowUp={() => onFollowUp(feature)}
                                      onComplete={() => onComplete(feature)}
                                      onImplement={() => onImplement(feature)}
                                      onViewPlan={() => onViewPlan(feature)}
                                      onApprovePlan={() => onApprovePlan(feature)}
                                      onSpawnTask={() => onSpawnTask?.(feature)}
                                      hasContext={featuresWithContext.has(feature.id)}
                                      isCurrentAutoTask={runningAutoTasks.includes(feature.id)}
                                      shortcutKey={shortcutKey}
                                      opacity={effectiveCardOpacity}
                                      glassmorphism={effectiveGlassmorphism}
                                      cardBorderEnabled={backgroundSettings.cardBorderEnabled}
                                      cardBorderOpacity={backgroundSettings.cardBorderOpacity}
                                      reduceEffects={reduceEffects}
                                      isSelectionMode={isSelectionMode}
                                      selectionTarget={selectionTarget}
                                      isSelected={selectedFeatureIds.has(feature.id)}
                                      onToggleSelect={() => onToggleFeatureSelection?.(feature.id)}
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          columnFeatures.map((feature, index) => {
                            let shortcutKey: string | undefined;
                            if (column.id === 'in_progress' && index < 10) {
                              shortcutKey = index === 9 ? '0' : String(index + 1);
                            }
                            return (
                              <KanbanCard
                                key={feature.id}
                                feature={feature}
                                onEdit={() => onEdit(feature)}
                                onDelete={() => onDelete(feature.id)}
                                onViewOutput={() => onViewOutput(feature)}
                                onVerify={() => onVerify(feature)}
                                onResume={() => onResume(feature)}
                                onForceStop={() => onForceStop(feature)}
                                onManualVerify={() => onManualVerify(feature)}
                                onMoveBackToInProgress={() => onMoveBackToInProgress(feature)}
                                onFollowUp={() => onFollowUp(feature)}
                                onComplete={() => onComplete(feature)}
                                onImplement={() => onImplement(feature)}
                                onViewPlan={() => onViewPlan(feature)}
                                onApprovePlan={() => onApprovePlan(feature)}
                                onSpawnTask={() => onSpawnTask?.(feature)}
                                hasContext={featuresWithContext.has(feature.id)}
                                isCurrentAutoTask={runningAutoTasks.includes(feature.id)}
                                shortcutKey={shortcutKey}
                                opacity={effectiveCardOpacity}
                                glassmorphism={effectiveGlassmorphism}
                                cardBorderEnabled={backgroundSettings.cardBorderEnabled}
                                cardBorderOpacity={backgroundSettings.cardBorderOpacity}
                                reduceEffects={reduceEffects}
                                isSelectionMode={isSelectionMode}
                                selectionTarget={selectionTarget}
                                isSelected={selectedFeatureIds.has(feature.id)}
                                onToggleSelect={() => onToggleFeatureSelection?.(feature.id)}
                              />
                            );
                          })
                        )}
                      </SortableContext>
                    );
                  })()}
                </KanbanColumn>
              )}
            </VirtualizedList>
          );
        })}
      </div>

      <DragOverlay
        dropAnimation={{
          duration: 200,
          easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
        }}
      >
        {activeFeature && (
          <div style={{ width: `${columnWidth}px` }}>
            <KanbanCard
              feature={activeFeature}
              isOverlay
              onEdit={() => {}}
              onDelete={() => {}}
              onViewOutput={() => {}}
              onVerify={() => {}}
              onResume={() => {}}
              onForceStop={() => {}}
              onManualVerify={() => {}}
              onMoveBackToInProgress={() => {}}
              onFollowUp={() => {}}
              onImplement={() => {}}
              onComplete={() => {}}
              onViewPlan={() => {}}
              onApprovePlan={() => {}}
              onSpawnTask={() => {}}
              hasContext={featuresWithContext.has(activeFeature.id)}
              isCurrentAutoTask={runningAutoTasks.includes(activeFeature.id)}
              opacity={backgroundSettings.cardOpacity}
              glassmorphism={backgroundSettings.cardGlassmorphism}
              cardBorderEnabled={backgroundSettings.cardBorderEnabled}
              cardBorderOpacity={backgroundSettings.cardBorderOpacity}
            />
          </div>
        )}
      </DragOverlay>
    </div>
  );
}
