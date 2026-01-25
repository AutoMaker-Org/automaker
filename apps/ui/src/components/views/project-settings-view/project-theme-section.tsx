import { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Palette, Moon, Sun, Type } from 'lucide-react';
import { darkThemes, lightThemes, type Theme } from '@/config/theme-options';
import {
  UI_SANS_FONT_OPTIONS,
  UI_MONO_FONT_OPTIONS,
  DEFAULT_FONT_VALUE,
} from '@/config/ui-font-options';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import { FontSelector } from '@/components/shared';
import type { Project } from '@/lib/electron';

interface ProjectThemeSectionProps {
  project: Project;
}

export function ProjectThemeSection({ project }: ProjectThemeSectionProps) {
  const {
    theme: globalTheme,
    fontFamilySans: globalFontSans,
    fontFamilyMono: globalFontMono,
    setProjectTheme,
    setProjectFontSans,
    setProjectFontMono,
  } = useAppStore();

  // Theme state
  const projectTheme = project.theme as Theme | undefined;
  const hasCustomTheme = projectTheme !== undefined;
  const effectiveTheme = projectTheme || globalTheme;

  // Determine if current theme is light or dark
  const isLightTheme = lightThemes.some((t) => t.value === effectiveTheme);
  const [activeTab, setActiveTab] = useState<'dark' | 'light'>(isLightTheme ? 'light' : 'dark');

  // Helper to validate fonts against available options
  const isValidSansFont = (font?: string): boolean =>
    !!font && UI_SANS_FONT_OPTIONS.some((opt) => opt.value === font);
  const isValidMonoFont = (font?: string): boolean =>
    !!font && UI_MONO_FONT_OPTIONS.some((opt) => opt.value === font);

  // Helper to get initial font value with validation
  const getInitialFontValue = (font: string | undefined, validator: (f?: string) => boolean) =>
    font && validator(font) ? font : DEFAULT_FONT_VALUE;

  // Font local state - tracks what's selected when using custom fonts
  // Falls back to default if stored font is not in available options
  const [fontSansLocal, setFontSansLocal] = useState<string>(() =>
    getInitialFontValue(project.fontFamilySans, isValidSansFont)
  );
  const [fontMonoLocal, setFontMonoLocal] = useState<string>(() =>
    getInitialFontValue(project.fontFamilyMono, isValidMonoFont)
  );

  // Sync state when project changes
  useEffect(() => {
    setFontSansLocal(getInitialFontValue(project.fontFamilySans, isValidSansFont));
    setFontMonoLocal(getInitialFontValue(project.fontFamilyMono, isValidMonoFont));
    // Also sync the active tab based on current theme
    const currentIsLight = lightThemes.some((t) => t.value === (project.theme || globalTheme));
    setActiveTab(currentIsLight ? 'light' : 'dark');
  }, [project, globalTheme]);

  // Font state - check if project has custom fonts set
  const hasCustomFontSans = project.fontFamilySans !== undefined;
  const hasCustomFontMono = project.fontFamilyMono !== undefined;

  const themesToShow = activeTab === 'dark' ? darkThemes : lightThemes;

  // Theme handlers
  const handleThemeChange = (theme: Theme) => {
    setProjectTheme(project.id, theme);
  };

  const handleUseGlobalTheme = (checked: boolean) => {
    if (checked) {
      setProjectTheme(project.id, null);
    } else {
      setProjectTheme(project.id, globalTheme);
    }
  };

  // Font handlers
  const handleUseGlobalFontSans = (checked: boolean) => {
    if (checked) {
      // Clear project font to use global
      setProjectFontSans(project.id, null);
      setFontSansLocal(DEFAULT_FONT_VALUE);
    } else {
      // Set explicit project override - use 'default' value to indicate explicit default choice
      const fontToSet = globalFontSans || DEFAULT_FONT_VALUE;
      setFontSansLocal(fontToSet);
      // Store the actual value (including 'default') so hasCustomFontSans stays true
      setProjectFontSans(project.id, fontToSet);
    }
  };

  const handleUseGlobalFontMono = (checked: boolean) => {
    if (checked) {
      // Clear project font to use global
      setProjectFontMono(project.id, null);
      setFontMonoLocal(DEFAULT_FONT_VALUE);
    } else {
      // Set explicit project override - use 'default' value to indicate explicit default choice
      const fontToSet = globalFontMono || DEFAULT_FONT_VALUE;
      setFontMonoLocal(fontToSet);
      // Store the actual value (including 'default') so hasCustomFontMono stays true
      setProjectFontMono(project.id, fontToSet);
    }
  };

  const handleFontSansChange = (value: string) => {
    setFontSansLocal(value);
    // Store the actual value (including 'default') - only null clears to use global
    setProjectFontSans(project.id, value);
  };

  const handleFontMonoChange = (value: string) => {
    setFontMonoLocal(value);
    // Store the actual value (including 'default') - only null clears to use global
    setProjectFontMono(project.id, value);
  };

  // Get display label for global font
  const getGlobalFontSansLabel = () => {
    if (!globalFontSans) return 'Default (Geist Sans)';
    const option = UI_SANS_FONT_OPTIONS.find((o) => o.value === globalFontSans);
    return option?.label || globalFontSans;
  };

  const getGlobalFontMonoLabel = () => {
    if (!globalFontMono) return 'Default (Geist Mono)';
    const option = UI_MONO_FONT_OPTIONS.find((o) => o.value === globalFontMono);
    return option?.label || globalFontMono;
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
          <h2 className="text-lg font-semibold text-foreground tracking-tight">Theme & Fonts</h2>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">
          Customize the appearance for this project.
        </p>
      </div>
      <div className="p-6 space-y-6">
        {/* Use Global Theme Toggle */}
        <div className="group flex items-start space-x-3 p-3 rounded-xl hover:bg-accent/30 transition-colors duration-200 -mx-3">
          <Checkbox
            id="use-global-theme"
            checked={!hasCustomTheme}
            onCheckedChange={handleUseGlobalTheme}
            className="mt-1"
            data-testid="use-global-theme-checkbox"
          />
          <div className="space-y-1.5">
            <Label
              htmlFor="use-global-theme"
              className="text-foreground cursor-pointer font-medium flex items-center gap-2"
            >
              <Palette className="w-4 h-4 text-brand-500" />
              Use Global Theme
            </Label>
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              When enabled, this project will use the global theme setting. Disable to set a
              project-specific theme.
            </p>
          </div>
        </div>

        {/* Theme Selection - only show if not using global theme */}
        {hasCustomTheme && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-foreground font-medium">Project Theme</Label>
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
                    onClick={() => handleThemeChange(value)}
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
                    data-testid={`project-${testId}`}
                  >
                    <Icon className="w-4 h-4 transition-all duration-200" style={{ color }} />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Info when using global theme */}
        {!hasCustomTheme && (
          <div className="rounded-xl border border-border/30 bg-muted/30 p-4">
            <p className="text-sm text-muted-foreground">
              This project is using the global theme:{' '}
              <span className="font-medium text-foreground">{globalTheme}</span>
            </p>
          </div>
        )}

        {/* Fonts Section */}
        <div className="space-y-4 pt-6 border-t border-border/50">
          <div className="flex items-center gap-2 mb-4">
            <Type className="w-4 h-4 text-muted-foreground" />
            <Label className="text-foreground font-medium">Fonts</Label>
          </div>

          <div className="space-y-4">
            {/* UI Font */}
            <div className="space-y-3">
              <div className="group flex items-start space-x-3 p-3 rounded-xl hover:bg-accent/30 transition-colors duration-200 -mx-3">
                <Checkbox
                  id="use-global-font-sans"
                  checked={!hasCustomFontSans}
                  onCheckedChange={handleUseGlobalFontSans}
                  className="mt-1"
                />
                <div className="flex-1 space-y-1.5">
                  <Label
                    htmlFor="use-global-font-sans"
                    className="text-foreground cursor-pointer font-medium"
                  >
                    Use Global UI Font
                  </Label>
                  {!hasCustomFontSans && (
                    <p className="text-xs text-muted-foreground">
                      Currently using:{' '}
                      <span className="font-medium">{getGlobalFontSansLabel()}</span>
                    </p>
                  )}
                </div>
              </div>

              {hasCustomFontSans && (
                <div className="ml-6 space-y-2">
                  <Label htmlFor="ui-font-select" className="text-sm">
                    Project UI Font
                  </Label>
                  <FontSelector
                    id="ui-font-select"
                    value={fontSansLocal}
                    options={UI_SANS_FONT_OPTIONS}
                    placeholder="Default (Geist Sans)"
                    onChange={handleFontSansChange}
                  />
                </div>
              )}
            </div>

            {/* Code Font */}
            <div className="space-y-3">
              <div className="group flex items-start space-x-3 p-3 rounded-xl hover:bg-accent/30 transition-colors duration-200 -mx-3">
                <Checkbox
                  id="use-global-font-mono"
                  checked={!hasCustomFontMono}
                  onCheckedChange={handleUseGlobalFontMono}
                  className="mt-1"
                />
                <div className="flex-1 space-y-1.5">
                  <Label
                    htmlFor="use-global-font-mono"
                    className="text-foreground cursor-pointer font-medium"
                  >
                    Use Global Code Font
                  </Label>
                  {!hasCustomFontMono && (
                    <p className="text-xs text-muted-foreground">
                      Currently using:{' '}
                      <span className="font-medium">{getGlobalFontMonoLabel()}</span>
                    </p>
                  )}
                </div>
              </div>

              {hasCustomFontMono && (
                <div className="ml-6 space-y-2">
                  <Label htmlFor="code-font-select" className="text-sm">
                    Project Code Font
                  </Label>
                  <FontSelector
                    id="code-font-select"
                    value={fontMonoLocal}
                    options={UI_MONO_FONT_OPTIONS}
                    placeholder="Default (Geist Mono)"
                    onChange={handleFontMonoChange}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
