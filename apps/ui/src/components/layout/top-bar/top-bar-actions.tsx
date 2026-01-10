import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from '@tanstack/react-router';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import type { Project } from '@/lib/electron';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Settings,
  Bot,
  Bell,
  Wand2,
  GitBranch,
  Search,
  X,
  ImageIcon,
  Archive,
  Minimize2,
  Square,
  Maximize2,
  Columns3,
  Network,
} from 'lucide-react';
import { SettingsDialog } from '@/components/dialogs/settings-dialog';
interface TopBarActionsProps {
  currentProject: Project | null;
}

export function TopBarActions({ currentProject }: TopBarActionsProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    getAutoModeState,
    setAutoModeRunning,
    maxConcurrency,
    setMaxConcurrency,
    worktreePanelCollapsed,
    setWorktreePanelCollapsed,
    boardSearchQuery,
    setBoardSearchQuery,
    kanbanCardDetailLevel,
    setKanbanCardDetailLevel,
    boardViewMode,
    setBoardViewMode,
  } = useAppStore();

  const [showAgentSettings, setShowAgentSettings] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const autoModeState = currentProject ? getAutoModeState(currentProject.id) : null;
  const isAutoModeRunning = autoModeState?.isRunning ?? false;
  const runningAgentsCount = autoModeState?.runningTasks?.length ?? 0;

  const isOnBoardView = location.pathname === '/board';

  // Focus search input when "/" is pressed (only on board view)
  useEffect(() => {
    if (!isOnBoardView) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOnBoardView]);

  const handlePlan = useCallback(() => {
    if (isOnBoardView) {
      // Dispatch custom event for board-view to handle
      window.dispatchEvent(new CustomEvent('automaker:open-plan-dialog'));
    } else {
      // Navigate to board first, then open plan dialog
      navigate({ to: '/board' });
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('automaker:open-plan-dialog'));
      }, 100);
    }
  }, [isOnBoardView, navigate]);

  const handleAutoModeToggle = useCallback(
    (enabled: boolean) => {
      if (currentProject) {
        setAutoModeRunning(currentProject.id, enabled);
      }
    },
    [currentProject, setAutoModeRunning]
  );

  const handleSettings = useCallback(() => {
    setShowSettingsDialog(true);
  }, []);

  const handleNotifications = useCallback(() => {
    // TODO: Open notifications panel
  }, []);

  const handleShowBoardBackground = useCallback(() => {
    window.dispatchEvent(new CustomEvent('automaker:open-board-background'));
  }, []);

  const handleShowCompletedFeatures = useCallback(() => {
    window.dispatchEvent(new CustomEvent('automaker:open-completed-features'));
  }, []);

  return (
    <TooltipProvider>
      <div className="flex items-center gap-1">
        {currentProject && (
          <>
            {/* Worktree Panel Toggle */}
            {isOnBoardView && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={worktreePanelCollapsed ? 'ghost' : 'secondary'}
                    size="sm"
                    onClick={() => setWorktreePanelCollapsed(!worktreePanelCollapsed)}
                    className="gap-2"
                  >
                    <GitBranch className="h-4 w-4" />
                    <span>Worktrees</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {worktreePanelCollapsed ? 'Show worktree panel' : 'Hide worktree panel'}
                </TooltipContent>
              </Tooltip>
            )}

            {/* Board Controls - only show on board view */}
            {isOnBoardView && (
              <>
                <div className="h-6 w-px bg-border/60 mx-1" />

                {/* Search Bar */}
                <div className="relative w-48">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Search..."
                    value={boardSearchQuery}
                    onChange={(e) => setBoardSearchQuery(e.target.value)}
                    className="h-8 pl-8 pr-8 text-sm border-border"
                    data-testid="topbar-search-input"
                  />
                  {boardSearchQuery ? (
                    <button
                      onClick={() => setBoardSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-sm hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                      aria-label="Clear search"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 px-1 py-0.5 text-[9px] font-mono rounded bg-brand-500/10 border border-brand-500/30 text-brand-400/70">
                      /
                    </span>
                  )}
                </div>

                {/* View Mode Toggle */}
                <div className="flex items-center rounded-md bg-secondary border border-border ml-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setBoardViewMode('kanban')}
                        className={cn(
                          'p-1.5 rounded-l-md transition-colors',
                          boardViewMode === 'kanban'
                            ? 'bg-brand-500/20 text-brand-500'
                            : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                        )}
                      >
                        <Columns3 className="w-3.5 h-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Kanban Board View</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setBoardViewMode('graph')}
                        className={cn(
                          'p-1.5 rounded-r-md transition-colors',
                          boardViewMode === 'graph'
                            ? 'bg-brand-500/20 text-brand-500'
                            : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                        )}
                      >
                        <Network className="w-3.5 h-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Dependency Graph View</TooltipContent>
                  </Tooltip>
                </div>

                {/* Board Background */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleShowBoardBackground}
                      className="h-8 w-8 p-0"
                    >
                      <ImageIcon className="w-3.5 h-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Board Background</TooltipContent>
                </Tooltip>

                {/* Completed Features */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleShowCompletedFeatures}
                      className="h-8 w-8 p-0 relative"
                    >
                      <Archive className="w-3.5 h-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Completed Features</TooltipContent>
                </Tooltip>

                {/* Detail Level Toggle */}
                <div className="flex items-center rounded-md bg-secondary border border-border">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setKanbanCardDetailLevel('minimal')}
                        className={cn(
                          'p-1.5 rounded-l-md transition-colors',
                          kanbanCardDetailLevel === 'minimal'
                            ? 'bg-brand-500/20 text-brand-500'
                            : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                        )}
                      >
                        <Minimize2 className="w-3.5 h-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Minimal</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setKanbanCardDetailLevel('standard')}
                        className={cn(
                          'p-1.5 transition-colors',
                          kanbanCardDetailLevel === 'standard'
                            ? 'bg-brand-500/20 text-brand-500'
                            : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                        )}
                      >
                        <Square className="w-3.5 h-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Standard</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setKanbanCardDetailLevel('detailed')}
                        className={cn(
                          'p-1.5 rounded-r-md transition-colors',
                          kanbanCardDetailLevel === 'detailed'
                            ? 'bg-brand-500/20 text-brand-500'
                            : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                        )}
                      >
                        <Maximize2 className="w-3.5 h-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Detailed</TooltipContent>
                  </Tooltip>
                </div>
              </>
            )}

            <div className="h-6 w-px bg-border/60 mx-1" />

            {/* Agents Control */}
            <Popover open={showAgentSettings} onOpenChange={setShowAgentSettings}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn('gap-2 px-3', runningAgentsCount > 0 && 'text-green-500')}
                >
                  <Bot className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    {runningAgentsCount}/{maxConcurrency}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64" align="end">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Max Agents</span>
                    <span className="text-sm text-muted-foreground">{maxConcurrency}</span>
                  </div>
                  <Slider
                    value={[maxConcurrency]}
                    onValueChange={(value) => setMaxConcurrency(value[0])}
                    min={1}
                    max={10}
                    step={1}
                  />
                  <p className="text-xs text-muted-foreground">
                    Maximum concurrent agents when auto mode is running
                  </p>
                </div>
              </PopoverContent>
            </Popover>

            {/* Auto Mode Toggle */}
            <div
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-md',
                'transition-colors',
                isAutoModeRunning ? 'bg-green-500/20 text-green-500' : 'hover:bg-accent/50'
              )}
            >
              <span className="text-sm font-medium">Auto</span>
              <Switch
                checked={isAutoModeRunning}
                onCheckedChange={handleAutoModeToggle}
                className="data-[state=checked]:bg-green-500"
              />
            </div>

            <div className="h-6 w-px bg-border/60 mx-1" />

            {/* Plan Button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={handlePlan} className="gap-2">
                  <Wand2 className="h-4 w-4" />
                  <span>Plan</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Plan features with AI</TooltipContent>
            </Tooltip>
          </>
        )}

        {/* Notifications */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={handleNotifications} className="relative">
              <Bell className="h-4 w-4" />
              {/* Notification badge - show when there are unread notifications */}
              {/* <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-[10px] text-white flex items-center justify-center">3</span> */}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Notifications</TooltipContent>
        </Tooltip>

        {/* Settings */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={handleSettings}>
              <Settings className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Settings</TooltipContent>
        </Tooltip>

        {/* Settings Dialog */}
        <SettingsDialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog} />
      </div>
    </TooltipProvider>
  );
}
