import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Folder, Check, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SortableProjectItemProps } from '../types';

export function SortableProjectItem({
  project,
  currentProjectId,
  isHighlighted,
  onSelect,
}: SortableProjectItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: project.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-all duration-200',
        'text-muted-foreground hover:text-foreground hover:bg-accent/80',
        isDragging && 'bg-accent shadow-lg scale-[1.02]',
        isHighlighted && 'bg-brand-500/10 text-foreground ring-1 ring-brand-500/20'
      )}
      data-testid={`project-option-${project.id}`}
      onClick={() => onSelect(project)}
    >
      {/* Drag Handle */}
      <button
        {...attributes}
        {...listeners}
        className="p-0.5 rounded-md hover:bg-accent/50 cursor-grab active:cursor-grabbing transition-colors"
        data-testid={`project-drag-handle-${project.id}`}
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground/60" />
      </button>

      {/* Project content */}
      <div className="flex items-center gap-2.5 flex-1 min-w-0">
        <Folder
          className={cn(
            'h-4 w-4 shrink-0',
            currentProjectId === project.id ? 'text-brand-500' : 'text-muted-foreground'
          )}
        />
        <span className="flex-1 truncate text-sm font-medium">{project.name}</span>
        {currentProjectId === project.id && <Check className="h-4 w-4 text-brand-500 shrink-0" />}
      </div>
    </div>
  );
}
