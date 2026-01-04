import { Button } from '@/components/ui/button';
import { Terminal, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CliStatus } from '../shared/types';

interface CodexCliStatusProps {
  status: CliStatus | null;
  isChecking: boolean;
  onRefresh: () => void;
}

export function CodexCliStatus({ status, isChecking, onRefresh }: CodexCliStatusProps) {
  const isInstalled = status?.success && status.status === 'installed';
  const isAuthenticated = status?.auth?.authenticated;

  return (
    <div
      className={cn(
        'rounded-2xl overflow-hidden',
        'border border-border/50',
        'bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
        'shadow-sm shadow-black/5'
      )}
    >
      <div className="p-6 border-b border-border/50 bg-gradient-to-r from-transparent via-sky-500/5 to-transparent">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500/20 to-sky-600/10 flex items-center justify-center border border-sky-500/20">
              <Terminal className="w-5 h-5 text-sky-500" />
            </div>
            <h2 className="text-lg font-semibold text-foreground tracking-tight">Codex CLI</h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            disabled={isChecking}
            data-testid="refresh-codex-cli"
            title="Refresh Codex CLI detection"
            className={cn(
              'h-9 w-9 rounded-lg',
              'hover:bg-accent/50 hover:scale-105',
              'transition-all duration-200'
            )}
          >
            <RefreshCw className={cn('w-4 h-4', isChecking && 'animate-spin')} />
          </Button>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">
          Codex CLI runs GPT-5.x Codex models locally with JSONL streaming and tool support.
        </p>
      </div>
      <div className="p-6 space-y-4">
        {isInstalled ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-4 rounded-xl bg-sky-500/10 border border-sky-500/20">
              <div className="w-10 h-10 rounded-xl bg-sky-500/15 flex items-center justify-center border border-sky-500/20 shrink-0">
                <CheckCircle2 className="w-5 h-5 text-sky-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-sky-400">Codex CLI Installed</p>
                <div className="text-xs text-sky-400/70 mt-1.5 space-y-0.5">
                  {status?.method && (
                    <p>
                      Method: <span className="font-mono">{status.method}</span>
                    </p>
                  )}
                  {status?.version && (
                    <p>
                      Version: <span className="font-mono">{status.version}</span>
                    </p>
                  )}
                  {status?.path && (
                    <p className="truncate" title={status.path}>
                      Path: <span className="font-mono text-[10px]">{status.path}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-sky-400/70 ml-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{isAuthenticated ? 'Authenticated' : 'Run: codex login'}</span>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center border border-amber-500/20 shrink-0 mt-0.5">
                <AlertCircle className="w-5 h-5 text-amber-500" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-400">Codex CLI Not Detected</p>
                <p className="text-xs text-amber-400/70 mt-1">
                  Install Codex CLI to enable GPT-5.x Codex models inside Automaker.
                </p>
              </div>
            </div>
            <div className="space-y-3">
              <p className="text-xs font-medium text-foreground/80">Installation Commands:</p>
              <div className="space-y-2">
                <div className="p-3 rounded-xl bg-accent/30 border border-border/50">
                  <p className="text-[10px] text-muted-foreground mb-1.5 font-medium uppercase tracking-wider">
                    npm (all platforms)
                  </p>
                  <code className="text-xs text-foreground/80 font-mono break-all">
                    npm install -g @openai/codex
                  </code>
                </div>
                <div className="p-3 rounded-xl bg-accent/30 border border-border/50">
                  <p className="text-[10px] text-muted-foreground mb-1.5 font-medium uppercase tracking-wider">
                    macOS (Homebrew)
                  </p>
                  <code className="text-xs text-foreground/80 font-mono break-all">
                    brew install codex
                  </code>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
