import type { NavigateOptions } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatShortcut } from '@/store/app-store';
import type { NavSection } from '../types';
import type { Project } from '@/lib/electron';

interface SidebarNavigationProps {
  currentProject: Project | null;
  sidebarOpen: boolean;
  navSections: NavSection[];
  isActiveRoute: (id: string) => boolean;
  navigate: (opts: NavigateOptions) => void;
}

export function SidebarNavigation({
  currentProject,
  sidebarOpen,
  navSections,
  isActiveRoute,
  navigate,
}: SidebarNavigationProps) {
  return (
    <nav className={cn('flex-1 overflow-y-auto px-3 pb-2', sidebarOpen ? 'mt-5' : 'mt-1')}>
      {!currentProject && sidebarOpen ? (
        // Placeholder when no project is selected (only in expanded state)
        <div className="flex items-center justify-center h-full px-4">
          <p className="text-muted-foreground text-sm text-center">
            <span className="hidden lg:block">Select or create a project above</span>
          </p>
        </div>
      ) : currentProject ? (
        // Navigation sections when project is selected
        navSections.map((section, sectionIdx) => (
          <div key={sectionIdx} className={sectionIdx > 0 && sidebarOpen ? 'mt-6' : ''}>
            {/* Section Label */}
            {section.label && sidebarOpen && (
              <div className="hidden lg:block px-3 mb-2">
                <span className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-widest">
                  {section.label}
                </span>
              </div>
            )}
            {section.label && !sidebarOpen && <div className="h-px bg-border/30 mx-2 my-1.5"></div>}

            {/* Nav Items */}
            <div className="space-y-1.5">
              {section.items.map((item) => {
                const isActive = isActiveRoute(item.id);
                const Icon = item.icon;

                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      // Cast to the router's path type; item.id is constrained to known routes
                      navigate({ to: `/${item.id}` as unknown as '/' });
                    }}
                    className={cn(
                      'group flex items-center w-full px-3 py-2.5 rounded-xl relative overflow-hidden titlebar-no-drag',
                      'transition-all duration-200 ease-out',
                      isActive
                        ? [
                            // Active: Premium gradient with glow
                            'bg-gradient-to-r from-brand-500/20 via-brand-500/15 to-brand-600/10',
                            'text-foreground font-medium',
                            'border border-brand-500/30',
                            'shadow-md shadow-brand-500/10',
                          ]
                        : [
                            // Inactive: Subtle hover state
                            'text-muted-foreground hover:text-foreground',
                            'hover:bg-accent/50',
                            'border border-transparent hover:border-border/40',
                            'hover:shadow-sm',
                          ],
                      sidebarOpen ? 'justify-start' : 'justify-center',
                      'hover:scale-[1.02] active:scale-[0.97]'
                    )}
                    title={!sidebarOpen ? item.label : undefined}
                    data-testid={`nav-${item.id}`}
                  >
                    <div className="relative">
                      {item.isLoading ? (
                        <Loader2
                          className={cn(
                            'w-[18px] h-[18px] shrink-0 animate-spin',
                            isActive ? 'text-brand-500' : 'text-muted-foreground'
                          )}
                        />
                      ) : (
                        <Icon
                          className={cn(
                            'w-[18px] h-[18px] shrink-0 transition-all duration-200',
                            isActive
                              ? 'text-brand-500 drop-shadow-sm'
                              : 'group-hover:text-brand-400 group-hover:scale-110'
                          )}
                        />
                      )}
                      {/* Count badge for collapsed state */}
                      {!sidebarOpen && item.count !== undefined && item.count > 0 && (
                        <span
                          className={cn(
                            'absolute -top-1.5 -right-1.5 flex items-center justify-center',
                            'min-w-4 h-4 px-1 text-[9px] font-bold rounded-full',
                            'bg-primary text-primary-foreground shadow-sm',
                            'animate-in fade-in zoom-in duration-200'
                          )}
                        >
                          {item.count > 99 ? '99' : item.count}
                        </span>
                      )}
                    </div>
                    <span
                      className={cn(
                        'ml-3 font-medium text-sm flex-1 text-left',
                        sidebarOpen ? 'hidden lg:block' : 'hidden'
                      )}
                    >
                      {item.label}
                    </span>
                    {/* Count badge */}
                    {item.count !== undefined && item.count > 0 && sidebarOpen && (
                      <span
                        className={cn(
                          'hidden lg:flex items-center justify-center',
                          'min-w-5 h-5 px-1.5 text-[10px] font-bold rounded-full',
                          'bg-primary text-primary-foreground shadow-sm',
                          'animate-in fade-in zoom-in duration-200'
                        )}
                        data-testid={`count-${item.id}`}
                      >
                        {item.count > 99 ? '99+' : item.count}
                      </span>
                    )}
                    {item.shortcut && sidebarOpen && !item.count && (
                      <span
                        className={cn(
                          'hidden lg:flex items-center justify-center min-w-5 h-5 px-1.5 text-[10px] font-mono rounded-md transition-all duration-200',
                          isActive
                            ? 'bg-brand-500/20 text-brand-400'
                            : 'bg-muted text-muted-foreground group-hover:bg-accent'
                        )}
                        data-testid={`shortcut-${item.id}`}
                      >
                        {formatShortcut(item.shortcut, true)}
                      </span>
                    )}
                    {/* Tooltip for collapsed state */}
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
                        data-testid={`sidebar-tooltip-${item.label.toLowerCase()}`}
                      >
                        {item.label}
                        {item.shortcut && (
                          <span className="ml-2 px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono text-muted-foreground">
                            {formatShortcut(item.shortcut, true)}
                          </span>
                        )}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))
      ) : null}
    </nav>
  );
}
