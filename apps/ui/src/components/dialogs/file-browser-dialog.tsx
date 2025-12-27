import { useState, useEffect, useCallback } from 'react';
import { FolderOpen, Folder, ChevronRight, HardDrive, Clock, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { PathInput } from '@/components/ui/path-input';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { getJSON, setJSON } from '@/lib/storage';
import { getDefaultWorkspaceDirectory, saveLastProjectDirectory } from '@/lib/workspace-config';
import { useOSDetection } from '@/hooks';

interface DirectoryEntry {
  name: string;
  path: string;
}

interface BrowseResult {
  success: boolean;
  currentPath: string;
  parentPath: string | null;
  directories: DirectoryEntry[];
  drives?: string[];
  error?: string;
  warning?: string;
}

interface FileBrowserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (path: string) => void;
  title?: string;
  description?: string;
  initialPath?: string;
}

const RECENT_FOLDERS_KEY = 'file-browser-recent-folders';
const MAX_RECENT_FOLDERS = 5;

function getRecentFolders(): string[] {
  return getJSON<string[]>(RECENT_FOLDERS_KEY) ?? [];
}

function addRecentFolder(path: string): void {
  const recent = getRecentFolders();
  // Remove if already exists, then add to front
  const filtered = recent.filter((p) => p !== path);
  const updated = [path, ...filtered].slice(0, MAX_RECENT_FOLDERS);
  setJSON(RECENT_FOLDERS_KEY, updated);
}

function removeRecentFolder(path: string): string[] {
  const recent = getRecentFolders();
  const updated = recent.filter((p) => p !== path);
  setJSON(RECENT_FOLDERS_KEY, updated);
  return updated;
}

export function FileBrowserDialog({
  open,
  onOpenChange,
  onSelect,
  title = 'Select Project Directory',
  description = 'Navigate to your project folder or paste a path directly',
  initialPath,
}: FileBrowserDialogProps) {
  const { isMac } = useOSDetection();
  const [currentPath, setCurrentPath] = useState<string>('');
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [directories, setDirectories] = useState<DirectoryEntry[]>([]);
  const [drives, setDrives] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [recentFolders, setRecentFolders] = useState<string[]>([]);

  // Load recent folders when dialog opens
  useEffect(() => {
    if (open) {
      setRecentFolders(getRecentFolders());
    }
  }, [open]);

  const handleRemoveRecent = useCallback((e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    const updated = removeRecentFolder(path);
    setRecentFolders(updated);
  }, []);

  const browseDirectory = useCallback(async (dirPath?: string) => {
    setLoading(true);
    setError('');
    setWarning('');

    try {
      // Get server URL from environment or default
      const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:3008';

      const response = await fetch(`${serverUrl}/api/fs/browse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dirPath }),
      });

      const result: BrowseResult = await response.json();

      if (result.success) {
        setCurrentPath(result.currentPath);
        setParentPath(result.parentPath);
        setDirectories(result.directories);
        setDrives(result.drives || []);
        setWarning(result.warning || '');
      } else {
        setError(result.error || 'Failed to browse directory');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load directories');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSelectRecent = useCallback(
    (path: string) => {
      browseDirectory(path);
    },
    [browseDirectory]
  );

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setCurrentPath('');
      setParentPath(null);
      setDirectories([]);
      setError('');
      setWarning('');
    }
  }, [open]);

  // Load initial path or workspace directory when dialog opens
  useEffect(() => {
    if (open && !currentPath) {
      // Priority order:
      // 1. Last selected directory from this file browser (from localStorage)
      // 2. initialPath prop (from parent component)
      // 3. Default workspace directory
      // 4. Home directory
      const loadInitialPath = async () => {
        try {
          // First, check for last selected directory from getDefaultWorkspaceDirectory
          // which already implements the priority: last used > Documents/Automaker > DATA_DIR
          const defaultDir = await getDefaultWorkspaceDirectory();

          // If we have a default directory, use it (unless initialPath is explicitly provided and different)
          const pathToUse = initialPath || defaultDir;

          if (pathToUse) {
            browseDirectory(pathToUse);
          } else {
            // No default directory, browse home directory
            browseDirectory();
          }
        } catch {
          // If config fetch fails, try initialPath or fall back to home directory
          if (initialPath) {
            browseDirectory(initialPath);
          } else {
            browseDirectory();
          }
        }
      };

      loadInitialPath();
    }
  }, [open, initialPath, currentPath, browseDirectory]);

  const handleSelectDirectory = (dir: DirectoryEntry) => {
    browseDirectory(dir.path);
  };

  const handleGoHome = useCallback(() => {
    browseDirectory();
  }, [browseDirectory]);

  const handleNavigate = useCallback(
    (path: string) => {
      browseDirectory(path);
    },
    [browseDirectory]
  );

  const handleSelectDrive = (drivePath: string) => {
    browseDirectory(drivePath);
  };

  const handleSelect = useCallback(() => {
    if (currentPath) {
      addRecentFolder(currentPath);
      // Save to last project directory so it's used as default next time
      saveLastProjectDirectory(currentPath);
      onSelect(currentPath);
      onOpenChange(false);
    }
  }, [currentPath, onSelect, onOpenChange]);

  // Handle Command/Ctrl+Enter keyboard shortcut to select current folder
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Command+Enter (Mac) or Ctrl+Enter (Windows/Linux)
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (currentPath && !loading) {
          handleSelect();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, currentPath, loading, handleSelect]);

  // Helper to get folder name from path
  const getFolderName = (path: string) => {
    const parts = path.split(/[/\\]/).filter(Boolean);
    return parts[parts.length - 1] || path;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-popover border-border max-w-3xl max-h-[85vh] overflow-hidden flex flex-col p-4 focus:outline-none focus-visible:outline-none">
        <DialogHeader className="pb-1">
          <DialogTitle className="flex items-center gap-2 text-base">
            <FolderOpen className="w-4 h-4 text-brand-500" />
            {title}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs">
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 min-h-[350px] flex-1 overflow-hidden py-1">
          {/* Path navigation */}
          <PathInput
            currentPath={currentPath}
            parentPath={parentPath}
            loading={loading}
            error={!!error}
            onNavigate={handleNavigate}
            onHome={handleGoHome}
            entries={directories.map((dir) => ({ ...dir, isDirectory: true }))}
            onSelectEntry={(entry) => {
              if (entry.isDirectory) {
                handleSelectDirectory(entry);
              }
            }}
          />

          {/* Recent folders */}
          {recentFolders.length > 0 && (
            <div className="flex flex-wrap gap-1.5 p-2 rounded-md bg-sidebar-accent/10 border border-sidebar-border">
              <div className="flex items-center gap-1 text-xs text-muted-foreground mr-1">
                <Clock className="w-3 h-3" />
                <span>Recent:</span>
              </div>
              {recentFolders.map((folder) => (
                <button
                  key={folder}
                  onClick={() => handleSelectRecent(folder)}
                  className="group flex items-center gap-1 h-6 px-2 text-xs bg-sidebar-accent/20 hover:bg-sidebar-accent/40 rounded border border-sidebar-border transition-colors"
                  disabled={loading}
                  title={folder}
                >
                  <Folder className="w-3 h-3 text-brand-500 shrink-0" />
                  <span className="truncate max-w-[120px]">{getFolderName(folder)}</span>
                  <button
                    onClick={(e) => handleRemoveRecent(e, folder)}
                    className="ml-0.5 opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
                    title="Remove from recent"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </button>
              ))}
            </div>
          )}

          {/* Drives selector (Windows only) */}
          {drives.length > 0 && (
            <div className="flex flex-wrap gap-1.5 p-2 rounded-md bg-sidebar-accent/10 border border-sidebar-border">
              <div className="flex items-center gap-1 text-xs text-muted-foreground mr-1">
                <HardDrive className="w-3 h-3" />
                <span>Drives:</span>
              </div>
              {drives.map((drive) => (
                <Button
                  key={drive}
                  variant={currentPath.startsWith(drive) ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleSelectDrive(drive)}
                  className="h-6 px-2 text-xs"
                  disabled={loading}
                >
                  {drive.replace('\\', '')}
                </Button>
              ))}
            </div>
          )}

          {/* Directory list */}
          <div className="flex-1 overflow-y-auto border border-sidebar-border rounded-md scrollbar-styled">
            {loading && (
              <div className="flex items-center justify-center h-full p-4">
                <div className="text-xs text-muted-foreground">Loading directories...</div>
              </div>
            )}

            {error && (
              <div className="flex items-center justify-center h-full p-4">
                <div className="text-xs text-destructive">{error}</div>
              </div>
            )}

            {warning && (
              <div className="p-2 bg-yellow-500/10 border border-yellow-500/30 rounded-md mb-1">
                <div className="text-xs text-yellow-500">{warning}</div>
              </div>
            )}

            {!loading && !error && !warning && directories.length === 0 && (
              <div className="flex items-center justify-center h-full p-4">
                <div className="text-xs text-muted-foreground">No subdirectories found</div>
              </div>
            )}

            {!loading && !error && directories.length > 0 && (
              <div className="divide-y divide-sidebar-border">
                {directories.map((dir) => (
                  <button
                    key={dir.path}
                    onClick={() => handleSelectDirectory(dir)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-sidebar-accent/10 transition-colors text-left group"
                  >
                    <Folder className="w-4 h-4 text-brand-500 shrink-0" />
                    <span className="flex-1 truncate text-xs">{dir.name}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="text-[10px] text-muted-foreground">
            Paste a full path above, or click on folders to navigate. Press Enter or click → to jump
            to a path.
          </div>
        </div>

        <DialogFooter className="border-t border-border pt-3 gap-2 mt-1">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSelect}
            disabled={!currentPath || loading}
            title="Select current folder (Cmd+Enter / Ctrl+Enter)"
          >
            <FolderOpen className="w-3.5 h-3.5 mr-1.5" />
            Select Current Folder
            <KbdGroup className="ml-1">
              <Kbd>{isMac ? '⌘' : 'Ctrl'}</Kbd>
              <Kbd>↵</Kbd>
            </KbdGroup>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
