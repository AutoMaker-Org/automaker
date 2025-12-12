import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  CheckCircle2,
  AlertCircle,
  Shield,
  Sparkles,
} from "lucide-react";
import { useSetupStore } from "@/store/setup-store";
import { useAppStore } from "@/store/app-store";

interface CompleteStepProps {
  onFinish: () => void;
}

export function CompleteStep({ onFinish }: CompleteStepProps) {
  const { claudeCliStatus, claudeAuthStatus, codexCliStatus, codexAuthStatus } =
    useSetupStore();
  const { apiKeys } = useAppStore();

  const claudeReady =
    (claudeCliStatus?.installed && claudeAuthStatus?.authenticated) ||
    apiKeys.anthropic;
  const codexReady =
    (codexCliStatus?.installed && codexAuthStatus?.authenticated) ||
    apiKeys.openai;

  return (
    <div className="text-center space-y-6">
      <div className="w-20 h-20 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 shadow-lg shadow-green-500/30 flex items-center justify-center mx-auto">
        <CheckCircle2 className="w-10 h-10 text-white" />
      </div>

      <div>
        <h2 className="text-3xl font-bold text-foreground mb-3">
          Setup Complete!
        </h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          Your development environment is configured. You&apos;re ready to start
          building with AI-powered assistance.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
        <Card
          className={`bg-card/50 border ${
            claudeReady ? "border-green-500/50" : "border-yellow-500/50"
          }`}
        >
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              {claudeReady ? (
                <CheckCircle2 className="w-6 h-6 text-green-500" />
              ) : (
                <AlertCircle className="w-6 h-6 text-yellow-500" />
              )}
              <div className="text-left">
                <p className="font-medium text-foreground">Claude</p>
                <p className="text-sm text-muted-foreground">
                  {claudeReady ? "Ready to use" : "Configure later in settings"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card
          className={`bg-card/50 border ${
            codexReady ? "border-green-500/50" : "border-yellow-500/50"
          }`}
        >
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              {codexReady ? (
                <CheckCircle2 className="w-6 h-6 text-green-500" />
              ) : (
                <AlertCircle className="w-6 h-6 text-yellow-500" />
              )}
              <div className="text-left">
                <p className="font-medium text-foreground">Codex</p>
                <p className="text-sm text-muted-foreground">
                  {codexReady ? "Ready to use" : "Configure later in settings"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="p-4 rounded-lg bg-muted/50 border border-border max-w-md mx-auto">
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 text-brand-500 mt-0.5" />
          <div className="text-left">
            <p className="text-sm font-medium text-foreground">
              Your credentials are secure
            </p>
            <p className="text-xs text-muted-foreground">
              API keys are stored locally and never sent to our servers
            </p>
          </div>
        </div>
      </div>

      <Button
        size="lg"
        className="bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 text-white"
        onClick={onFinish}
        data-testid="setup-finish-button"
      >
        <Sparkles className="w-4 h-4 mr-2" />
        Start Building
      </Button>
    </div>
  );
}
