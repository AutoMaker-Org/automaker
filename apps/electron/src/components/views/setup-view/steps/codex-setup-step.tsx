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
} from "lucide-react";
import { toast } from "sonner";
import { StatusBadge, TerminalOutput } from "../components";
import {
  useCliStatus,
  useCliInstallation,
  useTokenSave,
} from "../hooks";

interface CodexSetupStepProps {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

export function CodexSetupStep({
  onNext,
  onBack,
  onSkip,
}: CodexSetupStepProps) {
  const {
    codexCliStatus,
    codexAuthStatus,
    setCodexCliStatus,
    setCodexAuthStatus,
    setCodexInstallProgress,
  } = useSetupStore();
  const { setApiKeys, apiKeys } = useAppStore();

  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [apiKey, setApiKey] = useState("");

  // Memoize API functions to prevent infinite loops
  const statusApi = useCallback(async () => {
    if (!isBootstrapped()) return { success: false, error: "Services not initialized" };
    return await services.setup.getCodexStatus();
  }, []);

  const installApi = useCallback(async () => {
    if (!isBootstrapped()) return { success: false, error: "Services not initialized" };
    return await services.setup.installCodex();
  }, []);

  // Use custom hooks
  const { isChecking, checkStatus } = useCliStatus({
    cliType: "codex",
    statusApi,
    setCliStatus: setCodexCliStatus,
    setAuthStatus: setCodexAuthStatus,
  });

  const onInstallSuccess = useCallback(() => {
    checkStatus();
  }, [checkStatus]);

  const onProgressEvent = useCallback((callback: (event: any) => void) => {
    if (!isBootstrapped()) return { unsubscribe: () => {} };
    return services.setup.onInstallProgress(callback);
  }, []);

  const { isInstalling, installProgress, install } = useCliInstallation({
    cliType: "codex",
    installApi,
    onProgressEvent,
    onSuccess: onInstallSuccess,
  });

  const { isSaving: isSavingKey, saveToken: saveApiKeyToken } = useTokenSave({
    provider: "openai",
    onSuccess: () => {
      setCodexAuthStatus({
        authenticated: true,
        method: "api_key",
        apiKeyValid: true,
      });
      setApiKeys({ ...apiKeys, openai: apiKey });
      setShowApiKeyInput(false);
      checkStatus();
    },
  });

  // Sync install progress to store
  useEffect(() => {
    setCodexInstallProgress({
      isInstalling,
      output: installProgress.output,
    });
  }, [isInstalling, installProgress, setCodexInstallProgress]);

  // Check status on mount
  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const copyCommand = (command: string) => {
    navigator.clipboard.writeText(command);
    toast.success("Command copied to clipboard");
  };

  const isAuthenticated = codexAuthStatus?.authenticated || apiKeys.openai;

  const getAuthMethodLabel = () => {
    if (!isAuthenticated) return null;
    if (apiKeys.openai) return "API Key (Manual)";
    if (codexAuthStatus?.method === "api_key") return "API Key (Auth File)";
    if (codexAuthStatus?.method === "env") return "API Key (Environment)";
    if (codexAuthStatus?.method === "cli_verified")
      return "CLI Login (ChatGPT)";
    return "Authenticated";
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-xl bg-green-500/10 flex items-center justify-center mx-auto mb-4">
          <Terminal className="w-8 h-8 text-green-500" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">
          Codex CLI Setup
        </h2>
        <p className="text-muted-foreground">
          OpenAI&apos;s GPT-5.1 Codex for advanced code generation
        </p>
      </div>

      {/* Status Card */}
      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Installation Status</CardTitle>
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
            ) : codexCliStatus?.installed ? (
              <StatusBadge status="installed" label="Installed" />
            ) : (
              <StatusBadge status="not_installed" label="Not Installed" />
            )}
          </div>

          {codexCliStatus?.version && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Version</span>
              <span className="text-sm font-mono text-foreground">
                {codexCliStatus.version}
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
      {!codexCliStatus?.installed && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Download className="w-5 h-5" />
              Install Codex CLI
            </CardTitle>
            <CardDescription>
              Install via npm (Node.js required)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">
                npm (Global installation)
              </Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono text-foreground">
                  npm install -g @openai/codex
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => copyCommand("npm install -g @openai/codex")}
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {isInstalling && (
              <TerminalOutput lines={installProgress.output} />
            )}

            <div className="flex gap-2">
              <Button
                onClick={install}
                disabled={isInstalling}
                className="flex-1 bg-green-500 hover:bg-green-600 text-white"
                data-testid="install-codex-button"
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

            <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-yellow-500 mt-0.5" />
                <p className="text-xs text-yellow-600 dark:text-yellow-400">
                  Requires Node.js to be installed. If the auto-install fails,
                  try running the command manually in your terminal.
                </p>
              </div>
            </div>
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
            <CardDescription>Codex requires an OpenAI API key</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {codexCliStatus?.installed && (
              <div className="p-4 rounded-lg bg-muted/50 border border-border">
                <div className="flex items-start gap-3">
                  <Terminal className="w-5 h-5 text-green-500 mt-0.5" />
                  <div>
                    <p className="font-medium text-foreground">
                      Authenticate via CLI
                    </p>
                    <p className="text-sm text-muted-foreground mb-2">
                      Run this command in your terminal:
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="bg-muted px-3 py-1 rounded text-sm font-mono text-foreground">
                        codex auth login
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => copyCommand("codex auth login")}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">
                  or enter API key
                </span>
              </div>
            </div>

            {showApiKeyInput ? (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="openai-key" className="text-foreground">
                    OpenAI API Key
                  </Label>
                  <Input
                    id="openai-key"
                    type="password"
                    placeholder="sk-..."
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="bg-input border-border text-foreground"
                    data-testid="openai-api-key-input"
                  />
                  <p className="text-xs text-muted-foreground">
                    Get your API key from{" "}
                    <a
                      href="https://platform.openai.com/api-keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-green-500 hover:underline"
                    >
                      platform.openai.com
                      <ExternalLink className="w-3 h-3 inline ml-1" />
                    </a>
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowApiKeyInput(false)}
                    className="border-border"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => saveApiKeyToken(apiKey)}
                    disabled={isSavingKey || !apiKey.trim()}
                    className="flex-1 bg-green-500 hover:bg-green-600 text-white"
                    data-testid="save-openai-key-button"
                  >
                    {isSavingKey ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      "Save API Key"
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                onClick={() => setShowApiKeyInput(true)}
                className="w-full border-border"
                data-testid="use-openai-key-button"
              >
                <Key className="w-4 h-4 mr-2" />
                Enter OpenAI API Key
              </Button>
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
                  Codex is ready to use!
                </p>
                <p className="text-sm text-muted-foreground">
                  {getAuthMethodLabel() &&
                    `Authenticated via ${getAuthMethodLabel()}. `}
                  You can proceed to complete setup
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
            className="bg-green-500 hover:bg-green-600 text-white"
            data-testid="codex-next-button"
          >
            Continue
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}
