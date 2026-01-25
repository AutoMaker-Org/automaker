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

// Gemini Usage types - uses internal Google Cloud quota API
export interface GeminiQuotaBucket {
  /** Model ID this quota applies to */
  modelId: string;
  /** Remaining fraction (0-1) */
  remainingFraction: number;
  /** ISO-8601 reset time */
  resetTime: string;
}

/** Simplified quota info for a model tier (Flash or Pro) */
export interface GeminiTierQuota {
  /** Used percentage (0-100) */
  usedPercent: number;
  /** Remaining percentage (0-100) */
  remainingPercent: number;
  /** Reset time as human-readable string */
  resetText?: string;
  /** ISO-8601 reset time */
  resetTime?: string;
}

export interface GeminiUsage {
  /** Whether the user is authenticated (via CLI or API key) */
  authenticated: boolean;
  /** Authentication method: 'cli_login' | 'api_key' | 'api_key_env' | 'none' */
  authMethod: string;
  /** Usage percentage (100 - remainingFraction * 100) - overall most constrained */
  usedPercent: number;
  /** Remaining percentage - overall most constrained */
  remainingPercent: number;
  /** Reset time as human-readable string */
  resetText?: string;
  /** ISO-8601 reset time */
  resetTime?: string;
  /** Model ID with lowest remaining quota */
  constrainedModel?: string;
  /** Flash tier quota (aggregated from all flash models) */
  flashQuota?: GeminiTierQuota;
  /** Pro tier quota (aggregated from all pro models) */
  proQuota?: GeminiTierQuota;
  /** Raw quota buckets for detailed view */
  quotaBuckets?: GeminiQuotaBucket[];
  /** When this data was last fetched */
  lastUpdated: string;
  /** Optional error message */
  error?: string;
}

// Response type for Gemini usage API (can be success or error)
export type GeminiUsageResponse = GeminiUsage | { error: string; message?: string };
