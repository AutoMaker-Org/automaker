import { HotkeyButton } from '@/components/ui/hotkey-button';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Plus, Bot, Wand2, AlertCircle, Clock } from 'lucide-react';
import { KeyboardShortcut } from '@/hooks/use-keyboard-shortcuts';
import { ClaudeUsagePopover } from '@/components/claude-usage-popover';
import { useAppStore, AutoModePausedState, AutoModeResumeSchedule } from '@/store/app-store';
import { useSetupStore } from '@/store/setup-store';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface BoardHeaderProps {
  projectName: string;
  maxConcurrency: number;
  runningAgentsCount: number;
  onConcurrencyChange: (value: number) => void;
  isAutoModeRunning: boolean;
  onAutoModeToggle: (enabled: boolean) => void;
  onAddFeature: () => void;
  onOpenPlanDialog: () => void;
  addFeatureShortcut: KeyboardShortcut;
  isMounted: boolean;
  isAutoModePaused?: boolean;
  autoModePausedState?: AutoModePausedState | null;
  autoModeResumeSchedule?: AutoModeResumeSchedule | null;
  onOpenPauseDialog?: () => void;
}

export function BoardHeader({
  projectName,
  maxConcurrency,
  runningAgentsCount,
  onConcurrencyChange,
  isAutoModeRunning,
  onAutoModeToggle,
  onAddFeature,
  onOpenPlanDialog,
  addFeatureShortcut,
  isMounted,
  isAutoModePaused,
  autoModePausedState,
  autoModeResumeSchedule,
  onOpenPauseDialog,
}: BoardHeaderProps) {
  const apiKeys = useAppStore((state) => state.apiKeys);
  const claudeAuthStatus = useSetupStore((state) => state.claudeAuthStatus);

  // Format remaining time for scheduled resume
  const formatTimeRemaining = (resumeAt: string) => {
    const now = new Date();
    const resumeDate = new Date(resumeAt);
    const diffMs = resumeDate.getTime() - now.getTime();
    if (diffMs <= 0) return 'resuming soon...';
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  // Hide usage tracking when using API key (only show for Claude Code CLI users)
  // Check both user-entered API key and environment variable ANTHROPIC_API_KEY
  // Also hide on Windows for now (CLI usage command not supported)
  // Only show if CLI has been verified/authenticated
  const isWindows =
    typeof navigator !== 'undefined' && navigator.platform?.toLowerCase().includes('win');
  const hasApiKey = !!apiKeys.anthropic || !!claudeAuthStatus?.hasEnvApiKey;
  const isCliVerified =
    claudeAuthStatus?.authenticated && claudeAuthStatus?.method === 'cli_authenticated';
  const showUsageTracking = !hasApiKey && !isWindows && isCliVerified;

  return (
    <div className="flex items-center justify-between p-4 border-b border-border bg-glass backdrop-blur-md">
      <div>
        <h1 className="text-xl font-bold">Kanban Board</h1>
        <p className="text-sm text-muted-foreground">{projectName}</p>
      </div>
      <div className="flex gap-2 items-center">
        {/* Usage Popover - only show for CLI users (not API key users) */}
        {isMounted && showUsageTracking && <ClaudeUsagePopover />}

        {/* Concurrency Slider - only show after mount to prevent hydration issues */}
        {isMounted && (
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary border border-border"
            data-testid="concurrency-slider-container"
          >
            <Bot className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Agents</span>
            <Slider
              value={[maxConcurrency]}
              onValueChange={(value) => onConcurrencyChange(value[0])}
              min={1}
              max={10}
              step={1}
              className="w-20"
              data-testid="concurrency-slider"
            />
            <span
              className="text-sm text-muted-foreground min-w-[5ch] text-center"
              data-testid="concurrency-value"
            >
              {runningAgentsCount} / {maxConcurrency}
            </span>
          </div>
        )}

        {/* Auto Mode Toggle - only show after mount to prevent hydration issues */}
        {isMounted && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary border border-border">
            <Label htmlFor="auto-mode-toggle" className="text-sm font-medium cursor-pointer">
              Auto Mode
            </Label>
            <Switch
              id="auto-mode-toggle"
              checked={isAutoModeRunning}
              onCheckedChange={onAutoModeToggle}
              data-testid="auto-mode-toggle"
            />
          </div>
        )}

        {/* Paused/Scheduled Resume Indicator */}
        {isMounted && isAutoModePaused && !isAutoModeRunning && (
          <TooltipProvider>
            {autoModeResumeSchedule ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={onOpenPauseDialog}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/30 transition-colors cursor-pointer"
                  >
                    <Clock className="h-3.5 w-3.5" />
                    <span className="text-xs font-medium">
                      Resuming in {formatTimeRemaining(autoModeResumeSchedule.resumeAt)}
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Click to view or change scheduled resume</p>
                </TooltipContent>
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={onOpenPauseDialog}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-destructive/20 border border-destructive/40 text-destructive hover:bg-destructive/30 transition-colors cursor-pointer"
                  >
                    <AlertCircle className="h-3.5 w-3.5" />
                    <span className="text-xs font-medium">Paused - At Limit</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Click to schedule auto mode resume</p>
                </TooltipContent>
              </Tooltip>
            )}
          </TooltipProvider>
        )}

        <Button
          size="sm"
          variant="outline"
          onClick={onOpenPlanDialog}
          data-testid="plan-backlog-button"
        >
          <Wand2 className="w-4 h-4 mr-2" />
          Plan
        </Button>

        <HotkeyButton
          size="sm"
          onClick={onAddFeature}
          hotkey={addFeatureShortcut}
          hotkeyActive={false}
          data-testid="add-feature-button"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Feature
        </HotkeyButton>
      </div>
    </div>
  );
}
