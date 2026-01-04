import { Button } from '@/components/ui/button';
import { Code2, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CliStatus } from '../shared/types';

interface OpenCodeCliStatusProps {
  status: CliStatus | null;
  isChecking: boolean;
  onRefresh: () => void;
}

export function OpenCodeCliStatus({ status, isChecking, onRefresh }: OpenCodeCliStatusProps) {
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
      <div className="p-6 border-b border-border/50 bg-gradient-to-r from-transparent via-emerald-500/5 to-transparent">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 flex items-center justify-center border border-emerald-500/20">
              <Code2 className="w-5 h-5 text-emerald-500" />
            </div>
            <h2 className="text-lg font-semibold text-foreground tracking-tight">OpenCode CLI</h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            disabled={isChecking}
            data-testid="refresh-opencode-cli"
            title="Refresh OpenCode CLI detection"
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
          OpenCode CLI enables the free GLM 4.7 model with tool support via the ACP protocol.
        </p>
      </div>
      <div className="p-6 space-y-4">
        {isInstalled ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center border border-emerald-500/20 shrink-0">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-emerald-400">OpenCode CLI Installed</p>
                <div className="text-xs text-emerald-400/70 mt-1.5 space-y-0.5">
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
            <div className="flex items-center gap-2 text-xs text-emerald-400/70 ml-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>
                {isAuthenticated ? 'Authenticated via CLI login' : 'Run: opencode auth login'}
              </span>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center border border-amber-500/20 shrink-0 mt-0.5">
                <AlertCircle className="w-5 h-5 text-amber-500" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-400">OpenCode CLI Not Detected</p>
                <p className="text-xs text-amber-400/70 mt-1">
                  Install OpenCode CLI to enable the free GLM 4.7 model inside Automaker.
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
                    npm install -g opencode
                  </code>
                </div>
                <div className="p-3 rounded-xl bg-accent/30 border border-border/50">
                  <p className="text-[10px] text-muted-foreground mb-1.5 font-medium uppercase tracking-wider">
                    macOS / Linux
                  </p>
                  <code className="text-xs text-foreground/80 font-mono break-all">
                    curl -fsSL https://opencode.ai/install.sh | sh
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
