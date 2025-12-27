import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge, CopyableCommandField } from '../components';
import { getElectronAPI } from '@/lib/electron';
import { ArrowLeft, ArrowRight, RefreshCw, Code2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

interface OpenCodeSetupStepProps {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

interface OpenCodeCliStatus {
  installed: boolean;
  version?: string;
  path?: string;
  auth?: {
    authenticated: boolean;
    method?: string;
  };
}

export function OpenCodeSetupStep({ onNext, onBack, onSkip }: OpenCodeSetupStepProps) {
  const [cliStatus, setCliStatus] = useState<OpenCodeCliStatus | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  const checkStatus = useCallback(async () => {
    setIsChecking(true);
    try {
      const api = getElectronAPI();
      if (api.setup?.getOpenCodeStatus) {
        const status = await api.setup.getOpenCodeStatus();
        if (status.success) {
          setCliStatus({
            installed: !!status.installed,
            version: status.version,
            path: status.path,
            auth: status.auth
              ? { authenticated: status.auth.authenticated, method: status.auth.method }
              : undefined,
          });
        }
      }
    } catch (error) {
      console.error('Failed to check OpenCode status:', error);
      toast.error('Failed to check OpenCode status');
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const isReady = !!cliStatus?.installed;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-emerald-500/15 flex items-center justify-center border border-emerald-500/30">
          <Code2 className="w-6 h-6 text-emerald-500" />
        </div>
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold text-foreground">OpenCode CLI</h2>
          <p className="text-sm text-muted-foreground">
            Run the free GLM 4.7 model locally via OpenCode&apos;s ACP protocol.
          </p>
        </div>
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">CLI Status</CardTitle>
              <CardDescription>Check that OpenCode is installed and ready.</CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={checkStatus} disabled={isChecking}>
              <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground">OpenCode CLI</span>
            <StatusBadge
              status={cliStatus?.installed ? 'installed' : 'not_installed'}
              label={cliStatus?.installed ? 'Installed' : 'Missing'}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground">Authentication</span>
            <StatusBadge
              status={cliStatus?.auth?.authenticated ? 'authenticated' : 'not_authenticated'}
              label={cliStatus?.auth?.authenticated ? 'Ready' : 'Login Required'}
            />
          </div>
          {cliStatus?.version && (
            <div className="text-xs text-muted-foreground">
              Version: <span className="font-mono text-foreground">{cliStatus.version}</span>
            </div>
          )}
          {cliStatus?.path && (
            <div className="text-xs text-muted-foreground">
              Path: <span className="font-mono text-foreground">{cliStatus.path}</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg">Install & Authenticate</CardTitle>
          <CardDescription>
            OpenCode is already installed? Run auth once to unlock providers.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <CopyableCommandField command="npm install -g opencode" label="Install (npm)" />
          <CopyableCommandField
            command="curl -fsSL https://opencode.ai/install.sh | sh"
            label="Install (macOS/Linux)"
          />
          <CopyableCommandField command="opencode auth login" label="Authenticate" />
          <div className="text-xs text-muted-foreground">
            Config path:{' '}
            <span className="font-mono text-foreground">~/.config/opencode/config.json</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open('https://opencode.ai/docs/cli/', '_blank')}
            className="gap-2"
          >
            <ExternalLink className="w-4 h-4" />
            Open OpenCode Docs
          </Button>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onSkip}>
            Skip
          </Button>
          <Button
            onClick={onNext}
            disabled={!isReady}
            className="bg-emerald-500 hover:bg-emerald-600 text-white disabled:opacity-50 disabled:cursor-not-allowed gap-2"
          >
            Continue
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
