import { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Palette, Moon, Sun, Type } from 'lucide-react';
import { darkThemes, lightThemes } from '@/config/theme-options';
import {
  UI_SANS_FONT_OPTIONS,
  UI_MONO_FONT_OPTIONS,
  DEFAULT_FONT_VALUE,
} from '@/config/ui-font-options';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import { FontSelector } from '@/components/shared';
import type { Theme } from '../shared/types';

interface AppearanceSectionProps {
  effectiveTheme: Theme;
  onThemeChange: (theme: Theme) => void;
}

export function AppearanceSection({ effectiveTheme, onThemeChange }: AppearanceSectionProps) {
  const { fontFamilySans, fontFamilyMono, setFontSans, setFontMono } = useAppStore();

  // Determine if current theme is light or dark
  const isLightTheme = lightThemes.some((t) => t.value === effectiveTheme);
  const [activeTab, setActiveTab] = useState<'dark' | 'light'>(isLightTheme ? 'light' : 'dark');

  // Sync active tab when theme changes
  useEffect(() => {
    const currentIsLight = lightThemes.some((t) => t.value === effectiveTheme);
    setActiveTab(currentIsLight ? 'light' : 'dark');
  }, [effectiveTheme]);

  const themesToShow = activeTab === 'dark' ? darkThemes : lightThemes;

  // Convert null to 'default' for Select component
  // Also fallback to default if the stored font is not in the available options
  const isValidSansFont = (font: string | null): boolean => {
    if (!font) return false;
    return UI_SANS_FONT_OPTIONS.some((opt) => opt.value === font);
  };
  const isValidMonoFont = (font: string | null): boolean => {
    if (!font) return false;
    return UI_MONO_FONT_OPTIONS.some((opt) => opt.value === font);
  };
  const fontSansValue =
    fontFamilySans && isValidSansFont(fontFamilySans) ? fontFamilySans : DEFAULT_FONT_VALUE;
  const fontMonoValue =
    fontFamilyMono && isValidMonoFont(fontFamilyMono) ? fontFamilyMono : DEFAULT_FONT_VALUE;

  const handleFontSansChange = (value: string) => {
    setFontSans(value === DEFAULT_FONT_VALUE ? null : value);
  };

  const handleFontMonoChange = (value: string) => {
    setFontMono(value === DEFAULT_FONT_VALUE ? null : value);
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
      <div className="p-6 border-b border-border/50 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500/20 to-brand-600/10 flex items-center justify-center border border-brand-500/20">
            <Palette className="w-5 h-5 text-brand-500" />
          </div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">Appearance</h2>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">
          Customize the look and feel of your application.
        </p>
      </div>
      <div className="p-6 space-y-6">
        {/* Theme Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-foreground font-medium">Theme</Label>
            {/* Dark/Light Tabs */}
            <div className="flex gap-1 p-1 rounded-lg bg-accent/30">
              <button
                onClick={() => setActiveTab('dark')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200',
                  activeTab === 'dark'
                    ? 'bg-brand-500 text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Moon className="w-3.5 h-3.5" />
                Dark
              </button>
              <button
                onClick={() => setActiveTab('light')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200',
                  activeTab === 'light'
                    ? 'bg-brand-500 text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Sun className="w-3.5 h-3.5" />
                Light
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {themesToShow.map(({ value, label, Icon, testId, color }) => {
              const isActive = effectiveTheme === value;
              return (
                <button
                  key={value}
                  onClick={() => onThemeChange(value)}
                  className={cn(
                    'group flex items-center justify-center gap-2.5 px-4 py-3.5 rounded-xl',
                    'text-sm font-medium transition-all duration-200 ease-out',
                    isActive
                      ? [
                          'bg-gradient-to-br from-brand-500/15 to-brand-600/10',
                          'border-2 border-brand-500/40',
                          'text-foreground',
                          'shadow-md shadow-brand-500/10',
                        ]
                      : [
                          'bg-accent/30 hover:bg-accent/50',
                          'border border-border/50 hover:border-border',
                          'text-muted-foreground hover:text-foreground',
                          'hover:shadow-sm',
                        ],
                    'hover:scale-[1.02] active:scale-[0.98]'
                  )}
                  data-testid={testId}
                >
                  <Icon className="w-4 h-4 transition-all duration-200" style={{ color }} />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Fonts Section */}
        <div className="space-y-4 pt-6 border-t border-border/50">
          <div className="flex items-center gap-2 mb-4">
            <Type className="w-4 h-4 text-muted-foreground" />
            <Label className="text-foreground font-medium">Fonts</Label>
          </div>
          <p className="text-xs text-muted-foreground -mt-2 mb-4">
            Set default fonts for all projects. Individual projects can override these settings.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* UI Font Selector */}
            <div className="space-y-2">
              <Label htmlFor="global-ui-font-select" className="text-sm">
                UI Font
              </Label>
              <FontSelector
                id="global-ui-font-select"
                value={fontSansValue}
                options={UI_SANS_FONT_OPTIONS}
                placeholder="Default (Geist Sans)"
                onChange={handleFontSansChange}
              />
              <p className="text-xs text-muted-foreground">
                Used for headings, labels, and UI text
              </p>
            </div>

            {/* Code Font Selector */}
            <div className="space-y-2">
              <Label htmlFor="global-code-font-select" className="text-sm">
                Code Font
              </Label>
              <FontSelector
                id="global-code-font-select"
                value={fontMonoValue}
                options={UI_MONO_FONT_OPTIONS}
                placeholder="Default (Geist Mono)"
                onChange={handleFontMonoChange}
              />
              <p className="text-xs text-muted-foreground">
                Used for code blocks and monospaced text
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
