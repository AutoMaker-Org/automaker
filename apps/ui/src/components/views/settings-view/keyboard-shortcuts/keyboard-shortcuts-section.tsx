import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Settings2, Keyboard } from 'lucide-react';
import { cn } from '@/lib/utils';

interface KeyboardShortcutsSectionProps {
  onOpenKeyboardMap: () => void;
}

export function KeyboardShortcutsSection({ onOpenKeyboardMap }: KeyboardShortcutsSectionProps) {
  const { t } = useTranslation('settings');

  return (
    <div
      className={cn(
        'rounded-2xl overflow-hidden',
        'border border-border/50',
        'bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
        'shadow-sm shadow-black/5'
      )}
    >
      <div className="p-6 border-b border-border/50 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500/20 to-brand-600/10 flex items-center justify-center border border-brand-500/20">
            <Settings2 className="w-5 h-5 text-brand-500" />
          </div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">
            {t('sections.keyboard.title')}
          </h2>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">
          {t('sections.keyboard.description')}
        </p>
      </div>
      <div className="p-6">
        {/* Centered message directing to keyboard map */}
        <div className="flex flex-col items-center justify-center py-12 text-center space-y-5">
          <div className="relative">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-500/10 to-brand-600/5 flex items-center justify-center border border-brand-500/20">
              <Keyboard className="w-10 h-10 text-brand-500/60" />
            </div>
            <div className="absolute inset-0 bg-brand-500/10 blur-2xl rounded-full -z-10" />
          </div>
          <div className="space-y-2 max-w-md">
            <h3 className="text-lg font-semibold text-foreground">
              {t('sections.keyboard.useVisualMap')}
            </h3>
            <p className="text-sm text-muted-foreground/80">
              {t('sections.keyboard.visualMapDescription')}
            </p>
          </div>
          <Button
            variant="default"
            size="lg"
            onClick={onOpenKeyboardMap}
            className={cn(
              'gap-2.5 mt-2 h-11 px-6',
              'bg-gradient-to-r from-brand-500 to-brand-600',
              'hover:from-brand-600 hover:to-brand-600',
              'text-white font-medium border-0',
              'shadow-md shadow-brand-500/20 hover:shadow-lg hover:shadow-brand-500/25',
              'transition-all duration-200 ease-out',
              'hover:scale-[1.02] active:scale-[0.98]'
            )}
          >
            <Keyboard className="w-5 h-5" />
            {t('sections.keyboard.openKeyboardMap')}
          </Button>
        </div>
      </div>
    </div>
  );
}
