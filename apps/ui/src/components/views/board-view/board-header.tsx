import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Bot, Wand2, Settings2, GitBranch } from 'lucide-react';
import { UsagePopover } from '@/components/usage-popover';
import { useAppStore } from '@/store/app-store';
import { useSetupStore } from '@/store/setup-store';
import { AutoModeSettingsDialog } from './dialogs/auto-mode-settings-dialog';
import { getHttpApiClient } from '@/lib/http-api-client';
import { BoardSearchBar } from './board-search-bar';
import { BoardControls } from './board-controls';

interface BoardHeaderProps {
  projectPath: string;
  maxConcurrency: number;
  runningAgentsCount: number;
  onConcurrencyChange: (value: number) => void;
  isAutoModeRunning: boolean;
  onAutoModeToggle: (enabled: boolean) => void;
  onOpenPlanDialog: () => void;
  isMounted: boolean;
  // Search bar props
  searchQuery: string;
  onSearchChange: (query: string) => void;
  isCreatingSpec: boolean;
  creatingSpecProjectPath?: string;
  // Board controls props
  onShowBoardBackground: () => void;
  onShowCompletedModal: () => void;
  completedCount: number;
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
  isMounted,
  searchQuery,
  onSearchChange,
  isCreatingSpec,
  creatingSpecProjectPath,
  onShowBoardBackground,
  onShowCompletedModal,
  completedCount,
}: BoardHeaderProps) {
  const [showAutoModeSettings, setShowAutoModeSettings] = useState(false);
  const apiKeys = useAppStore((state) => state.apiKeys);
  const claudeAuthStatus = useSetupStore((state) => state.claudeAuthStatus);
  const skipVerificationInAutoMode = useAppStore((state) => state.skipVerificationInAutoMode);
  const setSkipVerificationInAutoMode = useAppStore((state) => state.setSkipVerificationInAutoMode);
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

  // Claude usage tracking visibility logic
  // Hide when using API key (only show for Claude Code CLI users)
  // Also hide on Windows for now (CLI usage command not supported)
  const isWindows =
    typeof navigator !== 'undefined' && navigator.platform?.toLowerCase().includes('win');
  const hasClaudeApiKey = !!apiKeys.anthropic || !!claudeAuthStatus?.hasEnvApiKey;
  const isClaudeCliVerified =
    claudeAuthStatus?.authenticated && claudeAuthStatus?.method === 'cli_authenticated';
  const showClaudeUsage = !hasClaudeApiKey && !isWindows && isClaudeCliVerified;

  // Codex usage tracking visibility logic
  // Show if Codex is authenticated (CLI or API key)
  const showCodexUsage = !!codexAuthStatus?.authenticated;

  return (
    <div className="flex items-center justify-between p-4 border-b border-border bg-glass backdrop-blur-md">
      <div className="flex items-center gap-4">
        <BoardSearchBar
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
          isCreatingSpec={isCreatingSpec}
          creatingSpecProjectPath={creatingSpecProjectPath}
          currentProjectPath={projectPath}
        />
        <BoardControls
          isMounted={isMounted}
          onShowBoardBackground={onShowBoardBackground}
          onShowCompletedModal={onShowCompletedModal}
          completedCount={completedCount}
        />
      </div>
      <div className="flex gap-2 items-center">
        {/* Usage Popover - show if either provider is authenticated */}
        {isMounted && (showClaudeUsage || showCodexUsage) && <UsagePopover />}

        {/* Worktrees Toggle - only show after mount to prevent hydration issues */}
        {isMounted && (
          <div className={controlContainerClass} data-testid="worktrees-toggle-container">
            <GitBranch className="w-4 h-4 text-muted-foreground" />
            <Label htmlFor="worktrees-toggle" className="text-sm font-medium cursor-pointer">
              Worktrees
            </Label>
            <Switch
              id="worktrees-toggle"
              checked={isWorktreePanelVisible}
              onCheckedChange={handleWorktreePanelToggle}
              data-testid="worktrees-toggle"
            />
          </div>
        )}

        {/* Concurrency Control - only show after mount to prevent hydration issues */}
        {isMounted && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                className={`${controlContainerClass} cursor-pointer hover:bg-accent/50 transition-colors`}
                data-testid="concurrency-slider-container"
              >
                <Bot className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Agents</span>
                <span className="text-sm text-muted-foreground" data-testid="concurrency-value">
                  {runningAgentsCount}/{maxConcurrency}
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64" align="end">
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium text-sm mb-1">Max Concurrent Agents</h4>
                  <p className="text-xs text-muted-foreground">
                    Controls how many AI agents can run simultaneously. Higher values process more
                    features in parallel but use more API resources.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Slider
                    value={[maxConcurrency]}
                    onValueChange={(value) => onConcurrencyChange(value[0])}
                    min={1}
                    max={10}
                    step={1}
                    className="flex-1"
                    data-testid="concurrency-slider"
                  />
                  <span className="text-sm font-medium min-w-[2ch] text-right">
                    {maxConcurrency}
                  </span>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        )}

        {/* Auto Mode Toggle - only show after mount to prevent hydration issues */}
        {isMounted && (
          <div className={controlContainerClass} data-testid="auto-mode-toggle-container">
            <Label htmlFor="auto-mode-toggle" className="text-sm font-medium cursor-pointer">
              Auto Mode
            </Label>
            <Switch
              id="auto-mode-toggle"
              checked={isAutoModeRunning}
              onCheckedChange={onAutoModeToggle}
              data-testid="auto-mode-toggle"
            />
            <button
              onClick={() => setShowAutoModeSettings(true)}
              className="p-1 rounded hover:bg-accent/50 transition-colors"
              title="Auto Mode Settings"
              data-testid="auto-mode-settings-button"
            >
              <Settings2 className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        )}

        {/* Auto Mode Settings Dialog */}
        <AutoModeSettingsDialog
          open={showAutoModeSettings}
          onOpenChange={setShowAutoModeSettings}
          skipVerificationInAutoMode={skipVerificationInAutoMode}
          onSkipVerificationChange={setSkipVerificationInAutoMode}
        />

        <Button
          size="sm"
          variant="outline"
          onClick={onOpenPlanDialog}
          data-testid="plan-backlog-button"
        >
          <Wand2 className="w-4 h-4 mr-2" />
          Plan
        </Button>
      </div>
    </div>
  );
}
