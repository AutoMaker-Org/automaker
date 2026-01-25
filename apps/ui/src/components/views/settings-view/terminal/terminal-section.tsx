import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  SquareTerminal,
  RefreshCw,
  Terminal,
  SquarePlus,
  SplitSquareHorizontal,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import { toast } from 'sonner';
import { TERMINAL_FONT_OPTIONS } from '@/config/terminal-themes';
import { DEFAULT_FONT_VALUE } from '@/config/ui-font-options';
import { useAvailableTerminals } from '@/components/views/board-view/worktree-panel/hooks/use-available-terminals';
import { getTerminalIcon } from '@/components/icons/terminal-icons';

export function TerminalSection() {
  const {
    terminalState,
    setTerminalDefaultRunScript,
    setTerminalScreenReaderMode,
    setTerminalFontFamily,
    setTerminalScrollbackLines,
    setTerminalLineHeight,
    setTerminalDefaultFontSize,
    defaultTerminalId,
    setDefaultTerminalId,
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

  // Get available external terminals
  const { terminals, isRefreshing, refresh } = useAvailableTerminals();

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
        {/* Default External Terminal */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-foreground font-medium">Default External Terminal</Label>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={refresh}
              disabled={isRefreshing}
              title="Refresh available terminals"
              aria-label="Refresh available terminals"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', isRefreshing && 'animate-spin')} />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Terminal to use when selecting "Open in Terminal" from the worktree menu
          </p>
          <Select
            value={defaultTerminalId ?? 'integrated'}
            onValueChange={(value) => {
              setDefaultTerminalId(value === 'integrated' ? null : value);
              toast.success(
                value === 'integrated'
                  ? 'Integrated terminal set as default'
                  : 'Default terminal changed'
              );
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a terminal" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="integrated">
                <span className="flex items-center gap-2">
                  <Terminal className="w-4 h-4" />
                  Integrated Terminal
                </span>
              </SelectItem>
              {terminals.map((terminal) => {
                const TerminalIcon = getTerminalIcon(terminal.id);
                return (
                  <SelectItem key={terminal.id} value={terminal.id}>
                    <span className="flex items-center gap-2">
                      <TerminalIcon className="w-4 h-4" />
                      {terminal.name}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {terminals.length === 0 && !isRefreshing && (
            <p className="text-xs text-muted-foreground italic">
              No external terminals detected. Click refresh to re-scan.
            </p>
          )}
        </div>

        {/* Default Open Mode */}
        <div className="space-y-3">
          <Label className="text-foreground font-medium">Default Open Mode</Label>
          <p className="text-xs text-muted-foreground">
            How to open the integrated terminal when using "Open in Terminal" from the worktree menu
          </p>
          <Select
            value={openTerminalMode}
            onValueChange={(value: 'newTab' | 'split') => {
              setOpenTerminalMode(value);
              toast.success(
                value === 'newTab'
                  ? 'New terminals will open in new tabs'
                  : 'New terminals will split the current tab'
              );
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newTab">
                <span className="flex items-center gap-2">
                  <SquarePlus className="w-4 h-4" />
                  New Tab
                </span>
              </SelectItem>
              <SelectItem value="split">
                <span className="flex items-center gap-2">
                  <SplitSquareHorizontal className="w-4 h-4" />
                  Split Current Tab
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

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
