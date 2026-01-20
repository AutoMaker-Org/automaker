// Claude Usage interface matching the server response
export type ClaudeUsage = {
  sessionTokensUsed: number;
  sessionLimit: number;
  sessionPercentage: number;
  sessionResetTime: string;
  sessionResetText: string;

  weeklyTokensUsed: number;
  weeklyLimit: number;
  weeklyPercentage: number;
  weeklyResetTime: string;
  weeklyResetText: string;

  sonnetWeeklyTokensUsed: number;
  sonnetWeeklyPercentage: number;
  sonnetResetText: string;

  costUsed: number | null;
  costLimit: number | null;
  costCurrency: string | null;

  lastUpdated: string;
  userTimezone: string;
};

// Response type for Claude usage API (can be success or error)
export type ClaudeUsageResponse = ClaudeUsage | { error: string; message?: string };

// Codex Usage types
export type CodexPlanType =
  | 'free'
  | 'plus'
  | 'pro'
  | 'team'
  | 'business'
  | 'enterprise'
  | 'edu'
  | 'unknown';

export interface CodexRateLimitWindow {
  limit: number;
  used: number;
  remaining: number;
  usedPercent: number; // Percentage used (0-100)
  windowDurationMins: number; // Duration in minutes
  resetsAt: number; // Unix timestamp in seconds
}

export interface CodexUsage {
  rateLimits: {
    primary?: CodexRateLimitWindow;
    secondary?: CodexRateLimitWindow;
    planType?: CodexPlanType;
  } | null;
  lastUpdated: string;
}

// Response type for Codex usage API (can be success or error)
export type CodexUsageResponse = CodexUsage | { error: string; message?: string };

// z.ai Usage types
export type ZaiPlanType = 'free' | 'basic' | 'standard' | 'professional' | 'enterprise' | 'unknown';

export interface ZaiQuotaLimit {
  limitType: 'TOKENS_LIMIT' | 'TIME_LIMIT' | string;
  limit: number;
  used: number;
  remaining: number;
  usedPercent: number; // Percentage used (0-100)
  nextResetTime: number; // Epoch milliseconds
}

export interface ZaiUsage {
  quotaLimits: {
    tokens?: ZaiQuotaLimit;
    mcp?: ZaiQuotaLimit;
    planType: ZaiPlanType;
  } | null;
  lastUpdated: string;
}

// Response type for z.ai usage API (can be success or error)
export type ZaiUsageResponse = ZaiUsage | { error: string; message?: string };
