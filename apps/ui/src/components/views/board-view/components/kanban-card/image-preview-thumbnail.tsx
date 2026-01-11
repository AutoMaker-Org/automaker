// @ts-nocheck
import React, { useState, useCallback, useMemo } from 'react';
import { Image as ImageIcon, Images } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getAuthenticatedImageUrl } from '@/lib/api-fetch';
import { useAppStore, type FeatureImagePath } from '@/store/app-store';

interface ImagePreviewThumbnailProps {
  imagePaths: FeatureImagePath[];
  featureId: string;
  onImageClick: (index: number) => void;
  className?: string;
}

export function ImagePreviewThumbnail({
  imagePaths,
  featureId,
  onImageClick,
  className,
}: ImagePreviewThumbnailProps) {
  const currentProject = useAppStore((s) => s.currentProject);
  const [imageError, setImageError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const imageCount = imagePaths.length;
  const firstImage = imagePaths[0];
  const additionalCount = imageCount - 1;

  const imageUrl = useMemo(() => {
    if (!firstImage || !currentProject?.path) return null;
    return getAuthenticatedImageUrl(firstImage.path, currentProject.path);
  }, [firstImage, currentProject?.path]);

  const handleImageLoad = useCallback(() => {
    setIsLoading(false);
    setImageError(false);
  }, []);

  const handleImageError = useCallback(() => {
    setIsLoading(false);
    setImageError(true);
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      onImageClick(0);
    },
    [onImageClick]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.stopPropagation();
        e.preventDefault();
        onImageClick(0);
      }
    },
    [onImageClick]
  );

  if (!imageUrl || imageCount === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        'relative group cursor-pointer',
        'w-full aspect-[16/9] max-h-[100px] rounded-lg overflow-hidden',
        'bg-muted/50 border border-border/50',
        'hover:border-border hover:shadow-sm transition-all duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        className
      )}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onPointerDown={(e) => e.stopPropagation()}
      role="button"
      tabIndex={0}
      aria-label={`View ${imageCount} attached image${imageCount > 1 ? 's' : ''}`}
      data-testid={`image-thumbnail-${featureId}`}
    >
      {/* Loading state */}
      {isLoading && !imageError && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/80">
          <ImageIcon className="w-5 h-5 text-muted-foreground animate-pulse" />
        </div>
      )}

      {/* Error state */}
      {imageError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/80 gap-1">
          <ImageIcon className="w-5 h-5 text-muted-foreground/60" />
          <span className="text-[10px] text-muted-foreground/60">Failed to load</span>
        </div>
      )}

      {/* Thumbnail image */}
      {!imageError && (
        <img
          src={imageUrl}
          alt={firstImage.filename || 'Feature image'}
          className={cn(
            'w-full h-full object-cover',
            'transition-transform duration-200 group-hover:scale-105',
            isLoading && 'opacity-0'
          )}
          onLoad={handleImageLoad}
          onError={handleImageError}
          loading="lazy"
          decoding="async"
        />
      )}

      {/* Multiple images indicator */}
      {additionalCount > 0 && !imageError && (
        <div
          className={cn(
            'absolute bottom-1.5 right-1.5',
            'flex items-center gap-1 px-1.5 py-0.5',
            'bg-black/70 backdrop-blur-sm rounded-md',
            'text-[10px] font-medium text-white'
          )}
        >
          <Images className="w-3 h-3" />
          <span>+{additionalCount}</span>
        </div>
      )}

      {/* Hover overlay */}
      <div
        className={cn(
          'absolute inset-0 bg-black/0 group-hover:bg-black/10',
          'transition-colors duration-200',
          'flex items-center justify-center'
        )}
      >
        <span
          className={cn(
            'opacity-0 group-hover:opacity-100',
            'text-white text-xs font-medium',
            'bg-black/50 px-2 py-1 rounded-md backdrop-blur-sm',
            'transition-opacity duration-200'
          )}
        >
          Click to view
        </span>
      </div>
    </div>
  );
}
