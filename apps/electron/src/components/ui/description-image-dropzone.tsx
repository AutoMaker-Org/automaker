"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { ImageIcon, X, Loader2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useAppStore } from "@/store/app-store";
import { services, isBootstrapped } from "@/services";

export interface FeatureImagePath {
  id: string;
  path: string; // Path to the temp file
  filename: string;
  mimeType: string;
}

// Map to store preview data by image ID (persisted across component re-mounts)
export type ImagePreviewMap = Map<string, string>;

interface DescriptionImageDropZoneProps {
  value: string;
  onChange: (value: string) => void;
  images: FeatureImagePath[];
  onImagesChange: (images: FeatureImagePath[]) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  maxFiles?: number;
  maxFileSize?: number; // in bytes, default 10MB
  // Optional: pass preview map from parent to persist across tab switches
  previewMap?: ImagePreviewMap;
  onPreviewMapChange?: (map: ImagePreviewMap) => void;
  autoFocus?: boolean;
  error?: boolean; // Show error state with red border
}

const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
];
const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function DescriptionImageDropZone({
  value,
  onChange,
  images,
  onImagesChange,
  placeholder = "Describe the feature...",
  className,
  disabled = false,
  maxFiles = 5,
  maxFileSize = DEFAULT_MAX_FILE_SIZE,
  previewMap,
  onPreviewMapChange,
  autoFocus = false,
  error = false,
}: DescriptionImageDropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  // Use parent-provided preview map if available, otherwise use local state
  const [localPreviewImages, setLocalPreviewImages] = useState<Map<string, string>>(
    () => new Map()
  );

  // Determine which preview map to use - prefer parent-controlled state
  const previewImages = previewMap !== undefined ? previewMap : localPreviewImages;
  const setPreviewImages = useCallback((updater: Map<string, string> | ((prev: Map<string, string>) => Map<string, string>)) => {
    if (onPreviewMapChange) {
      const currentMap = previewMap !== undefined ? previewMap : localPreviewImages;
      const newMap = typeof updater === 'function' ? updater(currentMap) : updater;
      onPreviewMapChange(newMap);
    } else {
      setLocalPreviewImages((prev) => {
        const newMap = typeof updater === 'function' ? updater(prev) : updater;
        return newMap;
      });
    }
  }, [onPreviewMapChange, previewMap, localPreviewImages]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentProject = useAppStore((state) => state.currentProject);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
        } else {
          reject(new Error("Failed to read file as base64"));
        }
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  };

  const saveImageToTemp = async (
    base64Data: string,
    filename: string,
    mimeType: string
  ): Promise<string | null> => {
    try {
      if (!isBootstrapped()) {
        // Fallback for services not ready - return a mock path in .automaker/images
        console.log("[DescriptionImageDropZone] Services not ready, using mock path for image");
        return `.automaker/images/${Date.now()}_${filename}`;
      }

      // Get projectPath from the store if available
      const projectPath = currentProject?.path;
      const result = await services.app.saveImageToTemp(base64Data, filename, mimeType, projectPath);
      if (result.success && result.data?.path) {
        return result.data.path;
      }
      console.error("[DescriptionImageDropZone] Failed to save image:", result.error);
      return null;
    } catch (error) {
      console.error("[DescriptionImageDropZone] Error saving image:", error);
      return null;
    }
  };

  const processFiles = useCallback(
    async (files: FileList) => {
      if (disabled || isProcessing) return;

      setIsProcessing(true);
      const newImages: FeatureImagePath[] = [];
      const newPreviews = new Map(previewImages);
      const errors: string[] = [];

      for (const file of Array.from(files)) {
        // Validate file type
        if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
          errors.push(
            `${file.name}: Unsupported file type. Please use JPG, PNG, GIF, or WebP.`
          );
          continue;
        }

        // Validate file size
        if (file.size > maxFileSize) {
          const maxSizeMB = maxFileSize / (1024 * 1024);
          errors.push(
            `${file.name}: File too large. Maximum size is ${maxSizeMB}MB.`
          );
          continue;
        }

        // Check if we've reached max files
        if (newImages.length + images.length >= maxFiles) {
          errors.push(`Maximum ${maxFiles} images allowed.`);
          break;
        }

        try {
          const base64 = await fileToBase64(file);
          const tempPath = await saveImageToTemp(base64, file.name, file.type);

          if (tempPath) {
            const imageId = `img-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
            const imagePathRef: FeatureImagePath = {
              id: imageId,
              path: tempPath,
              filename: file.name,
              mimeType: file.type,
            };
            newImages.push(imagePathRef);
            // Store preview for display
            newPreviews.set(imageId, base64);
          } else {
            errors.push(`${file.name}: Failed to save image.`);
          }
        } catch (error) {
          errors.push(`${file.name}: Failed to process image.`);
        }
      }

      if (errors.length > 0) {
        console.warn("Image upload errors:", errors);
      }

      if (newImages.length > 0) {
        onImagesChange([...images, ...newImages]);
        setPreviewImages(newPreviews);
      }

      setIsProcessing(false);
    },
    [disabled, isProcessing, images, maxFiles, maxFileSize, onImagesChange, previewImages]
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
        fileInputRef.current.value = "";
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
      setPreviewImages((prev) => {
        const newMap = new Map(prev);
        newMap.delete(imageId);
        return newMap;
      });
    },
    [images, onImagesChange]
  );

  return (
    <div className={cn("relative", className)}>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled}
        data-testid="description-image-input"
      />

      {/* Drop zone wrapper */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          "relative rounded-md transition-all duration-200",
          {
            "ring-2 ring-blue-400 ring-offset-2 ring-offset-background":
              isDragOver && !disabled,
          }
        )}
      >
        {/* Drag overlay */}
        {isDragOver && !disabled && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center rounded-md bg-blue-500/20 border-2 border-dashed border-blue-400 pointer-events-none"
            data-testid="drop-overlay"
          >
            <div className="flex flex-col items-center gap-2 text-blue-400">
              <ImageIcon className="w-8 h-8" />
              <span className="text-sm font-medium">Drop images here</span>
            </div>
          </div>
        )}

        {/* Textarea */}
        <Textarea
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          autoFocus={autoFocus}
          aria-invalid={error}
          className={cn(
            "min-h-[120px]",
            isProcessing && "opacity-50 pointer-events-none"
          )}
          data-testid="feature-description-input"
        />
      </div>

      {/* Hint text */}
      <p className="text-xs text-muted-foreground mt-1">
        Drag and drop images here or{" "}
        <button
          type="button"
          onClick={handleBrowseClick}
          className="text-primary hover:text-primary/80 underline"
          disabled={disabled || isProcessing}
        >
          browse
        </button>{" "}
        to attach context images
      </p>

      {/* Processing indicator */}
      {isProcessing && (
        <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Saving images...</span>
        </div>
      )}

      {/* Image previews */}
      {images.length > 0 && (
        <div className="mt-3 space-y-2" data-testid="description-image-previews">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-foreground">
              {images.length} image{images.length > 1 ? "s" : ""} attached
            </p>
            <button
              type="button"
              onClick={() => {
                onImagesChange([]);
                setPreviewImages(new Map());
              }}
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
                data-testid={`description-image-preview-${image.id}`}
              >
                {/* Image thumbnail or placeholder */}
                <div className="w-16 h-16 flex items-center justify-center bg-zinc-800">
                  {previewImages.has(image.id) ? (
                    <img
                      src={previewImages.get(image.id)}
                      alt={image.filename}
                      className="max-w-full max-h-full object-contain"
                    />
                  ) : (
                    <ImageIcon className="w-6 h-6 text-muted-foreground" />
                  )}
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
                    data-testid={`remove-description-image-${image.id}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
                {/* Filename tooltip on hover */}
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <p className="text-[10px] text-white truncate">
                    {image.filename}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
