'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ArrowDown, ArrowUp, Link2, X } from 'lucide-react';
import type { Feature } from '@/store/app-store';
import { cn } from '@/lib/utils';

export type DependencyLinkType = 'parent' | 'child';

interface DependencyLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draggedFeature: Feature | null;
  targetFeature: Feature | null;
  onLink: (linkType: DependencyLinkType) => void;
}

export function DependencyLinkDialog({
  open,
  onOpenChange,
  draggedFeature,
  targetFeature,
  onLink,
}: DependencyLinkDialogProps) {
  if (!draggedFeature || !targetFeature) return null;

  // Check if a dependency relationship already exists
  const draggedDependsOnTarget =
    Array.isArray(draggedFeature.dependencies) &&
    draggedFeature.dependencies.includes(targetFeature.id);
  const targetDependsOnDragged =
    Array.isArray(targetFeature.dependencies) &&
    targetFeature.dependencies.includes(draggedFeature.id);
  const existingLink = draggedDependsOnTarget || targetDependsOnDragged;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dependency-link-dialog" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="w-5 h-5" />
            Link Features
          </DialogTitle>
          <DialogDescription>
            Create a dependency relationship between these features.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {/* Dragged feature */}
          <div className="p-3 rounded-lg border bg-muted/30">
            <div className="text-xs text-muted-foreground mb-1">Dragged Feature</div>
            <div className="text-sm font-medium line-clamp-3 break-words">
              {draggedFeature.description}
            </div>
            <div className="text-xs text-muted-foreground/70 mt-1">{draggedFeature.category}</div>
          </div>

          {/* Arrow indicating direction */}
          <div className="flex justify-center">
            <ArrowDown className="w-5 h-5 text-muted-foreground" />
          </div>

          {/* Target feature */}
          <div className="p-3 rounded-lg border bg-muted/30">
            <div className="text-xs text-muted-foreground mb-1">Target Feature</div>
            <div className="text-sm font-medium line-clamp-3 break-words">
              {targetFeature.description}
            </div>
            <div className="text-xs text-muted-foreground/70 mt-1">{targetFeature.category}</div>
          </div>

          {/* Existing link warning */}
          {existingLink && (
            <div className="p-3 rounded-lg border border-yellow-500/50 bg-yellow-500/10 text-sm text-yellow-600 dark:text-yellow-400">
              {draggedDependsOnTarget
                ? 'The dragged feature already depends on the target feature.'
                : 'The target feature already depends on the dragged feature.'}
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-col gap-2 sm:flex-col sm:!justify-start">
          {/* Set as Parent - top */}
          <Button
            variant="default"
            onClick={() => onLink('child')}
            disabled={draggedDependsOnTarget}
            className={cn('w-full', draggedDependsOnTarget && 'opacity-50 cursor-not-allowed')}
            title={
              draggedDependsOnTarget
                ? 'This would create a circular dependency'
                : 'Make target feature depend on dragged (dragged is parent)'
            }
            data-testid="link-as-parent"
          >
            <ArrowUp className="w-4 h-4 mr-2" />
            Set as Parent
            <span className="text-xs ml-1 opacity-70">(target depends on this)</span>
          </Button>
          {/* Set as Child - middle */}
          <Button
            variant="default"
            onClick={() => onLink('parent')}
            disabled={targetDependsOnDragged}
            className={cn('w-full', targetDependsOnDragged && 'opacity-50 cursor-not-allowed')}
            title={
              targetDependsOnDragged
                ? 'This would create a circular dependency'
                : 'Make dragged feature depend on target (target is parent)'
            }
            data-testid="link-as-child"
          >
            <ArrowDown className="w-4 h-4 mr-2" />
            Set as Child
            <span className="text-xs ml-1 opacity-70">(depends on target)</span>
          </Button>
          {/* Cancel - bottom */}
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full">
            <X className="w-4 h-4 mr-2" />
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
