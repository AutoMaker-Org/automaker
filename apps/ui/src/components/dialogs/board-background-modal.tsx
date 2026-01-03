import { useState, useRef, useCallback, useEffect } from 'react';
import { ImageIcon, Upload, Loader2, Trash2 } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { useAppStore, defaultBackgroundSettings } from '@/store/app-store';
import { getHttpApiClient, getServerUrlSync } from '@/lib/http-api-client';
import { useBoardBackgroundSettings } from '@/hooks/use-board-background-settings';
import { toast } from 'sonner';
import {
  fileToBase64,
  validateImageFile,
  ACCEPTED_IMAGE_TYPES,
  DEFAULT_MAX_FILE_SIZE,
} from '@/lib/image-utils';

interface BoardBackgroundModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BoardBackgroundModal({ open, onOpenChange }: BoardBackgroundModalProps) {
  const { currentProject, boardBackgroundByProject } = useAppStore();
  const {
    setBoardBackground,
    setCardOpacity,
    setColumnOpacity,
    setColumnBorderEnabled,
    setCardGlassmorphism,
    setCardBorderEnabled,
    setCardBorderOpacity,
    setHideScrollbar,
    clearBoardBackground,
  } = useBoardBackgroundSettings();
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Get current background settings (live from store)
  const backgroundSettings =
    (currentProject && boardBackgroundByProject[currentProject.path]) || defaultBackgroundSettings;

  const cardOpacity = backgroundSettings.cardOpacity;
  const columnOpacity = backgroundSettings.columnOpacity;
  const columnBorderEnabled = backgroundSettings.columnBorderEnabled;
  const cardGlassmorphism = backgroundSettings.cardGlassmorphism;
  const cardBorderEnabled = backgroundSettings.cardBorderEnabled;
  const cardBorderOpacity = backgroundSettings.cardBorderOpacity;
  const hideScrollbar = backgroundSettings.hideScrollbar;
  const imageVersion = backgroundSettings.imageVersion;

  // Update preview image when background settings change
  useEffect(() => {
    if (currentProject && backgroundSettings.imagePath) {
      const serverUrl = import.meta.env.VITE_SERVER_URL || getServerUrlSync();
      // Add cache-busting query parameter to force browser to reload image
      const cacheBuster = imageVersion ? `&v=${imageVersion}` : `&v=${Date.now()}`;
      const imagePath = `${serverUrl}/api/fs/image?path=${encodeURIComponent(
        backgroundSettings.imagePath
      )}&projectPath=${encodeURIComponent(currentProject.path)}${cacheBuster}`;
      setPreviewImage(imagePath);
    } else {
      setPreviewImage(null);
    }
  }, [currentProject, backgroundSettings.imagePath, imageVersion]);

  const processFile = useCallback(
    async (file: File) => {
      if (!currentProject) {
        toast.error('No project selected');
        return;
      }

      // Validate file
      const validation = validateImageFile(file, DEFAULT_MAX_FILE_SIZE);
      if (!validation.isValid) {
        toast.error(validation.error);
        return;
      }

      setIsProcessing(true);
      try {
        const base64 = await fileToBase64(file);

        // Set preview immediately
        setPreviewImage(base64);

        // Save to server
        const httpClient = getHttpApiClient();
        const result = await httpClient.saveBoardBackground(
          base64,
          file.name,
          file.type,
          currentProject.path
        );

        if (result.success && result.path) {
          // Update store and persist to server
          await setBoardBackground(currentProject.path, result.path);
          toast.success('Background image saved');
        } else {
          toast.error(result.error || 'Failed to save background image');
          setPreviewImage(null);
        }
      } catch (error) {
        console.error('Failed to process image:', error);
        toast.error('Failed to process image');
        setPreviewImage(null);
      } finally {
        setIsProcessing(false);
      }
    },
    [currentProject, setBoardBackground]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        processFile(files[0]);
      }
    },
    [processFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        processFile(files[0]);
      }
      // Reset the input so the same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [processFile]
  );

  const handleBrowseClick = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, []);

  const handleClear = useCallback(async () => {
    if (!currentProject) return;

    try {
      setIsProcessing(true);
      const httpClient = getHttpApiClient();
      const result = await httpClient.deleteBoardBackground(currentProject.path);

      if (result.success) {
        await clearBoardBackground(currentProject.path);
        setPreviewImage(null);
        toast.success('Background image cleared');
      } else {
        toast.error(result.error || 'Failed to clear background image');
      }
    } catch (error) {
      console.error('Failed to clear background:', error);
      toast.error('Failed to clear background');
    } finally {
      setIsProcessing(false);
    }
  }, [currentProject, clearBoardBackground]);

  // Live update opacity when sliders change (with persistence)
  const handleCardOpacityChange = useCallback(
    async (value: number[]) => {
      if (!currentProject) return;
      await setCardOpacity(currentProject.path, value[0]);
    },
    [currentProject, setCardOpacity]
  );

  const handleColumnOpacityChange = useCallback(
    async (value: number[]) => {
      if (!currentProject) return;
      await setColumnOpacity(currentProject.path, value[0]);
    },
    [currentProject, setColumnOpacity]
  );

  const handleColumnBorderToggle = useCallback(
    async (checked: boolean) => {
      if (!currentProject) return;
      await setColumnBorderEnabled(currentProject.path, checked);
    },
    [currentProject, setColumnBorderEnabled]
  );

  const handleCardGlassmorphismToggle = useCallback(
    async (checked: boolean) => {
      if (!currentProject) return;
      await setCardGlassmorphism(currentProject.path, checked);
    },
    [currentProject, setCardGlassmorphism]
  );

  const handleCardBorderToggle = useCallback(
    async (checked: boolean) => {
      if (!currentProject) return;
      await setCardBorderEnabled(currentProject.path, checked);
    },
    [currentProject, setCardBorderEnabled]
  );

  const handleCardBorderOpacityChange = useCallback(
    async (value: number[]) => {
      if (!currentProject) return;
      await setCardBorderOpacity(currentProject.path, value[0]);
    },
    [currentProject, setCardBorderOpacity]
  );

  const handleHideScrollbarToggle = useCallback(
    async (checked: boolean) => {
      if (!currentProject) return;
      await setHideScrollbar(currentProject.path, checked);
    },
    [currentProject, setHideScrollbar]
  );

  if (!currentProject) {
    return null;
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="px-6 pt-6">
          <SheetTitle className="flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-brand-500" />
            Board Background Settings
          </SheetTitle>
          <SheetDescription className="text-muted-foreground">
            Set a custom background image for your kanban board and adjust card/column opacity
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 px-6 pb-6">
          {/* Image Upload Section */}
          <div className="space-y-3">
            <Label>Background Image</Label>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_IMAGE_TYPES.join(',')}
              onChange={handleFileSelect}
              className="hidden"
              disabled={isProcessing}
            />

            {/* Drop zone */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={cn(
                'relative rounded-lg border-2 border-dashed transition-all duration-200',
                {
                  'border-brand-500/60 bg-brand-500/5 dark:bg-brand-500/10':
                    isDragOver && !isProcessing,
                  'border-muted-foreground/25': !isDragOver && !isProcessing,
                  'border-muted-foreground/10 opacity-50 cursor-not-allowed': isProcessing,
                  'hover:border-brand-500/40 hover:bg-brand-500/5 dark:hover:bg-brand-500/5':
                    !isProcessing && !isDragOver,
                }
              )}
            >
              {previewImage ? (
                <div className="relative p-4">
                  <div className="relative w-full h-48 rounded-md overflow-hidden border border-border bg-muted">
                    <img
                      src={previewImage}
                      alt="Background preview"
                      className="w-full h-full object-cover"
                    />
                    {isProcessing && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/80">
                        <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleBrowseClick}
                      disabled={isProcessing}
                      className="flex-1"
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      Change Image
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleClear}
                      disabled={isProcessing}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Clear
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={handleBrowseClick}
                  className="flex flex-col items-center justify-center p-8 text-center cursor-pointer"
                >
                  <div
                    className={cn(
                      'rounded-full p-3 mb-3',
                      isDragOver && !isProcessing
                        ? 'bg-brand-500/10 dark:bg-brand-500/20'
                        : 'bg-muted'
                    )}
                  >
                    {isProcessing ? (
                      <Upload className="h-6 w-6 animate-spin text-muted-foreground" />
                    ) : (
                      <ImageIcon className="h-6 w-6 text-muted-foreground" />
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {isDragOver && !isProcessing
                      ? 'Drop image here'
                      : 'Click to upload or drag and drop'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    JPG, PNG, GIF, or WebP (max {Math.round(DEFAULT_MAX_FILE_SIZE / (1024 * 1024))}
                    MB)
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Opacity Controls */}
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Card Opacity</Label>
                <span className="text-sm text-muted-foreground">{cardOpacity}%</span>
              </div>
              <Slider
                value={[cardOpacity]}
                onValueChange={handleCardOpacityChange}
                min={0}
                max={100}
                step={1}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Column Opacity</Label>
                <span className="text-sm text-muted-foreground">{columnOpacity}%</span>
              </div>
              <Slider
                value={[columnOpacity]}
                onValueChange={handleColumnOpacityChange}
                min={0}
                max={100}
                step={1}
                className="w-full"
              />
            </div>

            {/* Column Border Toggle */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="column-border-toggle"
                checked={columnBorderEnabled}
                onCheckedChange={handleColumnBorderToggle}
              />
              <Label htmlFor="column-border-toggle" className="cursor-pointer">
                Show Column Borders
              </Label>
            </div>

            {/* Card Glassmorphism Toggle */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="card-glassmorphism-toggle"
                checked={cardGlassmorphism}
                onCheckedChange={handleCardGlassmorphismToggle}
              />
              <Label htmlFor="card-glassmorphism-toggle" className="cursor-pointer">
                Card Glassmorphism (blur effect)
              </Label>
            </div>

            {/* Card Border Toggle */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="card-border-toggle"
                checked={cardBorderEnabled}
                onCheckedChange={handleCardBorderToggle}
              />
              <Label htmlFor="card-border-toggle" className="cursor-pointer">
                Show Card Borders
              </Label>
            </div>

            {/* Card Border Opacity - only show when border is enabled */}
            {cardBorderEnabled && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Card Border Opacity</Label>
                  <span className="text-sm text-muted-foreground">{cardBorderOpacity}%</span>
                </div>
                <Slider
                  value={[cardBorderOpacity]}
                  onValueChange={handleCardBorderOpacityChange}
                  min={0}
                  max={100}
                  step={1}
                  className="w-full"
                />
              </div>
            )}

            {/* Hide Scrollbar Toggle */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="hide-scrollbar-toggle"
                checked={hideScrollbar}
                onCheckedChange={handleHideScrollbarToggle}
              />
              <Label htmlFor="hide-scrollbar-toggle" className="cursor-pointer">
                Hide Board Scrollbar
              </Label>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
