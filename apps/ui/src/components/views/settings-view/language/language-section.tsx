import { Globe, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SUPPORTED_LANGUAGES, changeLanguage } from '@/i18n';

export function LanguageSection() {
  const { t, i18n } = useTranslation('settings');
  const currentLanguage = i18n.language;

  // Find the current language object
  const currentLangObj = SUPPORTED_LANGUAGES.find(
    (lang) => lang.code === currentLanguage || currentLanguage.startsWith(lang.code)
  );

  const handleLanguageChange = async (languageCode: string) => {
    await changeLanguage(languageCode);
  };

  return (
    <div
      className={cn(
        'rounded-2xl overflow-hidden',
        'border border-border/50',
        'bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
        'shadow-sm shadow-black/5'
      )}
    >
      {/* Header */}
      <div className="p-6 border-b border-border/50 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500/20 to-brand-600/10 flex items-center justify-center border border-brand-500/20">
            <Globe className="w-5 h-5 text-brand-500" />
          </div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">
            {t('sections.language.title')}
          </h2>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">
          {t('sections.language.description')}
        </p>
      </div>

      {/* Content */}
      <div className="p-6 space-y-6">
        {/* UI Language Selection */}
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="ui-language" className="text-foreground font-medium">
              {t('sections.language.uiLanguage')}
            </Label>
            <p className="text-xs text-muted-foreground">
              {t('sections.language.uiLanguageDescription')}
            </p>
          </div>

          <Select value={currentLangObj?.code || 'en'} onValueChange={handleLanguageChange}>
            <SelectTrigger id="ui-language" className="w-full max-w-xs">
              <SelectValue>
                {currentLangObj ? (
                  <span className="flex items-center gap-2">
                    <span>{currentLangObj.nativeName}</span>
                    <span className="text-muted-foreground">({currentLangObj.name})</span>
                  </span>
                ) : (
                  'Select language'
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {SUPPORTED_LANGUAGES.map((lang) => (
                <SelectItem key={lang.code} value={lang.code}>
                  <span className="flex items-center gap-2">
                    <span>{lang.nativeName}</span>
                    <span className="text-muted-foreground">({lang.name})</span>
                    {lang.code === currentLangObj?.code && (
                      <Check className="w-4 h-4 text-brand-500 ml-auto" />
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Info about AI response language */}
        <div className="rounded-xl border border-border/50 bg-accent/20 p-4">
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">{t('sections.language.aiLanguage')}:</strong>{' '}
            {t('sections.language.aiLanguageDescription')}
          </p>
        </div>
      </div>
    </div>
  );
}
