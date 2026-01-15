/**
 * Sandbox Risk Confirmation Dialog
 *
 * Shows when the app is running outside a containerized environment.
 * Users must acknowledge the risks before proceeding.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldAlert } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

interface SandboxRiskDialogProps {
  open: boolean;
  onConfirm: (skipInFuture: boolean) => void;
  onDeny: () => void;
}

export function SandboxRiskDialog({ open, onConfirm, onDeny }: SandboxRiskDialogProps) {
  const { t } = useTranslation('common');
  const [skipInFuture, setSkipInFuture] = useState(false);

  const handleConfirm = () => {
    onConfirm(skipInFuture);
    // Reset checkbox state after confirmation
    setSkipInFuture(false);
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="bg-popover border-border max-w-lg"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <ShieldAlert className="w-6 h-6" />
            {t('dialogs.sandboxRisk.title')}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-4 pt-2">
              <p className="text-muted-foreground">
                <strong>{t('dialogs.sandboxRisk.warningLabel')}</strong>{' '}
                {t('dialogs.sandboxRisk.warningText')}
              </p>

              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 space-y-2">
                <p className="text-sm font-medium text-destructive">
                  {t('dialogs.sandboxRisk.potentialRisks')}
                </p>
                <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                  <li>{t('dialogs.sandboxRisk.riskFiles')}</li>
                  <li>{t('dialogs.sandboxRisk.riskCommands')}</li>
                  <li>{t('dialogs.sandboxRisk.riskCredentials')}</li>
                  <li>{t('dialogs.sandboxRisk.riskSideEffects')}</li>
                </ul>
              </div>

              <p className="text-sm text-muted-foreground">
                {t('dialogs.sandboxRisk.dockerSuggestion')}
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex-col gap-4 sm:flex-col pt-4">
          <div className="flex items-center space-x-2 self-start">
            <Checkbox
              id="skip-sandbox-warning"
              checked={skipInFuture}
              onCheckedChange={(checked) => setSkipInFuture(checked === true)}
              data-testid="sandbox-skip-checkbox"
            />
            <Label
              htmlFor="skip-sandbox-warning"
              className="text-sm text-muted-foreground cursor-pointer"
            >
              {t('dialogs.sandboxRisk.doNotShowAgain')}
            </Label>
          </div>
          <div className="flex gap-2 sm:gap-2 w-full sm:justify-end">
            <Button variant="outline" onClick={onDeny} className="px-4" data-testid="sandbox-deny">
              {t('dialogs.sandboxRisk.denyAndExit')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirm}
              className="px-4"
              data-testid="sandbox-confirm"
            >
              <ShieldAlert className="w-4 h-4 mr-2" />
              {t('dialogs.sandboxRisk.acceptRisks')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
