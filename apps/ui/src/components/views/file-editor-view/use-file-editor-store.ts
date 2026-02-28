import { create } from 'zustand';
import { persist, type StorageValue } from 'zustand/middleware';
import {
  updateTabWithContent,
  markTabAsSaved,
  normalizeLineEndings,
} from './file-editor-dirty-utils';

export interface FileTreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileTreeNode[];
  /** Git status indicator: M=modified, A=added, D=deleted, ?=untracked, !=ignored, S=staged */
  gitStatus?: string;
}

export interface EditorTab {
  id: string;
  filePath: string;
  fileName: string;
  content: string;
  originalContent: string;
  isDirty: boolean;
  scrollTop: number;
  cursorLine: number;
  cursorCol: number;
  /** Whether the file is binary (non-editable) */
  isBinary: boolean;
  /** Whether the file is too large to edit */
  isTooLarge: boolean;
  /** File size in bytes */
  fileSize: number;
}

export type MarkdownViewMode = 'editor' | 'preview' | 'split';

/** Enhanced git status per file, including diff stats and staged/unstaged info */
export interface EnhancedGitFileStatus {
  indexStatus: string;
  workTreeStatus: string;
  isConflicted: boolean;
  isStaged: boolean;
  isUnstaged: boolean;
  linesAdded: number;
  linesRemoved: number;
  statusLabel: string;
}

/** Git details for a specific file (shown in detail panel) */
export interface GitFileDetailsInfo {
  branch: string;
  lastCommitHash: string;
  lastCommitMessage: string;
  lastCommitAuthor: string;
  lastCommitTimestamp: string;
  linesAdded: number;
  linesRemoved: number;
  isConflicted: boolean;
  isStaged: boolean;
  isUnstaged: boolean;
  statusLabel: string;
}

/** Items being dragged in the file tree */
export interface DragState {
  /** Paths of items currently being dragged */
  draggedPaths: string[];
  /** Path of the current drop target folder */
  dropTargetPath: string | null;
}

interface FileEditorState {
  // File tree state
  fileTree: FileTreeNode[];
  expandedFolders: Set<string>;
  showHiddenFiles: boolean;

  // Editor tabs
  tabs: EditorTab[];
  activeTabId: string | null;

  // Markdown preview
  markdownViewMode: MarkdownViewMode;

  // Mobile layout state
  /** Whether the file browser is visible on mobile (defaults to true) */
  mobileBrowserVisible: boolean;

  // Settings
  tabSize: number;
  wordWrap: boolean;
  fontSize: number;
  /** Maximum file size in bytes before warning (default 1MB) */
  maxFileSize: number;

  // Git status map: filePath -> status
  gitStatusMap: Map<string, string>;

  // Enhanced git status: filePath -> enhanced status info
  enhancedGitStatusMap: Map<string, EnhancedGitFileStatus>;

  // Current branch name
  gitBranch: string;

  // Git details for the currently active file (loaded on demand)
  activeFileGitDetails: GitFileDetailsInfo | null;

  // Inline diff display
  /** Whether to show inline git diffs in the editor */
  showInlineDiff: boolean;
  /** The diff content for the active file (raw unified diff) */
  activeFileDiff: string | null;

  // Drag and drop state
  dragState: DragState;

  // Selected items for multi-select operations
  selectedPaths: Set<string>;

  // Actions
  setFileTree: (tree: FileTreeNode[]) => void;
  toggleFolder: (path: string) => void;
  setShowHiddenFiles: (show: boolean) => void;
  setExpandedFolders: (folders: Set<string>) => void;

  openTab: (tab: Omit<EditorTab, 'id'>) => void;
  closeTab: (tabId: string) => void;
  closeAllTabs: () => void;
  setActiveTab: (tabId: string) => void;
  updateTabContent: (tabId: string, content: string) => void;
  markTabSaved: (tabId: string, content: string) => void;
  updateTabScroll: (tabId: string, scrollTop: number) => void;
  updateTabCursor: (tabId: string, line: number, col: number) => void;
  /** Re-sync an existing tab's originalContent and isDirty state from freshly-read disk content */
  refreshTabContent: (tabId: string, diskContent: string) => void;

  setMarkdownViewMode: (mode: MarkdownViewMode) => void;

  setMobileBrowserVisible: (visible: boolean) => void;

  setTabSize: (size: number) => void;
  setWordWrap: (wrap: boolean) => void;
  setFontSize: (size: number) => void;

  setGitStatusMap: (map: Map<string, string>) => void;
  setEnhancedGitStatusMap: (map: Map<string, EnhancedGitFileStatus>) => void;
  setGitBranch: (branch: string) => void;
  setActiveFileGitDetails: (details: GitFileDetailsInfo | null) => void;

  setShowInlineDiff: (show: boolean) => void;
  setActiveFileDiff: (diff: string | null) => void;

  setDragState: (state: DragState) => void;
  setSelectedPaths: (paths: Set<string>) => void;
  toggleSelectedPath: (path: string) => void;
  clearSelectedPaths: () => void;

  reset: () => void;
}

const initialState = {
  fileTree: [] as FileTreeNode[],
  expandedFolders: new Set<string>(),
  showHiddenFiles: true,
  tabs: [] as EditorTab[],
  activeTabId: null as string | null,
  markdownViewMode: 'split' as MarkdownViewMode,
  mobileBrowserVisible: true,
  tabSize: 2,
  wordWrap: true,
  fontSize: 13,
  maxFileSize: 1024 * 1024, // 1MB
  gitStatusMap: new Map<string, string>(),
  enhancedGitStatusMap: new Map<string, EnhancedGitFileStatus>(),
  gitBranch: '',
  activeFileGitDetails: null as GitFileDetailsInfo | null,
  showInlineDiff: false,
  activeFileDiff: null as string | null,
  dragState: { draggedPaths: [], dropTargetPath: null } as DragState,
  selectedPaths: new Set<string>(),
};

/** Shape of the persisted subset (Sets are stored as arrays for JSON compatibility) */
interface PersistedFileEditorState {
  tabs: EditorTab[];
  activeTabId: string | null;
  expandedFolders: string[];
  markdownViewMode: MarkdownViewMode;
}

const STORE_NAME = 'automaker-file-editor';

export const useFileEditorStore = create<FileEditorState>()(
  persist(
    (set, get) => ({
      ...initialState,

      setFileTree: (tree) => set({ fileTree: tree }),

      toggleFolder: (path) => {
        const { expandedFolders } = get();
        const next = new Set(expandedFolders);
        if (next.has(path)) {
          next.delete(path);
        } else {
          next.add(path);
        }
        set({ expandedFolders: next });
      },

      setShowHiddenFiles: (show) => set({ showHiddenFiles: show }),

      setExpandedFolders: (folders) => set({ expandedFolders: folders }),

      openTab: (tabData) => {
        const { tabs } = get();
        // Check if file is already open
        const existing = tabs.find((t) => t.filePath === tabData.filePath);
        if (existing) {
          set({ activeTabId: existing.id });
          return;
        }

        const id = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const newTab: EditorTab = { ...tabData, id };
        let updatedTabs = [...tabs, newTab];

        // Enforce max open tabs – evict the oldest non-dirty tab when over the limit
        const MAX_TABS = 25;
        while (updatedTabs.length > MAX_TABS) {
          const evictIdx = updatedTabs.findIndex((t) => t.id !== id && !t.isDirty);
          if (evictIdx === -1) break; // all other tabs are dirty, keep them
          updatedTabs.splice(evictIdx, 1);
        }

        set({
          tabs: updatedTabs,
          activeTabId: id,
        });
      },

      closeTab: (tabId) => {
        const { tabs, activeTabId } = get();
        const idx = tabs.findIndex((t) => t.id === tabId);
        if (idx === -1) return;

        const newTabs = tabs.filter((t) => t.id !== tabId);
        let newActiveId = activeTabId;

        if (activeTabId === tabId) {
          if (newTabs.length === 0) {
            newActiveId = null;
          } else if (idx >= newTabs.length) {
            newActiveId = newTabs[newTabs.length - 1].id;
          } else {
            newActiveId = newTabs[idx].id;
          }
        }

        set({ tabs: newTabs, activeTabId: newActiveId });
      },

      closeAllTabs: () => {
        set({ tabs: [], activeTabId: null });
      },

      setActiveTab: (tabId) => set({ activeTabId: tabId }),

      updateTabContent: (tabId, content) => {
        set({
          tabs: get().tabs.map((t) => (t.id === tabId ? updateTabWithContent(t, content) : t)),
        });
      },

      markTabSaved: (tabId, content) => {
        set({
          tabs: get().tabs.map((t) => (t.id === tabId ? markTabAsSaved(t, content) : t)),
        });
      },

      refreshTabContent: (tabId, diskContent) => {
        set({
          tabs: get().tabs.map((t) => {
            if (t.id !== tabId) return t;
            // Normalize line endings so the baseline matches CodeMirror's
            // internal representation (\r\n → \n). Without this, files with
            // Windows line endings would always appear dirty.
            const normalizedDisk = normalizeLineEndings(diskContent);
            // If the editor content matches the freshly-read disk content, the file
            // is clean (any previous isDirty was a stale persisted value).
            // Otherwise keep the user's in-progress edits but update originalContent
            // so isDirty is calculated against the actual on-disk baseline.
            const isDirty = normalizeLineEndings(t.content) !== normalizedDisk;
            return { ...t, originalContent: normalizedDisk, isDirty };
          }),
        });
      },

      updateTabScroll: (tabId, scrollTop) => {
        set({
          tabs: get().tabs.map((t) => (t.id === tabId ? { ...t, scrollTop } : t)),
        });
      },

      updateTabCursor: (tabId, line, col) => {
        set({
          tabs: get().tabs.map((t) =>
            t.id === tabId ? { ...t, cursorLine: line, cursorCol: col } : t
          ),
        });
      },

      setMarkdownViewMode: (mode) => set({ markdownViewMode: mode }),

      setMobileBrowserVisible: (visible) => set({ mobileBrowserVisible: visible }),

      setTabSize: (size) => set({ tabSize: size }),
      setWordWrap: (wrap) => set({ wordWrap: wrap }),
      setFontSize: (size) => set({ fontSize: size }),

      setGitStatusMap: (map) => set({ gitStatusMap: map }),
      setEnhancedGitStatusMap: (map) => set({ enhancedGitStatusMap: map }),
      setGitBranch: (branch) => set({ gitBranch: branch }),
      setActiveFileGitDetails: (details) => set({ activeFileGitDetails: details }),

      setShowInlineDiff: (show) => set({ showInlineDiff: show }),
      setActiveFileDiff: (diff) => set({ activeFileDiff: diff }),

      setDragState: (state) => set({ dragState: state }),
      setSelectedPaths: (paths) => set({ selectedPaths: paths }),
      toggleSelectedPath: (path) => {
        const { selectedPaths } = get();
        const next = new Set(selectedPaths);
        if (next.has(path)) {
          next.delete(path);
        } else {
          next.add(path);
        }
        set({ selectedPaths: next });
      },
      clearSelectedPaths: () => set({ selectedPaths: new Set() }),

      reset: () => set(initialState),
    }),
    {
      name: STORE_NAME,
      version: 2,
      // Only persist tab session state, not transient data (git status, file tree, drag state)
      partialize: (state) =>
        ({
          tabs: state.tabs,
          activeTabId: state.activeTabId,
          expandedFolders: state.expandedFolders,
          markdownViewMode: state.markdownViewMode,
        }) as unknown as FileEditorState,
      // Custom storage adapter to handle Set<string> serialization
      storage: {
        getItem: (name: string): StorageValue<FileEditorState> | null => {
          const raw = localStorage.getItem(name);
          if (!raw) return null;
          try {
            const parsed = JSON.parse(raw) as StorageValue<PersistedFileEditorState>;
            if (!parsed?.state) return null;
            // Normalize tabs: ensure originalContent is always a string. Tabs persisted
            // before originalContent was added to the schema have originalContent=undefined,
            // which causes isDirty=true on any content comparison. Default to content so
            // the tab starts in a clean state.
            // Also recalculate isDirty from content vs originalContent rather than trusting
            // the persisted value, which can become stale (e.g. file saved externally,
            // CodeMirror normalization, or schema migration).
            const normalizedTabs = (parsed.state.tabs ?? []).map((tab) => {
              const originalContent = normalizeLineEndings(
                tab.originalContent ?? tab.content ?? ''
              );
              const content = tab.content ?? '';
              return {
                ...tab,
                originalContent,
                isDirty: normalizeLineEndings(content) !== originalContent,
              };
            });
            // Convert arrays back to Sets
            return {
              ...parsed,
              state: {
                ...parsed.state,
                tabs: normalizedTabs,
                expandedFolders: new Set(parsed.state.expandedFolders ?? []),
              },
            } as unknown as StorageValue<FileEditorState>;
          } catch {
            return null;
          }
        },
        setItem: (name: string, value: StorageValue<FileEditorState>): void => {
          try {
            const state = value.state as unknown as FileEditorState;
            // Convert Sets to arrays for JSON serialization
            const serializable: StorageValue<PersistedFileEditorState> = {
              ...value,
              state: {
                tabs: state.tabs ?? [],
                activeTabId: state.activeTabId ?? null,
                expandedFolders: Array.from(state.expandedFolders ?? []),
                markdownViewMode: state.markdownViewMode ?? 'split',
              },
            };
            localStorage.setItem(name, JSON.stringify(serializable));
          } catch {
            // localStorage might be full or disabled
          }
        },
        removeItem: (name: string): void => {
          try {
            localStorage.removeItem(name);
          } catch {
            // Ignore
          }
        },
      },
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as Record<string, unknown>;
        if (version < 1) {
          // Initial migration: ensure all fields exist
          state.tabs = state.tabs ?? [];
          state.activeTabId = state.activeTabId ?? null;
          state.expandedFolders = state.expandedFolders ?? new Set<string>();
          state.markdownViewMode = state.markdownViewMode ?? 'split';
        }
        // Always ensure each tab has a valid originalContent field.
        // Tabs persisted before originalContent was added to the schema would have
        // originalContent=undefined, which causes isDirty=true on any onChange call
        // (content !== undefined is always true). Fix by defaulting to content so the
        // tab starts in a clean state; any genuine unsaved changes will be re-detected
        // when the user next edits the file.
        if (Array.isArray((state as Record<string, unknown>).tabs)) {
          (state as Record<string, unknown>).tabs = (
            (state as Record<string, unknown>).tabs as Array<Record<string, unknown>>
          ).map((tab: Record<string, unknown>) => {
            if (tab.originalContent === undefined || tab.originalContent === null) {
              return { ...tab, originalContent: tab.content ?? '' };
            }
            return tab;
          });
        }
        return state as unknown as FileEditorState;
      },
    }
  )
);
