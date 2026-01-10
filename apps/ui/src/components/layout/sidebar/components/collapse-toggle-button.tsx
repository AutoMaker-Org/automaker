import { PanelLeft, PanelLeftClose } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatShortcut } from '@/store/app-store';

interface CollapseToggleButtonProps {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  shortcut: string;
}

export function CollapseToggleButton({
  sidebarOpen,
  toggleSidebar,
  shortcut,
}: CollapseToggleButtonProps) {
  return (
    <button
      onClick={toggleSidebar}
      className={cn(
        'flex absolute top-[68px] -right-3 z-9999',
        'group/toggle items-center justify-center w-7 h-7 rounded-full',
        // Glass morphism button
        'bg-card/95 backdrop-blur-sm border border-border/80',
        // Premium shadow with glow on hover
        'shadow-lg shadow-black/5 hover:shadow-xl hover:shadow-brand-500/10',
        'text-muted-foreground hover:text-brand-500 hover:bg-accent/80',
        'hover:border-brand-500/30',
        'transition-all duration-200 ease-out titlebar-no-drag',
        'hover:scale-110 active:scale-90'
      )}
      data-testid="sidebar-collapse-button"
    >
      {sidebarOpen ? (
        <PanelLeftClose className="w-3.5 h-3.5 pointer-events-none transition-transform duration-200" />
      ) : (
        <PanelLeft className="w-3.5 h-3.5 pointer-events-none transition-transform duration-200" />
      )}
      {/* Tooltip */}
      <div
        className={cn(
          'absolute left-full ml-3 px-2.5 py-1.5 rounded-lg',
          'bg-popover text-popover-foreground text-xs font-medium',
          'border border-border shadow-lg',
          'opacity-0 group-hover/toggle:opacity-100 transition-all duration-200',
          'whitespace-nowrap z-50 pointer-events-none',
          'translate-x-1 group-hover/toggle:translate-x-0'
        )}
        data-testid="sidebar-toggle-tooltip"
      >
        {sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}{' '}
        <span
          className="ml-1.5 px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono text-muted-foreground"
          data-testid="sidebar-toggle-shortcut"
        >
          {formatShortcut(shortcut, true)}
        </span>
      </div>
    </button>
  );
}
