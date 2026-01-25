/**
 * Claude Usage Popover
 *
 * Displays Claude API usage statistics using React Query for data fetching.
 */

import { useState, useMemo } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { RefreshCw, AlertTriangle, CheckCircle, XCircle, Clock, ExternalLink } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { useSetupStore } from '@/store/setup-store';
import { useClaudeUsage } from '@/hooks/queries';

export function ClaudeUsagePopover() {
  const claudeAuthStatus = useSetupStore((state) => state.claudeAuthStatus);
  const [open, setOpen] = useState(false);

  // Check if CLI is verified/authenticated
  const isCliVerified =
    claudeAuthStatus?.authenticated && claudeAuthStatus?.method === 'cli_authenticated';

  // Use React Query for usage data
  const {
    data: claudeUsage,
    isLoading,
    isFetching,
    error,
    dataUpdatedAt,
    refetch,
  } = useClaudeUsage(isCliVerified);

  // Check if data is stale (older than 2 minutes)
  const isStale = useMemo(() => {
    return !dataUpdatedAt || Date.now() - dataUpdatedAt > 2 * 60 * 1000;
  }, [dataUpdatedAt]);

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
              {title === 'Session Usage' && <Clock className="w-3 h-3" />}
              {resetText}
            </p>
          </div>
        )}
      </div>
    );
  };

  // Header Button
  const maxPercentage = claudeUsage
    ? Math.max(claudeUsage.sessionPercentage || 0, claudeUsage.weeklyPercentage || 0)
    : 0;

  const getProgressBarColor = (percentage: number) => {
    if (percentage >= 80) return 'bg-red-500';
    if (percentage >= 50) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const trigger = (
    <Button variant="ghost" size="sm" className="h-9 gap-3 bg-secondary border border-border px-3">
      <span className="text-sm font-medium">Usage</span>
      {claudeUsage && (
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
            <span className="text-sm font-semibold">Claude Usage</span>
          </div>
          {error && (
            <Button
              variant="ghost"
              size="icon"
              className={cn('h-6 w-6', isFetching && 'opacity-80')}
              onClick={() => !isFetching && refetch()}
            >
              <RefreshCw className={cn('w-3.5 h-3.5', isFetching && 'animate-spin')} />
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
                  {error instanceof Error ? error.message : 'Failed to fetch usage'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Make sure Claude CLI is installed and authenticated via{' '}
                  <code className="font-mono bg-muted px-1 rounded">claude login</code>
                </p>
              </div>
            </div>
          ) : isLoading || !claudeUsage ? (
            <div className="flex flex-col items-center justify-center py-8 space-y-2">
              <Spinner size="lg" />
              <p className="text-xs text-muted-foreground">Loading usage data...</p>
            </div>
          ) : (
            <>
              {/* Primary Card */}
              <UsageCard
                title="Session Usage"
                subtitle="5-hour rolling window"
                percentage={claudeUsage.sessionPercentage}
                resetText={claudeUsage.sessionResetText}
                isPrimary={true}
                stale={isStale}
              />

              {/* Secondary Cards Grid */}
              <div className="grid grid-cols-2 gap-3">
                <UsageCard
                  title="Weekly"
                  subtitle="All models"
                  percentage={claudeUsage.weeklyPercentage}
                  resetText={claudeUsage.weeklyResetText}
                  stale={isStale}
                />
                <UsageCard
                  title="Sonnet"
                  subtitle="Weekly"
                  percentage={claudeUsage.sonnetWeeklyPercentage}
                  resetText={claudeUsage.sonnetResetText}
                  stale={isStale}
                />
              </div>

              {/* Extra Usage / Cost */}
              {claudeUsage.costLimit && claudeUsage.costLimit > 0 && (
                <UsageCard
                  title="Extra Usage"
                  subtitle={`${claudeUsage.costUsed ?? 0} / ${claudeUsage.costLimit} ${claudeUsage.costCurrency ?? ''}`}
                  percentage={
                    claudeUsage.costLimit > 0
                      ? ((claudeUsage.costUsed ?? 0) / claudeUsage.costLimit) * 100
                      : 0
                  }
                  stale={isStale}
                />
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 bg-secondary/10 border-t border-border/50">
          <a
            href="https://status.claude.com"
            target="_blank"
            rel="noreferrer"
            className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            Claude Status <ExternalLink className="w-2.5 h-2.5" />
          </a>

          <span className="text-[10px] text-muted-foreground">Updates every minute</span>
        </div>
      </PopoverContent>
    </Popover>
  );
}
