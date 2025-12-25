import { memo, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import { BEADS_COLUMNS, type BeadsColumnId } from './constants';
import { BeadsColumn } from './components/beads-column';
import { BeadsCard } from './components/beads-card';
import type { BeadsIssue } from '@automaker/types';
import { useAppStore } from '@/store/app-store';
import { useBoardBackgroundSettings } from '@/hooks/use-board-background-settings';
import { cn } from '@/lib/utils';

interface BeadsKanbanBoardProps {
  issues: BeadsIssue[];
  columnIssuesMap: Record<BeadsColumnId, BeadsIssue[]>;
  activeIssue: BeadsIssue | null;
  handleDragStart: (event: DragStartEvent) => void;
  handleDragEnd: (event: DragEndEvent) => void;
  onEditIssue: (issue: BeadsIssue) => void;
  onDeleteIssue: (issue: BeadsIssue) => void;
  onStartIssue: (issue: BeadsIssue) => void;
  onCloseIssue: (issue: BeadsIssue) => void;
}

export const BeadsKanbanBoard = memo(function BeadsKanbanBoard({
  issues,
  columnIssuesMap,
  activeIssue,
  handleDragStart,
  handleDragEnd,
  onEditIssue,
  onDeleteIssue,
  onStartIssue,
  onCloseIssue,
}: BeadsKanbanBoardProps) {
  const store = useAppStore();
  const bgSettings = useBoardBackgroundSettings();

  const projectPath = store.currentProject?.path;
  const settings = projectPath
    ? bgSettings.getCurrentSettings(projectPath)
    : {
        cardOpacity: 100,
        columnOpacity: 100,
        columnBorderEnabled: true,
        cardGlassmorphism: true,
        hideScrollbar: true,
      };

  const { cardOpacity, columnOpacity, columnBorderEnabled, cardGlassmorphism, hideScrollbar } =
    settings;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Memoize blocking counts to avoid O(n²) complexity on each render
  const blockingCountsMap = useMemo(() => {
    const map = new Map<string, { blockingCount: number; blockedCount: number }>();
    issues.forEach((issue) => {
      const blockingCount = issues.filter((otherIssue) =>
        otherIssue.dependencies?.some((dep) => dep.issueId === issue.id && dep.type === 'blocks')
      ).length;

      const blockedCount =
        issue.dependencies?.filter((dep) => {
          const depIssue = issues.find((i) => i.id === dep.issueId);
          return (
            dep.type === 'blocks' &&
            depIssue &&
            (depIssue.status === 'open' || depIssue.status === 'in_progress')
          );
        }).length || 0;

      map.set(issue.id, { blockingCount, blockedCount });
    });
    return map;
  }, [issues]);

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex-1 flex overflow-x-auto">
        <div className="flex gap-4 px-4 pb-4">
          {BEADS_COLUMNS.map((column) => {
            const columnIssues = columnIssuesMap[column.id];

            return (
              <BeadsColumn
                key={column.id}
                id={column.id}
                title={column.title}
                colorClass={column.colorClass}
                count={columnIssues.length}
                opacity={columnOpacity}
                showBorder={columnBorderEnabled}
                hideScrollbar={hideScrollbar}
                itemIds={columnIssues.map((i) => i.id)}
              >
                {columnIssues.map((issue) => {
                  const { blockingCount, blockedCount } = blockingCountsMap.get(issue.id) ?? {
                    blockingCount: 0,
                    blockedCount: 0,
                  };

                  return (
                    <BeadsCard
                      key={issue.id}
                      issue={issue}
                      blockingCount={blockingCount}
                      blockedCount={blockedCount}
                      onEdit={() => onEditIssue(issue)}
                      onDelete={() => onDeleteIssue(issue)}
                      onStart={() => onStartIssue(issue)}
                      onClose={() => onCloseIssue(issue)}
                    />
                  );
                })}
              </BeadsColumn>
            );
          })}
        </div>
      </div>

      {/* Drag Overlay */}
      <DragOverlay>
        {activeIssue ? (
          <div
            className={cn('w-72 opacity-80 rotate-2', cardGlassmorphism && 'backdrop-blur-sm')}
            style={{ opacity: cardOpacity / 100 }}
          >
            <BeadsCard issue={activeIssue} blockingCount={0} blockedCount={0} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
});
