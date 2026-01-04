import { useCallback, useEffect, useMemo, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { RefreshCw, AlertTriangle, CheckCircle, XCircle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getElectronAPI } from '@/lib/electron';
import {
  formatCodexCredits,
  formatCodexPlanType,
  formatCodexResetTime,
  getCodexWindowLabel,
  type CodexWindowLabel,
} from '@/lib/codex-usage-format';
import {
  useAppStore,
  type CodexCreditsSnapshot,
  type CodexPlanType,
  type CodexRateLimitWindow,
} from '@/store/app-store';

interface UsagePopoverProps {
  showClaude: boolean;
  showCodex: boolean;
}

const ERROR_CODES = {
  API_BRIDGE_UNAVAILABLE: 'API_BRIDGE_UNAVAILABLE',
  AUTH_ERROR: 'AUTH_ERROR',
  UNKNOWN: 'UNKNOWN',
} as const;

type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

type UsageError = {
  code: ErrorCode;
  message: string;
};

const USAGE_BUTTON_LABEL = 'Usage';
const CLAUDE_SECTION_TITLE = 'Claude';
const CODEX_SECTION_TITLE = 'Codex';
const USAGE_SUBTITLE = 'Updates every minute';
const CODEX_BRIDGE_ERROR = 'Codex API bridge not available';
const CLAUDE_BRIDGE_ERROR = 'Claude API bridge not available';
const CLAUDE_FETCH_ERROR = 'Failed to fetch Claude usage';
const CODEX_FETCH_ERROR = 'Failed to fetch Codex usage';
const BRIDGE_RECOVERY_MESSAGE = 'Ensure the Electron bridge is running or restart the app';
const CLAUDE_REAUTH_MESSAGE = 'Run claude login to re-authenticate';
const CODEX_REAUTH_MESSAGE = 'Run codex login to re-authenticate';
const CLAUDE_LOADING_MESSAGE = 'Loading Claude usage...';
const CODEX_LOADING_MESSAGE = 'Loading Codex usage...';
const CLAUDE_SESSION_TITLE = 'Session Usage';
const CLAUDE_SESSION_SUBTITLE = '5-hour rolling window';
const CLAUDE_WEEKLY_TITLE = 'Weekly';
const CLAUDE_WEEKLY_SUBTITLE = 'All models';
const CLAUDE_SONNET_TITLE = 'Sonnet';
const CLAUDE_SONNET_SUBTITLE = 'Weekly';
const CLAUDE_EXTRA_TITLE = 'Extra Usage';
const PROVIDER_CLAUDE = 'claude';
const PROVIDER_CODEX = 'codex';
const PROVIDER_TOGGLE_LABEL = 'Usage provider';
const SECONDARY_SPLIT_INDEX = 1;
const PLAN_LABEL = 'Plan';
const CREDITS_LABEL = 'Credits';
const NOT_AVAILABLE_LABEL = 'N/A';
const STALE_THRESHOLD_MS = 2 * 60_000;
const CLAUDE_REFRESH_INTERVAL_MS = 45_000;
const CODEX_REFRESH_INTERVAL_MS = 60_000;
const MAX_PERCENTAGE = 100;
const WARNING_THRESHOLD = 75;
const CAUTION_THRESHOLD = 50;
const STATUS_TEXT_CRITICAL = 'text-red-500';
const STATUS_TEXT_WARNING = 'text-orange-500';
const STATUS_TEXT_OK = 'text-green-500';
const STATUS_BG_CRITICAL = 'bg-red-500';
const STATUS_BG_WARNING = 'bg-orange-500';
const STATUS_BG_OK = 'bg-green-500';
const PROGRESS_BG_CRITICAL = 'bg-red-500';
const PROGRESS_BG_WARNING = 'bg-yellow-500';
const PROGRESS_BG_OK = 'bg-emerald-500';
const PROVIDER_BUTTON_BASE = 'h-7 px-3 text-xs rounded-full transition-colors';
const PROVIDER_BUTTON_ACTIVE = 'bg-background text-foreground shadow-sm';
const PROVIDER_BUTTON_INACTIVE = 'text-muted-foreground hover:text-foreground';
const PROVIDER_TOGGLE_CONTAINER = 'flex gap-1 rounded-full bg-secondary/40 p-1';

type UsageProvider = typeof PROVIDER_CLAUDE | typeof PROVIDER_CODEX;

export function UsagePopover({ showClaude, showCodex }: UsagePopoverProps) {
  const {
    claudeUsage,
    claudeUsageLastUpdated,
    setClaudeUsage,
    codexUsage,
    codexUsageLastUpdated,
    setCodexUsage,
  } = useAppStore();
  const [open, setOpen] = useState(false);
  const [claudeLoading, setClaudeLoading] = useState(false);
  const [codexLoading, setCodexLoading] = useState(false);
  const [claudeError, setClaudeError] = useState<UsageError | null>(null);
  const [codexError, setCodexError] = useState<UsageError | null>(null);
  const [activeProvider, setActiveProvider] = useState<UsageProvider>(() =>
    showClaude ? PROVIDER_CLAUDE : PROVIDER_CODEX
  );

  const hasBothProviders = showClaude && showCodex;
  const showClaudeSection = showClaude && activeProvider === PROVIDER_CLAUDE;
  const showCodexSection = showCodex && activeProvider === PROVIDER_CODEX;

  useEffect(() => {
    if (showClaude && !showCodex) {
      setActiveProvider(PROVIDER_CLAUDE);
      return;
    }
    if (showCodex && !showClaude) {
      setActiveProvider(PROVIDER_CODEX);
    }
  }, [showClaude, showCodex]);

  const claudeIsStale = useMemo(() => {
    return !claudeUsageLastUpdated || Date.now() - claudeUsageLastUpdated > STALE_THRESHOLD_MS;
  }, [claudeUsageLastUpdated]);

  const codexIsStale = useMemo(() => {
    return !codexUsageLastUpdated || Date.now() - codexUsageLastUpdated > STALE_THRESHOLD_MS;
  }, [codexUsageLastUpdated]);

  const codexCards = useMemo(() => {
    if (!codexUsage) return [] as Array<CodexWindowLabel & { window: CodexRateLimitWindow }>;
    const windows = [codexUsage.rateLimits.primary, codexUsage.rateLimits.secondary].filter(
      Boolean
    ) as CodexRateLimitWindow[];

    const cards = windows.map((limitWindow) => ({
      ...getCodexWindowLabel(limitWindow.windowDurationMins),
      window: limitWindow,
    }));
    const primaryCard = cards.find((card) => card.isPrimary);
    if (!primaryCard) {
      return cards;
    }
    const secondaryCards = cards.filter((card) => card !== primaryCard);
    return [primaryCard, ...secondaryCards];
  }, [codexUsage]);
  const codexPrimaryCard = codexCards[0] ?? null;
  const codexSecondaryCards =
    codexCards.length > SECONDARY_SPLIT_INDEX ? codexCards.slice(SECONDARY_SPLIT_INDEX) : [];
  const codexSecondaryPrimary = codexSecondaryCards[0] ?? null;
  const codexExtraSecondaryCards =
    codexSecondaryCards.length > SECONDARY_SPLIT_INDEX
      ? codexSecondaryCards.slice(SECONDARY_SPLIT_INDEX)
      : [];
  const codexPlanType = codexUsage?.rateLimits.planType ?? null;
  const codexCredits = codexUsage?.rateLimits.credits ?? null;
  const hasCodexPlanCredits = Boolean(codexPlanType || codexCredits);

  const fetchClaudeUsage = useCallback(
    async (isAutoRefresh = false) => {
      if (!showClaude) return;
      if (!isAutoRefresh) setClaudeLoading(true);
      setClaudeError(null);
      try {
        const api = getElectronAPI();
        if (!api.claude) {
          setClaudeError({
            code: ERROR_CODES.API_BRIDGE_UNAVAILABLE,
            message: CLAUDE_BRIDGE_ERROR,
          });
          return;
        }
        const data = await api.claude.getUsage();
        if ('error' in data) {
          setClaudeError({
            code: ERROR_CODES.AUTH_ERROR,
            message: data.message || data.error,
          });
          return;
        }
        setClaudeUsage(data);
      } catch (err) {
        setClaudeError({
          code: ERROR_CODES.UNKNOWN,
          message: err instanceof Error ? err.message : CLAUDE_FETCH_ERROR,
        });
      } finally {
        if (!isAutoRefresh) setClaudeLoading(false);
      }
    },
    [setClaudeUsage, showClaude]
  );

  const fetchCodexUsage = useCallback(
    async (isAutoRefresh = false) => {
      if (!showCodex) return;
      if (!isAutoRefresh) setCodexLoading(true);
      setCodexError(null);
      try {
        const api = getElectronAPI();
        if (!api.codex) {
          setCodexError({
            code: ERROR_CODES.API_BRIDGE_UNAVAILABLE,
            message: CODEX_BRIDGE_ERROR,
          });
          return;
        }
        const data = await api.codex.getUsage();
        if ('error' in data) {
          setCodexError({
            code: ERROR_CODES.AUTH_ERROR,
            message: data.message || data.error,
          });
          return;
        }
        setCodexUsage(data);
      } catch (err) {
        setCodexError({
          code: ERROR_CODES.UNKNOWN,
          message: err instanceof Error ? err.message : CODEX_FETCH_ERROR,
        });
      } finally {
        if (!isAutoRefresh) setCodexLoading(false);
      }
    },
    [setCodexUsage, showCodex]
  );

  useEffect(() => {
    if (showClaude && claudeIsStale) {
      fetchClaudeUsage(true);
    }
  }, [fetchClaudeUsage, showClaude, claudeIsStale]);

  useEffect(() => {
    if (showCodex && codexIsStale) {
      fetchCodexUsage(true);
    }
  }, [fetchCodexUsage, showCodex, codexIsStale]);

  useEffect(() => {
    if (!open || !showClaude) return undefined;
    if (!claudeUsage || claudeIsStale) {
      fetchClaudeUsage(true);
    }
    const intervalId = setInterval(() => {
      fetchClaudeUsage(true);
    }, CLAUDE_REFRESH_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [open, showClaude, claudeUsage, claudeIsStale, fetchClaudeUsage]);

  useEffect(() => {
    if (!open || !showCodex) return undefined;
    if (!codexUsage || codexIsStale) {
      fetchCodexUsage(true);
    }
    const intervalId = setInterval(() => {
      fetchCodexUsage(true);
    }, CODEX_REFRESH_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [open, showCodex, codexUsage, codexIsStale, fetchCodexUsage]);

  const getStatusInfo = (percentage: number) => {
    if (percentage >= WARNING_THRESHOLD) {
      return { color: STATUS_TEXT_CRITICAL, icon: XCircle, bg: STATUS_BG_CRITICAL };
    }
    if (percentage >= CAUTION_THRESHOLD)
      return { color: STATUS_TEXT_WARNING, icon: AlertTriangle, bg: STATUS_BG_WARNING };
    return { color: STATUS_TEXT_OK, icon: CheckCircle, bg: STATUS_BG_OK };
  };

  const ProgressBar = ({ percentage, colorClass }: { percentage: number; colorClass: string }) => (
    <div className="h-2 w-full bg-secondary/50 rounded-full overflow-hidden">
      <div
        className={cn('h-full transition-all duration-500', colorClass)}
        style={{ width: `${Math.min(percentage, MAX_PERCENTAGE)}%` }}
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
      typeof percentage === 'number' && !Number.isNaN(percentage) && Number.isFinite(percentage);
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
            <span className="text-xs text-muted-foreground">{NOT_AVAILABLE_LABEL}</span>
          )}
        </div>
        <ProgressBar
          percentage={safePercentage}
          colorClass={isValidPercentage ? status.bg : 'bg-muted-foreground/30'}
        />
        {resetText && (
          <div className="mt-2 flex justify-end">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              {title === CLAUDE_SESSION_TITLE && <Clock className="w-3 h-3" />}
              {resetText}
            </p>
          </div>
        )}
      </div>
    );
  };

  const getProgressBarColor = (percentage: number) => {
    if (percentage >= WARNING_THRESHOLD) return PROGRESS_BG_CRITICAL;
    if (percentage >= CAUTION_THRESHOLD) return PROGRESS_BG_WARNING;
    return PROGRESS_BG_OK;
  };

  const PlanCreditsCard = ({
    planType,
    credits,
  }: {
    planType: CodexPlanType | null;
    credits: CodexCreditsSnapshot | null;
  }) => (
    <div className="rounded-lg border border-border/50 bg-card/40 p-3 space-y-2">
      {planType && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{PLAN_LABEL}</span>
          <span className="font-semibold text-foreground">{formatCodexPlanType(planType)}</span>
        </div>
      )}
      {credits && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{CREDITS_LABEL}</span>
          <span className="font-semibold text-foreground">{formatCodexCredits(credits)}</span>
        </div>
      )}
    </div>
  );

  if (!showClaude && !showCodex) {
    return null;
  }

  const claudeMaxPercentage =
    showClaude && claudeUsage
      ? Math.max(
          claudeUsage.sessionPercentage || 0,
          claudeUsage.weeklyPercentage || 0,
          claudeUsage.sonnetWeeklyPercentage || 0
        )
      : 0;
  const codexMaxPercentage =
    showCodex && codexUsage
      ? Math.max(
          codexUsage.rateLimits.primary?.usedPercent ?? 0,
          codexUsage.rateLimits.secondary?.usedPercent ?? 0
        )
      : 0;
  const selectedPercentage =
    activeProvider === PROVIDER_CLAUDE ? claudeMaxPercentage : codexMaxPercentage;
  const hasSelectedUsage =
    (activeProvider === PROVIDER_CLAUDE && showClaude && claudeUsage) ||
    (activeProvider === PROVIDER_CODEX && showCodex && codexUsage);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 gap-3 bg-secondary border border-border px-3"
        >
          <span className="text-sm font-medium">{USAGE_BUTTON_LABEL}</span>
          {hasSelectedUsage && (
            <div className="h-1.5 w-16 bg-muted-foreground/20 rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full transition-all duration-500',
                  getProgressBarColor(selectedPercentage)
                )}
                style={{ width: `${Math.min(selectedPercentage, MAX_PERCENTAGE)}%` }}
              />
            </div>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[360px] p-0 overflow-hidden bg-background/95 backdrop-blur-xl border-border shadow-2xl"
        align="end"
        sideOffset={8}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-secondary/10">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{USAGE_BUTTON_LABEL}</span>
          </div>
          <span className="text-[10px] text-muted-foreground">{USAGE_SUBTITLE}</span>
        </div>

        <div className="p-4 space-y-4">
          {hasBothProviders && (
            <div className="flex justify-center">
              <div
                className={PROVIDER_TOGGLE_CONTAINER}
                role="tablist"
                aria-label={PROVIDER_TOGGLE_LABEL}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  role="tab"
                  aria-pressed={activeProvider === PROVIDER_CLAUDE}
                  onClick={() => setActiveProvider(PROVIDER_CLAUDE)}
                  className={cn(
                    PROVIDER_BUTTON_BASE,
                    activeProvider === PROVIDER_CLAUDE
                      ? PROVIDER_BUTTON_ACTIVE
                      : PROVIDER_BUTTON_INACTIVE
                  )}
                >
                  {CLAUDE_SECTION_TITLE}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  role="tab"
                  aria-pressed={activeProvider === PROVIDER_CODEX}
                  onClick={() => setActiveProvider(PROVIDER_CODEX)}
                  className={cn(
                    PROVIDER_BUTTON_BASE,
                    activeProvider === PROVIDER_CODEX
                      ? PROVIDER_BUTTON_ACTIVE
                      : PROVIDER_BUTTON_INACTIVE
                  )}
                >
                  {CODEX_SECTION_TITLE}
                </Button>
              </div>
            </div>
          )}

          {showClaudeSection && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase text-muted-foreground">
                  {CLAUDE_SECTION_TITLE}
                </span>
                {claudeError && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn('h-6 w-6', claudeLoading && 'opacity-80')}
                    onClick={() => !claudeLoading && fetchClaudeUsage(false)}
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
              {claudeError && (
                <div className="flex flex-col items-center justify-center py-4 text-center space-y-2">
                  <AlertTriangle className="w-6 h-6 text-yellow-500/80" />
                  <div className="space-y-1">
                    <p className="text-xs font-medium">{claudeError.message}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {claudeError.code === ERROR_CODES.API_BRIDGE_UNAVAILABLE
                        ? BRIDGE_RECOVERY_MESSAGE
                        : CLAUDE_REAUTH_MESSAGE}
                    </p>
                  </div>
                </div>
              )}
              {!claudeError && !claudeUsage && (
                <div className="flex flex-col items-center justify-center py-4 space-y-2">
                  <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground/50" />
                  <p className="text-xs text-muted-foreground">{CLAUDE_LOADING_MESSAGE}</p>
                </div>
              )}
              {!claudeError && claudeUsage && (
                <>
                  <UsageCard
                    title={CLAUDE_SESSION_TITLE}
                    subtitle={CLAUDE_SESSION_SUBTITLE}
                    percentage={claudeUsage.sessionPercentage}
                    resetText={claudeUsage.sessionResetText}
                    isPrimary={true}
                    stale={claudeIsStale}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <UsageCard
                      title={CLAUDE_WEEKLY_TITLE}
                      subtitle={CLAUDE_WEEKLY_SUBTITLE}
                      percentage={claudeUsage.weeklyPercentage}
                      resetText={claudeUsage.weeklyResetText}
                      stale={claudeIsStale}
                    />
                    <UsageCard
                      title={CLAUDE_SONNET_TITLE}
                      subtitle={CLAUDE_SONNET_SUBTITLE}
                      percentage={claudeUsage.sonnetWeeklyPercentage}
                      resetText={claudeUsage.sonnetResetText}
                      stale={claudeIsStale}
                    />
                  </div>
                  {claudeUsage.costLimit && claudeUsage.costLimit > 0 && (
                    <UsageCard
                      title={CLAUDE_EXTRA_TITLE}
                      subtitle={`${claudeUsage.costUsed ?? 0} / ${claudeUsage.costLimit} ${claudeUsage.costCurrency ?? ''}`}
                      percentage={
                        claudeUsage.costLimit > 0
                          ? ((claudeUsage.costUsed ?? 0) / claudeUsage.costLimit) * 100
                          : 0
                      }
                      stale={claudeIsStale}
                    />
                  )}
                </>
              )}
            </div>
          )}

          {showCodexSection && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase text-muted-foreground">
                  {CODEX_SECTION_TITLE}
                </span>
                {codexError && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn('h-6 w-6', codexLoading && 'opacity-80')}
                    onClick={() => !codexLoading && fetchCodexUsage(false)}
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
              {codexError && (
                <div className="flex flex-col items-center justify-center py-4 text-center space-y-2">
                  <AlertTriangle className="w-6 h-6 text-yellow-500/80" />
                  <div className="space-y-1">
                    <p className="text-xs font-medium">{codexError.message}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {codexError.code === ERROR_CODES.API_BRIDGE_UNAVAILABLE
                        ? BRIDGE_RECOVERY_MESSAGE
                        : CODEX_REAUTH_MESSAGE}
                    </p>
                  </div>
                </div>
              )}
              {!codexError && !codexUsage && (
                <div className="flex flex-col items-center justify-center py-4 space-y-2">
                  <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground/50" />
                  <p className="text-xs text-muted-foreground">{CODEX_LOADING_MESSAGE}</p>
                </div>
              )}
              {!codexError && codexUsage && (
                <div className="space-y-2">
                  {codexPrimaryCard && (
                    <UsageCard
                      title={codexPrimaryCard.title}
                      subtitle={codexPrimaryCard.subtitle}
                      percentage={codexPrimaryCard.window.usedPercent}
                      resetText={formatCodexResetTime(codexPrimaryCard.window.resetsAt)}
                      isPrimary={codexPrimaryCard.isPrimary || codexSecondaryCards.length === 0}
                      stale={codexIsStale}
                    />
                  )}
                  {(codexSecondaryPrimary || hasCodexPlanCredits) && (
                    <div className="grid grid-cols-2 gap-3">
                      {codexSecondaryPrimary && (
                        <UsageCard
                          title={codexSecondaryPrimary.title}
                          subtitle={codexSecondaryPrimary.subtitle}
                          percentage={codexSecondaryPrimary.window.usedPercent}
                          resetText={formatCodexResetTime(codexSecondaryPrimary.window.resetsAt)}
                          stale={codexIsStale}
                        />
                      )}
                      {hasCodexPlanCredits && (
                        <PlanCreditsCard planType={codexPlanType} credits={codexCredits} />
                      )}
                    </div>
                  )}
                  {codexExtraSecondaryCards.length > 0 && (
                    <div className="grid grid-cols-2 gap-3">
                      {codexExtraSecondaryCards.map((card, index) => (
                        <UsageCard
                          key={`${card.title}-${index}`}
                          title={card.title}
                          subtitle={card.subtitle}
                          percentage={card.window.usedPercent}
                          resetText={formatCodexResetTime(card.window.resetsAt)}
                          stale={codexIsStale}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
