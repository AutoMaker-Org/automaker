/**
 * Sandbox Risk Confirmation Dialog
 *
 * Shows when the app is running outside a containerized environment.
 * Users must acknowledge the risks before proceeding.
 */

import { useState } from 'react';
import { ShieldAlert, Copy, Check } from 'lucide-react';
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

const DOCKER_COMMAND = 'npm run dev:docker';

export function SandboxRiskDialog({ open, onConfirm, onDeny }: SandboxRiskDialogProps) {
  const [copied, setCopied] = useState(false);
  const [skipInFuture, setSkipInFuture] = useState(false);

  const handleConfirm = () => {
    onConfirm(skipInFuture);
    // Reset checkbox state after confirmation
    setSkipInFuture(false);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(DOCKER_COMMAND);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
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
            Sandbox Environment Not Detected
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-4 pt-2">
              <p className="text-muted-foreground">
                <strong>Warning:</strong> This application is running outside of a containerized
                sandbox environment. AI agents will have direct access to your filesystem and can
                execute commands on your system.
              </p>

              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 space-y-2">
                <p className="text-sm font-medium text-destructive">Potential Risks:</p>
                <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                  <li>Agents can read, modify, or delete files on your system</li>
                  <li>Agents can execute arbitrary commands and install software</li>
                  <li>Agents can access environment variables and credentials</li>
                  <li>Unintended side effects from agent actions may affect your system</li>
                </ul>
              </div>

              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  For safer operation, consider running Automaker in Docker:
                </p>
                <div className="flex items-center gap-2 bg-muted/50 border border-border rounded-lg p-2">
                  <code className="flex-1 text-sm font-mono px-2">{DOCKER_COMMAND}</code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopy}
                    className="h-8 px-2 hover:bg-muted"
                  >
                    {copied ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
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
              Do not show this warning again
            </Label>
          </div>
          <div className="flex gap-2 sm:gap-2 w-full sm:justify-end">
            <Button variant="outline" onClick={onDeny} className="px-4" data-testid="sandbox-deny">
              Deny &amp; Exit
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirm}
              className="px-4"
              data-testid="sandbox-confirm"
            >
              <ShieldAlert className="w-4 h-4 mr-2" />I Accept the Risks
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
