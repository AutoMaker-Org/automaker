import { useState, useRef, useEffect, useCallback } from 'react';
import {
  File,
  Folder,
  FolderOpen,
  FolderPlus,
  FilePlus,
  ChevronRight,
  ChevronDown,
  Trash2,
  Pencil,
  Eye,
  EyeOff,
  RefreshCw,
  MoreVertical,
  Copy,
  ClipboardCopy,
  FolderInput,
  FolderOutput,
  Download,
  Plus,
  Minus,
  AlertTriangle,
  GripVertical,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useFileEditorStore, type FileTreeNode } from '../use-file-editor-store';

interface FileTreeProps {
  onFileSelect: (path: string) => void;
  onCreateFile: (parentPath: string, name: string) => Promise<void>;
  onCreateFolder: (parentPath: string, name: string) => Promise<void>;
  onDeleteItem: (path: string, isDirectory: boolean) => Promise<void>;
  onRenameItem: (oldPath: string, newName: string) => Promise<void>;
  onCopyPath: (path: string) => void;
  onRefresh: () => void;
  onToggleFolder: (path: string) => void;
  activeFilePath: string | null;
  onCopyItem?: (sourcePath: string, destinationPath: string) => Promise<void>;
  onMoveItem?: (sourcePath: string, destinationPath: string) => Promise<void>;
  onDownloadItem?: (filePath: string) => Promise<void>;
  onDragDropMove?: (sourcePaths: string[], targetFolderPath: string) => Promise<void>;
  effectivePath?: string;
}

/** Get a color class for git status */
function getGitStatusColor(status: string | undefined): string {
  if (!status) return '';
  switch (status) {
    case 'M':
      return 'text-yellow-500'; // modified
    case 'A':
      return 'text-green-500'; // added/staged
    case 'D':
      return 'text-red-500'; // deleted
    case '?':
      return 'text-gray-400'; // untracked
    case '!':
      return 'text-gray-600'; // ignored
    case 'S':
      return 'text-blue-500'; // staged
    case 'R':
      return 'text-purple-500'; // renamed
    case 'C':
      return 'text-cyan-500'; // copied
    case 'U':
      return 'text-orange-500'; // conflicted
    default:
      return 'text-muted-foreground';
  }
}

/** Get a status label for git status */
function getGitStatusLabel(status: string | undefined): string {
  if (!status) return '';
  switch (status) {
    case 'M':
      return 'Modified';
    case 'A':
      return 'Added';
    case 'D':
      return 'Deleted';
    case '?':
      return 'Untracked';
    case '!':
      return 'Ignored';
    case 'S':
      return 'Staged';
    case 'R':
      return 'Renamed';
    case 'C':
      return 'Copied';
    case 'U':
      return 'Conflicted';
    default:
      return status;
  }
}

/** Inline input for creating/renaming items */
function InlineInput({
  defaultValue,
  onSubmit,
  onCancel,
  placeholder,
}: {
  defaultValue?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
  placeholder?: string;
}) {
  const [value, setValue] = useState(defaultValue || '');
  const inputRef = useRef<HTMLInputElement>(null);
  // Guard against double-submission: pressing Enter triggers onKeyDown AND may
  // immediately trigger onBlur (e.g. when the component unmounts after submit).
  const submittedRef = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
    if (defaultValue) {
      // Select name without extension for rename
      const dotIndex = defaultValue.lastIndexOf('.');
      if (dotIndex > 0) {
        inputRef.current?.setSelectionRange(0, dotIndex);
      } else {
        inputRef.current?.select();
      }
    }
  }, [defaultValue]);

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && value.trim()) {
          if (submittedRef.current) return;
          submittedRef.current = true;
          onSubmit(value.trim());
        } else if (e.key === 'Escape') {
          onCancel();
        }
      }}
      onBlur={() => {
        // Prevent duplicate submission if onKeyDown already triggered onSubmit
        if (submittedRef.current) return;
        if (value.trim()) {
          submittedRef.current = true;
          onSubmit(value.trim());
        } else {
          onCancel();
        }
      }}
      placeholder={placeholder}
      className="text-sm bg-muted border border-border rounded px-1 py-0.5 w-full outline-none focus:border-primary"
    />
  );
}

/** Destination path picker dialog for copy/move operations */
function DestinationPicker({
  onSubmit,
  onCancel,
  defaultPath,
  action,
}: {
  onSubmit: (path: string) => void;
  onCancel: () => void;
  defaultPath: string;
  action: 'Copy' | 'Move';
}) {
  const [path, setPath] = useState(defaultPath);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background border border-border rounded-lg shadow-lg w-full max-w-md">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-medium">{action} To...</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Enter the destination path for the {action.toLowerCase()} operation
          </p>
        </div>
        <div className="px-4 py-3">
          <input
            ref={inputRef}
            value={path}
            onChange={(e) => setPath(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && path.trim()) {
                onSubmit(path.trim());
              } else if (e.key === 'Escape') {
                onCancel();
              }
            }}
            placeholder="Enter destination path..."
            className="w-full text-sm bg-muted border border-border rounded px-3 py-2 outline-none focus:border-primary font-mono"
          />
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm rounded hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => path.trim() && onSubmit(path.trim())}
            disabled={!path.trim()}
            className="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {action}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Single tree node renderer */
function TreeNode({
  node,
  depth,
  onFileSelect,
  onCreateFile,
  onCreateFolder,
  onDeleteItem,
  onRenameItem,
  onCopyPath,
  onToggleFolder,
  activeFilePath,
  gitStatusMap,
  showHiddenFiles,
  onCopyItem,
  onMoveItem,
  onDownloadItem,
  onDragDropMove,
  effectivePath,
}: {
  node: FileTreeNode;
  depth: number;
  onFileSelect: (path: string) => void;
  onCreateFile: (parentPath: string, name: string) => Promise<void>;
  onCreateFolder: (parentPath: string, name: string) => Promise<void>;
  onDeleteItem: (path: string, isDirectory: boolean) => Promise<void>;
  onRenameItem: (oldPath: string, newName: string) => Promise<void>;
  onCopyPath: (path: string) => void;
  onToggleFolder: (path: string) => void;
  activeFilePath: string | null;
  gitStatusMap: Map<string, string>;
  showHiddenFiles: boolean;
  onCopyItem?: (sourcePath: string, destinationPath: string) => Promise<void>;
  onMoveItem?: (sourcePath: string, destinationPath: string) => Promise<void>;
  onDownloadItem?: (filePath: string) => Promise<void>;
  onDragDropMove?: (sourcePaths: string[], targetFolderPath: string) => Promise<void>;
  effectivePath?: string;
}) {
  const {
    expandedFolders,
    enhancedGitStatusMap,
    dragState,
    setDragState,
    selectedPaths,
    toggleSelectedPath,
  } = useFileEditorStore();
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showCopyPicker, setShowCopyPicker] = useState(false);
  const [showMovePicker, setShowMovePicker] = useState(false);

  const isExpanded = expandedFolders.has(node.path);
  const isActive = activeFilePath === node.path;
  const gitStatus = node.gitStatus || gitStatusMap.get(node.path);
  const statusColor = getGitStatusColor(gitStatus);
  const statusLabel = getGitStatusLabel(gitStatus);

  // Enhanced git status info
  const enhancedStatus = enhancedGitStatusMap.get(node.path);
  const isConflicted = enhancedStatus?.isConflicted || gitStatus === 'U';
  const isStaged = enhancedStatus?.isStaged || false;
  const isUnstaged = enhancedStatus?.isUnstaged || false;
  const linesAdded = enhancedStatus?.linesAdded || 0;
  const linesRemoved = enhancedStatus?.linesRemoved || 0;
  const enhancedLabel = enhancedStatus?.statusLabel || statusLabel;

  // Drag state
  const isDragging = dragState.draggedPaths.includes(node.path);
  const isDropTarget = dragState.dropTargetPath === node.path && node.isDirectory;
  const isSelected = selectedPaths.has(node.path);

  const handleClick = (e: React.MouseEvent) => {
    // Multi-select with Ctrl/Cmd
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      toggleSelectedPath(node.path);
      return;
    }

    if (node.isDirectory) {
      onToggleFolder(node.path);
    } else {
      onFileSelect(node.path);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setMenuOpen(true);
  };

  const handleDelete = async () => {
    const itemType = node.isDirectory ? 'folder' : 'file';
    const confirmed = window.confirm(
      `Are you sure you want to delete "${node.name}"? This ${itemType} will be moved to trash.`
    );
    if (confirmed) {
      await onDeleteItem(node.path, node.isDirectory);
    }
  };

  const handleCopyName = async () => {
    try {
      await navigator.clipboard.writeText(node.name);
    } catch {
      // Fallback: silently fail
    }
  };

  // Drag handlers
  const handleDragStart = (e: React.DragEvent) => {
    e.stopPropagation();
    const paths = isSelected && selectedPaths.size > 1 ? Array.from(selectedPaths) : [node.path];
    setDragState({ draggedPaths: paths, dropTargetPath: null });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify(paths));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!node.isDirectory) return;

    // Prevent dropping into self or descendant
    const dragged = dragState.draggedPaths;
    const isDescendant = dragged.some((p) => node.path === p || node.path.startsWith(p + '/'));
    if (isDescendant) {
      e.dataTransfer.dropEffect = 'none';
      return;
    }

    e.dataTransfer.dropEffect = 'move';
    setDragState({ ...dragState, dropTargetPath: node.path });
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragState.dropTargetPath === node.path) {
      setDragState({ ...dragState, dropTargetPath: null });
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragState({ draggedPaths: [], dropTargetPath: null });

    if (!node.isDirectory || !onDragDropMove) return;

    try {
      const data = e.dataTransfer.getData('text/plain');
      const paths: string[] = JSON.parse(data);

      // Validate: don't drop into self or descendant
      const isDescendant = paths.some((p) => node.path === p || node.path.startsWith(p + '/'));
      if (isDescendant) return;

      await onDragDropMove(paths, node.path);
    } catch {
      // Invalid drag data
    }
  };

  const handleDragEnd = () => {
    setDragState({ draggedPaths: [], dropTargetPath: null });
  };

  // Build tooltip with enhanced info
  let tooltip = node.name;
  if (enhancedLabel) tooltip += ` (${enhancedLabel})`;
  if (linesAdded > 0 || linesRemoved > 0) {
    tooltip += ` +${linesAdded} -${linesRemoved}`;
  }

  return (
    <div key={node.path}>
      {/* Destination picker dialogs */}
      {showCopyPicker && onCopyItem && (
        <DestinationPicker
          action="Copy"
          defaultPath={node.path}
          onSubmit={async (destPath) => {
            setShowCopyPicker(false);
            await onCopyItem(node.path, destPath);
          }}
          onCancel={() => setShowCopyPicker(false)}
        />
      )}
      {showMovePicker && onMoveItem && (
        <DestinationPicker
          action="Move"
          defaultPath={node.path}
          onSubmit={async (destPath) => {
            setShowMovePicker(false);
            await onMoveItem(node.path, destPath);
          }}
          onCancel={() => setShowMovePicker(false)}
        />
      )}

      {isRenaming ? (
        <div style={{ paddingLeft: `${depth * 16 + 8}px` }} className="py-0.5 px-2">
          <InlineInput
            defaultValue={node.name}
            onSubmit={async (newName) => {
              await onRenameItem(node.path, newName);
              setIsRenaming(false);
            }}
            onCancel={() => setIsRenaming(false)}
          />
        </div>
      ) : (
        <div
          className={cn(
            'group flex items-center gap-1.5 py-0.5 px-2 rounded cursor-pointer text-sm hover:bg-muted/50 relative transition-colors',
            isActive && 'bg-primary/15 text-primary',
            statusColor && !isActive && statusColor,
            isConflicted && 'border-l-2 border-orange-500',
            isDragging && 'opacity-40',
            isDropTarget && 'bg-primary/20 ring-1 ring-primary/50',
            isSelected && !isActive && 'bg-muted/70'
          )}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={handleClick}
          onContextMenu={handleContextMenu}
          draggable
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onDragEnd={handleDragEnd}
          data-testid={`file-tree-item-${node.name}`}
          title={tooltip}
        >
          {/* Drag handle indicator (visible on hover) */}
          <GripVertical className="w-3 h-3 text-muted-foreground/30 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity hidden md:block" />

          {/* Expand/collapse chevron */}
          {node.isDirectory ? (
            isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            )
          ) : (
            <span className="w-3.5 shrink-0" />
          )}

          {/* Icon */}
          {node.isDirectory ? (
            isExpanded ? (
              <FolderOpen className="w-4 h-4 text-primary shrink-0" />
            ) : (
              <Folder className="w-4 h-4 text-primary shrink-0" />
            )
          ) : isConflicted ? (
            <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0" />
          ) : (
            <File className="w-4 h-4 text-muted-foreground shrink-0" />
          )}

          {/* Name */}
          <span className="truncate flex-1">{node.name}</span>

          {/* Diff stats (lines added/removed) shown inline */}
          {!node.isDirectory && (linesAdded > 0 || linesRemoved > 0) && (
            <span className="flex items-center gap-1 text-[10px] shrink-0 opacity-70">
              {linesAdded > 0 && (
                <span className="flex items-center text-green-600">
                  <Plus className="w-2.5 h-2.5" />
                  {linesAdded}
                </span>
              )}
              {linesRemoved > 0 && (
                <span className="flex items-center text-red-500">
                  <Minus className="w-2.5 h-2.5" />
                  {linesRemoved}
                </span>
              )}
            </span>
          )}

          {/* Git status indicator - two-tone badge for staged+unstaged */}
          {gitStatus && (
            <span className="flex items-center gap-0 shrink-0">
              {isStaged && isUnstaged ? (
                // Two-tone badge: staged (green) + unstaged (yellow)
                <>
                  <span
                    className="w-1.5 h-1.5 rounded-l-full bg-green-500"
                    title="Staged changes"
                  />
                  <span
                    className="w-1.5 h-1.5 rounded-r-full bg-yellow-500"
                    title="Unstaged changes"
                  />
                </>
              ) : isConflicted ? (
                <span
                  className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse"
                  title="Conflicted"
                />
              ) : (
                <span
                  className={cn('w-1.5 h-1.5 rounded-full shrink-0', {
                    'bg-yellow-500': gitStatus === 'M',
                    'bg-green-500': gitStatus === 'A' || gitStatus === 'S',
                    'bg-red-500': gitStatus === 'D',
                    'bg-gray-400': gitStatus === '?',
                    'bg-gray-600': gitStatus === '!',
                    'bg-purple-500': gitStatus === 'R',
                    'bg-cyan-500': gitStatus === 'C',
                    'bg-orange-500': gitStatus === 'U',
                  })}
                  title={enhancedLabel || statusLabel}
                />
              )}
            </span>
          )}

          {/* Actions dropdown menu (three-dot button) */}
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                }}
                className={cn(
                  'p-0.5 rounded shrink-0 hover:bg-accent transition-opacity',
                  // On mobile (max-md): always visible for touch access
                  // On desktop (md+): show on hover, focus, or when menu is open
                  'max-md:opacity-100 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100',
                  menuOpen && 'opacity-100'
                )}
                data-testid={`file-tree-menu-${node.name}`}
                aria-label={`Actions for ${node.name}`}
              >
                <MoreVertical className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="right" className="w-48">
              {/* Folder-specific: New File / New Folder */}
              {node.isDirectory && (
                <>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isExpanded) onToggleFolder(node.path);
                      setIsCreatingFile(true);
                    }}
                    className="gap-2"
                  >
                    <FilePlus className="w-4 h-4" />
                    <span>New File</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isExpanded) onToggleFolder(node.path);
                      setIsCreatingFolder(true);
                    }}
                    className="gap-2"
                  >
                    <FolderPlus className="w-4 h-4" />
                    <span>New Folder</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}

              {/* Copy operations */}
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onCopyPath(node.path);
                }}
                className="gap-2"
              >
                <ClipboardCopy className="w-4 h-4" />
                <span>Copy Path</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopyName();
                }}
                className="gap-2"
              >
                <Copy className="w-4 h-4" />
                <span>Copy Name</span>
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              {/* Copy To... */}
              {onCopyItem && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowCopyPicker(true);
                  }}
                  className="gap-2"
                >
                  <FolderInput className="w-4 h-4" />
                  <span>Copy To...</span>
                </DropdownMenuItem>
              )}

              {/* Move To... */}
              {onMoveItem && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMovePicker(true);
                  }}
                  className="gap-2"
                >
                  <FolderOutput className="w-4 h-4" />
                  <span>Move To...</span>
                </DropdownMenuItem>
              )}

              {/* Download */}
              {onDownloadItem && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onDownloadItem(node.path);
                  }}
                  className="gap-2"
                >
                  <Download className="w-4 h-4" />
                  <span>Download{node.isDirectory ? ' as ZIP' : ''}</span>
                </DropdownMenuItem>
              )}

              <DropdownMenuSeparator />

              {/* Rename */}
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  setIsRenaming(true);
                }}
                className="gap-2"
              >
                <Pencil className="w-4 h-4" />
                <span>Rename</span>
              </DropdownMenuItem>

              {/* Delete */}
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete();
                }}
                className="gap-2 text-destructive focus:text-destructive focus:bg-destructive/10"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Children (expanded folder) */}
      {node.isDirectory && isExpanded && node.children && (
        <div>
          {/* Inline create file input */}
          {isCreatingFile && (
            <div style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }} className="py-0.5 px-2">
              <InlineInput
                placeholder="filename.ext"
                onSubmit={async (name) => {
                  await onCreateFile(node.path, name);
                  setIsCreatingFile(false);
                }}
                onCancel={() => setIsCreatingFile(false)}
              />
            </div>
          )}
          {/* Inline create folder input */}
          {isCreatingFolder && (
            <div style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }} className="py-0.5 px-2">
              <InlineInput
                placeholder="folder-name"
                onSubmit={async (name) => {
                  await onCreateFolder(node.path, name);
                  setIsCreatingFolder(false);
                }}
                onCancel={() => setIsCreatingFolder(false)}
              />
            </div>
          )}
          {(showHiddenFiles
            ? node.children
            : node.children.filter((child) => !child.name.startsWith('.'))
          ).map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              onFileSelect={onFileSelect}
              onCreateFile={onCreateFile}
              onCreateFolder={onCreateFolder}
              onDeleteItem={onDeleteItem}
              onRenameItem={onRenameItem}
              onCopyPath={onCopyPath}
              onToggleFolder={onToggleFolder}
              activeFilePath={activeFilePath}
              gitStatusMap={gitStatusMap}
              showHiddenFiles={showHiddenFiles}
              onCopyItem={onCopyItem}
              onMoveItem={onMoveItem}
              onDownloadItem={onDownloadItem}
              onDragDropMove={onDragDropMove}
              effectivePath={effectivePath}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileTree({
  onFileSelect,
  onCreateFile,
  onCreateFolder,
  onDeleteItem,
  onRenameItem,
  onCopyPath,
  onRefresh,
  onToggleFolder,
  activeFilePath,
  onCopyItem,
  onMoveItem,
  onDownloadItem,
  onDragDropMove,
  effectivePath,
}: FileTreeProps) {
  const { fileTree, showHiddenFiles, setShowHiddenFiles, gitStatusMap, setDragState, gitBranch } =
    useFileEditorStore();
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  // Filter hidden files if needed
  const filteredTree = showHiddenFiles
    ? fileTree
    : fileTree.filter((node) => !node.name.startsWith('.'));

  // Handle drop on root area
  const handleRootDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (effectivePath) {
        e.dataTransfer.dropEffect = 'move';
        setDragState({ draggedPaths: [], dropTargetPath: effectivePath });
      }
    },
    [effectivePath, setDragState]
  );

  const handleRootDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setDragState({ draggedPaths: [], dropTargetPath: null });

      if (!effectivePath || !onDragDropMove) return;

      try {
        const data = e.dataTransfer.getData('text/plain');
        const paths: string[] = JSON.parse(data);
        await onDragDropMove(paths, effectivePath);
      } catch {
        // Invalid drag data
      }
    },
    [effectivePath, onDragDropMove, setDragState]
  );

  return (
    <div className="flex flex-col h-full" data-testid="file-tree">
      {/* Tree toolbar */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-border">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Explorer
          </span>
          {gitBranch && (
            <span className="text-[10px] text-primary font-medium px-1 py-0.5 bg-primary/10 rounded">
              {gitBranch}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setIsCreatingFile(true)}
            className="p-1 hover:bg-accent rounded"
            title="New file"
          >
            <FilePlus className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
          <button
            onClick={() => setIsCreatingFolder(true)}
            className="p-1 hover:bg-accent rounded"
            title="New folder"
          >
            <FolderPlus className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
          <button
            onClick={() => setShowHiddenFiles(!showHiddenFiles)}
            className="p-1 hover:bg-accent rounded"
            title={showHiddenFiles ? 'Hide dotfiles' : 'Show dotfiles'}
          >
            {showHiddenFiles ? (
              <Eye className="w-3.5 h-3.5 text-muted-foreground" />
            ) : (
              <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />
            )}
          </button>
          <button onClick={onRefresh} className="p-1 hover:bg-accent rounded" title="Refresh">
            <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Tree content */}
      <div
        className="flex-1 overflow-y-auto py-1"
        onDragOver={handleRootDragOver}
        onDrop={handleRootDrop}
      >
        {/* Root-level inline creators */}
        {isCreatingFile && (
          <div className="py-0.5 px-2" style={{ paddingLeft: '8px' }}>
            <InlineInput
              placeholder="filename.ext"
              onSubmit={async (name) => {
                await onCreateFile('', name);
                setIsCreatingFile(false);
              }}
              onCancel={() => setIsCreatingFile(false)}
            />
          </div>
        )}
        {isCreatingFolder && (
          <div className="py-0.5 px-2" style={{ paddingLeft: '8px' }}>
            <InlineInput
              placeholder="folder-name"
              onSubmit={async (name) => {
                await onCreateFolder('', name);
                setIsCreatingFolder(false);
              }}
              onCancel={() => setIsCreatingFolder(false)}
            />
          </div>
        )}

        {filteredTree.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-xs text-muted-foreground">No files found</p>
          </div>
        ) : (
          filteredTree.map((node) => (
            <TreeNode
              key={node.path}
              node={node}
              depth={0}
              onFileSelect={onFileSelect}
              onCreateFile={onCreateFile}
              onCreateFolder={onCreateFolder}
              onDeleteItem={onDeleteItem}
              onRenameItem={onRenameItem}
              onCopyPath={onCopyPath}
              onToggleFolder={onToggleFolder}
              activeFilePath={activeFilePath}
              gitStatusMap={gitStatusMap}
              showHiddenFiles={showHiddenFiles}
              onCopyItem={onCopyItem}
              onMoveItem={onMoveItem}
              onDownloadItem={onDownloadItem}
              onDragDropMove={onDragDropMove}
              effectivePath={effectivePath}
            />
          ))
        )}
      </div>
    </div>
  );
}
