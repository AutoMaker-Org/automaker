import { cn } from '@/lib/utils';
import type { Project } from '@/lib/electron';
import type { NavigationItem } from '../config/navigation';
import { GLOBAL_NAV_ITEMS, PROJECT_NAV_ITEMS } from '../config/navigation';
import type { SettingsViewId } from '../hooks/use-settings-view';

interface SettingsNavigationProps {
  navItems: NavigationItem[];
  activeSection: SettingsViewId;
  currentProject: Project | null;
  onNavigate: (sectionId: SettingsViewId) => void;
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
  const hasActiveSubItem = item.subItems?.some((subItem) => subItem.id === activeSection) ?? false;
  const isParentActive = item.id === activeSection;
  const Icon = item.icon;

  return (
    <div>
      {/* Parent item - non-clickable label */}
      <div
        className={cn(
          'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground',
          isParentActive || (hasActiveSubItem && 'text-foreground')
        )}
      >
        <Icon
          className={cn(
            'w-4 h-4 shrink-0 transition-all duration-200',
            isParentActive || hasActiveSubItem ? 'text-brand-500' : 'text-muted-foreground'
          )}
        />
        <span className="truncate">{item.label}</span>
      </div>
      {/* Sub-items - always displayed */}
      {item.subItems && (
        <div className="ml-4 mt-1 space-y-1">
          {item.subItems.map((subItem) => {
            const SubIcon = subItem.icon;
            const isSubActive = subItem.id === activeSection;
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
                  'hover:scale-[1.01] active:scale-[0.98]'
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
                      : 'group-hover:text-brand-400 group-hover:scale-110'
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
}: SettingsNavigationProps) {
  return (
    <nav
      className={cn(
        'hidden lg:block w-52 shrink-0 overflow-y-auto',
        'border-r border-border/50',
        'bg-gradient-to-b from-card/80 via-card/60 to-card/40 backdrop-blur-xl'
      )}
    >
      <div className="sticky top-0 p-4 space-y-1">
        {/* Global Settings Label */}
        <div className="px-3 py-2 text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">
          Global Settings
        </div>

        {/* Global Settings Items */}
        <div className="space-y-1">
          {GLOBAL_NAV_ITEMS.map((item) =>
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

        {/* Project Settings - only show when a project is selected */}
        {currentProject && (
          <>
            {/* Divider */}
            <div className="my-4 border-t border-border/50" />

            {/* Project Settings Label */}
            <div className="px-3 py-2 text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">
              Project Settings
            </div>

            {/* Project Settings Items */}
            <div className="space-y-1">
              {PROJECT_NAV_ITEMS.map((item) => (
                <NavButton
                  key={item.id}
                  item={item}
                  isActive={activeSection === item.id}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </nav>
  );
}
