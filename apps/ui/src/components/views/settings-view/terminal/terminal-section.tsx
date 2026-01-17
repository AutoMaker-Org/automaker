import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SquareTerminal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import { toast } from 'sonner';
import { TERMINAL_FONT_OPTIONS } from '@/config/terminal-themes';
import { DEFAULT_FONT_VALUE } from '@/config/ui-font-options';

export function TerminalSection() {
  const {
    terminalState,
    setTerminalDefaultRunScript,
    setTerminalScreenReaderMode,
    setTerminalFontFamily,
    setTerminalScrollbackLines,
    setTerminalLineHeight,
    setTerminalDefaultFontSize,
    setOpenTerminalMode,
  } = useAppStore();

  const {
    defaultRunScript,
    screenReaderMode,
    fontFamily,
    scrollbackLines,
    lineHeight,
    defaultFontSize,
    openTerminalMode,
  } = terminalState;

  return (
    <div
      className={cn(
        'rounded-2xl overflow-hidden',
        'border border-border/50',
        'bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
        'shadow-sm shadow-black/5'
      )}
    >
      <div className="p-6 border-b border-border/50 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-green-500/20 to-green-600/10 flex items-center justify-center border border-green-500/20">
            <SquareTerminal className="w-5 h-5 text-green-500" />
          </div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">Terminal</h2>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">
          Customize terminal appearance and behavior. Theme follows your app theme in Appearance
          settings.
        </p>
      </div>
      <div className="p-6 space-y-6">
        {/* Font Family */}
        <div className="space-y-3">
          <Label className="text-foreground font-medium">Font Family</Label>
          <Select
            value={fontFamily || DEFAULT_FONT_VALUE}
            onValueChange={(value) => {
              setTerminalFontFamily(value);
              toast.info('Font family changed', {
                description: 'Restart terminal for changes to take effect',
              });
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Default (Menlo / Monaco)" />
            </SelectTrigger>
            <SelectContent>
              {TERMINAL_FONT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  <span
                    style={{
                      fontFamily: option.value === DEFAULT_FONT_VALUE ? undefined : option.value,
                    }}
                  >
                    {option.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Default Font Size */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-foreground font-medium">Default Font Size</Label>
            <span className="text-sm text-muted-foreground">{defaultFontSize}px</span>
          </div>
          <Slider
            value={[defaultFontSize]}
            min={8}
            max={32}
            step={1}
            onValueChange={([value]) => setTerminalDefaultFontSize(value)}
            className="flex-1"
          />
        </div>

        {/* Line Height */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-foreground font-medium">Line Height</Label>
            <span className="text-sm text-muted-foreground">{lineHeight.toFixed(1)}</span>
          </div>
          <Slider
            value={[lineHeight]}
            min={1.0}
            max={2.0}
            step={0.1}
            onValueChange={([value]) => {
              setTerminalLineHeight(value);
            }}
            onValueCommit={() => {
              toast.info('Line height changed', {
                description: 'Restart terminal for changes to take effect',
              });
            }}
            className="flex-1"
          />
        </div>

        {/* Scrollback Lines */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-foreground font-medium">Scrollback Buffer</Label>
            <span className="text-sm text-muted-foreground">
              {(scrollbackLines / 1000).toFixed(0)}k lines
            </span>
          </div>
          <Slider
            value={[scrollbackLines]}
            min={1000}
            max={100000}
            step={1000}
            onValueChange={([value]) => setTerminalScrollbackLines(value)}
            onValueCommit={() => {
              toast.info('Scrollback changed', {
                description: 'Restart terminal for changes to take effect',
              });
            }}
            className="flex-1"
          />
        </div>

        {/* Default Run Script */}
        <div className="space-y-3">
          <Label className="text-foreground font-medium">Default Run Script</Label>
          <p className="text-xs text-muted-foreground">
            Command to run automatically when opening a new terminal (e.g., "claude", "codex")
          </p>
          <Input
            value={defaultRunScript}
            onChange={(e) => setTerminalDefaultRunScript(e.target.value)}
            placeholder="e.g., claude, codex, npm run dev"
            className="bg-accent/30 border-border/50"
          />
        </div>

        {/* Open in Terminal Mode */}
        <div className="space-y-3">
          <Label className="text-foreground font-medium">Open in Terminal Mode</Label>
          <p className="text-xs text-muted-foreground">
            How to open terminals from the "Open in Terminal" action in the worktree menu
          </p>
          <Select
            value={openTerminalMode}
            onValueChange={(value: 'newTab' | 'split') => setOpenTerminalMode(value)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newTab">New Tab (named after branch)</SelectItem>
              <SelectItem value="split">Split Current Tab</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Screen Reader Mode */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label className="text-foreground font-medium">Screen Reader Mode</Label>
            <p className="text-xs text-muted-foreground">
              Enable accessibility mode for screen readers
            </p>
          </div>
          <Switch
            checked={screenReaderMode}
            onCheckedChange={(checked) => {
              setTerminalScreenReaderMode(checked);
              toast.success(
                checked ? 'Screen reader mode enabled' : 'Screen reader mode disabled',
                {
                  description: 'Restart terminal for changes to take effect',
                }
              );
            }}
          />
        </div>
      </div>
    </div>
  );
}
