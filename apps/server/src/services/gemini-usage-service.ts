/**
 * Gemini Usage Service
 *
 * Service for tracking Gemini CLI usage and quota.
 * Uses the internal Google Cloud quota API (same as CodexBar).
 * See: https://github.com/steipete/CodexBar/blob/main/docs/gemini.md
 *
 * OAuth credentials are extracted from the Gemini CLI installation,
 * not hardcoded, to ensure compatibility with CLI updates.
 */

import { createLogger } from '@automaker/utils';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

const logger = createLogger('GeminiUsage');

// Quota API endpoint (internal Google Cloud API)
const QUOTA_API_URL = 'https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota';

// Code Assist endpoint for getting project ID and tier info
const CODE_ASSIST_URL = 'https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist';

// Google OAuth endpoints for token refresh
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

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

export interface GeminiUsageData {
  /** Whether authenticated via CLI */
  authenticated: boolean;
  /** Authentication method */
  authMethod: 'cli_login' | 'api_key' | 'none';
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

interface OAuthCredentials {
  access_token?: string;
  id_token?: string;
  refresh_token?: string;
  token_type?: string;
  expiry_date?: number;
  client_id?: string;
  client_secret?: string;
}

interface OAuthClientCredentials {
  clientId: string;
  clientSecret: string;
}

interface QuotaResponse {
  // The actual API returns 'buckets', not 'quotaBuckets'
  buckets?: Array<{
    modelId?: string;
    remainingFraction?: number;
    resetTime?: string;
    tokenType?: string;
  }>;
  // Legacy field name (in case API changes)
  quotaBuckets?: Array<{
    modelId?: string;
    remainingFraction?: number;
    resetTime?: string;
    tokenType?: string;
  }>;
}

/**
 * Gemini Usage Service
 *
 * Provides real usage/quota data for Gemini CLI users.
 * Extracts OAuth credentials from the Gemini CLI installation.
 */
export class GeminiUsageService {
  private cachedCredentials: OAuthCredentials | null = null;
  private cachedClientCredentials: OAuthClientCredentials | null = null;
  private credentialsPath: string;

  constructor() {
    // Default credentials path for Gemini CLI
    this.credentialsPath = path.join(os.homedir(), '.gemini', 'oauth_creds.json');
  }

  /**
   * Check if Gemini CLI is authenticated
   */
  async isAvailable(): Promise<boolean> {
    const creds = await this.loadCredentials();
    return Boolean(creds?.access_token || creds?.refresh_token);
  }

  /**
   * Fetch quota/usage data from Google Cloud API
   */
  async fetchUsageData(): Promise<GeminiUsageData> {
    logger.info('[fetchUsageData] Starting...');

    const creds = await this.loadCredentials();

    if (!creds || (!creds.access_token && !creds.refresh_token)) {
      logger.info('[fetchUsageData] No credentials found');
      return {
        authenticated: false,
        authMethod: 'none',
        usedPercent: 0,
        remainingPercent: 100,
        lastUpdated: new Date().toISOString(),
        error: 'Not authenticated. Run "gemini auth login" to authenticate.',
      };
    }

    try {
      // Get a valid access token (refresh if needed)
      const accessToken = await this.getValidAccessToken(creds);

      if (!accessToken) {
        return {
          authenticated: false,
          authMethod: 'none',
          usedPercent: 0,
          remainingPercent: 100,
          lastUpdated: new Date().toISOString(),
          error: 'Failed to obtain access token. Try running "gemini auth login" again.',
        };
      }

      // First, get the project ID from loadCodeAssist endpoint
      // This is required to get accurate quota data
      let projectId: string | undefined;
      try {
        const codeAssistResponse = await fetch(CODE_ASSIST_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        });

        if (codeAssistResponse.ok) {
          const codeAssistData = (await codeAssistResponse.json()) as {
            cloudaicompanionProject?: string;
            currentTier?: { id?: string; name?: string };
          };
          projectId = codeAssistData.cloudaicompanionProject;
          logger.debug('[fetchUsageData] Got project ID:', projectId);
        }
      } catch (e) {
        logger.debug('[fetchUsageData] Failed to get project ID:', e);
      }

      // Fetch quota from Google Cloud API
      // Pass project ID to get accurate quota (without it, returns default 100%)
      const response = await fetch(QUOTA_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(projectId ? { project: projectId } : {}),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        logger.error('[fetchUsageData] Quota API error:', response.status, errorText);

        // Still authenticated, but quota API failed
        return {
          authenticated: true,
          authMethod: 'cli_login',
          usedPercent: 0,
          remainingPercent: 100,
          lastUpdated: new Date().toISOString(),
          error: `Quota API unavailable (${response.status})`,
        };
      }

      const data = (await response.json()) as QuotaResponse;

      // API returns 'buckets', with fallback to 'quotaBuckets' for compatibility
      const apiBuckets = data.buckets || data.quotaBuckets;

      logger.debug('[fetchUsageData] Raw buckets:', JSON.stringify(apiBuckets));

      if (!apiBuckets || apiBuckets.length === 0) {
        return {
          authenticated: true,
          authMethod: 'cli_login',
          usedPercent: 0,
          remainingPercent: 100,
          lastUpdated: new Date().toISOString(),
        };
      }

      // Group buckets into Flash and Pro tiers
      // Flash: any model with "flash" in the name
      // Pro: any model with "pro" in the name
      let flashLowestRemaining = 1.0;
      let flashResetTime: string | undefined;
      let hasFlashModels = false;
      let proLowestRemaining = 1.0;
      let proResetTime: string | undefined;
      let hasProModels = false;
      let overallLowestRemaining = 1.0;
      let constrainedModel: string | undefined;
      let overallResetTime: string | undefined;

      const quotaBuckets: GeminiQuotaBucket[] = apiBuckets.map((bucket) => {
        const remaining = bucket.remainingFraction ?? 1.0;
        const modelId = bucket.modelId?.toLowerCase() || '';

        // Track overall lowest
        if (remaining < overallLowestRemaining) {
          overallLowestRemaining = remaining;
          constrainedModel = bucket.modelId;
          overallResetTime = bucket.resetTime;
        }

        // Group into Flash or Pro tier
        if (modelId.includes('flash')) {
          hasFlashModels = true;
          if (remaining < flashLowestRemaining) {
            flashLowestRemaining = remaining;
            flashResetTime = bucket.resetTime;
          }
          // Also track reset time even if at 100%
          if (!flashResetTime && bucket.resetTime) {
            flashResetTime = bucket.resetTime;
          }
        } else if (modelId.includes('pro')) {
          hasProModels = true;
          if (remaining < proLowestRemaining) {
            proLowestRemaining = remaining;
            proResetTime = bucket.resetTime;
          }
          // Also track reset time even if at 100%
          if (!proResetTime && bucket.resetTime) {
            proResetTime = bucket.resetTime;
          }
        }

        return {
          modelId: bucket.modelId || 'unknown',
          remainingFraction: remaining,
          resetTime: bucket.resetTime || '',
        };
      });

      const usedPercent = Math.round((1 - overallLowestRemaining) * 100);
      const remainingPercent = Math.round(overallLowestRemaining * 100);

      // Build tier quotas (only include if we found models for that tier)
      const flashQuota: GeminiTierQuota | undefined = hasFlashModels
        ? {
            usedPercent: Math.round((1 - flashLowestRemaining) * 100),
            remainingPercent: Math.round(flashLowestRemaining * 100),
            resetText: flashResetTime ? this.formatResetTime(flashResetTime) : undefined,
            resetTime: flashResetTime,
          }
        : undefined;

      const proQuota: GeminiTierQuota | undefined = hasProModels
        ? {
            usedPercent: Math.round((1 - proLowestRemaining) * 100),
            remainingPercent: Math.round(proLowestRemaining * 100),
            resetText: proResetTime ? this.formatResetTime(proResetTime) : undefined,
            resetTime: proResetTime,
          }
        : undefined;

      return {
        authenticated: true,
        authMethod: 'cli_login',
        usedPercent,
        remainingPercent,
        resetText: overallResetTime ? this.formatResetTime(overallResetTime) : undefined,
        resetTime: overallResetTime,
        constrainedModel,
        flashQuota,
        proQuota,
        quotaBuckets,
        lastUpdated: new Date().toISOString(),
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[fetchUsageData] Error:', errorMsg);

      return {
        authenticated: true,
        authMethod: 'cli_login',
        usedPercent: 0,
        remainingPercent: 100,
        lastUpdated: new Date().toISOString(),
        error: `Failed to fetch quota: ${errorMsg}`,
      };
    }
  }

  /**
   * Load OAuth credentials from file
   */
  private async loadCredentials(): Promise<OAuthCredentials | null> {
    if (this.cachedCredentials) {
      return this.cachedCredentials;
    }

    // Check multiple possible paths
    const possiblePaths = [
      this.credentialsPath,
      path.join(os.homedir(), '.gemini', 'oauth_creds.json'),
      path.join(os.homedir(), '.config', 'gemini', 'oauth_creds.json'),
    ];

    for (const credPath of possiblePaths) {
      try {
        if (fs.existsSync(credPath)) {
          const content = fs.readFileSync(credPath, 'utf8');
          const creds = JSON.parse(content);

          // Handle different credential formats
          if (creds.access_token || creds.refresh_token) {
            this.cachedCredentials = creds;
            logger.info('[loadCredentials] Loaded from:', credPath);
            return creds;
          }

          // Some formats nest credentials under 'web' or 'installed'
          if (creds.web?.client_id || creds.installed?.client_id) {
            const clientCreds = creds.web || creds.installed;
            this.cachedCredentials = {
              client_id: clientCreds.client_id,
              client_secret: clientCreds.client_secret,
            };
            return this.cachedCredentials;
          }
        }
      } catch (error) {
        logger.debug('[loadCredentials] Failed to load from', credPath, error);
      }
    }

    return null;
  }

  /**
   * Find the Gemini CLI binary path
   */
  private findGeminiBinaryPath(): string | null {
    try {
      // Try 'which' on Unix-like systems
      const whichResult = execSync('which gemini 2>/dev/null', { encoding: 'utf8' }).trim();
      if (whichResult && fs.existsSync(whichResult)) {
        return whichResult;
      }
    } catch {
      // Ignore errors from 'which'
    }

    // Check common installation paths
    const possiblePaths = [
      // npm global installs
      path.join(os.homedir(), '.npm-global', 'bin', 'gemini'),
      '/usr/local/bin/gemini',
      '/usr/bin/gemini',
      // Homebrew
      '/opt/homebrew/bin/gemini',
      '/usr/local/opt/gemini/bin/gemini',
      // nvm/fnm node installs
      path.join(os.homedir(), '.nvm', 'versions', 'node'),
      path.join(os.homedir(), '.fnm', 'node-versions'),
      // Windows
      path.join(os.homedir(), 'AppData', 'Roaming', 'npm', 'gemini.cmd'),
      path.join(os.homedir(), 'AppData', 'Roaming', 'npm', 'gemini'),
    ];

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }

    return null;
  }

  /**
   * Extract OAuth client credentials from Gemini CLI installation
   * This mimics CodexBar's approach of finding oauth2.js in the CLI
   */
  private extractOAuthClientCredentials(): OAuthClientCredentials | null {
    if (this.cachedClientCredentials) {
      return this.cachedClientCredentials;
    }

    const geminiBinary = this.findGeminiBinaryPath();
    if (!geminiBinary) {
      logger.debug('[extractOAuthClientCredentials] Gemini binary not found');
      return null;
    }

    // Resolve symlinks to find actual location
    let resolvedPath = geminiBinary;
    try {
      resolvedPath = fs.realpathSync(geminiBinary);
    } catch {
      // Use original path if realpath fails
    }

    const baseDir = path.dirname(resolvedPath);
    logger.debug('[extractOAuthClientCredentials] Base dir:', baseDir);

    // Possible locations for oauth2.js relative to the binary
    // Based on CodexBar's search patterns
    const possibleOAuth2Paths = [
      // npm global install structure
      path.join(
        baseDir,
        '..',
        'lib',
        'node_modules',
        '@google',
        'gemini-cli',
        'dist',
        'src',
        'code_assist',
        'oauth2.js'
      ),
      path.join(
        baseDir,
        '..',
        'lib',
        'node_modules',
        '@google',
        'gemini-cli-core',
        'dist',
        'src',
        'code_assist',
        'oauth2.js'
      ),
      // Homebrew/libexec structure
      path.join(
        baseDir,
        '..',
        'libexec',
        'lib',
        'node_modules',
        '@google',
        'gemini-cli',
        'dist',
        'src',
        'code_assist',
        'oauth2.js'
      ),
      path.join(
        baseDir,
        '..',
        'libexec',
        'lib',
        'node_modules',
        '@google',
        'gemini-cli-core',
        'dist',
        'src',
        'code_assist',
        'oauth2.js'
      ),
      // Direct sibling
      path.join(baseDir, '..', 'gemini-cli-core', 'dist', 'src', 'code_assist', 'oauth2.js'),
      path.join(baseDir, '..', 'gemini-cli', 'dist', 'src', 'code_assist', 'oauth2.js'),
      // Alternative node_modules structures
      path.join(
        baseDir,
        '..',
        '..',
        'lib',
        'node_modules',
        '@google',
        'gemini-cli',
        'dist',
        'src',
        'code_assist',
        'oauth2.js'
      ),
      path.join(
        baseDir,
        '..',
        '..',
        'lib',
        'node_modules',
        '@google',
        'gemini-cli-core',
        'dist',
        'src',
        'code_assist',
        'oauth2.js'
      ),
    ];

    for (const oauth2Path of possibleOAuth2Paths) {
      try {
        const normalizedPath = path.normalize(oauth2Path);
        if (fs.existsSync(normalizedPath)) {
          logger.debug('[extractOAuthClientCredentials] Found oauth2.js at:', normalizedPath);
          const content = fs.readFileSync(normalizedPath, 'utf8');
          const creds = this.parseOAuthCredentialsFromSource(content);
          if (creds) {
            this.cachedClientCredentials = creds;
            logger.info('[extractOAuthClientCredentials] Extracted credentials from CLI');
            return creds;
          }
        }
      } catch (error) {
        logger.debug('[extractOAuthClientCredentials] Failed to read', oauth2Path, error);
      }
    }

    // Try finding oauth2.js by searching in node_modules
    try {
      const searchResult = execSync(
        `find ${baseDir}/.. -name "oauth2.js" -path "*gemini*" -path "*code_assist*" 2>/dev/null | head -1`,
        { encoding: 'utf8', timeout: 5000 }
      ).trim();

      if (searchResult && fs.existsSync(searchResult)) {
        logger.debug('[extractOAuthClientCredentials] Found via search:', searchResult);
        const content = fs.readFileSync(searchResult, 'utf8');
        const creds = this.parseOAuthCredentialsFromSource(content);
        if (creds) {
          this.cachedClientCredentials = creds;
          logger.info(
            '[extractOAuthClientCredentials] Extracted credentials from CLI (via search)'
          );
          return creds;
        }
      }
    } catch {
      // Ignore search errors
    }

    logger.warn('[extractOAuthClientCredentials] Could not extract credentials from CLI');
    return null;
  }

  /**
   * Parse OAuth client credentials from oauth2.js source code
   */
  private parseOAuthCredentialsFromSource(content: string): OAuthClientCredentials | null {
    // Patterns based on CodexBar's regex extraction
    // Look for: OAUTH_CLIENT_ID = "..." or const clientId = "..."
    const clientIdPatterns = [
      /OAUTH_CLIENT_ID\s*=\s*["']([^"']+)["']/,
      /clientId\s*[:=]\s*["']([^"']+)["']/,
      /client_id\s*[:=]\s*["']([^"']+)["']/,
      /"clientId"\s*:\s*["']([^"']+)["']/,
    ];

    const clientSecretPatterns = [
      /OAUTH_CLIENT_SECRET\s*=\s*["']([^"']+)["']/,
      /clientSecret\s*[:=]\s*["']([^"']+)["']/,
      /client_secret\s*[:=]\s*["']([^"']+)["']/,
      /"clientSecret"\s*:\s*["']([^"']+)["']/,
    ];

    let clientId: string | null = null;
    let clientSecret: string | null = null;

    for (const pattern of clientIdPatterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        clientId = match[1];
        break;
      }
    }

    for (const pattern of clientSecretPatterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        clientSecret = match[1];
        break;
      }
    }

    if (clientId && clientSecret) {
      logger.debug('[parseOAuthCredentialsFromSource] Found client credentials');
      return { clientId, clientSecret };
    }

    return null;
  }

  /**
   * Get a valid access token, refreshing if necessary
   */
  private async getValidAccessToken(creds: OAuthCredentials): Promise<string | null> {
    // Check if current token is still valid (with 5 min buffer)
    if (creds.access_token && creds.expiry_date) {
      const now = Date.now();
      if (creds.expiry_date > now + 5 * 60 * 1000) {
        logger.debug('[getValidAccessToken] Using existing token (not expired)');
        return creds.access_token;
      }
    }

    // If we have a refresh token, try to refresh
    if (creds.refresh_token) {
      // Try to extract credentials from CLI first
      const extractedCreds = this.extractOAuthClientCredentials();

      // Use extracted credentials, then fall back to credentials in file
      const clientId = extractedCreds?.clientId || creds.client_id;
      const clientSecret = extractedCreds?.clientSecret || creds.client_secret;

      if (!clientId || !clientSecret) {
        logger.error('[getValidAccessToken] No client credentials available for token refresh');
        // Return existing token even if expired - it might still work
        return creds.access_token || null;
      }

      try {
        logger.debug('[getValidAccessToken] Refreshing token...');
        const response = await fetch(GOOGLE_TOKEN_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: creds.refresh_token,
            grant_type: 'refresh_token',
          }),
        });

        if (response.ok) {
          const data = (await response.json()) as { access_token?: string; expires_in?: number };
          const newAccessToken = data.access_token;
          const expiresIn = data.expires_in || 3600;

          if (newAccessToken) {
            logger.info('[getValidAccessToken] Token refreshed successfully');

            // Update cached credentials
            this.cachedCredentials = {
              ...creds,
              access_token: newAccessToken,
              expiry_date: Date.now() + expiresIn * 1000,
            };

            // Save back to file
            try {
              fs.writeFileSync(
                this.credentialsPath,
                JSON.stringify(this.cachedCredentials, null, 2)
              );
            } catch (e) {
              logger.debug('[getValidAccessToken] Could not save refreshed token:', e);
            }

            return newAccessToken;
          }
        } else {
          const errorText = await response.text().catch(() => '');
          logger.error('[getValidAccessToken] Token refresh failed:', response.status, errorText);
        }
      } catch (error) {
        logger.error('[getValidAccessToken] Token refresh error:', error);
      }
    }

    // Return current access token even if it might be expired
    return creds.access_token || null;
  }

  /**
   * Format reset time as human-readable string
   */
  private formatResetTime(isoTime: string): string {
    try {
      const resetDate = new Date(isoTime);
      const now = new Date();
      const diff = resetDate.getTime() - now.getTime();

      if (diff < 0) {
        return 'Resetting soon';
      }

      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(minutes / 60);

      if (hours > 0) {
        const remainingMins = minutes % 60;
        return remainingMins > 0 ? `Resets in ${hours}h ${remainingMins}m` : `Resets in ${hours}h`;
      }

      return `Resets in ${minutes}m`;
    } catch {
      return '';
    }
  }

  /**
   * Clear cached credentials (useful after logout)
   */
  clearCache(): void {
    this.cachedCredentials = null;
    this.cachedClientCredentials = null;
  }
}

// Singleton instance
let usageServiceInstance: GeminiUsageService | null = null;

/**
 * Get the singleton instance of GeminiUsageService
 */
export function getGeminiUsageService(): GeminiUsageService {
  if (!usageServiceInstance) {
    usageServiceInstance = new GeminiUsageService();
  }
  return usageServiceInstance;
}
