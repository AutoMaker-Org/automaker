import { memo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

interface KanbanColumnProps {
  id: string;
  title: string;
  colorClass: string;
  columnClass?: string;
  count: number;
  children: ReactNode;
  headerAction?: ReactNode;
  opacity?: number;
  showBorder?: boolean;
  hideScrollbar?: boolean;
  /** Custom width in pixels. If not provided, defaults to 288px (w-72) */
  width?: number;
}

export const KanbanColumn = memo(function KanbanColumn({
  id,
  title,
  colorClass,
  columnClass,
  count,
  children,
  headerAction,
  opacity = 100,
  showBorder = true,
  hideScrollbar = false,
  width,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  // Use inline style for width if provided, otherwise use default w-72
  const widthStyle = width ? { width: `${width}px`, flexShrink: 0 } : undefined;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'relative flex flex-col h-full rounded-xl',
        // Only transition ring/shadow for drag-over effect, not width
        'transition-[box-shadow,ring] duration-200',
        !width && 'w-72', // Only apply w-72 if no custom width
        showBorder && 'border border-border/60',
        isOver && 'ring-2 ring-primary/30 ring-offset-1 ring-offset-background',
        columnClass
      )}
      style={widthStyle}
      data-testid={`kanban-column-${id}`}
    >
      {/* Background layer with opacity */}
      <div
        className={cn(
          'absolute inset-0 rounded-xl backdrop-blur-sm transition-colors duration-200',
          isOver ? 'bg-accent/80' : 'bg-card/80'
        )}
        style={{ opacity: opacity / 100 }}
      />

      {/* Column Header */}
      <div
        className={cn(
          'relative z-10 flex items-center gap-3 px-3 py-2.5',
          showBorder && 'border-b border-border/40'
        )}
      >
        <div className={cn('w-2.5 h-2.5 rounded-full shrink-0', colorClass)} />
        <h3 className="font-semibold text-sm text-foreground/90 flex-1 tracking-tight">{title}</h3>
        {headerAction}
        <span className="text-xs font-medium text-muted-foreground/80 bg-muted/50 px-2 py-0.5 rounded-md tabular-nums">
          {count}
        </span>
      </div>

      {/* Column Content */}
      <div
        className={cn(
          'relative z-10 flex-1 overflow-y-auto p-2 space-y-2.5',
          hideScrollbar &&
            '[&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]',
          // Smooth scrolling
          'scroll-smooth'
        )}
      >
        {children}
      </div>

      {/* Drop zone indicator when dragging over */}
      {isOver && (
        <div className="absolute inset-0 rounded-xl bg-primary/5 pointer-events-none z-5 border-2 border-dashed border-primary/20" />
      )}
    </div>
  );
});
