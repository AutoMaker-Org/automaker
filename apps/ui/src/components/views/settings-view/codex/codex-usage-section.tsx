import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { RefreshCw, AlertCircle } from 'lucide-react';
import { OpenAIIcon } from '@/components/ui/provider-icon';
import { cn } from '@/lib/utils';
import {
  formatCodexPlanType,
  formatCodexResetTime,
  getCodexWindowLabel,
} from '@/lib/codex-usage-format';
import { useSetupStore } from '@/store/setup-store';
import { useCodexUsage } from '@/hooks/queries';
import type { CodexRateLimitWindow } from '@/store/app-store';

const CODEX_USAGE_TITLE = 'Codex Usage';
const CODEX_USAGE_SUBTITLE = 'Shows usage limits reported by the Codex CLI.';
const CODEX_AUTH_WARNING = 'Authenticate Codex CLI to view usage limits.';
const CODEX_LOGIN_COMMAND = 'codex login';
const CODEX_NO_USAGE_MESSAGE =
  'Usage limits are not available yet. Try refreshing if this persists.';
const UPDATED_LABEL = 'Updated';
const CODEX_REFRESH_LABEL = 'Refresh Codex usage';
const PLAN_LABEL = 'Plan';
const WARNING_THRESHOLD = 75;
const CAUTION_THRESHOLD = 50;
const MAX_PERCENTAGE = 100;
const USAGE_COLOR_CRITICAL = 'bg-red-500';
const USAGE_COLOR_WARNING = 'bg-amber-500';
const USAGE_COLOR_OK = 'bg-emerald-500';

const isRateLimitWindow = (
  limitWindow: CodexRateLimitWindow | null
): limitWindow is CodexRateLimitWindow => Boolean(limitWindow);

export function CodexUsageSection() {
  const codexAuthStatus = useSetupStore((state) => state.codexAuthStatus);

  const canFetchUsage = !!codexAuthStatus?.authenticated;

  // Use React Query for data fetching with automatic polling
  const { data: codexUsage, isLoading, isFetching, error, refetch } = useCodexUsage(canFetchUsage);

  const rateLimits = codexUsage?.rateLimits ?? null;
  const primary = rateLimits?.primary ?? null;
  const secondary = rateLimits?.secondary ?? null;
  const planType = rateLimits?.planType ?? null;
  const rateLimitWindows = [primary, secondary].filter(isRateLimitWindow);
  const hasMetrics = rateLimitWindows.length > 0;
  const lastUpdatedLabel = codexUsage?.lastUpdated
    ? new Date(codexUsage.lastUpdated).toLocaleString()
    : null;
  const showAuthWarning = !canFetchUsage && !codexUsage && !isLoading;
  const errorMessage = error instanceof Error ? error.message : error ? String(error) : null;

  const getUsageColor = (percentage: number) => {
    if (percentage >= WARNING_THRESHOLD) {
      return USAGE_COLOR_CRITICAL;
    }
    if (percentage >= CAUTION_THRESHOLD) {
      return USAGE_COLOR_WARNING;
    }
    return USAGE_COLOR_OK;
  };

  const RateLimitCard = ({
    title,
    subtitle,
    window: limitWindow,
  }: {
    title: string;
    subtitle: string;
    window: CodexRateLimitWindow;
  }) => {
    const safePercentage = Math.min(Math.max(limitWindow.usedPercent, 0), MAX_PERCENTAGE);
    const resetLabel = formatCodexResetTime(limitWindow.resetsAt);

    return (
      <div className="rounded-xl border border-border/60 bg-card/50 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
          <span className="text-sm font-semibold text-foreground">
            {Math.round(safePercentage)}%
          </span>
        </div>
        <div className="mt-3 h-2 w-full rounded-full bg-secondary/60">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-300',
              getUsageColor(safePercentage)
            )}
            style={{ width: `${safePercentage}%` }}
          />
        </div>
        {resetLabel && <p className="mt-2 text-xs text-muted-foreground">{resetLabel}</p>}
      </div>
    );
  };

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
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500/20 to-brand-600/10 flex items-center justify-center border border-brand-500/20">
            <OpenAIIcon className="w-5 h-5 text-brand-500" />
          </div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">
            {CODEX_USAGE_TITLE}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => refetch()}
            disabled={isFetching}
            className="ml-auto h-9 w-9 rounded-lg hover:bg-accent/50"
            data-testid="refresh-codex-usage"
            title={CODEX_REFRESH_LABEL}
          >
            {isFetching ? <Spinner size="sm" /> : <RefreshCw className="w-4 h-4" />}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">{CODEX_USAGE_SUBTITLE}</p>
      </div>
      <div className="p-6 space-y-4">
        {showAuthWarning && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <AlertCircle className="w-5 h-5 text-amber-500 mt-0.5" />
            <div className="text-sm text-amber-400">
              {CODEX_AUTH_WARNING} Run <span className="font-mono">{CODEX_LOGIN_COMMAND}</span>.
            </div>
          </div>
        )}
        {errorMessage && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20">
            <AlertCircle className="w-5 h-5 text-red-500 mt-0.5" />
            <div className="text-sm text-red-400">{errorMessage}</div>
          </div>
        )}
        {hasMetrics && (
          <div className="grid gap-3 sm:grid-cols-2">
            {rateLimitWindows.map((limitWindow, index) => {
              const { title, subtitle } = getCodexWindowLabel(limitWindow.windowDurationMins);
              return (
                <RateLimitCard
                  key={`${title}-${index}`}
                  title={title}
                  subtitle={subtitle}
                  window={limitWindow}
                />
              );
            })}
          </div>
        )}
        {planType && (
          <div className="rounded-xl border border-border/60 bg-secondary/20 p-4 text-xs text-muted-foreground">
            <div>
              {PLAN_LABEL}: <span className="text-foreground">{formatCodexPlanType(planType)}</span>
            </div>
          </div>
        )}
        {!hasMetrics && !errorMessage && canFetchUsage && !isLoading && (
          <div className="rounded-xl border border-border/60 bg-secondary/20 p-4 text-xs text-muted-foreground">
            {CODEX_NO_USAGE_MESSAGE}
          </div>
        )}
        {lastUpdatedLabel && (
          <div className="text-[10px] text-muted-foreground text-right">
            {UPDATED_LABEL} {lastUpdatedLabel}
          </div>
        )}
      </div>
    </div>
  );
}
