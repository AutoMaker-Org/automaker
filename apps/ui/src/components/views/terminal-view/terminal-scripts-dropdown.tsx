import { useCallback, useMemo } from 'react';
import { ScrollText, Play, Settings2, SquareArrowOutUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAppStore } from '@/store/app-store';
import { useProjectSettings } from '@/hooks/queries';
import { cn } from '@/lib/utils';
import { DEFAULT_TERMINAL_SCRIPTS } from '../project-settings-view/terminal-scripts-constants';

interface TerminalScriptsDropdownProps {
  /** Callback to send a command + newline to the terminal */
  onRunCommand: (command: string) => void;
  /** Callback to run a command in a new terminal tab */
  onRunCommandInNewTab?: (command: string) => void;
  /** Whether the terminal is connected and ready */
  isConnected: boolean;
  /** Optional callback to navigate to project settings scripts section */
  onOpenSettings?: () => void;
}

/**
 * Dropdown menu in the terminal header bar that provides quick-access
 * to user-configured project scripts. Each script is a split button:
 * clicking the left side runs the command in the current terminal,
 * clicking the "new tab" icon on the right runs it in a new tab.
 */
export function TerminalScriptsDropdown({
  onRunCommand,
  onRunCommandInNewTab,
  isConnected,
  onOpenSettings,
}: TerminalScriptsDropdownProps) {
  const currentProject = useAppStore((state) => state.currentProject);
  const { data: projectSettings } = useProjectSettings(currentProject?.path);

  // Use project-configured scripts or fall back to defaults
  const scripts = useMemo(() => {
    const configured = projectSettings?.terminalScripts;
    if (configured && configured.length > 0) {
      return configured;
    }
    return DEFAULT_TERMINAL_SCRIPTS;
  }, [projectSettings?.terminalScripts]);

  const handleRunScript = useCallback(
    (command: string) => {
      if (!isConnected) return;
      onRunCommand(command);
    },
    [isConnected, onRunCommand]
  );

  const handleRunScriptInNewTab = useCallback(
    (command: string) => {
      if (!isConnected || !onRunCommandInNewTab) return;
      onRunCommandInNewTab(command);
    },
    [isConnected, onRunCommandInNewTab]
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 text-muted-foreground hover:text-foreground"
          onClick={(e) => e.stopPropagation()}
          title="Quick Scripts"
          disabled={!isConnected}
        >
          <ScrollText className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        side="bottom"
        className="w-56"
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
          Quick Scripts
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {scripts.map((script) => (
          <DropdownMenuItem
            key={script.id}
            onClick={() => handleRunScript(script.command)}
            disabled={!isConnected}
            className="gap-2 pr-1"
          >
            <Play className={cn('h-3.5 w-3.5 shrink-0 text-brand-500')} />
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-sm truncate">{script.name}</span>
              <span className="text-[10px] text-muted-foreground font-mono truncate">
                {script.command}
              </span>
            </div>
            {onRunCommandInNewTab && (
              <button
                type="button"
                className={cn(
                  'shrink-0 ml-1 p-1 rounded-sm border-l border-border',
                  'text-muted-foreground hover:text-foreground hover:bg-accent/80',
                  'transition-colors',
                  !isConnected && 'pointer-events-none opacity-50'
                )}
                title="Run in new tab"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  handleRunScriptInNewTab(script.command);
                }}
                onPointerDown={(e) => {
                  // Prevent the DropdownMenuItem from handling this pointer event
                  e.stopPropagation();
                }}
                onPointerUp={(e) => {
                  e.stopPropagation();
                }}
              >
                <SquareArrowOutUpRight className="h-3 w-3" />
              </button>
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={onOpenSettings}
          className="gap-2 text-muted-foreground"
          disabled={!onOpenSettings}
        >
          <Settings2 className="h-3.5 w-3.5 shrink-0" />
          <span className="text-sm">Edit Commands & Scripts</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
