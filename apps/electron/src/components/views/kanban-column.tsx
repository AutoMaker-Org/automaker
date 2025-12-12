"use client";

import { memo } from "react";
import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface KanbanColumnProps {
  id: string;
  title: string;
  color: string;
  count: number;
  children: ReactNode;
  headerAction?: ReactNode;
}

export const KanbanColumn = memo(function KanbanColumn({
  id,
  title,
  color,
  count,
  children,
  headerAction,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col h-full rounded-lg bg-card backdrop-blur-sm border border-border transition-colors w-72",
        isOver && "bg-accent"
      )}
      data-testid={`kanban-column-${id}`}
    >
      {/* Column Header */}
      <div className="flex items-center gap-2 p-3 border-b border-border">
        <div className={cn("w-3 h-3 rounded-full", color)} />
        <h3 className="font-medium text-sm flex-1">{title}</h3>
        {headerAction}
        <span className="text-xs text-muted-foreground bg-background px-2 py-0.5 rounded-full">
          {count}
        </span>
      </div>

      {/* Column Content */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {children}
      </div>
    </div>
  );
});
