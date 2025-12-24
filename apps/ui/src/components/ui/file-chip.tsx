/**
 * FileChip Component
 *
 * Displays a file reference as a compact chip/badge with icon and remove button.
 * Used in the description field to show selected file mentions.
 */

import { X, FileText, FolderOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FileReference } from '@/lib/file-mention-utils';
import { getFileName, getFileIconType } from '@/lib/file-mention-utils';

interface FileChipProps {
  /** The file reference to display */
  file: FileReference;
  /** Called when the remove button is clicked */
  onRemove: () => void;
  /** Called when Ctrl+Click to open in editor */
  onOpenInEditor?: () => void;
  /** Whether the chip is disabled */
  disabled?: boolean;
  /** Additional class names */
  className?: string;
}

/**
 * Get the appropriate icon component for a file type
 */
function FileIcon({ className }: { className?: string }) {
  // For now, use a simple file icon - could be extended with specific icons
  return <FileText className={cn('h-3 w-3', className)} />;
}

export function FileChip({
  file,
  onRemove,
  onOpenInEditor,
  disabled = false,
  className,
}: FileChipProps) {
  const fileName = getFileName(file.relativePath);
  const _iconType = getFileIconType(file.extension); // Reserved for future icon customization
  const isExternal = file.type === 'external';

  const handleClick = (e: React.MouseEvent) => {
    if ((e.ctrlKey || e.metaKey) && onOpenInEditor) {
      e.preventDefault();
      e.stopPropagation();
      onOpenInEditor();
    }
  };

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs',
        'bg-muted/80 border border-border/50',
        'hover:bg-muted hover:border-border transition-colors',
        'max-w-[200px] group',
        onOpenInEditor && 'cursor-pointer',
        className
      )}
      onClick={handleClick}
      title={`${isExternal ? `${file.projectName}:${file.relativePath}` : file.relativePath}${onOpenInEditor ? ' (Ctrl+Click to open)' : ''}`}
    >
      {/* Project folder icon for external files */}
      {isExternal && (
        <>
          <FolderOpen className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground truncate max-w-[60px]">{file.projectName}</span>
          <span className="text-muted-foreground/50">›</span>
        </>
      )}

      {/* File icon */}
      <FileIcon className="text-muted-foreground shrink-0" />

      {/* File name */}
      <span className="truncate text-foreground">{fileName}</span>

      {/* Remove button */}
      {!disabled && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className={cn(
            'ml-0.5 p-0.5 rounded-sm',
            'text-muted-foreground hover:text-foreground',
            'hover:bg-destructive/20 hover:text-destructive',
            'opacity-0 group-hover:opacity-100 transition-opacity',
            'focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-ring'
          )}
          aria-label={`Remove ${fileName}`}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

interface FileChipListProps {
  /** List of file references to display */
  files: FileReference[];
  /** Called when a file is removed */
  onRemove: (fileId: string) => void;
  /** Called when all files should be cleared */
  onClearAll?: () => void;
  /** Called when Ctrl+Click to open file in editor */
  onOpenInEditor?: (file: FileReference) => void;
  /** Whether the list is disabled */
  disabled?: boolean;
  /** Additional class names */
  className?: string;
}

export function FileChipList({
  files,
  onRemove,
  onClearAll,
  onOpenInEditor,
  disabled = false,
  className,
}: FileChipListProps) {
  if (files.length === 0) {
    return null;
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-foreground">
          {files.length} file{files.length > 1 ? 's' : ''} referenced
        </p>
        {onClearAll && !disabled && (
          <button
            type="button"
            onClick={onClearAll}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear all
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {files.map((file) => (
          <FileChip
            key={file.id}
            file={file}
            onRemove={() => onRemove(file.id)}
            onOpenInEditor={onOpenInEditor ? () => onOpenInEditor(file) : undefined}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  );
}
