import React, { useState, useRef, useCallback } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { cn } from '@/lib/utils';

const logger = createLogger('ImageDropZone');
import { ImageIcon, X, Upload } from 'lucide-react';
import type { ImageAttachment } from '@/store/app-store';
import {
  fileToBase64,
  generateImageId,
  formatFileSize,
  validateImageFile,
  ACCEPTED_IMAGE_TYPES,
  DEFAULT_MAX_FILE_SIZE,
  DEFAULT_MAX_FILES,
} from '@/lib/image-utils';

interface ImageDropZoneProps {
  onImagesSelected: (images: ImageAttachment[]) => void;
  maxFiles?: number;
  maxFileSize?: number; // in bytes, default 10MB
  className?: string;
  children?: React.ReactNode;
  disabled?: boolean;
  images?: ImageAttachment[]; // Optional controlled images prop
}

export function ImageDropZone({
  onImagesSelected,
  maxFiles = DEFAULT_MAX_FILES,
  maxFileSize = DEFAULT_MAX_FILE_SIZE,
  className,
  children,
  disabled = false,
  images,
}: ImageDropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [internalImages, setInternalImages] = useState<ImageAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Use controlled images if provided, otherwise use internal state
  const selectedImages = images ?? internalImages;

  // Update images - for controlled mode, just call the callback; for uncontrolled, also update internal state
  const updateImages = useCallback(
    (newImages: ImageAttachment[]) => {
      if (images === undefined) {
        setInternalImages(newImages);
      }
      onImagesSelected(newImages);
    },
    [images, onImagesSelected]
  );

  const processFiles = useCallback(
    async (files: FileList) => {
      if (disabled || isProcessing) return;

      setIsProcessing(true);
      const newImages: ImageAttachment[] = [];
      const errors: string[] = [];

      for (const file of Array.from(files)) {
        // Validate file
        const validation = validateImageFile(file, maxFileSize);
        if (!validation.isValid) {
          errors.push(validation.error!);
          continue;
        }

        // Check if we've reached max files
        if (newImages.length + selectedImages.length >= maxFiles) {
          errors.push(`Maximum ${maxFiles} images allowed.`);
          break;
        }

        try {
          const base64 = await fileToBase64(file);
          const imageAttachment: ImageAttachment = {
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
        const allImages = [...selectedImages, ...newImages];
        updateImages(allImages);
      }

      setIsProcessing(false);
    },
    [disabled, isProcessing, maxFiles, maxFileSize, selectedImages, updateImages]
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
      const updated = selectedImages.filter((img) => img.id !== imageId);
      updateImages(updated);
    },
    [selectedImages, updateImages]
  );

  const clearAllImages = useCallback(() => {
    updateImages([]);
  }, [updateImages]);

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
      />

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn('relative rounded-lg border-2 border-dashed transition-all duration-200', {
          'border-blue-400 bg-blue-50 dark:bg-blue-950/20': isDragOver && !disabled,
          'border-muted-foreground/25': !isDragOver && !disabled,
          'border-muted-foreground/10 opacity-50 cursor-not-allowed': disabled,
          'hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/10':
            !disabled && !isDragOver,
        })}
      >
        {children || (
          <div className="flex flex-col items-center justify-center p-6 text-center">
            <div
              className={cn(
                'rounded-full p-3 mb-4',
                isDragOver && !disabled ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-muted'
              )}
            >
              {isProcessing ? (
                <Upload className="h-6 w-6 animate-spin text-muted-foreground" />
              ) : (
                <ImageIcon className="h-6 w-6 text-muted-foreground" />
              )}
            </div>
            <p className="text-sm font-medium text-foreground mb-1">
              {isDragOver && !disabled
                ? 'Drop your images here'
                : 'Drag images here or click to browse'}
            </p>
            <p className="text-xs text-muted-foreground">
              {maxFiles > 1 ? `Up to ${maxFiles} images` : '1 image'}, max{' '}
              {Math.round(maxFileSize / (1024 * 1024))}MB each
            </p>
            {!disabled && (
              <button
                onClick={handleBrowseClick}
                className="mt-2 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                disabled={isProcessing}
              >
                Browse files
              </button>
            )}
          </div>
        )}
      </div>

      {/* Image previews */}
      {selectedImages.length > 0 && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-foreground">
              {selectedImages.length} image{selectedImages.length > 1 ? 's' : ''} selected
            </p>
            <button
              onClick={clearAllImages}
              className="text-xs text-muted-foreground hover:text-foreground"
              disabled={disabled}
            >
              Clear all
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedImages.map((image) => (
              <div
                key={image.id}
                className="relative group rounded-md border border-muted bg-muted/50 p-2 flex items-center space-x-2"
              >
                {/* Image thumbnail */}
                <div className="w-8 h-8 rounded overflow-hidden bg-muted shrink-0">
                  <img
                    src={image.data}
                    alt={image.filename}
                    className="w-full h-full object-cover"
                  />
                </div>
                {/* Image info */}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground truncate">{image.filename}</p>
                  {image.size !== undefined && (
                    <p className="text-xs text-muted-foreground">{formatFileSize(image.size)}</p>
                  )}
                </div>
                {/* Remove button */}
                {!disabled && image.id && (
                  <button
                    onClick={() => removeImage(image.id!)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-full hover:bg-destructive hover:text-destructive-foreground text-muted-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
