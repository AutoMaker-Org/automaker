import { Button } from '@/components/ui/button';
import { Terminal, CheckCircle2, AlertCircle, RefreshCw, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CursorStatus {
  installed: boolean;
  version?: string;
  authenticated: boolean;
  method?: string;
}

interface CursorCliStatusProps {
  status: CursorStatus | null;
  isChecking: boolean;
  onRefresh: () => void;
}

function SkeletonPulse({ className }: { className?: string }) {
  return <div className={cn('animate-pulse bg-muted/50 rounded', className)} />;
}

export function CursorCliStatusSkeleton() {
  return (
    <div
      className={cn(
        'rounded-2xl overflow-hidden',
        'border border-border/50',
        'bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
        'shadow-sm shadow-black/5'
      )}
    >
      <div className="p-6 border-b border-border/50 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <SkeletonPulse className="w-9 h-9 rounded-xl" />
            <SkeletonPulse className="h-6 w-28" />
          </div>
          <SkeletonPulse className="w-9 h-9 rounded-lg" />
        </div>
        <div className="ml-12">
          <SkeletonPulse className="h-4 w-72" />
        </div>
      </div>
      <div className="p-6 space-y-4">
        {/* Installation status skeleton */}
        <div className="flex items-center gap-3 p-4 rounded-xl border border-border/30 bg-muted/10">
          <SkeletonPulse className="w-10 h-10 rounded-xl" />
          <div className="flex-1 space-y-2">
            <SkeletonPulse className="h-4 w-36" />
            <SkeletonPulse className="h-3 w-28" />
          </div>
        </div>
        {/* Auth status skeleton */}
        <div className="flex items-center gap-3 p-4 rounded-xl border border-border/30 bg-muted/10">
          <SkeletonPulse className="w-10 h-10 rounded-xl" />
          <div className="flex-1 space-y-2">
            <SkeletonPulse className="h-4 w-28" />
            <SkeletonPulse className="h-3 w-32" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function CursorPermissionsSkeleton() {
  return (
    <div
      className={cn(
        'rounded-2xl overflow-hidden',
        'border border-border/50',
        'bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
        'shadow-sm shadow-black/5'
      )}
    >
      <div className="p-6 border-b border-border/50 bg-gradient-to-r from-transparent via-accent/5 to-transparent flex items-center justify-between">
        <div className="flex items-center gap-3">
          <SkeletonPulse className="w-9 h-9 rounded-xl" />
          <div className="text-left">
            <SkeletonPulse className="h-6 w-32 mb-2" />
            <SkeletonPulse className="h-4 w-48" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SkeletonPulse className="h-6 w-20 rounded-full" />
          <SkeletonPulse className="w-5 h-5 rounded" />
        </div>
      </div>
      <div className="p-6 space-y-6">
        {/* Security Warning skeleton */}
        <div className="flex items-start gap-3 p-4 rounded-xl border border-border/30 bg-muted/10">
          <SkeletonPulse className="w-5 h-5 rounded shrink-0 mt-0.5" />
          <div className="flex-1 space-y-2">
            <SkeletonPulse className="h-4 w-32" />
            <SkeletonPulse className="h-3 w-full" />
            <SkeletonPulse className="h-3 w-3/4" />
          </div>
        </div>
        {/* Permission Profiles skeleton */}
        <div className="space-y-3">
          <SkeletonPulse className="h-4 w-36" />
          <div className="grid gap-3">
            {[1, 2].map((i) => (
              <div key={i} className="p-4 rounded-xl border border-border/30 bg-muted/10">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <SkeletonPulse className="w-4 h-4 rounded" />
                      <SkeletonPulse className="h-4 w-24" />
                      <SkeletonPulse className="h-4 w-12 rounded-full" />
                    </div>
                    <SkeletonPulse className="h-3 w-full" />
                    <SkeletonPulse className="h-3 w-2/3" />
                    <div className="flex items-center gap-2">
                      <SkeletonPulse className="h-3 w-20" />
                      <SkeletonPulse className="h-3 w-1" />
                      <SkeletonPulse className="h-3 w-20" />
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <SkeletonPulse className="h-8 w-28 rounded-md" />
                    <SkeletonPulse className="h-8 w-28 rounded-md" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* Config File Locations skeleton */}
        <div className="space-y-3">
          <SkeletonPulse className="h-4 w-40" />
          <div className="p-4 rounded-xl border border-border/30 bg-muted/10 space-y-2">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <SkeletonPulse className="h-4 w-24" />
                <SkeletonPulse className="h-3 w-48" />
              </div>
              <SkeletonPulse className="w-8 h-8 rounded" />
            </div>
            <div className="border-t border-border/30 pt-2 space-y-1">
              <SkeletonPulse className="h-4 w-28" />
              <SkeletonPulse className="h-3 w-40" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ModelConfigSkeleton() {
  return (
    <div
      className={cn(
        'rounded-2xl overflow-hidden',
        'border border-border/50',
        'bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
        'shadow-sm shadow-black/5'
      )}
    >
      <div className="p-6 border-b border-border/50 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
        <div className="flex items-center gap-3 mb-2">
          <SkeletonPulse className="w-9 h-9 rounded-xl" />
          <SkeletonPulse className="h-6 w-40" />
        </div>
        <div className="ml-12">
          <SkeletonPulse className="h-4 w-72" />
        </div>
      </div>
      <div className="p-6 space-y-6">
        {/* Default Model skeleton */}
        <div className="space-y-2">
          <SkeletonPulse className="h-4 w-24" />
          <SkeletonPulse className="h-10 w-full rounded-md" />
        </div>
        {/* Available Models skeleton */}
        <div className="space-y-3">
          <SkeletonPulse className="h-4 w-32" />
          <div className="grid gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="flex items-center justify-between p-3 rounded-xl border border-border/30 bg-muted/10"
              >
                <div className="flex items-center gap-3">
                  <SkeletonPulse className="w-5 h-5 rounded" />
                  <div className="space-y-1.5">
                    <SkeletonPulse className="h-4 w-32" />
                    <SkeletonPulse className="h-3 w-48" />
                  </div>
                </div>
                <SkeletonPulse className="h-5 w-12 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function CursorCliStatus({ status, isChecking, onRefresh }: CursorCliStatusProps) {
  if (!status) return <CursorCliStatusSkeleton />;

  return (
    <div
      className={cn(
        'rounded-2xl overflow-hidden',
        'border border-border/50',
        'bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
        'shadow-sm shadow-black/5'
      )}
    >
      <div className="p-6 border-b border-border/50 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500/20 to-brand-600/10 flex items-center justify-center border border-brand-500/20">
              <Terminal className="w-5 h-5 text-brand-500" />
            </div>
            <h2 className="text-lg font-semibold text-foreground tracking-tight">Cursor CLI</h2>
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
          Cursor CLI enables AI-powered code editing using Cursor's models.
        </p>
      </div>
      <div className="p-6 space-y-4">
        {status.installed ? (
          <div className="space-y-3">
            {/* Installation Status - Success */}
            <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center border border-emerald-500/20 shrink-0">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-emerald-400">Cursor CLI Installed</p>
                <div className="text-xs text-emerald-400/70 mt-1.5 space-y-0.5">
                  {status.version && (
                    <p>
                      Version: <span className="font-mono">{status.version}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Authentication Status */}
            {status.authenticated ? (
              <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center border border-emerald-500/20 shrink-0">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-emerald-400">Authenticated</p>
                  <div className="text-xs text-emerald-400/70 mt-1.5">
                    <p>
                      Method:{' '}
                      <span className="font-mono">
                        {status.method === 'api_key' ? 'API Key' : 'Browser Login'}
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center border border-amber-500/20 shrink-0 mt-0.5">
                  <XCircle className="w-5 h-5 text-amber-500" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-400">Not Authenticated</p>
                  <p className="text-xs text-amber-400/70 mt-1">
                    Run <code className="font-mono bg-amber-500/10 px-1 rounded">cursor auth</code>{' '}
                    to authenticate with Cursor.
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center border border-amber-500/20 shrink-0 mt-0.5">
                <AlertCircle className="w-5 h-5 text-amber-500" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-400">Cursor CLI Not Detected</p>
                <p className="text-xs text-amber-400/70 mt-1">
                  Install Cursor CLI to use Cursor models in AutoMaker.
                </p>
              </div>
            </div>
            <div className="space-y-3">
              <p className="text-xs font-medium text-foreground/80">Installation:</p>
              <a
                href="https://cursor.com/docs/cli"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-xs text-brand-400 hover:text-brand-300 transition-colors"
              >
                View installation guide →
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
