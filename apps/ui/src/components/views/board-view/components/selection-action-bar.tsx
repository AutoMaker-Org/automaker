import { Button } from '@/components/ui/button';
import { Pencil, X, CheckSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SelectionActionBarProps {
  selectedCount: number;
  totalCount: number;
  onEdit: () => void;
  onClear: () => void;
  onSelectAll: () => void;
}

export function SelectionActionBar({
  selectedCount,
  totalCount,
  onEdit,
  onClear,
  onSelectAll,
}: SelectionActionBarProps) {
  if (selectedCount === 0) return null;

  const allSelected = selectedCount === totalCount;

  return (
    <div
      className={cn(
        'fixed bottom-6 left-1/2 -translate-x-1/2 z-50',
        'flex items-center gap-3 px-4 py-3 rounded-xl',
        'bg-background/95 backdrop-blur-sm border border-border shadow-lg',
        'animate-in slide-in-from-bottom-4 fade-in duration-200'
      )}
      data-testid="selection-action-bar"
    >
      <span className="text-sm font-medium text-foreground">
        {selectedCount} feature{selectedCount !== 1 ? 's' : ''} selected
      </span>

      <div className="h-4 w-px bg-border" />

      <div className="flex items-center gap-2">
        <Button
          variant="default"
          size="sm"
          onClick={onEdit}
          className="h-8 bg-brand-500 hover:bg-brand-600"
          data-testid="selection-edit-button"
        >
          <Pencil className="w-4 h-4 mr-1.5" />
          Edit Selected
        </Button>

        {!allSelected && (
          <Button
            variant="outline"
            size="sm"
            onClick={onSelectAll}
            className="h-8"
            data-testid="selection-select-all-button"
          >
            <CheckSquare className="w-4 h-4 mr-1.5" />
            Select All ({totalCount})
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="h-8 text-muted-foreground hover:text-foreground"
          data-testid="selection-clear-button"
        >
          <X className="w-4 h-4 mr-1.5" />
          Clear
        </Button>
      </div>
    </div>
  );
}
