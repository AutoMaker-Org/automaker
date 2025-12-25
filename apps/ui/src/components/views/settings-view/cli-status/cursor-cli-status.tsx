import { Button } from '@/components/ui/button';
import { MousePointer2, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CursorCliStatus } from '../shared/types';

interface CursorCliStatusProps {
  status: CursorCliStatus | null;
  isChecking: boolean;
  onRefresh: () => void;
}

export function CursorCliStatusCard({ status, isChecking, onRefresh }: CursorCliStatusProps) {
  if (!status) return null;

  return (
    <div
      className={cn(
        'rounded-2xl overflow-hidden',
        'border border-border/50',
        'bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
        'shadow-sm shadow-black/5'
      )}
    >
      <div className="p-6 border-b border-border/50 bg-gradient-to-r from-transparent via-cyan-500/5 to-transparent">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500/20 to-cyan-600/10 flex items-center justify-center border border-cyan-500/20">
              <MousePointer2 className="w-5 h-5 text-cyan-500" />
            </div>
            <h2 className="text-lg font-semibold text-foreground tracking-tight">
              Cursor Agent CLI
            </h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            disabled={isChecking}
            data-testid="refresh-cursor-cli"
            title="Refresh Cursor CLI detection"
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
          Cursor Agent CLI enables using your Cursor subscription for AI tasks.
        </p>
      </div>
      <div className="p-6 space-y-4">
        {status.success && status.status === 'installed' ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/15 flex items-center justify-center border border-cyan-500/20 shrink-0">
                <CheckCircle2 className="w-5 h-5 text-cyan-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-cyan-400">Cursor Agent CLI Installed</p>
                <div className="text-xs text-cyan-400/70 mt-1.5 space-y-0.5">
                  {status.method && (
                    <p>
                      Method: <span className="font-mono">{status.method}</span>
                    </p>
                  )}
                  {status.version && (
                    <p>
                      Version: <span className="font-mono">{status.version}</span>
                    </p>
                  )}
                  {status.path && (
                    <p className="truncate" title={status.path}>
                      Path: <span className="font-mono text-[10px]">{status.path}</span>
                    </p>
                  )}
                  {status.auth && (
                    <p>
                      Auth:{' '}
                      <span className="font-mono">
                        {status.auth.authenticated
                          ? `✓ ${status.auth.method}`
                          : 'Not authenticated'}
                      </span>
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-muted/30 border border-border/50">
              <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center border border-border/50 shrink-0 mt-0.5">
                <AlertCircle className="w-5 h-5 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-muted-foreground">
                  Cursor Agent CLI Not Detected
                </p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Install cursor-agent to use your Cursor subscription for AI tasks.
                </p>
              </div>
            </div>
            <div className="space-y-3">
              <p className="text-xs font-medium text-foreground/80">Installation:</p>
              <div className="space-y-2">
                <div className="p-3 rounded-xl bg-accent/30 border border-border/50">
                  <p className="text-[10px] text-muted-foreground mb-1.5 font-medium uppercase tracking-wider">
                    npm (global)
                  </p>
                  <code className="text-xs text-foreground/80 font-mono break-all">
                    npm install -g @anthropic-ai/cursor-agent
                  </code>
                </div>
                <div className="p-3 rounded-xl bg-accent/30 border border-border/50">
                  <p className="text-[10px] text-muted-foreground mb-1.5 font-medium uppercase tracking-wider">
                    Then authenticate
                  </p>
                  <code className="text-xs text-foreground/80 font-mono break-all">
                    cursor-agent login
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
