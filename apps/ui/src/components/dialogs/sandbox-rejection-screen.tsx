/**
 * Sandbox Rejection Screen
 *
 * Shown in web mode when user denies the sandbox risk confirmation.
 * Prompts them to either restart the app in a container or reload to try again.
 */

import { ShieldX, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function SandboxRejectionScreen() {
  const handleReload = () => {
    // Clear the rejection state and reload
    sessionStorage.removeItem('automaker-sandbox-denied');
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <div className="rounded-full bg-destructive/10 p-4">
            <ShieldX className="w-12 h-12 text-destructive" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Access Denied</h1>
          <p className="text-muted-foreground">
            You declined to accept the risks of running Automaker outside a sandbox environment.
          </p>
        </div>

        <p className="text-sm text-muted-foreground">
          For safer operation, consider running Automaker in Docker. See the README for
          instructions.
        </p>

        <div className="pt-2">
          <Button
            variant="outline"
            onClick={handleReload}
            className="gap-2"
            data-testid="sandbox-retry"
          >
            <RefreshCw className="w-4 h-4" />
            Reload &amp; Try Again
          </Button>
        </div>
      </div>
    </div>
  );
}
