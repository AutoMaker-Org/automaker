import { useMemo } from 'react';
import { DndContext, DragOverlay } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Button } from '@/components/ui/button';
import { KanbanColumn, KanbanCard } from './components';
import { Feature, useAppStore, formatShortcut } from '@/store/app-store';
import { Archive, Settings2, CheckSquare, GripVertical, Plus } from 'lucide-react';
import { useResponsiveKanban } from '@/hooks/use-responsive-kanban';
import { getColumnsWithPipeline, type ColumnId } from './constants';
import type { PipelineConfig } from '@automaker/types';

interface KanbanBoardProps {
  sensors: any;
  collisionDetectionStrategy: (args: any) => any;
  onDragStart: (event: any) => void;
  onDragEnd: (event: any) => void;
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
  pipelineConfig: PipelineConfig | null;
  onOpenPipelineSettings?: () => void;
  // Selection mode props
  isSelectionMode?: boolean;
  selectedFeatureIds?: Set<string>;
  onToggleFeatureSelection?: (featureId: string) => void;
  onToggleSelectionMode?: () => void;
}

export function KanbanBoard({
  sensors,
  collisionDetectionStrategy,
  onDragStart,
  onDragEnd,
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
  pipelineConfig,
  onOpenPipelineSettings,
  isSelectionMode = false,
  selectedFeatureIds = new Set(),
  onToggleFeatureSelection,
  onToggleSelectionMode,
}: KanbanBoardProps) {
  // Generate columns including pipeline steps
  const columns = useMemo(() => getColumnsWithPipeline(pipelineConfig), [pipelineConfig]);

  // Get the keyboard shortcut for adding features
  const { keyboardShortcuts } = useAppStore();
  const addFeatureShortcut = keyboardShortcuts.addFeature || 'N';

  // Use responsive column widths based on window size
  // containerStyle handles centering and ensures columns fit without horizontal scroll in Electron
  const { columnWidth, containerStyle } = useResponsiveKanban(columns.length);

  return (
    <div className="flex-1 overflow-x-auto px-5 pt-4 pb-4 relative" style={backgroundImageStyle}>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetectionStrategy}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className="h-full py-1" style={containerStyle}>
          {columns.map((column) => {
            const columnFeatures = getColumnFeatures(column.id as ColumnId);
            return (
              <KanbanColumn
                key={column.id}
                id={column.id}
                title={column.title}
                colorClass={column.colorClass}
                count={columnFeatures.length}
                width={columnWidth}
                opacity={backgroundSettings.columnOpacity}
                showBorder={backgroundSettings.columnBorderEnabled}
                hideScrollbar={backgroundSettings.hideScrollbar}
                headerAction={
                  column.id === 'verified' && columnFeatures.length > 0 ? (
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
                        className={`h-6 px-2 text-xs ${isSelectionMode ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground'}`}
                        onClick={onToggleSelectionMode}
                        title={isSelectionMode ? 'Switch to Drag Mode' : 'Select Multiple'}
                        data-testid="selection-mode-button"
                      >
                        {isSelectionMode ? (
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
                <SortableContext
                  items={columnFeatures.map((f) => f.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {columnFeatures.map((feature, index) => {
                    // Calculate shortcut key for in-progress cards (first 10 get 1-9, 0)
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
                        opacity={backgroundSettings.cardOpacity}
                        glassmorphism={backgroundSettings.cardGlassmorphism}
                        cardBorderEnabled={backgroundSettings.cardBorderEnabled}
                        cardBorderOpacity={backgroundSettings.cardBorderOpacity}
                        isSelectionMode={isSelectionMode}
                        isSelected={selectedFeatureIds.has(feature.id)}
                        onToggleSelect={() => onToggleFeatureSelection?.(feature.id)}
                      />
                    );
                  })}
                </SortableContext>
              </KanbanColumn>
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
      </DndContext>
    </div>
  );
}
