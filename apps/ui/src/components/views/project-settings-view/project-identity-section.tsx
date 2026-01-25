import { useState, useRef, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Palette, Upload, X, ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import { IconPicker } from '@/components/layout/project-switcher/components/icon-picker';
import { getAuthenticatedImageUrl } from '@/lib/api-fetch';
import { getHttpApiClient } from '@/lib/http-api-client';
import { toast } from 'sonner';
import type { Project } from '@/lib/electron';

interface ProjectIdentitySectionProps {
  project: Project;
}

export function ProjectIdentitySection({ project }: ProjectIdentitySectionProps) {
  const { setProjectIcon, setProjectName, setProjectCustomIcon } = useAppStore();
  const [projectName, setProjectNameLocal] = useState(project.name || '');
  const [projectIcon, setProjectIconLocal] = useState<string | null>(project.icon || null);
  const [customIconPath, setCustomIconPathLocal] = useState<string | null>(
    project.customIconPath || null
  );
  const [isUploadingIcon, setIsUploadingIcon] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync local state when project changes
  useEffect(() => {
    setProjectNameLocal(project.name || '');
    setProjectIconLocal(project.icon || null);
    setCustomIconPathLocal(project.customIconPath || null);
  }, [project]);

  // Auto-save when values change
  const handleNameChange = (name: string) => {
    setProjectNameLocal(name);
    if (name.trim() && name.trim() !== project.name) {
      setProjectName(project.id, name.trim());
    }
  };

  const handleIconChange = (icon: string | null) => {
    setProjectIconLocal(icon);
    setProjectIcon(project.id, icon);
  };

  const handleCustomIconChange = (path: string | null) => {
    setCustomIconPathLocal(path);
    setProjectCustomIcon(project.id, path);
    // Clear Lucide icon when custom icon is set
    if (path) {
      setProjectIconLocal(null);
      setProjectIcon(project.id, null);
    }
  };

  const handleCustomIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast.error('Invalid file type', {
        description: 'Please upload a PNG, JPG, GIF, or WebP image.',
      });
      return;
    }

    // Validate file size (max 2MB for icons)
    if (file.size > 2 * 1024 * 1024) {
      toast.error('File too large', {
        description: 'Please upload an image smaller than 2MB.',
      });
      return;
    }

    setIsUploadingIcon(true);
    try {
      // Convert to base64
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Data = reader.result as string;
          const result = await getHttpApiClient().saveImageToTemp(
            base64Data,
            `project-icon-${file.name}`,
            file.type,
            project.path
          );
          if (result.success && result.path) {
            handleCustomIconChange(result.path);
            toast.success('Icon uploaded successfully');
          } else {
            toast.error('Failed to upload icon', {
              description: result.error || 'Please try again.',
            });
          }
        } catch (error) {
          toast.error('Failed to upload icon', {
            description: 'Network error. Please try again.',
          });
        } finally {
          setIsUploadingIcon(false);
        }
      };
      reader.onerror = () => {
        toast.error('Failed to read file', {
          description: 'Please try again with a different file.',
        });
        setIsUploadingIcon(false);
      };
      reader.readAsDataURL(file);
    } catch {
      toast.error('Failed to upload icon');
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
          <h2 className="text-lg font-semibold text-foreground tracking-tight">Project Identity</h2>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">
          Customize how your project appears in the sidebar and project switcher.
        </p>
      </div>
      <div className="p-6 space-y-6">
        {/* Project Name */}
        <div className="space-y-2">
          <Label htmlFor="project-name-settings">Project Name</Label>
          <Input
            id="project-name-settings"
            value={projectName}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="Enter project name"
          />
        </div>

        {/* Project Icon */}
        <div className="space-y-2">
          <Label>Project Icon</Label>
          <p className="text-xs text-muted-foreground mb-2">
            Choose a preset icon or upload a custom image
          </p>

          {/* Custom Icon Upload */}
          <div className="mb-4">
            <div className="flex items-center gap-3">
              {customIconPath ? (
                <div className="relative">
                  <img
                    src={getAuthenticatedImageUrl(customIconPath, project.path)}
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
                  {isUploadingIcon ? 'Uploading...' : 'Upload Custom Icon'}
                </Button>
                <p className="text-xs text-muted-foreground mt-1">
                  PNG, JPG, GIF or WebP. Max 2MB.
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
  );
}
