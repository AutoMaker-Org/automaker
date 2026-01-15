import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
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
import type { ReactNode } from 'react';

interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  title: string;
  description: string;
  /** Optional content to show between description and buttons (e.g., item preview card) */
  children?: ReactNode;
  /** Text for the confirm button. Uses translation key buttons.delete if not provided */
  confirmText?: string;
  /** Test ID for the dialog */
  testId?: string;
  /** Test ID for the confirm button */
  confirmTestId?: string;
}

export function DeleteConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  children,
  confirmText,
  testId = 'delete-confirm-dialog',
  confirmTestId = 'confirm-delete-button',
}: DeleteConfirmDialogProps) {
  const { t } = useTranslation('common');
  const displayConfirmText = confirmText ?? t('buttons.delete');
  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-popover border-border max-w-md" data-testid={testId}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-destructive" />
            {title}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">{description}</DialogDescription>
        </DialogHeader>

        {children}

        <DialogFooter className="gap-2 sm:gap-2 pt-4">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="px-4"
            data-testid="cancel-delete-button"
          >
            {t('buttons.cancel')}
          </Button>
          <HotkeyButton
            variant="destructive"
            onClick={handleConfirm}
            data-testid={confirmTestId}
            hotkey={{ key: 'Enter', cmdCtrl: true }}
            hotkeyActive={open}
            className="px-4"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            {displayConfirmText}
          </HotkeyButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
