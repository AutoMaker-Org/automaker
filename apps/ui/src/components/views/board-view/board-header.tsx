import { HotkeyButton } from '@/components/ui/hotkey-button';
import { cn } from '@/lib/utils';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Plus, Bot } from 'lucide-react';
import { KeyboardShortcut } from '@/hooks/use-keyboard-shortcuts';
import { ClaudeUsagePopover } from '@/components/claude-usage-popover';
import { useAppStore } from '@/store/app-store';

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
  const apiKeys = useAppStore((state) => state.apiKeys);

  // Hide usage tracking when using API key (only show for Claude Code CLI users)
  // Also hide on Windows for now (CLI usage command not supported)
  const isWindows =
    typeof navigator !== 'undefined' && navigator.platform?.toLowerCase().includes('win');
  const showUsageTracking = !apiKeys.anthropic && !isWindows;

  return (
    <header className="h-16 flex items-center justify-between px-8 border-b border-white/5 bg-[#0b101a]/40 backdrop-blur-md z-20 shrink-0">
      <div>
        <h2 className="text-lg font-bold text-white tracking-tight">Kanban Board</h2>
        <p className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-bold mono">
          {projectName}
        </p>
      </div>

      <div className="flex items-center gap-5">
        {/* Concurrency/Agent Control - Styled as Toggle for visual matching, but keeps slider logic if needed or simplified */}
        {isMounted && (
          <div className="flex items-center bg-white/5 border border-white/10 rounded-full px-4 py-1.5 gap-3">
            <Bot className="w-4 h-4 text-slate-500" />
            {/* We keep the slider for functionality, but could style it to look like the toggle or just use the slider cleanly */}
            <Slider
              value={[maxConcurrency]}
              onValueChange={(value) => onConcurrencyChange(value[0])}
              min={1}
              max={10}
              step={1}
              className="w-20"
            />
            <span className="mono text-xs font-bold text-slate-400">
              {runningAgentsCount} / {maxConcurrency}
            </span>
          </div>
        )}

        {/* Auto Mode Button */}
        {isMounted && (
          <button
            onClick={() => onAutoModeToggle(!isAutoModeRunning)}
            className={cn(
              'flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold transition',
              isAutoModeRunning
                ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                : 'glass hover:bg-white/10'
            )}
          >
            <div
              className={cn(
                'w-2 h-2 rounded-full',
                isAutoModeRunning ? 'bg-cyan-400 animate-pulse' : 'bg-slate-500'
              )}
            />
            Auto Mode
          </button>
        )}

        {/* Add Feature Button */}
        <button
          onClick={onAddFeature}
          className="btn-cyan px-6 py-2 rounded-xl text-xs font-black flex items-center gap-2 shadow-lg shadow-cyan-500/20"
        >
          <Plus className="w-4 h-4 stroke-[3.5px]" />
          ADD FEATURE
        </button>
      </div>
    </header>
  );
}
