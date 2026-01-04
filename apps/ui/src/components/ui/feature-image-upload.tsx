import React, { useState, useRef, useCallback } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { cn } from '@/lib/utils';

const logger = createLogger('FeatureImageUpload');
import { ImageIcon, X, Upload } from 'lucide-react';
import {
  fileToBase64,
  generateImageId,
  ACCEPTED_IMAGE_TYPES,
  DEFAULT_MAX_FILE_SIZE,
  DEFAULT_MAX_FILES,
  validateImageFile,
} from '@/lib/image-utils';

export interface FeatureImage {
  id: string;
  data: string; // base64 encoded
  mimeType: string;
  filename: string;
  size: number;
}

interface FeatureImageUploadProps {
  images: FeatureImage[];
  onImagesChange: (images: FeatureImage[]) => void;
  maxFiles?: number;
  maxFileSize?: number; // in bytes, default 10MB
  className?: string;
  disabled?: boolean;
}

export function FeatureImageUpload({
  images,
  onImagesChange,
  maxFiles = DEFAULT_MAX_FILES,
  maxFileSize = DEFAULT_MAX_FILE_SIZE,
  className,
  disabled = false,
}: FeatureImageUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFiles = useCallback(
    async (files: FileList) => {
      if (disabled || isProcessing) return;

      setIsProcessing(true);
      const newImages: FeatureImage[] = [];
      const errors: string[] = [];

      for (const file of Array.from(files)) {
        // Validate file
        const validation = validateImageFile(file, maxFileSize);
        if (!validation.isValid) {
          errors.push(validation.error!);
          continue;
        }

        // Check if we've reached max files
        if (newImages.length + images.length >= maxFiles) {
          errors.push(`Maximum ${maxFiles} images allowed.`);
          break;
        }

        try {
          const base64 = await fileToBase64(file);
          const imageAttachment: FeatureImage = {
            id: generateImageId(),
            data: base64,
            mimeType: file.type,
            filename: file.name,
            size: file.size,
          };
          newImages.push(imageAttachment);
        } catch {
          errors.push(`${file.name}: Failed to process image.`);
        }
      }

      if (errors.length > 0) {
        logger.warn('Image upload errors:', errors);
      }

      if (newImages.length > 0) {
        onImagesChange([...images, ...newImages]);
      }

      setIsProcessing(false);
    },
    [disabled, isProcessing, images, maxFiles, maxFileSize, onImagesChange]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      if (disabled) return;

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        processFiles(files);
      }
    },
    [disabled, processFiles]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled) {
        setIsDragOver(true);
      }
    },
    [disabled]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        processFiles(files);
      }
      // Reset the input so the same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [processFiles]
  );

  const handleBrowseClick = useCallback(() => {
    if (!disabled && fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, [disabled]);

  const removeImage = useCallback(
    (imageId: string) => {
      onImagesChange(images.filter((img) => img.id !== imageId));
    },
    [images, onImagesChange]
  );

  const clearAllImages = useCallback(() => {
    onImagesChange([]);
  }, [onImagesChange]);

  return (
    <div className={cn('relative', className)}>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ACCEPTED_IMAGE_TYPES.join(',')}
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled}
        data-testid="feature-image-input"
      />

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleBrowseClick}
        className={cn(
          'relative rounded-lg border-2 border-dashed transition-all duration-200 cursor-pointer',
          {
            'border-blue-400 bg-blue-50 dark:bg-blue-950/20': isDragOver && !disabled,
            'border-muted-foreground/25': !isDragOver && !disabled,
            'border-muted-foreground/10 opacity-50 cursor-not-allowed': disabled,
            'hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/10':
              !disabled && !isDragOver,
          }
        )}
        data-testid="feature-image-dropzone"
      >
        <div className="flex flex-col items-center justify-center p-4 text-center">
          <div
            className={cn(
              'rounded-full p-2 mb-2',
              isDragOver && !disabled ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-muted'
            )}
          >
            {isProcessing ? (
              <Upload className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <ImageIcon className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {isDragOver && !disabled ? 'Drop images here' : 'Click or drag images here'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Up to {maxFiles} images, max {Math.round(maxFileSize / (1024 * 1024))}MB each
          </p>
        </div>
      </div>

      {/* Image previews */}
      {images.length > 0 && (
        <div className="mt-3 space-y-2" data-testid="feature-image-previews">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-foreground">
              {images.length} image{images.length > 1 ? 's' : ''} selected
            </p>
            <button
              type="button"
              onClick={clearAllImages}
              className="text-xs text-muted-foreground hover:text-foreground"
              disabled={disabled}
            >
              Clear all
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {images.map((image) => (
              <div
                key={image.id}
                className="relative group rounded-md border border-muted bg-muted/50 overflow-hidden"
                data-testid={`feature-image-preview-${image.id}`}
              >
                {/* Image thumbnail */}
                <div className="w-16 h-16 flex items-center justify-center">
                  <img
                    src={image.data}
                    alt={image.filename}
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
                {/* Remove button */}
                {!disabled && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeImage(image.id);
                    }}
                    className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                    data-testid={`remove-image-${image.id}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
                {/* Filename tooltip on hover */}
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <p className="text-[10px] text-white truncate">{image.filename}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
