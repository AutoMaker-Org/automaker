import type { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { HotkeyButton } from '@/components/ui/hotkey-button';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  title: string;
  description: string;
  /** Optional icon to show in the title */
  icon?: LucideIcon;
  /** Icon color class. Defaults to "text-primary" */
  iconClassName?: string;
  /** Optional content to show between description and buttons */
  children?: ReactNode;
  /** Text for the confirm button. Defaults to "Confirm" */
  confirmText?: string;
  /** Text for the cancel button. Defaults to "Cancel" */
  cancelText?: string;
  /** Variant for the confirm button. Defaults to "default" */
  confirmVariant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
}

export function ConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  icon: Icon,
  iconClassName = 'text-primary',
  children,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmVariant = 'default',
}: ConfirmDialogProps) {
  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-popover border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {Icon && <Icon className={`w-5 h-5 ${iconClassName}`} />}
            {title}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">{description}</DialogDescription>
        </DialogHeader>

        {children}

        <DialogFooter className="gap-2 sm:gap-2 pt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="px-4">
            {cancelText}
          </Button>
          <HotkeyButton
            variant={confirmVariant}
            onClick={handleConfirm}
            hotkey={{ key: 'Enter', cmdCtrl: true }}
            hotkeyActive={open}
            className="px-4"
          >
            {Icon && <Icon className="w-4 h-4 mr-2" />}
            {confirmText}
          </HotkeyButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
