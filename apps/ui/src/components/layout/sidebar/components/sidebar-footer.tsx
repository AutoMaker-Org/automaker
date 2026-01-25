import type { NavigateOptions } from '@tanstack/react-router';
import { cn } from '@/lib/utils';
import { formatShortcut } from '@/store/app-store';
import { Activity, Settings } from 'lucide-react';

interface SidebarFooterProps {
  sidebarOpen: boolean;
  isActiveRoute: (id: string) => boolean;
  navigate: (opts: NavigateOptions) => void;
  hideRunningAgents: boolean;
  runningAgentsCount: number;
  shortcuts: {
    settings: string;
  };
}

export function SidebarFooter({
  sidebarOpen,
  isActiveRoute,
  navigate,
  hideRunningAgents,
  runningAgentsCount,
  shortcuts,
}: SidebarFooterProps) {
  return (
    <div
      className={cn(
        'shrink-0',
        // Top border with gradient fade
        'border-t border-border/40',
        // Elevated background for visual separation
        'bg-gradient-to-t from-background/10 via-sidebar/50 to-transparent'
      )}
    >
      {/* Running Agents Link */}
      {!hideRunningAgents && (
        <div className="p-2 pb-0">
          <button
            onClick={() => navigate({ to: '/running-agents' })}
            className={cn(
              'group flex items-center w-full px-3 py-2.5 rounded-xl relative overflow-hidden titlebar-no-drag',
              'transition-all duration-200 ease-out',
              isActiveRoute('running-agents')
                ? [
                    'bg-gradient-to-r from-brand-500/20 via-brand-500/15 to-brand-600/10',
                    'text-foreground font-medium',
                    'border border-brand-500/30',
                    'shadow-md shadow-brand-500/10',
                  ]
                : [
                    'text-muted-foreground hover:text-foreground',
                    'hover:bg-accent/50',
                    'border border-transparent hover:border-border/40',
                    'hover:shadow-sm',
                  ],
              sidebarOpen ? 'justify-start' : 'justify-center',
              'hover:scale-[1.02] active:scale-[0.97]'
            )}
            title={!sidebarOpen ? 'Running Agents' : undefined}
            data-testid="running-agents-link"
          >
            <div className="relative">
              <Activity
                className={cn(
                  'w-[18px] h-[18px] shrink-0 transition-all duration-200',
                  isActiveRoute('running-agents')
                    ? 'text-brand-500 drop-shadow-sm'
                    : 'group-hover:text-brand-400 group-hover:scale-110'
                )}
              />
              {/* Running agents count badge - shown in collapsed state */}
              {!sidebarOpen && runningAgentsCount > 0 && (
                <span
                  className={cn(
                    'absolute -top-1.5 -right-1.5 flex items-center justify-center',
                    'min-w-4 h-4 px-1 text-[9px] font-bold rounded-full',
                    'bg-brand-500 text-white shadow-sm',
                    'animate-in fade-in zoom-in duration-200'
                  )}
                  data-testid="running-agents-count-collapsed"
                >
                  {runningAgentsCount > 99 ? '99' : runningAgentsCount}
                </span>
              )}
            </div>
            <span
              className={cn(
                'ml-3 font-medium text-sm flex-1 text-left',
                sidebarOpen ? 'block' : 'hidden'
              )}
            >
              Running Agents
            </span>
            {/* Running agents count badge - shown in expanded state */}
            {sidebarOpen && runningAgentsCount > 0 && (
              <span
                className={cn(
                  'flex items-center justify-center',
                  'min-w-6 h-6 px-1.5 text-xs font-semibold rounded-full',
                  'bg-brand-500 text-white shadow-sm',
                  'animate-in fade-in zoom-in duration-200',
                  isActiveRoute('running-agents') && 'bg-brand-600'
                )}
                data-testid="running-agents-count"
              >
                {runningAgentsCount > 99 ? '99' : runningAgentsCount}
              </span>
            )}
            {!sidebarOpen && (
              <span
                className={cn(
                  'absolute left-full ml-3 px-2.5 py-1.5 rounded-lg',
                  'bg-popover text-popover-foreground text-xs font-medium',
                  'border border-border shadow-lg',
                  'opacity-0 group-hover:opacity-100',
                  'transition-all duration-200 whitespace-nowrap z-50',
                  'translate-x-1 group-hover:translate-x-0'
                )}
              >
                Running Agents
                {runningAgentsCount > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 bg-brand-500 text-white rounded-full text-[10px] font-semibold">
                    {runningAgentsCount}
                  </span>
                )}
              </span>
            )}
          </button>
        </div>
      )}
      {/* Settings Link */}
      <div className="p-2">
        <button
          onClick={() => navigate({ to: '/settings' })}
          className={cn(
            'group flex items-center w-full px-3 py-2.5 rounded-xl relative overflow-hidden titlebar-no-drag',
            'transition-all duration-200 ease-out',
            isActiveRoute('settings')
              ? [
                  'bg-gradient-to-r from-brand-500/20 via-brand-500/15 to-brand-600/10',
                  'text-foreground font-medium',
                  'border border-brand-500/30',
                  'shadow-md shadow-brand-500/10',
                ]
              : [
                  'text-muted-foreground hover:text-foreground',
                  'hover:bg-accent/50',
                  'border border-transparent hover:border-border/40',
                  'hover:shadow-sm',
                ],
            sidebarOpen ? 'justify-start' : 'justify-center',
            'hover:scale-[1.02] active:scale-[0.97]'
          )}
          title={!sidebarOpen ? 'Global Settings' : undefined}
          data-testid="settings-button"
        >
          <Settings
            className={cn(
              'w-[18px] h-[18px] shrink-0 transition-all duration-200',
              isActiveRoute('settings')
                ? 'text-brand-500 drop-shadow-sm'
                : 'group-hover:text-brand-400 group-hover:rotate-90 group-hover:scale-110'
            )}
          />
          <span
            className={cn(
              'ml-3 font-medium text-sm flex-1 text-left',
              sidebarOpen ? 'block' : 'hidden'
            )}
          >
            Global Settings
          </span>
          {sidebarOpen && (
            <span
              className={cn(
                'flex items-center justify-center min-w-5 h-5 px-1.5 text-[10px] font-mono rounded-md transition-all duration-200',
                isActiveRoute('settings')
                  ? 'bg-brand-500/20 text-brand-400'
                  : 'bg-muted text-muted-foreground group-hover:bg-accent'
              )}
              data-testid="shortcut-settings"
            >
              {formatShortcut(shortcuts.settings, true)}
            </span>
          )}
          {!sidebarOpen && (
            <span
              className={cn(
                'absolute left-full ml-3 px-2.5 py-1.5 rounded-lg',
                'bg-popover text-popover-foreground text-xs font-medium',
                'border border-border shadow-lg',
                'opacity-0 group-hover:opacity-100',
                'transition-all duration-200 whitespace-nowrap z-50',
                'translate-x-1 group-hover:translate-x-0'
              )}
            >
              Global Settings
              <span className="ml-2 px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono text-muted-foreground">
                {formatShortcut(shortcuts.settings, true)}
              </span>
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
