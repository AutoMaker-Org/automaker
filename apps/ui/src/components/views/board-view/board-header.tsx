import { useState } from 'react';
import { HotkeyButton } from '@/components/ui/hotkey-button';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Plus, Bot, Wand2, Settings2 } from 'lucide-react';
import { KeyboardShortcut } from '@/hooks/use-keyboard-shortcuts';
import { UsagePopover } from '@/components/usage-popover';
import { useAppStore } from '@/store/app-store';
import { useSetupStore } from '@/store/setup-store';
import { AutoModeSettingsDialog } from './dialogs/auto-mode-settings-dialog';

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

// Shared styles for header control containers
const controlContainerClass =
  'flex items-center gap-1.5 px-3 h-8 rounded-md bg-secondary border border-border';

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
  const [showAutoModeSettings, setShowAutoModeSettings] = useState(false);
  const apiKeys = useAppStore((state) => state.apiKeys);
  const claudeAuthStatus = useSetupStore((state) => state.claudeAuthStatus);
  const skipVerificationInAutoMode = useAppStore((state) => state.skipVerificationInAutoMode);
  const setSkipVerificationInAutoMode = useAppStore((state) => state.setSkipVerificationInAutoMode);
  const codexAuthStatus = useSetupStore((state) => state.codexAuthStatus);

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
      <div>
        <h1 className="text-xl font-bold">Kanban Board</h1>
        <p className="text-sm text-muted-foreground">{projectName}</p>
      </div>
      <div className="flex gap-2 items-center">
        {/* Usage Popover - show if either provider is authenticated */}
        {isMounted && (showClaudeUsage || showCodexUsage) && <UsagePopover />}

        {/* Concurrency Slider - only show after mount to prevent hydration issues */}
        {isMounted && (
          <div className={controlContainerClass} data-testid="concurrency-slider-container">
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
