import { Button } from '@/components/ui/button';
import { HotkeyButton } from '@/components/ui/hotkey-button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Plus, Bot } from 'lucide-react';
import { KeyboardShortcut } from '@/hooks/use-keyboard-shortcuts';

const MAX_CONCURRENCY = 10;

interface BoardHeaderProps {
  projectName: string;
  maxConcurrency: number;
  runningAgentsCount: number;
  onConcurrencyChange: (value: number) => void;
  isAutoModeRunning: boolean;
  onAutoModeToggle: (enabled: boolean) => void;
  onAddFeature: () => void;
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
  addFeatureShortcut,
  isMounted,
}: BoardHeaderProps) {
  return (
    <div className="flex items-center justify-between p-4 border-b border-border bg-glass backdrop-blur-md">
      <div>
        <h1 className="text-xl font-bold">Kanban Board</h1>
        <p className="text-sm text-muted-foreground">{projectName}</p>
      </div>
      <div className="flex gap-2 items-center">
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
              max={MAX_CONCURRENCY}
              step={1}
              className="w-20"
              data-testid="concurrency-slider"
            />
            <span
              className="text-sm text-muted-foreground min-w-[5ch] text-center"
              data-testid="concurrency-value"
            >
              {maxConcurrency} / {MAX_CONCURRENCY}
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
