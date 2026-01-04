import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge, CopyableCommandField } from '../components';
import { getElectronAPI } from '@/lib/electron';
import { ArrowLeft, ArrowRight, RefreshCw, Terminal, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

interface CodexSetupStepProps {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

interface CodexCliStatus {
  installed: boolean;
  version?: string;
  path?: string;
  auth?: {
    authenticated: boolean;
    method?: string;
  };
}

export function CodexSetupStep({ onNext, onBack, onSkip }: CodexSetupStepProps) {
  const [cliStatus, setCliStatus] = useState<CodexCliStatus | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  const checkStatus = useCallback(async () => {
    setIsChecking(true);
    try {
      const api = getElectronAPI();
      if (api.setup?.getCodexStatus) {
        const status = await api.setup.getCodexStatus();
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
      console.error('Failed to check Codex status:', error);
      toast.error('Failed to check Codex status');
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
        <div className="w-12 h-12 rounded-xl bg-sky-500/15 flex items-center justify-center border border-sky-500/30">
          <Terminal className="w-6 h-6 text-sky-500" />
        </div>
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold text-foreground">Codex CLI</h2>
          <p className="text-sm text-muted-foreground">
            Run OpenAI Codex locally with JSON streaming and tool support.
          </p>
        </div>
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">CLI Status</CardTitle>
              <CardDescription>Check that Codex is installed and ready.</CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={checkStatus} disabled={isChecking}>
              <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground">Codex CLI</span>
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
            Install the CLI and sign in once to enable Codex automation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <CopyableCommandField command="npm install -g @openai/codex" label="Install (npm)" />
          <CopyableCommandField command="brew install codex" label="Install (Homebrew)" />
          <CopyableCommandField command="codex login" label="Authenticate" />
          <CopyableCommandField command="export OPENAI_API_KEY=sk-..." label="Auth via API key" />
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open('https://developers.openai.com/codex/cli', '_blank')}
            className="gap-2"
          >
            <ExternalLink className="w-4 h-4" />
            Open Codex Docs
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
            className="bg-sky-500 hover:bg-sky-600 text-white disabled:opacity-50 disabled:cursor-not-allowed gap-2"
          >
            Continue
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
