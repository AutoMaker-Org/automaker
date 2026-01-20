import { createLogger } from '@automaker/utils';

const logger = createLogger('ZaiUsage');

/**
 * z.ai quota limit entry from the API
 */
export interface ZaiQuotaLimit {
  limitType: 'TOKENS_LIMIT' | 'TIME_LIMIT' | string;
  limit: number;
  used: number;
  remaining: number;
  usedPercent: number;
  nextResetTime: number; // epoch milliseconds
}

/**
 * z.ai usage details by model (for MCP tracking)
 */
export interface ZaiUsageDetail {
  modelId: string;
  used: number;
  limit: number;
}

/**
 * z.ai plan types
 */
export type ZaiPlanType = 'free' | 'basic' | 'standard' | 'professional' | 'enterprise' | 'unknown';

/**
 * z.ai usage data structure
 */
export interface ZaiUsageData {
  quotaLimits: {
    tokens?: ZaiQuotaLimit;
    mcp?: ZaiQuotaLimit;
    planType: ZaiPlanType;
  } | null;
  usageDetails?: ZaiUsageDetail[];
  lastUpdated: string;
}

/**
 * z.ai API limit entry - supports multiple field naming conventions
 */
interface ZaiApiLimit {
  // Type field (z.ai uses 'type', others might use 'limitType')
  type?: string;
  limitType?: string;
  // Limit value (z.ai uses 'usage' for total limit, others might use 'limit')
  usage?: number;
  limit?: number;
  // Used value (z.ai uses 'currentValue', others might use 'used')
  currentValue?: number;
  used?: number;
  // Remaining
  remaining?: number;
  // Percentage (z.ai uses 'percentage', others might use 'usedPercent')
  percentage?: number;
  usedPercent?: number;
  // Reset time
  nextResetTime?: number;
  // Additional z.ai fields
  unit?: number;
  number?: number;
  usageDetails?: Array<{ modelCode: string; usage: number }>;
}

/**
 * z.ai API response structure
 * Flexible to handle various possible response formats
 */
interface ZaiApiResponse {
  code?: number;
  success?: boolean;
  data?: {
    limits?: ZaiApiLimit[];
    // Alternative: limits might be an object instead of array
    tokensLimit?: {
      limit: number;
      used: number;
      remaining?: number;
      usedPercent?: number;
      nextResetTime?: number;
    };
    timeLimit?: {
      limit: number;
      used: number;
      remaining?: number;
      usedPercent?: number;
      nextResetTime?: number;
    };
    // Quota-style fields
    quota?: number;
    quotaUsed?: number;
    quotaRemaining?: number;
    planName?: string;
    plan?: string;
    plan_type?: string;
    packageName?: string;
    usageDetails?: Array<{
      modelId: string;
      used: number;
      limit: number;
    }>;
  };
  // Root-level alternatives
  limits?: ZaiApiLimit[];
  quota?: number;
  quotaUsed?: number;
  message?: string;
}

/**
 * z.ai Usage Service
 *
 * Fetches usage quota data from the z.ai API.
 * Uses API token authentication stored via environment variable or settings.
 */
export class ZaiUsageService {
  private apiToken: string | null = null;
  private apiHost: string = 'https://api.z.ai';

  /**
   * Set the API token for authentication
   */
  setApiToken(token: string): void {
    this.apiToken = token;
    logger.info('[setApiToken] API token configured');
  }

  /**
   * Get the current API token
   */
  getApiToken(): string | null {
    // Priority: 1. Instance token, 2. Environment variable
    return this.apiToken || process.env.Z_AI_API_KEY || null;
  }

  /**
   * Set the API host (for BigModel CN region support)
   */
  setApiHost(host: string): void {
    this.apiHost = host.startsWith('http') ? host : `https://${host}`;
    logger.info(`[setApiHost] API host set to: ${this.apiHost}`);
  }

  /**
   * Get the API host
   */
  getApiHost(): string {
    // Priority: 1. Instance host, 2. Z_AI_API_HOST env, 3. Default
    return process.env.Z_AI_API_HOST ? `https://${process.env.Z_AI_API_HOST}` : this.apiHost;
  }

  /**
   * Check if z.ai API is available (has token configured)
   */
  isAvailable(): boolean {
    const token = this.getApiToken();
    return Boolean(token && token.length > 0);
  }

  /**
   * Fetch usage data from z.ai API
   */
  async fetchUsageData(): Promise<ZaiUsageData> {
    logger.info('[fetchUsageData] Starting...');

    const token = this.getApiToken();
    if (!token) {
      logger.error('[fetchUsageData] No API token configured');
      throw new Error('z.ai API token not configured. Set Z_AI_API_KEY environment variable.');
    }

    const quotaUrl =
      process.env.Z_AI_QUOTA_URL || `${this.getApiHost()}/api/monitor/usage/quota/limit`;

    logger.info(`[fetchUsageData] Fetching from: ${quotaUrl}`);

    try {
      const response = await fetch(quotaUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        logger.error(`[fetchUsageData] HTTP ${response.status}: ${response.statusText}`);
        throw new Error(`z.ai API request failed: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as unknown as ZaiApiResponse;
      logger.info('[fetchUsageData] Response received:', JSON.stringify(data, null, 2));

      return this.parseApiResponse(data);
    } catch (error) {
      if (error instanceof Error && error.message.includes('z.ai API')) {
        throw error;
      }
      logger.error('[fetchUsageData] Failed to fetch:', error);
      throw new Error(
        `Failed to fetch z.ai usage data: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Parse the z.ai API response into our data structure
   * Handles multiple possible response formats from z.ai API
   */
  private parseApiResponse(response: ZaiApiResponse): ZaiUsageData {
    const result: ZaiUsageData = {
      quotaLimits: {
        planType: 'unknown',
      },
      lastUpdated: new Date().toISOString(),
    };

    logger.info('[parseApiResponse] Raw response:', JSON.stringify(response, null, 2));

    // Try to find data - could be in response.data or at root level
    let data = response.data;

    // Check for root-level limits array
    if (!data && response.limits) {
      logger.info('[parseApiResponse] Found limits at root level');
      data = { limits: response.limits };
    }

    // Check for root-level quota fields
    if (!data && (response.quota !== undefined || response.quotaUsed !== undefined)) {
      logger.info('[parseApiResponse] Found quota fields at root level');
      data = { quota: response.quota, quotaUsed: response.quotaUsed };
    }

    if (!data) {
      logger.warn('[parseApiResponse] No data found in response');
      return result;
    }

    logger.info('[parseApiResponse] Data keys:', Object.keys(data));

    // Parse plan type from various possible field names
    const planName = data.planName || data.plan || data.plan_type || data.packageName;

    if (planName) {
      const normalizedPlan = String(planName).toLowerCase();
      if (['free', 'basic', 'standard', 'professional', 'enterprise'].includes(normalizedPlan)) {
        result.quotaLimits!.planType = normalizedPlan as ZaiPlanType;
      }
      logger.info(`[parseApiResponse] Plan type: ${result.quotaLimits!.planType}`);
    }

    // Parse quota limits from array format
    if (data.limits && Array.isArray(data.limits)) {
      logger.info('[parseApiResponse] Parsing limits array with', data.limits.length, 'entries');
      for (const limit of data.limits) {
        logger.info('[parseApiResponse] Processing limit:', JSON.stringify(limit));

        // Handle different field naming conventions from z.ai API:
        // - 'usage' is the total limit, 'currentValue' is the used amount
        // - OR 'limit' is the total limit, 'used' is the used amount
        const limitVal = limit.usage ?? limit.limit ?? 0;
        const usedVal = limit.currentValue ?? limit.used ?? 0;

        // Get percentage from 'percentage' or 'usedPercent' field, or calculate it
        const apiPercent = limit.percentage ?? limit.usedPercent;
        const calculatedPercent = limitVal > 0 ? (usedVal / limitVal) * 100 : 0;
        const usedPercent =
          apiPercent !== undefined && apiPercent > 0 ? apiPercent : calculatedPercent;

        // Get limit type from 'type' or 'limitType' field
        const rawLimitType = limit.type ?? limit.limitType ?? '';

        const quotaLimit: ZaiQuotaLimit = {
          limitType: rawLimitType || 'TOKENS_LIMIT',
          limit: limitVal,
          used: usedVal,
          remaining: limit.remaining ?? limitVal - usedVal,
          usedPercent,
          nextResetTime: limit.nextResetTime ?? 0,
        };

        // Match various possible limitType values
        const limitType = String(rawLimitType).toUpperCase();
        if (limitType.includes('TOKEN') || limitType === 'TOKENS_LIMIT') {
          result.quotaLimits!.tokens = quotaLimit;
          logger.info(
            `[parseApiResponse] Tokens: ${quotaLimit.used}/${quotaLimit.limit} (${quotaLimit.usedPercent.toFixed(1)}%)`
          );
        } else if (limitType.includes('TIME') || limitType === 'TIME_LIMIT') {
          result.quotaLimits!.mcp = quotaLimit;
          logger.info(
            `[parseApiResponse] MCP: ${quotaLimit.used}/${quotaLimit.limit} (${quotaLimit.usedPercent.toFixed(1)}%)`
          );
        } else {
          // If limitType is unknown, use as tokens by default (first one)
          if (!result.quotaLimits!.tokens) {
            quotaLimit.limitType = 'TOKENS_LIMIT';
            result.quotaLimits!.tokens = quotaLimit;
            logger.info(`[parseApiResponse] Unknown limit type '${rawLimitType}', using as tokens`);
          }
        }
      }
    }

    // Parse alternative object-style limits
    if (data.tokensLimit) {
      const t = data.tokensLimit;
      const limitVal = t.limit ?? 0;
      const usedVal = t.used ?? 0;
      const calculatedPercent = limitVal > 0 ? (usedVal / limitVal) * 100 : 0;
      result.quotaLimits!.tokens = {
        limitType: 'TOKENS_LIMIT',
        limit: limitVal,
        used: usedVal,
        remaining: t.remaining ?? limitVal - usedVal,
        usedPercent:
          t.usedPercent !== undefined && t.usedPercent > 0 ? t.usedPercent : calculatedPercent,
        nextResetTime: t.nextResetTime ?? 0,
      };
      logger.info('[parseApiResponse] Parsed tokensLimit object');
    }

    if (data.timeLimit) {
      const t = data.timeLimit;
      const limitVal = t.limit ?? 0;
      const usedVal = t.used ?? 0;
      const calculatedPercent = limitVal > 0 ? (usedVal / limitVal) * 100 : 0;
      result.quotaLimits!.mcp = {
        limitType: 'TIME_LIMIT',
        limit: limitVal,
        used: usedVal,
        remaining: t.remaining ?? limitVal - usedVal,
        usedPercent:
          t.usedPercent !== undefined && t.usedPercent > 0 ? t.usedPercent : calculatedPercent,
        nextResetTime: t.nextResetTime ?? 0,
      };
      logger.info('[parseApiResponse] Parsed timeLimit object');
    }

    // Parse simple quota/quotaUsed format as tokens
    if (data.quota !== undefined && data.quotaUsed !== undefined && !result.quotaLimits!.tokens) {
      const limitVal = Number(data.quota) || 0;
      const usedVal = Number(data.quotaUsed) || 0;
      result.quotaLimits!.tokens = {
        limitType: 'TOKENS_LIMIT',
        limit: limitVal,
        used: usedVal,
        remaining:
          data.quotaRemaining !== undefined ? Number(data.quotaRemaining) : limitVal - usedVal,
        usedPercent: limitVal > 0 ? (usedVal / limitVal) * 100 : 0,
        nextResetTime: 0,
      };
      logger.info('[parseApiResponse] Parsed simple quota format');
    }

    // Parse usage details (MCP tracking)
    if (data.usageDetails && Array.isArray(data.usageDetails)) {
      result.usageDetails = data.usageDetails.map((detail) => ({
        modelId: detail.modelId,
        used: detail.used,
        limit: detail.limit,
      }));
      logger.info(`[parseApiResponse] Usage details for ${result.usageDetails.length} models`);
    }

    logger.info('[parseApiResponse] Final result:', JSON.stringify(result, null, 2));
    return result;
  }
}
