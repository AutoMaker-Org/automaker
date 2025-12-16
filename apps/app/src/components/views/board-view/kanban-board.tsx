"use client";

import {
  DndContext,
  DragOverlay,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HotkeyButton } from "@/components/ui/hotkey-button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { KanbanColumn, KanbanCard } from "./components";
import { Feature } from "@/store/app-store";
import { FastForward, Lightbulb, Trash2 } from "lucide-react";
import { useKeyboardShortcutsConfig } from "@/hooks/use-keyboard-shortcuts";
import { COLUMNS, ColumnId } from "./constants";

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
  featuresWithContext: Set<string>;
  runningAutoTasks: string[];
  shortcuts: ReturnType<typeof useKeyboardShortcutsConfig>;
  onStartNextFeatures: () => void;
  onShowSuggestions: () => void;
  suggestionsCount: number;
  onDeleteAllVerified: () => void;
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
  featuresWithContext,
  runningAutoTasks,
  shortcuts,
  onStartNextFeatures,
  onShowSuggestions,
  suggestionsCount,
  onDeleteAllVerified,
}: KanbanBoardProps) {
  return (
    <div
      className="flex-1 overflow-x-auto px-4 pb-4 relative"
      style={backgroundImageStyle}
    >
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetectionStrategy}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className="flex gap-5 h-full min-w-max py-1">
          {COLUMNS.map((column) => {
            const columnFeatures = getColumnFeatures(column.id);
            return (
              <KanbanColumn
                key={column.id}
                id={column.id}
                title={column.title}
                colorClass={column.colorClass}
                count={columnFeatures.length}
                opacity={backgroundSettings.columnOpacity}
                showBorder={backgroundSettings.columnBorderEnabled}
                hideScrollbar={backgroundSettings.hideScrollbar}
                headerAction={
                  column.id === "verified" &&
                  columnFeatures.length > 0 ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={onDeleteAllVerified}
                      data-testid="delete-all-verified-button"
                    >
                      <Trash2 className="w-3 h-3 mr-1" />
                      Delete All
                    </Button>
                  ) : column.id === "backlog" ? (
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
                    if (column.id === "in_progress" && index < 10) {
                      shortcutKey =
                        index === 9 ? "0" : String(index + 1);
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
                        onMoveBackToInProgress={() =>
                          onMoveBackToInProgress(feature)
                        }
                        onFollowUp={() => onFollowUp(feature)}
                        onCommit={() => onCommit(feature)}
                        onComplete={() => onComplete(feature)}
                        onImplement={() => onImplement(feature)}
                        hasContext={featuresWithContext.has(feature.id)}
                        isCurrentAutoTask={runningAutoTasks.includes(
                          feature.id
                        )}
                        shortcutKey={shortcutKey}
                        opacity={backgroundSettings.cardOpacity}
                        glassmorphism={
                          backgroundSettings.cardGlassmorphism
                        }
                        cardBorderEnabled={
                          backgroundSettings.cardBorderEnabled
                        }
                        cardBorderOpacity={
                          backgroundSettings.cardBorderOpacity
                        }
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
            easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)",
          }}
        >
          {activeFeature && (
            <Card className="w-72 rotate-2 shadow-2xl shadow-black/25 border-primary/50 bg-card/95 backdrop-blur-sm transition-transform">
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
