import { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { Project } from '@/lib/electron';
import type { NavigationItem, NavigationGroup } from '../config/navigation';
import { GLOBAL_NAV_GROUPS } from '../config/navigation';
import type { SettingsViewId } from '../hooks/use-settings-view';
import { useAppStore } from '@/store/app-store';
import type { ModelProvider } from '@automaker/types';

const PROVIDERS_DROPDOWN_KEY = 'settings-providers-dropdown-open';

// Map navigation item IDs to provider types for checking disabled state
const NAV_ID_TO_PROVIDER: Record<string, ModelProvider> = {
  'claude-provider': 'claude',
  'cursor-provider': 'cursor',
  'codex-provider': 'codex',
  'opencode-provider': 'opencode',
};

interface SettingsNavigationProps {
  navItems: NavigationItem[];
  activeSection: SettingsViewId;
  currentProject: Project | null;
  onNavigate: (sectionId: SettingsViewId) => void;
  isOpen?: boolean;
  onClose?: () => void;
}

function NavButton({
  item,
  isActive,
  onNavigate,
}: {
  item: NavigationItem;
  isActive: boolean;
  onNavigate: (sectionId: SettingsViewId) => void;
}) {
  const Icon = item.icon;
  return (
    <button
      key={item.id}
      onClick={() => onNavigate(item.id)}
      className={cn(
        'group w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ease-out text-left relative overflow-hidden',
        isActive
          ? [
              'bg-gradient-to-r from-brand-500/15 via-brand-500/10 to-brand-600/5',
              'text-foreground',
              'border border-brand-500/25',
              'shadow-sm shadow-brand-500/5',
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
        <div className="absolute inset-y-0 left-0 w-0.5 bg-gradient-to-b from-brand-400 via-brand-500 to-brand-600 rounded-r-full" />
      )}
      <Icon
        className={cn(
          'w-4 h-4 shrink-0 transition-all duration-200',
          isActive ? 'text-brand-500' : 'group-hover:text-brand-400 group-hover:scale-110'
        )}
      />
      <span className="truncate">{item.label}</span>
    </button>
  );
}

function NavItemWithSubItems({
  item,
  activeSection,
  onNavigate,
}: {
  item: NavigationItem;
  activeSection: SettingsViewId;
  onNavigate: (sectionId: SettingsViewId) => void;
}) {
  const disabledProviders = useAppStore((state) => state.disabledProviders);

  const [isOpen, setIsOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(PROVIDERS_DROPDOWN_KEY);
      return stored === null ? true : stored === 'true';
    }
    return true;
  });

  useEffect(() => {
    localStorage.setItem(PROVIDERS_DROPDOWN_KEY, String(isOpen));
  }, [isOpen]);

  const hasActiveSubItem = item.subItems?.some((subItem) => subItem.id === activeSection) ?? false;
  const isParentActive = item.id === activeSection;
  const Icon = item.icon;
  const ChevronIcon = isOpen ? ChevronDown : ChevronRight;

  return (
    <div>
      {/* Parent item - clickable to toggle dropdown */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'group w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ease-out text-left',
          'text-muted-foreground hover:text-foreground',
          'hover:bg-accent/50',
          'border border-transparent hover:border-border/40',
          (isParentActive || hasActiveSubItem) && 'text-foreground'
        )}
      >
        <Icon
          className={cn(
            'w-4 h-4 shrink-0 transition-all duration-200',
            isParentActive || hasActiveSubItem ? 'text-brand-500' : 'group-hover:text-brand-400'
          )}
        />
        <span className="truncate flex-1">{item.label}</span>
        <ChevronIcon
          className={cn(
            'w-4 h-4 shrink-0 transition-transform duration-200',
            'text-muted-foreground/60 group-hover:text-muted-foreground'
          )}
        />
      </button>
      {/* Sub-items - conditionally displayed */}
      {item.subItems && isOpen && (
        <div className="ml-4 mt-1 space-y-1">
          {item.subItems.map((subItem) => {
            const SubIcon = subItem.icon;
            const isSubActive = subItem.id === activeSection;
            // Check if this provider is disabled
            const provider = NAV_ID_TO_PROVIDER[subItem.id];
            const isDisabled = provider && disabledProviders.includes(provider);
            return (
              <button
                key={subItem.id}
                onClick={() => onNavigate(subItem.id)}
                className={cn(
                  'group w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ease-out text-left relative overflow-hidden',
                  isSubActive
                    ? [
                        'bg-gradient-to-r from-brand-500/15 via-brand-500/10 to-brand-600/5',
                        'text-foreground',
                        'border border-brand-500/25',
                        'shadow-sm shadow-brand-500/5',
                      ]
                    : [
                        'text-muted-foreground hover:text-foreground',
                        'hover:bg-accent/50',
                        'border border-transparent hover:border-border/40',
                      ],
                  'hover:scale-[1.01] active:scale-[0.98]',
                  // Gray out disabled providers
                  isDisabled && !isSubActive && 'opacity-40'
                )}
              >
                {/* Active indicator bar */}
                {isSubActive && (
                  <div className="absolute inset-y-0 left-0 w-0.5 bg-gradient-to-b from-brand-400 via-brand-500 to-brand-600 rounded-r-full" />
                )}
                <SubIcon
                  className={cn(
                    'w-4 h-4 shrink-0 transition-all duration-200',
                    isSubActive
                      ? 'text-brand-500'
                      : 'group-hover:text-brand-400 group-hover:scale-110',
                    // Gray out icon for disabled providers
                    isDisabled && !isSubActive && 'opacity-60'
                  )}
                />
                <span className="truncate">{subItem.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function SettingsNavigation({
  activeSection,
  currentProject,
  onNavigate,
  isOpen = true,
  onClose,
}: SettingsNavigationProps) {
  // On mobile, only show when isOpen is true
  // On desktop (lg+), always show regardless of isOpen
  // The desktop visibility is handled by CSS, but we need to render on mobile only when open

  return (
    <>
      {/* Mobile backdrop overlay - only shown when isOpen is true on mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={onClose}
          data-testid="settings-nav-backdrop"
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
          {/* Global Settings Groups */}
          {GLOBAL_NAV_GROUPS.map((group, groupIndex) => (
            <div key={group.label}>
              {/* Group divider (except for first group) */}
              {groupIndex > 0 && <div className="my-3 border-t border-border/50" />}

              {/* Group Label */}
              <div className="px-3 py-2 text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">
                {group.label}
              </div>

              {/* Group Items */}
              <div className="space-y-1">
                {group.items.map((item) =>
                  item.subItems ? (
                    <NavItemWithSubItems
                      key={item.id}
                      item={item}
                      activeSection={activeSection}
                      onNavigate={onNavigate}
                    />
                  ) : (
                    <NavButton
                      key={item.id}
                      item={item}
                      isActive={activeSection === item.id}
                      onNavigate={onNavigate}
                    />
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      </nav>
    </>
  );
}
