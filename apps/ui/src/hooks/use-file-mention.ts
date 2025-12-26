/**
 * useFileMention Hook
 *
 * Manages file mention functionality for the description textarea.
 * Handles @ and @@ triggers, file fetching, fuzzy search, and selection.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import MiniSearch from 'minisearch';
import { useAppStore } from '@/store/app-store';
import { getElectronAPI } from '@/lib/electron';
import type { Project } from '@/lib/electron';
import type { FileItem, FileReference } from '@/lib/file-mention-utils';
import {
  parseMentionTrigger,
  createFileReference,
  replaceMentionWithReference,
} from '@/lib/file-mention-utils';

export type MentionMode = 'files' | 'projects';

interface UseFileMentionOptions {
  /** Current text value */
  value: string;
  /** Cursor position in the text */
  cursorPosition: number;
  /** Callback when text changes */
  onChange: (value: string) => void;
  /** Callback when a file is selected */
  onSelectFile: (file: FileReference) => void;
  /** Callback when cursor position changes */
  onCursorChange?: (position: number) => void;
  /** Current project path */
  projectPath: string | null;
  /** All available projects */
  projects: Project[];
}

interface UseFileMentionReturn {
  /** Whether the mention popover is open */
  isOpen: boolean;
  /** Current mode: files or projects (for @@ first step) */
  mode: MentionMode;
  /** Search query after the trigger */
  searchQuery: string;
  /** Selected project (for @@ mode) */
  selectedProject: Project | null;
  /** Filtered files to display */
  filteredFiles: FileItem[];
  /** Filtered projects to display (for @@ mode) */
  filteredProjects: Project[];
  /** Currently highlighted index */
  selectedIndex: number;
  /** Start index of the trigger in the text */
  triggerStartIndex: number;
  /** Whether files are loading */
  isLoading: boolean;
  /** Error message if any */
  error: string | null;

  // Actions
  /** Handle keyboard events */
  handleKeyDown: (e: React.KeyboardEvent) => void;
  /** Handle input change */
  handleInputChange: (newValue: string, newCursorPosition: number) => void;
  /** Select a file */
  selectFile: (file: FileItem) => void;
  /** Select a project (for @@ mode) */
  selectProject: (project: Project) => void;
  /** Go back to projects list (from files in @@ mode) */
  goBackToProjects: () => void;
  /** Close the popover */
  close: () => void;
  /** Open file in editor */
  openInEditor: (file: FileItem) => void;
}

// Cache for file lists per project path
const fileCache = new Map<string, { files: FileItem[]; timestamp: number }>();
const CACHE_TTL = 30000; // 30 seconds

export function useFileMention({
  value,
  cursorPosition,
  onChange,
  onSelectFile,
  onCursorChange,
  projectPath,
  projects,
}: UseFileMentionOptions): UseFileMentionReturn {
  // State
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<MentionMode>('files');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [triggerStartIndex, setTriggerStartIndex] = useState(-1);
  const [searchQuery, setSearchQuery] = useState('');

  // Settings
  const preferredEditor = useAppStore(
    (state) => (state as unknown as { preferredEditor?: string }).preferredEditor || 'cursor'
  );

  // Refs
  const searchIndexRef = useRef<MiniSearch<FileItem> | null>(null);

  // Get other projects (excluding current)
  const otherProjects = useMemo(() => {
    if (!projectPath) return projects;
    return projects.filter((p) => p.path !== projectPath);
  }, [projects, projectPath]);

  // Build search index when files change
  useEffect(() => {
    if (files.length > 0) {
      const miniSearch = new MiniSearch<FileItem>({
        fields: ['relativePath'],
        storeFields: ['relativePath', 'absolutePath', 'extension', 'size'],
        searchOptions: {
          prefix: true,
          fuzzy: 0.2,
          boost: { relativePath: 2 },
        },
      });
      miniSearch.addAll(files.map((f, i) => ({ ...f, id: i })));
      searchIndexRef.current = miniSearch;
    } else {
      searchIndexRef.current = null;
    }
  }, [files]);

  // Fetch files for a project
  const fetchFiles = useCallback(async (path: string) => {
    // Check cache first
    const cached = fileCache.get(path);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      setFiles(cached.files);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const api = getElectronAPI();
      if (!api.listFiles) {
        throw new Error('listFiles not available');
      }

      const result = await api.listFiles(path);
      if (result.success && result.files) {
        setFiles(result.files);
        fileCache.set(path, { files: result.files, timestamp: Date.now() });
      } else {
        setError(result.error || 'Failed to load files');
        setFiles([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load files');
      setFiles([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Filter files based on search query
  const filteredFiles = useMemo(() => {
    if (!searchQuery.trim()) {
      // Return first 50 files if no query
      return files.slice(0, 50);
    }

    if (searchIndexRef.current) {
      const results = searchIndexRef.current.search(searchQuery);
      return results.slice(0, 50).map((r) => ({
        relativePath: r.relativePath as string,
        absolutePath: r.absolutePath as string,
        extension: r.extension as string,
        size: r.size as number,
      }));
    }

    // Fallback to simple filter
    const query = searchQuery.toLowerCase();
    return files.filter((f) => f.relativePath.toLowerCase().includes(query)).slice(0, 50);
  }, [files, searchQuery]);

  // Filter projects based on search query (for @@ mode)
  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) {
      return otherProjects;
    }

    const query = searchQuery.toLowerCase();
    return otherProjects.filter(
      (p) => p.name.toLowerCase().includes(query) || p.path.toLowerCase().includes(query)
    );
  }, [otherProjects, searchQuery]);

  // Handle input change - detect triggers
  const handleInputChange = useCallback(
    (newValue: string, newCursorPosition: number) => {
      const trigger = parseMentionTrigger(newValue, newCursorPosition);

      if (trigger.type === 'current' && projectPath) {
        // @ trigger for current project
        setIsOpen(true);
        setMode('files');
        setSelectedProject(null);
        setSearchQuery(trigger.query);
        setTriggerStartIndex(trigger.startIndex);
        setSelectedIndex(0);
        fetchFiles(projectPath);
      } else if (trigger.type === 'cross-project') {
        // @@ trigger for cross-project
        // Check if query contains : which means project already selected
        const colonIndex = trigger.query.indexOf(':');
        if (colonIndex > -1) {
          // Project name is before colon, file search after
          const projectName = trigger.query.slice(0, colonIndex);
          const fileQuery = trigger.query.slice(colonIndex + 1);
          const project = otherProjects.find((p) => p.name === projectName);

          if (project) {
            setIsOpen(true);
            setMode('files');
            setSelectedProject(project);
            setSearchQuery(fileQuery);
            setTriggerStartIndex(trigger.startIndex);
            setSelectedIndex(0);
            fetchFiles(project.path);
          }
        } else {
          // Still in project selection mode
          setIsOpen(true);
          setMode('projects');
          setSelectedProject(null);
          setSearchQuery(trigger.query);
          setTriggerStartIndex(trigger.startIndex);
          setSelectedIndex(0);
        }
      } else {
        // No trigger - close popover
        if (isOpen) {
          setIsOpen(false);
          setMode('files');
          setSelectedProject(null);
          setSearchQuery('');
          setTriggerStartIndex(-1);
        }
      }
    },
    [projectPath, otherProjects, fetchFiles, isOpen]
  );

  // Select a file
  const selectFile = useCallback(
    (file: FileItem) => {
      const targetProjectPath = selectedProject?.path || projectPath;
      if (!targetProjectPath) return;

      const ref = createFileReference(file, targetProjectPath, selectedProject?.name);

      // Replace trigger text with file reference
      const { newText, newCursorPosition } = replaceMentionWithReference(
        value,
        triggerStartIndex,
        cursorPosition,
        ref
      );

      onChange(newText);
      onSelectFile(ref);
      onCursorChange?.(newCursorPosition);

      // Close popover
      setIsOpen(false);
      setMode('files');
      setSelectedProject(null);
      setSearchQuery('');
      setTriggerStartIndex(-1);
    },
    [
      value,
      triggerStartIndex,
      cursorPosition,
      selectedProject,
      projectPath,
      onChange,
      onSelectFile,
      onCursorChange,
    ]
  );

  // Select a project (for @@ mode)
  const selectProject = useCallback(
    (project: Project) => {
      setSelectedProject(project);
      setMode('files');
      setSearchQuery('');
      setSelectedIndex(0);
      fetchFiles(project.path);

      // Update the text to include project name
      const before = value.slice(0, triggerStartIndex);
      const after = value.slice(cursorPosition);
      const newText = before + `@@${project.name}:` + after;
      const newCursorPosition = before.length + 2 + project.name.length + 1;

      onChange(newText);
      onCursorChange?.(newCursorPosition);
    },
    [value, triggerStartIndex, cursorPosition, fetchFiles, onChange, onCursorChange]
  );

  // Go back to projects list
  const goBackToProjects = useCallback(() => {
    setMode('projects');
    setSelectedProject(null);
    setFiles([]);
    setSearchQuery('');
    setSelectedIndex(0);

    // Update text to remove project name
    const before = value.slice(0, triggerStartIndex);
    const after = value.slice(cursorPosition);
    const newText = before + '@@' + after;
    const newCursorPosition = before.length + 2;

    onChange(newText);
    onCursorChange?.(newCursorPosition);
  }, [value, triggerStartIndex, cursorPosition, onChange, onCursorChange]);

  // Close popover
  const close = useCallback(() => {
    setIsOpen(false);
    setMode('files');
    setSelectedProject(null);
    setSearchQuery('');
    setTriggerStartIndex(-1);
  }, []);

  // Open file in editor using URL scheme
  const openInEditor = useCallback(
    (file: FileItem) => {
      try {
        // Build editor-specific URL scheme
        let url: string;
        switch (preferredEditor) {
          case 'cursor':
            url = `cursor://file/${file.absolutePath}`;
            break;
          case 'code':
            url = `vscode://file${file.absolutePath}`;
            break;
          case 'zed':
            url = `zed://file${file.absolutePath}`;
            break;
          default:
            url = `cursor://file/${file.absolutePath}`;
        }

        openUrlScheme(url);
      } catch (err) {
        console.error('Failed to open in editor:', err);
      }
    },
    [preferredEditor]
  );

  // Helper to open a URL scheme via anchor click (most reliable for custom URL schemes)
  const openUrlScheme = (url: string) => {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  };

  // Handle keyboard events
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) return;

      const items = mode === 'projects' ? filteredProjects : filteredFiles;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % items.length);
          break;

        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev - 1 + items.length) % items.length);
          break;

        case 'Enter':
          e.preventDefault();
          if (e.ctrlKey || e.metaKey) {
            // Ctrl+Enter: open in editor
            if (mode === 'files' && filteredFiles[selectedIndex]) {
              openInEditor(filteredFiles[selectedIndex]);
            }
          } else {
            // Enter: select item
            if (mode === 'projects') {
              const project = filteredProjects[selectedIndex];
              if (project) {
                selectProject(project);
              }
            } else {
              const file = filteredFiles[selectedIndex];
              if (file) {
                selectFile(file);
              }
            }
          }
          break;

        case 'Escape':
          // Don't prevent default - let escape bubble up to close the dialog
          // The popover will close when the dialog closes
          close();
          break;

        case '`':
          // Backtick closes the popover
          e.preventDefault();
          close();
          break;

        case 'Backspace':
          // If search is empty and in @@ file mode, go back to projects
          if (!searchQuery && mode === 'files' && selectedProject) {
            e.preventDefault();
            goBackToProjects();
          }
          break;

        case 'Tab':
          // Prevent tab from moving focus
          if (isOpen) {
            e.preventDefault();
          }
          break;
      }
    },
    [
      isOpen,
      mode,
      filteredProjects,
      filteredFiles,
      selectedIndex,
      searchQuery,
      selectedProject,
      selectProject,
      selectFile,
      openInEditor,
      goBackToProjects,
      close,
    ]
  );

  return {
    isOpen,
    mode,
    searchQuery,
    selectedProject,
    filteredFiles,
    filteredProjects,
    selectedIndex,
    triggerStartIndex,
    isLoading,
    error,
    handleKeyDown,
    handleInputChange,
    selectFile,
    selectProject,
    goBackToProjects,
    close,
    openInEditor,
  };
}
