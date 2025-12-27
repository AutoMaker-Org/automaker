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
import { Archive } from 'lucide-react';

interface ArchiveAllVerifiedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  verifiedCount: number;
  onConfirm: () => void;
}

export function ArchiveAllVerifiedDialog({
  open,
  onOpenChange,
  verifiedCount,
  onConfirm,
}: ArchiveAllVerifiedDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="archive-all-verified-dialog">
        <DialogHeader>
          <DialogTitle>Archive All Verified Features</DialogTitle>
          <DialogDescription>
            Are you sure you want to archive all verified features? They will be moved to the
            archive box.
            {verifiedCount > 0 && (
              <span className="block mt-2 text-yellow-500">
                {verifiedCount} feature(s) will be archived.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="default" onClick={onConfirm} data-testid="confirm-archive-all-verified">
            <Archive className="w-4 h-4 mr-2" />
            Complete All
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
