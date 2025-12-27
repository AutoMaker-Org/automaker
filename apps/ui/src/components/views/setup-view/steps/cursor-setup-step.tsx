import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  CheckCircle2,
  Loader2,
  Terminal,
  Key,
  ArrowRight,
  ArrowLeft,
  ExternalLink,
  Copy,
  RefreshCw,
  Download,
  Info,
  ShieldCheck,
  XCircle,
  Trash2,
  Wand2,
} from 'lucide-react';
import { toast } from 'sonner';
import { StatusBadge, TerminalOutput } from '../components';

interface CursorSetupStepProps {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

type VerificationStatus = 'idle' | 'verifying' | 'verified' | 'error';

interface CursorCliStatus {
  installed: boolean;
  version?: string;
  path?: string;
  auth?: {
    authenticated: boolean;
    method: string;
    hasApiKey?: boolean;
    hasStoredApiKey?: boolean;
    hasEnvApiKey?: boolean;
  };
}

interface CursorAuthStatus {
  authenticated: boolean;
  method: string;
  hasApiKey?: boolean;
  apiKeyValid?: boolean;
}

export function CursorSetupStep({ onNext, onBack, onSkip }: CursorSetupStepProps) {
  const { setApiKeys, apiKeys } = useAppStore();

  const [cursorCliStatus, setCursorCliStatus] = useState<CursorCliStatus | null>(null);
  const [cursorAuthStatus, setCursorAuthStatus] = useState<CursorAuthStatus | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installOutput, setInstallOutput] = useState<string[]>([]);

  const [apiKey, setApiKey] = useState('');

  // CLI Verification state
  const [cliVerificationStatus, setCliVerificationStatus] = useState<VerificationStatus>('idle');
  const [cliVerificationError, setCliVerificationError] = useState<string | null>(null);

  // API Key Verification state
  const [apiKeyVerificationStatus, setApiKeyVerificationStatus] =
    useState<VerificationStatus>('idle');
  const [apiKeyVerificationError, setApiKeyVerificationError] = useState<string | null>(null);

  // Delete API Key state
  const [isDeletingApiKey, setIsDeletingApiKey] = useState(false);
  const [isSavingApiKey, setIsSavingApiKey] = useState(false);

  // Check Cursor CLI status
  const checkStatus = useCallback(async () => {
    setIsChecking(true);
    try {
      const api = getElectronAPI();
      if (api.setup?.getCursorStatus) {
        const status = await api.setup.getCursorStatus();
        if (status.success) {
          setCursorCliStatus({
            installed: status.installed || false,
            version: status.version,
            path: status.path,
            auth: status.auth,
          });
          if (status.auth) {
            setCursorAuthStatus({
              authenticated: status.auth.authenticated,
              method: status.auth.method,
              hasApiKey: status.auth.hasApiKey,
              apiKeyValid: status.auth.apiKeyValid,
            });
          }
        }
      }
    } catch (error) {
      console.error('Failed to check Cursor status:', error);
    } finally {
      setIsChecking(false);
    }
  }, []);

  // Install Cursor CLI
  const installCursor = useCallback(async () => {
    setIsInstalling(true);
    setInstallOutput([]);
    try {
      const api = getElectronAPI();
      if (api.setup?.installCursor) {
        const result = await api.setup.installCursor();
        if (result.success) {
          toast.success('Cursor CLI installed successfully!');
          await checkStatus();
        } else {
          toast.error(result.error || 'Installation failed');
          if (result.output) {
            setInstallOutput(result.output.split('\n'));
          }
        }
      }
    } catch (error) {
      toast.error('Failed to install Cursor CLI');
    } finally {
      setIsInstalling(false);
    }
  }, [checkStatus]);

  // Email from verification
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);

  // Verify CLI authentication using `cursor agent status`
  const verifyCliAuth = useCallback(async () => {
    setCliVerificationStatus('verifying');
    setCliVerificationError(null);

    try {
      const api = getElectronAPI();
      if (!api.setup?.verifyCursorAuth) {
        setCliVerificationStatus('error');
        setCliVerificationError('Verification API not available');
        return;
      }

      const result = (await api.setup.verifyCursorAuth('any')) as {
        authenticated: boolean;
        method?: string;
        email?: string;
        error?: string;
      };

      if (result.authenticated) {
        setCliVerificationStatus('verified');
        setVerifiedEmail(result.email || null);
        setCursorAuthStatus({
          authenticated: true,
          method: result.method || 'cli_authenticated',
          hasApiKey: true,
          apiKeyValid: true,
        });
        const msg = result.email
          ? `Logged in as ${result.email}`
          : 'Cursor CLI authentication verified!';
        toast.success(msg);
      } else {
        setCliVerificationStatus('error');
        setCliVerificationError(result.error || 'Authentication failed');
        setCursorAuthStatus({
          authenticated: false,
          method: 'none',
          hasApiKey: false,
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Verification failed';
      setCliVerificationStatus('error');
      setCliVerificationError(errorMessage);
    }
  }, []);

  // Save API Key
  const saveApiKey = useCallback(async () => {
    if (!apiKey.trim()) return;

    setIsSavingApiKey(true);
    try {
      const api = getElectronAPI();
      if (api.setup?.storeApiKey) {
        const result = await api.setup.storeApiKey('cursor', apiKey);
        if (result.success) {
          setApiKeys({ ...apiKeys, cursor: apiKey } as any);
          setCursorAuthStatus({
            authenticated: true,
            method: 'api_key',
            hasApiKey: true,
            apiKeyValid: true,
          });
          toast.success('API key saved successfully!');
        } else {
          toast.error(result.error || 'Failed to save API key');
        }
      }
    } catch (error) {
      toast.error('Failed to save API key');
    } finally {
      setIsSavingApiKey(false);
    }
  }, [apiKey, apiKeys, setApiKeys]);

  // Verify API Key
  const verifyApiKeyAuth = useCallback(async () => {
    setApiKeyVerificationStatus('verifying');
    setApiKeyVerificationError(null);

    try {
      const api = getElectronAPI();
      if (!api.setup?.verifyCursorAuth) {
        setApiKeyVerificationStatus('error');
        setApiKeyVerificationError('Verification API not available');
        return;
      }

      const result = await api.setup.verifyCursorAuth('api_key');

      if (result.authenticated) {
        setApiKeyVerificationStatus('verified');
        setCursorAuthStatus({
          authenticated: true,
          method: 'api_key',
          hasApiKey: true,
          apiKeyValid: true,
        });
        toast.success('API key authentication verified!');
      } else {
        setApiKeyVerificationStatus('error');
        setApiKeyVerificationError(result.error || 'Authentication failed');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Verification failed';
      setApiKeyVerificationStatus('error');
      setApiKeyVerificationError(errorMessage);
    }
  }, []);

  // Delete API Key
  const deleteApiKey = useCallback(async () => {
    setIsDeletingApiKey(true);
    try {
      const api = getElectronAPI();
      if (!api.setup?.deleteApiKey) {
        toast.error('Delete API not available');
        return;
      }

      const result = await api.setup.deleteApiKey('cursor');
      if (result.success) {
        setApiKey('');
        setApiKeys({ ...apiKeys, cursor: '' } as any);
        setApiKeyVerificationStatus('idle');
        setApiKeyVerificationError(null);
        setCursorAuthStatus({
          authenticated: false,
          method: 'none',
          hasApiKey: false,
        });
        toast.success('API key deleted successfully');
      } else {
        toast.error(result.error || 'Failed to delete API key');
      }
    } catch (error) {
      toast.error('Failed to delete API key');
    } finally {
      setIsDeletingApiKey(false);
    }
  }, [apiKeys, setApiKeys]);

  // Check status on mount
  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const copyCommand = (command: string) => {
    navigator.clipboard.writeText(command);
    toast.success('Command copied to clipboard');
  };

  // User is ready if either method is verified
  const hasApiKey = !!(apiKeys as any).cursor || cursorAuthStatus?.hasApiKey;
  const isCliVerified = cliVerificationStatus === 'verified';
  const isApiKeyVerified = apiKeyVerificationStatus === 'verified';
  const isReady = isCliVerified || isApiKeyVerified;

  // Helper to get status badge for CLI
  const getCliStatusBadge = () => {
    if (cliVerificationStatus === 'verified') {
      return <StatusBadge status="authenticated" label="Verified" />;
    }
    if (cliVerificationStatus === 'error') {
      return <StatusBadge status="error" label="Error" />;
    }
    if (isChecking) {
      return <StatusBadge status="checking" label="Checking..." />;
    }
    if (cursorCliStatus?.installed) {
      return <StatusBadge status="unverified" label="Unverified" />;
    }
    return <StatusBadge status="not_installed" label="Not Installed" />;
  };

  // Helper to get status badge for API Key
  const getApiKeyStatusBadge = () => {
    if (apiKeyVerificationStatus === 'verified') {
      return <StatusBadge status="authenticated" label="Verified" />;
    }
    if (apiKeyVerificationStatus === 'error') {
      return <StatusBadge status="error" label="Error" />;
    }
    if (hasApiKey) {
      return <StatusBadge status="unverified" label="Unverified" />;
    }
    return <StatusBadge status="not_authenticated" label="Not Set" />;
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-xl bg-purple-500/10 flex items-center justify-center mx-auto mb-4">
          <Wand2 className="w-8 h-8 text-purple-500" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Cursor CLI Setup</h2>
        <p className="text-muted-foreground">Configure Cursor CLI for AI-powered automation</p>
      </div>

      {/* Requirements Info */}
      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Info className="w-5 h-5" />
              Authentication Methods
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={checkStatus} disabled={isChecking}>
              <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
            </Button>
          </div>
          <CardDescription>
            Choose one of the following methods to authenticate with Cursor:
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            {/* Option 1: Cursor CLI */}
            <AccordionItem value="cli" className="border-border">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center justify-between w-full pr-4">
                  <div className="flex items-center gap-3">
                    <Terminal
                      className={`w-5 h-5 ${
                        cliVerificationStatus === 'verified'
                          ? 'text-green-500'
                          : 'text-muted-foreground'
                      }`}
                    />
                    <div className="text-left">
                      <p className="font-medium text-foreground">Cursor CLI</p>
                      <p className="text-sm text-muted-foreground">Use cursor-agent command</p>
                    </div>
                  </div>
                  {getCliStatusBadge()}
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-4 space-y-4">
                {/* CLI Install Section */}
                {!cursorCliStatus?.installed && (
                  <div className="space-y-4 p-4 rounded-lg bg-muted/30 border border-border">
                    <div className="flex items-center gap-2">
                      <Download className="w-4 h-4 text-muted-foreground" />
                      <p className="font-medium text-foreground">Install Cursor CLI</p>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm text-muted-foreground">macOS / Linux</Label>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono text-foreground">
                          curl https://cursor.com/install -fsS | bash
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => copyCommand('curl https://cursor.com/install -fsS | bash')}
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm text-muted-foreground">Windows (PowerShell)</Label>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono text-foreground">
                          iwr https://cursor.com/install -UseBasicParsing | iex
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            copyCommand('iwr https://cursor.com/install -UseBasicParsing | iex')
                          }
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    {isInstalling && <TerminalOutput lines={installOutput} />}

                    <Button
                      onClick={installCursor}
                      disabled={isInstalling}
                      className="w-full bg-purple-500 hover:bg-purple-600 text-white"
                      data-testid="install-cursor-button"
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
                )}

                {/* CLI Version Info */}
                {cursorCliStatus?.installed && cursorCliStatus?.version && (
                  <p className="text-sm text-muted-foreground">
                    Version: {cursorCliStatus.version}
                  </p>
                )}

                {/* CLI Verification Status */}
                {cliVerificationStatus === 'verifying' && (
                  <div className="flex items-center gap-3 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                    <div>
                      <p className="font-medium text-foreground">Verifying CLI authentication...</p>
                      <p className="text-sm text-muted-foreground">Running a test query</p>
                    </div>
                  </div>
                )}

                {cliVerificationStatus === 'verified' && (
                  <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                    <div>
                      <p className="font-medium text-foreground">
                        {verifiedEmail
                          ? `Logged in as ${verifiedEmail}`
                          : 'CLI Authentication verified!'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Your Cursor CLI is ready to use.
                      </p>
                    </div>
                  </div>
                )}

                {cliVerificationStatus === 'error' && cliVerificationError && (
                  <div className="flex items-start gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                    <XCircle className="w-5 h-5 text-red-500 shrink-0" />
                    <div className="flex-1">
                      <p className="font-medium text-foreground">Verification failed</p>
                      <p className="text-sm text-red-400 mt-1">{cliVerificationError}</p>
                    </div>
                  </div>
                )}

                {/* CLI Verify Button */}
                {cliVerificationStatus !== 'verified' && (
                  <Button
                    onClick={verifyCliAuth}
                    disabled={cliVerificationStatus === 'verifying' || !cursorCliStatus?.installed}
                    className="w-full bg-purple-500 hover:bg-purple-600 text-white"
                    data-testid="verify-cursor-cli-button"
                  >
                    {cliVerificationStatus === 'verifying' ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Verifying...
                      </>
                    ) : cliVerificationStatus === 'error' ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Retry Verification
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4 mr-2" />
                        Verify CLI Authentication
                      </>
                    )}
                  </Button>
                )}

                {/* Manual trust option when verification fails */}
                {cliVerificationStatus === 'error' && cursorCliStatus?.installed && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setCliVerificationStatus('verified');
                      setCursorAuthStatus({
                        authenticated: true,
                        method: 'cli_authenticated',
                        hasApiKey: false,
                        apiKeyValid: false,
                      });
                      toast.success('Marked as logged in. Make sure you ran: cursor agent login');
                    }}
                    className="w-full mt-2 border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
                  >
                    I'm already logged in (skip verification)
                  </Button>
                )}
              </AccordionContent>
            </AccordionItem>

            {/* Option 2: API Key */}
            <AccordionItem value="api-key" className="border-border">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center justify-between w-full pr-4">
                  <div className="flex items-center gap-3">
                    <Key
                      className={`w-5 h-5 ${
                        apiKeyVerificationStatus === 'verified'
                          ? 'text-green-500'
                          : 'text-muted-foreground'
                      }`}
                    />
                    <div className="text-left">
                      <p className="font-medium text-foreground">Cursor API Key</p>
                      <p className="text-sm text-muted-foreground">Use your Cursor API key</p>
                    </div>
                  </div>
                  {getApiKeyStatusBadge()}
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-4 space-y-4">
                {/* API Key Input */}
                <div className="space-y-4 p-4 rounded-lg bg-muted/30 border border-border">
                  <div className="space-y-2">
                    <Label htmlFor="cursor-key" className="text-foreground">
                      Cursor API Key
                    </Label>
                    <Input
                      id="cursor-key"
                      type="password"
                      placeholder="Enter your API key..."
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="bg-input border-border text-foreground"
                      data-testid="cursor-api-key-input"
                    />
                    <p className="text-xs text-muted-foreground">
                      Generate an API key from your{' '}
                      <a
                        href="https://cursor.com/settings/api"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-purple-500 hover:underline"
                      >
                        Cursor Dashboard
                        <ExternalLink className="w-3 h-3 inline ml-1" />
                      </a>
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={saveApiKey}
                      disabled={isSavingApiKey || !apiKey.trim()}
                      className="flex-1 bg-purple-500 hover:bg-purple-600 text-white"
                      data-testid="save-cursor-key-button"
                    >
                      {isSavingApiKey ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        'Save API Key'
                      )}
                    </Button>
                    {hasApiKey && (
                      <Button
                        onClick={deleteApiKey}
                        disabled={isDeletingApiKey}
                        variant="outline"
                        className="border-red-500/50 text-red-500 hover:bg-red-500/10 hover:text-red-400"
                        data-testid="delete-cursor-key-button"
                      >
                        {isDeletingApiKey ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>

                {/* API Key Verification Status */}
                {apiKeyVerificationStatus === 'verifying' && (
                  <div className="flex items-center gap-3 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                    <div>
                      <p className="font-medium text-foreground">Verifying API key...</p>
                      <p className="text-sm text-muted-foreground">Running a test query</p>
                    </div>
                  </div>
                )}

                {apiKeyVerificationStatus === 'verified' && (
                  <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                    <div>
                      <p className="font-medium text-foreground">API Key verified!</p>
                      <p className="text-sm text-muted-foreground">
                        Your API key is working correctly.
                      </p>
                    </div>
                  </div>
                )}

                {apiKeyVerificationStatus === 'error' && apiKeyVerificationError && (
                  <div className="flex items-start gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                    <XCircle className="w-5 h-5 text-red-500 shrink-0" />
                    <div className="flex-1">
                      <p className="font-medium text-foreground">Verification failed</p>
                      <p className="text-sm text-red-400 mt-1">{apiKeyVerificationError}</p>
                    </div>
                  </div>
                )}

                {/* API Key Verify Button */}
                {apiKeyVerificationStatus !== 'verified' && (
                  <Button
                    onClick={verifyApiKeyAuth}
                    disabled={apiKeyVerificationStatus === 'verifying' || !hasApiKey}
                    className="w-full bg-purple-500 hover:bg-purple-600 text-white"
                    data-testid="verify-cursor-api-key-button"
                  >
                    {apiKeyVerificationStatus === 'verifying' ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Verifying...
                      </>
                    ) : apiKeyVerificationStatus === 'error' ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Retry Verification
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4 mr-2" />
                        Verify API Key
                      </>
                    )}
                  </Button>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
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
            Skip for now
          </Button>
          <Button
            onClick={onNext}
            disabled={!isReady}
            className="bg-purple-500 hover:bg-purple-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="cursor-next-button"
          >
            Continue
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}
