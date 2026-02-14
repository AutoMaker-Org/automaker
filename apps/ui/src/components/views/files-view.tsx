import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useAppStore } from '@/store/app-store';
import {
  FolderOpen,
  X,
  FileText,
  Loader2,
  Save,
  Circle,
  Clock,
  HardDrive,
  PanelLeftClose,
  PanelLeftOpen,
  ArrowLeft,
  Maximize2,
  Minimize2,
  GitBranch,
  Plus,
  Minus,
  Diff,
  ChevronDown,
  Search,
  Eye,
  EyeOff,
  SplitSquareHorizontal,
} from 'lucide-react';
import { toast } from 'sonner';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import type { ImperativePanelHandle } from 'react-resizable-panels';
import { FileTree } from '@/components/ui/file-tree';
import { CodeEditor, detectLanguage } from '@/components/ui/code-editor';
import { Markdown } from '@/components/ui/markdown';
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import { FileSearchDialog } from '@/components/ui/file-search-dialog';
import { getElectronAPI } from '@/lib/electron';
import type { FileStats, GitFileStatus, DiffHunk } from '@/lib/electron';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-media-query';
import { useWorktrees } from '@/hooks/queries/use-worktrees';

/** Format file size to human-readable */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/** Format a date for relative display */
function formatRelativeDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Check if a file is a markdown file */
function isMarkdownFile(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase();
  return ext === 'md' || ext === 'mdx' || ext === 'markdown';
}

export function FilesView() {
  const { currentProject } = useAppStore();
  const tabs = useAppStore((s) => s.fileEditorTabs);
  const activeTabPath = useAppStore((s) => s.fileEditorActiveTabPath);
  const saveStatus = useAppStore((s) => s.fileEditorSaveStatus);
  const settings = useAppStore((s) => s.fileEditorSettings);

  // Markdown preview state (per-file: path -> mode)
  const [markdownPreviewMode, setMarkdownPreviewMode] = useState<
    Record<string, 'editor' | 'preview' | 'split'>
  >({});
  const markdownPreviewPanelRef = useRef<ImperativePanelHandle>(null);

  const activeTab = tabs.find((t) => t.path === activeTabPath) || null;

  // Get markdown preview mode for active file (default to 'editor')
  const activeMarkdownPreviewMode = useMemo(() => {
    if (!activeTabPath) return 'editor';
    return markdownPreviewMode[activeTabPath] ?? settings.markdownPreviewMode;
  }, [activeTabPath, markdownPreviewMode, settings.markdownPreviewMode]);

  // Check if active file is a markdown file
  const activeFileIsMarkdown = useMemo(() => {
    return activeTabPath ? isMarkdownFile(activeTabPath) : false;
  }, [activeTabPath]);

  // Handler to toggle markdown preview mode
  const handleToggleMarkdownPreview = useCallback(() => {
    if (!activeTabPath) return;
    const currentMode = markdownPreviewMode[activeTabPath] ?? settings.markdownPreviewMode;
    const nextMode: 'editor' | 'preview' | 'split' =
      currentMode === 'editor' ? 'preview' : currentMode === 'preview' ? 'split' : 'editor';
    setMarkdownPreviewMode((prev) => ({ ...prev, [activeTabPath]: nextMode }));
  }, [activeTabPath, markdownPreviewMode, settings.markdownPreviewMode]);

  const openFileTab = useAppStore((s) => s.openFileTab);
  const closeFileTab = useAppStore((s) => s.closeFileTab);
  const setActiveFileTab = useAppStore((s) => s.setActiveFileTab);
  const updateFileContent = useAppStore((s) => s.updateFileContent);
  const markFileSaved = useAppStore((s) => s.markFileSaved);
  const setFileCursorPosition = useAppStore((s) => s.setFileCursorPosition);
  const setSaveStatus = useAppStore((s) => s.setFileEditorSaveStatus);
  const setFileEditorWorktree = useAppStore((s) => s.setFileEditorWorktree);
  const getFileEditorWorktree = useAppStore((s) => s.getFileEditorWorktree);

  const isMobile = useIsMobile();

  // Worktree integration
  const { data: worktreeData } = useWorktrees(currentProject?.path);
  const worktrees = worktreeData?.worktrees ?? [];
  const selectedWorktree = currentProject ? getFileEditorWorktree(currentProject.path) : null;
  const [worktreeDropdownOpen, setWorktreeDropdownOpen] = useState(false);
  const worktreeDropdownRef = useRef<HTMLDivElement>(null);

  // The effective root path for the file tree: use selected worktree path, or project path
  const effectiveRootPath = selectedWorktree?.path || currentProject?.path || '';
  // The effective git project path (for git operations)
  const effectiveGitPath = selectedWorktree?.path || currentProject?.path || '';

  // Close worktree dropdown on outside click
  useEffect(() => {
    if (!worktreeDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (worktreeDropdownRef.current && !worktreeDropdownRef.current.contains(e.target as Node)) {
        setWorktreeDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [worktreeDropdownOpen]);

  // Local state for file stats (not needed in global store)
  const [fileStats, setFileStats] = useState<Record<string, FileStats>>({});
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set());
  const [isTreeCollapsed, setIsTreeCollapsed] = useState(false);
  const [mobileShowTree, setMobileShowTree] = useState(true);
  const autoSaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const saveStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const treePanelRef = useRef<ImperativePanelHandle>(null);

  // Mobile fullscreen editor state
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isVirtualKeyboardOpen, setIsVirtualKeyboardOpen] = useState(false);

  // File search dialog state
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Git integration state
  const [gitFiles, setGitFiles] = useState<GitFileStatus[]>([]);
  const [isGitRepo, setIsGitRepo] = useState(false);
  const [activeDiffHunks, setActiveDiffHunks] = useState<DiffHunk[]>([]);
  const [showDiffView, setShowDiffView] = useState(false);
  const [activeDiffContent, setActiveDiffContent] = useState<string>('');
  const gitStatusTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // File operations state
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [creatingIn, setCreatingIn] = useState<{
    parentPath: string;
    type: 'file' | 'folder';
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ path: string; isDirectory: boolean } | null>(
    null
  );
  // Key to force re-mount the FileTree when files change (create/rename/delete)
  const [treeRefreshKey, setTreeRefreshKey] = useState(0);
  useEffect(() => {
    if (!isMobile) return;
    const handleResize = () => {
      // Virtual keyboard is open when the viewport height is notably less
      // than the window.screen.height (keyboard takes ~40% of screen)
      if (window.visualViewport) {
        const isKeyboard = window.visualViewport.height < window.screen.height * 0.75;
        setIsVirtualKeyboardOpen(isKeyboard);
      }
    };
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize);
      return () => window.visualViewport?.removeEventListener('resize', handleResize);
    }
    const activeTab = tabs.find((t) => t.path === activeTabPath) || null;
  }, [isMobile]);

  // Prevent zoom on input focus for iOS
  useEffect(() => {
    if (!isMobile) return;
    const meta = document.querySelector('meta[name="viewport"]');
    const originalContent = meta?.getAttribute('content') || '';
    if (meta && !originalContent.includes('maximum-scale')) {
      meta.setAttribute(
        'content',
        'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no'
      );
    }
    return () => {
      if (meta) {
        meta.setAttribute('content', originalContent);
      }
    };
  }, [isMobile]);

  // On mobile, when a file is selected, switch to editor view
  const switchToEditorOnMobile = useCallback(() => {
    if (isMobile) {
      setMobileShowTree(false);
    }
  }, [isMobile]);

  // Build a map of absolute path -> git status for the file tree
  const gitStatusMap = useMemo(() => {
    if (!currentProject || !isGitRepo || gitFiles.length === 0) return undefined;
    const map = new Map<string, GitFileStatus>();
    const rootForGit = effectiveRootPath || currentProject.path;
    for (const file of gitFiles) {
      const absPath = `${rootForGit}/${file.path}`;
      map.set(absPath, file);
    }
    return map;
  }, [currentProject, isGitRepo, gitFiles, effectiveRootPath]);

  // Get git status for the active file
  const activeFileGitStatus = useMemo(() => {
    if (!activeTabPath || !gitStatusMap) return null;
    return gitStatusMap.get(activeTabPath) || null;
  }, [activeTabPath, gitStatusMap]);

  // Fetch git status for the project (or selected worktree)
  const fetchGitStatus = useCallback(async () => {
    if (!currentProject) return;
    try {
      const api = getElectronAPI();
      const result = await api.gitStatus(effectiveGitPath);
      if (result.success) {
        setIsGitRepo(result.isGitRepo ?? false);
        setGitFiles(result.files ?? []);
      }
    } catch {
      // Silently fail - git status is non-critical
    }
  }, [currentProject, effectiveGitPath]);

  // Fetch git diff for the active file
  const fetchActiveDiff = useCallback(async () => {
    if (!currentProject || !activeTabPath) {
      setActiveDiffHunks([]);
      return;
    }
    try {
      const api = getElectronAPI();
      // Determine the root path for this file (its worktree or the project)
      const activeTab = useAppStore.getState().fileEditorTabs.find((t) => t.path === activeTabPath);
      const fileRoot = activeTab?.worktreePath || effectiveGitPath;
      // Get the relative path for git diff
      const relativePath = activeTabPath.startsWith(fileRoot + '/')
        ? activeTabPath.slice(fileRoot.length + 1)
        : activeTabPath;
      const result = await api.gitDiff(fileRoot, relativePath);
      if (result.success) {
        setActiveDiffHunks(result.hunks ?? []);
        setActiveDiffContent(result.diff ?? '');
      }
    } catch {
      setActiveDiffHunks([]);
    }
  }, [currentProject, activeTabPath, effectiveGitPath]);

  // Initial git status fetch and periodic refresh
  useEffect(() => {
    fetchGitStatus();
    // Refresh git status every 10 seconds
    gitStatusTimerRef.current = setInterval(fetchGitStatus, 10000);
    return () => {
      if (gitStatusTimerRef.current) {
        clearInterval(gitStatusTimerRef.current);
        gitStatusTimerRef.current = null;
      }
    };
  }, [fetchGitStatus]);

  // Fetch diff when active tab changes
  useEffect(() => {
    if (isGitRepo && activeTabPath) {
      fetchActiveDiff();
    } else {
      setActiveDiffHunks([]);
    }
  }, [isGitRepo, activeTabPath, fetchActiveDiff]);

  // Toggle file tree panel (desktop: collapse/expand, mobile: switch views)
  const toggleTreePanel = useCallback(() => {
    if (isMobile) {
      setMobileShowTree((prev) => !prev);
    } else {
      const panel = treePanelRef.current;
      if (panel) {
        if (isTreeCollapsed) {
          panel.expand();
        } else {
          panel.collapse();
        }
      }
    }
  }, [isMobile, isTreeCollapsed]);

  const showSaveStatus = useCallback(
    (message: string, duration = 2000) => {
      setSaveStatus(message);
      if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
      saveStatusTimerRef.current = setTimeout(() => setSaveStatus(null), duration);
    },
    [setSaveStatus]
  );

  // Stage/unstage file handler
  const handleGitStage = useCallback(
    async (action: 'stage' | 'unstage') => {
      if (!currentProject || !activeTabPath) return;
      try {
        const api = getElectronAPI();
        const activeTab = useAppStore
          .getState()
          .fileEditorTabs.find((t) => t.path === activeTabPath);
        const fileRoot = activeTab?.worktreePath || effectiveGitPath;
        const relativePath = activeTabPath.startsWith(fileRoot + '/')
          ? activeTabPath.slice(fileRoot.length + 1)
          : activeTabPath;
        const result = await api.gitStage(fileRoot, relativePath, action);
        if (result.success) {
          showSaveStatus(action === 'stage' ? 'Staged' : 'Unstaged');
          // Refresh git status
          fetchGitStatus();
        }
      } catch {
        showSaveStatus(`${action} failed`, 3000);
      }
    },
    [currentProject, activeTabPath, showSaveStatus, fetchGitStatus, effectiveGitPath]
  );

  const saveFile = useCallback(
    async (filePath: string) => {
      const tab = useAppStore.getState().fileEditorTabs.find((t) => t.path === filePath);
      if (!tab || !tab.isDirty) return;
      try {
        const api = getElectronAPI();
        const result = await api.writeFile(tab.path, tab.content);
        if (result.success) {
          markFileSaved(filePath);
          // Update stats after save
          const statResult = await api.stat(filePath).catch(() => null);
          if (statResult?.success && statResult.stats) {
            setFileStats((prev) => ({ ...prev, [filePath]: statResult.stats! }));
          }
          showSaveStatus('Saved');
          // Refresh git status after save
          fetchGitStatus();
        } else {
          showSaveStatus(`Save failed: ${result.error}`, 3000);
        }
      } catch (err) {
        showSaveStatus(
          `Save failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
          3000
        );
      }
    },
    [markFileSaved, showSaveStatus, fetchGitStatus]
  );

  const handleSaveActive = useCallback(async () => {
    if (!activeTabPath) return;
    await saveFile(activeTabPath);
  }, [activeTabPath, saveFile]);

  // Auto-save: save all dirty tabs at the configured interval
  useEffect(() => {
    if (autoSaveTimerRef.current) {
      clearInterval(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }

    if (settings.autoSaveEnabled) {
      autoSaveTimerRef.current = setInterval(() => {
        const dirtyTabs = useAppStore.getState().getDirtyFileTabs();
        for (const tab of dirtyTabs) {
          saveFile(tab.path);
        }
      }, settings.autoSaveIntervalMs);
    }

    return () => {
      if (autoSaveTimerRef.current) {
        clearInterval(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [settings.autoSaveEnabled, settings.autoSaveIntervalMs, saveFile]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
    };
  }, []);

  const handleFileSelect = useCallback(
    async (filePath: string) => {
      // If already open, just switch to it
      const existing = tabs.find((t) => t.path === filePath);
      if (existing) {
        setActiveFileTab(filePath);
        switchToEditorOnMobile();
        return;
      }

      const name = filePath.split('/').pop() || filePath;
      const language = detectLanguage(filePath);

      // Track loading state locally
      setLoadingPaths((prev) => new Set(prev).add(filePath));

      // Load file content and stats in parallel
      try {
        const api = getElectronAPI();
        const [fileResult, statResult] = await Promise.all([
          api.readFile(filePath),
          api.stat(filePath).catch(() => null),
        ]);

        if (statResult?.success && statResult.stats) {
          setFileStats((prev) => ({ ...prev, [filePath]: statResult.stats! }));
        }

        if (fileResult.success && fileResult.content !== undefined) {
          openFileTab(
            filePath,
            name,
            fileResult.content,
            language,
            selectedWorktree?.path || currentProject?.path,
            selectedWorktree?.branch || 'main'
          );
        } else {
          openFileTab(
            filePath,
            name,
            `Error: ${fileResult.error || 'Failed to read file'}`,
            language,
            selectedWorktree?.path || currentProject?.path,
            selectedWorktree?.branch || 'main'
          );
        }
        switchToEditorOnMobile();
      } catch (err) {
        openFileTab(
          filePath,
          name,
          `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
          language,
          selectedWorktree?.path || currentProject?.path,
          selectedWorktree?.branch || 'main'
        );
      } finally {
        setLoadingPaths((prev) => {
          const next = new Set(prev);
          next.delete(filePath);
          return next;
        });
      }
    },
    [tabs, openFileTab, setActiveFileTab, switchToEditorOnMobile, selectedWorktree, currentProject]
  );

  const handleCloseTab = useCallback(
    (path: string, e?: React.MouseEvent) => {
      e?.stopPropagation();
      closeFileTab(path);
      // Cleanup local stats
      setFileStats((prev) => {
        const next = { ...prev };
        delete next[path];
        return next;
      });
    },
    [closeFileTab]
  );

  // --- File Operation Handlers ---

  const refreshTree = useCallback(() => {
    setTreeRefreshKey((k) => k + 1);
  }, []);

  const handleCreateFile = useCallback((parentPath: string) => {
    setCreatingIn({ parentPath, type: 'file' });
  }, []);

  const handleCreateFolder = useCallback((parentPath: string) => {
    setCreatingIn({ parentPath, type: 'folder' });
  }, []);

  const handleCreateSubmit = useCallback(
    async (parentPath: string, name: string, type: 'file' | 'folder') => {
      setCreatingIn(null);
      const api = getElectronAPI();
      const newPath = `${parentPath}/${name}`;
      try {
        if (type === 'folder') {
          const result = await api.mkdir(newPath);
          if (result.success) {
            toast.success(`Folder "${name}" created`);
            refreshTree();
          } else {
            toast.error(`Failed to create folder: ${result.error}`);
          }
        } else {
          const result = await api.writeFile(newPath, '');
          if (result.success) {
            toast.success(`File "${name}" created`);
            refreshTree();
            // Open the newly created file
            handleFileSelect(newPath);
          } else {
            toast.error(`Failed to create file: ${result.error}`);
          }
        }
      } catch (err) {
        toast.error(
          `Failed to create ${type}: ${err instanceof Error ? err.message : 'Unknown error'}`
        );
      }
    },
    [refreshTree, handleFileSelect]
  );

  const handleCreateCancel = useCallback(() => {
    setCreatingIn(null);
  }, []);

  const handleRenameStart = useCallback((filePath: string) => {
    setRenamingPath(filePath);
  }, []);

  const handleRenameSubmit = useCallback(
    async (oldPath: string, newName: string) => {
      setRenamingPath(null);
      const parentDir = oldPath.substring(0, oldPath.lastIndexOf('/'));
      const newPath = `${parentDir}/${newName}`;
      if (newPath === oldPath) return;
      try {
        const api = getElectronAPI();
        const result = await api.rename(oldPath, newPath);
        if (result.success) {
          toast.success(`Renamed to "${newName}"`);
          refreshTree();
          // If the renamed file was open in a tab, close the old tab and open the new one
          const openTab = tabs.find((t) => t.path === oldPath);
          if (openTab) {
            closeFileTab(oldPath);
            handleFileSelect(newPath);
          }
          fetchGitStatus();
        } else {
          toast.error(`Failed to rename: ${result.error}`);
        }
      } catch (err) {
        toast.error(`Failed to rename: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    },
    [refreshTree, tabs, closeFileTab, handleFileSelect, fetchGitStatus]
  );

  const handleRenameCancel = useCallback(() => {
    setRenamingPath(null);
  }, []);

  const handleDeleteRequest = useCallback((filePath: string) => {
    const name = filePath.split('/').pop() || filePath;
    // Check if it's a directory by looking at the tree context (simple heuristic: no extension)
    // We'll use the fs stat to determine this accurately, but for the dialog we can infer
    const api = getElectronAPI();
    api
      .stat(filePath)
      .then((result) => {
        const isDir = result.success && result.stats?.isDirectory;
        setDeleteTarget({ path: filePath, isDirectory: !!isDir });
      })
      .catch(() => {
        // Fallback: assume file
        setDeleteTarget({ path: filePath, isDirectory: false });
      });
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    const { path: targetPath } = deleteTarget;
    const name = targetPath.split('/').pop() || targetPath;
    try {
      const api = getElectronAPI();
      // Try trash first, then fall back to delete
      const result = api.trashItem
        ? await api.trashItem(targetPath)
        : await api.deleteFile(targetPath);
      if (result.success) {
        toast.success(`"${name}" deleted`);
        // Close the tab if the deleted file was open
        const openTab = tabs.find((t) => t.path === targetPath);
        if (openTab) {
          closeFileTab(targetPath);
        }
        refreshTree();
        fetchGitStatus();
      } else {
        toast.error(`Failed to delete: ${result.error}`);
      }
    } catch (err) {
      toast.error(`Failed to delete: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
    setDeleteTarget(null);
  }, [deleteTarget, tabs, closeFileTab, refreshTree, fetchGitStatus]);

  const handleCopyPath = useCallback((filePath: string) => {
    navigator.clipboard
      .writeText(filePath)
      .then(() => {
        toast.success('Path copied to clipboard');
      })
      .catch(() => {
        toast.error('Failed to copy path');
      });
  }, []);

  const handleCopyRelativePath = useCallback((relativePath: string) => {
    navigator.clipboard
      .writeText(relativePath)
      .then(() => {
        toast.success('Relative path copied to clipboard');
      })
      .catch(() => {
        toast.error('Failed to copy path');
      });
  }, []);

  const handleContentChange = useCallback(
    (value: string) => {
      if (!activeTabPath) return;
      updateFileContent(activeTabPath, value);
    },
    [activeTabPath, updateFileContent]
  );

  const handleCursorChange = useCallback(
    (line: number, column: number) => {
      if (!activeTabPath) return;
      setFileCursorPosition(activeTabPath, { line, column });
    },
    [activeTabPath, setFileCursorPosition]
  );

  // Keyboard shortcuts: Cmd/Ctrl+S to save, Cmd/Ctrl+B to toggle file tree, F2 rename, Delete/Backspace delete
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSaveActive();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        toggleTreePanel();
      }
      // F2 to rename selected file
      if (e.key === 'F2' && activeTabPath && !renamingPath && !creatingIn) {
        e.preventDefault();
        handleRenameStart(activeTabPath);
      }
      // Delete/Backspace (with Cmd/Ctrl) to delete selected file
      if (
        (e.key === 'Delete' || (e.key === 'Backspace' && (e.metaKey || e.ctrlKey))) &&
        activeTabPath &&
        !renamingPath &&
        !creatingIn
      ) {
        e.preventDefault();
        handleDeleteRequest(activeTabPath);
      }
      // Cmd/Ctrl+N to create new file at root
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key === 'n' &&
        !e.shiftKey &&
        !renamingPath &&
        !creatingIn
      ) {
        e.preventDefault();
        handleCreateFile(effectiveRootPath);
      }
      // Cmd/Ctrl+Shift+N to create new folder at root
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'N' && !renamingPath && !creatingIn) {
        e.preventDefault();
        handleCreateFolder(effectiveRootPath);
      }
      // Cmd/Ctrl+P to open file search
      if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    },
    [
      handleSaveActive,
      toggleTreePanel,
      activeTabPath,
      renamingPath,
      creatingIn,
      handleRenameStart,
      handleDeleteRequest,
      handleCreateFile,
      handleCreateFolder,
      effectiveRootPath,
    ]
  );

  // No project selected
  if (!currentProject) {
    return (
      <div className="flex-1 flex items-center justify-center" data-testid="files-view-no-project">
        <p className="text-muted-foreground">No project selected</p>
      </div>
    );
  }

  // Check if tabs span multiple worktrees (to show branch badges)
  const hasMultipleWorktrees = useMemo(() => {
    const branches = new Set(tabs.map((t) => t.worktreeBranch || ''));
    return branches.size > 1;
  }, [tabs]);

  // --- Editor area content (shared between mobile and desktop) ---
  const editorContent = (
    <div
      className={cn(
        'h-full flex flex-col',
        isMobile && isFullscreen && 'fixed inset-0 z-50 bg-background'
      )}
    >
      {/* Tabs Bar - hidden when virtual keyboard is open on mobile fullscreen */}
      {!(isMobile && isFullscreen && isVirtualKeyboardOpen) && (
        <div
          className={cn(
            'flex items-center border-b border-border bg-muted/20 overflow-x-auto',
            isMobile && 'touch-pan-x'
          )}
        >
          {/* Mobile: back to tree button */}
          {isMobile && !isFullscreen && (
            <button
              className="flex items-center gap-1 px-3 py-2.5 text-sm text-muted-foreground hover:bg-accent/50 active:bg-accent transition-colors shrink-0 border-r border-border"
              onClick={() => setMobileShowTree(true)}
              data-testid="mobile-back-to-tree"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          {/* Mobile fullscreen: exit fullscreen button */}
          {isMobile && isFullscreen && (
            <button
              className="flex items-center gap-1 px-3 py-2.5 text-sm text-muted-foreground hover:bg-accent/50 active:bg-accent transition-colors shrink-0 border-r border-border"
              onClick={() => setIsFullscreen(false)}
              data-testid="exit-fullscreen-button"
            >
              <Minimize2 className="h-4 w-4" />
            </button>
          )}
          {/* Desktop: toggle tree button (shown when tree is collapsed) */}
          {!isMobile && isTreeCollapsed && (
            <button
              className="flex items-center gap-1 px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent/50 transition-colors shrink-0 border-r border-border"
              onClick={toggleTreePanel}
              title="Show file tree (Cmd+B)"
              data-testid="show-tree-button"
            >
              <PanelLeftOpen className="h-3.5 w-3.5" />
            </button>
          )}
          {tabs.length > 0 ? (
            <>
              {tabs.map((tab) => (
                <button
                  key={tab.path}
                  className={cn(
                    'flex items-center gap-1.5 border-r border-border hover:bg-accent/50 transition-colors shrink-0 group',
                    isMobile
                      ? 'px-3 py-2.5 text-sm max-w-[160px]'
                      : 'px-3 py-1.5 text-sm max-w-[200px]',
                    activeTabPath === tab.path
                      ? 'bg-background text-foreground'
                      : 'text-muted-foreground',
                    // Color-code left border when tabs span multiple worktrees
                    hasMultipleWorktrees &&
                      tab.worktreeBranch &&
                      activeTabPath === tab.path &&
                      'border-l-2 border-l-primary'
                  )}
                  onClick={() => setActiveFileTab(tab.path)}
                  title={tab.path}
                  data-testid={`file-tab-${tab.name}`}
                >
                  <FileText className={cn('shrink-0', isMobile ? 'h-4 w-4' : 'h-3.5 w-3.5')} />
                  <span className="truncate">{tab.name}</span>
                  {/* Worktree branch badge when tabs are from multiple worktrees */}
                  {hasMultipleWorktrees && tab.worktreeBranch && !isMobile && (
                    <span
                      className="text-[9px] px-1 py-px rounded bg-muted text-muted-foreground shrink-0 font-mono"
                      title={`Worktree: ${tab.worktreeBranch}`}
                      data-testid={`tab-worktree-badge-${tab.name}`}
                    >
                      {tab.worktreeBranch}
                    </span>
                  )}
                  {tab.isDirty && (
                    <Circle
                      className="h-2 w-2 shrink-0 fill-primary text-primary"
                      data-testid={`dirty-indicator-${tab.name}`}
                    />
                  )}
                  {/* Close button - always visible on mobile for touch */}
                  <span
                    className={cn(
                      'ml-1 rounded hover:bg-muted-foreground/20 shrink-0',
                      isMobile
                        ? 'p-1 opacity-100'
                        : 'p-0.5 opacity-0 group-hover:opacity-100 transition-opacity'
                    )}
                    onClick={(e) => handleCloseTab(tab.path, e)}
                    role="button"
                    tabIndex={-1}
                    data-testid={`close-tab-${tab.name}`}
                  >
                    <X className={cn(isMobile ? 'h-3.5 w-3.5' : 'h-3 w-3')} />
                  </span>
                </button>
              ))}
              {/* Mobile: fullscreen toggle and save button */}
              {isMobile && activeTab?.isDirty && (
                <button
                  className="flex items-center gap-1 px-3 py-2.5 text-xs text-primary hover:bg-accent/50 active:bg-accent transition-colors shrink-0 ml-auto"
                  onClick={handleSaveActive}
                  data-testid="mobile-save-button"
                >
                  <Save className="h-4 w-4" />
                </button>
              )}
              {isMobile && !isFullscreen && activeTab && (
                <button
                  className="flex items-center gap-1 px-3 py-2.5 text-xs text-muted-foreground hover:bg-accent/50 active:bg-accent transition-colors shrink-0"
                  onClick={() => setIsFullscreen(true)}
                  data-testid="enter-fullscreen-button"
                >
                  <Maximize2 className="h-4 w-4" />
                </button>
              )}
              {/* Save status indicator */}
              {saveStatus && !isMobile && (
                <div className="flex items-center gap-1 px-3 text-xs text-muted-foreground ml-auto">
                  <Save className="h-3 w-3" />
                  {saveStatus}
                </div>
              )}
              {/* Auto-save indicator */}
              {settings.autoSaveEnabled && !saveStatus && !isMobile && (
                <div
                  className="flex items-center gap-1 px-3 text-xs text-muted-foreground/50 ml-auto"
                  title={`Auto-save every ${Math.round(settings.autoSaveIntervalMs / 1000)}s`}
                  data-testid="auto-save-indicator"
                >
                  <Save className="h-3 w-3" />
                  Auto
                </div>
              )}
              {/* Markdown preview toggle (only for .md files) */}
              {activeFileIsMarkdown && (
                <div className="flex items-center gap-1 ml-auto">
                  <button
                    className="px-1.5 py-0.5 rounded text-[10px] bg-muted hover:bg-accent transition-colors"
                    onClick={handleToggleMarkdownPreview}
                    title={`Markdown preview: ${activeMarkdownPreviewMode}`}
                    data-testid="markdown-preview-toggle"
                  >
                    {activeMarkdownPreviewMode === 'preview' ? (
                      <Eye className="h-3 w-3 inline mr-0.5" />
                    ) : activeMarkdownPreviewMode === 'split' ? (
                      <SplitSquareHorizontal className="h-3 w-3 inline mr-0.5" />
                    ) : (
                      <EyeOff className="h-3 w-3 inline mr-0.5" />
                    )}
                  </button>
                </div>
              )}
            </>
          ) : (
            <span className="px-3 py-1.5 text-xs text-muted-foreground/50">No files open</span>
          )}
        </div>
      )}

      {/* Editor Content */}
      {activeTab ? (
        loadingPaths.has(activeTab.path) ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : showDiffView && activeDiffContent ? (
          <div className="flex-1 overflow-auto font-mono text-xs" data-testid="diff-view">
            <div className="p-2">
              {activeDiffContent.split('\n').map((line, i) => {
                let bgClass = '';
                let textClass = 'text-muted-foreground';
                if (line.startsWith('+') && !line.startsWith('+++')) {
                  bgClass = 'bg-green-500/10';
                  textClass = 'text-green-400';
                } else if (line.startsWith('-') && !line.startsWith('---')) {
                  bgClass = 'bg-red-500/10';
                  textClass = 'text-red-400';
                } else if (line.startsWith('@@')) {
                  textClass = 'text-blue-400';
                } else if (line.startsWith('diff') || line.startsWith('index')) {
                  textClass = 'text-muted-foreground font-bold';
                }
                return (
                  <div key={i} className={cn('px-2 py-px whitespace-pre', bgClass, textClass)}>
                    {line || ' '}
                  </div>
                );
              })}
            </div>
          </div>
        ) : activeFileIsMarkdown && activeMarkdownPreviewMode === 'preview' ? (
          <div className="flex-1 overflow-auto">
            <div className="p-4 max-w-4xl mx-auto">
              <Markdown>{activeTab.content}</Markdown>
            </div>
          </div>
        ) : activeFileIsMarkdown && activeMarkdownPreviewMode === 'split' ? (
          <PanelGroup direction="horizontal" autoSaveId="markdown-split-view">
            <Panel defaultSize={50} minSize={20}>
              <div className="h-full overflow-hidden">
                <CodeEditor
                  value={activeTab.content}
                  onChange={handleContentChange}
                  onCursorChange={handleCursorChange}
                  language={activeTab.language}
                  mobile={isMobile}
                  diffHunks={activeDiffHunks}
                  data-testid="code-editor"
                />
              </div>
            </Panel>
            <PanelResizeHandle className="w-[1px] bg-border hover:bg-primary/50 transition-colors" />
            <Panel defaultSize={50} minSize={20}>
              <div className="h-full overflow-auto">
                <div className="p-4">
                  <Markdown>{activeTab.content}</Markdown>
                </div>
              </div>
            </Panel>
          </PanelGroup>
        ) : (
          <div className="flex-1 overflow-hidden">
            <CodeEditor
              value={activeTab.content}
              onChange={handleContentChange}
              onCursorChange={handleCursorChange}
              language={activeTab.language}
              mobile={isMobile}
              diffHunks={activeDiffHunks}
              data-testid="code-editor"
            />
          </div>
        )
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="text-sm">Select a file to open</p>
            <p className="text-xs mt-1 text-muted-foreground/60">
              {isMobile
                ? 'Tap the back arrow to browse files'
                : 'Browse files in the tree on the left'}
            </p>
          </div>
        </div>
      )}

      {/* Status Bar - simplified on mobile, hidden during virtual keyboard */}
      {activeTab && !loadingPaths.has(activeTab.path) && !(isMobile && isVirtualKeyboardOpen) && (
        <div
          className={cn(
            'flex items-center justify-between border-t border-border bg-muted/20 text-xs text-muted-foreground',
            isMobile ? 'px-2 py-1.5 gap-2' : 'px-3 py-1 gap-3'
          )}
          data-testid="files-status-bar"
        >
          {isMobile ? (
            /* Mobile: simplified status bar */
            <>
              <div className="flex items-center gap-2 min-w-0">
                {activeTab.cursorPosition && (
                  <span className="shrink-0" data-testid="cursor-position">
                    Ln {activeTab.cursorPosition.line}
                  </span>
                )}
                {activeTab.language && (
                  <span className="capitalize shrink-0">{activeTab.language}</span>
                )}
                {activeTab.isDirty && (
                  <span className="text-primary shrink-0" data-testid="modified-indicator">
                    Modified
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {saveStatus && (
                  <span className="flex items-center gap-1">
                    <Save className="h-3 w-3" />
                    {saveStatus}
                  </span>
                )}
                {activeFileGitStatus && (
                  <span
                    className={cn(
                      'flex items-center gap-1',
                      activeFileGitStatus.status === 'M' && 'text-yellow-400',
                      activeFileGitStatus.status === 'A' && 'text-green-400',
                      activeFileGitStatus.status === 'D' && 'text-red-400',
                      activeFileGitStatus.status === '?' && 'text-green-500/70'
                    )}
                    data-testid="git-status-indicator"
                  >
                    <GitBranch className="h-3 w-3" />
                    {activeFileGitStatus.statusText}
                  </span>
                )}
              </div>
            </>
          ) : (
            /* Desktop: full status bar */
            <>
              <span className="truncate max-w-[40%]" title={activeTab.path}>
                {activeTab.path}
              </span>
              <div className="flex items-center gap-3">
                {activeTab.cursorPosition && (
                  <span data-testid="cursor-position">
                    Ln {activeTab.cursorPosition.line}, Col {activeTab.cursorPosition.column}
                  </span>
                )}
                {activeTab.language && <span className="capitalize">{activeTab.language}</span>}
                <span>{activeTab.content.split('\n').length} lines</span>
                {fileStats[activeTab.path]?.size !== undefined && (
                  <span className="flex items-center gap-1" title="File size">
                    <HardDrive className="h-3 w-3" />
                    {formatFileSize(fileStats[activeTab.path].size)}
                  </span>
                )}
                {fileStats[activeTab.path]?.mtime && (
                  <span
                    className="flex items-center gap-1"
                    title={`Modified: ${new Date(fileStats[activeTab.path].mtime).toLocaleString()}`}
                  >
                    <Clock className="h-3 w-3" />
                    {formatRelativeDate(new Date(fileStats[activeTab.path].mtime))}
                  </span>
                )}
                {activeFileGitStatus && (
                  <span
                    className={cn(
                      'flex items-center gap-1',
                      activeFileGitStatus.status === 'M' && 'text-yellow-400',
                      activeFileGitStatus.status === 'A' && 'text-green-400',
                      activeFileGitStatus.status === 'D' && 'text-red-400',
                      activeFileGitStatus.status === '?' && 'text-green-500/70'
                    )}
                    data-testid="git-status-indicator"
                  >
                    <GitBranch className="h-3 w-3" />
                    {activeFileGitStatus.statusText}
                  </span>
                )}
                {activeFileGitStatus && isGitRepo && (
                  <span className="flex items-center gap-1">
                    <button
                      className="px-1.5 py-0.5 rounded text-[10px] bg-muted hover:bg-accent transition-colors"
                      onClick={() => setShowDiffView(!showDiffView)}
                      title="Toggle diff view"
                      data-testid="toggle-diff-view"
                    >
                      <Diff className="h-3 w-3 inline mr-0.5" />
                      Diff
                    </button>
                    <button
                      className="px-1.5 py-0.5 rounded text-[10px] bg-muted hover:bg-accent transition-colors"
                      onClick={() => handleGitStage('stage')}
                      title="Stage file"
                      data-testid="git-stage-button"
                    >
                      <Plus className="h-3 w-3 inline mr-0.5" />
                      Stage
                    </button>
                    <button
                      className="px-1.5 py-0.5 rounded text-[10px] bg-muted hover:bg-accent transition-colors"
                      onClick={() => handleGitStage('unstage')}
                      title="Unstage file"
                      data-testid="git-unstage-button"
                    >
                      <Minus className="h-3 w-3 inline mr-0.5" />
                      Unstage
                    </button>
                  </span>
                )}
                {activeTab.isDirty && (
                  <span className="text-primary" data-testid="modified-indicator">
                    Modified
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );

  // Handle worktree selection
  const handleWorktreeSelect = useCallback(
    (worktree: { path: string; branch: string; isMain: boolean } | null) => {
      if (!currentProject) return;
      if (worktree === null || worktree.isMain) {
        // Reset to main project
        setFileEditorWorktree(currentProject.path, null);
      } else {
        setFileEditorWorktree(currentProject.path, {
          path: worktree.path,
          branch: worktree.branch,
        });
      }
      setWorktreeDropdownOpen(false);
      // Refresh git status when switching worktrees
      fetchGitStatus();
    },
    [currentProject, setFileEditorWorktree, fetchGitStatus]
  );

  // Current worktree display label
  const currentWorktreeLabel = selectedWorktree
    ? selectedWorktree.branch
    : currentProject?.path.split('/').pop() || 'Project';

  // --- File tree content (shared between mobile and desktop) ---
  const treeContent = (
    <div className={cn('h-full flex flex-col', !isMobile && 'border-r border-border')}>
      {/* Tree Header */}
      <div
        className={cn(
          'flex items-center gap-2 px-3 border-b border-border bg-muted/30',
          isMobile ? 'py-3' : 'py-2'
        )}
      >
        <FolderOpen
          className={cn('text-muted-foreground shrink-0', isMobile ? 'h-5 w-5' : 'h-4 w-4')}
        />
        <span
          className={cn(
            'font-medium text-muted-foreground truncate uppercase tracking-wide flex-1',
            isMobile ? 'text-sm' : 'text-xs'
          )}
          title={effectiveRootPath}
        >
          {effectiveRootPath.split('/').pop() || currentProject.path}
        </span>
        {/* Search button */}
        <button
          className={cn(
            'rounded hover:bg-accent/50 text-muted-foreground shrink-0',
            isMobile ? 'p-1.5' : 'p-0.5'
          )}
          onClick={() => setIsSearchOpen(true)}
          title="Search files (Cmd+P)"
          data-testid="file-search-button"
        >
          <Search className={cn(isMobile ? 'h-4 w-4' : 'h-3.5 w-3.5')} />
        </button>
        {/* Desktop: collapse tree button */}
        {!isMobile && (
          <button
            className="p-0.5 rounded hover:bg-accent/50 text-muted-foreground shrink-0"
            onClick={toggleTreePanel}
            title="Hide file tree (Cmd+B)"
            data-testid="hide-tree-button"
          >
            <PanelLeftClose className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {/* Worktree Selector */}
      {worktrees.length > 1 && (
        <div className="relative" ref={worktreeDropdownRef}>
          <button
            className={cn(
              'flex items-center gap-1.5 w-full px-3 border-b border-border bg-muted/10 hover:bg-muted/30 transition-colors text-left',
              isMobile ? 'py-2.5' : 'py-1.5'
            )}
            onClick={() => setWorktreeDropdownOpen(!worktreeDropdownOpen)}
            data-testid="worktree-selector"
          >
            <GitBranch
              className={cn('text-primary shrink-0', isMobile ? 'h-4 w-4' : 'h-3.5 w-3.5')}
            />
            <span className={cn('truncate flex-1 font-medium', isMobile ? 'text-sm' : 'text-xs')}>
              {currentWorktreeLabel}
            </span>
            <ChevronDown
              className={cn(
                'text-muted-foreground shrink-0 transition-transform',
                isMobile ? 'h-4 w-4' : 'h-3 w-3',
                worktreeDropdownOpen && 'rotate-180'
              )}
            />
          </button>
          {worktreeDropdownOpen && (
            <div
              className="absolute left-0 right-0 z-50 bg-popover border border-border rounded-b-md shadow-lg max-h-[240px] overflow-y-auto"
              data-testid="worktree-dropdown"
            >
              {worktrees.map((wt) => {
                const isSelected = wt.isMain
                  ? !selectedWorktree
                  : selectedWorktree?.path === wt.path;
                return (
                  <button
                    key={wt.path}
                    className={cn(
                      'flex items-center gap-2 w-full px-3 text-left hover:bg-accent/50 transition-colors',
                      isMobile ? 'py-2.5 text-sm' : 'py-1.5 text-xs',
                      isSelected && 'bg-accent/30 text-accent-foreground'
                    )}
                    onClick={() => handleWorktreeSelect(wt)}
                    data-testid={`worktree-option-${wt.branch}`}
                  >
                    <GitBranch
                      className={cn(
                        'shrink-0',
                        isMobile ? 'h-4 w-4' : 'h-3 w-3',
                        wt.isMain ? 'text-green-400' : 'text-primary'
                      )}
                    />
                    <span className="truncate flex-1">{wt.branch}</span>
                    {wt.isMain && (
                      <span
                        className={cn(
                          'text-muted-foreground shrink-0',
                          isMobile ? 'text-[10px]' : 'text-[9px]'
                        )}
                      >
                        main
                      </span>
                    )}
                    {wt.hasChanges && (
                      <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0" />
                    )}
                    {isSelected && (
                      <span
                        className={cn(
                          'text-primary font-bold shrink-0',
                          isMobile ? 'text-xs' : 'text-[10px]'
                        )}
                      >
                        &#10003;
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
      {/* Tree Content */}
      <FileTree
        key={treeRefreshKey}
        rootPath={effectiveRootPath}
        selectedFile={activeTabPath || undefined}
        onFileSelect={handleFileSelect}
        onRename={handleRenameStart}
        onDelete={handleDeleteRequest}
        onCreateFile={handleCreateFile}
        onCreateFolder={handleCreateFolder}
        onCopyPath={handleCopyPath}
        onCopyRelativePath={handleCopyRelativePath}
        renamingPath={renamingPath}
        onRenameSubmit={handleRenameSubmit}
        onRenameCancel={handleRenameCancel}
        creatingIn={creatingIn}
        onCreateSubmit={handleCreateSubmit}
        onCreateCancel={handleCreateCancel}
        touchMode={isMobile}
        gitStatusMap={gitStatusMap}
        data-testid="files-tree"
      />

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        onConfirm={handleDeleteConfirm}
        title={`Delete ${deleteTarget?.isDirectory ? 'folder' : 'file'}?`}
        description={`Are you sure you want to delete "${deleteTarget?.path.split('/').pop() || ''}"? This action cannot be undone.`}
        confirmText={`Delete ${deleteTarget?.isDirectory ? 'Folder' : 'File'}`}
        testId="file-delete-confirm-dialog"
        confirmTestId="confirm-file-delete-button"
      />

      {/* File Search Dialog (CMD/CTRL+P) */}
      <FileSearchDialog
        open={isSearchOpen}
        onOpenChange={setIsSearchOpen}
        rootPath={effectiveRootPath}
        onFileSelect={handleFileSelect}
      />
    </div>
  );

  // --- Mobile layout: full-screen switching between tree and editor ---
  if (isMobile) {
    return (
      <div
        className="flex-1 flex flex-col overflow-hidden content-bg"
        data-testid="files-view"
        onKeyDown={handleKeyDown}
      >
        {mobileShowTree ? (
          <div className="h-full flex flex-col" data-testid="mobile-tree-panel">
            {treeContent}
          </div>
        ) : (
          <div className="h-full flex flex-col" data-testid="mobile-editor-panel">
            {editorContent}
          </div>
        )}
      </div>
    );
  }

  // --- Desktop layout: resizable split panels ---
  return (
    <div
      className="flex-1 flex flex-col overflow-hidden content-bg"
      data-testid="files-view"
      onKeyDown={handleKeyDown}
    >
      <PanelGroup direction="horizontal" autoSaveId="files-view-layout">
        {/* File Tree Sidebar */}
        <Panel
          ref={treePanelRef}
          defaultSize={22}
          minSize={15}
          maxSize={40}
          collapsible
          collapsedSize={0}
          onCollapse={() => setIsTreeCollapsed(true)}
          onExpand={() => setIsTreeCollapsed(false)}
          data-testid="tree-panel"
        >
          {treeContent}
        </Panel>

        <PanelResizeHandle
          className={cn(
            'w-[1px] bg-border hover:bg-primary/50 transition-colors data-[resize-handle-active]:bg-primary',
            isTreeCollapsed && 'w-0'
          )}
          data-testid="panel-resize-handle"
        />

        {/* Editor Area */}
        <Panel defaultSize={78} minSize={40} data-testid="editor-panel">
          {editorContent}
        </Panel>
      </PanelGroup>
    </div>
  );
}
