import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  HeaderActionsPanel,
  HeaderActionsPanelTrigger,
} from '@/components/ui/header-actions-panel';
import { Bot, Wand2, GitBranch, Zap, FastForward } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MobileUsageBar } from './mobile-usage-bar';

interface HeaderMobileMenuProps {
  // Panel visibility
  isOpen: boolean;
  onToggle: () => void;
  // Worktree panel visibility
  isWorktreePanelVisible: boolean;
  onWorktreePanelToggle: (visible: boolean) => void;
  // Concurrency control
  maxConcurrency: number;
  runningAgentsCount: number;
  onConcurrencyChange: (value: number) => void;
  // Auto mode
  isAutoModeRunning: boolean;
  onAutoModeToggle: (enabled: boolean) => void;
  skipVerificationInAutoMode: boolean;
  onSkipVerificationChange: (value: boolean) => void;
  // Plan button
  onOpenPlanDialog: () => void;
  // Usage bar visibility
  showClaudeUsage: boolean;
  showCodexUsage: boolean;
}

export function HeaderMobileMenu({
  isOpen,
  onToggle,
  isWorktreePanelVisible,
  onWorktreePanelToggle,
  maxConcurrency,
  runningAgentsCount,
  onConcurrencyChange,
  isAutoModeRunning,
  onAutoModeToggle,
  skipVerificationInAutoMode,
  onSkipVerificationChange,
  onOpenPlanDialog,
  showClaudeUsage,
  showCodexUsage,
}: HeaderMobileMenuProps) {
  return (
    <>
      <HeaderActionsPanelTrigger isOpen={isOpen} onToggle={onToggle} />
      <HeaderActionsPanel isOpen={isOpen} onClose={onToggle} title="Board Controls">
        {/* Usage Bar - show if either provider is authenticated */}
        {(showClaudeUsage || showCodexUsage) && (
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Usage
            </span>
            <MobileUsageBar showClaudeUsage={showClaudeUsage} showCodexUsage={showCodexUsage} />
          </div>
        )}

        {/* Controls Section */}
        <div className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Controls
          </span>

          {/* Auto Mode Section */}
          <div className="rounded-lg border border-border/50 overflow-hidden">
            {/* Auto Mode Toggle */}
            <div
              className="flex items-center justify-between p-3 cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() => onAutoModeToggle(!isAutoModeRunning)}
              data-testid="mobile-auto-mode-toggle-container"
            >
              <div className="flex items-center gap-2">
                <Zap
                  className={cn(
                    'w-4 h-4',
                    isAutoModeRunning ? 'text-yellow-500' : 'text-muted-foreground'
                  )}
                />
                <span className="text-sm font-medium">Auto Mode</span>
              </div>
              <Switch
                id="mobile-auto-mode-toggle"
                checked={isAutoModeRunning}
                onCheckedChange={onAutoModeToggle}
                onClick={(e) => e.stopPropagation()}
                data-testid="mobile-auto-mode-toggle"
              />
            </div>

            {/* Skip Verification Toggle */}
            <div
              className="flex items-center justify-between p-3 pl-9 cursor-pointer hover:bg-accent/50 border-t border-border/30 transition-colors"
              onClick={() => onSkipVerificationChange(!skipVerificationInAutoMode)}
              data-testid="mobile-skip-verification-toggle-container"
            >
              <div className="flex items-center gap-2">
                <FastForward className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Skip Verification</span>
              </div>
              <Switch
                id="mobile-skip-verification-toggle"
                checked={skipVerificationInAutoMode}
                onCheckedChange={onSkipVerificationChange}
                onClick={(e) => e.stopPropagation()}
                data-testid="mobile-skip-verification-toggle"
              />
            </div>

            {/* Concurrency Control */}
            <div
              className="p-3 pl-9 border-t border-border/30"
              data-testid="mobile-concurrency-control"
            >
              <div className="flex items-center gap-2 mb-3">
                <Bot className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Max Agents</span>
                <span
                  className="text-sm text-muted-foreground ml-auto"
                  data-testid="mobile-concurrency-value"
                >
                  {runningAgentsCount}/{maxConcurrency}
                </span>
              </div>
              <Slider
                value={[maxConcurrency]}
                onValueChange={(value) => onConcurrencyChange(value[0])}
                min={1}
                max={10}
                step={1}
                className="w-full"
                data-testid="mobile-concurrency-slider"
              />
            </div>
          </div>

          {/* Worktrees Toggle */}
          <div
            className="flex items-center justify-between p-3 cursor-pointer hover:bg-accent/50 rounded-lg border border-border/50 transition-colors"
            onClick={() => onWorktreePanelToggle(!isWorktreePanelVisible)}
            data-testid="mobile-worktrees-toggle-container"
          >
            <div className="flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Worktree Bar</span>
            </div>
            <Switch
              id="mobile-worktrees-toggle"
              checked={isWorktreePanelVisible}
              onCheckedChange={onWorktreePanelToggle}
              onClick={(e) => e.stopPropagation()}
              data-testid="mobile-worktrees-toggle"
            />
          </div>

          {/* Plan Button */}
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => {
              onOpenPlanDialog();
              onToggle();
            }}
            data-testid="mobile-plan-button"
          >
            <Wand2 className="w-4 h-4 mr-2" />
            Plan
          </Button>
        </div>
      </HeaderActionsPanel>
    </>
  );
}
