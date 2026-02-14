import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  Loader2,
  Search,
  X,
  FileText,
  FileCode,
  FileJson,
  FileType,
  Image,
  Cog,
  Package,
  FileTerminal,
  Copy,
  Trash2,
  Pencil,
  FilePlus,
  FolderPlus,
  ExternalLink,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { getElectronAPI } from '@/lib/electron';
import type { FileEntry, GitFileStatus } from '@/lib/electron';

interface FileTreeProps {
  rootPath: string;
  selectedFile?: string;
  onFileSelect: (filePath: string) => void;
  onRename?: (filePath: string) => void;
  onDelete?: (filePath: string) => void;
  onCreateFile?: (parentDirPath: string) => void;
  onCreateFolder?: (parentDirPath: string) => void;
  onCopyPath?: (filePath: string) => void;
  onCopyRelativePath?: (filePath: string) => void;
  onRevealInFileManager?: (filePath: string) => void;
  renamingPath?: string | null;
  onRenameSubmit?: (oldPath: string, newName: string) => void;
  onRenameCancel?: () => void;
  creatingIn?: { parentPath: string; type: 'file' | 'folder' } | null;
  onCreateSubmit?: (parentPath: string, name: string, type: 'file' | 'folder') => void;
  onCreateCancel?: () => void;
  touchMode?: boolean;
  gitStatusMap?: Map<string, GitFileStatus>;
  className?: string;
  'data-testid'?: string;
}

interface TreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: TreeNode[];
  isLoaded?: boolean;
  isLoading?: boolean;
  size?: number;
  mtime?: string;
}

// Directories/files to hide from the tree
const HIDDEN_ENTRIES = new Set([
  'node_modules',
  '.git',
  '.DS_Store',
  'Thumbs.db',
  '.automaker',
  'dist',
  'build',
  '.next',
  '.cache',
  '.turbo',
  '__pycache__',
  '.vscode',
  '.idea',
]);

function sortEntries(entries: FileEntry[]): FileEntry[] {
  return [...entries].sort((a, b) => {
    // Directories first
    if (a.isDirectory !== b.isDirectory) {
      return a.isDirectory ? -1 : 1;
    }
    // Then alphabetical (case-insensitive)
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });
}

/** Get an appropriate icon component for a file based on its extension */
function getFileIcon(name: string) {
  const ext = name.includes('.') ? name.split('.').pop()?.toLowerCase() : '';
  const baseName = name.toLowerCase();

  // Config / dotfiles
  if (
    baseName.startsWith('.') ||
    baseName === 'tsconfig.json' ||
    baseName === 'vite.config.ts' ||
    baseName === 'tailwind.config.ts' ||
    baseName === 'postcss.config.js' ||
    baseName === 'eslint.config.js' ||
    baseName === 'vitest.config.ts'
  ) {
    return Cog;
  }

  // Package files
  if (baseName === 'package.json' || baseName === 'package-lock.json') {
    return Package;
  }

  switch (ext) {
    // Code files
    case 'ts':
    case 'tsx':
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
    case 'py':
    case 'rs':
    case 'go':
    case 'rb':
    case 'java':
    case 'cpp':
    case 'c':
    case 'h':
    case 'hpp':
    case 'cs':
    case 'php':
    case 'swift':
    case 'kt':
    case 'scala':
    case 'vue':
    case 'svelte':
      return FileCode;

    // Markup / text
    case 'md':
    case 'mdx':
    case 'txt':
    case 'rtf':
    case 'rst':
      return FileText;

    // Data / config
    case 'json':
    case 'jsonc':
      return FileJson;

    // Style
    case 'css':
    case 'scss':
    case 'less':
    case 'sass':
      return FileType;

    // Images
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'svg':
    case 'webp':
    case 'ico':
    case 'bmp':
      return Image;

    // Shell
    case 'sh':
    case 'bash':
    case 'zsh':
    case 'fish':
      return FileTerminal;

    // HTML / XML
    case 'html':
    case 'htm':
    case 'xml':
    case 'xhtml':
      return FileCode;

    // Config
    case 'yaml':
    case 'yml':
    case 'toml':
    case 'ini':
    case 'env':
    case 'conf':
      return Cog;

    default:
      return File;
  }
}

/** Get a color class for a file icon based on its extension */
function getFileIconColor(name: string): string {
  const ext = name.includes('.') ? name.split('.').pop()?.toLowerCase() : '';

  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'text-blue-400';
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return 'text-yellow-400';
    case 'json':
    case 'jsonc':
      return 'text-yellow-500';
    case 'css':
    case 'scss':
    case 'less':
      return 'text-purple-400';
    case 'html':
    case 'htm':
      return 'text-orange-400';
    case 'md':
    case 'mdx':
      return 'text-sky-400';
    case 'py':
      return 'text-green-400';
    case 'rs':
      return 'text-orange-500';
    case 'go':
      return 'text-cyan-400';
    case 'svg':
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'webp':
      return 'text-emerald-400';
    case 'yaml':
    case 'yml':
    case 'toml':
      return 'text-red-300';
    case 'sh':
    case 'bash':
    case 'zsh':
      return 'text-green-300';
    default:
      return 'text-muted-foreground';
  }
}

/** Get a color class for a file name based on its git status */
function getGitStatusColor(status: string): string {
  switch (status) {
    case 'M':
      return 'text-yellow-400'; // Modified
    case 'A':
      return 'text-green-400'; // Added
    case 'D':
      return 'text-red-400'; // Deleted
    case '?':
      return 'text-green-500/70'; // Untracked
    case 'R':
      return 'text-blue-400'; // Renamed
    case 'C':
      return 'text-blue-300'; // Copied
    case 'U':
      return 'text-orange-400'; // Unmerged
    default:
      return '';
  }
}

/** Get a short status label for git status */
function getGitStatusLabel(status: string): string {
  switch (status) {
    case 'M':
      return 'M';
    case 'A':
      return 'A';
    case 'D':
      return 'D';
    case '?':
      return 'U';
    case 'R':
      return 'R';
    case 'C':
      return 'C';
    case 'U':
      return '!';
    default:
      return '';
  }
}

/** Format file size to human-readable */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/** Check if a node or any descendant matches the filter */
function nodeMatchesFilter(node: TreeNode, filter: string): boolean {
  const lowerFilter = filter.toLowerCase();
  if (node.name.toLowerCase().includes(lowerFilter)) return true;
  if (node.children) {
    return node.children.some((child) => nodeMatchesFilter(child, lowerFilter));
  }
  return false;
}

/** Collect all matching file paths from the tree for search results */
function collectMatchingPaths(nodes: TreeNode[], filter: string): string[] {
  const lowerFilter = filter.toLowerCase();
  const results: string[] = [];

  function traverse(node: TreeNode) {
    if (!node.isDirectory && node.name.toLowerCase().includes(lowerFilter)) {
      results.push(node.path);
    }
    if (node.children) {
      node.children.forEach(traverse);
    }
  }

  nodes.forEach(traverse);
  return results;
}

/** Context menu for file operations */
function FileContextMenu({
  x,
  y,
  filePath,
  isDirectory,
  rootPath,
  onClose,
  onRename,
  onDelete,
  onCreateFile,
  onCreateFolder,
  onCopyPath,
  onCopyRelativePath,
  onRevealInFileManager,
}: {
  x: number;
  y: number;
  filePath: string;
  isDirectory: boolean;
  rootPath: string;
  onClose: () => void;
  onRename?: (path: string) => void;
  onDelete?: (path: string) => void;
  onCreateFile?: (parentPath: string) => void;
  onCreateFolder?: (parentPath: string) => void;
  onCopyPath?: (path: string) => void;
  onCopyRelativePath?: (path: string) => void;
  onRevealInFileManager?: (path: string) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: TouchEvent | MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('touchstart', handleOutside);
    document.addEventListener('mousedown', handleOutside);
    return () => {
      document.removeEventListener('touchstart', handleOutside);
      document.removeEventListener('mousedown', handleOutside);
    };
  }, [onClose]);

  useEffect(() => {
    // Focus first button when menu opens
    if (menuRef.current) {
      const firstButton = menuRef.current.querySelector('button');
      firstButton?.focus();
    }
  }, []);

  const handleCopyPath = () => {
    if (onCopyPath) {
      onCopyPath(filePath);
    } else {
      navigator.clipboard.writeText(filePath).catch(() => {});
    }
    onClose();
  };

  const handleCopyRelativePath = () => {
    const relativePath = filePath.startsWith(rootPath + '/')
      ? filePath.slice(rootPath.length + 1)
      : filePath;
    if (onCopyRelativePath) {
      onCopyRelativePath(relativePath);
    } else {
      navigator.clipboard.writeText(relativePath).catch(() => {});
    }
    onClose();
  };

  const style: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(x, window.innerWidth - 220),
    top: Math.min(y, window.innerHeight - 300),
    zIndex: 50,
  };

  return (
    <div
      ref={menuRef}
      className="bg-popover border border-border rounded-lg shadow-lg py-1 min-w-[200px] animate-in fade-in-0 zoom-in-95"
      style={style}
      data-testid="file-context-menu"
    >
      {/* Create operations (directories only) */}
      {isDirectory && (onCreateFile || onCreateFolder) && (
        <>
          {onCreateFile && (
            <button
              className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-foreground hover:bg-accent/50 active:bg-accent transition-colors"
              onClick={() => {
                onCreateFile(filePath);
                onClose();
              }}
              data-testid="context-menu-new-file"
            >
              <FilePlus className="h-4 w-4 text-muted-foreground" />
              New File
            </button>
          )}
          {onCreateFolder && (
            <button
              className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-foreground hover:bg-accent/50 active:bg-accent transition-colors"
              onClick={() => {
                onCreateFolder(filePath);
                onClose();
              }}
              data-testid="context-menu-new-folder"
            >
              <FolderPlus className="h-4 w-4 text-muted-foreground" />
              New Folder
            </button>
          )}
          <div className="my-1 h-px bg-border" />
        </>
      )}

      {/* Edit operations */}
      {onRename && (
        <button
          className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-foreground hover:bg-accent/50 active:bg-accent transition-colors"
          onClick={() => {
            onRename(filePath);
            onClose();
          }}
          data-testid="context-menu-rename"
        >
          <Pencil className="h-4 w-4 text-muted-foreground" />
          Rename
        </button>
      )}
      {onDelete && (
        <>
          <button
            className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-destructive hover:bg-destructive/10 active:bg-destructive/20 transition-colors"
            onClick={() => {
              onDelete(filePath);
              onClose();
            }}
            data-testid="context-menu-delete"
          >
            <Trash2 className="h-4 w-4" />
            Delete {isDirectory ? 'Folder' : 'File'}
          </button>
          <div className="my-1 h-px bg-border" />
        </>
      )}

      {/* Utility operations */}
      <button
        className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-foreground hover:bg-accent/50 active:bg-accent transition-colors"
        onClick={handleCopyPath}
        data-testid="context-menu-copy-path"
      >
        <Copy className="h-4 w-4 text-muted-foreground" />
        Copy Path
      </button>
      <button
        className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-foreground hover:bg-accent/50 active:bg-accent transition-colors"
        onClick={handleCopyRelativePath}
        data-testid="context-menu-copy-relative-path"
      >
        <Copy className="h-4 w-4 text-muted-foreground" />
        Copy Relative Path
      </button>
      {onRevealInFileManager && (
        <button
          className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-foreground hover:bg-accent/50 active:bg-accent transition-colors"
          onClick={() => {
            onRevealInFileManager(filePath);
            onClose();
          }}
          data-testid="context-menu-reveal"
        >
          <ExternalLink className="h-4 w-4 text-muted-foreground" />
          Reveal in File Manager
        </button>
      )}
    </div>
  );
}

/** Inline input for creating new files/folders */
function InlineCreateInput({
  type,
  onSubmit,
  onCancel,
  depth,
  touchMode,
}: {
  type: 'file' | 'folder';
  onSubmit: (name: string) => void;
  onCancel: () => void;
  depth: number;
  touchMode?: boolean;
}) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && value.trim()) {
      onSubmit(value.trim());
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  const IconComponent = type === 'folder' ? Folder : File;
  const iconColor = type === 'folder' ? 'text-blue-400' : 'text-muted-foreground';

  return (
    <div
      className={cn(
        'flex items-center w-full px-1 text-sm rounded-sm bg-accent/30',
        touchMode ? 'py-2 min-h-[44px]' : 'py-0.5'
      )}
      style={{ paddingLeft: `${depth * (touchMode ? 16 : 12) + 4}px` }}
      data-testid="inline-create-input"
    >
      <span className={cn('shrink-0 mr-1', touchMode ? 'w-5 h-5' : 'w-4 h-4')} />
      <IconComponent
        className={cn('shrink-0 mr-1.5', iconColor, touchMode ? 'h-5 w-5' : 'h-4 w-4')}
      />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={onCancel}
        placeholder={type === 'folder' ? 'Folder name' : 'File name'}
        className={cn(
          'flex-1 bg-transparent text-foreground placeholder:text-muted-foreground outline-none',
          touchMode ? 'text-[0.9375rem]' : 'text-sm'
        )}
        data-testid="inline-create-input-field"
      />
    </div>
  );
}

/** Inline input for renaming files/folders */
function InlineRenameInput({
  currentName,
  isDirectory,
  onSubmit,
  onCancel,
  depth,
  touchMode,
  gitStatusMap,
  node,
}: {
  currentName: string;
  isDirectory: boolean;
  onSubmit: (newName: string) => void;
  onCancel: () => void;
  depth: number;
  touchMode?: boolean;
  gitStatusMap?: Map<string, GitFileStatus>;
  node: TreeNode;
}) {
  const [value, setValue] = useState(() => {
    // For files, pre-fill without extension
    if (!isDirectory && currentName.includes('.')) {
      const parts = currentName.split('.');
      parts.pop();
      return parts.join('.');
    }
    return currentName;
  });
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && value.trim()) {
      // For files, re-add extension
      let finalName = value.trim();
      if (!isDirectory && currentName.includes('.')) {
        const ext = currentName.split('.').pop();
        finalName = `${finalName}.${ext}`;
      }
      onSubmit(finalName);
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  const IconComponent = isDirectory ? Folder : getFileIcon(currentName);
  const iconColor = isDirectory ? 'text-blue-400' : getFileIconColor(currentName);

  // Git status
  const gitStatus = gitStatusMap?.get(node.path);
  const gitColor = gitStatus ? getGitStatusColor(gitStatus.status) : '';
  const gitLabel = gitStatus ? getGitStatusLabel(gitStatus.status) : '';

  return (
    <div
      className={cn(
        'flex items-center w-full px-1 text-sm rounded-sm bg-accent/30',
        touchMode ? 'py-2 min-h-[44px]' : 'py-0.5'
      )}
      style={{ paddingLeft: `${depth * (touchMode ? 16 : 12) + 4}px` }}
      data-testid="inline-rename-input"
    >
      <span className={cn('shrink-0 mr-1', touchMode ? 'w-5 h-5' : 'w-4 h-4')} />
      <IconComponent
        className={cn('shrink-0 mr-1.5', iconColor, touchMode ? 'h-5 w-5' : 'h-4 w-4')}
      />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={onCancel}
        className={cn(
          'flex-1 bg-transparent text-foreground outline-none',
          touchMode ? 'text-[0.9375rem]' : 'text-sm',
          gitColor
        )}
        data-testid="inline-rename-input-field"
      />
      {gitLabel && (
        <span
          className={cn(
            'font-mono font-bold ml-1 shrink-0',
            gitColor,
            touchMode ? 'text-xs' : 'text-[10px]'
          )}
        >
          {gitLabel}
        </span>
      )}
    </div>
  );
}

function TreeItem({
  node,
  depth,
  selectedFile,
  onFileSelect,
  onToggle,
  onRename,
  onDelete,
  onCreateFile,
  onCreateFolder,
  onCopyPath,
  onCopyRelativePath,
  onRevealInFileManager,
  renamingPath,
  onRenameSubmit,
  onRenameCancel,
  creatingIn,
  onCreateSubmit,
  onCreateCancel,
  filter,
  showMetadata,
  touchMode,
  gitStatusMap,
  rootPath,
}: {
  node: TreeNode;
  depth: number;
  selectedFile?: string;
  onFileSelect: (path: string) => void;
  onToggle: (node: TreeNode) => void;
  onRename?: (path: string) => void;
  onDelete?: (path: string) => void;
  onCreateFile?: (parentPath: string) => void;
  onCreateFolder?: (parentPath: string) => void;
  onCopyPath?: (path: string) => void;
  onCopyRelativePath?: (path: string) => void;
  onRevealInFileManager?: (path: string) => void;
  renamingPath?: string | null;
  onRenameSubmit?: (oldPath: string, newName: string) => void;
  onRenameCancel?: () => void;
  creatingIn?: { parentPath: string; type: 'file' | 'folder' } | null;
  onCreateSubmit?: (parentPath: string, name: string, type: 'file' | 'folder') => void;
  onCreateCancel?: () => void;
  filter: string;
  showMetadata: boolean;
  touchMode?: boolean;
  gitStatusMap?: Map<string, GitFileStatus>;
  rootPath: string;
}) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchMoved = useRef(false);

  // If filtering, hide nodes that don't match
  if (filter && !nodeMatchesFilter(node, filter)) {
    return null;
  }

  const isSelected = selectedFile === node.path;
  const isExpanded = node.isDirectory && node.isLoaded && node.children !== undefined;
  const isRenaming = renamingPath === node.path;

  // Look up git status for this node
  const gitStatus = gitStatusMap?.get(node.path);
  const gitColor = gitStatus ? getGitStatusColor(gitStatus.status) : '';
  const gitLabel = gitStatus ? getGitStatusLabel(gitStatus.status) : '';

  // Check if this directory contains any changed files
  const dirHasChanges =
    node.isDirectory && gitStatusMap
      ? Array.from(gitStatusMap.keys()).some((p) => p.startsWith(node.path + '/'))
      : false;

  const handleClick = useCallback(() => {
    if (node.isDirectory) {
      onToggle(node);
    } else {
      onFileSelect(node.path);
    }
  }, [node, onFileSelect, onToggle]);

  // Long-press for touch context menu
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchMoved.current = false;
    const touch = e.touches[0];
    longPressTimer.current = setTimeout(() => {
      if (!touchMoved.current) {
        setContextMenu({ x: touch.clientX, y: touch.clientY });
      }
    }, 500);
  }, []);

  const handleTouchMove = useCallback(() => {
    touchMoved.current = true;
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  // Desktop right-click context menu
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const IconComponent = node.isDirectory
    ? isExpanded
      ? FolderOpen
      : Folder
    : getFileIcon(node.name);

  const iconColor = node.isDirectory ? 'text-blue-400' : getFileIconColor(node.name);

  // Build tooltip with metadata
  const tooltipParts = node.isDirectory
    ? [node.path]
    : [
        node.path,
        node.size !== undefined ? `Size: ${formatFileSize(node.size)}` : '',
        node.mtime ? `Modified: ${new Date(node.mtime).toLocaleString()}` : '',
      ];
  if (gitStatus) {
    tooltipParts.push(`Git: ${gitStatus.statusText}`);
  }
  const tooltip = tooltipParts.filter(Boolean).join('\n');

  return (
    <>
      {/* Show inline create input if creating in this directory */}
      {creatingIn && creatingIn.parentPath === node.path && onCreateSubmit && onCreateCancel && (
        <InlineCreateInput
          type={creatingIn.type}
          onSubmit={(name) => onCreateSubmit(node.path, name, creatingIn.type)}
          onCancel={onCreateCancel}
          depth={depth + 1}
          touchMode={touchMode}
        />
      )}

      {/* Show inline rename input if renaming this node */}
      {isRenaming && onRenameSubmit && onRenameCancel ? (
        <InlineRenameInput
          currentName={node.name}
          isDirectory={node.isDirectory}
          onSubmit={(newName) => onRenameSubmit(node.path, newName)}
          onCancel={onRenameCancel}
          depth={depth}
          touchMode={touchMode}
          gitStatusMap={gitStatusMap}
          node={node}
        />
      ) : (
        <button
          className={cn(
            'flex items-center w-full text-left px-1 text-sm hover:bg-accent/50 rounded-sm transition-colors group',
            touchMode ? 'py-2 min-h-[44px]' : 'py-0.5',
            isSelected && 'bg-accent text-accent-foreground'
          )}
          style={{ paddingLeft: `${depth * (touchMode ? 16 : 12) + 4}px` }}
          onClick={handleClick}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onContextMenu={handleContextMenu}
          data-testid={`file-tree-item-${node.name}`}
          title={tooltip}
        >
          {node.isDirectory ? (
            <span
              className={cn(
                'shrink-0 flex items-center justify-center mr-1',
                touchMode ? 'w-5 h-5' : 'w-4 h-4'
              )}
            >
              {node.isLoading ? (
                <Loader2
                  className={cn(
                    'animate-spin text-muted-foreground',
                    touchMode ? 'h-4 w-4' : 'h-3 w-3'
                  )}
                />
              ) : isExpanded ? (
                <ChevronDown
                  className={cn('text-muted-foreground', touchMode ? 'h-4 w-4' : 'h-3 w-3')}
                />
              ) : (
                <ChevronRight
                  className={cn('text-muted-foreground', touchMode ? 'h-4 w-4' : 'h-3 w-3')}
                />
              )}
            </span>
          ) : (
            <span className={cn('shrink-0 mr-1', touchMode ? 'w-5 h-5' : 'w-4 h-4')} />
          )}
          <IconComponent
            className={cn('shrink-0 mr-1.5', iconColor, touchMode ? 'h-5 w-5' : 'h-4 w-4')}
          />
          <span className={cn('truncate flex-1', touchMode && 'text-[0.9375rem]', gitColor)}>
            {node.name}
          </span>
          {/* Git status badge */}
          {gitLabel && (
            <span
              className={cn(
                'font-mono font-bold ml-1 shrink-0',
                gitColor,
                touchMode ? 'text-xs' : 'text-[10px]'
              )}
              data-testid={`git-status-${node.name}`}
            >
              {gitLabel}
            </span>
          )}
          {/* Directory change indicator (dot) */}
          {dirHasChanges && !gitStatus && (
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 ml-1 shrink-0" />
          )}
          {/* Show file size metadata inline for files */}
          {showMetadata && !node.isDirectory && node.size !== undefined && !gitLabel && (
            <span
              className={cn(
                'text-muted-foreground/60 ml-1 shrink-0',
                touchMode ? 'text-xs inline' : 'text-[10px] hidden group-hover:inline'
              )}
            >
              {formatFileSize(node.size)}
            </span>
          )}
        </button>
      )}

      {/* Context menu (long-press on touch, right-click on desktop) */}
      {contextMenu && (
        <FileContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          filePath={node.path}
          isDirectory={node.isDirectory}
          rootPath={rootPath}
          onClose={() => setContextMenu(null)}
          onRename={onRename}
          onDelete={onDelete}
          onCreateFile={onCreateFile}
          onCreateFolder={onCreateFolder}
          onCopyPath={onCopyPath}
          onCopyRelativePath={onCopyRelativePath}
          onRevealInFileManager={onRevealInFileManager}
        />
      )}
      {isExpanded &&
        node.children?.map((child) => (
          <TreeItem
            key={child.path}
            node={child}
            depth={depth + 1}
            selectedFile={selectedFile}
            onFileSelect={onFileSelect}
            onToggle={onToggle}
            onRename={onRename}
            onDelete={onDelete}
            onCreateFile={onCreateFile}
            onCreateFolder={onCreateFolder}
            onCopyPath={onCopyPath}
            onCopyRelativePath={onCopyRelativePath}
            onRevealInFileManager={onRevealInFileManager}
            renamingPath={renamingPath}
            onRenameSubmit={onRenameSubmit}
            onRenameCancel={onRenameCancel}
            creatingIn={creatingIn}
            onCreateSubmit={onCreateSubmit}
            onCreateCancel={onCreateCancel}
            filter={filter}
            showMetadata={showMetadata}
            touchMode={touchMode}
            gitStatusMap={gitStatusMap}
            rootPath={rootPath}
          />
        ))}
    </>
  );
}

export function FileTree({
  rootPath,
  selectedFile,
  onFileSelect,
  onRename,
  onDelete,
  onCreateFile,
  onCreateFolder,
  onCopyPath,
  onCopyRelativePath,
  onRevealInFileManager,
  renamingPath,
  onRenameSubmit,
  onRenameCancel,
  creatingIn,
  onCreateSubmit,
  onCreateCancel,
  touchMode,
  gitStatusMap,
  className,
  'data-testid': testId,
}: FileTreeProps) {
  const [roots, setRoots] = useState<TreeNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus search input when shown
  useEffect(() => {
    if (showSearch && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [showSearch]);

  // Toggle search with Cmd/Ctrl+F when tree is focused
  const handleTreeKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        e.stopPropagation();
        setShowSearch((prev) => !prev);
        if (showSearch) {
          setFilter('');
        }
      }
      if (e.key === 'Escape' && showSearch) {
        setShowSearch(false);
        setFilter('');
      }
    },
    [showSearch]
  );

  // Load children for a directory, with optional metadata fetch
  const loadChildren = useCallback(async (dirPath: string): Promise<TreeNode[]> => {
    const api = getElectronAPI();
    const result = await api.readdir(dirPath);
    if (!result.success || !result.entries) {
      return [];
    }
    const filtered = result.entries.filter(
      (e) => !HIDDEN_ENTRIES.has(e.name) && !e.name.startsWith('.')
    );
    const sorted = sortEntries(filtered);

    const nodes: TreeNode[] = sorted.map((entry) => ({
      name: entry.name,
      path: `${dirPath}/${entry.name}`,
      isDirectory: entry.isDirectory,
      isLoaded: false,
    }));

    // Fetch metadata for files (size and mtime) in the background
    const fileNodes = nodes.filter((n) => !n.isDirectory);
    if (fileNodes.length > 0) {
      // Fetch stats in parallel, but don't block tree rendering
      Promise.allSettled(
        fileNodes.map(async (node) => {
          try {
            const statResult = await api.stat(node.path);
            if (statResult.success && statResult.stats) {
              return {
                path: node.path,
                size: statResult.stats.size,
                mtime: statResult.stats.mtime,
              };
            }
          } catch {
            // Ignore stat errors
          }
          return null;
        })
      ).then((results) => {
        const updates: Record<string, { size?: number; mtime?: string }> = {};
        for (const result of results) {
          if (result.status === 'fulfilled' && result.value) {
            updates[result.value.path] = {
              size: result.value.size,
              mtime:
                result.value.mtime instanceof Date
                  ? result.value.mtime.toISOString()
                  : String(result.value.mtime),
            };
          }
        }
        if (Object.keys(updates).length > 0) {
          setRoots((prev) => applyMetadataUpdates(prev, updates));
        }
      });
    }

    return nodes;
  }, []);

  // Initial load
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    loadChildren(rootPath)
      .then((children) => {
        if (!cancelled) {
          setRoots(children);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.message || 'Failed to load directory');
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [rootPath, loadChildren]);

  // Toggle directory expand/collapse
  const handleToggle = useCallback(
    async (node: TreeNode) => {
      if (!node.isDirectory) return;

      // If already loaded, just toggle
      if (node.isLoaded) {
        setRoots((prev) => toggleNode(prev, node.path));
        return;
      }

      // Mark as loading
      setRoots((prev) => updateNode(prev, node.path, { isLoading: true }));

      try {
        const children = await loadChildren(node.path);
        setRoots((prev) =>
          updateNode(prev, node.path, {
            children,
            isLoaded: true,
            isLoading: false,
          })
        );
      } catch {
        setRoots((prev) => updateNode(prev, node.path, { isLoading: false }));
      }
    },
    [loadChildren]
  );

  // Search match count
  const matchCount = useMemo(() => {
    if (!filter) return 0;
    return collectMatchingPaths(roots, filter).length;
  }, [roots, filter]);

  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center py-8', className)} data-testid={testId}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('p-4 text-sm text-destructive', className)} data-testid={testId}>
        {error}
      </div>
    );
  }

  if (roots.length === 0) {
    return (
      <div className={cn('p-4 text-sm text-muted-foreground', className)} data-testid={testId}>
        Empty directory
      </div>
    );
  }

  return (
    <div
      className={cn('h-full flex flex-col', className)}
      data-testid={testId}
      onKeyDown={handleTreeKeyDown}
      tabIndex={-1}
    >
      {/* Search/Filter Bar */}
      {showSearch && (
        <div
          className={cn(
            'flex items-center gap-1 px-2 border-b border-border bg-muted/30',
            touchMode ? 'py-2.5' : 'py-1.5'
          )}
        >
          <Search
            className={cn('text-muted-foreground shrink-0', touchMode ? 'h-4 w-4' : 'h-3.5 w-3.5')}
          />
          <input
            ref={searchInputRef}
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter files..."
            className={cn(
              'flex-1 bg-transparent text-foreground placeholder:text-muted-foreground outline-none',
              touchMode ? 'text-base py-1' : 'text-xs'
            )}
            data-testid="file-tree-search"
          />
          {filter && (
            <span
              className={cn(
                'text-muted-foreground shrink-0',
                touchMode ? 'text-xs' : 'text-[10px]'
              )}
            >
              {matchCount} {matchCount === 1 ? 'match' : 'matches'}
            </span>
          )}
          <button
            onClick={() => {
              setShowSearch(false);
              setFilter('');
            }}
            className={cn(
              'rounded hover:bg-accent/50 text-muted-foreground',
              touchMode ? 'p-1.5' : 'p-0.5'
            )}
            data-testid="file-tree-search-close"
          >
            <X className={cn(touchMode ? 'h-4 w-4' : 'h-3 w-3')} />
          </button>
        </div>
      )}

      {/* Toolbar (visible when search is hidden) */}
      {!showSearch && (
        <div className="flex justify-end items-center gap-1 px-2 py-0.5">
          <button
            onClick={() => setShowSearch(true)}
            className={cn(
              'rounded hover:bg-accent/50 text-muted-foreground',
              touchMode ? 'p-2' : 'p-1'
            )}
            title="Search files (Cmd+F)"
            data-testid="file-tree-search-toggle"
          >
            <Search className={cn(touchMode ? 'h-4.5 w-4.5' : 'h-3.5 w-3.5')} />
          </button>
          {onCreateFile && (
            <button
              onClick={() => onCreateFile(rootPath)}
              className={cn(
                'rounded hover:bg-accent/50 text-muted-foreground',
                touchMode ? 'p-2' : 'p-1'
              )}
              title="New File"
              data-testid="file-tree-new-file"
            >
              <FilePlus className={cn(touchMode ? 'h-4.5 w-4.5' : 'h-3.5 w-3.5')} />
            </button>
          )}
          {onCreateFolder && (
            <button
              onClick={() => onCreateFolder(rootPath)}
              className={cn(
                'rounded hover:bg-accent/50 text-muted-foreground',
                touchMode ? 'p-2' : 'p-1'
              )}
              title="New Folder"
              data-testid="file-tree-new-folder"
            >
              <FolderPlus className={cn(touchMode ? 'h-4.5 w-4.5' : 'h-3.5 w-3.5')} />
            </button>
          )}
        </div>
      )}

      {/* Tree Content */}
      <ScrollArea className="flex-1">
        <div className={cn('py-1', touchMode ? 'px-0.5' : 'px-1')}>
          {/* Show inline create input at root level if creating at root */}
          {creatingIn && creatingIn.parentPath === rootPath && onCreateSubmit && onCreateCancel && (
            <InlineCreateInput
              type={creatingIn.type}
              onSubmit={(name) => onCreateSubmit(rootPath, name, creatingIn.type)}
              onCancel={onCreateCancel}
              depth={0}
              touchMode={touchMode}
            />
          )}

          {filter && matchCount === 0 ? (
            <div className="px-3 py-4 text-xs text-muted-foreground text-center">
              No files matching &ldquo;{filter}&rdquo;
            </div>
          ) : (
            roots.map((node) => (
              <TreeItem
                key={node.path}
                node={node}
                depth={0}
                selectedFile={selectedFile}
                onFileSelect={onFileSelect}
                onToggle={handleToggle}
                onRename={onRename}
                onDelete={onDelete}
                onCreateFile={onCreateFile}
                onCreateFolder={onCreateFolder}
                onCopyPath={onCopyPath}
                onCopyRelativePath={onCopyRelativePath}
                onRevealInFileManager={onRevealInFileManager}
                renamingPath={renamingPath}
                onRenameSubmit={onRenameSubmit}
                onRenameCancel={onRenameCancel}
                creatingIn={creatingIn}
                onCreateSubmit={onCreateSubmit}
                onCreateCancel={onCreateCancel}
                filter={filter}
                showMetadata={true}
                touchMode={touchMode}
                gitStatusMap={gitStatusMap}
                rootPath={rootPath}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// Helpers for immutable tree updates

function updateNode(nodes: TreeNode[], targetPath: string, updates: Partial<TreeNode>): TreeNode[] {
  return nodes.map((node) => {
    if (node.path === targetPath) {
      return { ...node, ...updates };
    }
    if (node.children && targetPath.startsWith(node.path + '/')) {
      return {
        ...node,
        children: updateNode(node.children, targetPath, updates),
      };
    }
    return node;
  });
}

function toggleNode(nodes: TreeNode[], targetPath: string): TreeNode[] {
  return nodes.map((node) => {
    if (node.path === targetPath) {
      // Collapse by removing children reference (keep isLoaded so re-expand is instant)
      if (node.children) {
        return { ...node, children: undefined };
      }
      return node;
    }
    if (node.children && targetPath.startsWith(node.path + '/')) {
      return {
        ...node,
        children: toggleNode(node.children, targetPath),
      };
    }
    return node;
  });
}

/** Apply metadata updates (size, mtime) to tree nodes by path */
function applyMetadataUpdates(
  nodes: TreeNode[],
  updates: Record<string, { size?: number; mtime?: string }>
): TreeNode[] {
  return nodes.map((node) => {
    const update = updates[node.path];
    if (update) {
      return { ...node, ...update };
    }
    if (node.children) {
      const updatedChildren = applyMetadataUpdates(node.children, updates);
      if (updatedChildren !== node.children) {
        return { ...node, children: updatedChildren };
      }
    }
    return node;
  });
}
