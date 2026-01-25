import { useState, useEffect, useMemo } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RefreshCw, AlertTriangle, CheckCircle, XCircle, Clock, ExternalLink } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { useSetupStore } from '@/store/setup-store';
import { AnthropicIcon, OpenAIIcon, ZaiIcon, GeminiIcon } from '@/components/ui/provider-icon';
import { useClaudeUsage, useCodexUsage, useZaiUsage, useGeminiUsage } from '@/hooks/queries';

// Error codes for distinguishing failure modes
const ERROR_CODES = {
  API_BRIDGE_UNAVAILABLE: 'API_BRIDGE_UNAVAILABLE',
  AUTH_ERROR: 'AUTH_ERROR',
  NOT_AVAILABLE: 'NOT_AVAILABLE',
  TRUST_PROMPT: 'TRUST_PROMPT',
  UNKNOWN: 'UNKNOWN',
} as const;

type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

type UsageError = {
  code: ErrorCode;
  message: string;
};

const CLAUDE_SESSION_WINDOW_HOURS = 5;

// Helper to format reset time for Codex/z.ai (unix timestamp in seconds or milliseconds)
function formatResetTime(unixTimestamp: number, isMilliseconds = false): string {
  const date = new Date(isMilliseconds ? unixTimestamp : unixTimestamp * 1000);
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

// Legacy alias for Codex
function formatCodexResetTime(unixTimestamp: number): string {
  return formatResetTime(unixTimestamp, false);
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

// Helper to format large numbers with K/M suffixes
function formatNumber(num: number): string {
  if (num >= 1_000_000_000) {
    return `${(num / 1_000_000_000).toFixed(1)}B`;
  }
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`;
  }
  return num.toLocaleString();
}

export function UsagePopover() {
  const claudeAuthStatus = useSetupStore((state) => state.claudeAuthStatus);
  const codexAuthStatus = useSetupStore((state) => state.codexAuthStatus);
  const zaiAuthStatus = useSetupStore((state) => state.zaiAuthStatus);
  const geminiAuthStatus = useSetupStore((state) => state.geminiAuthStatus);

  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'claude' | 'codex' | 'zai' | 'gemini'>('claude');

  // Check authentication status
  const isClaudeAuthenticated = !!claudeAuthStatus?.authenticated;
  const isCodexAuthenticated = codexAuthStatus?.authenticated;
  const isZaiAuthenticated = zaiAuthStatus?.authenticated;
  const isGeminiAuthenticated = geminiAuthStatus?.authenticated;

  // Use React Query hooks for usage data
  // Only enable polling when popover is open AND the tab is active
  const {
    data: claudeUsage,
    isLoading: claudeLoading,
    error: claudeQueryError,
    dataUpdatedAt: claudeUsageLastUpdated,
    refetch: refetchClaude,
  } = useClaudeUsage(open && activeTab === 'claude' && isClaudeAuthenticated);

  const {
    data: codexUsage,
    isLoading: codexLoading,
    error: codexQueryError,
    dataUpdatedAt: codexUsageLastUpdated,
    refetch: refetchCodex,
  } = useCodexUsage(open && activeTab === 'codex' && isCodexAuthenticated);

  const {
    data: zaiUsage,
    isLoading: zaiLoading,
    error: zaiQueryError,
    dataUpdatedAt: zaiUsageLastUpdated,
    refetch: refetchZai,
  } = useZaiUsage(open && activeTab === 'zai' && isZaiAuthenticated);

  const {
    data: geminiUsage,
    isLoading: geminiLoading,
    error: geminiQueryError,
    dataUpdatedAt: geminiUsageLastUpdated,
    refetch: refetchGemini,
  } = useGeminiUsage(open && activeTab === 'gemini' && isGeminiAuthenticated);

  // Parse errors into structured format
  const claudeError = useMemo((): UsageError | null => {
    if (!claudeQueryError) return null;
    const message =
      claudeQueryError instanceof Error ? claudeQueryError.message : String(claudeQueryError);
    // Detect trust prompt error
    const isTrustPrompt = message.includes('Trust prompt') || message.includes('folder permission');
    if (isTrustPrompt) {
      return { code: ERROR_CODES.TRUST_PROMPT, message };
    }
    if (message.includes('API bridge')) {
      return { code: ERROR_CODES.API_BRIDGE_UNAVAILABLE, message };
    }
    return { code: ERROR_CODES.AUTH_ERROR, message };
  }, [claudeQueryError]);

  const codexError = useMemo((): UsageError | null => {
    if (!codexQueryError) return null;
    const message =
      codexQueryError instanceof Error ? codexQueryError.message : String(codexQueryError);
    if (message.includes('not available') || message.includes('does not provide')) {
      return { code: ERROR_CODES.NOT_AVAILABLE, message };
    }
    if (message.includes('API bridge')) {
      return { code: ERROR_CODES.API_BRIDGE_UNAVAILABLE, message };
    }
    return { code: ERROR_CODES.AUTH_ERROR, message };
  }, [codexQueryError]);

  const zaiError = useMemo((): UsageError | null => {
    if (!zaiQueryError) return null;
    const message = zaiQueryError instanceof Error ? zaiQueryError.message : String(zaiQueryError);
    if (message.includes('not configured') || message.includes('API token')) {
      return { code: ERROR_CODES.NOT_AVAILABLE, message };
    }
    if (message.includes('API bridge')) {
      return { code: ERROR_CODES.API_BRIDGE_UNAVAILABLE, message };
    }
    return { code: ERROR_CODES.AUTH_ERROR, message };
  }, [zaiQueryError]);

  const geminiError = useMemo((): UsageError | null => {
    if (!geminiQueryError) return null;
    const message =
      geminiQueryError instanceof Error ? geminiQueryError.message : String(geminiQueryError);
    if (message.includes('not configured') || message.includes('not authenticated')) {
      return { code: ERROR_CODES.NOT_AVAILABLE, message };
    }
    if (message.includes('API bridge')) {
      return { code: ERROR_CODES.API_BRIDGE_UNAVAILABLE, message };
    }
    return { code: ERROR_CODES.AUTH_ERROR, message };
  }, [geminiQueryError]);

  // Determine which tab to show by default
  useEffect(() => {
    if (isClaudeAuthenticated) {
      setActiveTab('claude');
    } else if (isCodexAuthenticated) {
      setActiveTab('codex');
    } else if (isZaiAuthenticated) {
      setActiveTab('zai');
    } else if (isGeminiAuthenticated) {
      setActiveTab('gemini');
    }
  }, [isClaudeAuthenticated, isCodexAuthenticated, isZaiAuthenticated, isGeminiAuthenticated]);

  // Check if data is stale (older than 2 minutes)
  const isClaudeStale = useMemo(() => {
    return !claudeUsageLastUpdated || Date.now() - claudeUsageLastUpdated > 2 * 60 * 1000;
  }, [claudeUsageLastUpdated]);

  const isCodexStale = useMemo(() => {
    return !codexUsageLastUpdated || Date.now() - codexUsageLastUpdated > 2 * 60 * 1000;
  }, [codexUsageLastUpdated]);

  const isZaiStale = useMemo(() => {
    return !zaiUsageLastUpdated || Date.now() - zaiUsageLastUpdated > 2 * 60 * 1000;
  }, [zaiUsageLastUpdated]);

  const isGeminiStale = useMemo(() => {
    return !geminiUsageLastUpdated || Date.now() - geminiUsageLastUpdated > 2 * 60 * 1000;
  }, [geminiUsageLastUpdated]);

  // Refetch functions for manual refresh
  const fetchClaudeUsage = () => refetchClaude();
  const fetchCodexUsage = () => refetchCodex();
  const fetchZaiUsage = () => refetchZai();
  const fetchGeminiUsage = () => refetchGemini();

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
  const claudeSessionPercentage = claudeUsage?.sessionPercentage || 0;

  const codexMaxPercentage = codexUsage?.rateLimits
    ? Math.max(
        codexUsage.rateLimits.primary?.usedPercent || 0,
        codexUsage.rateLimits.secondary?.usedPercent || 0
      )
    : 0;

  const zaiMaxPercentage = zaiUsage?.quotaLimits
    ? Math.max(
        zaiUsage.quotaLimits.tokens?.usedPercent || 0,
        zaiUsage.quotaLimits.mcp?.usedPercent || 0
      )
    : 0;

  // Gemini quota from Google Cloud API (if available)
  const geminiMaxPercentage = geminiUsage?.usedPercent ?? (geminiUsage?.authenticated ? 0 : 100);

  const getProgressBarColor = (percentage: number) => {
    if (percentage >= 80) return 'bg-red-500';
    if (percentage >= 50) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const codexPrimaryWindowMinutes = codexUsage?.rateLimits?.primary?.windowDurationMins ?? null;
  const codexSecondaryWindowMinutes = codexUsage?.rateLimits?.secondary?.windowDurationMins ?? null;
  const codexWindowMinutes =
    codexSecondaryWindowMinutes && codexPrimaryWindowMinutes
      ? Math.min(codexPrimaryWindowMinutes, codexSecondaryWindowMinutes)
      : (codexSecondaryWindowMinutes ?? codexPrimaryWindowMinutes);
  const codexWindowLabel = codexWindowMinutes
    ? getCodexWindowLabel(codexWindowMinutes).title
    : 'Window';
  const codexWindowUsage =
    codexWindowMinutes === codexSecondaryWindowMinutes
      ? codexUsage?.rateLimits?.secondary?.usedPercent
      : codexUsage?.rateLimits?.primary?.usedPercent;

  // Determine which provider icon and percentage to show based on active tab
  const indicatorInfo =
    activeTab === 'claude'
      ? {
          icon: AnthropicIcon,
          percentage: claudeSessionPercentage,
          isStale: isClaudeStale,
          title: `Session usage (${CLAUDE_SESSION_WINDOW_HOURS}h window)`,
        }
      : activeTab === 'codex'
        ? {
            icon: OpenAIIcon,
            percentage: codexWindowUsage ?? 0,
            isStale: isCodexStale,
          }
        : activeTab === 'zai'
          ? {
              icon: ZaiIcon,
              percentage: zaiMaxPercentage,
              isStale: isZaiStale,
              title: `Usage (z.ai)`,
            }
          : activeTab === 'gemini'
            ? {
                icon: GeminiIcon,
                percentage: geminiMaxPercentage,
                isStale: isGeminiStale,
                title: `Usage (Gemini)`,
              }
            : null;

  const statusColor = getStatusInfo(indicatorInfo.percentage).color;
  const ProviderIcon = indicatorInfo.icon;

  const trigger = (
    <Button variant="ghost" size="sm" className="h-9 gap-2 bg-secondary border border-border px-3">
      {(claudeUsage || codexUsage || zaiUsage || geminiUsage) && (
        <ProviderIcon className={cn('w-4 h-4', statusColor)} />
      )}
      <span className="text-sm font-medium">Usage</span>
      {(claudeUsage || codexUsage || zaiUsage || geminiUsage) && (
        <div
          title={indicatorInfo.title}
          className={cn(
            'h-1.5 w-16 bg-muted-foreground/20 rounded-full overflow-hidden transition-opacity',
            indicatorInfo.isStale && 'opacity-60'
          )}
        >
          <div
            className={cn(
              'h-full transition-all duration-500',
              getProgressBarColor(indicatorInfo.percentage)
            )}
            style={{ width: `${Math.min(indicatorInfo.percentage, 100)}%` }}
          />
        </div>
      )}
    </Button>
  );

  // Determine which tabs to show
  const showClaudeTab = isClaudeAuthenticated;
  const showCodexTab = isCodexAuthenticated;
  const showZaiTab = isZaiAuthenticated;
  const showGeminiTab = isGeminiAuthenticated;
  const tabCount = [showClaudeTab, showCodexTab, showZaiTab, showGeminiTab].filter(Boolean).length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        className="w-80 p-0 overflow-hidden bg-background/95 backdrop-blur-xl border-border shadow-2xl"
        align="end"
        sideOffset={8}
      >
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as 'claude' | 'codex' | 'zai' | 'gemini')}
        >
          {/* Tabs Header */}
          {tabCount > 1 && (
            <TabsList
              className={cn(
                'grid w-full rounded-none border-b border-border/50',
                tabCount === 2 && 'grid-cols-2',
                tabCount === 3 && 'grid-cols-3',
                tabCount === 4 && 'grid-cols-4'
              )}
            >
              {showClaudeTab && (
                <TabsTrigger value="claude" className="gap-2">
                  <AnthropicIcon className="w-3.5 h-3.5" />
                  Claude
                </TabsTrigger>
              )}
              {showCodexTab && (
                <TabsTrigger value="codex" className="gap-2">
                  <OpenAIIcon className="w-3.5 h-3.5" />
                  Codex
                </TabsTrigger>
              )}
              {showZaiTab && (
                <TabsTrigger value="zai" className="gap-2">
                  <ZaiIcon className="w-3.5 h-3.5" />
                  z.ai
                </TabsTrigger>
              )}
              {showGeminiTab && (
                <TabsTrigger value="gemini" className="gap-2">
                  <GeminiIcon className="w-3.5 h-3.5" />
                  Gemini
                </TabsTrigger>
              )}
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
                  onClick={() => !claudeLoading && fetchClaudeUsage()}
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
                      ) : claudeError.code === ERROR_CODES.TRUST_PROMPT ? (
                        <>
                          Run <code className="font-mono bg-muted px-1 rounded">claude</code> in
                          your terminal and approve access to continue
                        </>
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
                  <Spinner size="lg" />
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
                  onClick={() => !codexLoading && fetchCodexUsage()}
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
                  <Spinner size="lg" />
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

          {/* z.ai Tab Content */}
          <TabsContent value="zai" className="m-0">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-secondary/10">
              <div className="flex items-center gap-2">
                <ZaiIcon className="w-4 h-4" />
                <span className="text-sm font-semibold">z.ai Usage</span>
              </div>
              {zaiError && zaiError.code !== ERROR_CODES.NOT_AVAILABLE && (
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn('h-6 w-6', zaiLoading && 'opacity-80')}
                  onClick={() => !zaiLoading && fetchZaiUsage()}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>

            {/* Content */}
            <div className="p-4 space-y-4">
              {zaiError ? (
                <div className="flex flex-col items-center justify-center py-6 text-center space-y-3">
                  <AlertTriangle className="w-8 h-8 text-yellow-500/80" />
                  <div className="space-y-1 flex flex-col items-center">
                    <p className="text-sm font-medium">
                      {zaiError.code === ERROR_CODES.NOT_AVAILABLE
                        ? 'z.ai not configured'
                        : zaiError.message}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {zaiError.code === ERROR_CODES.API_BRIDGE_UNAVAILABLE ? (
                        'Ensure the Electron bridge is running or restart the app'
                      ) : zaiError.code === ERROR_CODES.NOT_AVAILABLE ? (
                        <>
                          Set <code className="font-mono bg-muted px-1 rounded">Z_AI_API_KEY</code>{' '}
                          environment variable to enable z.ai usage tracking
                        </>
                      ) : (
                        <>Check your z.ai API key configuration</>
                      )}
                    </p>
                  </div>
                </div>
              ) : !zaiUsage ? (
                <div className="flex flex-col items-center justify-center py-8 space-y-2">
                  <Spinner size="lg" />
                  <p className="text-xs text-muted-foreground">Loading usage data...</p>
                </div>
              ) : zaiUsage.quotaLimits &&
                (zaiUsage.quotaLimits.tokens || zaiUsage.quotaLimits.mcp) ? (
                <>
                  {zaiUsage.quotaLimits.tokens && (
                    <UsageCard
                      title="Token Quota"
                      subtitle={`${formatNumber(zaiUsage.quotaLimits.tokens.used)} / ${formatNumber(zaiUsage.quotaLimits.tokens.limit)} tokens`}
                      percentage={zaiUsage.quotaLimits.tokens.usedPercent}
                      resetText={
                        zaiUsage.quotaLimits.tokens.nextResetTime
                          ? formatResetTime(zaiUsage.quotaLimits.tokens.nextResetTime, true)
                          : undefined
                      }
                      isPrimary={true}
                      stale={isZaiStale}
                    />
                  )}

                  {zaiUsage.quotaLimits.mcp && (
                    <UsageCard
                      title="MCP Quota"
                      subtitle={`${formatNumber(zaiUsage.quotaLimits.mcp.used)} / ${formatNumber(zaiUsage.quotaLimits.mcp.limit)} calls`}
                      percentage={zaiUsage.quotaLimits.mcp.usedPercent}
                      resetText={
                        zaiUsage.quotaLimits.mcp.nextResetTime
                          ? formatResetTime(zaiUsage.quotaLimits.mcp.nextResetTime, true)
                          : undefined
                      }
                      stale={isZaiStale}
                    />
                  )}

                  {zaiUsage.quotaLimits.planType && zaiUsage.quotaLimits.planType !== 'unknown' && (
                    <div className="rounded-xl border border-border/40 bg-secondary/20 p-3">
                      <p className="text-xs text-muted-foreground">
                        Plan:{' '}
                        <span className="text-foreground font-medium">
                          {zaiUsage.quotaLimits.planType.charAt(0).toUpperCase() +
                            zaiUsage.quotaLimits.planType.slice(1)}
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
                href="https://z.ai"
                target="_blank"
                rel="noreferrer"
                className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
              >
                z.ai <ExternalLink className="w-2.5 h-2.5" />
              </a>
              <span className="text-[10px] text-muted-foreground">Updates every minute</span>
            </div>
          </TabsContent>

          {/* Gemini Tab Content */}
          <TabsContent value="gemini" className="m-0">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-secondary/10">
              <div className="flex items-center gap-2">
                <GeminiIcon className="w-4 h-4" />
                <span className="text-sm font-semibold">Gemini Usage</span>
              </div>
              {geminiError && geminiError.code !== ERROR_CODES.NOT_AVAILABLE && (
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn('h-6 w-6', geminiLoading && 'opacity-80')}
                  onClick={() => !geminiLoading && fetchGeminiUsage()}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>

            {/* Content */}
            <div className="p-4 space-y-4">
              {geminiError ? (
                <div className="flex flex-col items-center justify-center py-6 text-center space-y-3">
                  <AlertTriangle className="w-8 h-8 text-yellow-500/80" />
                  <div className="space-y-1 flex flex-col items-center">
                    <p className="text-sm font-medium">
                      {geminiError.code === ERROR_CODES.NOT_AVAILABLE
                        ? 'Gemini not configured'
                        : geminiError.message}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {geminiError.code === ERROR_CODES.API_BRIDGE_UNAVAILABLE ? (
                        'Ensure the Electron bridge is running or restart the app'
                      ) : geminiError.code === ERROR_CODES.NOT_AVAILABLE ? (
                        <>
                          Run{' '}
                          <code className="font-mono bg-muted px-1 rounded">gemini auth login</code>{' '}
                          to authenticate with your Google account
                        </>
                      ) : (
                        <>Check your Gemini CLI configuration</>
                      )}
                    </p>
                  </div>
                </div>
              ) : !geminiUsage ? (
                <div className="flex flex-col items-center justify-center py-8 space-y-2">
                  <Spinner size="lg" />
                  <p className="text-xs text-muted-foreground">Loading usage data...</p>
                </div>
              ) : geminiUsage.authenticated ? (
                <>
                  {/* Show Flash and Pro quota tiers */}
                  {geminiUsage.flashQuota || geminiUsage.proQuota ? (
                    <div className="grid grid-cols-2 gap-3">
                      {geminiUsage.flashQuota && (
                        <UsageCard
                          title="Flash"
                          subtitle="Flash models"
                          percentage={geminiUsage.flashQuota.usedPercent}
                          resetText={geminiUsage.flashQuota.resetText}
                          stale={isGeminiStale}
                        />
                      )}
                      {geminiUsage.proQuota && (
                        <UsageCard
                          title="Pro"
                          subtitle="Pro models"
                          percentage={geminiUsage.proQuota.usedPercent}
                          resetText={geminiUsage.proQuota.resetText}
                          stale={isGeminiStale}
                        />
                      )}
                    </div>
                  ) : (
                    <>
                      {/* No quota data available - show connected status */}
                      <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center border border-emerald-500/20 shrink-0">
                          <CheckCircle className="w-5 h-5 text-emerald-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-emerald-400">Connected</p>
                          <p className="text-xs text-emerald-400/70 mt-0.5">
                            Authenticated via{' '}
                            <span className="font-mono">
                              {geminiUsage.authMethod === 'cli_login'
                                ? 'CLI Login'
                                : geminiUsage.authMethod === 'api_key_env'
                                  ? 'API Key (Environment)'
                                  : geminiUsage.authMethod === 'api_key'
                                    ? 'API Key'
                                    : 'Unknown'}
                            </span>
                          </p>
                        </div>
                      </div>

                      <div className="rounded-xl border border-border/40 bg-secondary/20 p-3">
                        <p className="text-xs text-muted-foreground">
                          {geminiUsage.error ? (
                            <>Quota API: {geminiUsage.error}</>
                          ) : (
                            <>No usage yet or quota data unavailable</>
                          )}
                        </p>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <AlertTriangle className="w-8 h-8 text-yellow-500/80" />
                  <p className="text-sm font-medium mt-3">Not authenticated</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Run <code className="font-mono bg-muted px-1 rounded">gemini auth login</code>{' '}
                    to authenticate
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-4 py-2 bg-secondary/10 border-t border-border/50">
              <a
                href="https://ai.google.dev"
                target="_blank"
                rel="noreferrer"
                className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
              >
                Google AI <ExternalLink className="w-2.5 h-2.5" />
              </a>
              <span className="text-[10px] text-muted-foreground">Updates every minute</span>
            </div>
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}
