import { useState, useEffect, useMemo, useCallback } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { RefreshCw, AlertTriangle, CheckCircle, XCircle, Clock, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getElectronAPI } from '@/lib/electron';
import { useAppStore } from '@/store/app-store';
import { useSetupStore } from '@/store/setup-store';

// Error codes for distinguishing failure modes
const ERROR_CODES = {
  API_BRIDGE_UNAVAILABLE: 'API_BRIDGE_UNAVAILABLE',
  AUTH_ERROR: 'AUTH_ERROR',
  NOT_AVAILABLE: 'NOT_AVAILABLE',
  UNKNOWN: 'UNKNOWN',
} as const;

type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

type UsageError = {
  code: ErrorCode;
  message: string;
};

// Fixed refresh interval (45 seconds)
const REFRESH_INTERVAL_SECONDS = 45;

// Helper to format reset time
function formatResetTime(unixTimestamp: number): string {
  const date = new Date(unixTimestamp * 1000);
  const now = new Date();
  const diff = date.getTime() - now.getTime();

  // If less than 1 hour, show minutes
  if (diff < 3600000) {
    const mins = Math.ceil(diff / 60000);
    return `Resets in ${mins}m`;
  }

  // If less than 24 hours, show hours and minutes
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    const mins = Math.ceil((diff % 3600000) / 60000);
    return `Resets in ${hours}h ${mins > 0 ? `${mins}m` : ''}`;
  }

  // Otherwise show date
  return `Resets ${date.toLocaleDateString()} at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

// Helper to format window duration
function getWindowLabel(durationMins: number): { title: string; subtitle: string } {
  if (durationMins < 60) {
    return { title: `${durationMins}min Window`, subtitle: 'Rate limit' };
  }
  if (durationMins < 1440) {
    const hours = Math.round(durationMins / 60);
    return { title: `${hours}h Window`, subtitle: 'Rate limit' };
  }
  const days = Math.round(durationMins / 1440);
  return { title: `${days}d Window`, subtitle: 'Rate limit' };
}

export function CodexUsagePopover() {
  const { codexUsage, codexUsageLastUpdated, setCodexUsage } = useAppStore();
  const codexAuthStatus = useSetupStore((state) => state.codexAuthStatus);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<UsageError | null>(null);

  // Check if Codex is authenticated
  const isCodexAuthenticated = codexAuthStatus?.authenticated;

  // Check if data is stale (older than 2 minutes)
  const isStale = useMemo(() => {
    return !codexUsageLastUpdated || Date.now() - codexUsageLastUpdated > 2 * 60 * 1000;
  }, [codexUsageLastUpdated]);

  const fetchUsage = useCallback(
    async (isAutoRefresh = false) => {
      if (!isAutoRefresh) setLoading(true);
      setError(null);
      try {
        const api = getElectronAPI();
        if (!api.codex) {
          setError({
            code: ERROR_CODES.API_BRIDGE_UNAVAILABLE,
            message: 'Codex API bridge not available',
          });
          return;
        }
        const data = await api.codex.getUsage();
        if ('error' in data) {
          // Check if it's the "not available" error
          if (
            data.message?.includes('not available') ||
            data.message?.includes('does not provide')
          ) {
            setError({
              code: ERROR_CODES.NOT_AVAILABLE,
              message: data.message || data.error,
            });
          } else {
            setError({
              code: ERROR_CODES.AUTH_ERROR,
              message: data.message || data.error,
            });
          }
          return;
        }
        setCodexUsage(data);
      } catch (err) {
        setError({
          code: ERROR_CODES.UNKNOWN,
          message: err instanceof Error ? err.message : 'Failed to fetch usage',
        });
      } finally {
        if (!isAutoRefresh) setLoading(false);
      }
    },
    [setCodexUsage]
  );

  // Auto-fetch on mount if data is stale (only if authenticated)
  useEffect(() => {
    if (isStale && isCodexAuthenticated) {
      fetchUsage(true);
    }
  }, [isStale, isCodexAuthenticated, fetchUsage]);

  useEffect(() => {
    // Skip if not authenticated
    if (!isCodexAuthenticated) return;

    // Initial fetch when opened
    if (open) {
      if (!codexUsage || isStale) {
        fetchUsage();
      }
    }

    // Auto-refresh interval (only when open)
    let intervalId: NodeJS.Timeout | null = null;
    if (open) {
      intervalId = setInterval(() => {
        fetchUsage(true);
      }, REFRESH_INTERVAL_SECONDS * 1000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [open, codexUsage, isStale, isCodexAuthenticated, fetchUsage]);

  // Derived status color/icon helper
  const getStatusInfo = (percentage: number) => {
    if (percentage >= 75) return { color: 'text-red-500', icon: XCircle, bg: 'bg-red-500' };
    if (percentage >= 50)
      return { color: 'text-orange-500', icon: AlertTriangle, bg: 'bg-orange-500' };
    return { color: 'text-green-500', icon: CheckCircle, bg: 'bg-green-500' };
  };

  // Helper component for the progress bar
  const ProgressBar = ({ percentage, colorClass }: { percentage: number; colorClass: string }) => (
    <div className="h-2 w-full bg-secondary/50 rounded-full overflow-hidden">
      <div
        className={cn('h-full transition-all duration-500', colorClass)}
        style={{ width: `${Math.min(percentage, 100)}%` }}
      />
    </div>
  );

  const UsageCard = ({
    title,
    subtitle,
    percentage,
    resetText,
    isPrimary = false,
    stale = false,
  }: {
    title: string;
    subtitle: string;
    percentage: number;
    resetText?: string;
    isPrimary?: boolean;
    stale?: boolean;
  }) => {
    const isValidPercentage =
      typeof percentage === 'number' && !isNaN(percentage) && isFinite(percentage);
    const safePercentage = isValidPercentage ? percentage : 0;

    const status = getStatusInfo(safePercentage);
    const StatusIcon = status.icon;

    return (
      <div
        className={cn(
          'rounded-xl border bg-card/50 p-4 transition-opacity',
          isPrimary ? 'border-border/60 shadow-sm' : 'border-border/40',
          (stale || !isValidPercentage) && 'opacity-50'
        )}
      >
        <div className="flex items-start justify-between mb-3">
          <div>
            <h4 className={cn('font-semibold', isPrimary ? 'text-sm' : 'text-xs')}>{title}</h4>
            <p className="text-[10px] text-muted-foreground">{subtitle}</p>
          </div>
          {isValidPercentage ? (
            <div className="flex items-center gap-1.5">
              <StatusIcon className={cn('w-3.5 h-3.5', status.color)} />
              <span
                className={cn(
                  'font-mono font-bold',
                  status.color,
                  isPrimary ? 'text-base' : 'text-sm'
                )}
              >
                {Math.round(safePercentage)}%
              </span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">N/A</span>
          )}
        </div>
        <ProgressBar
          percentage={safePercentage}
          colorClass={isValidPercentage ? status.bg : 'bg-muted-foreground/30'}
        />
        {resetText && (
          <div className="mt-2 flex justify-end">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {resetText}
            </p>
          </div>
        )}
      </div>
    );
  };

  // Header Button
  const maxPercentage = codexUsage?.rateLimits
    ? Math.max(
        codexUsage.rateLimits.primary?.usedPercent || 0,
        codexUsage.rateLimits.secondary?.usedPercent || 0
      )
    : 0;

  const getProgressBarColor = (percentage: number) => {
    if (percentage >= 80) return 'bg-red-500';
    if (percentage >= 50) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const trigger = (
    <Button variant="ghost" size="sm" className="h-9 gap-3 bg-secondary border border-border px-3">
      <span className="text-sm font-medium">Codex</span>
      {codexUsage && codexUsage.rateLimits && (
        <div
          className={cn(
            'h-1.5 w-16 bg-muted-foreground/20 rounded-full overflow-hidden transition-opacity',
            isStale && 'opacity-60'
          )}
        >
          <div
            className={cn('h-full transition-all duration-500', getProgressBarColor(maxPercentage))}
            style={{ width: `${Math.min(maxPercentage, 100)}%` }}
          />
        </div>
      )}
    </Button>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        className="w-80 p-0 overflow-hidden bg-background/95 backdrop-blur-xl border-border shadow-2xl"
        align="end"
        sideOffset={8}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-secondary/10">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">Codex Usage</span>
          </div>
          {error && error.code !== ERROR_CODES.NOT_AVAILABLE && (
            <Button
              variant="ghost"
              size="icon"
              className={cn('h-6 w-6', loading && 'opacity-80')}
              onClick={() => !loading && fetchUsage(false)}
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {error ? (
            <div className="flex flex-col items-center justify-center py-6 text-center space-y-3">
              <AlertTriangle className="w-8 h-8 text-yellow-500/80" />
              <div className="space-y-1 flex flex-col items-center">
                <p className="text-sm font-medium">
                  {error.code === ERROR_CODES.NOT_AVAILABLE ? 'Usage not available' : error.message}
                </p>
                <p className="text-xs text-muted-foreground">
                  {error.code === ERROR_CODES.API_BRIDGE_UNAVAILABLE ? (
                    'Ensure the Electron bridge is running or restart the app'
                  ) : error.code === ERROR_CODES.NOT_AVAILABLE ? (
                    <>
                      Codex CLI doesn't provide usage statistics. Check{' '}
                      <a
                        href="https://platform.openai.com/usage"
                        target="_blank"
                        rel="noreferrer"
                        className="underline hover:text-foreground"
                      >
                        OpenAI dashboard
                      </a>{' '}
                      for usage details.
                    </>
                  ) : (
                    <>
                      Make sure Codex CLI is installed and authenticated via{' '}
                      <code className="font-mono bg-muted px-1 rounded">codex login</code>
                    </>
                  )}
                </p>
              </div>
            </div>
          ) : !codexUsage ? (
            // Loading state
            <div className="flex flex-col items-center justify-center py-8 space-y-2">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground/50" />
              <p className="text-xs text-muted-foreground">Loading usage data...</p>
            </div>
          ) : codexUsage.rateLimits ? (
            <>
              {/* Primary Window Card */}
              {codexUsage.rateLimits.primary && (
                <UsageCard
                  title={getWindowLabel(codexUsage.rateLimits.primary.windowDurationMins).title}
                  subtitle={
                    getWindowLabel(codexUsage.rateLimits.primary.windowDurationMins).subtitle
                  }
                  percentage={codexUsage.rateLimits.primary.usedPercent}
                  resetText={formatResetTime(codexUsage.rateLimits.primary.resetsAt)}
                  isPrimary={true}
                  stale={isStale}
                />
              )}

              {/* Secondary Window Card */}
              {codexUsage.rateLimits.secondary && (
                <UsageCard
                  title={getWindowLabel(codexUsage.rateLimits.secondary.windowDurationMins).title}
                  subtitle={
                    getWindowLabel(codexUsage.rateLimits.secondary.windowDurationMins).subtitle
                  }
                  percentage={codexUsage.rateLimits.secondary.usedPercent}
                  resetText={formatResetTime(codexUsage.rateLimits.secondary.resetsAt)}
                  stale={isStale}
                />
              )}

              {/* Plan Type */}
              {codexUsage.rateLimits.planType && (
                <div className="rounded-xl border border-border/40 bg-secondary/20 p-3">
                  <p className="text-xs text-muted-foreground">
                    Plan:{' '}
                    <span className="text-foreground font-medium">
                      {codexUsage.rateLimits.planType.charAt(0).toUpperCase() +
                        codexUsage.rateLimits.planType.slice(1)}
                    </span>
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <AlertTriangle className="w-8 h-8 text-yellow-500/80" />
              <p className="text-sm font-medium mt-3">No usage data available</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 bg-secondary/10 border-t border-border/50">
          <a
            href="https://platform.openai.com/usage"
            target="_blank"
            rel="noreferrer"
            className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            OpenAI Dashboard <ExternalLink className="w-2.5 h-2.5" />
          </a>

          <span className="text-[10px] text-muted-foreground">Updates every minute</span>
        </div>
      </PopoverContent>
    </Popover>
  );
}
