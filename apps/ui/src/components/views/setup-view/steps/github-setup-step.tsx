import { useState, useEffect, useCallback } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useSetupStore } from '@/store/setup-store';
import { getElectronAPI } from '@/lib/electron';
import {
  CheckCircle2,
  Loader2,
  ArrowRight,
  ArrowLeft,
  ExternalLink,
  Copy,
  RefreshCw,
  AlertTriangle,
  Github,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { StatusBadge } from '../components';

const logger = createLogger('GitHubSetupStep');

interface GitHubSetupStepProps {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

export function GitHubSetupStep({ onNext, onBack, onSkip }: GitHubSetupStepProps) {
  const { ghCliStatus, setGhCliStatus } = useSetupStore();
  const [isChecking, setIsChecking] = useState(false);

  const checkStatus = useCallback(async () => {
    setIsChecking(true);
    try {
      const api = getElectronAPI();
      if (!api.setup?.getGhStatus) {
        return;
      }
      const result = await api.setup.getGhStatus();
      if (result.success) {
        setGhCliStatus({
          installed: result.installed,
          authenticated: result.authenticated,
          version: result.version,
          path: result.path,
          user: result.user,
        });
      }
    } catch (error) {
      logger.error('Failed to check gh status:', error);
    } finally {
      setIsChecking(false);
    }
  }, [setGhCliStatus]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const copyCommand = (command: string) => {
    navigator.clipboard.writeText(command);
    toast.success('Command copied to clipboard');
  };

  const isReady = ghCliStatus?.installed && ghCliStatus?.authenticated;

  const getStatusBadge = () => {
    if (isChecking) {
      return <StatusBadge status="checking" label="Checking..." />;
    }
    if (ghCliStatus?.authenticated) {
      return <StatusBadge status="authenticated" label="Ready" />;
    }
    if (ghCliStatus?.installed) {
      return <StatusBadge status="unverified" label="Not Logged In" />;
    }
    return <StatusBadge status="not_installed" label="Not Installed" />;
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-xl bg-zinc-800 flex items-center justify-center mx-auto mb-4">
          <Github className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">GitHub CLI Setup</h2>
        <p className="text-muted-foreground">Optional - Used for creating pull requests</p>
      </div>

      {/* Info Banner */}
      <Card className="bg-amber-500/10 border-amber-500/20">
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-foreground">This step is optional</p>
              <p className="text-sm text-muted-foreground mt-1">
                The GitHub CLI allows you to create pull requests directly from the app. Without it,
                you can still create PRs manually in your browser.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Status Card */}
      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Github className="w-5 h-5" />
              GitHub CLI Status
            </CardTitle>
            <div className="flex items-center gap-2">
              {getStatusBadge()}
              <Button variant="ghost" size="sm" onClick={checkStatus} disabled={isChecking}>
                <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
          <CardDescription>
            {ghCliStatus?.installed
              ? ghCliStatus.authenticated
                ? `Logged in${ghCliStatus.user ? ` as ${ghCliStatus.user}` : ''}`
                : 'Installed but not logged in'
              : 'Not installed on your system'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Success State */}
          {isReady && (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <div>
                <p className="font-medium text-foreground">GitHub CLI is ready!</p>
                <p className="text-sm text-muted-foreground">
                  You can create pull requests directly from the app.
                  {ghCliStatus?.version && (
                    <span className="ml-1">Version: {ghCliStatus.version}</span>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Not Installed */}
          {!ghCliStatus?.installed && !isChecking && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/30 border border-border">
                <XCircle className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-foreground">GitHub CLI not found</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Install the GitHub CLI to enable PR creation from the app.
                  </p>
                </div>
              </div>

              <div className="space-y-3 p-4 rounded-lg bg-muted/30 border border-border">
                <p className="font-medium text-foreground text-sm">Installation Commands:</p>

                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">macOS (Homebrew)</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono text-foreground">
                      brew install gh
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => copyCommand('brew install gh')}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Windows (winget)</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono text-foreground">
                      winget install GitHub.cli
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => copyCommand('winget install GitHub.cli')}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Linux (apt)</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono text-foreground overflow-x-auto">
                      sudo apt install gh
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => copyCommand('sudo apt install gh')}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <a
                  href="https://cli.github.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center text-sm text-brand-500 hover:underline mt-2"
                >
                  View all installation options
                  <ExternalLink className="w-3 h-3 ml-1" />
                </a>
              </div>
            </div>
          )}

          {/* Installed but not authenticated */}
          {ghCliStatus?.installed && !ghCliStatus?.authenticated && !isChecking && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-foreground">GitHub CLI not logged in</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Run the login command to authenticate with GitHub.
                  </p>
                </div>
              </div>

              <div className="space-y-2 p-4 rounded-lg bg-muted/30 border border-border">
                <p className="text-sm text-muted-foreground">Run this command in your terminal:</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono text-foreground">
                    gh auth login
                  </code>
                  <Button variant="ghost" size="icon" onClick={() => copyCommand('gh auth login')}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Loading State */}
          {isChecking && (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
              <div>
                <p className="font-medium text-foreground">Checking GitHub CLI status...</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <Button variant="ghost" onClick={onBack} className="text-muted-foreground">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onSkip} className="text-muted-foreground">
            {isReady ? 'Skip' : 'Skip for now'}
          </Button>
          <Button
            onClick={onNext}
            className="bg-brand-500 hover:bg-brand-600 text-white"
            data-testid="github-next-button"
          >
            {isReady ? 'Continue' : 'Continue without GitHub CLI'}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}
