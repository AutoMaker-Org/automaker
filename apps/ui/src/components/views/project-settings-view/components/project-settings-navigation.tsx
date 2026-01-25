import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PROJECT_SETTINGS_NAV_ITEMS } from '../config/navigation';
import type { ProjectSettingsViewId } from '../hooks/use-project-settings-view';

interface ProjectSettingsNavigationProps {
  activeSection: ProjectSettingsViewId;
  onNavigate: (sectionId: ProjectSettingsViewId) => void;
  isOpen?: boolean;
  onClose?: () => void;
}

export function ProjectSettingsNavigation({
  activeSection,
  onNavigate,
  isOpen = true,
  onClose,
}: ProjectSettingsNavigationProps) {
  return (
    <>
      {/* Mobile backdrop overlay - only shown when isOpen is true on mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={onClose}
          data-testid="project-settings-nav-backdrop"
        />
      )}

      {/* Navigation sidebar */}
      <nav
        className={cn(
          // Mobile: fixed position overlay with slide transition from right
          'fixed inset-y-0 right-0 w-72 z-30',
          'transition-transform duration-200 ease-out',
          // Hide on mobile when closed, show when open
          isOpen ? 'translate-x-0' : 'translate-x-full',
          // Desktop: relative position in layout, always visible
          'lg:relative lg:w-64 lg:z-auto lg:translate-x-0',
          'shrink-0 overflow-y-auto',
          'border-l border-border/50 lg:border-l-0 lg:border-r',
          'bg-gradient-to-b from-card/95 via-card/90 to-card/85 backdrop-blur-xl',
          // Desktop background
          'lg:from-card/80 lg:via-card/60 lg:to-card/40'
        )}
      >
        {/* Mobile close button */}
        <div className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-border/50">
          <span className="text-sm font-semibold text-foreground">Navigation</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
            aria-label="Close navigation menu"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="sticky top-0 p-4 space-y-1">
          {PROJECT_SETTINGS_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            const isDanger = item.id === 'danger';

            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={cn(
                  'group w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ease-out text-left relative overflow-hidden',
                  isActive
                    ? [
                        isDanger
                          ? 'bg-gradient-to-r from-red-500/15 via-red-500/10 to-red-600/5'
                          : 'bg-gradient-to-r from-brand-500/15 via-brand-500/10 to-brand-600/5',
                        'text-foreground',
                        isDanger ? 'border border-red-500/25' : 'border border-brand-500/25',
                        isDanger ? 'shadow-sm shadow-red-500/5' : 'shadow-sm shadow-brand-500/5',
                      ]
                    : [
                        'text-muted-foreground hover:text-foreground',
                        'hover:bg-accent/50',
                        'border border-transparent hover:border-border/40',
                      ],
                  'hover:scale-[1.01] active:scale-[0.98]'
                )}
              >
                {/* Active indicator bar */}
                {isActive && (
                  <div
                    className={cn(
                      'absolute inset-y-0 left-0 w-0.5 rounded-r-full',
                      isDanger
                        ? 'bg-gradient-to-b from-red-400 via-red-500 to-red-600'
                        : 'bg-gradient-to-b from-brand-400 via-brand-500 to-brand-600'
                    )}
                  />
                )}
                <Icon
                  className={cn(
                    'w-4 h-4 shrink-0 transition-all duration-200',
                    isActive
                      ? isDanger
                        ? 'text-red-500'
                        : 'text-brand-500'
                      : isDanger
                        ? 'group-hover:text-red-400 group-hover:scale-110'
                        : 'group-hover:text-brand-400 group-hover:scale-110'
                  )}
                />
                <span className={cn(isDanger && !isActive && 'text-red-400/70')}>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
