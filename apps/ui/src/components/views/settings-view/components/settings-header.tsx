import { Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SettingsHeaderProps {
  title?: string;
  description?: string;
}

export function SettingsHeader({
  title = 'Settings',
  description = 'Configure your API keys and preferences',
}: SettingsHeaderProps) {
  return (
    <div className={cn('shrink-0', 'border-b border-white/10', 'bg-white/5 backdrop-blur-xl')}>
      <div className="px-8 py-6">
        <div className="flex items-center gap-4">
          <div
            className={cn(
              'w-12 h-12 rounded-2xl flex items-center justify-center',
              'bg-gradient-to-br from-brand-500 to-brand-600',
              'shadow-lg shadow-brand-500/25',
              'ring-1 ring-white/10'
            )}
          >
            <Settings className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">{title}</h1>
            <p className="text-sm text-muted-foreground/80 mt-0.5">{description}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
