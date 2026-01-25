import { createPortal } from 'react-dom';
import { X, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface HeaderActionsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

/**
 * A slide-out panel for header actions on tablet and below.
 * Shows as a right-side panel that slides in from the right edge.
 * On desktop (lg+), this component is hidden and children should be rendered inline.
 */
export function HeaderActionsPanel({
  isOpen,
  onClose,
  title = 'Actions',
  children,
}: HeaderActionsPanelProps) {
  // Use portal to render outside parent stacking contexts (backdrop-blur creates stacking context)
  const panelContent = (
    <>
      {/* Mobile backdrop overlay - only shown when isOpen is true on tablet/mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-[60] lg:hidden"
          onClick={onClose}
          data-testid="header-actions-backdrop"
        />
      )}

      {/* Actions panel */}
      <div
        className={cn(
          // Mobile: fixed position overlay with slide transition from right
          'fixed inset-y-0 right-0 w-72 z-[70]',
          'transition-transform duration-200 ease-out',
          // Hide on mobile when closed, show when open
          isOpen ? 'translate-x-0' : 'translate-x-full',
          // Desktop: hidden entirely (actions shown inline in header)
          'lg:hidden',
          'flex flex-col',
          'border-l border-border/50',
          'bg-gradient-to-b from-card/95 via-card/90 to-card/85 backdrop-blur-xl'
        )}
      >
        {/* Panel header with close button */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
          <span className="text-sm font-semibold text-foreground">{title}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
            aria-label="Close actions panel"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Panel content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">{children}</div>
      </div>
    </>
  );

  // Render to document.body to escape stacking context
  if (typeof document !== 'undefined') {
    return createPortal(panelContent, document.body);
  }

  return panelContent;
}

interface HeaderActionsPanelTriggerProps {
  isOpen: boolean;
  onToggle: () => void;
  className?: string;
}

/**
 * Toggle button for the HeaderActionsPanel.
 * Only visible on tablet and below (lg:hidden).
 */
export function HeaderActionsPanelTrigger({
  isOpen,
  onToggle,
  className,
}: HeaderActionsPanelTriggerProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onToggle}
      className={cn('h-8 w-8 p-0 text-muted-foreground hover:text-foreground lg:hidden', className)}
      aria-label={isOpen ? 'Close actions menu' : 'Open actions menu'}
    >
      {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
    </Button>
  );
}
