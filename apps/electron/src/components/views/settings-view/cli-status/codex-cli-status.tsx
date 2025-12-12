import { Button } from "@/components/ui/button";
import {
  Terminal,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import type { CliStatus } from "../shared/types";

interface CliStatusProps {
  status: CliStatus | null;
  isChecking: boolean;
  onRefresh: () => void;
}

export function CodexCliStatus({
  status,
  isChecking,
  onRefresh,
}: CliStatusProps) {
  if (!status) return null;

  return (
    <div
      id="codex"
      className="rounded-xl border border-border bg-card backdrop-blur-md overflow-hidden scroll-mt-6"
    >
      <div className="p-6 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-green-500" />
            <h2 className="text-lg font-semibold text-foreground">
              OpenAI Codex CLI
            </h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            disabled={isChecking}
            data-testid="refresh-codex-cli"
            title="Refresh Codex CLI detection"
          >
            <RefreshCw
              className={`w-4 h-4 ${isChecking ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Codex CLI enables GPT-5.1 Codex models for autonomous coding tasks.
        </p>
      </div>
      <div className="p-6 space-y-4">
        {status.success && status.status === "installed" ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
              <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green-400">
                  Codex CLI Installed
                </p>
                <div className="text-xs text-green-400/80 mt-1 space-y-1">
                  {status.method && (
                    <p>
                      Method: <span className="font-mono">{status.method}</span>
                    </p>
                  )}
                  {status.version && (
                    <p>
                      Version:{" "}
                      <span className="font-mono">{status.version}</span>
                    </p>
                  )}
                  {status.path && (
                    <p className="truncate" title={status.path}>
                      Path:{" "}
                      <span className="font-mono text-[10px]">
                        {status.path}
                      </span>
                    </p>
                  )}
                </div>
              </div>
            </div>
            {status.recommendation && (
              <p className="text-xs text-muted-foreground">
                {status.recommendation}
              </p>
            )}
          </div>
        ) : status.status === "api_key_only" ? (
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <AlertCircle className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-400">
                  API Key Detected - CLI Not Installed
                </p>
                <p className="text-xs text-blue-400/80 mt-1">
                  {status.recommendation ||
                    "OPENAI_API_KEY found but Codex CLI not installed. Install the CLI for full agentic capabilities."}
                </p>
              </div>
            </div>
            {status.installCommands && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-foreground-secondary">
                  Installation Commands:
                </p>
                <div className="space-y-1">
                  {status.installCommands.npm && (
                    <div className="p-2 rounded bg-background border border-border-glass">
                      <p className="text-xs text-muted-foreground mb-1">npm:</p>
                      <code className="text-xs text-foreground-secondary font-mono break-all">
                        {status.installCommands.npm}
                      </code>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <AlertCircle className="w-5 h-5 text-yellow-500 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-yellow-400">
                  Codex CLI Not Detected
                </p>
                <p className="text-xs text-yellow-400/80 mt-1">
                  {status.recommendation ||
                    "Install OpenAI Codex CLI to use GPT-5.1 Codex models for autonomous coding."}
                </p>
              </div>
            </div>
            {status.installCommands && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-foreground-secondary">
                  Installation Commands:
                </p>
                <div className="space-y-1">
                  {status.installCommands.npm && (
                    <div className="p-2 rounded bg-background border border-border-glass">
                      <p className="text-xs text-muted-foreground mb-1">npm:</p>
                      <code className="text-xs text-foreground-secondary font-mono break-all">
                        {status.installCommands.npm}
                      </code>
                    </div>
                  )}
                  {status.installCommands.macos && (
                    <div className="p-2 rounded bg-background border border-border-glass">
                      <p className="text-xs text-muted-foreground mb-1">
                        macOS (Homebrew):
                      </p>
                      <code className="text-xs text-foreground-secondary font-mono break-all">
                        {status.installCommands.macos}
                      </code>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
