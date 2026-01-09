// @ts-nocheck
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ArchiveRestore, Trash2 } from 'lucide-react';
import { Feature } from '@/store/app-store';

interface CompletedFeaturesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  completedFeatures: Feature[];
  onUnarchive: (feature: Feature) => void;
  onDelete: (feature: Feature) => void;
}

export function CompletedFeaturesModal({
  open,
  onOpenChange,
  completedFeatures,
  onUnarchive,
  onDelete,
}: CompletedFeaturesModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-6xl max-h-[90vh] flex flex-col"
        data-testid="completed-features-modal"
      >
        <DialogHeader>
          <DialogTitle>Completed Features</DialogTitle>
          <DialogDescription>
            {completedFeatures.length === 0
              ? 'No completed features yet.'
              : `${completedFeatures.length} completed feature${
                  completedFeatures.length > 1 ? 's' : ''
                }`}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto py-4">
          {completedFeatures.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <ArchiveRestore className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No completed features</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {completedFeatures.map((feature) => (
                <Card
                  key={feature.id}
                  className="flex flex-col"
                  data-testid={`completed-card-${feature.id}`}
                >
                  <CardHeader className="p-3 pb-2 flex-1">
                    <CardTitle className="text-sm leading-tight line-clamp-3">
                      {feature.description || feature.summary || feature.id}
                    </CardTitle>
                    <CardDescription className="text-xs mt-1 truncate">
                      {feature.category || 'Uncategorized'}
                    </CardDescription>
                  </CardHeader>
                  <div className="p-3 pt-0 flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="flex-1 h-7 text-xs"
                      onClick={() => onUnarchive(feature)}
                      data-testid={`unarchive-${feature.id}`}
                    >
                      <ArchiveRestore className="w-3 h-3 mr-1" />
                      Restore
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => onDelete(feature)}
                      data-testid={`delete-completed-${feature.id}`}
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
