import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { FastForward, Settings2 } from 'lucide-react';

interface AutoModeSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skipVerificationInAutoMode: boolean;
  onSkipVerificationChange: (value: boolean) => void;
}

export function AutoModeSettingsDialog({
  open,
  onOpenChange,
  skipVerificationInAutoMode,
  onSkipVerificationChange,
}: AutoModeSettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="auto-mode-settings-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="w-5 h-5" />
            Auto Mode Settings
          </DialogTitle>
          <DialogDescription>
            Configure how auto mode handles feature execution and dependencies.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Skip Verification Setting */}
          <div className="flex items-start space-x-3 p-3 rounded-lg bg-secondary/50">
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="skip-verification-toggle"
                  className="text-sm font-medium cursor-pointer flex items-center gap-2"
                >
                  <FastForward className="w-4 h-4 text-brand-500" />
                  Skip verification requirement
                </Label>
                <Switch
                  id="skip-verification-toggle"
                  checked={skipVerificationInAutoMode}
                  onCheckedChange={onSkipVerificationChange}
                  data-testid="skip-verification-toggle"
                />
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                When enabled, auto mode will grab features even if their dependencies are not
                verified, as long as they are not currently running. This allows faster pipeline
                execution without waiting for manual verification.
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
