import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Terminal as TerminalIcon,
  Plus,
  Lock,
  Unlock,
  SplitSquareHorizontal,
  SplitSquareVertical,
  Loader2,
  AlertCircle,
  RefreshCw,
  X,
  SquarePlus,
  Settings,
} from 'lucide-react';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TERMINAL_FONT_OPTIONS } from '@/config/terminal-themes';
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
import { apiFetch, apiGet, apiPost, apiDeleteRaw, getAuthHeaders } from '@/lib/api-fetch';
import { getApiKey } from '@/lib/http-api-client';

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

export function TerminalView() {
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
    setTerminalTabLayout,
    toggleTerminalMaximized,
    saveTerminalLayout,
    getPersistedTerminalLayout,
    clearTerminalState,
    setTerminalDefaultFontSize,
    setTerminalDefaultRunScript,
    setTerminalFontFamily,
    setTerminalLineHeight,
    updateTerminalPanelSizes,
  } = useAppStore();

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
  const [serverSessionInfo, setServerSessionInfo] = useState<{
    current: number;
    max: number;
  } | null>(null);
  const hasShownHighRamWarningRef = useRef<boolean>(false);

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
      } else {
        node.panels.forEach(collectFromLayout);
      }
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

    console.log(`[Terminal] Killing ${sessionIds.length} sessions on server`);

    // Kill all sessions in parallel
    await Promise.allSettled(
      sessionIds.map(async (sessionId) => {
        try {
          await apiDeleteRaw(`/api/terminal/sessions/${sessionId}`, { headers });
        } catch (err) {
          console.error(`[Terminal] Failed to kill session ${sessionId}:`, err);
        }
      })
    );
  }, [collectAllSessionIds, terminalState.authToken]);
  const CREATE_COOLDOWN_MS = 500; // Prevent rapid terminal creation

  // Helper to check if terminal creation should be debounced
  const canCreateTerminal = (debounceMessage: string): boolean => {
    const now = Date.now();
    if (now - lastCreateTimeRef.current < CREATE_COOLDOWN_MS || isCreatingRef.current) {
      console.log(debounceMessage);
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
      console.error('[Terminal] Status fetch error:', err);
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
      console.error('[Terminal] Failed to fetch server settings:', err);
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
      console.log('[Terminal] No saved layout for project, starting fresh');
      return;
    }

    // Restore the saved layout - try to reconnect to existing sessions
    // Track which project we're restoring to detect stale restores
    restoringProjectPathRef.current = currentPath;

    // Create terminals and build layout - try to reconnect or create new
    const restoreLayout = async () => {
      // Check if we're still restoring the same project (user may have switched)
      if (restoringProjectPathRef.current !== currentPath) {
        console.log('[Terminal] Restore cancelled - project changed');
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
            console.error('[Terminal] Failed to create terminal session:', err);
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
            console.log('[Terminal] Restore cancelled mid-loop - project changed');
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
        console.error('[Terminal] Failed to restore terminal layout:', err);
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
      console.error('[Terminal] Auth error:', err);
    } finally {
      setAuthLoading(false);
    }
  };

  // Create a new terminal session
  // targetSessionId: the terminal to split (if splitting an existing terminal)
  const createTerminal = async (
    direction?: 'horizontal' | 'vertical',
    targetSessionId?: string
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
        body: { cwd: currentProject?.path || undefined, cols: 80, rows: 24 },
      });
      const data = await response.json();

      if (data.success) {
        addTerminalToLayout(data.data.id, direction, targetSessionId);
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
          console.error('[Terminal] Failed to create session:', data.error);
          toast.error('Failed to create terminal', {
            description: data.error || 'Unknown error',
          });
        }
      }
    } catch (err) {
      console.error('[Terminal] Create session error:', err);
      toast.error('Failed to create terminal', {
        description: 'Could not connect to server',
      });
    } finally {
      isCreatingRef.current = false;
    }
  };

  // Create terminal in new tab
  const createTerminalInNewTab = async () => {
    if (!canCreateTerminal('[Terminal] Debounced terminal tab creation')) {
      return;
    }

    const tabId = addTerminalTab();
    try {
      const headers: Record<string, string> = {};
      if (terminalState.authToken) {
        headers['X-Terminal-Token'] = terminalState.authToken;
      }

      const response = await apiFetch('/api/terminal/sessions', 'POST', {
        headers,
        body: { cwd: currentProject?.path || undefined, cols: 80, rows: 24 },
      });
      const data = await response.json();

      if (data.success) {
        // Add to the newly created tab
        const { addTerminalToTab } = useAppStore.getState();
        addTerminalToTab(data.data.id, tabId);
        // Mark this session as new for running initial command
        if (defaultRunScript) {
          setNewSessionIds((prev) => new Set(prev).add(data.data.id));
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
      console.error('[Terminal] Create session error:', err);
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

      if (!response.ok && response.status !== 404) {
        // Log non-404 errors but still proceed with UI cleanup
        const data = await response.json().catch(() => ({}));
        console.error(
          '[Terminal] Server failed to kill session:',
          data.error || response.statusText
        );
      }

      // Refresh session count
      fetchServerSettings();
    } catch (err) {
      console.error('[Terminal] Kill session error:', err);
      // Still remove from UI on network error - better UX than leaving broken terminal
      removeTerminalFromLayout(sessionId);
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
      return node.panels.flatMap(collectSessionIds);
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
          console.error(`[Terminal] Failed to kill session ${sessionId}:`, err);
        }
      })
    );

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
    return panel.panels.flatMap(getTerminalIds);
  };

  // Get a STABLE key for a panel - uses the stable id for splits
  // This prevents unnecessary remounts when layout structure changes
  const getPanelKey = (panel: TerminalPanelContent): string => {
    if (panel.type === 'terminal') {
      return panel.sessionId;
    }
    // Use the stable id for split nodes
    return panel.id;
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
          return node.panels.flatMap(getAllTerminals);
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
            onSplitHorizontal={() => createTerminal('horizontal', content.sessionId)}
            onSplitVertical={() => createTerminal('vertical', content.sessionId)}
            onNewTab={createTerminalInNewTab}
            onNavigateUp={() => navigateToTerminal('up')}
            onNavigateDown={() => navigateToTerminal('down')}
            onNavigateLeft={() => navigateToTerminal('left')}
            onNavigateRight={() => navigateToTerminal('right')}
            onSessionInvalid={() => {
              // Auto-remove stale session when server says it doesn't exist
              // This handles cases like server restart where sessions are lost
              console.log(
                `[Terminal] Session ${content.sessionId} is invalid, removing from layout`
              );
              killTerminal(content.sessionId);
            }}
            isDragging={activeDragId === content.sessionId}
            isDropTarget={activeDragId !== null && activeDragId !== content.sessionId}
            fontSize={terminalFontSize}
            onFontSizeChange={(size) => setTerminalPanelFontSize(content.sessionId, size)}
            runCommandOnConnect={isNewSession ? defaultRunScript : undefined}
            onCommandRan={() => handleCommandRan(content.sessionId)}
            isMaximized={terminalState.maximizedSessionId === content.sessionId}
            onToggleMaximize={() => toggleTerminalMaximized(content.sessionId)}
          />
        </TerminalErrorBoundary>
      );
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
        {content.panels.map((panel, index) => {
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
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
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
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
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

        <Button onClick={() => createTerminal()}>
          <Plus className="h-4 w-4 mr-2" />
          New Terminal
        </Button>

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

            {/* New tab button */}
            <button
              className="flex items-center justify-center p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
              onClick={createTerminalInNewTab}
              title="New Tab"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          {/* Toolbar buttons */}
          <div className="flex items-center gap-1 pl-2 border-l border-border">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-muted-foreground hover:text-foreground"
              onClick={() => createTerminal('horizontal')}
              title="Split Right"
            >
              <SplitSquareHorizontal className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-muted-foreground hover:text-foreground"
              onClick={() => createTerminal('vertical')}
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
              <PopoverContent className="w-80" align="end">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm">Terminal Settings</h4>
                    <p className="text-xs text-muted-foreground">
                      Configure global terminal appearance
                    </p>
                  </div>

                  {/* Default Font Size */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">Default Font Size</Label>
                      <span className="text-sm text-muted-foreground">
                        {terminalState.defaultFontSize}px
                      </span>
                    </div>
                    <Slider
                      value={[terminalState.defaultFontSize]}
                      min={8}
                      max={24}
                      step={1}
                      onValueChange={([value]) => setTerminalDefaultFontSize(value)}
                      onValueCommit={() => {
                        toast.info('Font size changed', {
                          description: 'New terminals will use this size',
                        });
                      }}
                    />
                  </div>

                  {/* Font Family */}
                  <div className="space-y-2">
                    <Label className="text-sm">Font Family</Label>
                    <select
                      value={terminalState.fontFamily}
                      onChange={(e) => {
                        setTerminalFontFamily(e.target.value);
                        toast.info('Font family changed', {
                          description: 'Restart terminal for changes to take effect',
                        });
                      }}
                      className={cn(
                        'w-full px-2 py-1.5 rounded-md text-sm',
                        'bg-accent/50 border border-border',
                        'text-foreground',
                        'focus:outline-none focus:ring-2 focus:ring-ring'
                      )}
                    >
                      {TERMINAL_FONT_OPTIONS.map((font) => (
                        <option key={font.value} value={font.value}>
                          {font.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Line Height */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">Line Height</Label>
                      <span className="text-sm text-muted-foreground">
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

                  {/* Default Run Script */}
                  <div className="space-y-2">
                    <Label className="text-sm">Default Run Script</Label>
                    <Input
                      value={terminalState.defaultRunScript}
                      onChange={(e) => setTerminalDefaultRunScript(e.target.value)}
                      placeholder="e.g., claude, npm run dev"
                      className="h-8 text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      Command to run when opening new terminals
                    </p>
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
                onSplitHorizontal={() =>
                  createTerminal('horizontal', terminalState.maximizedSessionId!)
                }
                onSplitVertical={() =>
                  createTerminal('vertical', terminalState.maximizedSessionId!)
                }
                onNewTab={createTerminalInNewTab}
                onSessionInvalid={() => {
                  const sessionId = terminalState.maximizedSessionId!;
                  console.log(
                    `[Terminal] Maximized session ${sessionId} is invalid, removing from layout`
                  );
                  killTerminal(sessionId);
                }}
                isDragging={false}
                isDropTarget={false}
                fontSize={findTerminalFontSize(terminalState.maximizedSessionId)}
                onFontSizeChange={(size) =>
                  setTerminalPanelFontSize(terminalState.maximizedSessionId!, size)
                }
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
