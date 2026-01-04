/**
 * Sandbox Rejection Screen
 *
 * Shown in web mode when user denies the sandbox risk confirmation.
 * Prompts them to either restart the app in a container or reload to try again.
 */

import { useState } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { ShieldX, RefreshCw, Container, Copy, Check } from 'lucide-react';

const logger = createLogger('SandboxRejectionScreen');
import { Button } from '@/components/ui/button';

const DOCKER_COMMAND = 'npm run dev:docker';

export function SandboxRejectionScreen() {
  const [copied, setCopied] = useState(false);

  const handleReload = () => {
    // Clear the rejection state and reload
    sessionStorage.removeItem('automaker-sandbox-denied');
    window.location.reload();
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(DOCKER_COMMAND);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      logger.error('Failed to copy:', err);
    }
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

        <div className="bg-muted/50 border border-border rounded-lg p-4 text-left space-y-3">
          <div className="flex items-start gap-3">
            <Container className="w-5 h-5 mt-0.5 text-primary flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <p className="font-medium text-sm">Run in Docker (Recommended)</p>
              <p className="text-sm text-muted-foreground">
                Run Automaker in a containerized sandbox environment:
              </p>
              <div className="flex items-center gap-2 bg-background border border-border rounded-lg p-2">
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
        </div>

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
