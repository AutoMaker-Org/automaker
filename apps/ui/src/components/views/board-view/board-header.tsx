import { useCallback, useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Wand2, GitBranch, ClipboardCheck } from 'lucide-react';
import { UsagePopover } from '@/components/usage-popover';
import { useAppStore } from '@/store/app-store';
import { useSetupStore } from '@/store/setup-store';
import { useIsTablet } from '@/hooks/use-media-query';
import { AutoModeSettingsPopover } from './dialogs/auto-mode-settings-popover';
import { WorktreeSettingsPopover } from './dialogs/worktree-settings-popover';
import { PlanSettingsPopover } from './dialogs/plan-settings-popover';
import { getHttpApiClient } from '@/lib/http-api-client';
import { BoardSearchBar } from './board-search-bar';
import { BoardControls } from './board-controls';
import { ViewToggle, type ViewMode } from './components';
import { HeaderMobileMenu } from './header-mobile-menu';

export type { ViewMode };

interface BoardHeaderProps {
  projectPath: string;
  maxConcurrency: number;
  runningAgentsCount: number;
  onConcurrencyChange: (value: number) => void;
  isAutoModeRunning: boolean;
  onAutoModeToggle: (enabled: boolean) => void;
  onOpenPlanDialog: () => void;
  hasPendingPlan?: boolean;
  onOpenPendingPlan?: () => void;
  isMounted: boolean;
  // Search bar props
  searchQuery: string;
  onSearchChange: (query: string) => void;
  isCreatingSpec: boolean;
  creatingSpecProjectPath?: string;
  // Board controls props
  onShowBoardBackground: () => void;
  // View toggle props
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

// Shared styles for header control containers
const controlContainerClass =
  'flex items-center gap-1.5 px-3 h-8 rounded-md bg-secondary border border-border';

export function BoardHeader({
  projectPath,
  maxConcurrency,
  runningAgentsCount,
  onConcurrencyChange,
  isAutoModeRunning,
  onAutoModeToggle,
  onOpenPlanDialog,
  hasPendingPlan,
  onOpenPendingPlan,
  isMounted,
  searchQuery,
  onSearchChange,
  isCreatingSpec,
  creatingSpecProjectPath,
  onShowBoardBackground,
  viewMode,
  onViewModeChange,
}: BoardHeaderProps) {
  const claudeAuthStatus = useSetupStore((state) => state.claudeAuthStatus);
  const skipVerificationInAutoMode = useAppStore((state) => state.skipVerificationInAutoMode);
  const setSkipVerificationInAutoMode = useAppStore((state) => state.setSkipVerificationInAutoMode);
  const planUseSelectedWorktreeBranch = useAppStore((state) => state.planUseSelectedWorktreeBranch);
  const setPlanUseSelectedWorktreeBranch = useAppStore(
    (state) => state.setPlanUseSelectedWorktreeBranch
  );
  const addFeatureUseSelectedWorktreeBranch = useAppStore(
    (state) => state.addFeatureUseSelectedWorktreeBranch
  );
  const setAddFeatureUseSelectedWorktreeBranch = useAppStore(
    (state) => state.setAddFeatureUseSelectedWorktreeBranch
  );
  const codexAuthStatus = useSetupStore((state) => state.codexAuthStatus);

  // Worktree panel visibility (per-project)
  const worktreePanelVisibleByProject = useAppStore((state) => state.worktreePanelVisibleByProject);
  const setWorktreePanelVisible = useAppStore((state) => state.setWorktreePanelVisible);
  const isWorktreePanelVisible = worktreePanelVisibleByProject[projectPath] ?? true;

  const handleWorktreePanelToggle = useCallback(
    async (visible: boolean) => {
      // Update local store
      setWorktreePanelVisible(projectPath, visible);

      // Persist to server
      try {
        const httpClient = getHttpApiClient();
        await httpClient.settings.updateProject(projectPath, {
          worktreePanelVisible: visible,
        });
      } catch (error) {
        console.error('Failed to persist worktree panel visibility:', error);
      }
    },
    [projectPath, setWorktreePanelVisible]
  );

  const isClaudeCliVerified = !!claudeAuthStatus?.authenticated;
  const showClaudeUsage = isClaudeCliVerified;

  // Codex usage tracking visibility logic
  // Show if Codex is authenticated (CLI or API key)
  const showCodexUsage = !!codexAuthStatus?.authenticated;

  // State for mobile actions panel
  const [showActionsPanel, setShowActionsPanel] = useState(false);

  const isTablet = useIsTablet();

  return (
    <div className="flex items-center justify-between gap-5 p-4 border-b border-border bg-glass backdrop-blur-md">
      <div className="flex items-center gap-4">
        <BoardSearchBar
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
          isCreatingSpec={isCreatingSpec}
          creatingSpecProjectPath={creatingSpecProjectPath}
          currentProjectPath={projectPath}
        />
        {isMounted && <ViewToggle viewMode={viewMode} onViewModeChange={onViewModeChange} />}
        <BoardControls isMounted={isMounted} onShowBoardBackground={onShowBoardBackground} />
      </div>
      <div className="flex gap-4 items-center">
        {/* Usage Popover - show if either provider is authenticated, only on desktop */}
        {isMounted && !isTablet && (showClaudeUsage || showCodexUsage) && <UsagePopover />}

        {/* Tablet/Mobile view: show hamburger menu with all controls */}
        {isMounted && isTablet && (
          <HeaderMobileMenu
            isOpen={showActionsPanel}
            onToggle={() => setShowActionsPanel(!showActionsPanel)}
            isWorktreePanelVisible={isWorktreePanelVisible}
            onWorktreePanelToggle={handleWorktreePanelToggle}
            maxConcurrency={maxConcurrency}
            runningAgentsCount={runningAgentsCount}
            onConcurrencyChange={onConcurrencyChange}
            isAutoModeRunning={isAutoModeRunning}
            onAutoModeToggle={onAutoModeToggle}
            skipVerificationInAutoMode={skipVerificationInAutoMode}
            onSkipVerificationChange={setSkipVerificationInAutoMode}
            onOpenPlanDialog={onOpenPlanDialog}
            showClaudeUsage={showClaudeUsage}
            showCodexUsage={showCodexUsage}
          />
        )}

        {/* Desktop view: show full controls */}
        {/* Worktrees Toggle - only show after mount to prevent hydration issues */}
        {isMounted && !isTablet && (
          <div className={controlContainerClass} data-testid="worktrees-toggle-container">
            <GitBranch className="w-4 h-4 text-muted-foreground" />
            <Label
              htmlFor="worktrees-toggle"
              className="text-xs font-medium cursor-pointer whitespace-nowrap"
            >
              Worktree Bar
            </Label>
            <Switch
              id="worktrees-toggle"
              checked={isWorktreePanelVisible}
              onCheckedChange={handleWorktreePanelToggle}
              data-testid="worktrees-toggle"
            />
            <WorktreeSettingsPopover
              addFeatureUseSelectedWorktreeBranch={addFeatureUseSelectedWorktreeBranch}
              onAddFeatureUseSelectedWorktreeBranchChange={setAddFeatureUseSelectedWorktreeBranch}
            />
          </div>
        )}

        {/* Auto Mode Toggle - only show after mount to prevent hydration issues */}
        {isMounted && !isTablet && (
          <div className={controlContainerClass} data-testid="auto-mode-toggle-container">
            <Label
              htmlFor="auto-mode-toggle"
              className="text-xs font-medium cursor-pointer whitespace-nowrap"
            >
              Auto Mode
            </Label>
            <span
              className="text-[10px] font-medium text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded"
              data-testid="auto-mode-max-concurrency"
              title="Max concurrent agents"
            >
              {maxConcurrency}
            </span>
            <Switch
              id="auto-mode-toggle"
              checked={isAutoModeRunning}
              onCheckedChange={onAutoModeToggle}
              data-testid="auto-mode-toggle"
            />
            <AutoModeSettingsPopover
              skipVerificationInAutoMode={skipVerificationInAutoMode}
              onSkipVerificationChange={setSkipVerificationInAutoMode}
              maxConcurrency={maxConcurrency}
              runningAgentsCount={runningAgentsCount}
              onConcurrencyChange={onConcurrencyChange}
            />
          </div>
        )}

        {/* Plan Button with Settings - only show on desktop, tablet/mobile has it in the panel */}
        {isMounted && !isTablet && (
          <div className={controlContainerClass} data-testid="plan-button-container">
            {hasPendingPlan && (
              <button
                onClick={onOpenPendingPlan || onOpenPlanDialog}
                className="flex items-center gap-1.5 text-emerald-500 hover:text-emerald-400 transition-colors"
                data-testid="plan-review-button"
              >
                <ClipboardCheck className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onOpenPlanDialog}
              className="flex items-center gap-1.5 hover:text-foreground transition-colors"
              data-testid="plan-backlog-button"
            >
              <Wand2 className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Plan</span>
            </button>
            <PlanSettingsPopover
              planUseSelectedWorktreeBranch={planUseSelectedWorktreeBranch}
              onPlanUseSelectedWorktreeBranchChange={setPlanUseSelectedWorktreeBranch}
            />
          </div>
        )}
      </div>
    </div>
  );
}
