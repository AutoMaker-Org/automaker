/**
 * FileMentionPopover Component
 *
 * A floating popover that shows file/project suggestions when user types @ or @@.
 * Supports keyboard navigation, fuzzy search, and file type icons.
 */

import { useRef, useEffect } from 'react';
import { FileText, FolderOpen, Loader2, ArrowLeft, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Project } from '@/lib/electron';
import type { FileItem } from '@/lib/file-mention-utils';
import { getFileName, getParentPath, formatFileSize } from '@/lib/file-mention-utils';
import type { MentionMode } from '@/hooks/use-file-mention';

interface FileMentionPopoverProps {
  /** Whether the popover is visible */
  isOpen: boolean;
  /** Current mode: files or projects */
  mode: MentionMode;
  /** Search query string */
  searchQuery: string;
  /** List of files to display */
  files: FileItem[];
  /** List of projects to display (for @@ mode) */
  projects: Project[];
  /** Currently selected project (for @@ file mode) */
  selectedProject: Project | null;
  /** Index of the highlighted item */
  selectedIndex: number;
  /** Whether files are loading */
  isLoading: boolean;
  /** Error message */
  error: string | null;
  /** Callback when a file is selected */
  onSelectFile: (file: FileItem) => void;
  /** Callback when a project is selected */
  onSelectProject: (project: Project) => void;
  /** Callback to go back to projects list */
  onBack: () => void;
  /** Callback to close the popover */
  onClose: () => void;
  /** Callback to open file in editor */
  onOpenInEditor: (file: FileItem) => void;
  /** Additional class names */
  className?: string;
}

export function FileMentionPopover({
  isOpen,
  mode,
  searchQuery,
  files,
  projects,
  selectedProject,
  selectedIndex,
  isLoading,
  error,
  onSelectFile,
  onSelectProject,
  onBack,
  onClose: _onClose,
  onOpenInEditor,
  className,
}: FileMentionPopoverProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLDivElement>(null);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedRef.current && listRef.current) {
      selectedRef.current.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  const showBackButton = mode === 'files' && selectedProject !== null;
  const items = mode === 'projects' ? projects : files;
  const isEmpty = items.length === 0;

  return (
    <div
      className={cn(
        'absolute z-50 w-[400px] max-h-[300px] overflow-hidden',
        'bg-popover border border-border rounded-lg shadow-lg',
        'flex flex-col',
        className
      )}
      data-testid="file-mention-popover"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
        {showBackButton && (
          <button
            type="button"
            onClick={onBack}
            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title="Back to projects"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}

        {mode === 'projects' ? (
          <span className="text-sm font-medium text-muted-foreground">Select Project</span>
        ) : selectedProject ? (
          <div className="flex items-center gap-1.5 text-sm">
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium text-foreground">{selectedProject.name}</span>
            <span className="text-muted-foreground">›</span>
            <span className="text-muted-foreground">Search files</span>
          </div>
        ) : (
          <span className="text-sm font-medium text-muted-foreground">Current Project</span>
        )}

        {searchQuery && (
          <div className="flex items-center gap-1 ml-auto text-xs text-muted-foreground">
            <Search className="h-3 w-3" />
            <span className="truncate max-w-[100px]">{searchQuery}</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div ref={listRef} className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading files...</span>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-8 px-4">
            <span className="text-sm text-destructive">{error}</span>
          </div>
        ) : isEmpty ? (
          <div className="flex items-center justify-center py-8 px-4">
            <span className="text-sm text-muted-foreground">
              {mode === 'projects'
                ? 'No other projects found'
                : searchQuery
                  ? 'No files match your search'
                  : 'No files found'}
            </span>
          </div>
        ) : mode === 'projects' ? (
          // Projects list
          <div className="py-1">
            {projects.map((project, index) => (
              <div
                key={project.id}
                ref={index === selectedIndex ? selectedRef : null}
                onClick={() => onSelectProject(project)}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 cursor-pointer',
                  'transition-colors',
                  index === selectedIndex
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-accent/50'
                )}
                data-testid={`project-item-${project.id}`}
              >
                <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{project.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{project.path}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          // Files list
          <div className="py-1">
            {files.map((file, index) => {
              const fileName = getFileName(file.relativePath);
              const parentPath = getParentPath(file.relativePath);

              return (
                <div
                  key={file.relativePath}
                  ref={index === selectedIndex ? selectedRef : null}
                  onClick={(e) => {
                    if (e.ctrlKey || e.metaKey) {
                      // Ctrl+Click: open in editor, don't select
                      e.preventDefault();
                      e.stopPropagation();
                      onOpenInEditor(file);
                    } else {
                      // Normal click: select file
                      onSelectFile(file);
                    }
                  }}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 cursor-pointer',
                    'transition-colors',
                    index === selectedIndex
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-accent/50'
                  )}
                  data-testid={`file-item-${index}`}
                >
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">
                      <span className="font-medium">{fileName}</span>
                      {parentPath && (
                        <span className="text-muted-foreground ml-1.5 text-xs">{parentPath}</span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatFileSize(file.size)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer with keyboard hints */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-t border-border bg-muted/30 text-[10px] text-muted-foreground">
        <span>
          <kbd className="px-1 py-0.5 bg-muted rounded text-[9px]">↑↓</kbd> Navigate
        </span>
        <span>
          <kbd className="px-1 py-0.5 bg-muted rounded text-[9px]">Enter</kbd> Select
        </span>
        {mode === 'files' && (
          <span>
            <kbd className="px-1 py-0.5 bg-muted rounded text-[9px]">Ctrl+Click</kbd> Open
          </span>
        )}
        <span>
          <kbd className="px-1 py-0.5 bg-muted rounded text-[9px]">`</kbd> Close
        </span>
      </div>
    </div>
  );
}
