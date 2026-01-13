import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Pencil, X, CheckSquare, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface SelectionActionBarProps {
  selectedCount: number;
  totalCount: number;
  onEdit: () => void;
  onDelete: () => void;
  onClear: () => void;
  onSelectAll: () => void;
}

export function SelectionActionBar({
  selectedCount,
  totalCount,
  onEdit,
  onDelete,
  onClear,
  onSelectAll,
}: SelectionActionBarProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  if (selectedCount === 0) return null;

  const allSelected = selectedCount === totalCount;

  const handleDeleteClick = () => {
    setShowDeleteDialog(true);
  };

  const handleConfirmDelete = () => {
    setShowDeleteDialog(false);
    onDelete();
  };

  return (
    <>
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

          <Button
            variant="outline"
            size="sm"
            onClick={handleDeleteClick}
            className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
            data-testid="selection-delete-button"
          >
            <Trash2 className="w-4 h-4 mr-1.5" />
            Delete
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

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent data-testid="bulk-delete-confirmation-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" />
              Delete Selected Features?
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete {selectedCount} feature
              {selectedCount !== 1 ? 's' : ''}?
              <span className="block mt-2 text-destructive font-medium">
                This action cannot be undone.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setShowDeleteDialog(false)}
              data-testid="cancel-bulk-delete-button"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              data-testid="confirm-bulk-delete-button"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
