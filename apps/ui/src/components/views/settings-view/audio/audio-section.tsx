import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AudioSectionProps {
  muteDoneSound: boolean;
  onMuteDoneSoundChange: (value: boolean) => void;
}

export function AudioSection({ muteDoneSound, onMuteDoneSoundChange }: AudioSectionProps) {
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
            <Volume2 className="w-5 h-5 text-brand-500" />
          </div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">
            {t('sections.audio.title')}
          </h2>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">{t('sections.audio.description')}</p>
      </div>
      <div className="p-6 space-y-4">
        <div className="group flex items-start space-x-3 p-3 rounded-xl hover:bg-accent/30 transition-colors duration-200 -mx-3">
          <Checkbox
            id="mute-done-sound"
            checked={muteDoneSound}
            onCheckedChange={onMuteDoneSoundChange}
            className="mt-1"
            data-testid="mute-done-sound-checkbox"
          />
          <div className="space-y-1.5">
            <Label
              htmlFor="mute-done-sound"
              className="text-foreground cursor-pointer font-medium flex items-center gap-2"
            >
              <VolumeX className="w-4 h-4 text-brand-500" />
              {t('sections.audio.muteDoneSound')}
            </Label>
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              {t('sections.audio.muteDoneSoundDescription')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
