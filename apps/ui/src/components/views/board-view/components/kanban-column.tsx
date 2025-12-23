import { memo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';
import { GlassPanel } from '@/components/ui/glass-panel';

interface KanbanColumnProps {
  id: string;
  title: string;
  accent: 'cyan' | 'blue' | 'orange' | 'green' | 'none';
  count: number;
  children: ReactNode;
  headerAction?: ReactNode;
  width?: number;
  // Legacy props ignored or used for compatibility
  colorClass?: string;
  opacity?: number;
  showBorder?: boolean;
  hideScrollbar?: boolean;
}

export const KanbanColumn = memo(function KanbanColumn({
  id,
  title,
  accent,
  count,
  children,
  headerAction,
  width,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  // Use inline style for width if provided, otherwise use default w-72
  const widthStyle = width ? { width: `${width}px`, flexShrink: 0 } : undefined;

  return (
    <GlassPanel
      ref={setNodeRef}
      accent={accent}
      className={cn(
        'relative flex flex-col h-full min-w-[300px] transition-[box-shadow,ring] duration-200',
        !width && 'w-72',
        isOver && 'ring-2 ring-primary/30 ring-offset-1 ring-offset-background'
      )}
      style={widthStyle}
      data-testid={`kanban-column-${id}`}
    >
      {/* Subtle Glow Top (Only for Blue/Orange/Green to match design, could make generic) */}
      {(accent === 'blue' || accent === 'orange' || accent === 'green') && (
        <div
          className={cn(
            'absolute top-0 left-0 w-full h-32 bg-gradient-to-b pointer-events-none rounded-t-2xl',
            accent === 'blue' && 'from-brand-blue/10 to-transparent',
            accent === 'orange' && 'from-brand-orange/10 to-transparent',
            accent === 'green' && 'from-brand-green/10 to-transparent'
          )}
        ></div>
      )}

      {/* Column Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/5 relative z-10">
        <div className="flex items-center gap-2">
          {/* Status Dot */}
          <div
            className={cn(
              'w-2 h-2 rounded-full',
              accent === 'cyan' && 'bg-slate-400', // Backlog is neutral in design
              accent === 'blue' && 'bg-brand-orange shadow-glow-orange', // In Progress has orange dot in design
              accent === 'orange' && 'bg-brand-orange shadow-glow-orange',
              accent === 'green' && 'bg-brand-green shadow-glow-green'
            )}
          ></div>
          <span className="font-bold text-slate-200 text-sm">{title}</span>

          {/* Action container (like "Make") */}
          {headerAction}
        </div>

        {/* Count Badge */}
        <span className="text-[10px] bg-dark-700 text-slate-400 px-2 py-0.5 rounded border border-white/5 font-medium">
          {count}
        </span>
      </div>

      {/* Column Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar relative z-10">
        {children}
      </div>

      {/* Drop zone indicator when dragging over */}
      {isOver && (
        <div className="absolute inset-0 rounded-2xl bg-white/5 pointer-events-none z-20 border-2 border-dashed border-white/10" />
      )}
    </GlassPanel>
  );
});
