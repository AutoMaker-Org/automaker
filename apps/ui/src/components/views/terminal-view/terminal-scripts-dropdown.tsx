import { useCallback, useMemo } from 'react';
import { ScrollText, Play, Settings2 } from 'lucide-react';
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
  /** Whether the terminal is connected and ready */
  isConnected: boolean;
  /** Optional callback to navigate to project settings scripts section */
  onOpenSettings?: () => void;
}

/**
 * Dropdown menu in the terminal header bar that provides quick-access
 * to user-configured project scripts. Clicking a script inserts the
 * command into the terminal and presses Enter.
 */
export function TerminalScriptsDropdown({
  onRunCommand,
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
            className="gap-2"
          >
            <Play className={cn('h-3.5 w-3.5 shrink-0 text-brand-500')} />
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-sm truncate">{script.name}</span>
              <span className="text-[10px] text-muted-foreground font-mono truncate">
                {script.command}
              </span>
            </div>
          </DropdownMenuItem>
        ))}
        {onOpenSettings && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onOpenSettings} className="gap-2 text-muted-foreground">
              <Settings2 className="h-3.5 w-3.5 shrink-0" />
              <span className="text-sm">Configure Scripts...</span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
