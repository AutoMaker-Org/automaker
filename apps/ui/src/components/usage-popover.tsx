import { useState, useEffect, useMemo, useCallback } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RefreshCw, AlertTriangle, CheckCircle, XCircle, Clock, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getElectronAPI } from '@/lib/electron';
import { useAppStore } from '@/store/app-store';
import { useSetupStore } from '@/store/setup-store';
import { AnthropicIcon, OpenAIIcon } from '@/components/ui/provider-icon';

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

// Helper to format reset time for Codex
function formatCodexResetTime(unixTimestamp: number): string {
  const date = new Date(unixTimestamp * 1000);
  const now = new Date();
  const diff = date.getTime() - now.getTime();

  if (diff < 3600000) {
    const mins = Math.ceil(diff / 60000);
    return `Resets in ${mins}m`;
  }
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    const mins = Math.ceil((diff % 3600000) / 60000);
    return `Resets in ${hours}h ${mins > 0 ? `${mins}m` : ''}`;
  }
  return `Resets ${date.toLocaleDateString()} at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

// Helper to format window duration for Codex
function getCodexWindowLabel(durationMins: number): { title: string; subtitle: string } {
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

export function UsagePopover() {
  const { claudeUsage, claudeUsageLastUpdated, setClaudeUsage } = useAppStore();
  const { codexUsage, codexUsageLastUpdated, setCodexUsage } = useAppStore();
  const claudeAuthStatus = useSetupStore((state) => state.claudeAuthStatus);
  const codexAuthStatus = useSetupStore((state) => state.codexAuthStatus);

  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'claude' | 'codex'>('claude');
  const [claudeLoading, setClaudeLoading] = useState(false);
  const [codexLoading, setCodexLoading] = useState(false);
  const [claudeError, setClaudeError] = useState<UsageError | null>(null);
  const [codexError, setCodexError] = useState<UsageError | null>(null);

  // Check authentication status
  const isClaudeCliVerified =
    claudeAuthStatus?.authenticated && claudeAuthStatus?.method === 'cli_authenticated';
  const isCodexAuthenticated = codexAuthStatus?.authenticated;

  // Determine which tab to show by default
  useEffect(() => {
    if (isClaudeCliVerified) {
      setActiveTab('claude');
    } else if (isCodexAuthenticated) {
      setActiveTab('codex');
    }
  }, [isClaudeCliVerified, isCodexAuthenticated]);

  // Check if data is stale (older than 2 minutes)
  const isClaudeStale = useMemo(() => {
    return !claudeUsageLastUpdated || Date.now() - claudeUsageLastUpdated > 2 * 60 * 1000;
  }, [claudeUsageLastUpdated]);

  const isCodexStale = useMemo(() => {
    return !codexUsageLastUpdated || Date.now() - codexUsageLastUpdated > 2 * 60 * 1000;
  }, [codexUsageLastUpdated]);

  const fetchClaudeUsage = useCallback(
    async (isAutoRefresh = false) => {
      if (!isAutoRefresh) setClaudeLoading(true);
      setClaudeError(null);
      try {
        const api = getElectronAPI();
        if (!api.claude) {
          setClaudeError({
            code: ERROR_CODES.API_BRIDGE_UNAVAILABLE,
            message: 'Claude API bridge not available',
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
          message: err instanceof Error ? err.message : 'Failed to fetch usage',
        });
      } finally {
        if (!isAutoRefresh) setClaudeLoading(false);
      }
    },
    [setClaudeUsage]
  );

  const fetchCodexUsage = useCallback(
    async (isAutoRefresh = false) => {
      if (!isAutoRefresh) setCodexLoading(true);
      setCodexError(null);
      try {
        const api = getElectronAPI();
        if (!api.codex) {
          setCodexError({
            code: ERROR_CODES.API_BRIDGE_UNAVAILABLE,
            message: 'Codex API bridge not available',
          });
          return;
        }
        const data = await api.codex.getUsage();
        if ('error' in data) {
          if (
            data.message?.includes('not available') ||
            data.message?.includes('does not provide')
          ) {
            setCodexError({
              code: ERROR_CODES.NOT_AVAILABLE,
              message: data.message || data.error,
            });
          } else {
            setCodexError({
              code: ERROR_CODES.AUTH_ERROR,
              message: data.message || data.error,
            });
          }
          return;
        }
        setCodexUsage(data);
      } catch (err) {
        setCodexError({
          code: ERROR_CODES.UNKNOWN,
          message: err instanceof Error ? err.message : 'Failed to fetch usage',
        });
      } finally {
        if (!isAutoRefresh) setCodexLoading(false);
      }
    },
    [setCodexUsage]
  );

  // Auto-fetch on mount if data is stale
  useEffect(() => {
    if (isClaudeStale && isClaudeCliVerified) {
      fetchClaudeUsage(true);
    }
  }, [isClaudeStale, isClaudeCliVerified, fetchClaudeUsage]);

  useEffect(() => {
    if (isCodexStale && isCodexAuthenticated) {
      fetchCodexUsage(true);
    }
  }, [isCodexStale, isCodexAuthenticated, fetchCodexUsage]);

  // Auto-refresh when popover is open
  useEffect(() => {
    if (!open) return;

    // Fetch based on active tab
    if (activeTab === 'claude' && isClaudeCliVerified) {
      if (!claudeUsage || isClaudeStale) {
        fetchClaudeUsage();
      }
      const intervalId = setInterval(() => {
        fetchClaudeUsage(true);
      }, REFRESH_INTERVAL_SECONDS * 1000);
      return () => clearInterval(intervalId);
    }

    if (activeTab === 'codex' && isCodexAuthenticated) {
      if (!codexUsage || isCodexStale) {
        fetchCodexUsage();
      }
      const intervalId = setInterval(() => {
        fetchCodexUsage(true);
      }, REFRESH_INTERVAL_SECONDS * 1000);
      return () => clearInterval(intervalId);
    }
  }, [
    open,
    activeTab,
    claudeUsage,
    isClaudeStale,
    isClaudeCliVerified,
    codexUsage,
    isCodexStale,
    isCodexAuthenticated,
    fetchClaudeUsage,
    fetchCodexUsage,
  ]);

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

  // Calculate max percentage for header button
  const claudeMaxPercentage = claudeUsage
    ? Math.max(claudeUsage.sessionPercentage || 0, claudeUsage.weeklyPercentage || 0)
    : 0;

  const codexMaxPercentage = codexUsage?.rateLimits
    ? Math.max(
        codexUsage.rateLimits.primary?.usedPercent || 0,
        codexUsage.rateLimits.secondary?.usedPercent || 0
      )
    : 0;

  const maxPercentage = Math.max(claudeMaxPercentage, codexMaxPercentage);
  const isStale = activeTab === 'claude' ? isClaudeStale : isCodexStale;

  const getProgressBarColor = (percentage: number) => {
    if (percentage >= 80) return 'bg-red-500';
    if (percentage >= 50) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const trigger = (
    <Button variant="ghost" size="sm" className="h-9 gap-3 bg-secondary border border-border px-3">
      <span className="text-sm font-medium">Usage</span>
      {(claudeUsage || codexUsage) && (
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

  // Determine which tabs to show
  const showClaudeTab = isClaudeCliVerified;
  const showCodexTab = isCodexAuthenticated;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        className="w-80 p-0 overflow-hidden bg-background/95 backdrop-blur-xl border-border shadow-2xl"
        align="end"
        sideOffset={8}
      >
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'claude' | 'codex')}>
          {/* Tabs Header */}
          {showClaudeTab && showCodexTab && (
            <TabsList className="grid w-full grid-cols-2 rounded-none border-b border-border/50">
              <TabsTrigger value="claude" className="gap-2">
                <AnthropicIcon className="w-3.5 h-3.5" />
                Claude
              </TabsTrigger>
              <TabsTrigger value="codex" className="gap-2">
                <OpenAIIcon className="w-3.5 h-3.5" />
                Codex
              </TabsTrigger>
            </TabsList>
          )}

          {/* Claude Tab Content */}
          <TabsContent value="claude" className="m-0">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-secondary/10">
              <div className="flex items-center gap-2">
                <AnthropicIcon className="w-4 h-4" />
                <span className="text-sm font-semibold">Claude Usage</span>
              </div>
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

            {/* Content */}
            <div className="p-4 space-y-4">
              {claudeError ? (
                <div className="flex flex-col items-center justify-center py-6 text-center space-y-3">
                  <AlertTriangle className="w-8 h-8 text-yellow-500/80" />
                  <div className="space-y-1 flex flex-col items-center">
                    <p className="text-sm font-medium">{claudeError.message}</p>
                    <p className="text-xs text-muted-foreground">
                      {claudeError.code === ERROR_CODES.API_BRIDGE_UNAVAILABLE ? (
                        'Ensure the Electron bridge is running or restart the app'
                      ) : (
                        <>
                          Make sure Claude CLI is installed and authenticated via{' '}
                          <code className="font-mono bg-muted px-1 rounded">claude login</code>
                        </>
                      )}
                    </p>
                  </div>
                </div>
              ) : !claudeUsage ? (
                <div className="flex flex-col items-center justify-center py-8 space-y-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground/50" />
                  <p className="text-xs text-muted-foreground">Loading usage data...</p>
                </div>
              ) : (
                <>
                  <UsageCard
                    title="Session Usage"
                    subtitle="5-hour rolling window"
                    percentage={claudeUsage.sessionPercentage}
                    resetText={claudeUsage.sessionResetText}
                    isPrimary={true}
                    stale={isClaudeStale}
                  />

                  <div className="grid grid-cols-2 gap-3">
                    <UsageCard
                      title="Weekly"
                      subtitle="All models"
                      percentage={claudeUsage.weeklyPercentage}
                      resetText={claudeUsage.weeklyResetText}
                      stale={isClaudeStale}
                    />
                    <UsageCard
                      title="Sonnet"
                      subtitle="Weekly"
                      percentage={claudeUsage.sonnetWeeklyPercentage}
                      resetText={claudeUsage.sonnetResetText}
                      stale={isClaudeStale}
                    />
                  </div>

                  {claudeUsage.costLimit && claudeUsage.costLimit > 0 && (
                    <UsageCard
                      title="Extra Usage"
                      subtitle={`${claudeUsage.costUsed ?? 0} / ${claudeUsage.costLimit} ${claudeUsage.costCurrency ?? ''}`}
                      percentage={
                        claudeUsage.costLimit > 0
                          ? ((claudeUsage.costUsed ?? 0) / claudeUsage.costLimit) * 100
                          : 0
                      }
                      stale={isClaudeStale}
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
          </TabsContent>

          {/* Codex Tab Content */}
          <TabsContent value="codex" className="m-0">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-secondary/10">
              <div className="flex items-center gap-2">
                <OpenAIIcon className="w-4 h-4" />
                <span className="text-sm font-semibold">Codex Usage</span>
              </div>
              {codexError && codexError.code !== ERROR_CODES.NOT_AVAILABLE && (
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

            {/* Content */}
            <div className="p-4 space-y-4">
              {codexError ? (
                <div className="flex flex-col items-center justify-center py-6 text-center space-y-3">
                  <AlertTriangle className="w-8 h-8 text-yellow-500/80" />
                  <div className="space-y-1 flex flex-col items-center">
                    <p className="text-sm font-medium">
                      {codexError.code === ERROR_CODES.NOT_AVAILABLE
                        ? 'Usage not available'
                        : codexError.message}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {codexError.code === ERROR_CODES.API_BRIDGE_UNAVAILABLE ? (
                        'Ensure the Electron bridge is running or restart the app'
                      ) : codexError.code === ERROR_CODES.NOT_AVAILABLE ? (
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
                <div className="flex flex-col items-center justify-center py-8 space-y-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground/50" />
                  <p className="text-xs text-muted-foreground">Loading usage data...</p>
                </div>
              ) : codexUsage.rateLimits ? (
                <>
                  {codexUsage.rateLimits.primary && (
                    <UsageCard
                      title={
                        getCodexWindowLabel(codexUsage.rateLimits.primary.windowDurationMins).title
                      }
                      subtitle={
                        getCodexWindowLabel(codexUsage.rateLimits.primary.windowDurationMins)
                          .subtitle
                      }
                      percentage={codexUsage.rateLimits.primary.usedPercent}
                      resetText={formatCodexResetTime(codexUsage.rateLimits.primary.resetsAt)}
                      isPrimary={true}
                      stale={isCodexStale}
                    />
                  )}

                  {codexUsage.rateLimits.secondary && (
                    <UsageCard
                      title={
                        getCodexWindowLabel(codexUsage.rateLimits.secondary.windowDurationMins)
                          .title
                      }
                      subtitle={
                        getCodexWindowLabel(codexUsage.rateLimits.secondary.windowDurationMins)
                          .subtitle
                      }
                      percentage={codexUsage.rateLimits.secondary.usedPercent}
                      resetText={formatCodexResetTime(codexUsage.rateLimits.secondary.resetsAt)}
                      stale={isCodexStale}
                    />
                  )}

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
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}
