import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Palette, Moon, Sun, Upload, X, ImageIcon } from 'lucide-react';
import { darkThemes, lightThemes } from '@/config/theme-options';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import { IconPicker } from '@/components/layout/project-switcher/components/icon-picker';
import { getAuthenticatedImageUrl } from '@/lib/api-fetch';
import { getHttpApiClient } from '@/lib/http-api-client';
import type { Theme, Project } from '../shared/types';

interface AppearanceSectionProps {
  effectiveTheme: Theme;
  currentProject: Project | null;
  onThemeChange: (theme: Theme) => void;
}

export function AppearanceSection({
  effectiveTheme,
  currentProject,
  onThemeChange,
}: AppearanceSectionProps) {
  const { t } = useTranslation('settings');
  const { setProjectIcon, setProjectName, setProjectCustomIcon } = useAppStore();
  const [activeTab, setActiveTab] = useState<'dark' | 'light'>('dark');
  const [projectName, setProjectNameLocal] = useState(currentProject?.name || '');
  const [projectIcon, setProjectIconLocal] = useState<string | null>(currentProject?.icon || null);
  const [customIconPath, setCustomIconPathLocal] = useState<string | null>(
    currentProject?.customIconPath || null
  );
  const [isUploadingIcon, setIsUploadingIcon] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync local state when currentProject changes
  useEffect(() => {
    setProjectNameLocal(currentProject?.name || '');
    setProjectIconLocal(currentProject?.icon || null);
    setCustomIconPathLocal(currentProject?.customIconPath || null);
  }, [currentProject]);

  const themesToShow = activeTab === 'dark' ? darkThemes : lightThemes;

  // Auto-save when values change
  const handleNameChange = (name: string) => {
    setProjectNameLocal(name);
    if (currentProject && name.trim() && name.trim() !== currentProject.name) {
      setProjectName(currentProject.id, name.trim());
    }
  };

  const handleIconChange = (icon: string | null) => {
    setProjectIconLocal(icon);
    if (currentProject) {
      setProjectIcon(currentProject.id, icon);
    }
  };

  const handleCustomIconChange = (path: string | null) => {
    setCustomIconPathLocal(path);
    if (currentProject) {
      setProjectCustomIcon(currentProject.id, path);
      // Clear Lucide icon when custom icon is set
      if (path) {
        setProjectIconLocal(null);
        setProjectIcon(currentProject.id, null);
      }
    }
  };

  const handleCustomIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentProject) return;

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      return;
    }

    // Validate file size (max 2MB for icons)
    if (file.size > 2 * 1024 * 1024) {
      return;
    }

    setIsUploadingIcon(true);
    try {
      // Convert to base64
      const reader = new FileReader();
      reader.onload = async () => {
        const base64Data = reader.result as string;
        const result = await getHttpApiClient().saveImageToTemp(
          base64Data,
          `project-icon-${file.name}`,
          file.type,
          currentProject.path
        );
        if (result.success && result.path) {
          handleCustomIconChange(result.path);
        }
        setIsUploadingIcon(false);
      };
      reader.readAsDataURL(file);
    } catch {
      setIsUploadingIcon(false);
    }
  };

  const handleRemoveCustomIcon = () => {
    handleCustomIconChange(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
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
          <h2 className="text-lg font-semibold text-foreground tracking-tight">
            {t('sections.appearance.title')}
          </h2>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">
          {t('sections.appearance.description')}
        </p>
      </div>
      <div className="p-6 space-y-6">
        {/* Project Details Section */}
        {currentProject && (
          <div className="space-y-4 pb-6 border-b border-border/50">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="project-name-settings">
                  {t('sections.appearance.projectName')}
                </Label>
                <Input
                  id="project-name-settings"
                  value={projectName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder={t('sections.appearance.projectNamePlaceholder')}
                />
              </div>

              <div className="space-y-2">
                <Label>{t('sections.appearance.projectIcon')}</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  {t('sections.appearance.projectIconDescription')}
                </p>

                {/* Custom Icon Upload */}
                <div className="mb-4">
                  <div className="flex items-center gap-3">
                    {customIconPath ? (
                      <div className="relative">
                        <img
                          src={getAuthenticatedImageUrl(customIconPath, currentProject.path)}
                          alt="Custom project icon"
                          className="w-12 h-12 rounded-lg object-cover border border-border"
                        />
                        <button
                          type="button"
                          onClick={handleRemoveCustomIcon}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover:bg-destructive/90"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-lg border border-dashed border-border flex items-center justify-center bg-accent/30">
                        <ImageIcon className="w-5 h-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/gif,image/webp"
                        onChange={handleCustomIconUpload}
                        className="hidden"
                        id="custom-icon-upload"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploadingIcon}
                        className="gap-1.5"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        {isUploadingIcon
                          ? t('sections.appearance.uploading')
                          : t('sections.appearance.uploadCustomIcon')}
                      </Button>
                      <p className="text-xs text-muted-foreground mt-1">
                        {t('sections.appearance.iconFileTypes')}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Preset Icon Picker - only show if no custom icon */}
                {!customIconPath && (
                  <IconPicker selectedIcon={projectIcon} onSelectIcon={handleIconChange} />
                )}
              </div>
            </div>
          </div>
        )}

        {/* Theme Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-foreground font-medium">
              {t('sections.appearance.theme')}{' '}
              <span className="text-muted-foreground font-normal">
                {currentProject
                  ? t('sections.appearance.themeForProject', { name: currentProject.name })
                  : t('sections.appearance.themeGlobal')}
              </span>
            </Label>
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
                {t('themes.dark')}
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
                {t('themes.light')}
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
      </div>
    </div>
  );
}
