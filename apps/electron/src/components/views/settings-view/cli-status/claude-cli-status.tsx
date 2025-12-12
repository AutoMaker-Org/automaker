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

export function ClaudeCliStatus({
  status,
  isChecking,
  onRefresh,
}: CliStatusProps) {
  if (!status) return null;

  return (
    <div
      id="claude"
      className="rounded-xl border border-border bg-card backdrop-blur-md overflow-hidden scroll-mt-6"
    >
      <div className="p-6 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-brand-500" />
            <h2 className="text-lg font-semibold text-foreground">
              Claude Code CLI
            </h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            disabled={isChecking}
            data-testid="refresh-claude-cli"
            title="Refresh Claude CLI detection"
          >
            <RefreshCw
              className={`w-4 h-4 ${isChecking ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Claude Code CLI provides better performance for long-running tasks,
          especially with ultrathink.
        </p>
      </div>
      <div className="p-6 space-y-4">
        {status.success && status.status === "installed" ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
              <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green-400">
                  Claude Code CLI Installed
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
        ) : (
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <AlertCircle className="w-5 h-5 text-yellow-500 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-yellow-400">
                  Claude Code CLI Not Detected
                </p>
                <p className="text-xs text-yellow-400/80 mt-1">
                  {status.recommendation ||
                    "Consider installing Claude Code CLI for optimal performance with ultrathink."}
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
                        macOS/Linux:
                      </p>
                      <code className="text-xs text-foreground-secondary font-mono break-all">
                        {status.installCommands.macos}
                      </code>
                    </div>
                  )}
                  {status.installCommands.windows && (
                    <div className="p-2 rounded bg-background border border-border-glass">
                      <p className="text-xs text-muted-foreground mb-1">
                        Windows (PowerShell):
                      </p>
                      <code className="text-xs text-foreground-secondary font-mono break-all">
                        {status.installCommands.windows}
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
