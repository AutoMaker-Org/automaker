import { Cog, Menu, X, FileJson } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface SettingsHeaderProps {
  title?: string;
  description?: string;
  showNavigation?: boolean;
  onToggleNavigation?: () => void;
  onImportExportClick?: () => void;
}

export function SettingsHeader({
  title = 'Global Settings',
  description = 'Configure your API keys and preferences',
  showNavigation,
  onToggleNavigation,
  onImportExportClick,
}: SettingsHeaderProps) {
  return (
    <div
      className={cn(
        'shrink-0',
        'border-b border-border/50',
        'bg-gradient-to-r from-card/90 via-card/70 to-card/80 backdrop-blur-xl'
      )}
    >
      <div className="px-4 py-4 lg:px-8 lg:py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 lg:gap-4">
            <div
              className={cn(
                'w-10 h-10 lg:w-12 lg:h-12 rounded-xl lg:rounded-2xl flex items-center justify-center',
                'bg-gradient-to-br from-brand-500 to-brand-600',
                'shadow-lg shadow-brand-500/25',
                'ring-1 ring-white/10'
              )}
            >
              <Cog className="w-5 h-5 lg:w-6 lg:h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl lg:text-2xl font-bold text-foreground tracking-tight">
                {title}
              </h1>
              <p className="text-xs lg:text-sm text-muted-foreground/80 mt-0.5">{description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Import/Export button */}
            {onImportExportClick && (
              <Button variant="outline" size="sm" onClick={onImportExportClick} className="gap-2">
                <FileJson className="w-4 h-4" />
                <span className="hidden sm:inline">Import / Export</span>
              </Button>
            )}
            {/* Mobile menu toggle button - only visible on mobile */}
            {onToggleNavigation && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggleNavigation}
                className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground lg:hidden"
                aria-label={showNavigation ? 'Close navigation menu' : 'Open navigation menu'}
              >
                {showNavigation ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
