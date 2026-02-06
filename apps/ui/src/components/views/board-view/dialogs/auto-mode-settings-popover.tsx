import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { FastForward, Bot, Settings2 } from 'lucide-react';

interface AutoModeSettingsPopoverProps {
  skipVerificationInAutoMode: boolean;
  onSkipVerificationChange: (value: boolean) => void;
  maxConcurrency: number;
  runningAgentsCount: number;
  onConcurrencyChange: (value: number) => void;
}

export function AutoModeSettingsPopover({
  skipVerificationInAutoMode,
  onSkipVerificationChange,
  maxConcurrency,
  runningAgentsCount,
  onConcurrencyChange,
}: AutoModeSettingsPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="p-1 rounded hover:bg-accent/50 transition-colors"
          title="Auto Mode Settings"
          data-testid="auto-mode-settings-button"
        >
          <Settings2 className="w-4 h-4 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end" sideOffset={8}>
        <div className="space-y-4">
          <div>
            <h4 className="font-medium text-sm mb-1">Auto Mode Settings</h4>
            <p className="text-xs text-muted-foreground">
              Configure auto mode execution and agent concurrency.
            </p>
          </div>

          {/* Max Concurrent Agents */}
          <div className="space-y-2 p-2 rounded-md bg-secondary/50">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-brand-500 shrink-0" />
              <Label className="text-xs font-medium">Max Concurrent Agents</Label>
              <span className="ml-auto text-xs text-muted-foreground">
                {maxConcurrency === 0 ? 'Paused' : `${runningAgentsCount}/${maxConcurrency}`}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Slider
                value={[maxConcurrency]}
                onValueChange={(value) => onConcurrencyChange(value[0])}
                min={0}
                max={10}
                step={1}
                className="flex-1"
                data-testid="concurrency-slider"
              />
              <span className="text-xs font-medium min-w-[2ch] text-right">
                {maxConcurrency === 0 ? '0' : maxConcurrency}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Higher values process more features in parallel but use more API resources.
            </p>
          </div>

          {/* Skip Verification Setting */}
          <div className="flex items-center justify-between gap-3 p-2 rounded-md bg-secondary/50">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <FastForward className="w-4 h-4 text-brand-500 shrink-0" />
              <Label
                htmlFor="skip-verification-toggle"
                className="text-xs font-medium cursor-pointer"
              >
                Skip verification requirement
              </Label>
            </div>
            <Switch
              id="skip-verification-toggle"
              checked={skipVerificationInAutoMode}
              onCheckedChange={onSkipVerificationChange}
              data-testid="skip-verification-toggle"
            />
          </div>

          <p className="text-[10px] text-muted-foreground leading-relaxed">
            When enabled, auto mode will grab features even if their dependencies are not verified,
            as long as they are not currently running.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
