import { HotkeyButton } from '@/components/ui/hotkey-button';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Plus, Bot, Wand2 } from 'lucide-react';
import { KeyboardShortcut } from '@/hooks/use-keyboard-shortcuts';
import { ClaudeUsagePopover } from '@/components/claude-usage-popover';
import { useAppStore } from '@/store/app-store';
import { useSetupStore } from '@/store/setup-store';

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
}: BoardHeaderProps) {
  const apiKeys = useAppStore((state) => state.apiKeys);
  const claudeAuthStatus = useSetupStore((state) => state.claudeAuthStatus);

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
