// @ts-nocheck
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
import { useAppStore } from '@/store/app-store';
import { getElectronAPI } from '@/lib/electron';
import {
  CheckCircle2,
  Loader2,
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
} from 'lucide-react';
import { toast } from 'sonner';
import { StatusBadge, TerminalOutput } from '../components';
import { useCliStatus, useCliInstallation, useTokenSave } from '../hooks';
import type { ApiKeys } from '@/store/app-store';
import type { ModelProvider } from '@/store/app-store';
import type { ProviderKey } from '@/config/api-providers';
import type {
  CliStatus,
  InstallProgress,
  ClaudeAuthStatus,
  CodexAuthStatus,
} from '@/store/setup-store';
import { PROVIDER_ICON_COMPONENTS } from '@/components/ui/provider-icon';

type VerificationStatus = 'idle' | 'verifying' | 'verified' | 'error';

type CliSetupAuthStatus = ClaudeAuthStatus | CodexAuthStatus;

interface CliSetupConfig {
  cliType: ModelProvider;
  displayName: string;
  cliLabel: string;
  cliDescription: string;
  apiKeyLabel: string;
  apiKeyDescription: string;
  apiKeyProvider: ProviderKey;
  apiKeyPlaceholder: string;
  apiKeyDocsUrl: string;
  apiKeyDocsLabel: string;
  installCommands: {
    macos: string;
    windows: string;
  };
  cliLoginCommand: string;
  testIds: {
    installButton: string;
    verifyCliButton: string;
    verifyApiKeyButton: string;
    apiKeyInput: string;
    saveApiKeyButton: string;
    deleteApiKeyButton: string;
    nextButton: string;
  };
  buildCliAuthStatus: (previous: CliSetupAuthStatus | null) => CliSetupAuthStatus;
  buildApiKeyAuthStatus: (previous: CliSetupAuthStatus | null) => CliSetupAuthStatus;
  buildClearedAuthStatus: (previous: CliSetupAuthStatus | null) => CliSetupAuthStatus;
  statusApi: () => Promise<any>;
  installApi: () => Promise<any>;
  verifyAuthApi: (
    method: 'cli' | 'api_key',
    apiKey?: string
  ) => Promise<{
    success: boolean;
    authenticated: boolean;
    error?: string;
    details?: string;
  }>;
  apiKeyHelpText: string;
}

interface CliSetupStateHandlers {
  cliStatus: CliStatus | null;
  authStatus: CliSetupAuthStatus | null;
  setCliStatus: (status: CliStatus | null) => void;
  setAuthStatus: (status: CliSetupAuthStatus | null) => void;
  setInstallProgress: (progress: Partial<InstallProgress>) => void;
  getStoreState: () => CliStatus | null;
}

interface CliSetupStepProps {
  config: CliSetupConfig;
  state: CliSetupStateHandlers;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

export function CliSetupStep({ config, state, onNext, onBack, onSkip }: CliSetupStepProps) {
  const { apiKeys, setApiKeys } = useAppStore();
  const { cliStatus, authStatus, setCliStatus, setAuthStatus, setInstallProgress, getStoreState } =
    state;

  const [apiKey, setApiKey] = useState('');

  const [cliVerificationStatus, setCliVerificationStatus] = useState<VerificationStatus>('idle');
  const [cliVerificationError, setCliVerificationError] = useState<string | null>(null);

  const [apiKeyVerificationStatus, setApiKeyVerificationStatus] =
    useState<VerificationStatus>('idle');
  const [apiKeyVerificationError, setApiKeyVerificationError] = useState<string | null>(null);

  const [isDeletingApiKey, setIsDeletingApiKey] = useState(false);

  const statusApi = useCallback(() => config.statusApi(), [config]);
  const installApi = useCallback(() => config.installApi(), [config]);

  const { isChecking, checkStatus } = useCliStatus({
    cliType: config.cliType,
    statusApi,
    setCliStatus,
    setAuthStatus,
  });

  const onInstallSuccess = useCallback(() => {
    checkStatus();
  }, [checkStatus]);

  const { isInstalling, installProgress, install } = useCliInstallation({
    cliType: config.cliType,
    installApi,
    onProgressEvent: getElectronAPI().setup?.onInstallProgress,
    onSuccess: onInstallSuccess,
    getStoreState,
  });

  const { isSaving: isSavingApiKey, saveToken: saveApiKeyToken } = useTokenSave({
    provider: config.apiKeyProvider,
    onSuccess: () => {
      setAuthStatus(config.buildApiKeyAuthStatus(authStatus));
      setApiKeys({ ...apiKeys, [config.apiKeyProvider]: apiKey });
      toast.success('API key saved successfully!');
    },
  });

  const verifyCliAuth = useCallback(async () => {
    setCliVerificationStatus('verifying');
    setCliVerificationError(null);

    try {
      const result = await config.verifyAuthApi('cli');

      const hasLimitOrBillingError =
        result.error?.toLowerCase().includes('limit reached') ||
        result.error?.toLowerCase().includes('rate limit') ||
        result.error?.toLowerCase().includes('credit balance') ||
        result.error?.toLowerCase().includes('billing');

      if (result.authenticated) {
        // Auth succeeded - even if rate limited or billing issue
        setCliVerificationStatus('verified');
        setAuthStatus(config.buildCliAuthStatus(authStatus));

        if (hasLimitOrBillingError) {
          // Show warning but keep auth verified
          toast.warning(result.error || 'Rate limit or billing issue');
        } else {
          toast.success(`${config.displayName} CLI authentication verified!`);
        }
      } else {
        // Actual auth failure
        setCliVerificationStatus('error');
        // Include detailed error if available
        const errorDisplay = result.details
          ? `${result.error}\n\nDetails: ${result.details}`
          : result.error || 'Authentication failed';
        setCliVerificationError(errorDisplay);
        setAuthStatus(config.buildClearedAuthStatus(authStatus));
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Verification failed';
      setCliVerificationStatus('error');
      setCliVerificationError(errorMessage);
    }
  }, [authStatus, config, setAuthStatus]);

  const verifyApiKeyAuth = useCallback(async () => {
    setApiKeyVerificationStatus('verifying');
    setApiKeyVerificationError(null);

    try {
      const result = await config.verifyAuthApi('api_key', apiKey);

      const hasLimitOrBillingError =
        result.error?.toLowerCase().includes('limit reached') ||
        result.error?.toLowerCase().includes('rate limit') ||
        result.error?.toLowerCase().includes('credit balance') ||
        result.error?.toLowerCase().includes('billing');

      if (result.authenticated) {
        // Auth succeeded - even if rate limited or billing issue
        setApiKeyVerificationStatus('verified');
        setAuthStatus(config.buildApiKeyAuthStatus(authStatus));

        if (hasLimitOrBillingError) {
          // Show warning but keep auth verified
          toast.warning(result.error || 'Rate limit or billing issue');
        } else {
          toast.success('API key authentication verified!');
        }
      } else {
        // Actual auth failure
        setApiKeyVerificationStatus('error');
        // Include detailed error if available
        const errorDisplay = result.details
          ? `${result.error}\n\nDetails: ${result.details}`
          : result.error || 'Authentication failed';
        setApiKeyVerificationError(errorDisplay);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Verification failed';
      setApiKeyVerificationStatus('error');
      setApiKeyVerificationError(errorMessage);
    }
  }, [authStatus, config, setAuthStatus]);

  const deleteApiKey = useCallback(async () => {
    setIsDeletingApiKey(true);
    try {
      const api = getElectronAPI();
      if (!api.setup?.deleteApiKey) {
        toast.error('Delete API not available');
        return;
      }

      const result = await api.setup.deleteApiKey(config.apiKeyProvider);
      if (result.success) {
        setApiKey('');
        setApiKeys({ ...apiKeys, [config.apiKeyProvider]: '' });
        setApiKeyVerificationStatus('idle');
        setApiKeyVerificationError(null);
        setAuthStatus(config.buildClearedAuthStatus(authStatus));
        toast.success('API key deleted successfully');
      } else {
        toast.error(result.error || 'Failed to delete API key');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete API key';
      toast.error(errorMessage);
    } finally {
      setIsDeletingApiKey(false);
    }
  }, [apiKeys, authStatus, config, setApiKeys, setAuthStatus]);

  useEffect(() => {
    setInstallProgress({
      isInstalling,
      output: installProgress.output,
    });
  }, [isInstalling, installProgress, setInstallProgress]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const copyCommand = (command: string) => {
    navigator.clipboard.writeText(command);
    toast.success('Command copied to clipboard');
  };

  const hasApiKey =
    !!(apiKeys as ApiKeys)[config.apiKeyProvider] ||
    authStatus?.method === 'api_key' ||
    authStatus?.method === 'api_key_env';
  const isCliVerified = cliVerificationStatus === 'verified';
  const isApiKeyVerified = apiKeyVerificationStatus === 'verified';
  const isReady = isCliVerified || isApiKeyVerified;
  const ProviderIcon = PROVIDER_ICON_COMPONENTS[config.cliType];

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
    if (cliStatus?.installed) {
      return <StatusBadge status="unverified" label="Unverified" />;
    }
    return <StatusBadge status="not_installed" label="Not Installed" />;
  };

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
        <div className="w-16 h-16 rounded-xl bg-brand-500/10 flex items-center justify-center mx-auto mb-4">
          <ProviderIcon className="w-8 h-8 text-brand-500" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">{config.displayName} Setup</h2>
        <p className="text-muted-foreground">Configure authentication for code generation</p>
      </div>

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
          <CardDescription>Choose one of the following methods to authenticate:</CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="cli" className="border-border">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center justify-between w-full pr-4">
                  <div className="flex items-center gap-3">
                    <ProviderIcon
                      className={`w-5 h-5 ${
                        cliVerificationStatus === 'verified'
                          ? 'text-green-500'
                          : 'text-muted-foreground'
                      }`}
                    />
                    <div className="text-left">
                      <p className="font-medium text-foreground">{config.cliLabel}</p>
                      <p className="text-sm text-muted-foreground">{config.cliDescription}</p>
                    </div>
                  </div>
                  {getCliStatusBadge()}
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-4 space-y-4">
                {!cliStatus?.installed && (
                  <div className="space-y-4 p-4 rounded-lg bg-muted/30 border border-border">
                    <div className="flex items-center gap-2">
                      <Download className="w-4 h-4 text-muted-foreground" />
                      <p className="font-medium text-foreground">Install {config.cliLabel}</p>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm text-muted-foreground">macOS / Linux</Label>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono text-foreground">
                          {config.installCommands.macos}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => copyCommand(config.installCommands.macos)}
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm text-muted-foreground">Windows</Label>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono text-foreground">
                          {config.installCommands.windows}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => copyCommand(config.installCommands.windows)}
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
                      data-testid={config.testIds.installButton}
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

                {cliStatus?.installed && cliStatus?.version && (
                  <p className="text-sm text-muted-foreground">Version: {cliStatus.version}</p>
                )}

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
                      <p className="font-medium text-foreground">CLI Authentication verified!</p>
                      <p className="text-sm text-muted-foreground">
                        Your {config.displayName} CLI is working correctly.
                      </p>
                    </div>
                  </div>
                )}

                {cliVerificationStatus === 'error' && cliVerificationError && (
                  <div className="flex items-start gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                    <XCircle className="w-5 h-5 text-red-500 shrink-0" />
                    <div className="flex-1 space-y-2">
                      <p className="font-medium text-foreground">Verification failed</p>
                      {(() => {
                        const parts = cliVerificationError.split('\n\nDetails: ');
                        const mainError = parts[0];
                        const details = parts[1];
                        const errorLower = cliVerificationError.toLowerCase();

                        // Check if this is actually a usage limit issue, not an auth problem
                        const isUsageLimitIssue =
                          errorLower.includes('usage limit') ||
                          errorLower.includes('rate limit') ||
                          errorLower.includes('limit reached') ||
                          errorLower.includes('too many requests') ||
                          errorLower.includes('credit balance') ||
                          errorLower.includes('billing') ||
                          errorLower.includes('insufficient credits') ||
                          errorLower.includes('upgrade to pro');

                        // Categorize error and provide helpful suggestions
                        // IMPORTANT: Don't suggest re-authentication for usage limits!
                        const getHelpfulSuggestion = () => {
                          // Usage limit issue - NOT an authentication problem
                          if (isUsageLimitIssue) {
                            return {
                              title: 'Usage limit issue (not authentication)',
                              message:
                                'Your login credentials are working fine. This is a rate limit or billing error.',
                              action: 'Wait a few minutes and try again, or check your billing',
                            };
                          }

                          // Token refresh failures
                          if (
                            errorLower.includes('tokenrefresh') ||
                            errorLower.includes('token refresh')
                          ) {
                            return {
                              title: 'Token refresh failed',
                              message: 'Your OAuth token needs to be refreshed.',
                              action: 'Re-authenticate',
                              command: config.cliLoginCommand,
                            };
                          }

                          // Connection/transport issues
                          if (errorLower.includes('transport channel closed')) {
                            return {
                              title: 'Connection issue',
                              message:
                                'The connection to the authentication server was interrupted.',
                              action: 'Try again or re-authenticate',
                              command: config.cliLoginCommand,
                            };
                          }

                          // Invalid API key
                          if (errorLower.includes('invalid') && errorLower.includes('api key')) {
                            return {
                              title: 'Invalid API key',
                              message: 'Your API key is incorrect or has been revoked.',
                              action: 'Check your API key or get a new one',
                            };
                          }

                          // Expired token
                          if (errorLower.includes('expired')) {
                            return {
                              title: 'Token expired',
                              message: 'Your authentication token has expired.',
                              action: 'Re-authenticate',
                              command: config.cliLoginCommand,
                            };
                          }

                          // Authentication required
                          if (errorLower.includes('login') || errorLower.includes('authenticate')) {
                            return {
                              title: 'Authentication required',
                              message: 'You need to authenticate with your account.',
                              action: 'Run the login command',
                              command: config.cliLoginCommand,
                            };
                          }

                          return null;
                        };

                        const suggestion = getHelpfulSuggestion();

                        return (
                          <>
                            <p className="text-sm text-red-400">{mainError}</p>
                            {details && (
                              <div className="mt-2 p-3 rounded bg-black/20 border border-red-500/20">
                                <p className="text-xs font-medium text-muted-foreground mb-1">
                                  Technical details:
                                </p>
                                <pre className="text-xs text-red-300 whitespace-pre-wrap font-mono">
                                  {details}
                                </pre>
                              </div>
                            )}
                            {suggestion && (
                              <div className="mt-3 p-3 rounded bg-muted/50 border border-border">
                                <div className="flex items-start gap-2 mb-2">
                                  <span className="text-sm font-medium text-foreground">
                                    💡 {suggestion.title}
                                  </span>
                                </div>
                                <p className="text-sm text-muted-foreground mb-2">
                                  {suggestion.message}
                                </p>
                                {suggestion.command && (
                                  <>
                                    <p className="text-xs text-muted-foreground mb-2">
                                      {suggestion.action}:
                                    </p>
                                    <div className="flex items-center gap-2">
                                      <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono text-foreground">
                                        {suggestion.command}
                                      </code>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => copyCommand(suggestion.command)}
                                      >
                                        <Copy className="w-4 h-4" />
                                      </Button>
                                    </div>
                                  </>
                                )}
                                {!suggestion.command && (
                                  <p className="text-xs font-medium text-brand-500">
                                    → {suggestion.action}
                                  </p>
                                )}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {cliVerificationStatus !== 'verified' && (
                  <Button
                    onClick={verifyCliAuth}
                    disabled={cliVerificationStatus === 'verifying' || !cliStatus?.installed}
                    className="w-full bg-brand-500 hover:bg-brand-600 text-white"
                    data-testid={config.testIds.verifyCliButton}
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
              </AccordionContent>
            </AccordionItem>

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
                      <p className="font-medium text-foreground">{config.apiKeyLabel}</p>
                      <p className="text-sm text-muted-foreground">{config.apiKeyDescription}</p>
                    </div>
                  </div>
                  {getApiKeyStatusBadge()}
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-4 space-y-4">
                <div className="space-y-4 p-4 rounded-lg bg-muted/30 border border-border">
                  <div className="space-y-2">
                    <Label htmlFor={config.testIds.apiKeyInput} className="text-foreground">
                      {config.apiKeyLabel}
                    </Label>
                    <Input
                      id={config.testIds.apiKeyInput}
                      type="password"
                      placeholder={config.apiKeyPlaceholder}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="bg-input border-border text-foreground"
                      data-testid={config.testIds.apiKeyInput}
                    />
                    <p className="text-xs text-muted-foreground">
                      {config.apiKeyHelpText}{' '}
                      <a
                        href={config.apiKeyDocsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-500 hover:underline"
                      >
                        {config.apiKeyDocsLabel}
                        <ExternalLink className="w-3 h-3 inline ml-1" />
                      </a>
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={() => saveApiKeyToken(apiKey)}
                      disabled={isSavingApiKey || !apiKey.trim()}
                      className="flex-1 bg-brand-500 hover:bg-brand-600 text-white"
                      data-testid={config.testIds.saveApiKeyButton}
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
                        data-testid={config.testIds.deleteApiKeyButton}
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
                    <div className="flex-1 space-y-2">
                      <p className="font-medium text-foreground">Verification failed</p>
                      {(() => {
                        const parts = apiKeyVerificationError.split('\n\nDetails: ');
                        const mainError = parts[0];
                        const details = parts[1];

                        return (
                          <>
                            <p className="text-sm text-red-400">{mainError}</p>
                            {details && (
                              <div className="mt-2 p-3 rounded bg-black/20 border border-red-500/20">
                                <p className="text-xs font-medium text-muted-foreground mb-1">
                                  Technical details:
                                </p>
                                <pre className="text-xs text-red-300 whitespace-pre-wrap font-mono">
                                  {details}
                                </pre>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {apiKeyVerificationStatus !== 'verified' && (
                  <Button
                    onClick={verifyApiKeyAuth}
                    disabled={apiKeyVerificationStatus === 'verifying' || !hasApiKey}
                    className="w-full bg-brand-500 hover:bg-brand-600 text-white"
                    data-testid={config.testIds.verifyApiKeyButton}
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
            className="bg-brand-500 hover:bg-brand-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid={config.testIds.nextButton}
          >
            Continue
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}
