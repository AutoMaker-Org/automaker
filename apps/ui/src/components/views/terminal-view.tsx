import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { createLogger } from '@automaker/utils/logger';
import {
  Terminal as TerminalIcon,
  Plus,
  Lock,
  Unlock,
  SplitSquareHorizontal,
  SplitSquareVertical,
  AlertCircle,
  RefreshCw,
  X,
  SquarePlus,
  Settings,
  GitBranch,
  ChevronDown,
  FolderGit,
  Palette,
  RotateCcw,
  Type,
} from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { getServerUrlSync } from '@/lib/http-api-client';
import {
  useAppStore,
  type TerminalPanelContent,
  type TerminalTab,
  type PersistedTerminalPanel,
} from '@/store/app-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TERMINAL_FONT_OPTIONS } from '@/config/terminal-themes';
import { DEFAULT_FONT_VALUE } from '@/config/ui-font-options';
import { toast } from 'sonner';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { TerminalPanel } from './terminal-view/terminal-panel';
import { TerminalErrorBoundary } from './terminal-view/terminal-error-boundary';
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragOverEvent,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  DragOverlay,
  useDroppable,
  useDraggable,
  defaultDropAnimationSideEffects,
} from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { apiFetch, apiGet, apiPost, apiDeleteRaw } from '@/lib/api-fetch';
import { getApiKey } from '@/lib/http-api-client';

const logger = createLogger('Terminal');

interface TerminalStatus {
  enabled: boolean;
  passwordRequired: boolean;
  platform: {
    platform: string;
    isWSL: boolean;
    defaultShell: string;
    arch: string;
  };
}

// Tab component with drag-drop support and double-click to rename
function TerminalTabButton({
  tab,
  isActive,
  onClick,
  onClose,
  onRename,
  isDropTarget,
  isDraggingTab,
}: {
  tab: TerminalTab;
  isActive: boolean;
  onClick: () => void;
  onClose: () => void;
  onRename: (newName: string) => void;
  isDropTarget: boolean;
  isDraggingTab: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(tab.name);
  const inputRef = useRef<HTMLInputElement>(null);

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `tab-${tab.id}`,
    data: { type: 'tab', tabId: tab.id },
  });

  const {
    attributes: dragAttributes,
    listeners: dragListeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: `drag-tab-${tab.id}`,
    data: { type: 'drag-tab', tabId: tab.id },
  });

  // Combine refs
  const setRefs = (node: HTMLDivElement | null) => {
    setDropRef(node);
    setDragRef(node);
  };

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditName(tab.name);
    setIsEditing(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      finishEditing();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsEditing(false);
      setEditName(tab.name);
    }
  };

  const finishEditing = () => {
    const trimmedName = editName.trim();
    if (trimmedName && trimmedName !== tab.name) {
      onRename(trimmedName);
    }
    setIsEditing(false);
  };

  return (
    <div
      ref={setRefs}
      {...dragAttributes}
      {...dragListeners}
      className={cn(
        'flex items-center gap-1 px-3 py-1.5 text-sm rounded-t-md border-b-2 cursor-grab active:cursor-grabbing transition-colors select-none',
        isActive
          ? 'bg-background border-brand-500 text-foreground'
          : 'bg-muted border-transparent text-muted-foreground hover:text-foreground hover:bg-accent',
        isOver && isDropTarget && isDraggingTab && 'ring-2 ring-blue-500 bg-blue-500/10',
        isDragging && 'opacity-50'
      )}
      onClick={onClick}
      onDoubleClick={handleDoubleClick}
    >
      <TerminalIcon className="h-3 w-3" />
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={finishEditing}
          onClick={(e) => e.stopPropagation()}
          className="w-20 px-1 py-0 text-sm bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      ) : (
        <span className="max-w-24 truncate">{tab.name}</span>
      )}
      <button
        className="ml-1 p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-destructive"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

// New tab drop zone
function NewTabDropZone({ isDropTarget }: { isDropTarget: boolean }) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'new-tab-zone',
    data: { type: 'new-tab' },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex items-center justify-center px-3 py-1.5 rounded-t-md border-2 border-dashed transition-all',
        isOver && isDropTarget
          ? 'border-green-500 bg-green-500/10 text-green-500'
          : 'border-transparent text-muted-foreground hover:border-border'
      )}
    >
      <SquarePlus className="h-4 w-4" />
    </div>
  );
}

interface TerminalViewProps {
  /** Initial working directory to open a terminal in (e.g., from worktree panel) */
  initialCwd?: string;
  /** Branch name for display in toast (optional) */
  initialBranch?: string;
  /** Mode for opening terminal: 'tab' for new tab, 'split' for split in current tab */
  initialMode?: 'tab' | 'split';
  /** Unique nonce to allow opening the same worktree multiple times */
  nonce?: number;
  /** Command to run automatically when the terminal is created (e.g., from scripts submenu) */
  initialCommand?: string;
}

export function TerminalView({
  initialCwd,
  initialBranch,
  initialMode,
  nonce,
  initialCommand,
}: TerminalViewProps) {
  const {
    terminalState,
    setTerminalUnlocked,
    addTerminalToLayout,
    removeTerminalFromLayout,
    setActiveTerminalSession,
    swapTerminals,
    currentProject,
    addTerminalTab,
    removeTerminalTab,
    setActiveTerminalTab,
    renameTerminalTab,
    reorderTerminalTabs,
    moveTerminalToTab,
    setTerminalPanelFontSize,
    toggleTerminalMaximized,
    saveTerminalLayout,
    getPersistedTerminalLayout,
    clearTerminalState,
    setTerminalDefaultFontSize,
    setTerminalDefaultRunScript,
    setTerminalFontFamily,
    setTerminalLineHeight,
    setTerminalScrollbackLines,
    setTerminalScreenReaderMode,
    setTerminalBackgroundColor,
    setTerminalForegroundColor,
    updateTerminalPanelSizes,
    currentWorktreeByProject,
    worktreesByProject,
  } = useAppStore();

  const navigate = useNavigate();

  const [status, setStatus] = useState<TerminalStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [activeDragTabId, setActiveDragTabId] = useState<string | null>(null);
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null);
  const lastCreateTimeRef = useRef<number>(0);
  const isCreatingRef = useRef<boolean>(false);
  const restoringProjectPathRef = useRef<string | null>(null);
  const [newSessionIds, setNewSessionIds] = useState<Set<string>>(new Set());
  // Per-session command overrides (e.g., from scripts submenu), takes priority over defaultRunScript
  const [sessionCommandOverrides, setSessionCommandOverrides] = useState<Map<string, string>>(
    new Map()
  );
  const [serverSessionInfo, setServerSessionInfo] = useState<{
    current: number;
    max: number;
  } | null>(null);
  const hasShownHighRamWarningRef = useRef<boolean>(false);
  const initialCwdHandledRef = useRef<string | null>(null);

  // Show warning when 20+ terminals are open
  useEffect(() => {
    if (
      serverSessionInfo &&
      serverSessionInfo.current >= 20 &&
      !hasShownHighRamWarningRef.current
    ) {
      hasShownHighRamWarningRef.current = true;
      toast.warning('Many terminals open', {
        description: `${serverSessionInfo.current} terminals open. Each uses system resources (processes, memory). Consider closing unused terminals.`,
        duration: 8000,
      });
    }
    // Reset warning flag when session count drops below 20
    if (serverSessionInfo && serverSessionInfo.current < 20) {
      hasShownHighRamWarningRef.current = false;
    }
  }, [serverSessionInfo]);

  // Get the default run script from terminal settings
  const defaultRunScript = useAppStore((state) => state.terminalState.defaultRunScript);

  const serverUrl = import.meta.env.VITE_SERVER_URL || getServerUrlSync();

  // Helper to collect all session IDs from all tabs
  const collectAllSessionIds = useCallback((): string[] => {
    const sessionIds: string[] = [];
    const collectFromLayout = (node: TerminalPanelContent | null): void => {
      if (!node) return;
      if (node.type === 'terminal') {
        sessionIds.push(node.sessionId);
      } else if (node.type === 'split') {
        node.panels.forEach(collectFromLayout);
      }
      // testRunner type has sessionId but we only collect terminal sessions
    };
    terminalState.tabs.forEach((tab) => collectFromLayout(tab.layout));
    return sessionIds;
  }, [terminalState.tabs]);

  // Kill all terminal sessions on the server
  // This should be called before clearTerminalState() to prevent orphaned server sessions
  const killAllSessions = useCallback(async () => {
    const sessionIds = collectAllSessionIds();
    if (sessionIds.length === 0) return;

    const headers: Record<string, string> = {};
    if (terminalState.authToken) {
      headers['X-Terminal-Token'] = terminalState.authToken;
    }

    logger.info(`Killing ${sessionIds.length} sessions on server`);

    // Kill all sessions in parallel
    await Promise.allSettled(
      sessionIds.map(async (sessionId) => {
        try {
          await apiDeleteRaw(`/api/terminal/sessions/${sessionId}`, { headers });
        } catch (err) {
          logger.error(`Failed to kill session ${sessionId}:`, err);
        }
      })
    );
  }, [collectAllSessionIds, terminalState.authToken]);
  const CREATE_COOLDOWN_MS = 500; // Prevent rapid terminal creation

  // Helper to check if terminal creation should be debounced
  const canCreateTerminal = (debounceMessage: string): boolean => {
    const now = Date.now();
    if (now - lastCreateTimeRef.current < CREATE_COOLDOWN_MS || isCreatingRef.current) {
      logger.debug(debounceMessage);
      return false;
    }
    lastCreateTimeRef.current = now;
    isCreatingRef.current = true;
    return true;
  };

  // Get active tab
  const activeTab = terminalState.tabs.find((t) => t.id === terminalState.activeTabId);

  // DnD sensors with activation constraint to avoid accidental drags
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor)
  );

  // Handle drag start
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const activeId = event.active.id as string;
    const activeData = event.active.data?.current;

    if (activeData?.type === 'drag-tab') {
      // Tab being dragged
      setActiveDragTabId(activeData.tabId);
      setActiveDragId(null);
    } else {
      // Terminal panel being dragged
      setActiveDragId(activeId);
      setActiveDragTabId(null);
    }
  }, []);

  // Handle drag over - track which tab we're hovering
  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { over } = event;
    if (over?.data?.current?.type === 'tab') {
      setDragOverTabId(over.data.current.tabId);
    } else if (over?.data?.current?.type === 'new-tab') {
      setDragOverTabId('new');
    } else {
      setDragOverTabId(null);
    }
  }, []);

  // Handle drag end
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      const activeData = active.data?.current;

      // Reset drag states
      setActiveDragId(null);
      setActiveDragTabId(null);
      setDragOverTabId(null);

      if (!over) return;

      const overData = over.data?.current;

      // Handle tab-to-tab drag (reordering)
      if (activeData?.type === 'drag-tab' && overData?.type === 'tab') {
        const fromTabId = activeData.tabId as string;
        const toTabId = overData.tabId as string;
        if (fromTabId !== toTabId) {
          reorderTerminalTabs(fromTabId, toTabId);
        }
        return;
      }

      // Handle terminal panel drops
      const activeId = active.id as string;

      // If dropped on a tab, move terminal to that tab
      if (overData?.type === 'tab') {
        moveTerminalToTab(activeId, overData.tabId);
        return;
      }

      // If dropped on new tab zone, create new tab with this terminal
      if (overData?.type === 'new-tab') {
        moveTerminalToTab(activeId, 'new');
        return;
      }

      // Otherwise, swap terminals within current tab
      if (active.id !== over.id) {
        swapTerminals(activeId, over.id as string);
      }
    },
    [swapTerminals, moveTerminalToTab, reorderTerminalTabs]
  );

  const handleDragCancel = useCallback(() => {
    setActiveDragId(null);
    setActiveDragTabId(null);
    setDragOverTabId(null);
  }, []);

  // Fetch terminal status
  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiGet<{ success: boolean; data?: TerminalStatus; error?: string }>(
        '/api/terminal/status'
      );
      if (data.success && data.data) {
        setStatus(data.data);
        if (!data.data.passwordRequired) {
          setTerminalUnlocked(true);
        }
      } else {
        setError(data.error || 'Failed to get terminal status');
      }
    } catch (err) {
      setError('Failed to connect to server');
      logger.error('Status fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [setTerminalUnlocked]);

  // Fetch server session settings
  const fetchServerSettings = useCallback(async () => {
    if (!terminalState.isUnlocked) return;
    try {
      const headers: Record<string, string> = {};
      if (terminalState.authToken) {
        headers['X-Terminal-Token'] = terminalState.authToken;
      }
      const data = await apiGet<{
        success: boolean;
        data?: { currentSessions: number; maxSessions: number };
      }>('/api/terminal/settings', { headers });
      if (data.success && data.data) {
        setServerSessionInfo({ current: data.data.currentSessions, max: data.data.maxSessions });
      }
    } catch (err) {
      logger.error('Failed to fetch server settings:', err);
    }
  }, [terminalState.isUnlocked, terminalState.authToken]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Clean up all terminal sessions when the page/app is about to close
  // This prevents orphaned PTY processes on the server
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Use sendBeacon for reliable delivery during page unload
      // Fall back to sync fetch if sendBeacon is not available
      const sessionIds = collectAllSessionIds();
      if (sessionIds.length === 0) return;

      // Try to use the bulk delete endpoint if available, otherwise delete individually
      // Using sync XMLHttpRequest for reliability during page unload (async doesn't complete)
      sessionIds.forEach((sessionId) => {
        const url = `${serverUrl}/api/terminal/sessions/${sessionId}`;
        try {
          const xhr = new XMLHttpRequest();
          xhr.open('DELETE', url, false); // synchronous
          xhr.withCredentials = true; // Include cookies for session auth
          // Add API auth header
          const apiKey = getApiKey();
          if (apiKey) {
            xhr.setRequestHeader('X-API-Key', apiKey);
          }
          // Add terminal-specific auth
          if (terminalState.authToken) {
            xhr.setRequestHeader('X-Terminal-Token', terminalState.authToken);
          }
          xhr.send();
        } catch {
          // Ignore errors during unload - best effort cleanup
        }
      });
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [collectAllSessionIds, terminalState.authToken, serverUrl]);

  // Fetch server settings when terminal is unlocked
  useEffect(() => {
    if (terminalState.isUnlocked) {
      fetchServerSettings();
    }
  }, [terminalState.isUnlocked, fetchServerSettings]);

  // Handle initialCwd prop - auto-create a terminal with the specified working directory
  // This is triggered when navigating from worktree panel's "Open in Integrated Terminal"
  useEffect(() => {
    // Skip if no initialCwd provided
    if (!initialCwd) return;

    // Skip if we've already handled this exact request (prevents duplicate terminals)
    // Include mode and nonce in the key to allow opening same cwd multiple times
    const cwdKey = `${initialCwd}:${initialMode || 'default'}:${nonce || 0}:${initialCommand || ''}`;
    if (initialCwdHandledRef.current === cwdKey) return;

    // Skip if terminal is not enabled or not unlocked
    if (!status?.enabled) return;
    if (status.passwordRequired && !terminalState.isUnlocked) return;

    // Skip if still loading
    if (loading) return;

    // Mark this cwd as being handled
    initialCwdHandledRef.current = cwdKey;

    // Create the terminal with the specified cwd
    const createTerminalWithCwd = async () => {
      try {
        const headers: Record<string, string> = {};
        if (terminalState.authToken) {
          headers['X-Terminal-Token'] = terminalState.authToken;
        }

        const response = await apiFetch('/api/terminal/sessions', 'POST', {
          headers,
          body: { cwd: initialCwd, cols: 80, rows: 24 },
        });
        const data = await response.json();

        if (data.success) {
          // Create in new tab or split based on mode
          if (initialMode === 'tab') {
            // Create in a new tab (tab name uses default "Terminal N" naming)
            const newTabId = addTerminalTab();
            const { addTerminalToTab } = useAppStore.getState();
            // Pass branch name for display in terminal panel header
            addTerminalToTab(data.data.id, newTabId, 'horizontal', initialBranch);
          } else {
            // Default: add to current tab (split if there's already a terminal)
            // Pass branch name for display in terminal panel header
            addTerminalToLayout(data.data.id, undefined, undefined, initialBranch);
          }

          // Mark this session as new for running initial command
          if (initialCommand || defaultRunScript) {
            setNewSessionIds((prev) => new Set(prev).add(data.data.id));
            // Store per-session command override if an explicit command was provided
            if (initialCommand) {
              setSessionCommandOverrides((prev) => new Map(prev).set(data.data.id, initialCommand));
            }
          }

          // Show success toast with branch name if provided
          const displayName = initialBranch || initialCwd.split('/').pop() || initialCwd;
          toast.success(`Terminal opened at ${displayName}`);

          // Refresh session count
          fetchServerSettings();

          // Clear the cwd from the URL to prevent re-creating on refresh
          navigate({ to: '/terminal', search: {}, replace: true });
        } else {
          logger.error('Failed to create terminal for cwd:', data.error);
          toast.error('Failed to create terminal', {
            description: data.error || 'Unknown error',
          });
          // Reset the handled ref so the same cwd can be retried
          initialCwdHandledRef.current = null;
        }
      } catch (err) {
        logger.error('Create terminal with cwd error:', err);
        toast.error('Failed to create terminal', {
          description: 'Could not connect to server',
        });
        // Reset the handled ref so the same cwd can be retried
        initialCwdHandledRef.current = null;
      }
    };

    createTerminalWithCwd();
  }, [
    initialCwd,
    initialBranch,
    initialMode,
    initialCommand,
    nonce,
    status?.enabled,
    status?.passwordRequired,
    terminalState.isUnlocked,
    terminalState.authToken,
    terminalState.tabs.length,
    loading,
    defaultRunScript,
    addTerminalToLayout,
    addTerminalTab,
    fetchServerSettings,
    navigate,
  ]);

  // Handle project switching - save and restore terminal layouts
  // Uses terminalState.lastActiveProjectPath (persisted in store) instead of a local ref
  // This ensures terminals persist when navigating away from terminal route and back
  useEffect(() => {
    const currentPath = currentProject?.path || null;
    // Read lastActiveProjectPath directly from store to avoid dependency issues
    const prevPath = useAppStore.getState().terminalState.lastActiveProjectPath;

    // Skip if no change - this now correctly handles route changes within the same project
    // because lastActiveProjectPath persists in the store across component unmount/remount
    if (currentPath === prevPath) {
      return;
    }

    // If we're restoring a different project, that restore will be stale - let it finish but ignore results
    // The path check in restoreLayout will handle this

    // Save layout for previous project (if there was one and has terminals)
    // BUT don't save if we were mid-restore for that project (would save incomplete state)
    const currentTabs = useAppStore.getState().terminalState.tabs;
    if (prevPath && currentTabs.length > 0 && restoringProjectPathRef.current !== prevPath) {
      saveTerminalLayout(prevPath);
    }

    // Update the stored project path
    useAppStore.getState().setTerminalLastActiveProjectPath(currentPath);

    // Helper to kill sessions and clear state
    const killAndClear = async () => {
      // Kill all server-side sessions first to prevent orphaned processes
      await killAllSessions();
      clearTerminalState();
    };

    // If no current project, just clear terminals
    if (!currentPath) {
      killAndClear();
      return;
    }

    // ALWAYS clear existing terminals when switching projects
    // This is critical - prevents old project's terminals from "bleeding" into new project
    // We need to kill server sessions first to prevent orphans
    killAndClear();

    // Check for saved layout for this project
    const savedLayout = getPersistedTerminalLayout(currentPath);

    // If no saved layout or no tabs, we're done - terminal starts fresh for this project
    if (!savedLayout || savedLayout.tabs.length === 0) {
      logger.info('No saved layout for project, starting fresh');
      return;
    }

    // Restore the saved layout - try to reconnect to existing sessions
    // Track which project we're restoring to detect stale restores
    restoringProjectPathRef.current = currentPath;

    // Create terminals and build layout - try to reconnect or create new
    const restoreLayout = async () => {
      // Check if we're still restoring the same project (user may have switched)
      if (restoringProjectPathRef.current !== currentPath) {
        logger.info('Restore cancelled - project changed');
        return;
      }

      let failedSessions = 0;
      let totalSessions = 0;
      let reconnectedSessions = 0;

      try {
        const headers: Record<string, string> = {};
        // Get fresh auth token from store
        const authToken = useAppStore.getState().terminalState.authToken;
        if (authToken) {
          headers['X-Terminal-Token'] = authToken;
        }

        // Helper to check if a session still exists on server
        const checkSessionExists = async (sessionId: string): Promise<boolean> => {
          try {
            const data = await apiGet<{ success: boolean }>(`/api/terminal/sessions/${sessionId}`, {
              headers,
            });
            return data.success === true;
          } catch {
            return false;
          }
        };

        // Helper to create a new terminal session
        const createSession = async (): Promise<string | null> => {
          try {
            const data = await apiPost<{ success: boolean; data?: { id: string } }>(
              '/api/terminal/sessions',
              { cwd: currentPath, cols: 80, rows: 24 },
              { headers }
            );
            return data.success && data.data ? data.data.id : null;
          } catch (err) {
            logger.error('Failed to create terminal session:', err);
            return null;
          }
        };

        // Recursively rebuild the layout - reuse existing sessions or create new
        const rebuildLayout = async (
          persisted: PersistedTerminalPanel
        ): Promise<TerminalPanelContent | null> => {
          if (persisted.type === 'terminal') {
            totalSessions++;
            let sessionId: string | null = null;

            // If we have a saved sessionId, try to reconnect to it
            if (persisted.sessionId) {
              const exists = await checkSessionExists(persisted.sessionId);
              if (exists) {
                sessionId = persisted.sessionId;
                reconnectedSessions++;
              }
            }

            // If no saved session or it's gone, create a new one
            if (!sessionId) {
              sessionId = await createSession();
            }

            if (!sessionId) {
              failedSessions++;
              return null;
            }

            return {
              type: 'terminal',
              sessionId,
              size: persisted.size,
              fontSize: persisted.fontSize,
            };
          }

          // Handle testRunner type - skip for now as we don't persist test runner sessions
          if (persisted.type === 'testRunner') {
            return null;
          }

          // It's a split - rebuild all child panels
          const childPanels: TerminalPanelContent[] = [];
          for (const childPersisted of persisted.panels) {
            const rebuilt = await rebuildLayout(childPersisted);
            if (rebuilt) {
              childPanels.push(rebuilt);
            }
          }

          // If no children were rebuilt, return null
          if (childPanels.length === 0) return null;

          // If only one child, return it directly (collapse the split)
          if (childPanels.length === 1) return childPanels[0];

          return {
            type: 'split',
            id: persisted.id || `split-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
            direction: persisted.direction,
            panels: childPanels,
            size: persisted.size,
          };
        };

        // For each saved tab, rebuild the layout
        for (let tabIndex = 0; tabIndex < savedLayout.tabs.length; tabIndex++) {
          // Check if project changed during restore - bail out early
          if (restoringProjectPathRef.current !== currentPath) {
            logger.info('Restore cancelled mid-loop - project changed');
            return;
          }

          const savedTab = savedLayout.tabs[tabIndex];

          // Create the tab first
          const newTabId = addTerminalTab(savedTab.name);

          if (savedTab.layout) {
            const rebuiltLayout = await rebuildLayout(savedTab.layout);
            if (rebuiltLayout) {
              const { setTerminalTabLayout } = useAppStore.getState();
              setTerminalTabLayout(newTabId, rebuiltLayout);
            }
          }
        }

        // Set active tab based on saved index
        if (savedLayout.tabs.length > 0) {
          const { setActiveTerminalTab } = useAppStore.getState();
          const newTabs = useAppStore.getState().terminalState.tabs;
          if (newTabs.length > savedLayout.activeTabIndex) {
            setActiveTerminalTab(newTabs[savedLayout.activeTabIndex].id);
          }
        }

        if (failedSessions > 0) {
          toast.error('Some terminals failed to restore', {
            description: `${failedSessions} of ${totalSessions} terminal sessions could not be created. The server may be unavailable.`,
            duration: 5000,
          });
        } else if (reconnectedSessions > 0) {
          toast.success('Terminals restored', {
            description: `Reconnected to ${reconnectedSessions} existing session${reconnectedSessions > 1 ? 's' : ''}`,
            duration: 3000,
          });
        }
      } catch (err) {
        logger.error('Failed to restore terminal layout:', err);
        toast.error('Failed to restore terminals', {
          description: 'Could not restore terminal layout. Please try creating new terminals.',
          duration: 5000,
        });
      } finally {
        // Only clear if we're still the active restore
        if (restoringProjectPathRef.current === currentPath) {
          restoringProjectPathRef.current = null;
        }
      }
    };

    restoreLayout();
  }, [
    currentProject?.path,
    saveTerminalLayout,
    getPersistedTerminalLayout,
    clearTerminalState,
    addTerminalTab,
    serverUrl,
    killAllSessions,
  ]);

  // Save terminal layout whenever it changes (debounced to prevent excessive writes)
  // Also save when tabs become empty so closed terminals stay closed on refresh
  const saveLayoutTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingSavePathRef = useRef<string | null>(null);
  useEffect(() => {
    const projectPath = currentProject?.path;
    // Don't save while restoring this project's layout
    if (projectPath && restoringProjectPathRef.current !== projectPath) {
      // Debounce saves to prevent excessive localStorage writes during rapid changes
      if (saveLayoutTimeoutRef.current) {
        clearTimeout(saveLayoutTimeoutRef.current);
      }
      // Capture the project path at schedule time so we save to the correct project
      // even if user switches projects before the timeout fires
      pendingSavePathRef.current = projectPath;
      saveLayoutTimeoutRef.current = setTimeout(() => {
        // Only save if we're still on the same project
        if (pendingSavePathRef.current === projectPath) {
          saveTerminalLayout(projectPath);
        }
        pendingSavePathRef.current = null;
        saveLayoutTimeoutRef.current = null;
      }, 500); // 500ms debounce
    }

    return () => {
      if (saveLayoutTimeoutRef.current) {
        clearTimeout(saveLayoutTimeoutRef.current);
      }
    };
  }, [terminalState.tabs, currentProject?.path, saveTerminalLayout]);

  // Handle password authentication
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);

    try {
      const data = await apiPost<{ success: boolean; data?: { token: string }; error?: string }>(
        '/api/terminal/auth',
        { password }
      );

      if (data.success && data.data) {
        setTerminalUnlocked(true, data.data.token);
        setPassword('');
      } else {
        setAuthError(data.error || 'Authentication failed');
      }
    } catch (err) {
      setAuthError('Failed to authenticate');
      logger.error('Auth error:', err);
    } finally {
      setAuthLoading(false);
    }
  };

  // Helper: find the branchName of the given session ID within a layout tree
  const findSessionBranchName = (
    layout: TerminalPanelContent | null,
    sessionId: string
  ): string | undefined => {
    if (!layout) return undefined;
    if (layout.type === 'terminal') {
      return layout.sessionId === sessionId ? layout.branchName : undefined;
    }
    if (layout.type === 'split') {
      for (const panel of layout.panels) {
        const found = findSessionBranchName(panel, sessionId);
        if (found !== undefined) return found;
      }
    }
    return undefined;
  };

  // Helper: resolve the worktree cwd and branchName for the currently active terminal session.
  // Returns { cwd, branchName } if the active terminal was opened in a worktree, or {} otherwise.
  const getActiveSessionWorktreeInfo = (): { cwd?: string; branchName?: string } => {
    const activeSessionId = terminalState.activeSessionId;
    if (!activeSessionId || !activeTab?.layout || !currentProject) return {};

    const branchName = findSessionBranchName(activeTab.layout, activeSessionId);
    if (!branchName) return {};

    // Look up the worktree path for this branch in the project's worktree list
    const projectWorktrees = worktreesByProject[currentProject.path] ?? [];
    const worktree = projectWorktrees.find((wt) => wt.branch === branchName);
    if (!worktree) return { branchName };

    return { cwd: worktree.path, branchName };
  };

  // Create a new terminal session
  // targetSessionId: the terminal to split (if splitting an existing terminal)
  // customCwd: optional working directory to use instead of the current project path
  // branchName: optional branch name to display in the terminal panel header
  const createTerminal = async (
    direction?: 'horizontal' | 'vertical',
    targetSessionId?: string,
    customCwd?: string,
    branchName?: string
  ) => {
    if (!canCreateTerminal('[Terminal] Debounced terminal creation')) {
      return;
    }

    try {
      const headers: Record<string, string> = {};
      if (terminalState.authToken) {
        headers['X-Terminal-Token'] = terminalState.authToken;
      }

      const response = await apiFetch('/api/terminal/sessions', 'POST', {
        headers,
        body: { cwd: customCwd || currentProject?.path || undefined, cols: 80, rows: 24 },
      });
      const data = await response.json();

      if (data.success) {
        addTerminalToLayout(data.data.id, direction, targetSessionId, branchName);
        // Mark this session as new for running initial command
        if (defaultRunScript) {
          setNewSessionIds((prev) => new Set(prev).add(data.data.id));
        }
        // Refresh session count
        fetchServerSettings();
      } else {
        // Handle session limit error with a helpful toast
        if (response.status === 429 || data.error?.includes('Maximum')) {
          toast.error('Terminal session limit reached', {
            description:
              data.details ||
              `Please close unused terminals. Limit: ${data.maxSessions || 'unknown'}`,
          });
        } else {
          logger.error('Failed to create session:', data.error);
          toast.error('Failed to create terminal', {
            description: data.error || 'Unknown error',
          });
        }
      }
    } catch (err) {
      logger.error('Create session error:', err);
      toast.error('Failed to create terminal', {
        description: 'Could not connect to server',
      });
    } finally {
      isCreatingRef.current = false;
    }
  };

  // Create terminal in new tab
  // customCwd: optional working directory (e.g., a specific worktree path)
  // branchName: optional branch name to display in the terminal panel header
  // command: optional command to run when the terminal connects (e.g., from scripts menu)
  const createTerminalInNewTab = async (
    customCwd?: string,
    branchName?: string,
    command?: string
  ) => {
    if (!canCreateTerminal('[Terminal] Debounced terminal tab creation')) {
      return;
    }

    // Use provided cwd/branch, or inherit from active session's worktree
    const { cwd: worktreeCwd, branchName: worktreeBranch } = customCwd
      ? { cwd: customCwd, branchName: branchName }
      : getActiveSessionWorktreeInfo();

    const tabId = addTerminalTab();
    try {
      const headers: Record<string, string> = {};
      if (terminalState.authToken) {
        headers['X-Terminal-Token'] = terminalState.authToken;
      }

      const response = await apiFetch('/api/terminal/sessions', 'POST', {
        headers,
        body: { cwd: worktreeCwd || currentProject?.path || undefined, cols: 80, rows: 24 },
      });
      const data = await response.json();

      if (data.success) {
        // Add to the newly created tab (passing branchName so the panel header shows the branch badge)
        const { addTerminalToTab } = useAppStore.getState();
        addTerminalToTab(data.data.id, tabId, undefined, worktreeBranch);
        // Mark this session as new for running initial command
        if (command || defaultRunScript) {
          setNewSessionIds((prev) => new Set(prev).add(data.data.id));
          // Store per-session command override if an explicit command was provided
          if (command) {
            setSessionCommandOverrides((prev) => new Map(prev).set(data.data.id, command));
          }
        }
        // Refresh session count
        fetchServerSettings();
      } else {
        // Remove the empty tab that was created
        const { removeTerminalTab } = useAppStore.getState();
        removeTerminalTab(tabId);

        // Handle session limit error with a helpful toast
        if (response.status === 429 || data.error?.includes('Maximum')) {
          toast.error('Terminal session limit reached', {
            description:
              data.details ||
              `Please close unused terminals. Limit: ${data.maxSessions || 'unknown'}`,
          });
        } else {
          toast.error('Failed to create terminal', {
            description: data.error || 'Unknown error',
          });
        }
      }
    } catch (err) {
      logger.error('Create session error:', err);
      // Remove the empty tab on error
      const { removeTerminalTab } = useAppStore.getState();
      removeTerminalTab(tabId);
      toast.error('Failed to create terminal', {
        description: 'Could not connect to server',
      });
    } finally {
      isCreatingRef.current = false;
    }
  };

  // Kill a terminal session
  const killTerminal = async (sessionId: string) => {
    try {
      const headers: Record<string, string> = {};
      if (terminalState.authToken) {
        headers['X-Terminal-Token'] = terminalState.authToken;
      }

      const response = await apiDeleteRaw(`/api/terminal/sessions/${sessionId}`, { headers });

      // Always remove from UI - even if server says 404 (session may have already exited)
      removeTerminalFromLayout(sessionId);

      // Clean up stale entries for killed sessions
      setSessionCommandOverrides((prev) => {
        const next = new Map(prev);
        next.delete(sessionId);
        return next;
      });
      setNewSessionIds((prev) => {
        const next = new Set(prev);
        next.delete(sessionId);
        return next;
      });

      if (!response.ok && response.status !== 404) {
        // Log non-404 errors but still proceed with UI cleanup
        const data = await response.json().catch(() => ({}));
        logger.error('Server failed to kill session:', data.error || response.statusText);
      }

      // Refresh session count
      fetchServerSettings();
    } catch (err) {
      logger.error('Kill session error:', err);
      // Still remove from UI on network error - better UX than leaving broken terminal
      removeTerminalFromLayout(sessionId);
      // Clean up stale entries for killed sessions (same cleanup as try block)
      setSessionCommandOverrides((prev) => {
        const next = new Map(prev);
        next.delete(sessionId);
        return next;
      });
      setNewSessionIds((prev) => {
        const next = new Set(prev);
        next.delete(sessionId);
        return next;
      });
    }
  };

  // Kill all terminals in a tab and then remove the tab
  const killTerminalTab = async (tabId: string) => {
    const tab = terminalState.tabs.find((t) => t.id === tabId);
    if (!tab) return;

    // Collect all session IDs from the tab's layout
    const collectSessionIds = (node: TerminalPanelContent | null): string[] => {
      if (!node) return [];
      if (node.type === 'terminal') return [node.sessionId];
      if (node.type === 'split') return node.panels.flatMap(collectSessionIds);
      return []; // testRunner type
    };

    const sessionIds = collectSessionIds(tab.layout);

    // Kill all sessions on the server
    const headers: Record<string, string> = {};
    if (terminalState.authToken) {
      headers['X-Terminal-Token'] = terminalState.authToken;
    }

    await Promise.all(
      sessionIds.map(async (sessionId) => {
        try {
          await apiDeleteRaw(`/api/terminal/sessions/${sessionId}`, { headers });
        } catch (err) {
          logger.error(`Failed to kill session ${sessionId}:`, err);
        }
      })
    );

    // Clean up stale entries for all killed sessions in this tab
    setSessionCommandOverrides((prev) => {
      const next = new Map(prev);
      for (const sessionId of sessionIds) {
        next.delete(sessionId);
      }
      return next;
    });
    setNewSessionIds((prev) => {
      const next = new Set(prev);
      for (const sessionId of sessionIds) {
        next.delete(sessionId);
      }
      return next;
    });

    // Now remove the tab from state
    removeTerminalTab(tabId);
    // Refresh session count
    fetchServerSettings();
  };

  // NOTE: Terminal keyboard shortcuts (Alt+D, Alt+S, Alt+W) are handled in
  // terminal-panel.tsx via attachCustomKeyEventHandler. This is more reliable
  // because it uses event.code (keyboard-layout independent) instead of event.key
  // which can produce special characters when Alt is pressed on some systems.
  // See: terminal-panel.tsx lines 319-399 for the shortcut handlers.

  // Collect all terminal IDs from a panel tree in order
  const getTerminalIds = (panel: TerminalPanelContent): string[] => {
    if (panel.type === 'terminal') {
      return [panel.sessionId];
    }
    if (panel.type === 'split') {
      return panel.panels.flatMap(getTerminalIds);
    }
    return []; // testRunner type
  };

  // Get a STABLE key for a panel - uses the stable id for splits
  // This prevents unnecessary remounts when layout structure changes
  const getPanelKey = (panel: TerminalPanelContent): string => {
    if (panel.type === 'terminal') {
      return panel.sessionId;
    }
    if (panel.type === 'split') {
      // Use the stable id for split nodes
      return panel.id;
    }
    // testRunner - use sessionId
    return panel.sessionId;
  };

  const findTerminalFontSize = useCallback(
    (sessionId: string): number => {
      const findInPanel = (panel: TerminalPanelContent): number | null => {
        if (panel.type === 'terminal') {
          if (panel.sessionId === sessionId) {
            return panel.fontSize ?? terminalState.defaultFontSize;
          }
          return null;
        }
        if (panel.type !== 'split') return null; // testRunner type
        for (const child of panel.panels) {
          const found = findInPanel(child);
          if (found !== null) return found;
        }
        return null;
      };

      // Search across all tabs
      for (const tab of terminalState.tabs) {
        if (tab.layout) {
          const found = findInPanel(tab.layout);
          if (found !== null) return found;
        }
      }
      return terminalState.defaultFontSize;
    },
    [terminalState.tabs, terminalState.defaultFontSize]
  );

  // Handler for when a terminal has run its initial command
  const handleCommandRan = useCallback((sessionId: string) => {
    setNewSessionIds((prev) => {
      const next = new Set(prev);
      next.delete(sessionId);
      return next;
    });
    // Clean up any per-session command override
    setSessionCommandOverrides((prev) => {
      const next = new Map(prev);
      next.delete(sessionId);
      return next;
    });
  }, []);

  // Navigate between terminal panes with directional awareness
  // Arrow keys navigate in the actual spatial direction within the layout
  const navigateToTerminal = useCallback(
    (direction: 'up' | 'down' | 'left' | 'right') => {
      if (!activeTab?.layout) return;

      const currentSessionId = terminalState.activeSessionId;
      if (!currentSessionId) {
        // If no terminal is active, focus the first one
        const terminalIds = getTerminalIds(activeTab.layout);
        if (terminalIds.length > 0) {
          setActiveTerminalSession(terminalIds[0]);
        }
        return;
      }

      // Find the terminal in the given direction
      // The algorithm traverses the layout tree to find spatially adjacent terminals
      const findTerminalInDirection = (
        layout: TerminalPanelContent,
        targetId: string,
        dir: 'up' | 'down' | 'left' | 'right'
      ): string | null => {
        // Helper to get all terminal IDs from a layout subtree
        const getAllTerminals = (node: TerminalPanelContent): string[] => {
          if (node.type === 'terminal') return [node.sessionId];
          if (node.type === 'split') return node.panels.flatMap(getAllTerminals);
          return []; // testRunner type
        };

        // Helper to find terminal and its path in the tree
        type PathEntry = {
          node: TerminalPanelContent;
          index: number;
          direction: 'horizontal' | 'vertical';
        };
        const findPath = (
          node: TerminalPanelContent,
          target: string,
          path: PathEntry[] = []
        ): PathEntry[] | null => {
          if (node.type === 'terminal') {
            return node.sessionId === target ? path : null;
          }
          if (node.type !== 'split') return null; // testRunner type
          for (let i = 0; i < node.panels.length; i++) {
            const result = findPath(node.panels[i], target, [
              ...path,
              { node, index: i, direction: node.direction },
            ]);
            if (result) return result;
          }
          return null;
        };

        const path = findPath(layout, targetId);
        if (!path || path.length === 0) return null;

        // Determine which split direction we need based on arrow direction
        // left/right navigation works in "horizontal" splits (panels side by side)
        // up/down navigation works in "vertical" splits (panels stacked)
        const neededDirection = dir === 'left' || dir === 'right' ? 'horizontal' : 'vertical';
        const goingForward = dir === 'right' || dir === 'down';

        // Walk up the path to find a split in the right direction with an adjacent panel
        for (let i = path.length - 1; i >= 0; i--) {
          const entry = path[i];
          if (entry.direction === neededDirection) {
            const siblings = entry.node.type === 'split' ? entry.node.panels : [];
            const nextIndex = goingForward ? entry.index + 1 : entry.index - 1;

            if (nextIndex >= 0 && nextIndex < siblings.length) {
              // Found an adjacent panel in the right direction
              const adjacentPanel = siblings[nextIndex];
              const adjacentTerminals = getAllTerminals(adjacentPanel);

              if (adjacentTerminals.length > 0) {
                // When moving forward (right/down), pick the first terminal in that subtree
                // When moving backward (left/up), pick the last terminal in that subtree
                return goingForward
                  ? adjacentTerminals[0]
                  : adjacentTerminals[adjacentTerminals.length - 1];
              }
            }
          }
        }

        return null;
      };

      const nextTerminal = findTerminalInDirection(activeTab.layout, currentSessionId, direction);
      if (nextTerminal) {
        setActiveTerminalSession(nextTerminal);
      }
    },
    [activeTab?.layout, terminalState.activeSessionId, setActiveTerminalSession]
  );

  // Handle global keyboard shortcuts for pane navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Alt+Arrow (or Cmd+Alt+Arrow on Mac) for pane navigation
      if ((e.ctrlKey || e.metaKey) && e.altKey && !e.shiftKey) {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          navigateToTerminal('right');
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          navigateToTerminal('left');
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          navigateToTerminal('down');
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          navigateToTerminal('up');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigateToTerminal]);

  // Render panel content recursively
  const renderPanelContent = (content: TerminalPanelContent): React.ReactNode => {
    if (content.type === 'terminal') {
      // Use per-terminal fontSize or fall back to default
      const terminalFontSize = content.fontSize ?? terminalState.defaultFontSize;
      // Only run command on new sessions (not restored ones)
      const isNewSession = newSessionIds.has(content.sessionId);
      // Per-session command override takes priority over defaultRunScript
      const sessionCommand = sessionCommandOverrides.get(content.sessionId);
      const runCommand = isNewSession ? sessionCommand || defaultRunScript : undefined;
      return (
        <TerminalErrorBoundary
          key={`boundary-${content.sessionId}`}
          sessionId={content.sessionId}
          onRestart={() => {
            // When terminal crashes and is restarted, recreate the session
            killTerminal(content.sessionId);
            createTerminal();
          }}
        >
          <TerminalPanel
            key={content.sessionId}
            sessionId={content.sessionId}
            authToken={terminalState.authToken}
            isActive={terminalState.activeSessionId === content.sessionId}
            onFocus={() => setActiveTerminalSession(content.sessionId)}
            onClose={() => killTerminal(content.sessionId)}
            onSplitHorizontal={() => {
              const { cwd, branchName } = getActiveSessionWorktreeInfo();
              createTerminal('horizontal', content.sessionId, cwd, branchName);
            }}
            onSplitVertical={() => {
              const { cwd, branchName } = getActiveSessionWorktreeInfo();
              createTerminal('vertical', content.sessionId, cwd, branchName);
            }}
            onNewTab={createTerminalInNewTab}
            onRunCommandInNewTab={(command: string) => {
              const { cwd, branchName: branch } = getActiveSessionWorktreeInfo();
              createTerminalInNewTab(cwd, branch, command);
            }}
            onNavigateUp={() => navigateToTerminal('up')}
            onNavigateDown={() => navigateToTerminal('down')}
            onNavigateLeft={() => navigateToTerminal('left')}
            onNavigateRight={() => navigateToTerminal('right')}
            onSessionInvalid={() => {
              // Auto-remove stale session when server says it doesn't exist
              // This handles cases like server restart where sessions are lost
              logger.info(`Session ${content.sessionId} is invalid, removing from layout`);
              killTerminal(content.sessionId);
            }}
            isDragging={activeDragId === content.sessionId}
            isDropTarget={activeDragId !== null && activeDragId !== content.sessionId}
            fontSize={terminalFontSize}
            onFontSizeChange={(size) => setTerminalPanelFontSize(content.sessionId, size)}
            runCommandOnConnect={runCommand}
            onCommandRan={() => handleCommandRan(content.sessionId)}
            isMaximized={terminalState.maximizedSessionId === content.sessionId}
            onToggleMaximize={() => toggleTerminalMaximized(content.sessionId)}
            branchName={content.branchName}
          />
        </TerminalErrorBoundary>
      );
    }

    // Handle testRunner type - return null for now
    if (content.type === 'testRunner') {
      return null;
    }

    const isHorizontal = content.direction === 'horizontal';
    const defaultSizePerPanel = 100 / content.panels.length;

    const handleLayoutChange = (sizes: number[]) => {
      if (!activeTab) return;
      const panelKeys = content.panels.map(getPanelKey);
      updateTerminalPanelSizes(activeTab.id, panelKeys, sizes);
    };

    return (
      <PanelGroup direction={content.direction} onLayout={handleLayoutChange}>
        {content.panels.map((panel: TerminalPanelContent, index: number) => {
          const panelSize =
            panel.type === 'terminal' && panel.size ? panel.size : defaultSizePerPanel;

          const panelKey = getPanelKey(panel);
          return (
            <React.Fragment key={panelKey}>
              {index > 0 && (
                <PanelResizeHandle
                  key={`handle-${panelKey}`}
                  className={
                    isHorizontal
                      ? 'w-1 h-full bg-border hover:bg-brand-500 transition-colors data-[resize-handle-state=hover]:bg-brand-500 data-[resize-handle-state=drag]:bg-brand-500'
                      : 'h-1 w-full bg-border hover:bg-brand-500 transition-colors data-[resize-handle-state=hover]:bg-brand-500 data-[resize-handle-state=drag]:bg-brand-500'
                  }
                />
              )}
              <Panel id={panelKey} order={index} defaultSize={panelSize} minSize={30}>
                {renderPanelContent(panel)}
              </Panel>
            </React.Fragment>
          );
        })}
      </PanelGroup>
    );
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner size="xl" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
        <div className="p-4 rounded-full bg-destructive/10 mb-4">
          <AlertCircle className="h-12 w-12 text-destructive" />
        </div>
        <h2 className="text-lg font-medium mb-2">Terminal Unavailable</h2>
        <p className="text-muted-foreground max-w-md mb-4">{error}</p>
        <Button variant="outline" onClick={fetchStatus}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  // Disabled state
  if (!status?.enabled) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
        <div className="p-4 rounded-full bg-muted/50 mb-4">
          <TerminalIcon className="h-12 w-12 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-medium mb-2">Terminal Disabled</h2>
        <p className="text-muted-foreground max-w-md">
          Terminal access has been disabled. Set{' '}
          <code className="px-1.5 py-0.5 rounded bg-muted">TERMINAL_ENABLED=true</code> in your
          server .env file to enable it.
        </p>
      </div>
    );
  }

  // Password gate
  if (status.passwordRequired && !terminalState.isUnlocked) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
        <div className="p-4 rounded-full bg-muted/50 mb-4">
          <Lock className="h-12 w-12 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-medium mb-2">Terminal Protected</h2>
        <p className="text-muted-foreground max-w-md mb-6">
          Terminal access requires authentication. Enter the password to unlock.
        </p>

        <form onSubmit={handleAuth} className="w-full max-w-xs space-y-4">
          <Input
            type="password"
            placeholder="Enter password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={authLoading}
            autoFocus
          />
          {authError && <p className="text-sm text-destructive">{authError}</p>}
          <Button type="submit" className="w-full" disabled={authLoading || !password}>
            {authLoading ? (
              <Spinner size="sm" className="mr-2" />
            ) : (
              <Unlock className="h-4 w-4 mr-2" />
            )}
            Unlock Terminal
          </Button>
        </form>

        {status.platform && (
          <p className="text-xs text-muted-foreground mt-6">
            Platform: {status.platform.platform}
            {status.platform.isWSL && ' (WSL)'}
            {' | '}Shell: {status.platform.defaultShell}
          </p>
        )}
      </div>
    );
  }

  // No terminals yet - show welcome screen
  if (terminalState.tabs.length === 0) {
    // Get the current worktree for this project (if any)
    const currentWorktreeInfo = currentProject
      ? (currentWorktreeByProject[currentProject.path] ?? null)
      : null;
    // Only show worktree button when the current worktree has a specific path set
    // (non-null path means a worktree is selected, as opposed to the main project)
    const currentWorktreePath = currentWorktreeInfo?.path ?? null;
    const currentWorktreeBranch = currentWorktreeInfo?.branch ?? null;

    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
        <div className="p-4 rounded-full bg-brand-500/10 mb-4">
          <TerminalIcon className="h-12 w-12 text-brand-500" />
        </div>
        <h2 className="text-lg font-medium mb-2">Terminal</h2>
        <p className="text-muted-foreground max-w-md mb-6">
          Create a new terminal session to start executing commands.
          {currentProject && (
            <span className="block mt-2 text-sm">
              Working directory:{' '}
              <code className="px-1.5 py-0.5 rounded bg-muted">{currentProject.path}</code>
            </span>
          )}
        </p>

        <div className="flex flex-col items-center gap-3 w-full max-w-xs">
          {currentWorktreePath && (
            <Button
              className="w-full flex-col h-auto py-2"
              onClick={() =>
                createTerminal(
                  undefined,
                  undefined,
                  currentWorktreePath,
                  currentWorktreeBranch ?? undefined
                )
              }
            >
              <span className="flex items-center">
                <GitBranch className="h-4 w-4 mr-2 shrink-0" />
                Open Terminal in Worktree
              </span>
              {currentWorktreeBranch && (
                <span className="text-xs opacity-70 truncate max-w-full px-2">
                  {currentWorktreeBranch}
                </span>
              )}
            </Button>
          )}

          <Button
            className="w-full"
            variant={currentWorktreePath ? 'outline' : 'default'}
            onClick={() => createTerminal()}
          >
            <Plus className="h-4 w-4 mr-2" />
            New Terminal
          </Button>
        </div>

        {status?.platform && (
          <p className="text-xs text-muted-foreground mt-6">
            Platform: {status.platform.platform}
            {status.platform.isWSL && ' (WSL)'}
            {' | '}Shell: {status.platform.defaultShell}
          </p>
        )}
      </div>
    );
  }

  // Terminal view with tabs
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Tab bar */}
        <div className="flex items-center bg-card border-b border-border px-2">
          {/* Tabs */}
          <div className="flex items-center gap-1 flex-1 overflow-x-auto py-1">
            {terminalState.tabs.map((tab) => (
              <TerminalTabButton
                key={tab.id}
                tab={tab}
                isActive={tab.id === terminalState.activeTabId}
                onClick={() => setActiveTerminalTab(tab.id)}
                onClose={() => killTerminalTab(tab.id)}
                onRename={(newName) => renameTerminalTab(tab.id, newName)}
                isDropTarget={activeDragId !== null || activeDragTabId !== null}
                isDraggingTab={activeDragTabId !== null}
              />
            ))}

            {(activeDragId || activeDragTabId) && <NewTabDropZone isDropTarget={true} />}

            {/* New tab split button */}
            <div className="flex items-center">
              <button
                className="flex items-center justify-center p-1.5 rounded-l hover:bg-accent text-muted-foreground hover:text-foreground"
                onClick={() => createTerminalInNewTab()}
                title="New Tab"
              >
                <Plus className="h-4 w-4" />
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="flex items-center justify-center px-0.5 py-1.5 rounded-r hover:bg-accent text-muted-foreground hover:text-foreground border-l border-border"
                    title="New Terminal Options"
                  >
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="bottom" className="w-56">
                  <DropdownMenuItem onClick={() => createTerminalInNewTab()} className="gap-2">
                    <Plus className="h-4 w-4" />
                    New Tab
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      const { cwd, branchName } = getActiveSessionWorktreeInfo();
                      createTerminal('horizontal', undefined, cwd, branchName);
                    }}
                    className="gap-2"
                  >
                    <SplitSquareHorizontal className="h-4 w-4" />
                    Split Right
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      const { cwd, branchName } = getActiveSessionWorktreeInfo();
                      createTerminal('vertical', undefined, cwd, branchName);
                    }}
                    className="gap-2"
                  >
                    <SplitSquareVertical className="h-4 w-4" />
                    Split Down
                  </DropdownMenuItem>
                  {/* Worktree options - show when project has worktrees */}
                  {(() => {
                    const projectWorktrees = currentProject
                      ? (worktreesByProject[currentProject.path] ?? [])
                      : [];
                    if (projectWorktrees.length === 0) return null;
                    const mainWorktree = projectWorktrees.find((wt) => wt.isMain);
                    const featureWorktrees = projectWorktrees.filter((wt) => !wt.isMain);
                    return (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel className="text-xs text-muted-foreground">
                          Open in Worktree
                        </DropdownMenuLabel>
                        {mainWorktree && (
                          <DropdownMenuItem
                            onClick={() =>
                              createTerminalInNewTab(mainWorktree.path, mainWorktree.branch)
                            }
                            className="gap-2"
                          >
                            <FolderGit className="h-4 w-4" />
                            <span className="truncate">{mainWorktree.branch}</span>
                            <span className="ml-auto text-[10px] text-muted-foreground shrink-0">
                              main
                            </span>
                          </DropdownMenuItem>
                        )}
                        {featureWorktrees.map((wt) => (
                          <DropdownMenuItem
                            key={wt.path}
                            onClick={() => createTerminalInNewTab(wt.path, wt.branch)}
                            className="gap-2"
                          >
                            <GitBranch className="h-4 w-4" />
                            <span className="truncate">{wt.branch}</span>
                          </DropdownMenuItem>
                        ))}
                      </>
                    );
                  })()}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Toolbar buttons */}
          <div className="flex items-center gap-1 pl-2 border-l border-border">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-muted-foreground hover:text-foreground"
              onClick={() => {
                const { cwd, branchName } = getActiveSessionWorktreeInfo();
                createTerminal('horizontal', undefined, cwd, branchName);
              }}
              title="Split Right"
            >
              <SplitSquareHorizontal className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-muted-foreground hover:text-foreground"
              onClick={() => {
                const { cwd, branchName } = getActiveSessionWorktreeInfo();
                createTerminal('vertical', undefined, cwd, branchName);
              }}
              title="Split Down"
            >
              <SplitSquareVertical className="h-4 w-4" />
            </Button>

            {/* Global Terminal Settings */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-muted-foreground hover:text-foreground"
                  title="Terminal Settings"
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72" align="end">
                <div className="space-y-4">
                  <div className="space-y-1">
                    <h4 className="font-medium text-sm">Terminal Settings</h4>
                    <p className="text-xs text-muted-foreground">
                      Configure global terminal appearance
                    </p>
                  </div>

                  {/* Default Font Size */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">Default Font Size</Label>
                      <span className="text-xs text-muted-foreground">
                        {terminalState.defaultFontSize}px
                      </span>
                    </div>
                    <Slider
                      value={[terminalState.defaultFontSize]}
                      min={8}
                      max={32}
                      step={1}
                      onValueChange={([value]) => setTerminalDefaultFontSize(value)}
                      onValueCommit={() => {
                        toast.info('Font size changed', {
                          description: 'New terminals will use this size',
                        });
                      }}
                    />
                  </div>

                  {/* Default Run Script */}
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Run on New Terminal</Label>
                    <Input
                      value={terminalState.defaultRunScript}
                      onChange={(e) => setTerminalDefaultRunScript(e.target.value)}
                      placeholder="e.g., claude"
                      className="h-7 text-xs"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Command to run when creating a new terminal
                    </p>
                  </div>

                  {/* Font Family */}
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Font Family</Label>
                    <Select
                      value={terminalState.fontFamily || DEFAULT_FONT_VALUE}
                      onValueChange={(value) => {
                        setTerminalFontFamily(value);
                        toast.info('Font family changed', {
                          description: 'Restart terminal for changes to take effect',
                        });
                      }}
                    >
                      <SelectTrigger className="w-full h-8 text-xs">
                        <SelectValue placeholder="Default (Menlo / Monaco)" />
                      </SelectTrigger>
                      <SelectContent>
                        {TERMINAL_FONT_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            <span
                              style={{
                                fontFamily:
                                  option.value === DEFAULT_FONT_VALUE ? undefined : option.value,
                              }}
                            >
                              {option.label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Scrollback */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">Scrollback</Label>
                      <span className="text-xs text-muted-foreground">
                        {(terminalState.scrollbackLines / 1000).toFixed(0)}k lines
                      </span>
                    </div>
                    <Slider
                      value={[terminalState.scrollbackLines]}
                      min={1000}
                      max={100000}
                      step={1000}
                      onValueChange={([value]) => setTerminalScrollbackLines(value)}
                      onValueCommit={() => {
                        toast.info('Scrollback changed', {
                          description: 'Restart terminal for changes to take effect',
                        });
                      }}
                    />
                  </div>

                  {/* Line Height */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">Line Height</Label>
                      <span className="text-xs text-muted-foreground">
                        {terminalState.lineHeight.toFixed(1)}
                      </span>
                    </div>
                    <Slider
                      value={[terminalState.lineHeight]}
                      min={1.0}
                      max={2.0}
                      step={0.1}
                      onValueChange={([value]) => setTerminalLineHeight(value)}
                      onValueCommit={() => {
                        toast.info('Line height changed', {
                          description: 'Restart terminal for changes to take effect',
                        });
                      }}
                    />
                  </div>

                  {/* Background Color */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">Background Color</Label>
                      {terminalState.customBackgroundColor && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={() => setTerminalBackgroundColor(null)}
                          title="Reset to theme default"
                        >
                          <RotateCcw className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-7 h-7 rounded border border-border/50 shrink-0 flex items-center justify-center"
                        style={{
                          backgroundColor: terminalState.customBackgroundColor || 'var(--card)',
                        }}
                      >
                        <Palette
                          className={cn(
                            'h-3 w-3',
                            terminalState.customBackgroundColor
                              ? 'text-white/80'
                              : 'text-muted-foreground'
                          )}
                        />
                      </div>
                      <Input
                        type="color"
                        value={terminalState.customBackgroundColor || '#000000'}
                        onChange={(e) => setTerminalBackgroundColor(e.target.value)}
                        className="w-10 h-7 p-0.5 cursor-pointer bg-transparent border-border/50 shrink-0"
                        title="Pick a background color"
                      />
                      <Input
                        type="text"
                        value={terminalState.customBackgroundColor || ''}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === '' || /^#[0-9A-Fa-f]{0,6}$/.test(value)) {
                            if (value === '' || /^#[0-9A-Fa-f]{6}$/.test(value)) {
                              setTerminalBackgroundColor(value || null);
                            }
                          }
                        }}
                        placeholder="#1a1a1a"
                        className="flex-1 h-7 text-xs font-mono"
                      />
                    </div>
                  </div>

                  {/* Foreground Color */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">Foreground Color</Label>
                      {terminalState.customForegroundColor && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={() => setTerminalForegroundColor(null)}
                          title="Reset to theme default"
                        >
                          <RotateCcw className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-7 h-7 rounded border border-border/50 shrink-0 flex items-center justify-center"
                        style={{
                          backgroundColor:
                            terminalState.customForegroundColor || 'var(--foreground)',
                        }}
                      >
                        <Type
                          className={cn(
                            'h-3 w-3',
                            terminalState.customForegroundColor
                              ? 'text-black/80'
                              : 'text-background'
                          )}
                        />
                      </div>
                      <Input
                        type="color"
                        value={terminalState.customForegroundColor || '#ffffff'}
                        onChange={(e) => setTerminalForegroundColor(e.target.value)}
                        className="w-10 h-7 p-0.5 cursor-pointer bg-transparent border-border/50 shrink-0"
                        title="Pick a foreground color"
                      />
                      <Input
                        type="text"
                        value={terminalState.customForegroundColor || ''}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === '' || /^#[0-9A-Fa-f]{0,6}$/.test(value)) {
                            if (value === '' || /^#[0-9A-Fa-f]{6}$/.test(value)) {
                              setTerminalForegroundColor(value || null);
                            }
                          }
                        }}
                        placeholder="#ffffff"
                        className="flex-1 h-7 text-xs font-mono"
                      />
                    </div>
                  </div>

                  {/* Screen Reader */}
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-xs font-medium">Screen Reader</Label>
                      <p className="text-[10px] text-muted-foreground">Enable accessibility mode</p>
                    </div>
                    <Switch
                      checked={terminalState.screenReaderMode}
                      onCheckedChange={(checked) => {
                        setTerminalScreenReaderMode(checked);
                        toast.info(checked ? 'Screen reader enabled' : 'Screen reader disabled', {
                          description: 'Restart terminal for changes to take effect',
                        });
                      }}
                    />
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Active tab content */}
        <div className="flex-1 overflow-hidden bg-background">
          {terminalState.maximizedSessionId ? (
            // When a terminal is maximized, render only that terminal
            <TerminalErrorBoundary
              key={`boundary-maximized-${terminalState.maximizedSessionId}`}
              sessionId={terminalState.maximizedSessionId}
              onRestart={() => {
                const sessionId = terminalState.maximizedSessionId!;
                toggleTerminalMaximized(sessionId);
                killTerminal(sessionId);
                createTerminal();
              }}
            >
              <TerminalPanel
                key={`maximized-${terminalState.maximizedSessionId}`}
                sessionId={terminalState.maximizedSessionId}
                authToken={terminalState.authToken}
                isActive={true}
                onFocus={() => setActiveTerminalSession(terminalState.maximizedSessionId!)}
                onClose={() => killTerminal(terminalState.maximizedSessionId!)}
                onSplitHorizontal={() => {
                  const { cwd, branchName } = getActiveSessionWorktreeInfo();
                  createTerminal('horizontal', terminalState.maximizedSessionId!, cwd, branchName);
                }}
                onSplitVertical={() => {
                  const { cwd, branchName } = getActiveSessionWorktreeInfo();
                  createTerminal('vertical', terminalState.maximizedSessionId!, cwd, branchName);
                }}
                onNewTab={createTerminalInNewTab}
                onRunCommandInNewTab={(command: string) => {
                  const { cwd, branchName: branch } = getActiveSessionWorktreeInfo();
                  createTerminalInNewTab(cwd, branch, command);
                }}
                onSessionInvalid={() => {
                  const sessionId = terminalState.maximizedSessionId!;
                  logger.info(`Maximized session ${sessionId} is invalid, removing from layout`);
                  killTerminal(sessionId);
                }}
                isDragging={false}
                isDropTarget={false}
                fontSize={findTerminalFontSize(terminalState.maximizedSessionId)}
                onFontSizeChange={(size) =>
                  setTerminalPanelFontSize(terminalState.maximizedSessionId!, size)
                }
                runCommandOnConnect={
                  newSessionIds.has(terminalState.maximizedSessionId)
                    ? sessionCommandOverrides.get(terminalState.maximizedSessionId) ||
                      defaultRunScript
                    : undefined
                }
                onCommandRan={() => handleCommandRan(terminalState.maximizedSessionId!)}
                isMaximized={true}
                onToggleMaximize={() => toggleTerminalMaximized(terminalState.maximizedSessionId!)}
              />
            </TerminalErrorBoundary>
          ) : activeTab?.layout ? (
            renderPanelContent(activeTab.layout)
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
              <p className="text-muted-foreground mb-4">This tab is empty</p>
              <Button variant="outline" size="sm" onClick={() => createTerminal()}>
                <Plus className="h-4 w-4 mr-2" />
                New Terminal
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Drag overlay */}
      <DragOverlay
        dropAnimation={{
          sideEffects: defaultDropAnimationSideEffects({
            styles: { active: { opacity: '0.5' } },
          }),
        }}
        zIndex={1000}
      >
        {activeDragId ? (
          <div className="relative inline-flex items-center gap-2 px-3.5 py-2 bg-card border-2 border-brand-500 rounded-lg shadow-xl pointer-events-none overflow-hidden">
            <TerminalIcon className="h-4 w-4 text-brand-500 shrink-0" />
            <span className="text-sm font-medium text-foreground whitespace-nowrap">
              {dragOverTabId === 'new' ? 'New tab' : dragOverTabId ? 'Move to tab' : 'Terminal'}
            </span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
