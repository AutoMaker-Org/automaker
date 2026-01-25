import { PanelLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import { useIsCompact } from '@/hooks/use-media-query';

/**
 * Floating toggle button for mobile that completely hides/shows the sidebar.
 * Positioned at the left-center of the screen.
 * Only visible on compact/mobile screens when the sidebar is hidden.
 */
export function MobileSidebarToggle() {
  const isCompact = useIsCompact();
  const { mobileSidebarHidden, toggleMobileSidebarHidden } = useAppStore();

  // Only show on compact screens when sidebar is hidden
  if (!isCompact || !mobileSidebarHidden) {
    return null;
  }

  return (
    <button
      onClick={toggleMobileSidebarHidden}
      className={cn(
        'fixed left-0 top-1/2 -translate-y-1/2 z-50',
        'flex items-center justify-center',
        'w-8 h-12 rounded-r-lg',
        // Glass morphism background
        'bg-card/95 backdrop-blur-sm border border-l-0 border-border/80',
        // Shadow and hover effects
        'shadow-lg shadow-black/10 hover:shadow-xl hover:shadow-brand-500/10',
        'text-muted-foreground hover:text-brand-500 hover:bg-accent/80',
        'hover:border-brand-500/30',
        'transition-all duration-200 ease-out',
        'hover:w-10 active:scale-95'
      )}
      aria-label="Show sidebar"
      data-testid="mobile-sidebar-toggle"
    >
      <PanelLeft className="w-4 h-4 pointer-events-none" />
    </button>
  );
}
