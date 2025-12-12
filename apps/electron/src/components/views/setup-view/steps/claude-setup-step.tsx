"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useSetupStore } from "@/store/setup-store";
import { useAppStore } from "@/store/app-store";
import { services, isBootstrapped } from "@/services";
import {
  CheckCircle2,
  Loader2,
  Terminal,
  Key,
  ArrowRight,
  ArrowLeft,
  ExternalLink,
  Copy,
  AlertCircle,
  RefreshCw,
  Download,
  Shield,
} from "lucide-react";
import { toast } from "sonner";
import { SetupTokenModal } from "../dialogs";
import { StatusBadge, TerminalOutput } from "../components";
import {
  useCliStatus,
  useCliInstallation,
  useTokenSave,
} from "../hooks";

interface ClaudeSetupStepProps {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

// Claude Setup Step - 2 Authentication Options:
// 1. OAuth Token (Subscription): User runs `claude setup-token` and provides the token
// 2. API Key (Pay-per-use): User provides their Anthropic API key directly
export function ClaudeSetupStep({
  onNext,
  onBack,
  onSkip,
}: ClaudeSetupStepProps) {
  const {
    claudeCliStatus,
    claudeAuthStatus,
    setClaudeCliStatus,
    setClaudeAuthStatus,
    setClaudeInstallProgress,
  } = useSetupStore();
  const { setApiKeys, apiKeys } = useAppStore();

  const [authMethod, setAuthMethod] = useState<"token" | "api_key" | null>(null);
  const [oauthToken, setOAuthToken] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showTokenModal, setShowTokenModal] = useState(false);

  // Memoize API functions to prevent infinite loops
  const statusApi = useCallback(async () => {
    if (!isBootstrapped()) return { success: false, error: "Services not initialized" };
    return await services.setup.getClaudeStatus();
  }, []);

  const installApi = useCallback(async () => {
    if (!isBootstrapped()) return { success: false, error: "Services not initialized" };
    return await services.setup.installClaude();
  }, []);

  const getStoreState = useCallback(
    () => useSetupStore.getState().claudeCliStatus,
    []
  );

  // Use custom hooks
  const { isChecking, checkStatus } = useCliStatus({
    cliType: "claude",
    statusApi,
    setCliStatus: setClaudeCliStatus,
    setAuthStatus: setClaudeAuthStatus,
  });

  const onInstallSuccess = useCallback(() => {
    checkStatus();
  }, [checkStatus]);

  const onProgressEvent = useCallback((callback: (event: any) => void) => {
    if (!isBootstrapped()) return { unsubscribe: () => {} };
    return services.setup.onInstallProgress(callback);
  }, []);

  const { isInstalling, installProgress, install } = useCliInstallation({
    cliType: "claude",
    installApi,
    onProgressEvent,
    onSuccess: onInstallSuccess,
    getStoreState,
  });

  const { isSaving: isSavingOAuth, saveToken: saveOAuthToken } = useTokenSave({
    provider: "anthropic_oauth_token",
    onSuccess: () => {
      setClaudeAuthStatus({
        authenticated: true,
        method: "oauth_token",
        hasCredentialsFile: false,
        oauthTokenValid: true,
      });
      setAuthMethod(null);
      checkStatus();
    },
  });

  const { isSaving: isSavingApiKey, saveToken: saveApiKeyToken } = useTokenSave({
    provider: "anthropic",
    onSuccess: () => {
      setClaudeAuthStatus({
        authenticated: true,
        method: "api_key",
        hasCredentialsFile: false,
        apiKeyValid: true,
      });
      setApiKeys({ ...apiKeys, anthropic: apiKey });
      setAuthMethod(null);
      checkStatus();
    },
  });

  // Sync install progress to store
  useEffect(() => {
    setClaudeInstallProgress({
      isInstalling,
      output: installProgress.output,
    });
  }, [isInstalling, installProgress, setClaudeInstallProgress]);

  // Check status on mount
  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const copyCommand = (command: string) => {
    navigator.clipboard.writeText(command);
    toast.success("Command copied to clipboard");
  };

  // Handle token obtained from the OAuth modal
  const handleTokenFromModal = useCallback(
    async (token: string) => {
      setOAuthToken(token);
      setShowTokenModal(false);
      await saveOAuthToken(token);
    },
    [saveOAuthToken]
  );

  const isAuthenticated = claudeAuthStatus?.authenticated || apiKeys.anthropic;

  const getAuthMethodLabel = () => {
    if (!isAuthenticated) return null;
    if (
      claudeAuthStatus?.method === "oauth_token_env" ||
      claudeAuthStatus?.method === "oauth_token"
    )
      return "Subscription Token";
    if (
      apiKeys.anthropic ||
      claudeAuthStatus?.method === "api_key" ||
      claudeAuthStatus?.method === "api_key_env"
    )
      return "API Key";
    return "Authenticated";
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-xl bg-brand-500/10 flex items-center justify-center mx-auto mb-4">
          <Terminal className="w-8 h-8 text-brand-500" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">
          Claude Setup
        </h2>
        <p className="text-muted-foreground">
          Configure Claude for code generation
        </p>
      </div>

      {/* Status Card */}
      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Status</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={checkStatus}
              disabled={isChecking}
            >
              <RefreshCw
                className={`w-4 h-4 ${isChecking ? "animate-spin" : ""}`}
              />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground">CLI Installation</span>
            {isChecking ? (
              <StatusBadge status="checking" label="Checking..." />
            ) : claudeCliStatus?.installed ? (
              <StatusBadge status="installed" label="Installed" />
            ) : (
              <StatusBadge status="not_installed" label="Not Installed" />
            )}
          </div>

          {claudeCliStatus?.version && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Version</span>
              <span className="text-sm font-mono text-foreground">
                {claudeCliStatus.version}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground">Authentication</span>
            {isAuthenticated ? (
              <div className="flex items-center gap-2">
                <StatusBadge status="authenticated" label="Authenticated" />
                {getAuthMethodLabel() && (
                  <span className="text-xs text-muted-foreground">
                    ({getAuthMethodLabel()})
                  </span>
                )}
              </div>
            ) : (
              <StatusBadge
                status="not_authenticated"
                label="Not Authenticated"
              />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Installation Section */}
      {!claudeCliStatus?.installed && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Download className="w-5 h-5" />
              Install Claude CLI
            </CardTitle>
            <CardDescription>
              Required for subscription-based authentication
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">
                macOS / Linux
              </Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono text-foreground">
                  curl -fsSL https://claude.ai/install.sh | bash
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    copyCommand(
                      "curl -fsSL https://claude.ai/install.sh | bash"
                    )
                  }
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Windows</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono text-foreground">
                  irm https://claude.ai/install.ps1 | iex
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    copyCommand("irm https://claude.ai/install.ps1 | iex")
                  }
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {isInstalling && (
              <TerminalOutput lines={installProgress.output} />
            )}

            <Button
              onClick={install}
              disabled={isInstalling}
              className="w-full bg-brand-500 hover:bg-brand-600 text-white"
              data-testid="install-claude-button"
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
          </CardContent>
        </Card>
      )}

      {/* Authentication Section */}
      {!isAuthenticated && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Key className="w-5 h-5" />
              Authentication
            </CardTitle>
            <CardDescription>Choose your authentication method</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Option 1: Subscription Token */}
            {authMethod === "token" ? (
              <div className="p-4 rounded-lg bg-brand-500/5 border border-brand-500/20 space-y-4">
                <div className="flex items-start gap-3">
                  <Shield className="w-5 h-5 text-brand-500 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-foreground">
                      Subscription Token
                    </p>
                    <p className="text-sm text-muted-foreground mb-3">
                      Use your Claude subscription (no API charges)
                    </p>

                    {claudeCliStatus?.installed ? (
                      <>
                        {/* Primary: Automated OAuth setup */}
                        <Button
                          onClick={() => setShowTokenModal(true)}
                          className="w-full bg-brand-500 hover:bg-brand-600 text-white mb-4"
                          data-testid="setup-oauth-button"
                        >
                          <Terminal className="w-4 h-4 mr-2" />
                          Setup with OAuth
                        </Button>

                        {/* Divider */}
                        <div className="relative my-4">
                          <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t border-border" />
                          </div>
                          <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-brand-500/5 px-2 text-muted-foreground">
                              or paste manually
                            </span>
                          </div>
                        </div>

                        {/* Fallback: Manual token entry */}
                        <div className="space-y-2">
                          <Label className="text-foreground text-sm">
                            Paste token from{" "}
                            <code className="bg-muted px-1 py-0.5 rounded text-xs">
                              claude setup-token
                            </code>
                            :
                          </Label>
                          <Input
                            type="password"
                            placeholder="Paste token here..."
                            value={oauthToken}
                            onChange={(e) => setOAuthToken(e.target.value)}
                            className="bg-input border-border text-foreground"
                            data-testid="oauth-token-input"
                          />
                        </div>

                        <div className="flex gap-2 mt-3">
                          <Button
                            variant="outline"
                            onClick={() => setAuthMethod(null)}
                            className="border-border"
                          >
                            Cancel
                          </Button>
                          <Button
                            onClick={() => saveOAuthToken(oauthToken)}
                            disabled={isSavingOAuth || !oauthToken.trim()}
                            className="flex-1 bg-brand-500 hover:bg-brand-600 text-white"
                            data-testid="save-oauth-token-button"
                          >
                            {isSavingOAuth ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              "Save Token"
                            )}
                          </Button>
                        </div>
                      </>
                    ) : (
                      <div className="p-3 rounded bg-yellow-500/10 border border-yellow-500/20">
                        <p className="text-sm text-yellow-600">
                          <AlertCircle className="w-4 h-4 inline mr-1" />
                          Install Claude CLI first to use subscription
                          authentication
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : authMethod === "api_key" ? (
              /* Option 2: API Key */
              <div className="p-4 rounded-lg bg-green-500/5 border border-green-500/20 space-y-4">
                <div className="flex items-start gap-3">
                  <Key className="w-5 h-5 text-green-500 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-foreground">API Key</p>
                    <p className="text-sm text-muted-foreground mb-3">
                      Pay-per-use with your Anthropic API key
                    </p>

                    <div className="space-y-2">
                      <Label
                        htmlFor="anthropic-key"
                        className="text-foreground"
                      >
                        Anthropic API Key
                      </Label>
                      <Input
                        id="anthropic-key"
                        type="password"
                        placeholder="sk-ant-..."
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        className="bg-input border-border text-foreground"
                        data-testid="anthropic-api-key-input"
                      />
                      <p className="text-xs text-muted-foreground">
                        Get your API key from{" "}
                        <a
                          href="https://console.anthropic.com/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-brand-500 hover:underline"
                        >
                          console.anthropic.com
                          <ExternalLink className="w-3 h-3 inline ml-1" />
                        </a>
                      </p>
                    </div>

                    <div className="flex gap-2 mt-3">
                      <Button
                        variant="outline"
                        onClick={() => setAuthMethod(null)}
                        className="border-border"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={() => saveApiKeyToken(apiKey)}
                        disabled={isSavingApiKey || !apiKey.trim()}
                        className="flex-1 bg-green-500 hover:bg-green-600 text-white"
                        data-testid="save-anthropic-key-button"
                      >
                        {isSavingApiKey ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          "Save API Key"
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* Auth Method Selection */
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  onClick={() => setAuthMethod("token")}
                  className="p-4 rounded-lg border border-border hover:border-brand-500/50 bg-card hover:bg-brand-500/5 transition-all text-left"
                  data-testid="select-subscription-auth"
                >
                  <div className="flex items-start gap-3">
                    <Shield className="w-6 h-6 text-brand-500" />
                    <div>
                      <p className="font-medium text-foreground">
                        Subscription
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Use your Claude subscription
                      </p>
                      <p className="text-xs text-brand-500 mt-2">
                        No API charges
                      </p>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => setAuthMethod("api_key")}
                  className="p-4 rounded-lg border border-border hover:border-green-500/50 bg-card hover:bg-green-500/5 transition-all text-left"
                  data-testid="select-api-key-auth"
                >
                  <div className="flex items-start gap-3">
                    <Key className="w-6 h-6 text-green-500" />
                    <div>
                      <p className="font-medium text-foreground">API Key</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Use Anthropic API key
                      </p>
                      <p className="text-xs text-green-500 mt-2">Pay-per-use</p>
                    </div>
                  </div>
                </button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Success State */}
      {isAuthenticated && (
        <Card className="bg-green-500/5 border-green-500/20">
          <CardContent className="py-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-green-500" />
              </div>
              <div>
                <p className="font-medium text-foreground">
                  Claude is ready to use!
                </p>
                <p className="text-sm text-muted-foreground">
                  {getAuthMethodLabel() && `Using ${getAuthMethodLabel()}. `}You
                  can proceed to the next step
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <Button
          variant="ghost"
          onClick={onBack}
          className="text-muted-foreground"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            onClick={onSkip}
            className="text-muted-foreground"
          >
            Skip for now
          </Button>
          <Button
            onClick={onNext}
            className="bg-brand-500 hover:bg-brand-600 text-white"
            data-testid="claude-next-button"
          >
            Continue
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>

      {/* OAuth Setup Modal */}
      <SetupTokenModal
        open={showTokenModal}
        onClose={() => setShowTokenModal(false)}
        onTokenObtained={handleTokenFromModal}
      />
    </div>
  );
}
