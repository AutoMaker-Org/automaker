import { DndContext, DragOverlay } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { HotkeyButton } from '@/components/ui/hotkey-button';
import { KanbanColumn, KanbanCard } from './components';
import { Feature } from '@/store/app-store';
import { FastForward, Lightbulb, Archive } from 'lucide-react';
import { useKeyboardShortcutsConfig } from '@/hooks/use-keyboard-shortcuts';
import { useResponsiveKanban } from '@/hooks/use-responsive-kanban';
import { COLUMNS, ColumnId } from './constants';

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
  onCommit: (feature: Feature) => void;
  onComplete: (feature: Feature) => void;
  onImplement: (feature: Feature) => void;
  onViewPlan: (feature: Feature) => void;
  onApprovePlan: (feature: Feature) => void;
  onSpawnTask?: (feature: Feature) => void;
  onStageChanges?: (feature: Feature) => void;
  featuresWithContext: Set<string>;
  runningAutoTasks: string[];
  shortcuts: ReturnType<typeof useKeyboardShortcutsConfig>;
  onStartNextFeatures: () => void;
  onShowSuggestions: () => void;
  suggestionsCount: number;
  onArchiveAllVerified: () => void;
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
  onCommit,
  onComplete,
  onImplement,
  onViewPlan,
  onApprovePlan,
  onSpawnTask,
  onStageChanges,
  featuresWithContext,
  runningAutoTasks,
  shortcuts,
  onStartNextFeatures,
  onShowSuggestions,
  suggestionsCount,
  onArchiveAllVerified,
}: KanbanBoardProps) {
  // Use responsive column widths based on window size
  // containerStyle handles centering and ensures columns fit without horizontal scroll in Electron
  const { columnWidth, containerStyle } = useResponsiveKanban(COLUMNS.length);

  return (
    <div className="flex-1 overflow-x-hidden px-5 pb-4 relative" style={backgroundImageStyle}>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetectionStrategy}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className="h-full py-1" style={containerStyle}>
          {COLUMNS.map((column) => {
            const columnFeatures = getColumnFeatures(column.id);
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
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-yellow-500 hover:text-yellow-400 hover:bg-yellow-500/10 relative"
                        onClick={onShowSuggestions}
                        title="Feature Suggestions"
                        data-testid="feature-suggestions-button"
                      >
                        <Lightbulb className="w-3.5 h-3.5" />
                        {suggestionsCount > 0 && (
                          <span
                            className="absolute -top-1 -right-1 w-4 h-4 text-[9px] font-mono rounded-full bg-yellow-500 text-black flex items-center justify-center"
                            data-testid="suggestions-count"
                          >
                            {suggestionsCount}
                          </span>
                        )}
                      </Button>
                      {columnFeatures.length > 0 && (
                        <HotkeyButton
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs text-primary hover:text-primary hover:bg-primary/10"
                          onClick={onStartNextFeatures}
                          hotkey={shortcuts.startNext}
                          hotkeyActive={false}
                          data-testid="start-next-button"
                        >
                          <FastForward className="w-3 h-3 mr-1" />
                          Make
                        </HotkeyButton>
                      )}
                    </div>
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
                        onStageChanges={() => onStageChanges?.(feature)}
                        hasContext={featuresWithContext.has(feature.id)}
                        hasWorktree={!!feature.branchName}
                        isCurrentAutoTask={runningAutoTasks.includes(feature.id)}
                        shortcutKey={shortcutKey}
                        opacity={backgroundSettings.cardOpacity}
                        glassmorphism={backgroundSettings.cardGlassmorphism}
                        cardBorderEnabled={backgroundSettings.cardBorderEnabled}
                        cardBorderOpacity={backgroundSettings.cardBorderOpacity}
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
            <Card
              className="rotate-2 shadow-2xl shadow-black/25 border-primary/50 bg-card/95 backdrop-blur-sm transition-transform"
              style={{ width: `${columnWidth}px` }}
            >
              <CardHeader className="p-3">
                <CardTitle className="text-sm font-medium line-clamp-2">
                  {activeFeature.description}
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  {activeFeature.category}
                </CardDescription>
              </CardHeader>
            </Card>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
