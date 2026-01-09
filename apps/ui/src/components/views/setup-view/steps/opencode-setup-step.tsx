import { useState, useEffect, useCallback, useRef } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
  XCircle,
  Terminal,
} from 'lucide-react';
import { toast } from 'sonner';
import { StatusBadge } from '../components';

const logger = createLogger('OpencodeSetupStep');

interface OpencodeSetupStepProps {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

interface OpencodeCliStatus {
  installed: boolean;
  version?: string | null;
  path?: string | null;
  auth?: {
    authenticated: boolean;
    method: string;
  };
  installCommand?: string;
  loginCommand?: string;
}

export function OpencodeSetupStep({ onNext, onBack, onSkip }: OpencodeSetupStepProps) {
  const { opencodeCliStatus, setOpencodeCliStatus } = useSetupStore();
  const [isChecking, setIsChecking] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const checkStatus = useCallback(async () => {
    setIsChecking(true);
    try {
      const api = getElectronAPI();
      if (!api.setup?.getOpencodeStatus) {
        return;
      }
      const result = await api.setup.getOpencodeStatus();
      if (result.success) {
        const status: OpencodeCliStatus = {
          installed: result.installed ?? false,
          version: result.version,
          path: result.path,
          auth: result.auth,
          installCommand: result.installCommand,
          loginCommand: result.loginCommand,
        };
        setOpencodeCliStatus(status);

        if (result.auth?.authenticated) {
          toast.success('OpenCode CLI is ready!');
        }
      }
    } catch (error) {
      logger.error('Failed to check OpenCode status:', error);
    } finally {
      setIsChecking(false);
    }
  }, [setOpencodeCliStatus]);

  useEffect(() => {
    checkStatus();
    // Cleanup polling on unmount
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [checkStatus]);

  const copyCommand = (command: string) => {
    navigator.clipboard.writeText(command);
    toast.success('Command copied to clipboard');
  };

  const handleLogin = async () => {
    setIsLoggingIn(true);

    try {
      // Copy login command to clipboard and show instructions
      const loginCommand = opencodeCliStatus?.loginCommand || 'opencode auth login';
      await navigator.clipboard.writeText(loginCommand);
      toast.info('Login command copied! Paste in terminal to authenticate.');

      // Poll for auth status
      let attempts = 0;
      const maxAttempts = 60; // 2 minutes with 2s interval

      pollIntervalRef.current = setInterval(async () => {
        attempts++;

        try {
          const api = getElectronAPI();
          if (!api.setup?.getOpencodeStatus) {
            return;
          }
          const result = await api.setup.getOpencodeStatus();

          if (result.auth?.authenticated) {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            setOpencodeCliStatus({
              ...opencodeCliStatus,
              installed: result.installed ?? true,
              version: result.version,
              path: result.path,
              auth: result.auth,
            } as OpencodeCliStatus);
            setIsLoggingIn(false);
            toast.success('Successfully logged in to OpenCode!');
          }
        } catch {
          // Ignore polling errors
        }

        if (attempts >= maxAttempts) {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          setIsLoggingIn(false);
          toast.error('Login timed out. Please try again.');
        }
      }, 2000);
    } catch (error) {
      logger.error('Login failed:', error);
      toast.error('Failed to start login process');
      setIsLoggingIn(false);
    }
  };

  const isReady = opencodeCliStatus?.installed && opencodeCliStatus?.auth?.authenticated;

  const getStatusBadge = () => {
    if (isChecking) {
      return <StatusBadge status="checking" label="Checking..." />;
    }
    if (opencodeCliStatus?.auth?.authenticated) {
      return <StatusBadge status="authenticated" label="Ready" />;
    }
    if (opencodeCliStatus?.installed) {
      return <StatusBadge status="unverified" label="Not Logged In" />;
    }
    return <StatusBadge status="not_installed" label="Not Installed" />;
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-xl bg-green-500/10 flex items-center justify-center mx-auto mb-4">
          <Terminal className="w-8 h-8 text-green-500" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">OpenCode CLI Setup</h2>
        <p className="text-muted-foreground">Optional - Use OpenCode as an AI provider</p>
      </div>

      {/* Info Banner */}
      <Card className="bg-green-500/10 border-green-500/20">
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-foreground">This step is optional</p>
              <p className="text-sm text-muted-foreground mt-1">
                Configure OpenCode CLI for access to free tier models and AWS Bedrock models. You
                can skip this and use other providers, or configure it later in Settings.
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
              <Terminal className="w-5 h-5" />
              OpenCode CLI Status
              <Badge variant="outline" className="ml-2">
                Optional
              </Badge>
            </CardTitle>
            <div className="flex items-center gap-2">
              {getStatusBadge()}
              <Button variant="ghost" size="sm" onClick={checkStatus} disabled={isChecking}>
                <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
          <CardDescription>
            {opencodeCliStatus?.installed
              ? opencodeCliStatus.auth?.authenticated
                ? `Authenticated via ${opencodeCliStatus.auth.method === 'api_key' ? 'API Key' : 'Browser Login'}${opencodeCliStatus.version ? ` (v${opencodeCliStatus.version})` : ''}`
                : 'Installed but not authenticated'
              : 'Not installed on your system'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Success State */}
          {isReady && (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <div>
                <p className="font-medium text-foreground">OpenCode CLI is ready!</p>
                <p className="text-sm text-muted-foreground">
                  You can use OpenCode models for AI tasks.
                  {opencodeCliStatus?.version && (
                    <span className="ml-1">Version: {opencodeCliStatus.version}</span>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Not Installed */}
          {!opencodeCliStatus?.installed && !isChecking && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/30 border border-border">
                <XCircle className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-foreground">OpenCode CLI not found</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Install the OpenCode CLI to use free tier and AWS Bedrock models.
                  </p>
                </div>
              </div>

              <div className="space-y-3 p-4 rounded-lg bg-muted/30 border border-border">
                <p className="font-medium text-foreground text-sm">Install OpenCode CLI:</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono text-foreground overflow-x-auto">
                    {opencodeCliStatus?.installCommand || 'npm install -g opencode'}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      copyCommand(opencodeCliStatus?.installCommand || 'npm install -g opencode')
                    }
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
                <a
                  href="https://github.com/opencode-ai/opencode"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center text-sm text-brand-500 hover:underline mt-2"
                >
                  View installation docs
                  <ExternalLink className="w-3 h-3 ml-1" />
                </a>
              </div>
            </div>
          )}

          {/* Installed but not authenticated */}
          {opencodeCliStatus?.installed &&
            !opencodeCliStatus?.auth?.authenticated &&
            !isChecking && (
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-foreground">OpenCode CLI not authenticated</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Run the login command to authenticate with OpenCode.
                    </p>
                  </div>
                </div>

                <div className="space-y-3 p-4 rounded-lg bg-muted/30 border border-border">
                  <p className="text-sm text-muted-foreground">
                    Run the login command in your terminal, then complete authentication in your
                    browser:
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono text-foreground">
                      {opencodeCliStatus?.loginCommand || 'opencode auth login'}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        copyCommand(opencodeCliStatus?.loginCommand || 'opencode auth login')
                      }
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                  <Button
                    onClick={handleLogin}
                    disabled={isLoggingIn}
                    className="w-full bg-brand-500 hover:bg-brand-600 text-white"
                  >
                    {isLoggingIn ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Waiting for login...
                      </>
                    ) : (
                      'Copy Command & Wait for Login'
                    )}
                  </Button>
                </div>
              </div>
            )}

          {/* Loading State */}
          {isChecking && (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
              <div>
                <p className="font-medium text-foreground">Checking OpenCode CLI status...</p>
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
            data-testid="opencode-next-button"
          >
            {isReady ? 'Continue' : 'Continue without OpenCode'}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>

      {/* Info note */}
      <p className="text-xs text-muted-foreground text-center">
        You can always configure OpenCode later in Settings
      </p>
    </div>
  );
}
