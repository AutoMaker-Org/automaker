import { useState, useCallback, useSyncExternalStore } from 'react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import { Button } from '@/components/ui/button';
import {
  Terminal,
  Bot,
  FileText,
  FolderOpen,
  Github,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  MessageSquare,
  Sparkles,
  PanelBottom,
  PanelRight,
  PanelLeft,
} from 'lucide-react';
import {
  GitHubPanel,
  AgentsPanel,
  SpecPanel,
  ContextPanel,
  TerminalPanelDock,
  ChatPanel,
  IdeationPanel,
} from './panels';

type DockTab = 'terminal' | 'agents' | 'spec' | 'context' | 'github' | 'chat' | 'ideation';
export type DockPosition = 'bottom' | 'right' | 'left';

const DOCK_POSITION_STORAGE_KEY = 'automaker:dock-position';

// Event emitter for dock position changes
const positionListeners = new Set<() => void>();

function emitPositionChange() {
  positionListeners.forEach((listener) => listener());
}

// Cached position to avoid creating new objects on every read
let cachedPosition: DockPosition = 'bottom';

// Initialize from localStorage
try {
  const stored = localStorage.getItem(DOCK_POSITION_STORAGE_KEY) as DockPosition | null;
  if (stored && ['bottom', 'right', 'left'].includes(stored)) {
    cachedPosition = stored;
  }
} catch {
  // Ignore localStorage errors
}

function getPosition(): DockPosition {
  return cachedPosition;
}

function updatePosition(position: DockPosition) {
  if (cachedPosition !== position) {
    cachedPosition = position;
    try {
      localStorage.setItem(DOCK_POSITION_STORAGE_KEY, position);
    } catch {
      // Ignore localStorage errors
    }
    emitPositionChange();
  }
}

// Hook for external components to read dock position
export function useDockState(): { position: DockPosition } {
  const position = useSyncExternalStore(
    (callback) => {
      positionListeners.add(callback);
      return () => positionListeners.delete(callback);
    },
    getPosition,
    getPosition
  );
  return { position };
}

interface BottomDockProps {
  className?: string;
}

export function BottomDock({ className }: BottomDockProps) {
  const { currentProject, getAutoModeState } = useAppStore();

  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<DockTab | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);

  // Use external store for position - single source of truth
  const position = useSyncExternalStore(
    (callback) => {
      positionListeners.add(callback);
      return () => positionListeners.delete(callback);
    },
    getPosition,
    getPosition
  );

  const autoModeState = currentProject ? getAutoModeState(currentProject.id) : null;
  const runningAgentsCount = autoModeState?.runningTasks?.length ?? 0;

  const handleTabClick = useCallback(
    (tab: DockTab) => {
      if (activeTab === tab) {
        setIsExpanded(!isExpanded);
      } else {
        setActiveTab(tab);
        setIsExpanded(true);
      }
    },
    [activeTab, isExpanded]
  );

  const handleDoubleClick = useCallback(() => {
    if (isExpanded) {
      setIsMaximized(!isMaximized);
    } else {
      setIsExpanded(true);
      if (!activeTab) {
        setActiveTab('terminal');
      }
    }
  }, [isExpanded, isMaximized, activeTab]);

  // All tabs combined for easier rendering
  const allTabs = [
    {
      id: 'terminal' as DockTab,
      label: 'Terminal',
      icon: Terminal,
      badge: null,
      badgeColor: undefined,
      group: 'operations',
    },
    {
      id: 'chat' as DockTab,
      label: 'Chat',
      icon: MessageSquare,
      badge: null,
      badgeColor: undefined,
      group: 'operations',
    },
    {
      id: 'ideation' as DockTab,
      label: 'Ideate',
      icon: Sparkles,
      badge: null,
      badgeColor: undefined,
      group: 'planning',
    },
    {
      id: 'spec' as DockTab,
      label: 'Spec',
      icon: FileText,
      badge: null,
      badgeColor: undefined,
      group: 'planning',
    },
    {
      id: 'context' as DockTab,
      label: 'Context',
      icon: FolderOpen,
      badge: null,
      badgeColor: undefined,
      group: 'planning',
    },
    {
      id: 'github' as DockTab,
      label: 'GitHub',
      icon: Github,
      badge: null,
      badgeColor: undefined,
      group: 'planning',
    },
    {
      id: 'agents' as DockTab,
      label: 'Agents',
      icon: Bot,
      badge: runningAgentsCount > 0 ? runningAgentsCount : null,
      badgeColor: 'bg-green-500',
      group: 'agents',
    },
  ];

  const isRightDock = position === 'right';
  const isLeftDock = position === 'left';
  const isSideDock = isRightDock || isLeftDock;

  // Render panel content directly to avoid remounting on state changes
  const renderPanelContent = () => (
    <>
      {activeTab === 'terminal' && <TerminalPanelDock />}
      {activeTab === 'agents' && <AgentsPanel />}
      {activeTab === 'spec' && <SpecPanel />}
      {activeTab === 'context' && <ContextPanel />}
      {activeTab === 'github' && <GitHubPanel />}
      {activeTab === 'chat' && <ChatPanel />}
      {activeTab === 'ideation' && <IdeationPanel />}
    </>
  );

  // Side dock layout (left or right)
  if (isSideDock) {
    const dockWidth = isMaximized ? 'w-[50vw]' : isExpanded ? 'w-96' : 'w-10';

    return (
      <div
        className={cn(
          'bg-background/95 backdrop-blur-sm',
          'transition-all duration-300 ease-in-out flex',
          'fixed top-12 bottom-0 z-30',
          isLeftDock ? 'left-0 border-r border-border' : 'right-0 border-l border-border',
          dockWidth,
          className
        )}
      >
        {/* Vertical Tab Bar */}
        <div
          className={cn(
            'flex flex-col w-10 py-2 cursor-pointer select-none shrink-0',
            isLeftDock ? 'border-r border-border/50' : 'border-r border-border/50'
          )}
          onDoubleClick={handleDoubleClick}
        >
          {/* Tab Icons */}
          <div className="flex flex-col items-center gap-1">
            {allTabs.map((tab, index) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id && isExpanded;
              const showDivider = (index === 1 || index === 5) && index < allTabs.length - 1;

              return (
                <div key={tab.id}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTabClick(tab.id);
                    }}
                    onDoubleClick={(e) => e.stopPropagation()}
                    className={cn(
                      'relative flex items-center justify-center w-7 h-7 rounded-md',
                      'transition-colors',
                      isActive
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                    )}
                    title={tab.label}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.badge && (
                      <span
                        className={cn(
                          'absolute -top-1 -right-1 flex items-center justify-center h-3.5 min-w-3.5 px-0.5 rounded-full text-[9px] text-white',
                          tab.badgeColor || 'bg-primary'
                        )}
                      >
                        {tab.badge}
                      </span>
                    )}
                  </button>
                  {showDivider && <div className="w-5 h-px bg-border my-1 mx-auto" />}
                </div>
              );
            })}
          </div>

          <div className="flex-1" />

          {/* Dock Controls */}
          <div className="flex flex-col items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {/* Position buttons - show other positions (not current) */}
            {position !== 'left' && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => updatePosition('left')}
                title="Dock to left"
              >
                <PanelLeft className="h-3.5 w-3.5" />
              </Button>
            )}
            {position !== 'bottom' && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => updatePosition('bottom')}
                title="Dock to bottom"
              >
                <PanelBottom className="h-3.5 w-3.5" />
              </Button>
            )}
            {position !== 'right' && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => updatePosition('right')}
                title="Dock to right"
              >
                <PanelRight className="h-3.5 w-3.5" />
              </Button>
            )}

            {isExpanded && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setIsMaximized(!isMaximized)}
                title={isMaximized ? 'Restore' : 'Maximize'}
              >
                {isMaximized ? (
                  <Minimize2 className="h-3.5 w-3.5" />
                ) : (
                  <Maximize2 className="h-3.5 w-3.5" />
                )}
              </Button>
            )}

            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => {
                if (isExpanded) {
                  setIsMaximized(false);
                }
                setIsExpanded(!isExpanded);
              }}
              title={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? (
                isLeftDock ? (
                  <ChevronLeft className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )
              ) : isLeftDock ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Panel Content */}
        {isExpanded && <div className="flex-1 h-full overflow-hidden">{renderPanelContent()}</div>}
      </div>
    );
  }

  // Bottom dock layout - uses fixed positioning like side docks
  const dockHeight = isMaximized ? 'h-[70vh]' : isExpanded ? 'h-72' : 'h-10';

  // Group tabs for bottom layout
  const operationsTabs = allTabs.filter((t) => t.group === 'operations');
  const planningTabs = allTabs.filter((t) => t.group === 'planning');
  const agentTab = allTabs.find((t) => t.group === 'agents')!;

  return (
    <div
      className={cn(
        'fixed left-0 right-0 bottom-0 border-t border-border bg-background/95 backdrop-blur-sm z-30',
        'transition-all duration-300 ease-in-out flex flex-col',
        dockHeight,
        className
      )}
    >
      {/* Tab Bar - double click to expand/maximize */}
      <div
        className="flex items-center h-10 px-2 border-b border-border/50 cursor-pointer select-none shrink-0"
        onDoubleClick={handleDoubleClick}
      >
        <div className="flex items-center gap-1">
          {/* Operations tabs */}
          {operationsTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id && isExpanded;

            return (
              <button
                key={tab.id}
                onClick={(e) => {
                  e.stopPropagation();
                  handleTabClick(tab.id);
                }}
                onDoubleClick={(e) => e.stopPropagation()}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm',
                  'transition-colors',
                  isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.label}</span>
                {tab.badge && (
                  <span
                    className={cn(
                      'flex items-center justify-center h-4 min-w-4 px-1 rounded-full text-[10px] text-white',
                      tab.badgeColor || 'bg-primary'
                    )}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}

          {/* Divider */}
          <div className="h-5 w-px bg-border mx-1" />

          {/* Planning tabs */}
          {planningTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id && isExpanded;

            return (
              <button
                key={tab.id}
                onClick={(e) => {
                  e.stopPropagation();
                  handleTabClick(tab.id);
                }}
                onDoubleClick={(e) => e.stopPropagation()}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm',
                  'transition-colors',
                  isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.label}</span>
                {tab.badge && (
                  <span
                    className={cn(
                      'flex items-center justify-center h-4 min-w-4 px-1 rounded-full text-[10px] text-white',
                      tab.badgeColor || 'bg-primary'
                    )}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}

          {/* Divider */}
          <div className="h-5 w-px bg-border mx-1" />

          {/* Agents tab (separate section) */}
          {(() => {
            const Icon = agentTab.icon;
            const isActive = activeTab === agentTab.id && isExpanded;

            return (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleTabClick(agentTab.id);
                }}
                onDoubleClick={(e) => e.stopPropagation()}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm',
                  'transition-colors',
                  isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{agentTab.label}</span>
                {agentTab.badge && (
                  <span
                    className={cn(
                      'flex items-center justify-center h-4 min-w-4 px-1 rounded-full text-[10px] text-white',
                      agentTab.badgeColor || 'bg-primary'
                    )}
                  >
                    {agentTab.badge}
                  </span>
                )}
              </button>
            );
          })()}
        </div>

        <div className="flex-1" />

        {/* Dock Controls */}
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {/* Position buttons - show other positions (not current) */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => updatePosition('left')}
            title="Dock to left"
          >
            <PanelLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => updatePosition('right')}
            title="Dock to right"
          >
            <PanelRight className="h-3.5 w-3.5" />
          </Button>

          {isExpanded && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setIsMaximized(!isMaximized)}
              title={isMaximized ? 'Restore' : 'Maximize'}
            >
              {isMaximized ? (
                <Minimize2 className="h-3.5 w-3.5" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" />
              )}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => {
              if (isExpanded) {
                setIsMaximized(false);
              }
              setIsExpanded(!isExpanded);
            }}
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Panel Content */}
      {isExpanded && <div className="flex-1 overflow-hidden min-h-0">{renderPanelContent()}</div>}
    </div>
  );
}
