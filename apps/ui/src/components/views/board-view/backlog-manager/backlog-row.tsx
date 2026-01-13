import { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import { Tag, X, Edit, Trash2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CategoryAutocomplete } from '@/components/ui/category-autocomplete';
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import { cn } from '@/lib/utils';
import { Feature } from '@/store/app-store';

/**
 * Props for the BacklogRow component
 */
export interface BacklogRowProps {
  /** The feature to display */
  feature: Feature;
  /** Whether this row is selected */
  isSelected: boolean;
  /** Callback when selection checkbox is toggled */
  onSelect: () => void;
  /** Callback when category is changed */
  onCategoryChange: (featureId: string, category: string) => Promise<void>;
  /** Available categories for autocomplete suggestions */
  availableCategories: string[];
  /** Optional callback when row is clicked (for future expansion) */
  onRowClick?: (feature: Feature) => void;
  /** Callback when edit button is clicked */
  onEdit?: (feature: Feature) => void;
  /** Callback when delete button is clicked */
  onDelete?: (feature: Feature) => void;
}

/**
 * BacklogRow - A table row component for displaying a single backlog item
 *
 * Features:
 * - Selection checkbox
 * - Title and description display (with truncation)
 * - Inline category editing via click-to-edit pattern
 * - Visual feedback for selected state
 * - Keyboard navigation support (Escape to cancel edit)
 *
 * The inline category editing allows users to:
 * 1. Click on the category badge/placeholder to enter edit mode
 * 2. Select from existing categories or create new ones
 * 3. Changes are saved immediately when selected
 * 4. Press Escape or click Cancel to discard changes
 */
export function BacklogRow({
  feature,
  isSelected,
  onSelect,
  onCategoryChange,
  availableCategories,
  onRowClick,
  onEdit,
  onDelete,
}: BacklogRowProps) {
  // Edit mode state for inline category editing
  const [isEditingCategory, setIsEditingCategory] = useState(false);
  const [editingCategoryValue, setEditingCategoryValue] = useState(feature.category || '');
  const [isSaving, setIsSaving] = useState(false);
  const categoryEditRef = useRef<HTMLDivElement>(null);

  // Delete confirmation dialog state
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // Handle row click (but not on interactive elements)
  const handleRowClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      // Don't trigger row click if clicking on checkbox, buttons, or category editor
      if (
        target.closest('button') ||
        target.closest('[role="checkbox"]') ||
        target.closest('input') ||
        target.closest('[data-category-editor]')
      ) {
        return;
      }
      onRowClick?.(feature);
    },
    [feature, onRowClick]
  );

  // Handle checkbox click (prevent row click propagation)
  const handleCheckboxClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  // Enter category edit mode
  const handleStartCategoryEdit = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setEditingCategoryValue(feature.category || '');
      setIsEditingCategory(true);
    },
    [feature.category]
  );

  // Save category change
  const handleSaveCategory = useCallback(async () => {
    if (isSaving) return;

    // Only save if value changed
    if (editingCategoryValue !== (feature.category || '')) {
      setIsSaving(true);
      try {
        await onCategoryChange(feature.id, editingCategoryValue);
      } catch (error) {
        // Reset to original value on error
        setEditingCategoryValue(feature.category || '');
      } finally {
        setIsSaving(false);
      }
    }
    setIsEditingCategory(false);
  }, [editingCategoryValue, feature.category, feature.id, onCategoryChange, isSaving]);

  // Cancel category edit
  const handleCancelCategoryEdit = useCallback(() => {
    setEditingCategoryValue(feature.category || '');
    setIsEditingCategory(false);
  }, [feature.category]);

  // Auto-save when a category is selected (blur or selection)
  const handleCategorySelect = useCallback(
    async (value: string) => {
      setEditingCategoryValue(value);
      // Only save if value changed
      if (value !== (feature.category || '')) {
        setIsSaving(true);
        try {
          await onCategoryChange(feature.id, value);
        } catch (error) {
          // Reset to original value on error
          setEditingCategoryValue(feature.category || '');
        } finally {
          setIsSaving(false);
        }
      }
      setIsEditingCategory(false);
    },
    [feature.category, feature.id, onCategoryChange]
  );

  // Handle keyboard events for edit mode
  useEffect(() => {
    if (!isEditingCategory) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancelCategoryEdit();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isEditingCategory, handleCancelCategoryEdit]);

  // Click outside to save
  useEffect(() => {
    if (!isEditingCategory) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Check if click is outside the category editor area
      if (categoryEditRef.current && !categoryEditRef.current.contains(target)) {
        // Check if click is inside a popover (autocomplete dropdown)
        if (!target.closest('[data-radix-popper-content-wrapper]')) {
          handleSaveCategory();
        }
      }
    };

    // Delay adding the listener to avoid immediate trigger
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isEditingCategory, handleSaveCategory]);

  // Truncate description for display
  const truncatedDescription = useMemo(() => {
    const desc = feature.description || '';
    if (desc.length <= 150) return desc;
    return desc.slice(0, 150).trim() + '...';
  }, [feature.description]);

  // Display title or placeholder
  const displayTitle = feature.title?.trim() || '(No title)';
  const hasTitle = Boolean(feature.title?.trim());

  return (
    <tr
      className={cn(
        'border-b border-border/50 transition-colors',
        'hover:bg-accent/50',
        isSelected && 'bg-accent/70',
        onRowClick && 'cursor-pointer'
      )}
      onClick={handleRowClick}
      data-testid={`backlog-row-${feature.id}`}
      data-feature-id={feature.id}
    >
      {/* Selection checkbox */}
      <td className="w-12 px-3 py-3" onClick={handleCheckboxClick}>
        <Checkbox
          checked={isSelected}
          onCheckedChange={onSelect}
          aria-label={`Select ${displayTitle}`}
          data-testid={`select-checkbox-${feature.id}`}
        />
      </td>

      {/* Title */}
      <td className="px-3 py-3 min-w-[200px]">
        <span
          className={cn(
            'text-sm font-medium line-clamp-2',
            !hasTitle && 'text-muted-foreground italic'
          )}
          title={feature.title || undefined}
        >
          {displayTitle}
        </span>
      </td>

      {/* Description */}
      <td className="px-3 py-3">
        <p
          className={cn(
            'text-sm text-muted-foreground line-clamp-2',
            !feature.description && 'italic'
          )}
          title={feature.description || undefined}
        >
          {truncatedDescription || '(No description)'}
        </p>
      </td>

      {/* Category - Inline editable */}
      <td className="px-3 py-3 w-40" data-category-editor>
        {isEditingCategory ? (
          <div
            ref={categoryEditRef}
            className="flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <CategoryAutocomplete
              value={editingCategoryValue}
              onChange={handleCategorySelect}
              suggestions={availableCategories}
              placeholder="Select category..."
              className="h-8 text-xs min-w-[120px]"
              disabled={isSaving}
              data-testid={`category-editor-${feature.id}`}
            />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={handleCancelCategoryEdit}
              disabled={isSaving}
              aria-label="Cancel category edit"
              data-testid={`cancel-category-${feature.id}`}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <button
            type="button"
            className={cn(
              'inline-flex items-center gap-1 rounded px-2 py-1 text-xs',
              'hover:bg-accent/50 transition-colors',
              'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
              feature.category ? 'text-foreground' : 'text-muted-foreground italic'
            )}
            onClick={handleStartCategoryEdit}
            aria-label={`Edit category for ${displayTitle}`}
            data-testid={`category-button-${feature.id}`}
          >
            {feature.category ? (
              <Badge variant="outline" size="sm" className="max-w-full truncate">
                {feature.category}
              </Badge>
            ) : (
              <>
                <Tag className="h-3 w-3" />
                <span>Add category</span>
              </>
            )}
          </button>
        )}
      </td>

      {/* Actions column */}
      <td className="w-40 px-3 py-3">
        <div className="flex items-center justify-end gap-1.5">
          {onEdit && (
            <Button
              variant="secondary"
              size="sm"
              className="h-7 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(feature);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              data-testid={`edit-backlog-${feature.id}`}
            >
              <Edit className="w-3 h-3 mr-1" />
              Edit
            </Button>
          )}
          {onDelete && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              onClick={(e) => {
                e.stopPropagation();
                setIsDeleteDialogOpen(true);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              data-testid={`delete-backlog-${feature.id}`}
            >
              <Trash2 className="w-3 h-3 mr-1" />
              Delete
            </Button>
          )}
        </div>

        {/* Delete Confirmation Dialog */}
        <DeleteConfirmDialog
          open={isDeleteDialogOpen}
          onOpenChange={setIsDeleteDialogOpen}
          onConfirm={() => onDelete?.(feature)}
          title="Delete Feature"
          description="Are you sure you want to delete this feature? This action cannot be undone."
          testId={`delete-dialog-${feature.id}`}
          confirmTestId={`confirm-delete-${feature.id}`}
        />
      </td>
    </tr>
  );
}
