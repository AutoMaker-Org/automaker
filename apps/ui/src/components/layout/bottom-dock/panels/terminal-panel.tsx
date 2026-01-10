import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Terminal,
  Plus,
  Loader2,
  AlertCircle,
  SplitSquareHorizontal,
  SplitSquareVertical,
  X,
} from 'lucide-react';
import { useAppStore, type TerminalPanelContent, type TerminalTab } from '@/store/app-store';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { TerminalPanel as XTermPanel } from '@/components/views/terminal-view/terminal-panel';
import { TerminalErrorBoundary } from '@/components/views/terminal-view/terminal-error-boundary';
import { apiFetch, apiGet, apiDeleteRaw } from '@/lib/api-fetch';
import { createLogger } from '@automaker/utils/logger';
import { toast } from 'sonner';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';

const logger = createLogger('DockTerminal');

interface TerminalStatus {
  enabled: boolean;
  passwordRequired: boolean;
}

const CREATE_COOLDOWN_MS = 500;

export function TerminalPanelDock() {
  // Use useShallow for terminal state to prevent unnecessary re-renders
  const terminalState = useAppStore(useShallow((state) => state.terminalState));

  const {
    tabs,
    activeTabId,
    activeSessionId,
    authToken,
    isUnlocked,
    defaultFontSize,
    maximizedSessionId,
  } = terminalState;

  // Get stable action references (these don't change between renders)
  const currentProject = useAppStore((state) => state.currentProject);
  const setTerminalUnlocked = useAppStore((state) => state.setTerminalUnlocked);
  const addTerminalToLayout = useAppStore((state) => state.addTerminalToLayout);
  const removeTerminalFromLayout = useAppStore((state) => state.removeTerminalFromLayout);
  const setActiveTerminalSession = useAppStore((state) => state.setActiveTerminalSession);
  const addTerminalTab = useAppStore((state) => state.addTerminalTab);
  const removeTerminalTab = useAppStore((state) => state.removeTerminalTab);
  const setActiveTerminalTab = useAppStore((state) => state.setActiveTerminalTab);
  const setTerminalPanelFontSize = useAppStore((state) => state.setTerminalPanelFontSize);
  const toggleTerminalMaximized = useAppStore((state) => state.toggleTerminalMaximized);
  const updateTerminalPanelSizes = useAppStore((state) => state.updateTerminalPanelSizes);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<TerminalStatus | null>(null);
  const isCreatingRef = useRef(false);
  const lastCreateTimeRef = useRef(0);

  // Refs to stabilize callbacks and prevent cascading re-renders
  const createTerminalRef = useRef<
    ((direction?: 'horizontal' | 'vertical', targetSessionId?: string) => Promise<void>) | null
  >(null);
  const killTerminalRef = useRef<((sessionId: string) => Promise<void>) | null>(null);
  const createTerminalInNewTabRef = useRef<(() => Promise<void>) | null>(null);
  const navigateToTerminalRef = useRef<
    ((direction: 'up' | 'down' | 'left' | 'right') => void) | null
  >(null);

  // Fetch terminal status
  const fetchStatus = useCallback(async () => {
    try {
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

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Helper to check if terminal creation should be debounced
  const canCreateTerminal = (): boolean => {
    const now = Date.now();
    if (now - lastCreateTimeRef.current < CREATE_COOLDOWN_MS || isCreatingRef.current) {
      return false;
    }
    lastCreateTimeRef.current = now;
    isCreatingRef.current = true;
    return true;
  };

  // Create a new terminal session
  const createTerminal = useCallback(
    async (direction?: 'horizontal' | 'vertical', targetSessionId?: string) => {
      if (!canCreateTerminal()) return;

      try {
        const headers: Record<string, string> = {};
        if (authToken) {
          headers['X-Terminal-Token'] = authToken;
        }

        const response = await apiFetch('/api/terminal/sessions', 'POST', {
          headers,
          body: { cwd: currentProject?.path || undefined, cols: 80, rows: 24 },
        });
        const data = await response.json();

        if (data.success) {
          addTerminalToLayout(data.data.id, direction, targetSessionId);
        } else {
          if (response.status === 429 || data.error?.includes('Maximum')) {
            toast.error('Terminal session limit reached', {
              description: data.details || 'Please close unused terminals.',
            });
          } else {
            toast.error('Failed to create terminal', { description: data.error });
          }
        }
      } catch (err) {
        logger.error('Create session error:', err);
        toast.error('Failed to create terminal');
      } finally {
        isCreatingRef.current = false;
      }
    },
    [currentProject?.path, authToken, addTerminalToLayout]
  );

  // Create terminal in new tab
  const createTerminalInNewTab = useCallback(async () => {
    if (!canCreateTerminal()) return;

    const tabId = addTerminalTab();
    try {
      const headers: Record<string, string> = {};
      if (authToken) {
        headers['X-Terminal-Token'] = authToken;
      }

      const response = await apiFetch('/api/terminal/sessions', 'POST', {
        headers,
        body: { cwd: currentProject?.path || undefined, cols: 80, rows: 24 },
      });
      const data = await response.json();

      if (data.success) {
        const { addTerminalToTab } = useAppStore.getState();
        addTerminalToTab(data.data.id, tabId);
      } else {
        removeTerminalTab(tabId);
        toast.error('Failed to create terminal', { description: data.error });
      }
    } catch (err) {
      logger.error('Create session error:', err);
      removeTerminalTab(tabId);
      toast.error('Failed to create terminal');
    } finally {
      isCreatingRef.current = false;
    }
  }, [currentProject?.path, authToken, addTerminalTab, removeTerminalTab]);

  // Kill a terminal session
  const killTerminal = useCallback(
    async (sessionId: string) => {
      try {
        const headers: Record<string, string> = {};
        if (authToken) {
          headers['X-Terminal-Token'] = authToken;
        }

        await apiDeleteRaw(`/api/terminal/sessions/${sessionId}`, { headers });
        removeTerminalFromLayout(sessionId);
      } catch (err) {
        logger.error('Kill session error:', err);
        removeTerminalFromLayout(sessionId);
      }
    },
    [authToken, removeTerminalFromLayout]
  );

  // Kill all terminals in a tab
  const killTerminalTab = useCallback(
    async (tabId: string) => {
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab) return;

      const collectSessionIds = (node: TerminalPanelContent | null): string[] => {
        if (!node) return [];
        if (node.type === 'terminal') return [node.sessionId];
        return node.panels.flatMap(collectSessionIds);
      };

      const sessionIds = collectSessionIds(tab.layout);
      const headers: Record<string, string> = {};
      if (authToken) {
        headers['X-Terminal-Token'] = authToken;
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

      removeTerminalTab(tabId);
    },
    [tabs, authToken, removeTerminalTab]
  );

  // Get panel key for stable rendering
  const getPanelKey = (panel: TerminalPanelContent): string => {
    if (panel.type === 'terminal') return panel.sessionId;
    return panel.id;
  };

  // Navigate between terminals
  const navigateToTerminal = useCallback(
    (direction: 'up' | 'down' | 'left' | 'right') => {
      const activeTab = tabs.find((t) => t.id === activeTabId);
      if (!activeTab?.layout) return;

      const currentSessionId = activeSessionId;
      if (!currentSessionId) return;

      const getTerminalIds = (panel: TerminalPanelContent): string[] => {
        if (panel.type === 'terminal') return [panel.sessionId];
        return panel.panels.flatMap(getTerminalIds);
      };

      const terminalIds = getTerminalIds(activeTab.layout);
      const currentIndex = terminalIds.indexOf(currentSessionId);
      if (currentIndex === -1) return;

      let nextIndex = currentIndex;
      if (direction === 'right' || direction === 'down') {
        nextIndex = (currentIndex + 1) % terminalIds.length;
      } else {
        nextIndex = (currentIndex - 1 + terminalIds.length) % terminalIds.length;
      }

      if (terminalIds[nextIndex]) {
        setActiveTerminalSession(terminalIds[nextIndex]);
      }
    },
    [tabs, activeTabId, activeSessionId, setActiveTerminalSession]
  );

  // Keep refs updated with latest callbacks
  createTerminalRef.current = createTerminal;
  killTerminalRef.current = killTerminal;
  createTerminalInNewTabRef.current = createTerminalInNewTab;
  navigateToTerminalRef.current = navigateToTerminal;

  // Render panel content recursively - use refs for callbacks to prevent re-renders
  const renderPanelContent = useCallback(
    (content: TerminalPanelContent, activeTabData: TerminalTab): React.ReactNode => {
      if (content.type === 'terminal') {
        const terminalFontSize = content.fontSize ?? defaultFontSize;
        return (
          <TerminalErrorBoundary
            key={`boundary-${content.sessionId}`}
            sessionId={content.sessionId}
            onRestart={() => {
              killTerminalRef.current?.(content.sessionId);
              createTerminalRef.current?.();
            }}
          >
            <XTermPanel
              key={content.sessionId}
              sessionId={content.sessionId}
              authToken={authToken}
              isActive={activeSessionId === content.sessionId}
              onFocus={() => setActiveTerminalSession(content.sessionId)}
              onClose={() => killTerminalRef.current?.(content.sessionId)}
              onSplitHorizontal={() => createTerminalRef.current?.('horizontal', content.sessionId)}
              onSplitVertical={() => createTerminalRef.current?.('vertical', content.sessionId)}
              onNewTab={() => createTerminalInNewTabRef.current?.()}
              onNavigateUp={() => navigateToTerminalRef.current?.('up')}
              onNavigateDown={() => navigateToTerminalRef.current?.('down')}
              onNavigateLeft={() => navigateToTerminalRef.current?.('left')}
              onNavigateRight={() => navigateToTerminalRef.current?.('right')}
              onSessionInvalid={() => killTerminalRef.current?.(content.sessionId)}
              fontSize={terminalFontSize}
              onFontSizeChange={(size) => setTerminalPanelFontSize(content.sessionId, size)}
              isMaximized={maximizedSessionId === content.sessionId}
              onToggleMaximize={() => toggleTerminalMaximized(content.sessionId)}
            />
          </TerminalErrorBoundary>
        );
      }

      const isHorizontal = content.direction === 'horizontal';
      const defaultSizePerPanel = 100 / content.panels.length;

      const handleLayoutChange = (sizes: number[]) => {
        const panelKeys = content.panels.map(getPanelKey);
        updateTerminalPanelSizes(activeTabData.id, panelKeys, sizes);
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
                    className={
                      isHorizontal
                        ? 'w-1 h-full bg-border hover:bg-brand-500 transition-colors'
                        : 'h-1 w-full bg-border hover:bg-brand-500 transition-colors'
                    }
                  />
                )}
                <Panel id={panelKey} order={index} defaultSize={panelSize} minSize={20}>
                  {renderPanelContent(panel, activeTabData)}
                </Panel>
              </React.Fragment>
            );
          })}
        </PanelGroup>
      );
    },
    [
      defaultFontSize,
      authToken,
      activeSessionId,
      maximizedSessionId,
      setActiveTerminalSession,
      setTerminalPanelFontSize,
      toggleTerminalMaximized,
      updateTerminalPanelSizes,
    ]
  );

  const activeTab = tabs.find((t) => t.id === activeTabId);

  // Header component for all states
  const Header = ({ children }: { children?: React.ReactNode }) => (
    <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 shrink-0">
      <div className="flex items-center gap-2">
        <Terminal className="h-3.5 w-3.5" />
        <span className="text-xs font-medium">Terminal</span>
      </div>
      {children && <div className="flex items-center gap-1">{children}</div>}
    </div>
  );

  // Loading state
  if (loading) {
    return (
      <div className="h-full flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="h-full flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <AlertCircle className="h-8 w-8 mx-auto text-destructive/50 mb-2" />
            <p className="text-xs text-muted-foreground mb-2">{error}</p>
            <Button variant="outline" size="sm" className="text-xs h-7" onClick={fetchStatus}>
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Password required
  if (status?.passwordRequired && !isUnlocked) {
    return (
      <div className="h-full flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Terminal className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground mb-1">Terminal requires authentication</p>
            <p className="text-xs text-muted-foreground/70">Password required to use terminal</p>
          </div>
        </div>
      </div>
    );
  }

  // No project selected
  if (!currentProject) {
    return (
      <div className="h-full flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Terminal className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No project selected</p>
          </div>
        </div>
      </div>
    );
  }

  // No terminals yet
  if (tabs.length === 0) {
    return (
      <div className="h-full flex flex-col">
        <Header>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => createTerminal()}
            title="New terminal"
          >
            <Plus className="h-3 w-3" />
          </Button>
        </Header>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Terminal className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground mb-1">No terminals open</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => createTerminal()}>
              <Plus className="h-3 w-3 mr-1" />
              New Terminal
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Terminal view with tabs
  return (
    <div className="h-full flex flex-col">
      {/* Tab bar */}
      <div className="flex items-center px-2 py-1 border-b border-border/50 shrink-0 gap-1 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTerminalTab(tab.id)}
            className={cn(
              'flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors shrink-0',
              tab.id === activeTabId
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
            )}
          >
            <Terminal className="h-3 w-3" />
            <span className="max-w-16 truncate">{tab.name}</span>
            <button
              className="ml-0.5 p-0.5 rounded hover:bg-background/50 text-muted-foreground hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                killTerminalTab(tab.id);
              }}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </button>
        ))}

        <button
          className="flex items-center justify-center p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground shrink-0"
          onClick={createTerminalInNewTab}
          title="New Tab"
        >
          <Plus className="h-3 w-3" />
        </button>

        <div className="flex-1" />

        <div className="flex items-center gap-0.5 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => createTerminal('horizontal')}
            title="Split Right"
          >
            <SplitSquareHorizontal className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => createTerminal('vertical')}
            title="Split Down"
          >
            <SplitSquareVertical className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Terminal content */}
      <div className="flex-1 overflow-hidden">
        {activeTab?.layout ? (
          renderPanelContent(activeTab.layout, activeTab)
        ) : (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <Terminal className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-xs text-muted-foreground">No terminal in this tab</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2 text-xs h-7"
                onClick={() => createTerminal()}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add Terminal
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
