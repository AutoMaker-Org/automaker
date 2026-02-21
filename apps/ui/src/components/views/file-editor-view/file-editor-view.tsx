import { useEffect, useCallback, useRef, useState, useMemo } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import {
  FileCode2,
  Save,
  FileWarning,
  Binary,
  Circle,
  PanelLeftOpen,
  Search,
  Undo2,
  Redo2,
  Settings,
} from 'lucide-react';
import { createLogger } from '@automaker/utils/logger';
import { useAppStore } from '@/store/app-store';
import { getElectronAPI } from '@/lib/electron';
import { useIsMobile } from '@/hooks/use-media-query';
import { useVirtualKeyboardResize } from '@/hooks/use-virtual-keyboard-resize';
import { Button } from '@/components/ui/button';
import {
  HeaderActionsPanel,
  HeaderActionsPanelTrigger,
} from '@/components/ui/header-actions-panel';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

import { toast } from 'sonner';
import {
  useFileEditorStore,
  type FileTreeNode,
  type EnhancedGitFileStatus,
} from './use-file-editor-store';
import { FileTree } from './components/file-tree';
import { CodeEditor, getLanguageName, type CodeEditorHandle } from './components/code-editor';
import { EditorTabs } from './components/editor-tabs';
import { EditorSettingsForm } from './components/editor-settings-form';
import {
  MarkdownPreviewPanel,
  MarkdownViewToolbar,
  isMarkdownFile,
} from './components/markdown-preview';
import { WorktreeDirectoryDropdown } from './components/worktree-directory-dropdown';
import { GitDetailPanel } from './components/git-detail-panel';

const logger = createLogger('FileEditorView');

// Files with these extensions are considered binary
const BINARY_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'bmp',
  'ico',
  'svg',
  'webp',
  'avif',
  'mp3',
  'mp4',
  'wav',
  'ogg',
  'webm',
  'avi',
  'mov',
  'flac',
  'zip',
  'tar',
  'gz',
  'bz2',
  'xz',
  '7z',
  'rar',
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'exe',
  'dll',
  'so',
  'dylib',
  'bin',
  'dat',
  'woff',
  'woff2',
  'ttf',
  'otf',
  'eot',
  'sqlite',
  'db',
]);

function isBinaryFile(filePath: string): boolean {
  // Extract the filename from the full path first, then get the extension.
  // Using split('/').pop() ensures we don't confuse dots in directory names
  // with the file extension. Files without an extension (no dot after the
  // last slash) correctly return '' here.
  const fileName = filePath.split('/').pop() || '';
  const dotIndex = fileName.lastIndexOf('.');
  // No dot found, or dot is at index 0 (dotfile like ".gitignore") → no extension
  if (dotIndex <= 0) return false;
  const ext = fileName.slice(dotIndex + 1).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

interface FileEditorViewProps {
  initialPath?: string;
}

export function FileEditorView({ initialPath }: FileEditorViewProps) {
  const { currentProject } = useAppStore();
  const currentWorktree = useAppStore((s) =>
    currentProject?.path ? (s.currentWorktreeByProject[currentProject.path] ?? null) : null
  );
  // Read persisted editor font settings from app store
  const editorFontSize = useAppStore((s) => s.editorFontSize);
  const editorFontFamily = useAppStore((s) => s.editorFontFamily);
  const setEditorFontSize = useAppStore((s) => s.setEditorFontSize);
  const setEditorFontFamily = useAppStore((s) => s.setEditorFontFamily);
  // Auto-save settings
  const editorAutoSave = useAppStore((s) => s.editorAutoSave);
  const editorAutoSaveDelay = useAppStore((s) => s.editorAutoSaveDelay);
  const setEditorAutoSave = useAppStore((s) => s.setEditorAutoSave);
  const store = useFileEditorStore();
  const isMobile = useIsMobile();
  const loadedProjectRef = useRef<string | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const editorRef = useRef<CodeEditorHandle>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showActionsPanel, setShowActionsPanel] = useState(false);

  // Derive the effective working path from the current worktree selection.
  // When a worktree is selected (path is non-null), use the worktree path;
  // otherwise fall back to the main project path.
  const effectivePath = useMemo(() => {
    if (!currentProject?.path) return null;
    return currentWorktree?.path ?? currentProject.path;
  }, [currentProject?.path, currentWorktree?.path]);

  // Track virtual keyboard height on mobile to prevent content from being hidden
  const { keyboardHeight, isKeyboardOpen } = useVirtualKeyboardResize();

  const {
    tabs,
    activeTabId,
    markdownViewMode,
    mobileBrowserVisible,
    tabSize,
    wordWrap,
    maxFileSize,
    setFileTree,
    openTab,
    closeTab,
    closeAllTabs,
    setActiveTab,
    markTabSaved,
    setMarkdownViewMode,
    setMobileBrowserVisible,
    setGitStatusMap,
    setExpandedFolders,
    setEnhancedGitStatusMap,
    setGitBranch,
    setActiveFileGitDetails,
    activeFileGitDetails,
    gitBranch,
    enhancedGitStatusMap,
  } = store;

  const activeTab = tabs.find((t) => t.id === activeTabId) || null;

  // ─── Load File Tree ──────────────────────────────────────────
  const loadTree = useCallback(
    async (basePath?: string, options?: { preserveExpanded?: boolean }) => {
      const treePath = basePath || effectivePath;
      if (!treePath) return;

      // Snapshot expanded folders before loading so we can restore them after
      // (loadTree resets expandedFolders by default on initial load, but
      // refreshes triggered by file/folder operations should preserve state)
      const expandedSnapshot = options?.preserveExpanded
        ? new Set(useFileEditorStore.getState().expandedFolders)
        : null;

      try {
        const api = getElectronAPI();

        // Recursive tree builder
        const buildTree = async (dirPath: string, depth: number = 0): Promise<FileTreeNode[]> => {
          const result = await api.readdir(dirPath);
          if (!result.success || !result.entries) return [];

          const nodes: FileTreeNode[] = result.entries
            .sort((a, b) => {
              if (a.isDirectory && !b.isDirectory) return -1;
              if (!a.isDirectory && b.isDirectory) return 1;
              return a.name.localeCompare(b.name);
            })
            .map((entry) => ({
              name: entry.name,
              path: `${dirPath}/${entry.name}`,
              isDirectory: entry.isDirectory,
            }));

          // Load first level of children for directories (lazy after that)
          if (depth < 1) {
            for (const node of nodes) {
              if (node.isDirectory) {
                node.children = await buildTree(node.path, depth + 1);
              }
            }
          }

          return nodes;
        };

        const tree = await buildTree(treePath);
        setFileTree(tree);

        if (expandedSnapshot !== null) {
          // Restore previously expanded folders after refresh
          setExpandedFolders(expandedSnapshot);
        } else {
          // Folders are collapsed by default — do not auto-expand any directories
          setExpandedFolders(new Set());
        }
      } catch (error) {
        logger.error('Failed to load file tree:', error);
      }
    },
    [effectivePath, setFileTree, setExpandedFolders]
  );

  // ─── Load Git Status ─────────────────────────────────────────
  const loadGitStatus = useCallback(async () => {
    if (!effectivePath) return;

    try {
      const api = getElectronAPI();
      if (!api.git) return;

      // Load basic diffs (backwards-compatible)
      const result = await api.git.getDiffs(effectivePath);
      if (result.success && result.files) {
        const statusMap = new Map<string, string>();
        for (const file of result.files) {
          const fullPath = `${effectivePath}/${file.path}`;
          // Determine status - prefer workTree, fallback to index
          let status = file.workTreeStatus || file.indexStatus || file.status;
          if (status === ' ') status = file.indexStatus || '';
          if (status) {
            statusMap.set(fullPath, status);
          }
        }
        setGitStatusMap(statusMap);
      }

      // Also load enhanced status (with diff stats and staged/unstaged info)
      try {
        const enhancedResult = await api.git.getEnhancedStatus(effectivePath);
        if (enhancedResult.success) {
          if (enhancedResult.branch) {
            setGitBranch(enhancedResult.branch);
          }
          if (enhancedResult.files) {
            const enhancedMap = new Map<string, EnhancedGitFileStatus>();
            for (const file of enhancedResult.files) {
              const fullPath = `${effectivePath}/${file.path}`;
              enhancedMap.set(fullPath, {
                indexStatus: file.indexStatus,
                workTreeStatus: file.workTreeStatus,
                isConflicted: file.isConflicted,
                isStaged: file.isStaged,
                isUnstaged: file.isUnstaged,
                linesAdded: file.linesAdded,
                linesRemoved: file.linesRemoved,
                statusLabel: file.statusLabel,
              });
            }
            setEnhancedGitStatusMap(enhancedMap);
          }
        }
      } catch {
        // Enhanced status not available - that's okay
      }
    } catch (error) {
      // Git might not be available - that's okay
      logger.debug('Git status not available:', error);
    }
  }, [effectivePath, setGitStatusMap, setEnhancedGitStatusMap, setGitBranch]);

  // ─── Load subdirectory children lazily ───────────────────────
  const loadSubdirectory = useCallback(async (dirPath: string): Promise<FileTreeNode[]> => {
    try {
      const api = getElectronAPI();
      const result = await api.readdir(dirPath);
      if (!result.success || !result.entries) return [];

      const nodes: FileTreeNode[] = result.entries
        .sort((a, b) => {
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return a.name.localeCompare(b.name);
        })
        .map((entry) => ({
          name: entry.name,
          path: `${dirPath}/${entry.name}`,
          isDirectory: entry.isDirectory,
        }));

      // Pre-load first level of children for subdirectories so they can be expanded next
      for (const node of nodes) {
        if (node.isDirectory) {
          try {
            const subResult = await api.readdir(node.path);
            if (subResult.success && subResult.entries) {
              node.children = subResult.entries
                .sort((a, b) => {
                  if (a.isDirectory && !b.isDirectory) return -1;
                  if (!a.isDirectory && b.isDirectory) return 1;
                  return a.name.localeCompare(b.name);
                })
                .map((entry) => ({
                  name: entry.name,
                  path: `${node.path}/${entry.name}`,
                  isDirectory: entry.isDirectory,
                }));
            }
          } catch {
            // Failed to pre-load children, they'll be loaded on expand
          }
        }
      }

      return nodes;
    } catch (error) {
      logger.error('Failed to load subdirectory:', error);
      return [];
    }
  }, []);

  // ─── Handle File Select ──────────────────────────────────────
  const handleFileSelect = useCallback(
    async (filePath: string) => {
      // Check if already open
      const existing = tabs.find((t) => t.filePath === filePath);
      if (existing) {
        setActiveTab(existing.id);
        return;
      }

      const fileName = filePath.split('/').pop() || 'untitled';

      // Check if binary
      if (isBinaryFile(filePath)) {
        openTab({
          filePath,
          fileName,
          content: '',
          originalContent: '',
          isDirty: false,
          scrollTop: 0,
          cursorLine: 1,
          cursorCol: 1,
          isBinary: true,
          isTooLarge: false,
          fileSize: 0,
        });
        return;
      }

      try {
        const api = getElectronAPI();

        // Check file size first
        const statResult = await api.stat(filePath);
        const fileSize = statResult.success && statResult.stats ? statResult.stats.size : 0;

        if (fileSize > maxFileSize) {
          openTab({
            filePath,
            fileName,
            content: '',
            originalContent: '',
            isDirty: false,
            scrollTop: 0,
            cursorLine: 1,
            cursorCol: 1,
            isBinary: false,
            isTooLarge: true,
            fileSize,
          });
          return;
        }

        // Read file content
        const result = await api.readFile(filePath);
        if (result.success && result.content !== undefined) {
          // Check if content looks binary (contains null bytes)
          if (result.content.includes('\0')) {
            openTab({
              filePath,
              fileName,
              content: '',
              originalContent: '',
              isDirty: false,
              scrollTop: 0,
              cursorLine: 1,
              cursorCol: 1,
              isBinary: true,
              isTooLarge: false,
              fileSize,
            });
            return;
          }

          openTab({
            filePath,
            fileName,
            content: result.content,
            originalContent: result.content,
            isDirty: false,
            scrollTop: 0,
            cursorLine: 1,
            cursorCol: 1,
            isBinary: false,
            isTooLarge: false,
            fileSize,
          });
        }
      } catch (error) {
        logger.error('Failed to open file:', error);
      }
    },
    [tabs, setActiveTab, openTab, maxFileSize]
  );

  // ─── Mobile-aware file select ────────────────────────────────
  const handleMobileFileSelect = useCallback(
    async (filePath: string) => {
      await handleFileSelect(filePath);
      if (isMobile) {
        setMobileBrowserVisible(false);
      }
    },
    [handleFileSelect, isMobile, setMobileBrowserVisible]
  );

  // ─── Handle Save ─────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!activeTab || !activeTab.isDirty) return;

    try {
      const api = getElectronAPI();
      const result = await api.writeFile(activeTab.filePath, activeTab.content);

      if (result.success) {
        markTabSaved(activeTab.id, activeTab.content);
        // Refresh git status after save
        loadGitStatus();
      } else {
        logger.error('Failed to save file:', result.error);
      }
    } catch (error) {
      logger.error('Failed to save file:', error);
    }
  }, [activeTab, markTabSaved, loadGitStatus]);

  // ─── Auto Save: save a specific tab by ID ───────────────────
  const saveTabById = useCallback(
    async (tabId: string) => {
      const { tabs: currentTabs } = useFileEditorStore.getState();
      const tab = currentTabs.find((t) => t.id === tabId);
      if (!tab || !tab.isDirty) return;

      try {
        const api = getElectronAPI();
        const result = await api.writeFile(tab.filePath, tab.content);

        if (result.success) {
          markTabSaved(tab.id, tab.content);
          loadGitStatus();
        } else {
          logger.error('Auto-save failed:', result.error);
        }
      } catch (error) {
        logger.error('Auto-save failed:', error);
      }
    },
    [markTabSaved, loadGitStatus]
  );

  // ─── Auto Save: on tab switch ──────────────────────────────
  const prevActiveTabIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!editorAutoSave) {
      prevActiveTabIdRef.current = activeTabId;
      return;
    }

    const prevTabId = prevActiveTabIdRef.current;
    prevActiveTabIdRef.current = activeTabId;

    // When switching away from a dirty tab, auto-save it
    if (prevTabId && prevTabId !== activeTabId) {
      saveTabById(prevTabId);
    }
  }, [activeTabId, editorAutoSave, saveTabById]);

  // ─── Auto Save: after timeout on content change ────────────
  useEffect(() => {
    if (!editorAutoSave || !activeTab || !activeTab.isDirty) {
      // Clear any pending auto-save timer
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      return;
    }

    // Debounce: set a timer to save after the configured delay
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(() => {
      handleSave();
      autoSaveTimerRef.current = null;
    }, editorAutoSaveDelay);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [editorAutoSave, editorAutoSaveDelay, activeTab?.isDirty, activeTab?.content, handleSave]);

  // ─── Handle Search ──────────────────────────────────────────
  const handleSearch = useCallback(() => {
    if (editorRef.current) {
      editorRef.current.openSearch();
    }
  }, []);

  // ─── Handle Undo ───────────────────────────────────────────
  const handleUndo = useCallback(() => {
    if (editorRef.current) {
      editorRef.current.undo();
    }
  }, []);

  // ─── Handle Redo ───────────────────────────────────────────
  const handleRedo = useCallback(() => {
    if (editorRef.current) {
      editorRef.current.redo();
    }
  }, []);

  // ─── File Operations ─────────────────────────────────────────
  const handleCreateFile = useCallback(
    async (parentPath: string, name: string) => {
      if (!effectivePath) return;
      const fullPath = parentPath ? `${parentPath}/${name}` : `${effectivePath}/${name}`;

      try {
        const api = getElectronAPI();
        await api.writeFile(fullPath, '');

        // If the new file starts with a dot, auto-enable hidden files visibility
        // so the created file doesn't "disappear" from the tree
        if (name.startsWith('.')) {
          const { showHiddenFiles } = useFileEditorStore.getState();
          if (!showHiddenFiles) {
            store.setShowHiddenFiles(true);
          }
        }

        // Preserve expanded folders so the parent directory stays open after refresh
        await loadTree(undefined, { preserveExpanded: true });
        // Open the newly created file (use mobile-aware select on mobile)
        if (isMobile) {
          handleMobileFileSelect(fullPath);
        } else {
          handleFileSelect(fullPath);
        }
      } catch (error) {
        logger.error('Failed to create file:', error);
      }
    },
    [effectivePath, loadTree, handleFileSelect, handleMobileFileSelect, isMobile, store]
  );

  const handleCreateFolder = useCallback(
    async (parentPath: string, name: string) => {
      if (!effectivePath) return;
      const fullPath = parentPath ? `${parentPath}/${name}` : `${effectivePath}/${name}`;

      try {
        const api = getElectronAPI();
        await api.mkdir(fullPath);

        // If the new folder starts with a dot, auto-enable hidden files visibility
        // so the created folder doesn't "disappear" from the tree
        if (name.startsWith('.')) {
          const { showHiddenFiles } = useFileEditorStore.getState();
          if (!showHiddenFiles) {
            store.setShowHiddenFiles(true);
          }
        }

        // Preserve expanded folders so the parent directory stays open after refresh
        await loadTree(undefined, { preserveExpanded: true });
      } catch (error) {
        logger.error('Failed to create folder:', error);
      }
    },
    [effectivePath, loadTree, store]
  );

  const handleDeleteItem = useCallback(
    async (path: string, _isDirectory: boolean) => {
      try {
        const api = getElectronAPI();
        // Use trashItem if available (safer), fallback to deleteFile
        if (api.trashItem) {
          await api.trashItem(path);
        } else {
          await api.deleteFile(path);
        }

        // Close tab if the deleted file is open
        const tab = tabs.find((t) => t.filePath === path);
        if (tab) {
          closeTab(tab.id);
        }

        // Preserve expanded folders so siblings of the deleted item remain visible
        await loadTree(undefined, { preserveExpanded: true });
        loadGitStatus();
      } catch (error) {
        logger.error('Failed to delete item:', error);
      }
    },
    [tabs, closeTab, loadTree, loadGitStatus]
  );

  const handleRenameItem = useCallback(
    async (oldPath: string, newName: string) => {
      // Extract the current file/folder name from the old path
      const oldName = oldPath.split('/').pop() || '';

      // If the name hasn't changed, skip the rename entirely (no-op)
      if (newName === oldName) return;

      const parentPath = oldPath.substring(0, oldPath.lastIndexOf('/'));
      const newPath = `${parentPath}/${newName}`;

      try {
        const api = getElectronAPI();

        // Use the moveItem API for an atomic rename (works for both files and directories)
        const result = await api.moveItem?.(oldPath, newPath);

        if (result?.success) {
          // Update the open tab if it was renamed
          const tab = tabs.find((t) => t.filePath === oldPath);
          if (tab) {
            closeTab(tab.id);
            if (isMobile) {
              handleMobileFileSelect(newPath);
            } else {
              handleFileSelect(newPath);
            }
          }

          // If the new name starts with a dot, auto-enable hidden files visibility
          // so the renamed file doesn't "disappear" from the tree
          if (newName.startsWith('.')) {
            const { showHiddenFiles } = useFileEditorStore.getState();
            if (!showHiddenFiles) {
              store.setShowHiddenFiles(true);
            }
          }

          await loadTree(undefined, { preserveExpanded: true });
          loadGitStatus();
        } else {
          toast.error('Rename failed', { description: result?.error });
        }
      } catch (error) {
        logger.error('Failed to rename item:', error);
      }
    },
    [
      tabs,
      closeTab,
      handleFileSelect,
      handleMobileFileSelect,
      isMobile,
      loadTree,
      loadGitStatus,
      store,
    ]
  );

  // ─── Handle Copy Item ────────────────────────────────────────
  const handleCopyItem = useCallback(
    async (sourcePath: string, destinationPath: string) => {
      try {
        const api = getElectronAPI();
        if (!api.copyItem) {
          toast.error('Copy not supported');
          return;
        }

        // First try without overwrite
        const result = await api.copyItem(sourcePath, destinationPath);
        if (!result.success && result.exists) {
          // Ask for confirmation to overwrite
          const confirmed = window.confirm(
            `"${destinationPath.split('/').pop()}" already exists at the destination. Do you want to replace it?`
          );
          if (confirmed) {
            const retryResult = await api.copyItem(sourcePath, destinationPath, true);
            if (retryResult.success) {
              toast.success('Copied successfully');
              await loadTree(undefined, { preserveExpanded: true });
              loadGitStatus();
            } else {
              toast.error('Copy failed', { description: retryResult.error });
            }
          }
        } else if (result.success) {
          toast.success('Copied successfully');
          await loadTree(undefined, { preserveExpanded: true });
          loadGitStatus();
        } else {
          toast.error('Copy failed', { description: result.error });
        }
      } catch (error) {
        logger.error('Failed to copy item:', error);
        toast.error('Copy failed', {
          description: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
    [loadTree, loadGitStatus]
  );

  // ─── Handle Move Item ──────────────────────────────────────
  const handleMoveItem = useCallback(
    async (sourcePath: string, destinationPath: string) => {
      try {
        const api = getElectronAPI();
        if (!api.moveItem) {
          toast.error('Move not supported');
          return;
        }

        // First try without overwrite
        const result = await api.moveItem(sourcePath, destinationPath);
        if (!result.success && result.exists) {
          // Ask for confirmation to overwrite
          const confirmed = window.confirm(
            `"${destinationPath.split('/').pop()}" already exists at the destination. Do you want to replace it?`
          );
          if (confirmed) {
            const retryResult = await api.moveItem(sourcePath, destinationPath, true);
            if (retryResult.success) {
              toast.success('Moved successfully');
              // Update open tabs that point to moved files
              const tab = tabs.find((t) => t.filePath === sourcePath);
              if (tab) {
                closeTab(tab.id);
                handleFileSelect(destinationPath);
              }
              await loadTree(undefined, { preserveExpanded: true });
              loadGitStatus();
            } else {
              toast.error('Move failed', { description: retryResult.error });
            }
          }
        } else if (result.success) {
          toast.success('Moved successfully');
          // Update open tabs that point to moved files
          const tab = tabs.find((t) => t.filePath === sourcePath);
          if (tab) {
            closeTab(tab.id);
            handleFileSelect(destinationPath);
          }
          await loadTree(undefined, { preserveExpanded: true });
          loadGitStatus();
        } else {
          toast.error('Move failed', { description: result.error });
        }
      } catch (error) {
        logger.error('Failed to move item:', error);
        toast.error('Move failed', {
          description: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
    [tabs, closeTab, handleFileSelect, loadTree, loadGitStatus]
  );

  // ─── Handle Download Item ──────────────────────────────────
  const handleDownloadItem = useCallback(async (filePath: string) => {
    try {
      const api = getElectronAPI();
      if (!api.downloadItem) {
        toast.error('Download not supported');
        return;
      }
      toast.info('Starting download...');
      await api.downloadItem(filePath);
      toast.success('Download complete');
    } catch (error) {
      logger.error('Failed to download item:', error);
      toast.error('Download failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }, []);

  // ─── Handle Drag and Drop Move ─────────────────────────────
  const handleDragDropMove = useCallback(
    async (sourcePaths: string[], targetFolderPath: string) => {
      for (const sourcePath of sourcePaths) {
        const fileName = sourcePath.split('/').pop() || '';
        const destinationPath = `${targetFolderPath}/${fileName}`;

        // Prevent moving to the same location
        const sourceDir = sourcePath.substring(0, sourcePath.lastIndexOf('/'));
        if (sourceDir === targetFolderPath) continue;

        await handleMoveItem(sourcePath, destinationPath);
      }
    },
    [handleMoveItem]
  );

  // ─── Load git details for active file ──────────────────────
  const loadFileGitDetails = useCallback(
    async (filePath: string) => {
      if (!effectivePath) return;
      try {
        const api = getElectronAPI();
        if (!api.git?.getDetails) return;

        // Get relative path
        const relativePath = filePath.startsWith(effectivePath)
          ? filePath.substring(effectivePath.length + 1)
          : filePath;

        const result = await api.git.getDetails(effectivePath, relativePath);
        if (result.success && result.details) {
          setActiveFileGitDetails(result.details);
        } else {
          setActiveFileGitDetails(null);
        }
      } catch {
        setActiveFileGitDetails(null);
      }
    },
    [effectivePath, setActiveFileGitDetails]
  );

  // Load git details when active tab changes
  useEffect(() => {
    if (activeTab && !activeTab.isBinary) {
      loadFileGitDetails(activeTab.filePath);
    } else {
      setActiveFileGitDetails(null);
    }
  }, [activeTab?.filePath, activeTab?.isBinary, loadFileGitDetails, setActiveFileGitDetails]);

  // ─── Handle Cursor Change ────────────────────────────────────
  // Stable callback to avoid recreating CodeMirror extensions on every render.
  // Accessing activeTabId from the store directly prevents this callback from
  // changing every time the active tab switches (which would trigger an infinite
  // update loop: cursor change → extension rebuild → view update → cursor change).
  const handleCursorChange = useCallback((line: number, col: number) => {
    const { activeTabId: currentActiveTabId } = useFileEditorStore.getState();
    if (currentActiveTabId) {
      useFileEditorStore.getState().updateTabCursor(currentActiveTabId, line, col);
    }
  }, []);

  // ─── Handle Editor Content Change ────────────────────────────
  // Stable callback to avoid recreating CodeMirror extensions on every render.
  // Reading activeTabId from getState() keeps the reference identity stable.
  const handleEditorChange = useCallback((val: string) => {
    const { activeTabId: currentActiveTabId } = useFileEditorStore.getState();
    if (currentActiveTabId) {
      useFileEditorStore.getState().updateTabContent(currentActiveTabId, val);
    }
  }, []);

  // ─── Handle Copy Path ────────────────────────────────────────
  const handleCopyPath = useCallback(async (path: string) => {
    try {
      await navigator.clipboard.writeText(path);
    } catch (error) {
      logger.error('Failed to copy path to clipboard:', error);
    }
  }, []);

  // ─── Handle folder expand (lazy load children) ───────────────
  const handleToggleFolder = useCallback(
    async (path: string) => {
      const { expandedFolders, fileTree } = useFileEditorStore.getState();

      if (!expandedFolders.has(path)) {
        // Loading children for newly expanded folder
        const findNode = (nodes: FileTreeNode[]): FileTreeNode | null => {
          for (const n of nodes) {
            if (n.path === path) return n;
            if (n.children) {
              const found = findNode(n.children);
              if (found) return found;
            }
          }
          return null;
        };

        const node = findNode(fileTree);
        if (node && !node.children) {
          const children = await loadSubdirectory(path);
          // Update the tree with loaded children
          const updateChildren = (nodes: FileTreeNode[]): FileTreeNode[] => {
            return nodes.map((n) => {
              if (n.path === path) return { ...n, children };
              if (n.children) return { ...n, children: updateChildren(n.children) };
              return n;
            });
          };
          setFileTree(updateChildren(fileTree));
        }
      }

      // Access toggleFolder via getState() to avoid capturing a new store reference
      // on every render, which would make this useCallback's dependency unstable.
      useFileEditorStore.getState().toggleFolder(path);
    },
    [loadSubdirectory, setFileTree]
  );

  // ─── Initial Load ────────────────────────────────────────────
  // Reload the file tree and git status when the effective working directory changes
  // (either from switching projects or switching worktrees)
  useEffect(() => {
    if (!effectivePath) return;
    if (loadedProjectRef.current === effectivePath) return;

    loadedProjectRef.current = effectivePath;
    loadTree();
    loadGitStatus();

    // Set up periodic refresh for git status (every 10 seconds)
    refreshTimerRef.current = setInterval(() => {
      loadGitStatus();
    }, 10000);

    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
    };
  }, [effectivePath, loadTree, loadGitStatus]);

  // Open initial path if provided
  useEffect(() => {
    if (initialPath) {
      if (isMobile) {
        handleMobileFileSelect(initialPath);
      } else {
        handleFileSelect(initialPath);
      }
    }
  }, [initialPath, handleFileSelect, handleMobileFileSelect, isMobile]);

  // ─── Handle Tab Close with Dirty Check ───────────────────────
  const handleTabClose = useCallback(
    (tabId: string) => {
      const tab = tabs.find((t) => t.id === tabId);
      if (tab?.isDirty) {
        const shouldClose = window.confirm(
          `"${tab.fileName}" has unsaved changes. Are you sure you want to close it?`
        );
        if (!shouldClose) return;
      }
      closeTab(tabId);
    },
    [tabs, closeTab]
  );

  // ─── Handle Close All Tabs with Dirty Check ──────────────────
  const handleCloseAll = useCallback(() => {
    const dirtyTabs = tabs.filter((t) => t.isDirty);
    if (dirtyTabs.length > 0) {
      const fileList = dirtyTabs.map((t) => `  • ${t.fileName}`).join('\n');
      const shouldClose = window.confirm(
        `${dirtyTabs.length} file${dirtyTabs.length > 1 ? 's have' : ' has'} unsaved changes:\n${fileList}\n\nAre you sure you want to close all tabs?`
      );
      if (!shouldClose) return;
    }
    closeAllTabs();
  }, [tabs, closeAllTabs]);

  // ─── Rendering ───────────────────────────────────────────────
  if (!currentProject) {
    return (
      <div className="flex-1 flex items-center justify-center" data-testid="file-editor-no-project">
        <p className="text-muted-foreground">No project selected</p>
      </div>
    );
  }

  const isMarkdown = activeTab ? isMarkdownFile(activeTab.filePath) : false;
  const showPreview = isMarkdown && markdownViewMode !== 'editor';
  const showEditor = !isMarkdown || markdownViewMode !== 'preview';

  // ─── Editor Panel Content (shared between mobile and desktop) ──
  const renderEditorPanel = () => (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <EditorTabs
        tabs={tabs}
        activeTabId={activeTabId}
        onTabSelect={setActiveTab}
        onTabClose={handleTabClose}
        onCloseAll={handleCloseAll}
        onSave={handleSave}
        isDirty={activeTab?.isDirty && !activeTab?.isBinary && !activeTab?.isTooLarge}
        showSaveButton={isMobile && !!activeTab && !activeTab.isBinary && !activeTab.isTooLarge}
      />

      {/* Editor content */}
      {activeTab ? (
        <div className="flex-1 overflow-hidden">
          {/* Binary file notice */}
          {activeTab.isBinary && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 h-full">
              <Binary className="w-12 h-12 text-muted-foreground" />
              <div className="text-center">
                <p className="text-lg font-medium">Binary File</p>
                <p className="text-sm text-muted-foreground mt-1">
                  This file cannot be displayed as text.
                </p>
              </div>
            </div>
          )}

          {/* Too large file notice */}
          {activeTab.isTooLarge && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 h-full">
              <FileWarning className="w-12 h-12 text-yellow-500" />
              <div className="text-center">
                <p className="text-lg font-medium">File Too Large</p>
                <p className="text-sm text-muted-foreground mt-1">
                  This file is {(activeTab.fileSize / (1024 * 1024)).toFixed(1)}MB, which exceeds
                  the {(maxFileSize / (1024 * 1024)).toFixed(0)}MB limit.
                </p>
              </div>
            </div>
          )}

          {/* Normal editable file */}
          {!activeTab.isBinary && !activeTab.isTooLarge && (
            <>
              {isMarkdown && showEditor && showPreview ? (
                // Markdown split view (stacks vertically on mobile)
                <PanelGroup direction={isMobile ? 'vertical' : 'horizontal'} className="h-full">
                  <Panel defaultSize={50} minSize={30}>
                    <CodeEditor
                      ref={editorRef}
                      value={activeTab.content}
                      onChange={handleEditorChange}
                      filePath={activeTab.filePath}
                      tabSize={tabSize}
                      wordWrap={wordWrap}
                      fontSize={editorFontSize}
                      fontFamily={editorFontFamily}
                      onCursorChange={handleCursorChange}
                      onSave={handleSave}
                      scrollCursorIntoView={isMobile && isKeyboardOpen}
                    />
                  </Panel>
                  <PanelResizeHandle
                    className={cn(
                      'transition-colors',
                      isMobile
                        ? 'h-1 bg-border hover:bg-primary/50'
                        : 'w-1 bg-border hover:bg-primary/50'
                    )}
                  />
                  <Panel defaultSize={50} minSize={30}>
                    <MarkdownPreviewPanel content={activeTab.content} />
                  </Panel>
                </PanelGroup>
              ) : isMarkdown && !showEditor ? (
                // Markdown preview only
                <MarkdownPreviewPanel content={activeTab.content} className="h-full" />
              ) : (
                // Regular editor (or markdown editor-only mode)
                <CodeEditor
                  ref={editorRef}
                  value={activeTab.content}
                  onChange={handleEditorChange}
                  filePath={activeTab.filePath}
                  tabSize={tabSize}
                  wordWrap={wordWrap}
                  fontSize={editorFontSize}
                  fontFamily={editorFontFamily}
                  onCursorChange={handleCursorChange}
                  onSave={handleSave}
                  scrollCursorIntoView={isMobile && isKeyboardOpen}
                />
              )}
            </>
          )}
        </div>
      ) : (
        // No file open
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-4">
          <FileCode2 className="w-16 h-16 text-muted-foreground/30" />
          <div className="text-center">
            <p className="text-muted-foreground">
              {isMobile
                ? 'Tap a file from the explorer to start editing'
                : 'Select a file from the explorer to start editing'}
            </p>
            {!isMobile && (
              <p className="text-xs text-muted-foreground/60 mt-1">
                Ctrl+S to save &middot; Ctrl+F to search
              </p>
            )}
          </div>
        </div>
      )}

      {/* Git detail panel (shown below editor for active file) */}
      {activeTab && !activeTab.isBinary && !activeTab.isTooLarge && activeFileGitDetails && (
        <GitDetailPanel
          details={activeFileGitDetails}
          filePath={activeTab.filePath}
          onOpenFile={handleFileSelect}
        />
      )}

      {/* Status bar */}
      {activeTab && !activeTab.isBinary && !activeTab.isTooLarge && (
        <div className="flex items-center justify-between px-3 py-1 border-t border-border bg-muted/30 text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <span>{getLanguageName(activeTab.filePath)}</span>
            <span>
              Ln {activeTab.cursorLine}, Col {activeTab.cursorCol}
            </span>
            {activeTab.isDirty && (
              <span className="flex items-center gap-1 text-primary">
                <Circle className="w-1.5 h-1.5 fill-current" />
                Modified
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {gitBranch && (
              <span className="flex items-center gap-1" title="Current branch">
                <span className="text-primary">{gitBranch}</span>
              </span>
            )}
            <span>Spaces: {tabSize}</span>
            {!isMobile && <span>{wordWrap ? 'Wrap' : 'No Wrap'}</span>}
            <span>UTF-8</span>
          </div>
        </div>
      )}
    </div>
  );

  // ─── File Tree Panel (shared between mobile and desktop) ──
  const renderFileTree = () => (
    <FileTree
      onFileSelect={isMobile ? handleMobileFileSelect : handleFileSelect}
      onCreateFile={handleCreateFile}
      onCreateFolder={handleCreateFolder}
      onDeleteItem={handleDeleteItem}
      onRenameItem={handleRenameItem}
      onCopyPath={handleCopyPath}
      onRefresh={() => {
        loadTree();
        loadGitStatus();
      }}
      onToggleFolder={handleToggleFolder}
      activeFilePath={activeTab?.filePath || null}
      onCopyItem={handleCopyItem}
      onMoveItem={handleMoveItem}
      onDownloadItem={handleDownloadItem}
      onDragDropMove={handleDragDropMove}
      effectivePath={effectivePath || ''}
    />
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden content-bg" data-testid="file-editor-view">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 sm:p-4 border-b border-border bg-glass backdrop-blur-md">
        <div className="flex items-center gap-3">
          {/* Mobile: show browser toggle button when viewing editor */}
          {isMobile && !mobileBrowserVisible && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMobileBrowserVisible(true)}
              className="p-1.5 -ml-1"
              title="Show file explorer"
            >
              <PanelLeftOpen className="w-5 h-5" />
            </Button>
          )}
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <FileCode2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">File Editor</h1>
            <p className="text-sm text-muted-foreground truncate max-w-[150px] md:max-w-none">
              {currentProject.name}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Worktree directory selector */}
          {currentProject?.path && <WorktreeDirectoryDropdown projectPath={currentProject.path} />}

          {/* Desktop: Markdown view mode toggle */}
          {isMarkdown && !(isMobile && mobileBrowserVisible) && (
            <div className="hidden lg:block">
              <MarkdownViewToolbar
                viewMode={markdownViewMode}
                onViewModeChange={setMarkdownViewMode}
              />
            </div>
          )}

          {/* Desktop: Search button */}
          {activeTab &&
            !activeTab.isBinary &&
            !activeTab.isTooLarge &&
            !(isMobile && mobileBrowserVisible) && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleSearch}
                className="hidden lg:flex"
                title="Search in file (Ctrl+F)"
              >
                <Search className="w-4 h-4 mr-2" />
                Search
              </Button>
            )}

          {/* Desktop: Undo / Redo buttons */}
          {activeTab &&
            !activeTab.isBinary &&
            !activeTab.isTooLarge &&
            !(isMobile && mobileBrowserVisible) && (
              <div className="hidden lg:flex items-center gap-1">
                <Button variant="outline" size="icon-sm" onClick={handleUndo} title="Undo (Ctrl+Z)">
                  <Undo2 className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={handleRedo}
                  title="Redo (Ctrl+Shift+Z)"
                >
                  <Redo2 className="w-4 h-4" />
                </Button>
              </div>
            )}

          {/* Desktop: Save button */}
          {activeTab &&
            !activeTab.isBinary &&
            !activeTab.isTooLarge &&
            !(isMobile && mobileBrowserVisible) && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleSave}
                disabled={!activeTab.isDirty}
                className="hidden lg:flex"
                title={editorAutoSave ? 'Auto-save enabled (Ctrl+S)' : 'Save file (Ctrl+S)'}
              >
                <Save className="w-4 h-4 mr-2" />
                {editorAutoSave ? 'Auto' : 'Save'}
              </Button>
            )}

          {/* Editor Settings popover */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="hidden lg:flex text-muted-foreground hover:text-foreground"
                title="Editor Settings"
              >
                <Settings className="w-4 h-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3" align="end" side="bottom">
              <div className="space-y-4">
                <p className="text-xs font-semibold text-foreground">Editor Settings</p>
                <EditorSettingsForm
                  editorFontSize={editorFontSize}
                  setEditorFontSize={setEditorFontSize}
                  editorFontFamily={editorFontFamily}
                  setEditorFontFamily={setEditorFontFamily}
                  editorAutoSave={editorAutoSave}
                  setEditorAutoSave={setEditorAutoSave}
                />
              </div>
            </PopoverContent>
          </Popover>

          {/* Tablet/Mobile: actions panel trigger */}
          <HeaderActionsPanelTrigger
            isOpen={showActionsPanel}
            onToggle={() => setShowActionsPanel(!showActionsPanel)}
          />
        </div>
      </div>

      {/* Actions Panel (tablet/mobile) */}
      <HeaderActionsPanel
        isOpen={showActionsPanel}
        onClose={() => setShowActionsPanel(false)}
        title="Editor Actions"
      >
        {/* Markdown view mode toggle */}
        {isMarkdown && (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              View Mode
            </span>
            <MarkdownViewToolbar
              viewMode={markdownViewMode}
              onViewModeChange={setMarkdownViewMode}
            />
          </div>
        )}

        {/* Search button */}
        {activeTab && !activeTab.isBinary && !activeTab.isTooLarge && (
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => {
              handleSearch();
              setShowActionsPanel(false);
            }}
          >
            <Search className="w-4 h-4 mr-2" />
            Search in File
          </Button>
        )}

        {/* Undo / Redo buttons */}
        {activeTab && !activeTab.isBinary && !activeTab.isTooLarge && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="flex-1 justify-start"
              onClick={() => {
                handleUndo();
                setShowActionsPanel(false);
              }}
            >
              <Undo2 className="w-4 h-4 mr-2" />
              Undo
            </Button>
            <Button
              variant="outline"
              className="flex-1 justify-start"
              onClick={() => {
                handleRedo();
                setShowActionsPanel(false);
              }}
            >
              <Redo2 className="w-4 h-4 mr-2" />
              Redo
            </Button>
          </div>
        )}

        {/* Save button */}
        {activeTab && !activeTab.isBinary && !activeTab.isTooLarge && (
          <Button
            variant="outline"
            className="w-full justify-start"
            disabled={!activeTab.isDirty}
            onClick={() => {
              handleSave();
              setShowActionsPanel(false);
            }}
          >
            <Save className="w-4 h-4 mr-2" />
            {editorAutoSave ? 'Save Now (Auto-save on)' : 'Save Changes'}
          </Button>
        )}

        {/* File info */}
        {activeTab && !activeTab.isBinary && !activeTab.isTooLarge && (
          <div className="flex flex-col gap-1.5 p-3 rounded-lg bg-muted/30 border border-border">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              File Info
            </span>
            <div className="text-sm text-foreground">{getLanguageName(activeTab.filePath)}</div>
            <div className="text-xs text-muted-foreground">
              Ln {activeTab.cursorLine}, Col {activeTab.cursorCol}
            </div>
          </div>
        )}

        {/* Editor Settings */}
        <div className="flex flex-col gap-3 p-3 rounded-lg bg-muted/30 border border-border">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Editor Settings
          </span>
          <EditorSettingsForm
            editorFontSize={editorFontSize}
            setEditorFontSize={setEditorFontSize}
            editorFontFamily={editorFontFamily}
            setEditorFontFamily={setEditorFontFamily}
            editorAutoSave={editorAutoSave}
            setEditorAutoSave={setEditorAutoSave}
          />
        </div>
      </HeaderActionsPanel>

      {/* Main content area */}
      {isMobile ? (
        // ─── Mobile Layout: full-screen browser or editor ─────────
        // When the virtual keyboard is open, reduce container height so the
        // editor content scrolls up and the cursor stays visible above the keyboard.
        <div
          className="flex-1 overflow-hidden"
          style={isKeyboardOpen ? { height: `calc(100% - ${keyboardHeight}px)` } : undefined}
        >
          {mobileBrowserVisible ? (
            // Full-screen file browser on mobile
            <div className="h-full">{renderFileTree()}</div>
          ) : (
            // Full-screen editor on mobile
            renderEditorPanel()
          )}
        </div>
      ) : (
        // ─── Desktop Layout: resizable split panels ──────────────
        <PanelGroup direction="horizontal" className="flex-1">
          {/* File Browser Panel */}
          <Panel defaultSize={20} minSize={15} maxSize={40}>
            {renderFileTree()}
          </Panel>

          {/* Resize handle */}
          <PanelResizeHandle className="w-1 bg-border hover:bg-primary/50 transition-colors" />

          {/* Editor Panel */}
          <Panel defaultSize={80} minSize={40}>
            {renderEditorPanel()}
          </Panel>
        </PanelGroup>
      )}
    </div>
  );
}
