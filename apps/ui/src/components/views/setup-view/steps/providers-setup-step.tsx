import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { useSetupStore } from '@/store/setup-store';
import { useAppStore } from '@/store/app-store';
import { getElectronAPI } from '@/lib/electron';
import {
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Key,
  ExternalLink,
  Copy,
  RefreshCw,
  Download,
  XCircle,
  Trash2,
  AlertTriangle,
  Terminal,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { AnthropicIcon, CursorIcon, OpenAIIcon, OpenCodeIcon } from '@/components/ui/provider-icon';
import { TerminalOutput } from '../components';
import { useCliInstallation, useTokenSave } from '../hooks';

interface ProvidersSetupStepProps {
  onNext: () => void;
  onBack: () => void;
}

type ProviderTab = 'claude' | 'cursor' | 'codex' | 'opencode';

// ============================================================================
// Claude Content
// ============================================================================
function ClaudeContent() {
  const {
    claudeCliStatus,
    claudeAuthStatus,
    setClaudeCliStatus,
    setClaudeAuthStatus,
    setClaudeInstallProgress,
    setClaudeIsVerifying,
  } = useSetupStore();
  const { setApiKeys, apiKeys } = useAppStore();

  const [apiKey, setApiKey] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [isDeletingApiKey, setIsDeletingApiKey] = useState(false);
  const hasVerifiedRef = useRef(false);

  const installApi = useCallback(
    () => getElectronAPI().setup?.installClaude() || Promise.reject(),
    []
  );
  const getStoreState = useCallback(() => useSetupStore.getState().claudeCliStatus, []);

  // Auto-verify CLI authentication
  const verifyAuth = useCallback(async () => {
    // Guard against duplicate verification
    if (hasVerifiedRef.current) {
      return;
    }

    setIsVerifying(true);
    setClaudeIsVerifying(true); // Update store for parent to see
    setVerificationError(null);
    try {
      const api = getElectronAPI();
      if (!api.setup?.verifyClaudeAuth) {
        return;
      }
      const result = await api.setup.verifyClaudeAuth('cli');
      const hasLimitReachedError =
        result.error?.toLowerCase().includes('limit reached') ||
        result.error?.toLowerCase().includes('rate limit');

      if (result.authenticated && !hasLimitReachedError) {
        hasVerifiedRef.current = true;
        // Use getState() to avoid dependency on claudeAuthStatus
        const currentAuthStatus = useSetupStore.getState().claudeAuthStatus;
        setClaudeAuthStatus({
          authenticated: true,
          method: 'cli_authenticated',
          hasCredentialsFile: currentAuthStatus?.hasCredentialsFile || false,
        });
        toast.success('Claude CLI authenticated!');
      } else if (hasLimitReachedError) {
        setVerificationError('Rate limit reached. Please try again later.');
      } else if (result.error) {
        setVerificationError(result.error);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Verification failed';
      setVerificationError(errorMessage);
    } finally {
      setIsVerifying(false);
      setClaudeIsVerifying(false); // Update store when done
    }
  }, [setClaudeAuthStatus, setClaudeIsVerifying]);

  // Check status and auto-verify
  const checkStatus = useCallback(async () => {
    setIsChecking(true);
    setVerificationError(null);
    // Reset verification guard to allow fresh verification (for manual refresh)
    hasVerifiedRef.current = false;
    try {
      const api = getElectronAPI();
      if (!api.setup?.getClaudeStatus) return;
      const result = await api.setup.getClaudeStatus();
      if (result.success) {
        setClaudeCliStatus({
          installed: result.installed ?? false,
          version: result.version,
          path: result.path,
          method: 'none',
        });

        if (result.installed) {
          toast.success('Claude CLI installed!');
          // Auto-verify if CLI is installed
          setIsChecking(false);
          await verifyAuth();
          return;
        }
      }
    } catch {
      // Ignore errors
    } finally {
      setIsChecking(false);
    }
  }, [setClaudeCliStatus, verifyAuth]);

  const onInstallSuccess = useCallback(() => {
    hasVerifiedRef.current = false;
    checkStatus();
  }, [checkStatus]);

  const { isInstalling, installProgress, install } = useCliInstallation({
    cliType: 'claude',
    installApi,
    onProgressEvent: getElectronAPI().setup?.onInstallProgress,
    onSuccess: onInstallSuccess,
    getStoreState,
  });

  const { isSaving: isSavingApiKey, saveToken: saveApiKeyToken } = useTokenSave({
    provider: 'anthropic',
    onSuccess: () => {
      setClaudeAuthStatus({
        authenticated: true,
        method: 'api_key',
        hasCredentialsFile: false,
        apiKeyValid: true,
      });
      setApiKeys({ ...apiKeys, anthropic: apiKey });
      toast.success('API key saved successfully!');
    },
  });

  const deleteApiKey = useCallback(async () => {
    setIsDeletingApiKey(true);
    try {
      const api = getElectronAPI();
      if (!api.setup?.deleteApiKey) {
        toast.error('Delete API not available');
        return;
      }
      const result = await api.setup.deleteApiKey('anthropic');
      if (result.success) {
        setApiKey('');
        setApiKeys({ ...apiKeys, anthropic: '' });
        // Use getState() to avoid dependency on claudeAuthStatus
        const currentAuthStatus = useSetupStore.getState().claudeAuthStatus;
        setClaudeAuthStatus({
          authenticated: false,
          method: 'none',
          hasCredentialsFile: currentAuthStatus?.hasCredentialsFile || false,
        });
        // Reset verification guard so next check can verify again
        hasVerifiedRef.current = false;
        toast.success('API key deleted successfully');
      }
    } catch {
      toast.error('Failed to delete API key');
    } finally {
      setIsDeletingApiKey(false);
    }
  }, [apiKeys, setApiKeys, setClaudeAuthStatus]);

  useEffect(() => {
    setClaudeInstallProgress({ isInstalling, output: installProgress.output });
  }, [isInstalling, installProgress, setClaudeInstallProgress]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const copyCommand = (command: string) => {
    navigator.clipboard.writeText(command);
    toast.success('Command copied to clipboard');
  };

  const hasApiKey =
    !!apiKeys.anthropic ||
    claudeAuthStatus?.method === 'api_key' ||
    claudeAuthStatus?.method === 'api_key_env';

  const isCliAuthenticated = claudeAuthStatus?.method === 'cli_authenticated';
  const isApiKeyAuthenticated =
    claudeAuthStatus?.method === 'api_key' || claudeAuthStatus?.method === 'api_key_env';
  const isReady = claudeCliStatus?.installed && claudeAuthStatus?.authenticated;

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <AnthropicIcon className="w-5 h-5" />
            Claude CLI Status
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={checkStatus}
            disabled={isChecking || isVerifying}
          >
            <RefreshCw className={`w-4 h-4 ${isChecking || isVerifying ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <CardDescription>
          {claudeCliStatus?.installed
            ? claudeAuthStatus?.authenticated
              ? `Authenticated${claudeCliStatus.version ? ` (v${claudeCliStatus.version})` : ''}`
              : isVerifying
                ? 'Verifying authentication...'
                : 'Installed but not authenticated'
            : 'Not installed on your system'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Success State - CLI Ready */}
        {isReady && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <div>
                <p className="font-medium text-foreground">CLI Installed</p>
                <p className="text-sm text-muted-foreground">
                  {claudeCliStatus?.version && `Version: ${claudeCliStatus.version}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <p className="font-medium text-foreground">
                {isCliAuthenticated ? 'CLI Authenticated' : 'API Key Configured'}
              </p>
            </div>
          </div>
        )}

        {/* Checking/Verifying State */}
        {(isChecking || isVerifying) && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
            <p className="font-medium text-foreground">
              {isChecking ? 'Checking Claude CLI status...' : 'Verifying authentication...'}
            </p>
          </div>
        )}

        {/* Not Installed */}
        {!claudeCliStatus?.installed && !isChecking && !isVerifying && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/30 border border-border">
              <XCircle className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-foreground">Claude CLI not found</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Install Claude CLI to use Claude Code subscription.
                </p>
              </div>
            </div>
            <div className="space-y-3 p-4 rounded-lg bg-muted/30 border border-border">
              <p className="font-medium text-foreground text-sm">Install Claude CLI:</p>
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">macOS / Linux</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono text-foreground overflow-x-auto">
                    curl -fsSL https://claude.ai/install.sh | bash
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => copyCommand('curl -fsSL https://claude.ai/install.sh | bash')}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              {isInstalling && <TerminalOutput lines={installProgress.output} />}
              <Button
                onClick={install}
                disabled={isInstalling}
                className="w-full bg-brand-500 hover:bg-brand-600 text-white"
              >
                {isInstalling ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Installing...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Auto Install
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Installed but not authenticated */}
        {claudeCliStatus?.installed &&
          !claudeAuthStatus?.authenticated &&
          !isChecking &&
          !isVerifying && (
            <div className="space-y-4">
              {/* Show CLI installed toast */}
              <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                <div>
                  <p className="font-medium text-foreground">CLI Installed</p>
                  <p className="text-sm text-muted-foreground">
                    {claudeCliStatus?.version && `Version: ${claudeCliStatus.version}`}
                  </p>
                </div>
              </div>

              {/* Error state */}
              {verificationError && (
                <div className="flex items-start gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                  <XCircle className="w-5 h-5 text-red-500 shrink-0" />
                  <div>
                    <p className="font-medium text-foreground">Authentication failed</p>
                    <p className="text-sm text-red-400 mt-1">{verificationError}</p>
                  </div>
                </div>
              )}

              {/* Not authenticated warning */}
              <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-foreground">Claude CLI not authenticated</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Run <code className="bg-muted px-1 rounded">claude login</code> in your terminal
                    or provide an API key below.
                  </p>
                </div>
              </div>

              {/* API Key alternative */}
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="api-key" className="border-border">
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-3">
                      <Key className="w-5 h-5 text-muted-foreground" />
                      <span className="font-medium">Use Anthropic API Key instead</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pt-4 space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="anthropic-key" className="text-foreground">
                        Anthropic API Key
                      </Label>
                      <Input
                        id="anthropic-key"
                        type="password"
                        placeholder="sk-ant-..."
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        className="bg-input border-border text-foreground"
                      />
                      <p className="text-xs text-muted-foreground">
                        Don&apos;t have an API key?{' '}
                        <a
                          href="https://console.anthropic.com/settings/keys"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-brand-500 hover:underline"
                        >
                          Get one from Anthropic Console
                          <ExternalLink className="w-3 h-3 inline ml-1" />
                        </a>
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => saveApiKeyToken(apiKey)}
                        disabled={isSavingApiKey || !apiKey.trim()}
                        className="flex-1 bg-brand-500 hover:bg-brand-600 text-white"
                      >
                        {isSavingApiKey ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          'Save API Key'
                        )}
                      </Button>
                      {hasApiKey && (
                        <Button
                          onClick={deleteApiKey}
                          disabled={isDeletingApiKey}
                          variant="outline"
                          className="border-red-500/50 text-red-500 hover:bg-red-500/10"
                        >
                          {isDeletingApiKey ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </Button>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Cursor Content
// ============================================================================
function CursorContent() {
  const { cursorCliStatus, setCursorCliStatus } = useSetupStore();
  const [isChecking, setIsChecking] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const checkStatus = useCallback(async () => {
    setIsChecking(true);
    try {
      const api = getElectronAPI();
      if (!api.setup?.getCursorStatus) return;
      const result = await api.setup.getCursorStatus();
      if (result.success) {
        setCursorCliStatus({
          installed: result.installed ?? false,
          version: result.version,
          path: result.path,
          auth: result.auth,
          installCommand: result.installCommand,
          loginCommand: result.loginCommand,
        });
        if (result.auth?.authenticated) {
          toast.success('Cursor CLI is ready!');
        }
      }
    } catch {
      // Ignore errors
    } finally {
      setIsChecking(false);
    }
  }, [setCursorCliStatus]);

  useEffect(() => {
    checkStatus();
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [checkStatus]);

  const copyCommand = (command: string) => {
    navigator.clipboard.writeText(command);
    toast.success('Command copied to clipboard');
  };

  const handleLogin = async () => {
    setIsLoggingIn(true);
    try {
      const loginCommand = cursorCliStatus?.loginCommand || 'cursor-agent login';
      await navigator.clipboard.writeText(loginCommand);
      toast.info('Login command copied! Paste in terminal to authenticate.');

      let attempts = 0;
      pollIntervalRef.current = setInterval(async () => {
        attempts++;
        try {
          const api = getElectronAPI();
          if (!api.setup?.getCursorStatus) return;
          const result = await api.setup.getCursorStatus();
          if (result.auth?.authenticated) {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            setCursorCliStatus({
              ...cursorCliStatus,
              installed: result.installed ?? true,
              version: result.version,
              path: result.path,
              auth: result.auth,
            });
            setIsLoggingIn(false);
            toast.success('Successfully logged in to Cursor!');
          }
        } catch {
          // Ignore
        }
        if (attempts >= 60) {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          setIsLoggingIn(false);
          toast.error('Login timed out. Please try again.');
        }
      }, 2000);
    } catch {
      toast.error('Failed to start login process');
      setIsLoggingIn(false);
    }
  };

  const isReady = cursorCliStatus?.installed && cursorCliStatus?.auth?.authenticated;

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <CursorIcon className="w-5 h-5" />
            Cursor CLI Status
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={checkStatus} disabled={isChecking}>
            <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <CardDescription>
          {cursorCliStatus?.installed
            ? cursorCliStatus.auth?.authenticated
              ? `Authenticated${cursorCliStatus.version ? ` (v${cursorCliStatus.version})` : ''}`
              : 'Installed but not authenticated'
            : 'Not installed on your system'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isReady && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <div>
                <p className="font-medium text-foreground">CLI Installed</p>
                <p className="text-sm text-muted-foreground">
                  {cursorCliStatus?.version && `Version: ${cursorCliStatus.version}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <p className="font-medium text-foreground">Authenticated</p>
            </div>
          </div>
        )}

        {!cursorCliStatus?.installed && !isChecking && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/30 border border-border">
              <XCircle className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-foreground">Cursor CLI not found</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Install Cursor IDE to use Cursor AI agent.
                </p>
              </div>
            </div>
            <div className="space-y-3 p-4 rounded-lg bg-muted/30 border border-border">
              <p className="font-medium text-foreground text-sm">Install Cursor:</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono text-foreground overflow-x-auto">
                  {cursorCliStatus?.installCommand || 'npm install -g @anthropic/cursor-agent'}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    copyCommand(
                      cursorCliStatus?.installCommand || 'npm install -g @anthropic/cursor-agent'
                    )
                  }
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {cursorCliStatus?.installed && !cursorCliStatus?.auth?.authenticated && !isChecking && (
          <div className="space-y-4">
            {/* Show CLI installed toast */}
            <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <div>
                <p className="font-medium text-foreground">CLI Installed</p>
                <p className="text-sm text-muted-foreground">
                  {cursorCliStatus?.version && `Version: ${cursorCliStatus.version}`}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-foreground">Cursor CLI not authenticated</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Run the login command to authenticate.
                </p>
              </div>
            </div>
            <div className="space-y-3 p-4 rounded-lg bg-muted/30 border border-border">
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono text-foreground">
                  {cursorCliStatus?.loginCommand || 'cursor-agent login'}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => copyCommand(cursorCliStatus?.loginCommand || 'cursor-agent login')}
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

        {isChecking && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
            <p className="font-medium text-foreground">Checking Cursor CLI status...</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Codex Content
// ============================================================================
function CodexContent() {
  const { codexCliStatus, codexAuthStatus, setCodexCliStatus, setCodexAuthStatus } =
    useSetupStore();
  const { setApiKeys, apiKeys } = useAppStore();
  const [isChecking, setIsChecking] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const checkStatus = useCallback(async () => {
    setIsChecking(true);
    try {
      const api = getElectronAPI();
      if (!api.setup?.getCodexStatus) return;
      const result = await api.setup.getCodexStatus();
      if (result.success) {
        setCodexCliStatus({
          installed: result.installed ?? false,
          version: result.version,
          path: result.path,
          method: 'none',
        });
        if (result.auth?.authenticated) {
          setCodexAuthStatus({
            authenticated: true,
            method: result.auth.method || 'cli_authenticated',
          });
          toast.success('Codex CLI is ready!');
        }
      }
    } catch {
      // Ignore
    } finally {
      setIsChecking(false);
    }
  }, [setCodexCliStatus, setCodexAuthStatus]);

  useEffect(() => {
    checkStatus();
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [checkStatus]);

  const copyCommand = (command: string) => {
    navigator.clipboard.writeText(command);
    toast.success('Command copied to clipboard');
  };

  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) return;
    setIsSaving(true);
    try {
      const api = getElectronAPI();
      if (!api.setup?.saveApiKey) {
        toast.error('Save API not available');
        return;
      }
      const result = await api.setup.saveApiKey('openai', apiKey);
      if (result.success) {
        setApiKeys({ ...apiKeys, openai: apiKey });
        setCodexAuthStatus({ authenticated: true, method: 'api_key' });
        toast.success('API key saved successfully!');
      }
    } catch {
      toast.error('Failed to save API key');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogin = async () => {
    setIsLoggingIn(true);
    try {
      await navigator.clipboard.writeText('codex login');
      toast.info('Login command copied! Paste in terminal to authenticate.');

      let attempts = 0;
      pollIntervalRef.current = setInterval(async () => {
        attempts++;
        try {
          const api = getElectronAPI();
          if (!api.setup?.getCodexStatus) return;
          const result = await api.setup.getCodexStatus();
          if (result.auth?.authenticated) {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            setCodexAuthStatus({ authenticated: true, method: 'cli_authenticated' });
            setIsLoggingIn(false);
            toast.success('Successfully logged in to Codex!');
          }
        } catch {
          // Ignore
        }
        if (attempts >= 60) {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          setIsLoggingIn(false);
          toast.error('Login timed out. Please try again.');
        }
      }, 2000);
    } catch {
      toast.error('Failed to start login process');
      setIsLoggingIn(false);
    }
  };

  const isReady = codexCliStatus?.installed && codexAuthStatus?.authenticated;
  const hasApiKey = !!apiKeys.openai || codexAuthStatus?.method === 'api_key';

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <OpenAIIcon className="w-5 h-5" />
            Codex CLI Status
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={checkStatus} disabled={isChecking}>
            <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <CardDescription>
          {codexCliStatus?.installed
            ? codexAuthStatus?.authenticated
              ? `Authenticated${codexCliStatus.version ? ` (v${codexCliStatus.version})` : ''}`
              : 'Installed but not authenticated'
            : 'Not installed on your system'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isReady && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <div>
                <p className="font-medium text-foreground">CLI Installed</p>
                <p className="text-sm text-muted-foreground">
                  {codexCliStatus?.version && `Version: ${codexCliStatus.version}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <p className="font-medium text-foreground">
                {codexAuthStatus?.method === 'api_key' ? 'API Key Configured' : 'Authenticated'}
              </p>
            </div>
          </div>
        )}

        {!codexCliStatus?.installed && !isChecking && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/30 border border-border">
              <XCircle className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-foreground">Codex CLI not found</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Install the Codex CLI to use OpenAI models.
                </p>
              </div>
            </div>
            <div className="space-y-3 p-4 rounded-lg bg-muted/30 border border-border">
              <p className="font-medium text-foreground text-sm">Install Codex CLI:</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono text-foreground overflow-x-auto">
                  npm install -g @openai/codex
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => copyCommand('npm install -g @openai/codex')}
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {codexCliStatus?.installed && !codexAuthStatus?.authenticated && !isChecking && (
          <div className="space-y-4">
            {/* Show CLI installed toast */}
            <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <div>
                <p className="font-medium text-foreground">CLI Installed</p>
                <p className="text-sm text-muted-foreground">
                  {codexCliStatus?.version && `Version: ${codexCliStatus.version}`}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-foreground">Codex CLI not authenticated</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Run the login command or provide an API key below.
                </p>
              </div>
            </div>

            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="cli" className="border-border">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-3">
                    <Terminal className="w-5 h-5 text-muted-foreground" />
                    <span className="font-medium">Codex CLI Login</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pt-4 space-y-4">
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono text-foreground">
                      codex login
                    </code>
                    <Button variant="ghost" size="icon" onClick={() => copyCommand('codex login')}>
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
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="api-key" className="border-border">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-3">
                    <Key className="w-5 h-5 text-muted-foreground" />
                    <span className="font-medium">OpenAI API Key</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pt-4 space-y-4">
                  <div className="space-y-2">
                    <Input
                      type="password"
                      placeholder="sk-..."
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="bg-input border-border text-foreground"
                    />
                    <p className="text-xs text-muted-foreground">
                      <a
                        href="https://platform.openai.com/api-keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-500 hover:underline"
                      >
                        Get an API key from OpenAI
                        <ExternalLink className="w-3 h-3 inline ml-1" />
                      </a>
                    </p>
                  </div>
                  <Button
                    onClick={handleSaveApiKey}
                    disabled={isSaving || !apiKey.trim()}
                    className="w-full bg-brand-500 hover:bg-brand-600 text-white"
                  >
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save API Key'}
                  </Button>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        )}

        {isChecking && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
            <p className="font-medium text-foreground">Checking Codex CLI status...</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// OpenCode Content
// ============================================================================
function OpencodeContent() {
  const { opencodeCliStatus, setOpencodeCliStatus } = useSetupStore();
  const [isChecking, setIsChecking] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const checkStatus = useCallback(async () => {
    setIsChecking(true);
    try {
      const api = getElectronAPI();
      if (!api.setup?.getOpencodeStatus) return;
      const result = await api.setup.getOpencodeStatus();
      if (result.success) {
        setOpencodeCliStatus({
          installed: result.installed ?? false,
          version: result.version,
          path: result.path,
          auth: result.auth,
          installCommand: result.installCommand,
          loginCommand: result.loginCommand,
        });
        if (result.auth?.authenticated) {
          toast.success('OpenCode CLI is ready!');
        }
      }
    } catch {
      // Ignore
    } finally {
      setIsChecking(false);
    }
  }, [setOpencodeCliStatus]);

  useEffect(() => {
    checkStatus();
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [checkStatus]);

  const copyCommand = (command: string) => {
    navigator.clipboard.writeText(command);
    toast.success('Command copied to clipboard');
  };

  const handleLogin = async () => {
    setIsLoggingIn(true);
    try {
      const loginCommand = opencodeCliStatus?.loginCommand || 'opencode auth login';
      await navigator.clipboard.writeText(loginCommand);
      toast.info('Login command copied! Paste in terminal to authenticate.');

      let attempts = 0;
      pollIntervalRef.current = setInterval(async () => {
        attempts++;
        try {
          const api = getElectronAPI();
          if (!api.setup?.getOpencodeStatus) return;
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
            });
            setIsLoggingIn(false);
            toast.success('Successfully logged in to OpenCode!');
          }
        } catch {
          // Ignore
        }
        if (attempts >= 60) {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          setIsLoggingIn(false);
          toast.error('Login timed out. Please try again.');
        }
      }, 2000);
    } catch {
      toast.error('Failed to start login process');
      setIsLoggingIn(false);
    }
  };

  const isReady = opencodeCliStatus?.installed && opencodeCliStatus?.auth?.authenticated;

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <OpenCodeIcon className="w-5 h-5" />
            OpenCode CLI Status
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={checkStatus} disabled={isChecking}>
            <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <CardDescription>
          {opencodeCliStatus?.installed
            ? opencodeCliStatus.auth?.authenticated
              ? `Authenticated${opencodeCliStatus.version ? ` (v${opencodeCliStatus.version})` : ''}`
              : 'Installed but not authenticated'
            : 'Not installed on your system'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isReady && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <div>
                <p className="font-medium text-foreground">CLI Installed</p>
                <p className="text-sm text-muted-foreground">
                  {opencodeCliStatus?.version && `Version: ${opencodeCliStatus.version}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <p className="font-medium text-foreground">Authenticated</p>
            </div>
          </div>
        )}

        {!opencodeCliStatus?.installed && !isChecking && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/30 border border-border">
              <XCircle className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-foreground">OpenCode CLI not found</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Install the OpenCode CLI for free tier and AWS Bedrock models.
                </p>
              </div>
            </div>
            <div className="space-y-3 p-4 rounded-lg bg-muted/30 border border-border">
              <p className="font-medium text-foreground text-sm">Install OpenCode CLI:</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono text-foreground overflow-x-auto">
                  {opencodeCliStatus?.installCommand ||
                    'curl -fsSL https://opencode.ai/install | bash'}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    copyCommand(
                      opencodeCliStatus?.installCommand ||
                        'curl -fsSL https://opencode.ai/install | bash'
                    )
                  }
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {opencodeCliStatus?.installed && !opencodeCliStatus?.auth?.authenticated && !isChecking && (
          <div className="space-y-4">
            {/* Show CLI installed toast */}
            <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <div>
                <p className="font-medium text-foreground">CLI Installed</p>
                <p className="text-sm text-muted-foreground">
                  {opencodeCliStatus?.version && `Version: ${opencodeCliStatus.version}`}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-foreground">OpenCode CLI not authenticated</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Run the login command to authenticate.
                </p>
              </div>
            </div>
            <div className="space-y-3 p-4 rounded-lg bg-muted/30 border border-border">
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

        {isChecking && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
            <p className="font-medium text-foreground">Checking OpenCode CLI status...</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Main Component
// ============================================================================
export function ProvidersSetupStep({ onNext, onBack }: ProvidersSetupStepProps) {
  const [activeTab, setActiveTab] = useState<ProviderTab>('claude');
  const [isInitialChecking, setIsInitialChecking] = useState(true);
  const hasCheckedRef = useRef(false);

  const {
    claudeCliStatus,
    claudeAuthStatus,
    claudeIsVerifying,
    cursorCliStatus,
    codexCliStatus,
    codexAuthStatus,
    opencodeCliStatus,
    setClaudeCliStatus,
    setCursorCliStatus,
    setCodexCliStatus,
    setCodexAuthStatus,
    setOpencodeCliStatus,
  } = useSetupStore();

  // Check all providers on mount
  const checkAllProviders = useCallback(async () => {
    const api = getElectronAPI();

    // Check Claude - only check CLI status, let ClaudeContent handle auth verification
    const checkClaude = async () => {
      try {
        if (!api.setup?.getClaudeStatus) return;
        const result = await api.setup.getClaudeStatus();
        if (result.success) {
          setClaudeCliStatus({
            installed: result.installed ?? false,
            version: result.version,
            path: result.path,
            method: 'none',
          });
          // Note: Auth verification is handled by ClaudeContent component to avoid duplicate calls
        }
      } catch {
        // Ignore errors
      }
    };

    // Check Cursor
    const checkCursor = async () => {
      try {
        if (!api.setup?.getCursorStatus) return;
        const result = await api.setup.getCursorStatus();
        if (result.success) {
          setCursorCliStatus({
            installed: result.installed ?? false,
            version: result.version,
            path: result.path,
            auth: result.auth,
            installCommand: result.installCommand,
            loginCommand: result.loginCommand,
          });
        }
      } catch {
        // Ignore errors
      }
    };

    // Check Codex
    const checkCodex = async () => {
      try {
        if (!api.setup?.getCodexStatus) return;
        const result = await api.setup.getCodexStatus();
        if (result.success) {
          setCodexCliStatus({
            installed: result.installed ?? false,
            version: result.version,
            path: result.path,
            method: 'none',
          });
          if (result.auth?.authenticated) {
            setCodexAuthStatus({
              authenticated: true,
              method: result.auth.method || 'cli_authenticated',
            });
          }
        }
      } catch {
        // Ignore errors
      }
    };

    // Check OpenCode
    const checkOpencode = async () => {
      try {
        if (!api.setup?.getOpencodeStatus) return;
        const result = await api.setup.getOpencodeStatus();
        if (result.success) {
          setOpencodeCliStatus({
            installed: result.installed ?? false,
            version: result.version,
            path: result.path,
            auth: result.auth,
            installCommand: result.installCommand,
            loginCommand: result.loginCommand,
          });
        }
      } catch {
        // Ignore errors
      }
    };

    // Run all checks in parallel
    await Promise.all([checkClaude(), checkCursor(), checkCodex(), checkOpencode()]);
    setIsInitialChecking(false);
  }, [
    setClaudeCliStatus,
    setCursorCliStatus,
    setCodexCliStatus,
    setCodexAuthStatus,
    setOpencodeCliStatus,
  ]);

  useEffect(() => {
    if (!hasCheckedRef.current) {
      hasCheckedRef.current = true;
      checkAllProviders();
    }
  }, [checkAllProviders]);

  // Determine status for each provider
  const isClaudeInstalled = claudeCliStatus?.installed === true;
  const isClaudeAuthenticated =
    claudeAuthStatus?.authenticated === true &&
    (claudeAuthStatus?.method === 'cli_authenticated' ||
      claudeAuthStatus?.method === 'api_key' ||
      claudeAuthStatus?.method === 'api_key_env');

  const isCursorInstalled = cursorCliStatus?.installed === true;
  const isCursorAuthenticated = cursorCliStatus?.auth?.authenticated === true;

  const isCodexInstalled = codexCliStatus?.installed === true;
  const isCodexAuthenticated = codexAuthStatus?.authenticated === true;

  const isOpencodeInstalled = opencodeCliStatus?.installed === true;
  const isOpencodeAuthenticated = opencodeCliStatus?.auth?.authenticated === true;

  const hasAtLeastOneProvider =
    isClaudeAuthenticated ||
    isCursorAuthenticated ||
    isCodexAuthenticated ||
    isOpencodeAuthenticated;

  type ProviderStatus = 'not_installed' | 'installed_not_auth' | 'authenticated' | 'verifying';

  const getProviderStatus = (
    installed: boolean,
    authenticated: boolean,
    isVerifying?: boolean
  ): ProviderStatus => {
    if (!installed) return 'not_installed';
    if (isVerifying) return 'verifying';
    if (!authenticated) return 'installed_not_auth';
    return 'authenticated';
  };

  const providers = [
    {
      id: 'claude' as const,
      label: 'Claude',
      icon: AnthropicIcon,
      status: getProviderStatus(isClaudeInstalled, isClaudeAuthenticated, claudeIsVerifying),
      color: 'text-brand-500',
    },
    {
      id: 'cursor' as const,
      label: 'Cursor',
      icon: CursorIcon,
      status: getProviderStatus(isCursorInstalled, isCursorAuthenticated),
      color: 'text-blue-500',
    },
    {
      id: 'codex' as const,
      label: 'Codex',
      icon: OpenAIIcon,
      status: getProviderStatus(isCodexInstalled, isCodexAuthenticated),
      color: 'text-emerald-500',
    },
    {
      id: 'opencode' as const,
      label: 'OpenCode',
      icon: OpenCodeIcon,
      status: getProviderStatus(isOpencodeInstalled, isOpencodeAuthenticated),
      color: 'text-green-500',
    },
  ];

  const renderStatusIcon = (status: ProviderStatus) => {
    switch (status) {
      case 'authenticated':
        return (
          <CheckCircle2 className="w-3 h-3 text-green-500 absolute -top-1 -right-1.5 bg-background rounded-full" />
        );
      case 'verifying':
        return (
          <Loader2 className="w-3 h-3 text-blue-500 absolute -top-1 -right-1.5 bg-background rounded-full animate-spin" />
        );
      case 'installed_not_auth':
        return (
          <AlertCircle className="w-3 h-3 text-red-500 absolute -top-1 -right-1.5 bg-background rounded-full" />
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-foreground mb-2">AI Provider Setup</h2>
        <p className="text-muted-foreground">Configure at least one AI provider to continue</p>
      </div>

      {isInitialChecking && (
        <div className="flex items-center justify-center gap-2 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
          <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
          <p className="font-medium text-foreground">Checking provider status...</p>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ProviderTab)}>
        <TabsList className="grid w-full grid-cols-4 h-auto p-1">
          {providers.map((provider) => {
            const Icon = provider.icon;
            return (
              <TabsTrigger
                key={provider.id}
                value={provider.id}
                className={cn(
                  'relative flex flex-col items-center gap-1 py-3 px-2',
                  'data-[state=active]:bg-muted'
                )}
              >
                <div className="relative">
                  <Icon
                    className={cn(
                      'w-5 h-5',
                      provider.status === 'authenticated'
                        ? provider.color
                        : provider.status === 'verifying'
                          ? 'text-blue-500'
                          : provider.status === 'installed_not_auth'
                            ? 'text-amber-500'
                            : 'text-muted-foreground'
                    )}
                  />
                  {!isInitialChecking && renderStatusIcon(provider.status)}
                </div>
                <span className="text-xs font-medium">{provider.label}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        <div className="mt-6">
          <TabsContent value="claude" className="mt-0">
            <ClaudeContent />
          </TabsContent>
          <TabsContent value="cursor" className="mt-0">
            <CursorContent />
          </TabsContent>
          <TabsContent value="codex" className="mt-0">
            <CodexContent />
          </TabsContent>
          <TabsContent value="opencode" className="mt-0">
            <OpencodeContent />
          </TabsContent>
        </div>
      </Tabs>

      <div className="flex justify-between pt-4">
        <Button variant="ghost" onClick={onBack} className="text-muted-foreground">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Button
          onClick={onNext}
          className={cn(
            'bg-brand-500 hover:bg-brand-600 text-white',
            !hasAtLeastOneProvider && 'opacity-50'
          )}
          data-testid="providers-next-button"
        >
          {hasAtLeastOneProvider ? 'Continue' : 'Skip for now'}
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>

      {!hasAtLeastOneProvider && (
        <p className="text-xs text-muted-foreground text-center">
          You can configure providers later in Settings
        </p>
      )}
    </div>
  );
}
