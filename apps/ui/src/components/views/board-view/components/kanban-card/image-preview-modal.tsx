// @ts-nocheck
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Download,
  Image as ImageIcon,
} from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getAuthenticatedImageUrl } from '@/lib/api-fetch';
import { useAppStore, type FeatureImagePath } from '@/store/app-store';

interface ImagePreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imagePaths: FeatureImagePath[];
  initialIndex?: number;
  featureTitle?: string;
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

export function ImagePreviewModal({
  open,
  onOpenChange,
  imagePaths,
  initialIndex = 0,
  featureTitle,
}: ImagePreviewModalProps) {
  const currentProject = useAppStore((s) => s.currentProject);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const positionStartRef = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const imageCount = imagePaths.length;
  const currentImage = imagePaths[currentIndex];
  const hasMultipleImages = imageCount > 1;

  const imageUrl = useMemo(() => {
    if (!currentImage || !currentProject?.path) return null;
    return getAuthenticatedImageUrl(currentImage.path, currentProject.path);
  }, [currentImage, currentProject?.path]);

  // Reset state when opening modal or changing image
  useEffect(() => {
    if (open) {
      setCurrentIndex(initialIndex);
      setZoom(1);
      setPosition({ x: 0, y: 0 });
      setIsLoading(true);
      setImageError(false);
    }
  }, [open, initialIndex]);

  // Reset position when changing images
  useEffect(() => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
    setIsLoading(true);
    setImageError(false);
  }, [currentIndex]);

  const handlePrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : imageCount - 1));
  }, [imageCount]);

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => (prev < imageCount - 1 ? prev + 1 : 0));
  }, [imageCount]);

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev + ZOOM_STEP, MAX_ZOOM));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(prev - ZOOM_STEP, MIN_ZOOM));
  }, []);

  const handleResetZoom = useCallback(() => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  const handleDownload = useCallback(async () => {
    if (!imageUrl || !currentImage) return;

    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = currentImage.filename || 'image';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download image:', error);
    }
  }, [imageUrl, currentImage]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          if (hasMultipleImages) handlePrevious();
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (hasMultipleImages) handleNext();
          break;
        case 'Escape':
          e.preventDefault();
          onOpenChange(false);
          break;
        case '+':
        case '=':
          e.preventDefault();
          handleZoomIn();
          break;
        case '-':
          e.preventDefault();
          handleZoomOut();
          break;
        case '0':
          e.preventDefault();
          handleResetZoom();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    open,
    hasMultipleImages,
    handlePrevious,
    handleNext,
    handleZoomIn,
    handleZoomOut,
    handleResetZoom,
    onOpenChange,
  ]);

  // Mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    setZoom((prev) => Math.min(Math.max(prev + delta, MIN_ZOOM), MAX_ZOOM));
  }, []);

  // Pan/drag functionality
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (zoom <= 1) return;
      e.preventDefault();
      setIsDragging(true);
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      positionStartRef.current = { ...position };
    },
    [zoom, position]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      const deltaX = e.clientX - dragStartRef.current.x;
      const deltaY = e.clientY - dragStartRef.current.y;
      setPosition({
        x: positionStartRef.current.x + deltaX,
        y: positionStartRef.current.y + deltaY,
      });
    },
    [isDragging]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleImageLoad = useCallback(() => {
    setIsLoading(false);
    setImageError(false);
  }, []);

  const handleImageError = useCallback(() => {
    setIsLoading(false);
    setImageError(true);
  }, []);

  if (imageCount === 0) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[95vw] max-h-[95vh] w-full h-full p-0 bg-black/95 border-none gap-0"
        showCloseButton={false}
      >
        {/* Hidden title for accessibility */}
        <DialogTitle className="sr-only">
          {featureTitle ? `Images for ${featureTitle}` : 'Image Preview'}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Image {currentIndex + 1} of {imageCount}
          {currentImage?.filename && `: ${currentImage.filename}`}
        </DialogDescription>

        {/* Header with controls */}
        <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
          {/* Image counter */}
          <div className="flex items-center gap-2 text-white/90">
            <span className="text-sm font-medium">
              {currentIndex + 1} / {imageCount}
            </span>
            {currentImage?.filename && (
              <span className="text-sm text-white/60 truncate max-w-[200px]">
                {currentImage.filename}
              </span>
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="text-white/80 hover:text-white hover:bg-white/10 h-8 w-8"
              onClick={handleZoomOut}
              disabled={zoom <= MIN_ZOOM}
              aria-label="Zoom out"
            >
              <ZoomOut className="w-4 h-4" />
            </Button>
            <span className="text-white/80 text-xs min-w-[40px] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="text-white/80 hover:text-white hover:bg-white/10 h-8 w-8"
              onClick={handleZoomIn}
              disabled={zoom >= MAX_ZOOM}
              aria-label="Zoom in"
            >
              <ZoomIn className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-white/80 hover:text-white hover:bg-white/10 h-8 w-8"
              onClick={handleResetZoom}
              aria-label="Reset zoom"
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
            <div className="w-px h-4 bg-white/20 mx-1" />
            <Button
              variant="ghost"
              size="icon"
              className="text-white/80 hover:text-white hover:bg-white/10 h-8 w-8"
              onClick={handleDownload}
              aria-label="Download image"
            >
              <Download className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-white/80 hover:text-white hover:bg-white/10 h-8 w-8"
              onClick={() => onOpenChange(false)}
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Navigation buttons */}
        {hasMultipleImages && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'absolute left-4 top-1/2 -translate-y-1/2 z-10',
                'w-10 h-10 rounded-full',
                'bg-black/50 hover:bg-black/70 text-white/80 hover:text-white',
                'transition-all duration-200'
              )}
              onClick={handlePrevious}
              aria-label="Previous image"
            >
              <ChevronLeft className="w-6 h-6" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'absolute right-4 top-1/2 -translate-y-1/2 z-10',
                'w-10 h-10 rounded-full',
                'bg-black/50 hover:bg-black/70 text-white/80 hover:text-white',
                'transition-all duration-200'
              )}
              onClick={handleNext}
              aria-label="Next image"
            >
              <ChevronRight className="w-6 h-6" />
            </Button>
          </>
        )}

        {/* Image container */}
        <div
          ref={containerRef}
          className={cn(
            'flex-1 flex items-center justify-center overflow-hidden',
            'select-none',
            zoom > 1 ? 'cursor-grab' : 'cursor-default',
            isDragging && 'cursor-grabbing'
          )}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* Loading state */}
          {isLoading && !imageError && (
            <div className="absolute inset-0 flex items-center justify-center">
              <ImageIcon className="w-12 h-12 text-white/40 animate-pulse" />
            </div>
          )}

          {/* Error state */}
          {imageError && (
            <div className="flex flex-col items-center justify-center gap-2 text-white/60">
              <ImageIcon className="w-12 h-12" />
              <span>Failed to load image</span>
            </div>
          )}

          {/* Image */}
          {imageUrl && !imageError && (
            <img
              src={imageUrl}
              alt={currentImage?.filename || 'Feature image'}
              className={cn(
                'max-w-full max-h-full object-contain transition-opacity duration-200',
                isLoading && 'opacity-0'
              )}
              style={{
                transform: `scale(${zoom}) translate(${position.x / zoom}px, ${position.y / zoom}px)`,
                transformOrigin: 'center center',
              }}
              onLoad={handleImageLoad}
              onError={handleImageError}
              draggable={false}
            />
          )}
        </div>

        {/* Thumbnail strip for multiple images */}
        {hasMultipleImages && (
          <div className="absolute bottom-0 left-0 right-0 z-10 p-4 bg-gradient-to-t from-black/80 to-transparent">
            <div className="flex items-center justify-center gap-2 overflow-x-auto py-2">
              {imagePaths.map((img, index) => {
                const thumbUrl = currentProject?.path
                  ? getAuthenticatedImageUrl(img.path, currentProject.path)
                  : null;

                return (
                  <button
                    key={img.id}
                    className={cn(
                      'w-14 h-14 rounded-md overflow-hidden flex-shrink-0',
                      'border-2 transition-all duration-200',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-white',
                      index === currentIndex
                        ? 'border-white opacity-100'
                        : 'border-transparent opacity-60 hover:opacity-100'
                    )}
                    onClick={() => setCurrentIndex(index)}
                    aria-label={`View image ${index + 1}`}
                    aria-current={index === currentIndex}
                  >
                    {thumbUrl ? (
                      <img
                        src={thumbUrl}
                        alt={img.filename || `Image ${index + 1}`}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full bg-white/10 flex items-center justify-center">
                        <ImageIcon className="w-4 h-4 text-white/40" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Keyboard shortcuts hint */}
        <div className="absolute bottom-4 right-4 z-10 text-white/40 text-xs hidden md:block">
          <span className="bg-black/50 px-2 py-1 rounded">
            Use arrow keys to navigate, +/- to zoom
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
